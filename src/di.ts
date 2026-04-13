import { IMessageSDK } from "@photon-ai/imessage-kit";
import type { RecurringMessage, ScheduledMessage, SchedulerEvents } from "@photon-ai/imessage-kit";

import { createGeneralAgent } from "./agents/general-agent";
import { createMcpRuntime } from "./agents/mcp";
import { createAgentToolRuntime, createAgentTools } from "./agents/tools";
import type { AgentToolRuntime } from "./agents/tools";
import { appConfig } from "./config";
import type { AppConfig } from "./config";
import { UserContextResolver } from "./domain/users/user-context";
import { WalletService } from "./domain/wallets/service";
import { HyperliquidService } from "./lib/hyperliquid/service";
import { TurnkeyProvisioningClient } from "./lib/turnkey/client";
import { TurnkeyProvisioningService } from "./lib/turnkey/provisioning";
import { TurnkeyViemAccountFactory } from "./lib/turnkey/viem";
import { SqliteUserRepository } from "./repositories/sqlite/sqlite-user-repository";
import { createSqliteRepositoryContext } from "./repositories/sqlite/client";
import type { SqliteRepositoryContext } from "./repositories/sqlite/client";
import { SqliteWalletRepository } from "./repositories/sqlite/sqlite-wallet-repository";
import { logger } from "./utils/logger";

export interface AppContainer {
  config: AppConfig;
  sdk: IMessageSDK;
  repositoryContext: SqliteRepositoryContext;
  toolRuntime: AgentToolRuntime;
  agents: {
    core: ReturnType<typeof createGeneralAgent>;
    messaging: ReturnType<typeof createGeneralAgent>;
    full: ReturnType<typeof createGeneralAgent>;
  };
  mcpRuntime: ReturnType<typeof createMcpRuntime>;
  userContextResolver: UserContextResolver;
  turnkeyProvisioning: TurnkeyProvisioningService;
  walletService: WalletService;
  hyperliquidService: HyperliquidService;
}

function logScheduledSend(prefix: string, message: ScheduledMessage | RecurringMessage) {
  logger.info(`[${prefix}] sent id=${message.id} type=${message.type} to=${message.to}`);
}

function logScheduledError(prefix: string, message: ScheduledMessage | RecurringMessage, error: Error) {
  logger.error(`[${prefix}] failed id=${message.id} type=${message.type} to=${message.to}`, error);
}

function logRecurringComplete(prefix: string, message: RecurringMessage) {
  logger.info(`[${prefix}] completed id=${message.id} to=${message.to} sends=${message.sendCount}`);
}

function createSchedulingLifecycleLogger(prefix: string): SchedulerEvents {
  return {
    onSent: (message) => logScheduledSend(prefix, message),
    onError: (message, error) => logScheduledError(prefix, message, error),
    onComplete: (message) => logRecurringComplete(prefix, message),
  };
}

export async function buildAppContainer(config: AppConfig = appConfig): Promise<AppContainer> {
  const sdk = new IMessageSDK({
    watcher: { excludeOwnMessages: true },
  });
  const repositoryContext = await createSqliteRepositoryContext(config.agent.memory.databaseUrl);
  const users = new SqliteUserRepository(repositoryContext);
  const wallets = new SqliteWalletRepository(repositoryContext);
  const userContextResolver = new UserContextResolver(users, wallets);
  const turnkeyClient = new TurnkeyProvisioningClient(config.turnkey);
  await turnkeyClient.validateAccess();
  const turnkeyProvisioning = new TurnkeyProvisioningService(wallets, turnkeyClient);
  const walletService = new WalletService(wallets, turnkeyProvisioning);
  const turnkeySignerFactory = new TurnkeyViemAccountFactory(config.turnkey);
  const hyperliquidService = new HyperliquidService(config.hyperliquid, turnkeySignerFactory);
  const toolRuntime = createAgentToolRuntime(sdk, config.tools.runtime, {
    scheduler: createSchedulingLifecycleLogger("scheduler"),
    reminders: createSchedulingLifecycleLogger("reminder"),
  });
  const agentServices = {
    wallets: walletService,
    userContextResolver,
    turnkeyProvisioning,
    hyperliquid: hyperliquidService,
  };
  const agents = {
    core: createGeneralAgent(config.agent, createAgentTools(toolRuntime, config.tools, agentServices, "core")),
    messaging: createGeneralAgent(
      config.agent,
      createAgentTools(toolRuntime, config.tools, agentServices, "messaging"),
    ),
    full: createGeneralAgent(config.agent, createAgentTools(toolRuntime, config.tools, agentServices, "full")),
  };
  const mcpRuntime = createMcpRuntime(config.mcp);

  return {
    config,
    sdk,
    repositoryContext,
    toolRuntime,
    agents,
    mcpRuntime,
    userContextResolver,
    turnkeyProvisioning,
    walletService,
    hyperliquidService,
  };
}
