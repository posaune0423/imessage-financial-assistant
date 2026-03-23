import type { ToolsInput } from "@mastra/core/agent";
import type { AgentToolRuntime } from "./runtime";

import type { WalletService } from "../../domain/wallets/service";
import type { UserContextResolver } from "../../domain/users/user-context";
import type { HyperliquidService } from "../../lib/hyperliquid/service";
import type { TurnkeyProvisioningService } from "../../lib/turnkey/provisioning";
import { createIMessageTools } from "./imessage";
import { createReminderTools } from "./reminder";
import { createSchedulingTools } from "./scheduling";
import { createAgentToolRuntime } from "./runtime";
import { createWebTools } from "./brave";
import { createWalletTools } from "./wallet";
import { createHyperliquidTools } from "./hyperliquid";
import type { ToolRuntimeConfig, WebToolConfig } from "../../config";

export interface AgentToolServices {
  wallets: WalletService;
  userContextResolver: UserContextResolver;
  turnkeyProvisioning: TurnkeyProvisioningService;
  hyperliquid: HyperliquidService;
}

export function createAgentTools(
  runtime: AgentToolRuntime,
  config: { web: WebToolConfig },
  services: AgentToolServices,
): ToolsInput {
  return {
    ...createWebTools(config.web),
    ...createIMessageTools(runtime),
    ...createSchedulingTools(runtime),
    ...createReminderTools(runtime),
    ...createWalletTools({
      wallets: services.wallets,
      userContextResolver: services.userContextResolver,
      turnkeyProvisioning: services.turnkeyProvisioning,
    }),
    ...createHyperliquidTools({
      wallets: services.wallets,
      hyperliquid: services.hyperliquid,
    }),
  };
}

export { createAgentToolRuntime };
export type { AgentToolRuntime };
export type { ToolRuntimeConfig };
