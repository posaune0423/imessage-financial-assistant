import type { ToolsInput } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { RequestContext } from "@mastra/core/request-context";
import { z } from "zod";

import type { UserContext } from "../../domain/users/types";
import type { WalletService } from "../../domain/wallets/service";
import type { HyperliquidService } from "../../lib/hyperliquid/service";
import { HYPERLIQUID_EXCHANGE_ACTIONS, HYPERLIQUID_INFO_METHODS } from "../../lib/hyperliquid/interfaces";
import type {
  HyperliquidCancelInput,
  HyperliquidExchangeAction,
  HyperliquidLeverageInput,
  HyperliquidModifyInput,
  HyperliquidOrderInput,
  HyperliquidOrderTriggerInput,
  HyperliquidSendAssetInput,
} from "../../lib/hyperliquid/interfaces";
import { getUserId } from "../request-context";

const triggerSchema = z.object({
  triggerPx: z.string().min(1),
  tpsl: z.enum(["tp", "sl"]),
  isMarket: z.boolean().optional(),
});

const writeResultSchema = z.object({
  status: z.literal("submitted"),
  message: z.string(),
  txHash: z.string().optional(),
  explorerUrl: z.string().url().optional(),
  result: z.unknown().optional(),
});

const genericReadResultSchema = z.object({
  network: z.enum(["mainnet", "testnet"]),
  method: z.string(),
  result: z.unknown(),
});

interface HyperliquidToolDeps {
  wallets: WalletService;
  hyperliquid: HyperliquidService;
}

interface HyperliquidToolOptions {
  includeGenericPassthrough?: boolean;
}

interface ExplorerAnnotatedResult {
  explorerUrl?: string;
  txHash?: string;
}

const MAX_GENERIC_RESULT_DEPTH = 3;
const MAX_GENERIC_RESULT_ARRAY_ITEMS = 5;
const MAX_GENERIC_RESULT_OBJECT_KEYS = 12;
const MAX_GENERIC_RESULT_STRING_LENGTH = 240;

function isHexAddress(value: string): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function isHyperliquidHexId(value: string): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{32}$/.test(value);
}

function requireHexAddress(value: string): `0x${string}` {
  if (!isHexAddress(value)) {
    throw new Error(`Invalid hex address: ${value}`);
  }

  return value;
}

function getExplorerMetadata(result: unknown): ExplorerAnnotatedResult {
  if (typeof result !== "object" || result === null) {
    return {};
  }

  const txHash: unknown = Reflect.get(result, "txHash");
  const explorerUrl: unknown = Reflect.get(result, "explorerUrl");
  return {
    txHash: typeof txHash === "string" ? txHash : undefined,
    explorerUrl: typeof explorerUrl === "string" ? explorerUrl : undefined,
  };
}

function stripExplorerMetadata(result: unknown): unknown {
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    return result;
  }

  return Object.fromEntries(Object.entries(result).filter(([key]) => key !== "txHash" && key !== "explorerUrl"));
}

function createSubmittedResult(message: string, result: unknown) {
  const metadata = getExplorerMetadata(result);
  return {
    status: "submitted" as const,
    message: metadata.explorerUrl ? `${message}\nExplorer: ${metadata.explorerUrl}` : message,
    txHash: metadata.txHash,
    explorerUrl: metadata.explorerUrl,
    result: compactGenericResult(stripExplorerMetadata(result)),
  };
}

function normalizeClientOrderId(value: string | undefined) {
  if (value === undefined) {
    return value;
  }

  if (!isHyperliquidHexId(value)) {
    throw new Error(`Invalid Hyperliquid client order id: ${value}`);
  }

  return value;
}

function normalizeTrigger(
  trigger:
    | {
        triggerPx: string;
        tpsl: "tp" | "sl";
        isMarket?: boolean;
      }
    | undefined,
): HyperliquidOrderTriggerInput | undefined {
  if (!trigger) {
    return undefined;
  }

  return {
    triggerPx: trigger.triggerPx,
    tpsl: trigger.tpsl,
    isMarket: trigger.isMarket,
  };
}

function normalizeOrderInput(input: {
  market: string;
  side: "buy" | "sell";
  size: string;
  orderType?: "limit" | "market" | "trigger";
  price?: string;
  tif?: "Gtc" | "Ioc" | "Alo" | "FrontendMarket";
  reduceOnly?: boolean;
  clientOrderId?: string;
  trigger?: {
    triggerPx: string;
    tpsl: "tp" | "sl";
    isMarket?: boolean;
  };
  grouping?: "na" | "normalTpsl" | "positionTpsl";
}): HyperliquidOrderInput {
  return {
    market: input.market,
    side: input.side,
    size: input.size,
    orderType: input.orderType,
    price: input.price,
    tif: input.tif,
    reduceOnly: input.reduceOnly,
    clientOrderId: normalizeClientOrderId(input.clientOrderId),
    trigger: normalizeTrigger(input.trigger),
    grouping: input.grouping,
  };
}

function normalizeCancelInput(input: {
  market: string;
  orderId?: number;
  clientOrderId?: string;
}): HyperliquidCancelInput {
  return {
    market: input.market,
    orderId: input.orderId,
    clientOrderId: normalizeClientOrderId(input.clientOrderId),
  };
}

function normalizeOrderId(orderId: number | string): number | `0x${string}` {
  if (typeof orderId === "number") {
    return orderId;
  }

  const normalized = normalizeClientOrderId(orderId);
  if (!normalized) {
    throw new Error("Hyperliquid order id is required");
  }

  return normalized;
}

function normalizeModifyInput(input: {
  market: string;
  orderId: number | string;
  side: "buy" | "sell";
  size: string;
  orderType?: "limit" | "market" | "trigger";
  price?: string;
  tif?: "Gtc" | "Ioc" | "Alo" | "FrontendMarket";
  reduceOnly?: boolean;
  clientOrderId?: string;
  trigger?: {
    triggerPx: string;
    tpsl: "tp" | "sl";
    isMarket?: boolean;
  };
}): HyperliquidModifyInput {
  return {
    market: input.market,
    orderId: normalizeOrderId(input.orderId),
    side: input.side,
    size: input.size,
    orderType: input.orderType,
    price: input.price,
    tif: input.tif,
    reduceOnly: input.reduceOnly,
    clientOrderId: normalizeClientOrderId(input.clientOrderId),
    trigger: normalizeTrigger(input.trigger),
  };
}

function resolveTargetAddress(value: string | null | undefined): `0x${string}` | undefined {
  return value && isHexAddress(value) ? value : undefined;
}

function compactGenericResult(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return value.length > MAX_GENERIC_RESULT_STRING_LENGTH
      ? `${value.slice(0, MAX_GENERIC_RESULT_STRING_LENGTH)}...`
      : value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (depth >= MAX_GENERIC_RESULT_DEPTH) {
    if (Array.isArray(value)) {
      return `[truncated array: ${value.length} items]`;
    }

    return "[truncated object]";
  }

  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_GENERIC_RESULT_ARRAY_ITEMS).map((entry) => compactGenericResult(entry, depth + 1));
    if (value.length <= MAX_GENERIC_RESULT_ARRAY_ITEMS) {
      return items;
    }

    return {
      items,
      omittedItems: value.length - MAX_GENERIC_RESULT_ARRAY_ITEMS,
      totalItems: value.length,
    };
  }

  if (typeof value === "object") {
    const entries = Object.entries(value);
    const compactedEntries = entries
      .slice(0, MAX_GENERIC_RESULT_OBJECT_KEYS)
      .map(([key, entryValue]) => [key, compactGenericResult(entryValue, depth + 1)] as const);

    const compactedObject = Object.fromEntries(compactedEntries);
    if (entries.length <= MAX_GENERIC_RESULT_OBJECT_KEYS) {
      return compactedObject;
    }

    return {
      ...compactedObject,
      omittedKeys: entries.length - MAX_GENERIC_RESULT_OBJECT_KEYS,
      totalKeys: entries.length,
    };
  }

  return Object.prototype.toString.call(value);
}

function buildProvisioningUserContext(
  userId: string,
  requestContext?: RequestContext,
  wallet?: UserContext["wallet"],
): UserContext {
  const sender = requestContext?.get("sender");
  if (typeof sender !== "string" || !sender.trim()) {
    throw new TypeError("Missing sender context for Turnkey signer provisioning");
  }

  const chatId = requestContext?.get("chatId");

  return {
    id: userId,
    resourceKey: `user:${userId}`,
    sender: sender.trim(),
    chatId: typeof chatId === "string" && chatId.trim() ? chatId.trim() : undefined,
    wallet: wallet ?? null,
  };
}

function getToolRequestContext(context: unknown): RequestContext | undefined {
  if (typeof context !== "object" || context === null) {
    return undefined;
  }

  const requestContext: unknown = Reflect.get(context, "requestContext");
  return requestContext instanceof RequestContext ? requestContext : undefined;
}

async function getReadyWallet(wallets: WalletService, userId: string, requestContext?: RequestContext) {
  const currentWallet = await wallets.getProfile(userId);
  const wallet = currentWallet
    ? await wallets.ensurePrimaryWallet(buildProvisioningUserContext(userId, requestContext, currentWallet))
    : currentWallet;
  if (!wallet) {
    throw new Error("Wallet is not provisioned yet");
  }

  if (wallet.status !== "ready") {
    throw new Error(`Wallet is ${wallet.status}`);
  }

  if (wallet.signerStatus !== "ready") {
    throw new Error(`Signer is ${wallet.signerStatus}`);
  }

  if (!wallet.address) {
    throw new Error("Wallet address is missing");
  }

  return wallet;
}

function createGenericActionSummary(action: HyperliquidExchangeAction, params?: Record<string, unknown>) {
  const paramsText = JSON.stringify(params ?? {});
  return `Execute Hyperliquid action ${action} with params ${paramsText}.`;
}

export function createHyperliquidTools(deps: HyperliquidToolDeps, options: HyperliquidToolOptions = {}): ToolsInput {
  const infoMethodDescription = HYPERLIQUID_INFO_METHODS.join(", ");
  const exchangeActionDescription = HYPERLIQUID_EXCHANGE_ACTIONS.join(", ");

  const tools = {
    hyperliquid_search_markets: createTool({
      id: "hyperliquid_search_markets",
      description: "Browse or search Hyperliquid perp and spot markets.",
      inputSchema: z.object({
        query: z.string().min(1).optional(),
        kind: z.enum(["all", "perp", "spot"]).optional(),
        limit: z.number().int().positive().max(100).optional(),
        dex: z.string().min(1).optional(),
      }),
      outputSchema: z.object({
        network: z.enum(["mainnet", "testnet"]),
        query: z.string().nullable(),
        kind: z.enum(["all", "perp", "spot"]),
        count: z.number(),
        markets: z.array(z.record(z.string(), z.unknown())),
      }),
      execute: async (input) => deps.hyperliquid.searchMarkets(input),
    }),
    hyperliquid_get_market_snapshot: createTool({
      id: "hyperliquid_get_market_snapshot",
      description: "Get current Hyperliquid perp market mids for one or more markets.",
      inputSchema: z.object({
        coins: z.array(z.string().min(1)).optional(),
      }),
      outputSchema: z.object({
        network: z.enum(["mainnet", "testnet"]),
        timestamp: z.string(),
        assets: z.array(
          z.object({
            coin: z.string(),
            asset: z.number(),
            mid: z.string().nullable(),
            szDecimals: z.number(),
            maxLeverage: z.number(),
          }),
        ),
      }),
      execute: async ({ coins }) => deps.hyperliquid.getMarketSnapshot(coins),
    }),
    hyperliquid_get_order_book: createTool({
      id: "hyperliquid_get_order_book",
      description: "Get a Hyperliquid L2 order book snapshot for a perp market.",
      inputSchema: z.object({
        market: z.string().min(1),
        nSigFigs: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).optional(),
        mantissa: z.union([z.literal(2), z.literal(5)]).optional(),
      }),
      outputSchema: z.object({
        network: z.enum(["mainnet", "testnet"]),
        market: z.string(),
        book: z.unknown(),
      }),
      execute: async (input) => {
        const result = await deps.hyperliquid.getOrderBook(input);
        return {
          ...result,
          book: compactGenericResult(result.book),
        };
      },
    }),
    hyperliquid_get_candles: createTool({
      id: "hyperliquid_get_candles",
      description: "Get Hyperliquid candle snapshots for a perp market.",
      inputSchema: z.object({
        market: z.string().min(1),
        interval: z.enum(["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "8h", "12h", "1d", "3d", "1w", "1M"]),
        startTime: z.number().int().nonnegative(),
        endTime: z.number().int().nonnegative().optional(),
      }),
      outputSchema: z.object({
        network: z.enum(["mainnet", "testnet"]),
        market: z.string(),
        interval: z.string(),
        candles: z.unknown(),
      }),
      execute: async (input) => {
        const result = await deps.hyperliquid.getCandles(input);
        return {
          ...result,
          candles: compactGenericResult(result.candles),
        };
      },
    }),
    hyperliquid_get_spot_balance: createTool({
      id: "hyperliquid_get_spot_balance",
      description:
        "Get the current Hyperliquid spot token balance for the current wallet or an explicit address using HyperEVM RPC.",
      inputSchema: z.object({
        address: z.string().startsWith("0x").optional(),
        token: z.string().min(1).optional(),
      }),
      outputSchema: z.object({
        network: z.enum(["mainnet", "testnet"]),
        address: z.string(),
        token: z.record(z.string(), z.unknown()),
        balance: z.record(z.string(), z.string()),
      }),
      execute: async ({ address, token }, context) => {
        const userId = getUserId(context.requestContext);
        const wallet = await deps.wallets.getProfile(userId);
        const target = resolveTargetAddress(address ?? wallet?.address);
        if (!target) {
          throw new Error("No wallet address is available for this user");
        }

        return deps.hyperliquid.getSpotBalance(target, token);
      },
    }),
    hyperliquid_get_user_summary: createTool({
      id: "hyperliquid_get_user_summary",
      description: "Get Hyperliquid user summary for the current wallet or an explicit address.",
      inputSchema: z.object({
        address: z.string().startsWith("0x").optional(),
      }),
      outputSchema: z.object({
        network: z.enum(["mainnet", "testnet"]),
        address: z.string(),
        summary: z.unknown(),
      }),
      execute: async ({ address }, context) => {
        const userId = getUserId(context.requestContext);
        const wallet = await deps.wallets.getProfile(userId);
        const target = resolveTargetAddress(address ?? wallet?.address);
        if (!target) {
          throw new Error("No wallet address is available for this user");
        }

        const result = await deps.hyperliquid.getUserSummary(target);
        return {
          ...result,
          summary: compactGenericResult(result.summary),
        };
      },
    }),
    hyperliquid_get_open_orders: createTool({
      id: "hyperliquid_get_open_orders",
      description: "Get current Hyperliquid open orders for the current wallet or an explicit address.",
      inputSchema: z.object({
        address: z.string().startsWith("0x").optional(),
      }),
      outputSchema: z.object({
        network: z.enum(["mainnet", "testnet"]),
        address: z.string(),
        orders: z.unknown(),
      }),
      execute: async ({ address }, context) => {
        const userId = getUserId(context.requestContext);
        const wallet = await deps.wallets.getProfile(userId);
        const target = resolveTargetAddress(address ?? wallet?.address);
        if (!target) {
          throw new Error("No wallet address is available for this user");
        }

        const result = await deps.hyperliquid.getOpenOrders(target);
        return {
          ...result,
          orders: compactGenericResult(result.orders),
        };
      },
    }),
    hyperliquid_get_recent_fills: createTool({
      id: "hyperliquid_get_recent_fills",
      description: "Get recent Hyperliquid fills for the current wallet or an explicit address.",
      inputSchema: z.object({
        address: z.string().startsWith("0x").optional(),
        limit: z.number().int().positive().max(50).optional(),
      }),
      outputSchema: z.object({
        network: z.enum(["mainnet", "testnet"]),
        address: z.string(),
        fills: z.unknown(),
      }),
      execute: async ({ address, limit }, context) => {
        const userId = getUserId(context.requestContext);
        const wallet = await deps.wallets.getProfile(userId);
        const target = resolveTargetAddress(address ?? wallet?.address);
        if (!target) {
          throw new Error("No wallet address is available for this user");
        }

        const result = await deps.hyperliquid.getRecentFills(target, limit);
        return {
          ...result,
          fills: compactGenericResult(result.fills),
        };
      },
    }),
    hyperliquid_get_order_status: createTool({
      id: "hyperliquid_get_order_status",
      description: "Get Hyperliquid order status by oid or cloid for the current wallet or an explicit address.",
      inputSchema: z.object({
        address: z.string().startsWith("0x").optional(),
        orderId: z.union([z.number().int().positive(), z.string().regex(/^0x[a-fA-F0-9]{32}$/)]),
      }),
      outputSchema: z.object({
        network: z.enum(["mainnet", "testnet"]),
        address: z.string(),
        status: z.unknown(),
      }),
      execute: async ({ address, orderId }, context) => {
        const userId = getUserId(context.requestContext);
        const wallet = await deps.wallets.getProfile(userId);
        const target = resolveTargetAddress(address ?? wallet?.address);
        if (!target) {
          throw new Error("No wallet address is available for this user");
        }

        const result = await deps.hyperliquid.getOrderStatus({
          user: target,
          orderId: normalizeOrderId(orderId),
        });
        return {
          ...result,
          status: compactGenericResult(result.status),
        };
      },
    }),
    hyperliquid_get_historical_orders: createTool({
      id: "hyperliquid_get_historical_orders",
      description: "Get historical Hyperliquid orders for the current wallet or an explicit address.",
      inputSchema: z.object({
        address: z.string().startsWith("0x").optional(),
      }),
      outputSchema: z.object({
        network: z.enum(["mainnet", "testnet"]),
        address: z.string(),
        orders: z.unknown(),
      }),
      execute: async ({ address }, context) => {
        const userId = getUserId(context.requestContext);
        const wallet = await deps.wallets.getProfile(userId);
        const target = resolveTargetAddress(address ?? wallet?.address);
        if (!target) {
          throw new Error("No wallet address is available for this user");
        }

        const result = await deps.hyperliquid.getHistoricalOrders(target);
        return {
          ...result,
          orders: compactGenericResult(result.orders),
        };
      },
    }),
    hyperliquid_place_order: createTool({
      id: "hyperliquid_place_order",
      description: "Place a Hyperliquid order.",
      inputSchema: z.object({
        market: z.string().min(1),
        side: z.enum(["buy", "sell"]),
        size: z.string().min(1),
        orderType: z.enum(["limit", "market", "trigger"]).optional(),
        price: z.string().min(1).optional(),
        tif: z.enum(["Gtc", "Ioc", "Alo", "FrontendMarket"]).optional(),
        reduceOnly: z.boolean().optional(),
        clientOrderId: z
          .string()
          .regex(/^0x[a-fA-F0-9]{32}$/)
          .optional(),
        trigger: triggerSchema.optional(),
        grouping: z.enum(["na", "normalTpsl", "positionTpsl"]).optional(),
      }),
      outputSchema: writeResultSchema,
      execute: async (input, context) => {
        const normalizedInput = normalizeOrderInput(input);
        const userId = getUserId(context.requestContext);
        const wallet = await getReadyWallet(deps.wallets, userId, context.requestContext);

        return createSubmittedResult(
          `Submitted ${input.market} order.`,
          await deps.hyperliquid.placeOrder(wallet, normalizedInput),
        );
      },
    }),
    hyperliquid_cancel_orders: createTool({
      id: "hyperliquid_cancel_orders",
      description: "Cancel a Hyperliquid order by oid or cloid.",
      inputSchema: z
        .object({
          market: z.string().min(1),
          orderId: z.number().int().positive().optional(),
          clientOrderId: z
            .string()
            .regex(/^0x[a-fA-F0-9]{32}$/)
            .optional(),
        })
        .refine((input) => input.orderId !== undefined || input.clientOrderId !== undefined, {
          message: "orderId or clientOrderId is required",
          path: ["orderId"],
        }),
      outputSchema: writeResultSchema,
      execute: async (input, context) => {
        const normalizedInput = normalizeCancelInput(input);
        const userId = getUserId(context.requestContext);
        const wallet = await getReadyWallet(deps.wallets, userId, context.requestContext);

        return createSubmittedResult(
          `Submitted cancel on ${input.market}.`,
          await deps.hyperliquid.cancelOrder(wallet, normalizedInput),
        );
      },
    }),
    hyperliquid_modify_order: createTool({
      id: "hyperliquid_modify_order",
      description: "Modify an existing Hyperliquid order.",
      inputSchema: z.object({
        market: z.string().min(1),
        orderId: z.union([z.number().int().positive(), z.string().regex(/^0x[a-fA-F0-9]{32}$/)]),
        side: z.enum(["buy", "sell"]),
        size: z.string().min(1),
        orderType: z.enum(["limit", "market", "trigger"]).optional(),
        price: z.string().min(1).optional(),
        tif: z.enum(["Gtc", "Ioc", "Alo", "FrontendMarket"]).optional(),
        reduceOnly: z.boolean().optional(),
        clientOrderId: z
          .string()
          .regex(/^0x[a-fA-F0-9]{32}$/)
          .optional(),
        trigger: triggerSchema.optional(),
      }),
      outputSchema: writeResultSchema,
      execute: async (input, context) => {
        const normalizedInput = normalizeModifyInput(input);
        const userId = getUserId(context.requestContext);
        const wallet = await getReadyWallet(deps.wallets, userId, context.requestContext);

        return createSubmittedResult(
          `Submitted ${input.market} order modification.`,
          await deps.hyperliquid.modifyOrder(wallet, normalizedInput),
        );
      },
    }),
    hyperliquid_update_leverage: createTool({
      id: "hyperliquid_update_leverage",
      description: "Update Hyperliquid leverage.",
      inputSchema: z.object({
        market: z.string().min(1),
        leverage: z.number().positive(),
        mode: z.enum(["cross", "isolated"]),
      }),
      outputSchema: writeResultSchema,
      execute: async (input, context) => {
        const normalizedInput = {
          market: input.market,
          leverage: input.leverage,
          mode: input.mode,
        } satisfies HyperliquidLeverageInput;
        const userId = getUserId(context.requestContext);
        const wallet = await getReadyWallet(deps.wallets, userId, context.requestContext);

        return createSubmittedResult(
          `Submitted leverage update for ${input.market}.`,
          await deps.hyperliquid.updateLeverage(wallet, normalizedInput),
        );
      },
    }),
    hyperliquid_transfer_usd: createTool({
      id: "hyperliquid_transfer_usd",
      description: "Transfer USDC on Hyperliquid.",
      inputSchema: z.object({
        destination: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
        amount: z.string().min(1),
      }),
      outputSchema: writeResultSchema,
      execute: async (input, context) => {
        const normalizedInput = {
          destination: requireHexAddress(input.destination),
          amount: input.amount,
        };
        const userId = getUserId(context.requestContext);
        const wallet = await getReadyWallet(deps.wallets, userId, context.requestContext);

        return createSubmittedResult(
          `Submitted USDC transfer to ${input.destination}.`,
          await deps.hyperliquid.transferUsd(wallet, normalizedInput),
        );
      },
    }),
    hyperliquid_transfer_spot: createTool({
      id: "hyperliquid_transfer_spot",
      description: "Transfer a Hyperliquid spot asset.",
      inputSchema: z.object({
        destination: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
        token: z.string().min(1),
        amount: z.string().min(1),
      }),
      outputSchema: writeResultSchema,
      execute: async (input, context) => {
        const normalizedInput = {
          destination: requireHexAddress(input.destination),
          token: input.token,
          amount: input.amount,
        };
        const userId = getUserId(context.requestContext);
        const wallet = await getReadyWallet(deps.wallets, userId, context.requestContext);

        return createSubmittedResult(
          `Submitted ${input.token} transfer to ${input.destination}.`,
          await deps.hyperliquid.transferSpot(wallet, normalizedInput),
        );
      },
    }),
    hyperliquid_send_asset: createTool({
      id: "hyperliquid_send_asset",
      description: "Transfer assets between Hyperliquid dex balances, users, or sub-accounts.",
      inputSchema: z.object({
        destination: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
        token: z.string().min(1),
        amount: z.string().min(1),
        sourceDex: z.string(),
        destinationDex: z.string(),
        fromSubAccount: z.union([z.literal(""), z.string().regex(/^0x[a-fA-F0-9]{40}$/)]).optional(),
      }),
      outputSchema: writeResultSchema,
      execute: async (input, context) => {
        const normalizedInput = {
          destination: requireHexAddress(input.destination),
          token: input.token,
          amount: input.amount,
          sourceDex: input.sourceDex,
          destinationDex: input.destinationDex,
          fromSubAccount:
            input.fromSubAccount === undefined || input.fromSubAccount === ""
              ? input.fromSubAccount
              : requireHexAddress(input.fromSubAccount),
        } satisfies HyperliquidSendAssetInput;
        const userId = getUserId(context.requestContext);
        const wallet = await getReadyWallet(deps.wallets, userId, context.requestContext);

        return createSubmittedResult(
          "Submitted Hyperliquid asset transfer.",
          await deps.hyperliquid.sendAsset(wallet, normalizedInput),
        );
      },
    }),
    hyperliquid_withdraw: createTool({
      id: "hyperliquid_withdraw",
      description: "Initiate a Hyperliquid external withdrawal.",
      inputSchema: z.object({
        destination: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
        amount: z.string().min(1),
      }),
      outputSchema: writeResultSchema,
      execute: async (input, context) => {
        const normalizedInput = {
          destination: requireHexAddress(input.destination),
          amount: input.amount,
        };
        const userId = getUserId(context.requestContext);
        const wallet = await getReadyWallet(deps.wallets, userId, context.requestContext);

        return createSubmittedResult(
          `Submitted withdrawal to ${input.destination}.`,
          await deps.hyperliquid.withdraw(wallet, normalizedInput),
        );
      },
    }),
  };

  if (!options.includeGenericPassthrough) {
    return tools;
  }

  return {
    ...tools,
    hyperliquid_run_info_method: createTool({
      id: "hyperliquid_run_info_method",
      description: `Run any installed Hyperliquid InfoClient method. Supported methods: ${infoMethodDescription}`,
      inputSchema: z.object({
        method: z.enum(HYPERLIQUID_INFO_METHODS),
        params: z.record(z.string(), z.unknown()).optional(),
      }),
      outputSchema: genericReadResultSchema,
      execute: async ({ method, params }, context) => {
        const requestContext = getToolRequestContext(context);
        const userId = getUserId(requestContext);
        const wallet = await deps.wallets.getProfile(userId);
        const normalizedParams = { ...params };

        if (
          wallet?.address &&
          normalizedParams.user === undefined &&
          [
            "borrowLendUserState",
            "clearinghouseState",
            "delegations",
            "delegatorHistory",
            "delegatorRewards",
            "delegatorSummary",
            "frontendOpenOrders",
            "historicalOrders",
            "isVip",
            "liquidatable",
            "openOrders",
            "orderStatus",
            "portfolio",
            "preTransferCheck",
            "referral",
            "spotClearinghouseState",
            "subAccounts",
            "subAccounts2",
            "userAbstraction",
            "userBorrowLendInterest",
            "userDetails",
            "userDexAbstraction",
            "userFees",
            "userFills",
            "userFillsByTime",
            "userFunding",
            "userNonFundingLedgerUpdates",
            "userRateLimit",
            "userRole",
            "userToMultiSigSigners",
            "userTwapSliceFills",
            "userTwapSliceFillsByTime",
            "userVaultEquities",
          ].includes(method)
        ) {
          normalizedParams.user = wallet.address;
        }

        const result = await deps.hyperliquid.queryInfo(
          method,
          Object.keys(normalizedParams).length ? normalizedParams : undefined,
        );

        return {
          ...result,
          result: compactGenericResult(result.result),
        };
      },
    }),
    hyperliquid_run_exchange_action: createTool({
      id: "hyperliquid_run_exchange_action",
      description: `Execute any installed Hyperliquid ExchangeClient action. Supported actions: ${exchangeActionDescription}.`,
      inputSchema: z.object({
        action: z.enum(HYPERLIQUID_EXCHANGE_ACTIONS),
        params: z.record(z.string(), z.unknown()).optional(),
      }),
      outputSchema: writeResultSchema,
      execute: async ({ action, params }, context) => {
        const requestContext = getToolRequestContext(context);
        const userId = getUserId(requestContext);
        const wallet = await getReadyWallet(deps.wallets, userId, requestContext);
        const result = await deps.hyperliquid.executeAction(wallet, action, params);
        const compactResult = {
          ...result,
          result: compactGenericResult(result.result),
        };

        return createSubmittedResult(createGenericActionSummary(action, params), compactResult);
      },
    }),
  };
}
