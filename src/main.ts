import type { RecurringMessage, ScheduledMessage, SchedulerEvents } from "@photon-ai/imessage-kit";
import type { ToolsetsInput } from "@mastra/core/agent";

import { HeartbeatEngine } from "./agents/heartbeat";
import { createAgentRequestContext } from "./agents/request-context";
import type { AgentToolScope } from "./agents/tools";
import { buildAppContainer } from "./di";
import type { HyperliquidNetwork } from "./config";
import type { UserContextResolver } from "./domain/users/user-context";
import type { AppWallet } from "./domain/users/types";
import type { TurnkeyProvisioningService } from "./lib/turnkey/provisioning";
import { logger } from "./utils/logger";
import { acquireProcessLock } from "./utils/process-lock";

interface DirectMessage {
  sender?: string | null;
  chatId?: string | null;
  text?: string | null;
  isReaction?: boolean;
}

interface ToolCallLike {
  payload: {
    toolCallId: string;
    toolName: string;
    args?: unknown;
  };
}

interface ToolResultLike {
  payload: {
    toolCallId: string;
    toolName: string;
    result: unknown;
    isError?: boolean;
  };
}

interface StepLike {
  toolCalls?: ToolCallLike[];
  toolResults?: ToolResultLike[];
}

function isStepLike(step: unknown): step is StepLike {
  if (typeof step !== "object" || step === null) {
    return false;
  }
  return (
    (!("toolCalls" in step) || Array.isArray(Reflect.get(step, "toolCalls"))) &&
    (!("toolResults" in step) || Array.isArray(Reflect.get(step, "toolResults")))
  );
}

interface AgentLike {
  generate: (
    message: string,
    options: {
      memory: {
        resource: string;
        thread: string;
      };
      maxSteps?: number;
      toolsets?: ToolsetsInput;
      requestContext?: ReturnType<typeof createAgentRequestContext>;
      onStepFinish?: (step: unknown) => Promise<void>;
    },
  ) => Promise<{ text: string }>;
}

interface DirectMessageHandlerDeps {
  ownerPhone: string;
  selectAgent: (text: string) => AgentLike;
  sendMessage: (to: string, text: string) => Promise<unknown>;
  userContextResolver: UserContextResolver;
  turnkeyProvisioning: TurnkeyProvisioningService;
  hyperliquidNetwork: HyperliquidNetwork;
  resolveToolsets?: (text: string) => Promise<ToolsetsInput>;
  maxSteps?: number;
}

const MCP_KEYWORD_PATTERN =
  /\b(allium|wallet|onchain|on-chain|blockchain|crypto|token|defi|dex|swap|bridge|ethereum|solana|bitcoin|btc|eth|usdc|contract|address|transaction|balance|holder|pool|liquidity)\b/i;
const FINANCE_KEYWORD_PATTERN =
  /\b(wallet|portfolio|balance|balances|market|markets|search|browse|price|prices|trade|trading|order|orders|book|candle|candles|buy|sell|position|positions|pnl|hyperliquid|btc|eth|usdc|token|tokens|spot|perp|perps|leverage|margin|twap|stop loss|stop-loss|take profit|take-profit|tp|sl|withdraw|transfer|send asset|vault|sub-account|subaccount|validator|staking|borrow|lend)\b/i;
const MESSAGING_KEYWORD_PATTERN =
  /\b(remind|reminder|schedule|scheduled|send|text|message|messages|later|tomorrow|tonight|daily|weekly|every day|every week|follow up|follow-up|notify)\b/i;
const HYPERLIQUID_BALANCE_KEYWORD_PATTERN =
  /\b(balance|balances|portfolio|holdings|wallet|position|positions|pnl|net worth|worth|usdc)\b/i;
const TOOL_PROGRESS_REPLY = "I am checking that now. Please wait a moment.";
const LOG_VALUE_LIMIT = 400;
const WORKING_MEMORY_TOOL_NAME = "updateWorkingMemory";
const PROCESS_LOCK_PATH = "./data/imessage-agent.lock";
const NON_PROGRESS_TOOL_NAMES = new Set([WORKING_MEMORY_TOOL_NAME]);

function createFirstWalletOnboardingReply(wallet: AppWallet | null, network: HyperliquidNetwork): string {
  const address = wallet?.address?.trim();
  if (!address) {
    return 'Your wallet is ready. Ask "show my wallet address" next, then deposit USDC before you start trading.';
  }
  const fundingInstruction =
    network === "testnet"
      ? "Please deposit USDC to this address. Hyperliquid testnet is the target network."
      : "Please deposit USDC to this address. Arbitrum is the default funding route.";

  return [
    "Your wallet is ready.",
    `Deposit address: ${address}`,
    fundingInstruction,
    'After funding, you can say things like "show my portfolio", "show BTC market data", or "buy 0.01 BTC".',
  ].join("\n");
}

function splitReplyIntoMessages(text: string): string[] {
  const message = text.trim();
  return message ? [message] : [];
}

function logOutgoingMessage(target: string, text: string) {
  logger.info(`[imessage] -> to=${target} chars=${text.length} lines=${text.split("\n").length}`);
}

async function sendIMessageSafeReply(
  sendMessage: DirectMessageHandlerDeps["sendMessage"],
  target: string,
  text: string,
) {
  for (const chunk of splitReplyIntoMessages(text)) {
    logOutgoingMessage(target, chunk);
    await sendMessage(target, chunk);
  }
}

function formatLogValue(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    if (!serialized) {
      return String(value);
    }

    return serialized.length > LOG_VALUE_LIMIT ? `${serialized.slice(0, LOG_VALUE_LIMIT)}...` : serialized;
  } catch {
    return String(value);
  }
}

function summarizeWorkingMemoryArgs(args: unknown): string {
  if (
    typeof args === "object" &&
    args !== null &&
    "memory" in args &&
    typeof args.memory === "string" &&
    args.memory.trim()
  ) {
    return JSON.stringify({
      memory: `[redacted working memory ${args.memory.length} chars]`,
    });
  }

  return '"[redacted working memory]"';
}

function formatToolCallArgs(toolName: string, args: unknown): string {
  if (toolName === WORKING_MEMORY_TOOL_NAME) {
    return summarizeWorkingMemoryArgs(args);
  }

  return formatLogValue(args);
}

function logToolStep(step: StepLike) {
  for (const toolCall of step.toolCalls ?? []) {
    logger.info(
      `[agent] tool-call id=${toolCall.payload.toolCallId} name=${toolCall.payload.toolName} args=${formatToolCallArgs(toolCall.payload.toolName, toolCall.payload.args)}`,
    );
  }

  for (const toolResult of step.toolResults ?? []) {
    const status = toolResult.payload.isError ? "error" : "ok";
    logger.info(
      `[agent] tool-result id=${toolResult.payload.toolCallId} name=${toolResult.payload.toolName} status=${status} result=${formatLogValue(toolResult.payload.result)}`,
    );
  }
}

function shouldSendToolProgressReply(step: StepLike): boolean {
  const toolCalls = step.toolCalls ?? [];
  if (toolCalls.length === 0) {
    return false;
  }

  return toolCalls.some((toolCall) => !NON_PROGRESS_TOOL_NAMES.has(toolCall.payload.toolName));
}

function getRetryAfterSeconds(error: unknown): number | null {
  if (typeof error !== "object" || error === null || !("responseHeaders" in error)) {
    return null;
  }

  const responseHeaders = error.responseHeaders;
  if (typeof responseHeaders !== "object" || responseHeaders === null || !("retry-after" in responseHeaders)) {
    return null;
  }

  const retryAfter = responseHeaders["retry-after"];
  const seconds = typeof retryAfter === "string" ? Number.parseInt(retryAfter, 10) : Number.NaN;
  return Number.isFinite(seconds) ? seconds : null;
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

export function createSchedulingLifecycleLogger(prefix: string): SchedulerEvents {
  return {
    onSent: (message) => logScheduledSend(prefix, message),
    onError: (message, error) => logScheduledError(prefix, message, error),
    onComplete: (message) => logRecurringComplete(prefix, message),
  };
}

export function shouldResolveMcpToolsets(text: string): boolean {
  return MCP_KEYWORD_PATTERN.test(text);
}

export function shouldResolveMcpToolsetsForNetwork(text: string, network: HyperliquidNetwork): boolean {
  if (network === "testnet" && HYPERLIQUID_BALANCE_KEYWORD_PATTERN.test(text)) {
    return false;
  }

  return shouldResolveMcpToolsets(text);
}

export function selectAgentScope(text: string): AgentToolScope {
  const hasFinanceIntent = FINANCE_KEYWORD_PATTERN.test(text) || MCP_KEYWORD_PATTERN.test(text);
  const hasMessagingIntent = MESSAGING_KEYWORD_PATTERN.test(text);

  if (hasFinanceIntent && hasMessagingIntent) {
    return "full";
  }

  if (hasMessagingIntent) {
    return "messaging";
  }

  return "core";
}

export function getDirectMessageFailureReply(error: unknown): string {
  if (typeof error === "object" && error !== null && "statusCode" in error && error.statusCode === 429) {
    const retryAfterSeconds = getRetryAfterSeconds(error);
    if (retryAfterSeconds) {
      return `Things are busy right now. Please try again in about ${retryAfterSeconds} seconds.`;
    }

    return "Things are busy right now. Please try again shortly.";
  }

  return "Something went wrong. Please try again shortly.";
}

export function createDirectMessageHandler(deps: DirectMessageHandlerDeps) {
  return async (message: DirectMessage) => {
    const sender = message.sender?.trim() || message.chatId?.trim();
    const replyTarget = message.chatId?.trim() || sender;
    const text = message.text?.trim();
    if (!sender || !replyTarget || !text || message.isReaction) return;
    let sentToolProgressReply = false;

    logger.info(`[imessage] <- sender=${sender} target=${replyTarget} text=${JSON.stringify(text)}`);

    try {
      const userContext = await deps.userContextResolver.resolve({
        sender: message.sender,
        chatId: message.chatId,
        text,
      });
      const isFirstWalletProvision = !userContext.wallet || userContext.wallet.status === "none";

      if (!userContext.wallet || userContext.wallet.status === "none" || userContext.wallet.status === "failed") {
        await deps.turnkeyProvisioning.ensurePrimaryWallet(userContext);
      }

      const freshUserContext = await deps.userContextResolver.resolve({
        sender: message.sender,
        chatId: message.chatId,
        text,
      });
      const agentScope = selectAgentScope(text);
      const requestContext = createAgentRequestContext({
        sender,
        chatId: message.chatId ?? undefined,
        ownerPhone: deps.ownerPhone,
        incomingText: text,
        userId: freshUserContext.id,
        resourceKey: freshUserContext.resourceKey,
        walletAddress: freshUserContext.wallet?.address ?? undefined,
        walletStatus: freshUserContext.wallet?.status ?? "none",
        signerStatus: freshUserContext.wallet?.signerStatus ?? "not_bootstrapped",
        turnkeyOrganizationId: freshUserContext.wallet?.turnkeyOrganizationId ?? undefined,
        turnkeyWalletId: freshUserContext.wallet?.turnkeyWalletId ?? undefined,
        turnkeyAccountId: freshUserContext.wallet?.turnkeyAccountId ?? undefined,
        turnkeyDelegatedUserId: freshUserContext.wallet?.turnkeyDelegatedUserId ?? undefined,
        agentScope,
        hyperliquidNetwork: deps.hyperliquidNetwork,
      });

      if (isFirstWalletProvision) {
        const onboardingReply = createFirstWalletOnboardingReply(freshUserContext.wallet, deps.hyperliquidNetwork);
        await sendIMessageSafeReply(deps.sendMessage, replyTarget, onboardingReply);
        return;
      }

      const toolsets = shouldResolveMcpToolsetsForNetwork(text, deps.hyperliquidNetwork)
        ? await deps.resolveToolsets?.(text)
        : undefined;
      const agent = deps.selectAgent(text);
      logger.debug(`[agent] selected scope=${agentScope} mcp=${toolsets ? "enabled" : "disabled"}`);
      const result = await agent.generate(text, {
        memory: { resource: freshUserContext.resourceKey, thread: "default" },
        maxSteps: deps.maxSteps,
        toolsets,
        requestContext,
        onStepFinish: async (step) => {
          if (!isStepLike(step)) {
            return;
          }

          logToolStep(step);

          if (sentToolProgressReply || !shouldSendToolProgressReply(step)) {
            return;
          }

          if (!replyTarget) {
            return;
          }

          sentToolProgressReply = true;
          logOutgoingMessage(replyTarget, TOOL_PROGRESS_REPLY);
          await deps.sendMessage(replyTarget, TOOL_PROGRESS_REPLY);
        },
      });
      const reply = result.text.trim();
      if (!reply) {
        return;
      }

      await sendIMessageSafeReply(deps.sendMessage, replyTarget, reply);
    } catch (error) {
      logger.error("[imessage] failed to handle direct message", error);
      const failureReply = getDirectMessageFailureReply(error);
      logOutgoingMessage(replyTarget, failureReply);
      await deps.sendMessage(replyTarget, failureReply);
    }
  };
}

export async function main() {
  const releaseProcessLock = acquireProcessLock(PROCESS_LOCK_PATH);
  const app = await buildAppContainer();

  const heartbeat = new HeartbeatEngine({
    agent: app.agents.core,
    ownerPhone: app.config.ownerPhone,
    sendMessage: async (to, text) => app.sdk.send(to, text),
    heartbeat: app.config.heartbeat,
    maxSteps: app.config.agent.maxSteps,
  });

  const onDirectMessage = createDirectMessageHandler({
    ownerPhone: app.config.ownerPhone,
    selectAgent: (text) => {
      const scope = selectAgentScope(text);
      if (scope === "messaging") {
        return app.agents.messaging;
      }
      if (scope === "full") {
        return app.agents.full;
      }
      return app.agents.core;
    },
    sendMessage: async (to, text) => app.sdk.send(to, text),
    userContextResolver: app.userContextResolver,
    turnkeyProvisioning: app.turnkeyProvisioning,
    hyperliquidNetwork: app.config.hyperliquid.network,
    resolveToolsets: app.mcpRuntime.getToolsetsForText,
    maxSteps: app.config.agent.maxSteps,
  });

  let isShuttingDown = false;
  const shutdown = async () => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    logger.info("Shutting down...");
    app.toolRuntime.destroy();
    heartbeat.stop();
    app.sdk.stopWatching();
    await app.mcpRuntime.client?.disconnect();
    await app.sdk.close();
    app.repositoryContext.client.close();
    releaseProcessLock();
    process.exit(0);
  };

  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());

  try {
    await app.sdk.startWatching({
      onDirectMessage,
      onError: (error) => logger.error("[imessage] watcher error", error),
    });

    heartbeat.start();
    logger.info(`Agent started. Waiting for messages... pid=${process.pid}`);
  } catch (error) {
    releaseProcessLock();
    throw error;
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    logger.error("Application failed to start", error);
    process.exit(1);
  }
}
