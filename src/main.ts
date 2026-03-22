import { IMessageSDK } from "@photon-ai/imessage-kit";
import type { RecurringMessage, ScheduledMessage, SchedulerEvents } from "@photon-ai/imessage-kit";
import type { ToolsetsInput } from "@mastra/core/agent";

import { appConfig } from "./config";
import { createGeneralAgent } from "./agents/general-agent";
import { HeartbeatEngine } from "./agents/heartbeat";
import { createMcpRuntime } from "./agents/mcp";
import { createAgentRequestContext } from "./agents/request-context";
import { createAgentToolRuntime, createAgentTools } from "./agents/tools";
import { logger } from "./utils/logger";
import { samePhone } from "./utils/phone";

interface DirectMessage {
  sender?: string | null;
  chatId?: string | null;
  text?: string | null;
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

interface DirectMessageHandlerDeps {
  ownerPhone: string;
  agent: ReturnType<typeof createGeneralAgent>;
  sendMessage: (to: string, text: string) => Promise<unknown>;
  resolveToolsets?: () => Promise<ToolsetsInput>;
  maxSteps?: number;
}

const MCP_KEYWORD_PATTERN =
  /\b(allium|wallet|onchain|on-chain|blockchain|crypto|token|defi|dex|swap|bridge|ethereum|solana|bitcoin|btc|eth|usdc|contract|address|transaction|balance|holder|pool|liquidity)\b/i;
const TOOL_PROGRESS_REPLY = "確認しながら進めています。少し待ってください。";
const LOG_VALUE_LIMIT = 400;
const WORKING_MEMORY_TOOL_NAME = "updateWorkingMemory";

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
    const text = message.text?.trim();
    if (!sender || !text || !samePhone(sender, deps.ownerPhone)) return;
    let sentToolProgressReply = false;

    logger.info(`[imessage] <- sender=${sender} text=${JSON.stringify(text)}`);

    try {
      const requestContext = createAgentRequestContext({
        sender,
        chatId: message.chatId ?? undefined,
        ownerPhone: deps.ownerPhone,
      });
      const toolsets = shouldResolveMcpToolsets(text) ? await deps.resolveToolsets?.() : undefined;
      const result = await deps.agent.generate(text, {
        memory: { resource: sender, thread: "default" },
        maxSteps: deps.maxSteps,
        toolsets,
        requestContext,
        onStepFinish: async (step) => {
          logToolStep(step as StepLike);

          if (sentToolProgressReply || !(step as StepLike).toolCalls?.length) {
            return;
          }

          sentToolProgressReply = true;
          logger.info(`[imessage] -> to=${sender} text=${JSON.stringify(TOOL_PROGRESS_REPLY)}`);
          await deps.sendMessage(sender, TOOL_PROGRESS_REPLY);
        },
      });
      const reply = result.text.trim();
      if (!reply) {
        return;
      }

      logger.info(`[imessage] -> to=${sender} text=${JSON.stringify(reply)}`);
      await deps.sendMessage(sender, reply);
    } catch (error) {
      logger.error("[imessage] failed to handle direct message", error);
      const failureReply = getDirectMessageFailureReply(error);
      logger.info(`[imessage] -> to=${sender} text=${JSON.stringify(failureReply)}`);
      await deps.sendMessage(sender, failureReply);
    }
  };
}

export async function main() {
  const sdk = new IMessageSDK({
    watcher: { excludeOwnMessages: true },
  });

  const toolRuntime = createAgentToolRuntime(sdk, appConfig.tools.runtime, {
    scheduler: createSchedulingLifecycleLogger("scheduler"),
    reminders: createSchedulingLifecycleLogger("reminder"),
  });
  const builtInTools = createAgentTools(toolRuntime, appConfig.tools);
  const agent = createGeneralAgent(appConfig.agent, builtInTools);
  const mcp = createMcpRuntime(appConfig.mcp);

  const heartbeat = new HeartbeatEngine({
    agent,
    ownerPhone: appConfig.ownerPhone,
    sendMessage: async (to, text) => sdk.send(to, text),
    heartbeat: appConfig.heartbeat,
    maxSteps: appConfig.agent.maxSteps,
  });

  const onDirectMessage = createDirectMessageHandler({
    ownerPhone: appConfig.ownerPhone,
    agent,
    sendMessage: async (to, text) => sdk.send(to, text),
    resolveToolsets: mcp.getToolsets,
    maxSteps: appConfig.agent.maxSteps,
  });

  const shutdown = async () => {
    logger.info("Shutting down...");
    toolRuntime.destroy();
    heartbeat.stop();
    sdk.stopWatching();
    await mcp.client?.disconnect();
    await sdk.close();
    process.exit(0);
  };

  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());

  await sdk.startWatching({
    onDirectMessage,
    onError: (error) => logger.error("[imessage] watcher error", error),
  });

  heartbeat.start();
  logger.info("Agent started. Waiting for messages...");
}

if (import.meta.main) {
  await main();
}
