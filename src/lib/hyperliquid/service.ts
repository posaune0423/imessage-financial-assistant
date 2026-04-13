import { ExchangeClient, HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import { createPublicClient, decodeAbiParameters, encodeAbiParameters, formatUnits, http } from "viem";

import type { HyperliquidConfig } from "../../config";
import type { AppWallet } from "../../domain/users/types";
import type { TurnkeySignerClientFactory } from "../turnkey/interfaces";
import { logger } from "../../utils/logger";
import type {
  HyperliquidCancelInput,
  HyperliquidLeverageInput,
  HyperliquidModifyInput,
  HyperliquidOrderInput,
  HyperliquidUserFacingService,
} from "./interfaces";

interface AssetMeta {
  index: number;
  name: string;
  szDecimals: number;
  maxLeverage: number;
}

const HYPEREVM_RPC_URLS = {
  mainnet: "https://rpc.hyperliquid.xyz/evm",
  testnet: "https://rpc.hyperliquid-testnet.xyz/evm",
} as const satisfies Record<HyperliquidConfig["network"], string>;

const SPOT_BALANCE_PRECOMPILE_ADDRESS = "0x0000000000000000000000000000000000000801";
const HYPERLIQUID_USDC_TOKEN_INDEX = 0n;
const HYPERLIQUID_USDC_DECIMALS = 8;
const HYPERLIQUID_USDC_SYMBOL = "USDC";

export class HyperliquidService implements HyperliquidUserFacingService {
  private readonly transport: HttpTransport;
  private readonly infoClient: InfoClient;
  private readonly publicClient;
  private universeCache: Map<string, AssetMeta> | null = null;
  private readonly network: HyperliquidConfig["network"];

  constructor(
    config: HyperliquidConfig,
    private readonly signerFactory: TurnkeySignerClientFactory,
  ) {
    this.network = config.network;
    this.transport = new HttpTransport({
      isTestnet: config.isTestnet,
      apiUrl: config.apiUrl,
    });
    this.publicClient = createPublicClient({
      transport: http(HYPEREVM_RPC_URLS[config.network]),
    });
    this.infoClient = new InfoClient({
      transport: this.transport,
    });
    logger.debug(
      `[hyperliquid] initialized network=${config.network} apiUrl=${config.apiUrl} rpcUrl=${HYPEREVM_RPC_URLS[config.network]}`,
    );
  }

  async getMarketSnapshot(coins?: string[]) {
    logger.debug(`[hyperliquid] getMarketSnapshot network=${this.network} coins=${JSON.stringify(coins ?? [])}`);
    const [mids, universe] = await Promise.all([this.infoClient.allMids(), this.getUniverse()]);
    const selected = coins?.length ? coins.map((coin) => coin.toUpperCase()) : null;
    const assets = [...universe.values()]
      .filter((asset) => !selected || selected.includes(asset.name))
      .map((asset) => ({
        coin: asset.name,
        asset: asset.index,
        mid: mids[asset.name] ?? null,
        szDecimals: asset.szDecimals,
        maxLeverage: asset.maxLeverage,
      }));

    return {
      network: this.network,
      timestamp: new Date().toISOString(),
      assets,
    };
  }

  async getSpotBalance(address: `0x${string}`) {
    logger.debug(
      `[hyperliquid] getSpotBalance network=${this.network} address=${address} token=${HYPERLIQUID_USDC_SYMBOL}`,
    );
    const result = await this.publicClient.call({
      to: SPOT_BALANCE_PRECOMPILE_ADDRESS,
      data: encodeAbiParameters([{ type: "address" }, { type: "uint64" }], [address, HYPERLIQUID_USDC_TOKEN_INDEX]),
    });
    const [total, hold, entryNtl] = decodeAbiParameters(
      [{ type: "uint64" }, { type: "uint64" }, { type: "uint64" }],
      result.data ?? "0x",
    );
    const available = total - hold;

    return {
      network: this.network,
      address,
      token: {
        index: Number(HYPERLIQUID_USDC_TOKEN_INDEX),
        symbol: HYPERLIQUID_USDC_SYMBOL,
        decimals: HYPERLIQUID_USDC_DECIMALS,
      },
      balance: {
        raw: total.toString(),
        formatted: formatUnits(total, HYPERLIQUID_USDC_DECIMALS),
        heldRaw: hold.toString(),
        heldFormatted: formatUnits(hold, HYPERLIQUID_USDC_DECIMALS),
        availableRaw: available.toString(),
        availableFormatted: formatUnits(available, HYPERLIQUID_USDC_DECIMALS),
        entryNtlRaw: entryNtl.toString(),
        entryNtlFormatted: formatUnits(entryNtl, HYPERLIQUID_USDC_DECIMALS),
      },
    };
  }

  async getUserSummary(address: `0x${string}`) {
    logger.debug(`[hyperliquid] getUserSummary network=${this.network} address=${address}`);
    const summary = await this.infoClient.clearinghouseState({ user: address });
    return {
      network: this.network,
      address,
      summary,
    };
  }

  async getOpenOrders(address: `0x${string}`) {
    logger.debug(`[hyperliquid] getOpenOrders network=${this.network} address=${address}`);
    const orders = await this.infoClient.frontendOpenOrders({ user: address });
    return {
      network: this.network,
      address,
      orders,
    };
  }

  async getRecentFills(address: `0x${string}`, limit = 10) {
    logger.debug(`[hyperliquid] getRecentFills network=${this.network} address=${address} limit=${limit}`);
    const fills = await this.infoClient.userFills({ user: address });
    return {
      network: this.network,
      address,
      fills: fills.slice(0, Math.max(1, Math.min(limit, 50))),
    };
  }

  async placeOrder(wallet: AppWallet, input: HyperliquidOrderInput) {
    logger.debug(
      `[hyperliquid] placeOrder network=${this.network} wallet=${wallet.address ?? "unknown"} market=${input.market}`,
    );
    const client = await this.createExchangeClient(wallet);
    const asset = await this.resolveAsset(input.market);
    const price = input.price ?? (await this.resolveMidPrice(asset.name));

    return client.order({
      orders: [
        {
          a: asset.index,
          b: input.side === "buy",
          p: price,
          s: input.size,
          r: input.reduceOnly ?? false,
          t: {
            limit: {
              tif: input.tif ?? (input.price ? "Gtc" : "FrontendMarket"),
            },
          },
        },
      ],
      grouping: "na",
    });
  }

  async cancelOrder(wallet: AppWallet, input: HyperliquidCancelInput) {
    logger.debug(
      `[hyperliquid] cancelOrder network=${this.network} wallet=${wallet.address ?? "unknown"} market=${input.market} orderId=${input.orderId}`,
    );
    const client = await this.createExchangeClient(wallet);
    const asset = await this.resolveAsset(input.market);

    return client.cancel({
      cancels: [
        {
          a: asset.index,
          o: input.orderId,
        },
      ],
    });
  }

  async modifyOrder(wallet: AppWallet, input: HyperliquidModifyInput) {
    logger.debug(
      `[hyperliquid] modifyOrder network=${this.network} wallet=${wallet.address ?? "unknown"} market=${input.market} orderId=${input.orderId}`,
    );
    const client = await this.createExchangeClient(wallet);
    const asset = await this.resolveAsset(input.market);

    return client.modify({
      oid: input.orderId,
      order: {
        a: asset.index,
        b: input.side === "buy",
        p: input.price,
        s: input.size,
        r: input.reduceOnly ?? false,
        t: {
          limit: {
            tif: input.tif ?? "Gtc",
          },
        },
      },
    });
  }

  async updateLeverage(wallet: AppWallet, input: HyperliquidLeverageInput) {
    logger.debug(
      `[hyperliquid] updateLeverage network=${this.network} wallet=${wallet.address ?? "unknown"} market=${input.market} leverage=${input.leverage}`,
    );
    const client = await this.createExchangeClient(wallet);
    const asset = await this.resolveAsset(input.market);

    return client.updateLeverage({
      asset: asset.index,
      leverage: input.leverage,
      isCross: input.mode === "cross",
    });
  }

  private async createExchangeClient(wallet: AppWallet) {
    const signer = await this.signerFactory.createSignerClient(wallet);
    return new ExchangeClient({
      transport: this.transport,
      wallet: signer,
    });
  }

  private async resolveAsset(market: string): Promise<AssetMeta> {
    const universe = await this.getUniverse();
    const asset = universe.get(market.toUpperCase());
    if (!asset) {
      throw new Error(`Unknown Hyperliquid market: ${market}`);
    }

    return asset;
  }

  private async resolveMidPrice(market: string) {
    const mids = await this.infoClient.allMids();
    const mid = mids[market];
    if (!mid) {
      throw new Error(`No current mid price for ${market}`);
    }

    return mid;
  }

  private async getUniverse() {
    if (this.universeCache) {
      return this.universeCache;
    }

    const meta = await this.infoClient.meta();
    const universe = new Map<string, AssetMeta>();

    meta.universe.forEach((entry, index) => {
      universe.set(entry.name.toUpperCase(), {
        index,
        name: entry.name.toUpperCase(),
        szDecimals: entry.szDecimals,
        maxLeverage: entry.maxLeverage,
      });
    });

    this.universeCache = universe;
    return universe;
  }
}
