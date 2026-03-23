import { ExchangeClient, HttpTransport, InfoClient } from "@nktkas/hyperliquid";

import type { HyperliquidConfig } from "../../config";
import type { AppWallet } from "../../domain/users/types";
import type { TurnkeySignerClientFactory } from "../turnkey/interfaces";
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

export class HyperliquidService implements HyperliquidUserFacingService {
  private readonly transport: HttpTransport;
  private readonly infoClient: InfoClient;
  private universeCache: Map<string, AssetMeta> | null = null;

  constructor(
    config: HyperliquidConfig,
    private readonly signerFactory: TurnkeySignerClientFactory,
  ) {
    this.transport = new HttpTransport({
      apiUrl: config.apiUrl,
    });
    this.infoClient = new InfoClient({
      transport: this.transport,
    });
  }

  async getMarketSnapshot(coins?: string[]) {
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
      timestamp: new Date().toISOString(),
      assets,
    };
  }

  async getUserSummary(address: `0x${string}`) {
    const summary = await this.infoClient.clearinghouseState({ user: address });
    return {
      address,
      summary,
    };
  }

  async getOpenOrders(address: `0x${string}`) {
    const orders = await this.infoClient.frontendOpenOrders({ user: address });
    return {
      address,
      orders,
    };
  }

  async getRecentFills(address: `0x${string}`, limit = 10) {
    const fills = await this.infoClient.userFills({ user: address });
    return {
      address,
      fills: fills.slice(0, Math.max(1, Math.min(limit, 50))),
    };
  }

  async placeOrder(wallet: AppWallet, input: HyperliquidOrderInput) {
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
