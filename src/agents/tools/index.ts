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

export type AgentToolScope = "core" | "messaging" | "full";

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
  scope: AgentToolScope = "full",
): ToolsInput {
  const webTools = createWebTools(config.web);
  const walletTools = createWalletTools({
    wallets: services.wallets,
    userContextResolver: services.userContextResolver,
  });
  const hyperliquidTools = createHyperliquidTools(
    {
      wallets: services.wallets,
      hyperliquid: services.hyperliquid,
    },
    {
      includeGenericPassthrough: scope === "full",
    },
  );
  const messagingTools = {
    ...createIMessageTools(runtime),
    ...createSchedulingTools(runtime),
    ...createReminderTools(runtime),
  };

  if (scope === "core") {
    return {
      ...webTools,
      ...walletTools,
      ...hyperliquidTools,
    };
  }

  if (scope === "messaging") {
    return {
      ...webTools,
      ...messagingTools,
    };
  }

  return {
    ...webTools,
    ...messagingTools,
    ...walletTools,
    ...hyperliquidTools,
  };
}

export { createAgentToolRuntime };
export type { AgentToolRuntime };
export type { ToolRuntimeConfig };
