import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { getAppUserId } from "../request-context";
import type { WalletService } from "../../domain/wallets/service";
import type { UserContextResolver } from "../../domain/users/user-context";
import type { TurnkeyProvisioningService } from "../../lib/turnkey/provisioning";

interface WalletToolDeps {
  wallets: WalletService;
  userContextResolver: UserContextResolver;
  turnkeyProvisioning: TurnkeyProvisioningService;
}

export function createWalletTools(deps: WalletToolDeps) {
  return {
    wallet_get_profile: createTool({
      id: "wallet_get_profile",
      description: "Return the current user's wallet provisioning status and primary address.",
      inputSchema: z.object({}),
      outputSchema: z.object({
        status: z.enum(["none", "provisioning", "ready", "failed"]),
        signerStatus: z.enum(["not_bootstrapped", "bootstrapping", "ready", "degraded"]).optional(),
        address: z.string().nullable(),
        chain: z.string().nullable(),
      }),
      execute: async (_args, context) => {
        const appUserId = getAppUserId(context.requestContext);
        const wallet = await deps.wallets.getProfile(appUserId);

        return {
          status: wallet?.status ?? "none",
          signerStatus: wallet?.signerStatus,
          address: wallet?.address ?? null,
          chain: wallet?.chain ?? null,
        };
      },
    }),
    wallet_ensure_primary: createTool({
      id: "wallet_ensure_primary",
      description: "Ensure the current user has a primary wallet provisioned. Safe to call repeatedly.",
      inputSchema: z.object({
        force: z.boolean().optional(),
      }),
      outputSchema: z.object({
        status: z.enum(["ready", "failed", "provisioning"]),
        signerStatus: z.enum(["not_bootstrapped", "bootstrapping", "ready", "degraded"]),
        address: z.string().nullable(),
      }),
      execute: async ({ force }, context) => {
        const sender = context.requestContext?.get("sender");
        if (typeof sender !== "string") {
          throw new TypeError("Missing sender context for wallet provisioning");
        }

        const chatId = context.requestContext?.get("chatId");
        const userContext = await deps.userContextResolver.resolve({
          sender,
          chatId: typeof chatId === "string" ? chatId : undefined,
        });
        const wallet = await deps.turnkeyProvisioning.ensurePrimaryWallet(userContext, { force });
        const status =
          wallet.status === "ready"
            ? ("ready" as const)
            : wallet.status === "failed"
              ? ("failed" as const)
              : ("provisioning" as const);

        return {
          status,
          signerStatus: wallet.signerStatus,
          address: wallet.address ?? null,
        };
      },
    }),
  };
}
