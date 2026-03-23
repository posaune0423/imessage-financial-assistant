import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import {
  buildTradeConfirmationCode,
  containsTradeConfirmation,
  createTradeConfirmationMessage,
} from "../../domain/trading/confirmation";
import type { WalletService } from "../../domain/wallets/service";
import { getAppUserId, getIncomingText } from "../request-context";
import type { HyperliquidService } from "../../lib/hyperliquid/service";
import type {
  HyperliquidCancelInput,
  HyperliquidLeverageInput,
  HyperliquidModifyInput,
  HyperliquidOrderInput,
} from "../../lib/hyperliquid/interfaces";

const writeResultSchema = z.object({
  status: z.enum(["confirmation_required", "submitted"]),
  message: z.string(),
  confirmationCode: z.string().optional(),
  result: z.unknown().optional(),
});

interface HyperliquidToolDeps {
  wallets: WalletService;
  hyperliquid: HyperliquidService;
}

function isHexAddress(value: string): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function resolveTargetAddress(value: string | null | undefined): `0x${string}` | undefined {
  return value && isHexAddress(value) ? value : undefined;
}

function createConfirmationPayload(action: string, parts: string[], summary: string) {
  const confirmationCode = buildTradeConfirmationCode([action, ...parts]);
  return {
    status: "confirmation_required" as const,
    message: createTradeConfirmationMessage(summary, confirmationCode),
    confirmationCode,
  };
}

async function getReadyWallet(wallets: WalletService, appUserId: string) {
  const wallet = await wallets.getProfile(appUserId);
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

function isConfirmed(currentMessage: string | undefined, action: string, parts: string[]) {
  const confirmationCode = buildTradeConfirmationCode([action, ...parts]);
  return {
    confirmationCode,
    confirmed: containsTradeConfirmation(currentMessage, confirmationCode),
  };
}

export function createHyperliquidTools(deps: HyperliquidToolDeps) {
  return {
    hyperliquid_get_market_snapshot: createTool({
      id: "hyperliquid_get_market_snapshot",
      description: "Get current Hyperliquid market snapshot and mids for one or more markets.",
      inputSchema: z.object({
        coins: z.array(z.string().min(1)).optional(),
      }),
      outputSchema: z.object({
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
    hyperliquid_get_user_summary: createTool({
      id: "hyperliquid_get_user_summary",
      description: "Get Hyperliquid user summary for the current wallet or an explicit address.",
      inputSchema: z.object({
        address: z.string().startsWith("0x").optional(),
      }),
      outputSchema: z.object({
        address: z.string(),
        summary: z.unknown(),
      }),
      execute: async ({ address }, context) => {
        const appUserId = getAppUserId(context.requestContext);
        const wallet = await deps.wallets.getProfile(appUserId);
        const target = resolveTargetAddress(address ?? wallet?.address);
        if (!target) {
          throw new Error("No wallet address is available for this user");
        }

        return deps.hyperliquid.getUserSummary(target);
      },
    }),
    hyperliquid_get_open_orders: createTool({
      id: "hyperliquid_get_open_orders",
      description: "Get current Hyperliquid open orders for the current wallet or an explicit address.",
      inputSchema: z.object({
        address: z.string().startsWith("0x").optional(),
      }),
      outputSchema: z.object({
        address: z.string(),
        orders: z.unknown(),
      }),
      execute: async ({ address }, context) => {
        const appUserId = getAppUserId(context.requestContext);
        const wallet = await deps.wallets.getProfile(appUserId);
        const target = resolveTargetAddress(address ?? wallet?.address);
        if (!target) {
          throw new Error("No wallet address is available for this user");
        }

        return deps.hyperliquid.getOpenOrders(target);
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
        address: z.string(),
        fills: z.unknown(),
      }),
      execute: async ({ address, limit }, context) => {
        const appUserId = getAppUserId(context.requestContext);
        const wallet = await deps.wallets.getProfile(appUserId);
        const target = resolveTargetAddress(address ?? wallet?.address);
        if (!target) {
          throw new Error("No wallet address is available for this user");
        }

        return deps.hyperliquid.getRecentFills(target, limit);
      },
    }),
    hyperliquid_place_order: createTool({
      id: "hyperliquid_place_order",
      description:
        "Place a Hyperliquid order. The first call returns a confirmation code. Execute only after the user sends the explicit code.",
      inputSchema: z.object({
        market: z.string().min(1),
        side: z.enum(["buy", "sell"]),
        size: z.string().min(1),
        price: z.string().min(1).optional(),
        tif: z.enum(["Gtc", "Ioc", "Alo", "FrontendMarket"]).optional(),
        reduceOnly: z.boolean().optional(),
      }),
      outputSchema: writeResultSchema,
      execute: async (input: HyperliquidOrderInput, context) => {
        const appUserId = getAppUserId(context.requestContext);
        const wallet = await getReadyWallet(deps.wallets, appUserId);
        const message = getIncomingText(context.requestContext);
        const parts = [input.market, input.side, input.size, input.price ?? "market", input.tif ?? "default"];
        const summary = `${input.market} ${input.side} ${input.size} を ${input.price ? input.price : "成行"} で発注します。`;
        const { confirmationCode, confirmed } = isConfirmed(message, "place_order", parts);

        if (!confirmed) {
          return createConfirmationPayload("place_order", parts, summary);
        }

        return {
          status: "submitted" as const,
          message: `${input.market} の注文を送信しました。`,
          confirmationCode,
          result: await deps.hyperliquid.placeOrder(wallet, input),
        };
      },
    }),
    hyperliquid_cancel_orders: createTool({
      id: "hyperliquid_cancel_orders",
      description:
        "Cancel a Hyperliquid order. The first call returns a confirmation code. Execute only after the user sends the explicit code.",
      inputSchema: z.object({
        market: z.string().min(1),
        orderId: z.number().int().positive(),
      }),
      outputSchema: writeResultSchema,
      execute: async (input: HyperliquidCancelInput, context) => {
        const appUserId = getAppUserId(context.requestContext);
        const wallet = await getReadyWallet(deps.wallets, appUserId);
        const message = getIncomingText(context.requestContext);
        const parts = [input.market, String(input.orderId)];
        const summary = `${input.market} の注文 ${input.orderId} をキャンセルします。`;
        const { confirmationCode, confirmed } = isConfirmed(message, "cancel_order", parts);

        if (!confirmed) {
          return createConfirmationPayload("cancel_order", parts, summary);
        }

        return {
          status: "submitted" as const,
          message: `${input.market} の注文キャンセルを送信しました。`,
          confirmationCode,
          result: await deps.hyperliquid.cancelOrder(wallet, input),
        };
      },
    }),
    hyperliquid_modify_order: createTool({
      id: "hyperliquid_modify_order",
      description:
        "Modify an existing Hyperliquid order. The first call returns a confirmation code. Execute only after the user sends the explicit code.",
      inputSchema: z.object({
        market: z.string().min(1),
        orderId: z.number().int().positive(),
        side: z.enum(["buy", "sell"]),
        size: z.string().min(1),
        price: z.string().min(1),
        tif: z.enum(["Gtc", "Ioc", "Alo", "FrontendMarket"]).optional(),
        reduceOnly: z.boolean().optional(),
      }),
      outputSchema: writeResultSchema,
      execute: async (input: HyperliquidModifyInput, context) => {
        const appUserId = getAppUserId(context.requestContext);
        const wallet = await getReadyWallet(deps.wallets, appUserId);
        const message = getIncomingText(context.requestContext);
        const parts = [input.market, String(input.orderId), input.side, input.size, input.price];
        const summary = `${input.market} の注文 ${input.orderId} を size=${input.size}, price=${input.price} に変更します。`;
        const { confirmationCode, confirmed } = isConfirmed(message, "modify_order", parts);

        if (!confirmed) {
          return createConfirmationPayload("modify_order", parts, summary);
        }

        return {
          status: "submitted" as const,
          message: `${input.market} の注文変更を送信しました。`,
          confirmationCode,
          result: await deps.hyperliquid.modifyOrder(wallet, input),
        };
      },
    }),
    hyperliquid_update_leverage: createTool({
      id: "hyperliquid_update_leverage",
      description:
        "Update Hyperliquid leverage. The first call returns a confirmation code. Execute only after the user sends the explicit code.",
      inputSchema: z.object({
        market: z.string().min(1),
        leverage: z.number().positive(),
        mode: z.enum(["cross", "isolated"]),
      }),
      outputSchema: writeResultSchema,
      execute: async (input: HyperliquidLeverageInput, context) => {
        const appUserId = getAppUserId(context.requestContext);
        const wallet = await getReadyWallet(deps.wallets, appUserId);
        const message = getIncomingText(context.requestContext);
        const parts = [input.market, String(input.leverage), input.mode];
        const summary = `${input.market} のレバレッジを ${input.mode} ${input.leverage}x に更新します。`;
        const { confirmationCode, confirmed } = isConfirmed(message, "update_leverage", parts);

        if (!confirmed) {
          return createConfirmationPayload("update_leverage", parts, summary);
        }

        return {
          status: "submitted" as const,
          message: `${input.market} のレバレッジ更新を送信しました。`,
          confirmationCode,
          result: await deps.hyperliquid.updateLeverage(wallet, input),
        };
      },
    }),
  };
}
