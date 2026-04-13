import { ExchangeClient, HttpTransport, InfoClient, WebSocketTransport } from "@nktkas/hyperliquid";
import { explorerTxs } from "@nktkas/hyperliquid/api/subscription";
import { createPublicClient, decodeAbiParameters, encodeAbiParameters, formatUnits, http, parseUnits } from "viem";

import type { HyperliquidConfig } from "../../config";
import type { AppWallet } from "../../domain/users/types";
import { logger } from "../../utils/logger";
import type { TurnkeySignerClientFactory } from "../turnkey/interfaces";
import type {
  HyperliquidCancelInput,
  HyperliquidCandlesInput,
  HyperliquidExchangeAction,
  HyperliquidInfoMethod,
  HyperliquidLeverageInput,
  HyperliquidMarketSearchInput,
  HyperliquidModifyInput,
  HyperliquidOrderBookInput,
  HyperliquidOrderInput,
  HyperliquidOrderStatusInput,
  HyperliquidSendAssetInput,
  HyperliquidSpotTransferInput,
  HyperliquidUsdTransferInput,
  HyperliquidUserFacingService,
  HyperliquidWithdrawInput,
} from "./interfaces";

interface AssetMeta {
  index: number;
  name: string;
  szDecimals: number;
  maxLeverage: number;
}

interface SpotTokenMeta {
  index: number;
  symbol: string;
  decimals: number;
  tokenId: `0x${string}`;
  identifier: string;
  universeName: string | null;
  universeIndex: number | null;
}

interface HyperliquidExchangeOrder {
  a: number;
  b: boolean;
  p: string;
  s: string;
  r: boolean;
  t:
    | {
        limit: {
          tif: "Gtc" | "Ioc" | "Alo" | "FrontendMarket";
        };
      }
    | {
        trigger: {
          isMarket: boolean;
          triggerPx: string;
          tpsl: "tp" | "sl";
        };
      };
  c?: `0x${string}`;
}

const HYPEREVM_RPC_URLS = {
  mainnet: "https://rpc.hyperliquid.xyz/evm",
  testnet: "https://rpc.hyperliquid-testnet.xyz/evm",
} as const satisfies Record<HyperliquidConfig["network"], string>;

const HYPERLIQUID_RPC_WS_URLS = {
  mainnet: "wss://rpc.hyperliquid.xyz/ws",
  testnet: "wss://rpc.hyperliquid-testnet.xyz/ws",
} as const satisfies Record<HyperliquidConfig["network"], string>;

const HYPERLIQUID_EXPLORER_BASE_URLS = {
  mainnet: "https://app.hyperliquid.xyz",
  testnet: "https://app.hyperliquid-testnet.xyz",
} as const satisfies Record<HyperliquidConfig["network"], string>;

const SPOT_BALANCE_PRECOMPILE_ADDRESS = "0x0000000000000000000000000000000000000801";
const DEFAULT_SPOT_TOKEN_SYMBOL = "USDC";
const HYPERLIQUID_USDC_DECIMALS = 8;
const INSUFFICIENT_WITHDRAWAL_MESSAGE = "Insufficient balance for withdrawal.";
const EXPLORER_TX_WAIT_TIMEOUT_MS = 8_000;
const EXPLORER_TX_TIME_SKEW_MS = 15_000;

interface ExplorerTxEvent {
  action: {
    type: string;
    [key: string]: unknown;
  };
  error: string | null;
  hash: `0x${string}`;
  time: number;
  user: `0x${string}`;
}

interface HyperliquidSubmittedActionResult {
  network: HyperliquidConfig["network"];
  action: HyperliquidExchangeAction;
  result: unknown;
  txHash?: `0x${string}`;
  explorerUrl?: string;
}

function createCompactLogValue(value: unknown) {
  const serialized = JSON.stringify(value);
  if (!serialized) {
    return String(value);
  }

  return serialized.length > 240 ? `${serialized.slice(0, 240)}...` : serialized;
}

function isSubsetMatch(expected: unknown, actual: unknown): boolean {
  if (Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      expected.length <= actual.length &&
      expected.every((item, index) => isSubsetMatch(item, actual[index]))
    );
  }

  if (typeof expected === "object" && expected !== null) {
    if (typeof actual !== "object" || actual === null || Array.isArray(actual)) {
      return false;
    }

    return Object.entries(expected).every(([key, value]) => {
      const actualValue: unknown = Reflect.get(actual, key);
      return isSubsetMatch(value, actualValue);
    });
  }

  if (
    typeof expected === "string" &&
    typeof actual === "string" &&
    expected.startsWith("0x") &&
    actual.startsWith("0x")
  ) {
    return expected.toLowerCase() === actual.toLowerCase();
  }

  return expected === actual;
}

function stripUndefinedDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item));
  }

  if (typeof value === "object" && value !== null) {
    const entries: Array<[string, unknown]> = Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([key, entryValue]) => [key, stripUndefinedDeep(entryValue)]);
    return Object.fromEntries(entries);
  }

  return value;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

function buildExplorerTxUrl(network: HyperliquidConfig["network"], txHash: `0x${string}`) {
  return `${HYPERLIQUID_EXPLORER_BASE_URLS[network]}/explorer/tx/${txHash}`;
}

export class HyperliquidService implements HyperliquidUserFacingService {
  private readonly transport: HttpTransport;
  private readonly infoClient: InfoClient;
  private readonly publicClient;
  private universeCache: Map<string, AssetMeta> | null = null;
  private spotTokenCache: Map<string, SpotTokenMeta> | null = null;
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

  async searchMarkets(input: HyperliquidMarketSearchInput = {}) {
    const query = input.query?.trim().toUpperCase();
    const kind = input.kind ?? "all";
    const limit = Math.max(1, Math.min(input.limit ?? 20, 100));

    const results: Array<Record<string, unknown>> = [];

    if (kind === "all" || kind === "perp") {
      const [meta, assetCtxs] = await this.infoClient.metaAndAssetCtxs(input.dex ? { dex: input.dex } : undefined);
      meta.universe.forEach((asset, index) => {
        const context = assetCtxs[index];
        const haystack = [asset.name, context?.markPx, context?.midPx].filter(Boolean).join(" ").toUpperCase();
        if (query && !haystack.includes(query)) {
          return;
        }

        results.push({
          kind: "perp",
          symbol: asset.name,
          asset: index,
          szDecimals: asset.szDecimals,
          maxLeverage: asset.maxLeverage,
          onlyIsolated: asset.onlyIsolated ?? false,
          markPx: context?.markPx ?? null,
          midPx: context?.midPx ?? null,
          oraclePx: context?.oraclePx ?? null,
          funding: context?.funding ?? null,
          openInterest: context?.openInterest ?? null,
          dayNtlVlm: context?.dayNtlVlm ?? null,
        });
      });
    }

    if (kind === "all" || kind === "spot") {
      const [meta, assetCtxs] = await this.infoClient.spotMetaAndAssetCtxs();
      meta.universe.forEach((market, index) => {
        const baseToken = meta.tokens.find((token) => token.index === market.tokens[0]);
        const quoteToken = meta.tokens.find((token) => token.index === market.tokens[1]);
        const context = assetCtxs[index];
        const haystack = [
          market.name,
          baseToken?.name,
          baseToken?.fullName,
          quoteToken?.name,
          quoteToken?.fullName,
          context?.coin,
        ]
          .filter(Boolean)
          .join(" ")
          .toUpperCase();
        if (query && !haystack.includes(query)) {
          return;
        }

        results.push({
          kind: "spot",
          symbol: market.name,
          asset: market.index,
          tokenIds: market.tokens,
          baseToken: baseToken?.name ?? null,
          quoteToken: quoteToken?.name ?? null,
          markPx: context?.markPx ?? null,
          midPx: context?.midPx ?? null,
          prevDayPx: context?.prevDayPx ?? null,
          dayNtlVlm: context?.dayNtlVlm ?? null,
          circulatingSupply: context?.circulatingSupply ?? null,
          totalSupply: context?.totalSupply ?? null,
        });
      });
    }

    return {
      network: this.network,
      query: input.query ?? null,
      kind,
      count: results.length,
      markets: results.slice(0, limit),
    };
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

  async getOrderBook(input: HyperliquidOrderBookInput) {
    logger.debug(`[hyperliquid] getOrderBook network=${this.network} market=${input.market}`);
    const book = await this.infoClient.l2Book({
      coin: input.market.toUpperCase(),
      nSigFigs: input.nSigFigs,
      mantissa: input.mantissa,
    });

    return {
      network: this.network,
      market: input.market.toUpperCase(),
      book,
    };
  }

  async getCandles(input: HyperliquidCandlesInput) {
    logger.debug(`[hyperliquid] getCandles network=${this.network} market=${input.market} interval=${input.interval}`);
    const candles = await this.infoClient.candleSnapshot({
      coin: input.market.toUpperCase(),
      interval: input.interval,
      startTime: input.startTime,
      endTime: input.endTime,
    });

    return {
      network: this.network,
      market: input.market.toUpperCase(),
      interval: input.interval,
      candles,
    };
  }

  async getOrderStatus(input: HyperliquidOrderStatusInput) {
    logger.debug(
      `[hyperliquid] getOrderStatus network=${this.network} address=${input.user} order=${String(input.orderId)}`,
    );
    const status = await this.infoClient.orderStatus({
      user: input.user,
      oid: input.orderId,
    });

    return {
      network: this.network,
      address: input.user,
      status,
    };
  }

  async getHistoricalOrders(address: `0x${string}`) {
    logger.debug(`[hyperliquid] getHistoricalOrders network=${this.network} address=${address}`);
    const orders = await this.infoClient.historicalOrders({ user: address });
    return {
      network: this.network,
      address,
      orders,
    };
  }

  async getSpotBalance(address: `0x${string}`, token = DEFAULT_SPOT_TOKEN_SYMBOL) {
    const spotToken = await this.resolveSpotToken(token);
    logger.debug(`[hyperliquid] getSpotBalance network=${this.network} address=${address} token=${spotToken.symbol}`);
    const result = await this.publicClient.call({
      to: SPOT_BALANCE_PRECOMPILE_ADDRESS,
      data: encodeAbiParameters([{ type: "address" }, { type: "uint64" }], [address, BigInt(spotToken.index)]),
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
        index: spotToken.index,
        symbol: spotToken.symbol,
        decimals: spotToken.decimals,
        tokenId: spotToken.tokenId,
        universe: spotToken.universeName,
      },
      balance: {
        raw: total.toString(),
        formatted: formatUnits(total, spotToken.decimals),
        heldRaw: hold.toString(),
        heldFormatted: formatUnits(hold, spotToken.decimals),
        availableRaw: available.toString(),
        availableFormatted: formatUnits(available, spotToken.decimals),
        entryNtlRaw: entryNtl.toString(),
        entryNtlFormatted: formatUnits(entryNtl, spotToken.decimals),
      },
    };
  }

  async getUserSummary(address: `0x${string}`) {
    logger.debug(`[hyperliquid] getUserSummary network=${this.network} address=${address}`);
    const [perp, spot, portfolio] = await Promise.all([
      this.infoClient.clearinghouseState({ user: address }),
      this.infoClient.spotClearinghouseState({ user: address }),
      this.infoClient.portfolio({ user: address }),
    ]);

    return {
      network: this.network,
      address,
      summary: {
        perp,
        spot,
        portfolio,
      },
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

  async queryInfo(method: HyperliquidInfoMethod, params?: Record<string, unknown>) {
    logger.debug(
      `[hyperliquid] queryInfo network=${this.network} method=${method} params=${createCompactLogValue(params ?? {})}`,
    );
    const fn = Reflect.get(this.infoClient, method);
    if (typeof fn !== "function") {
      throw new TypeError(`Unsupported Hyperliquid info method: ${method}`);
    }

    const result: unknown = await Reflect.apply(fn, this.infoClient, params === undefined ? [] : [params]);
    return {
      network: this.network,
      method,
      result,
    };
  }

  async executeAction(wallet: AppWallet, action: HyperliquidExchangeAction, params: Record<string, unknown> = {}) {
    logger.debug(
      `[hyperliquid] executeAction network=${this.network} wallet=${wallet.address ?? "unknown"} action=${action} params=${createCompactLogValue(params)}`,
    );
    const client = await this.createExchangeClient(wallet);
    const fn = Reflect.get(client, action);
    if (typeof fn !== "function") {
      throw new TypeError(`Unsupported Hyperliquid exchange action: ${action}`);
    }

    return this.executeTrackedWrite(wallet, action, params, async () => {
      const result: unknown = await Reflect.apply(fn, client, [params]);
      return result;
    });
  }

  async placeOrder(wallet: AppWallet, input: HyperliquidOrderInput) {
    logger.debug(
      `[hyperliquid] placeOrder network=${this.network} wallet=${wallet.address ?? "unknown"} market=${input.market}`,
    );
    const client = await this.createExchangeClient(wallet);
    const asset = await this.resolveAsset(input.market);

    const params = {
      orders: [await this.buildExchangeOrder(asset.index, input)],
      grouping: input.grouping ?? (input.trigger ? "normalTpsl" : "na"),
    };

    return this.executeTrackedWrite(wallet, "order", params, async () => client.order(params));
  }

  async cancelOrder(wallet: AppWallet, input: HyperliquidCancelInput) {
    logger.debug(
      `[hyperliquid] cancelOrder network=${this.network} wallet=${wallet.address ?? "unknown"} market=${input.market} orderId=${String(input.orderId ?? input.clientOrderId ?? "")}`,
    );
    const client = await this.createExchangeClient(wallet);
    const asset = await this.resolveAsset(input.market);

    if (input.clientOrderId) {
      const params = {
        cancels: [
          {
            asset: asset.index,
            cloid: input.clientOrderId,
          },
        ],
      };
      return this.executeTrackedWrite(wallet, "cancelByCloid", params, async () => client.cancelByCloid(params));
    }

    if (!input.orderId) {
      throw new Error("orderId or clientOrderId is required");
    }

    const params = {
      cancels: [
        {
          a: asset.index,
          o: input.orderId,
        },
      ],
    };
    return this.executeTrackedWrite(wallet, "cancel", params, async () => client.cancel(params));
  }

  async modifyOrder(wallet: AppWallet, input: HyperliquidModifyInput) {
    logger.debug(
      `[hyperliquid] modifyOrder network=${this.network} wallet=${wallet.address ?? "unknown"} market=${input.market} orderId=${String(input.orderId)}`,
    );
    const client = await this.createExchangeClient(wallet);
    const asset = await this.resolveAsset(input.market);

    const params = {
      oid: input.orderId,
      order: await this.buildExchangeOrder(asset.index, input),
    };

    return this.executeTrackedWrite(wallet, "modify", params, async () => client.modify(params));
  }

  async updateLeverage(wallet: AppWallet, input: HyperliquidLeverageInput) {
    logger.debug(
      `[hyperliquid] updateLeverage network=${this.network} wallet=${wallet.address ?? "unknown"} market=${input.market} leverage=${input.leverage}`,
    );
    const client = await this.createExchangeClient(wallet);
    const asset = await this.resolveAsset(input.market);

    const params = {
      asset: asset.index,
      leverage: input.leverage,
      isCross: input.mode === "cross",
    };

    return this.executeTrackedWrite(wallet, "updateLeverage", params, async () => client.updateLeverage(params));
  }

  async transferUsd(wallet: AppWallet, input: HyperliquidUsdTransferInput) {
    try {
      return await this.executeAction(wallet, "usdSend", { ...input });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes(INSUFFICIENT_WITHDRAWAL_MESSAGE) || !wallet.address) {
        throw error;
      }

      const spotBalance = await this.getSpotBalance(wallet.address, DEFAULT_SPOT_TOKEN_SYMBOL);
      if (
        !hasSufficientDecimalBalance(spotBalance.balance.availableFormatted, input.amount, HYPERLIQUID_USDC_DECIMALS)
      ) {
        throw error;
      }

      logger.debug(
        `[hyperliquid] usdSend insufficient for wallet=${wallet.address}; falling back to spotSend availableSpotUsdc=${spotBalance.balance.availableFormatted}`,
      );
      return this.transferSpot(wallet, {
        destination: input.destination,
        token: DEFAULT_SPOT_TOKEN_SYMBOL,
        amount: input.amount,
      });
    }
  }

  async transferSpot(wallet: AppWallet, input: HyperliquidSpotTransferInput) {
    const token = await this.resolveSpotToken(input.token);
    return this.executeAction(wallet, "spotSend", {
      destination: input.destination,
      token: token.identifier,
      amount: input.amount,
    });
  }

  async sendAsset(wallet: AppWallet, input: HyperliquidSendAssetInput) {
    const token = await this.resolveSpotToken(input.token);
    return this.executeAction(wallet, "sendAsset", {
      destination: input.destination,
      sourceDex: input.sourceDex,
      destinationDex: input.destinationDex,
      token: token.identifier,
      amount: input.amount,
      fromSubAccount: input.fromSubAccount,
    });
  }

  async withdraw(wallet: AppWallet, input: HyperliquidWithdrawInput) {
    return this.executeAction(wallet, "withdraw3", { ...input });
  }

  private async executeTrackedWrite<T>(
    wallet: AppWallet,
    action: HyperliquidExchangeAction,
    params: Record<string, unknown>,
    submit: () => Promise<T>,
  ): Promise<HyperliquidSubmittedActionResult> {
    const tracker = await this.createExplorerTxTracker(wallet.address, action, params);
    try {
      const result = await submit();
      const tx = tracker ? await tracker.awaitMatch() : null;
      return {
        network: this.network,
        action,
        result,
        ...(tx
          ? {
              txHash: tx.hash,
              explorerUrl: buildExplorerTxUrl(this.network, tx.hash),
            }
          : {}),
      };
    } finally {
      await tracker?.close();
    }
  }

  private async createExchangeClient(wallet: AppWallet) {
    const signer = await this.signerFactory.createSignerClient(wallet);
    return new ExchangeClient({
      transport: this.transport,
      wallet: signer,
    });
  }

  private async buildExchangeOrder(
    asset: number,
    input: Pick<
      HyperliquidOrderInput | HyperliquidModifyInput,
      "side" | "size" | "price" | "reduceOnly" | "tif" | "trigger" | "orderType" | "clientOrderId"
    >,
  ): Promise<HyperliquidExchangeOrder> {
    if (input.orderType === "trigger" || input.trigger) {
      if (!input.trigger) {
        throw new Error("Trigger orders require trigger settings");
      }

      const triggerPrice = input.trigger.triggerPx;
      return {
        a: asset,
        b: input.side === "buy",
        p: input.price ?? triggerPrice,
        s: input.size,
        r: input.reduceOnly ?? false,
        t: {
          trigger: {
            isMarket: input.trigger.isMarket ?? true,
            triggerPx: triggerPrice,
            tpsl: input.trigger.tpsl,
          },
        },
        c: input.clientOrderId,
      };
    }

    const isMarket = input.orderType === "market" || !input.price;
    if (isMarket) {
      const marketPrice = input.price ?? (await this.resolveMidPriceByAsset(asset));
      return {
        a: asset,
        b: input.side === "buy",
        p: marketPrice,
        s: input.size,
        r: input.reduceOnly ?? false,
        t: {
          limit: {
            tif: "FrontendMarket" as const,
          },
        },
        c: input.clientOrderId,
      };
    }

    if (!input.price) {
      throw new Error("Limit orders require a price");
    }

    return {
      a: asset,
      b: input.side === "buy",
      p: input.price,
      s: input.size,
      r: input.reduceOnly ?? false,
      t: {
        limit: {
          tif: input.tif ?? "Gtc",
        },
      },
      c: input.clientOrderId,
    };
  }

  private async resolveAsset(market: string): Promise<AssetMeta> {
    const universe = await this.getUniverse();
    const asset = universe.get(market.toUpperCase());
    if (!asset) {
      throw new Error(`Unknown Hyperliquid market: ${market}`);
    }

    return asset;
  }

  private async resolveMidPriceByAsset(asset: number) {
    const universe = await this.getUniverse();
    const market = [...universe.values()].find((entry) => entry.index === asset)?.name;
    if (!market) {
      throw new Error(`Unknown Hyperliquid asset index: ${asset}`);
    }

    return this.resolveMidPrice(market);
  }

  private async resolveMidPrice(market: string) {
    const mids = await this.infoClient.allMids();
    const mid = mids[market];
    if (!mid) {
      throw new Error(`No current mid price for ${market}`);
    }

    return mid;
  }

  private async createExplorerTxTracker(
    address: `0x${string}` | null | undefined,
    action: HyperliquidExchangeAction,
    params: Record<string, unknown>,
  ) {
    if (!address) {
      return null;
    }

    const expectedParams = stripUndefinedDeep(params);
    const startedAt = Date.now() - EXPLORER_TX_TIME_SKEW_MS;
    const transport = new WebSocketTransport({
      isTestnet: this.network === "testnet",
      url: HYPERLIQUID_RPC_WS_URLS[this.network],
      resubscribe: false,
      timeout: EXPLORER_TX_WAIT_TIMEOUT_MS,
    });

    try {
      await transport.ready();
      const deferred = createDeferred<ExplorerTxEvent | null>();
      let settled = false;
      const resolveMatch = (value: ExplorerTxEvent | null) => {
        if (settled) {
          return;
        }
        settled = true;
        deferred.resolve(value);
      };
      const timeoutId = setTimeout(() => resolveMatch(null), EXPLORER_TX_WAIT_TIMEOUT_MS);
      const subscription = await explorerTxs({ transport }, (events) => {
        const match = events.find(
          (event) =>
            event.error === null &&
            event.time >= startedAt &&
            event.user.toLowerCase() === address.toLowerCase() &&
            event.action.type === action &&
            isSubsetMatch(expectedParams, stripUndefinedDeep(event.action)),
        );
        if (match) {
          clearTimeout(timeoutId);
          resolveMatch(match);
        }
      });

      return {
        awaitMatch: async () => deferred.promise.finally(() => clearTimeout(timeoutId)),
        close: async () => {
          clearTimeout(timeoutId);
          await subscription.unsubscribe().catch(() => undefined);
          await transport.close().catch(() => undefined);
        },
      };
    } catch (error) {
      logger.warn(
        `[hyperliquid] explorer tracking unavailable network=${this.network} action=${action} address=${address} error=${error instanceof Error ? error.message : String(error)}`,
      );
      await transport.close().catch(() => undefined);
      return null;
    }
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

  private async resolveSpotToken(token: string): Promise<SpotTokenMeta> {
    const tokens = await this.getSpotTokens();
    const upper = token.toUpperCase();
    const spotToken = tokens.get(upper) ?? [...tokens.values()].find((entry) => entry.tokenId.toUpperCase() === upper);
    if (!spotToken) {
      throw new Error(`Unknown Hyperliquid spot token: ${token}`);
    }

    return spotToken;
  }

  private async getSpotTokens() {
    if (this.spotTokenCache) {
      return this.spotTokenCache;
    }

    const meta = await this.infoClient.spotMeta();
    const universeByTokenIndex = new Map<number, { name: string; index: number }>();
    meta.universe.forEach((entry) => {
      entry.tokens.forEach((tokenIndex) => {
        if (!universeByTokenIndex.has(tokenIndex)) {
          universeByTokenIndex.set(tokenIndex, { name: entry.name, index: entry.index });
        }
      });
    });

    const tokens = new Map<string, SpotTokenMeta>();

    meta.tokens.forEach((token) => {
      const universe = universeByTokenIndex.get(token.index);
      tokens.set(token.name.toUpperCase(), {
        index: token.index,
        symbol: token.name.toUpperCase(),
        decimals: token.weiDecimals,
        tokenId: token.tokenId,
        identifier: `${token.name.toUpperCase()}:${token.tokenId}`,
        universeName: universe?.name ?? null,
        universeIndex: universe?.index ?? null,
      });
    });

    this.spotTokenCache = tokens;
    return tokens;
  }
}

function hasSufficientDecimalBalance(balance: string, amount: string, decimals: number) {
  return parseUnits(balance, decimals) >= parseUnits(amount, decimals);
}
