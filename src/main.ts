import type { RecurringMessage, ScheduledMessage, SchedulerEvents } from "@photon-ai/imessage-kit";
import type { ToolsetsInput } from "@mastra/core/agent";

import { HeartbeatEngine } from "./agents/heartbeat";
import { createAgentRequestContext } from "./agents/request-context";
import { buildAppContainer } from "./di";
import type { UserContextResolver } from "./domain/users/user-context";
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
  return typeof step === "object" && step !== null;
}

interface DirectMessageHandlerDeps {
  ownerPhone: string;
  agent: {
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
  };
  sendMessage: (to: string, text: string) => Promise<unknown>;
  userContextResolver: UserContextResolver;
  turnkeyProvisioning: TurnkeyProvisioningService;
  resolveToolsets?: () => Promise<ToolsetsInput>;
  maxSteps?: number;
}

const MCP_KEYWORD_PATTERN =
  /\b(allium|wallet|onchain|on-chain|blockchain|crypto|token|defi|dex|swap|bridge|ethereum|solana|bitcoin|btc|eth|usdc|contract|address|transaction|balance|holder|pool|liquidity)\b/i;
const TOOL_PROGRESS_REPLY = "確認しながら進めています。少し待ってください。";
const LOG_VALUE_LIMIT = 400;
const WORKING_MEMORY_TOOL_NAME = "updateWorkingMemory";
const PROCESS_LOCK_PATH = "./data/imessage-agent.lock";
const NON_PROGRESS_TOOL_NAMES = new Set([WORKING_MEMORY_TOOL_NAME]);

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

export function getDirectMessageFailureReply(error: unknown): string {
  if (typeof error === "object" && error !== null && "statusCode" in error && error.statusCode === 429) {
    const retryAfterSeconds = getRetryAfterSeconds(error);
    if (retryAfterSeconds) {
      return `今少し混み合っています。${retryAfterSeconds}秒ほど待ってからもう一度送ってください。`;
    }

    return "今少し混み合っています。少し待ってからもう一度送ってください。";
  }

  return "今ちょっと調子が悪いので、少し待ってからもう一度送ってください。";
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

      if (!userContext.wallet || userContext.wallet.status === "none" || userContext.wallet.status === "failed") {
        await deps.turnkeyProvisioning.ensurePrimaryWallet(userContext);
      }

      const freshUserContext = await deps.userContextResolver.resolve({
        sender: message.sender,
        chatId: message.chatId,
        text,
      });
      const requestContext = createAgentRequestContext({
        sender,
        chatId: message.chatId ?? undefined,
        ownerPhone: deps.ownerPhone,
        incomingText: text,
        appUserId: freshUserContext.id,
        resourceKey: freshUserContext.resourceKey,
        walletAddress: freshUserContext.wallet?.address ?? undefined,
        walletStatus: freshUserContext.wallet?.status ?? "none",
        signerStatus: freshUserContext.wallet?.signerStatus ?? "not_bootstrapped",
        turnkeyOrganizationId: freshUserContext.wallet?.turnkeyOrganizationId ?? undefined,
        turnkeyWalletId: freshUserContext.wallet?.turnkeyWalletId ?? undefined,
        turnkeyAccountId: freshUserContext.wallet?.turnkeyAccountId ?? undefined,
        turnkeyDelegatedUserId: freshUserContext.wallet?.turnkeyDelegatedUserId ?? undefined,
      });
      const toolsets = shouldResolveMcpToolsets(text) ? await deps.resolveToolsets?.() : undefined;
      const result = await deps.agent.generate(text, {
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
          logger.info(`[imessage] -> to=${replyTarget} text=${JSON.stringify(TOOL_PROGRESS_REPLY)}`);
          await deps.sendMessage(replyTarget, TOOL_PROGRESS_REPLY);
        },
      });
      const reply = result.text.trim();
      if (!reply) {
        return;
      }

      logger.info(`[imessage] -> to=${replyTarget} text=${JSON.stringify(reply)}`);
      await deps.sendMessage(replyTarget, reply);
    } catch (error) {
      logger.error("[imessage] failed to handle direct message", error);
      const failureReply = getDirectMessageFailureReply(error);
      logger.info(`[imessage] -> to=${replyTarget} text=${JSON.stringify(failureReply)}`);
      await deps.sendMessage(replyTarget, failureReply);
    }
  };
}

export async function main() {
  const releaseProcessLock = acquireProcessLock(PROCESS_LOCK_PATH);
  const app = await buildAppContainer();

  const heartbeat = new HeartbeatEngine({
    agent: app.agent,
    ownerPhone: app.config.ownerPhone,
    sendMessage: async (to, text) => app.sdk.send(to, text),
    heartbeat: app.config.heartbeat,
    maxSteps: app.config.agent.maxSteps,
  });

  const onDirectMessage = createDirectMessageHandler({
    ownerPhone: app.config.ownerPhone,
    agent: app.agent,
    sendMessage: async (to, text) => app.sdk.send(to, text),
    userContextResolver: app.userContextResolver,
    turnkeyProvisioning: app.turnkeyProvisioning,
    resolveToolsets: app.mcpRuntime.getToolsets,
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
  await main();
}
