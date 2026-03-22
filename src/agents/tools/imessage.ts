import { createTool } from "@mastra/core/tools";
import type { RequestContext } from "@mastra/core/request-context";
import { z } from "zod";

import { isHeartbeatRequest, resolveRecipientAlias } from "../request-context";
import { logger } from "../../utils/logger";
import type { AgentToolRuntime } from "./runtime";

const sendPayloadSchema = z.object({
  to: z.string().min(1),
  text: z.string().min(1).optional(),
  images: z.array(z.string().min(1)).optional(),
  files: z.array(z.string().min(1)).optional(),
});

const sendResultSchema = z.object({
  sentAt: z.string(),
  hasMessage: z.boolean(),
});

const chatSummarySchema = z.object({
  chatId: z.string(),
  displayName: z.string().nullable(),
  lastMessageAt: z.string().nullable(),
  isGroup: z.boolean(),
  unreadCount: z.number(),
});

const messageSchema = z.object({
  id: z.string(),
  guid: z.string(),
  text: z.string().nullable(),
  sender: z.string(),
  senderName: z.string().nullable(),
  chatId: z.string(),
  isGroupChat: z.boolean(),
  service: z.enum(["iMessage", "SMS", "RCS"]),
  isRead: z.boolean(),
  isFromMe: z.boolean(),
  isReaction: z.boolean(),
  reactionType: z.enum(["love", "like", "dislike", "laugh", "emphasize", "question"]).nullable(),
  isReactionRemoval: z.boolean(),
  associatedMessageGuid: z.string().nullable(),
  attachmentCount: z.number(),
  date: z.string(),
});

function serializeMessage(message: {
  id: string;
  guid: string;
  text: string | null;
  sender: string;
  senderName: string | null;
  chatId: string;
  isGroupChat: boolean;
  service: "iMessage" | "SMS" | "RCS";
  isRead: boolean;
  isFromMe: boolean;
  isReaction: boolean;
  reactionType: "love" | "like" | "dislike" | "laugh" | "emphasize" | "question" | null;
  isReactionRemoval: boolean;
  associatedMessageGuid: string | null;
  attachments: readonly unknown[];
  date: Date;
}) {
  return {
    id: message.id,
    guid: message.guid,
    text: message.text,
    sender: message.sender,
    senderName: message.senderName,
    chatId: message.chatId,
    isGroupChat: message.isGroupChat,
    service: message.service,
    isRead: message.isRead,
    isFromMe: message.isFromMe,
    isReaction: message.isReaction,
    reactionType: message.reactionType,
    isReactionRemoval: message.isReactionRemoval,
    associatedMessageGuid: message.associatedMessageGuid,
    attachmentCount: message.attachments.length,
    date: message.date.toISOString(),
  };
}

function createSuppressedSendResult() {
  return {
    sentAt: new Date().toISOString(),
    hasMessage: false,
  };
}

function serializeSendResult(result: { sentAt: Date; message?: unknown }) {
  return {
    sentAt: result.sentAt.toISOString(),
    hasMessage: Boolean(result.message),
  };
}

function isSuppressedHeartbeatSend(toolId: string, recipient: string, requestContext?: RequestContext) {
  if (!isHeartbeatRequest(requestContext)) {
    return false;
  }

  logger.info(`[heartbeat] suppressed immediate ${toolId} to=${recipient}`);
  return true;
}

function createSuppressedBatchResult(messages: Array<{ to: string }>) {
  return {
    results: messages.map((message) => ({
      to: message.to,
      success: false,
      error: "suppressed during heartbeat",
    })),
  };
}

async function executeImmediateSend(
  toolId: string,
  to: string,
  requestContext: RequestContext | undefined,
  send: (recipient: string) => Promise<{ sentAt: Date; message?: unknown }>,
) {
  const recipient = resolveRecipientAlias(to, requestContext);
  if (isSuppressedHeartbeatSend(toolId, recipient, requestContext)) {
    return createSuppressedSendResult();
  }

  return serializeSendResult(await send(recipient));
}

export function createIMessageTools(runtime: AgentToolRuntime) {
  return {
    imessage_send_message: createTool({
      id: "imessage_send_message",
      description: "Send a plain text iMessage to a phone number, email address, or chatId.",
      inputSchema: z.object({
        to: z.string().min(1),
        text: z.string().min(1),
      }),
      outputSchema: sendResultSchema,
      execute: async ({ to, text }, context) =>
        executeImmediateSend("imessage_send_message", to, context.requestContext, async (recipient) =>
          runtime.sdk.send(recipient, text),
        ),
    }),
    imessage_send_media: createTool({
      id: "imessage_send_media",
      description:
        "Send an iMessage with optional text plus image URLs/paths and file paths. Use this for attachments or mixed media.",
      inputSchema: sendPayloadSchema,
      outputSchema: sendResultSchema,
      execute: async ({ to, text, images, files }, context) =>
        executeImmediateSend("imessage_send_media", to, context.requestContext, async (recipient) =>
          runtime.sdk.send(recipient, {
            text,
            images,
            files,
          }),
        ),
    }),
    imessage_send_file: createTool({
      id: "imessage_send_file",
      description: "Send a single file to a phone number, email address, or chatId.",
      inputSchema: z.object({
        to: z.string().min(1),
        filePath: z.string().min(1),
        text: z.string().min(1).optional(),
      }),
      outputSchema: sendResultSchema,
      execute: async ({ to, filePath, text }, context) =>
        executeImmediateSend("imessage_send_file", to, context.requestContext, async (recipient) =>
          runtime.sdk.sendFile(recipient, filePath, text),
        ),
    }),
    imessage_send_files: createTool({
      id: "imessage_send_files",
      description: "Send multiple files to a phone number, email address, or chatId.",
      inputSchema: z.object({
        to: z.string().min(1),
        filePaths: z.array(z.string().min(1)).min(1),
        text: z.string().min(1).optional(),
      }),
      outputSchema: sendResultSchema,
      execute: async ({ to, filePaths, text }, context) =>
        executeImmediateSend("imessage_send_files", to, context.requestContext, async (recipient) =>
          runtime.sdk.sendFiles(recipient, filePaths, text),
        ),
    }),
    imessage_send_batch: createTool({
      id: "imessage_send_batch",
      description:
        "Send multiple iMessages concurrently. Use this only when the user explicitly wants multiple outbound messages.",
      inputSchema: z.object({
        messages: z
          .array(
            z.object({
              to: z.string().min(1),
              text: z.string().min(1).optional(),
              images: z.array(z.string().min(1)).optional(),
              files: z.array(z.string().min(1)).optional(),
            }),
          )
          .min(1),
      }),
      outputSchema: z.object({
        results: z.array(
          z.object({
            to: z.string(),
            success: z.boolean(),
            error: z.string().optional(),
          }),
        ),
      }),
      execute: async ({ messages }, context) => {
        const resolvedMessages = messages.map((message) => ({
          ...message,
          to: resolveRecipientAlias(message.to, context.requestContext),
        }));

        if (isHeartbeatRequest(context.requestContext)) {
          logger.info(`[heartbeat] suppressed immediate imessage_send_batch count=${resolvedMessages.length}`);
          return createSuppressedBatchResult(resolvedMessages);
        }

        const results = await runtime.sdk.sendBatch(
          resolvedMessages.map((message) => ({
            to: message.to,
            content:
              !message.images?.length && !message.files?.length
                ? (message.text ?? "")
                : {
                    text: message.text,
                    images: message.images,
                    files: message.files,
                  },
          })),
        );

        return {
          results: results.map((result) => ({
            to: result.to,
            success: result.success,
            error: result.error?.message,
          })),
        };
      },
    }),
    imessage_get_messages: createTool({
      id: "imessage_get_messages",
      description:
        "Search iMessage history by sender, chat, unread status, search term, and time range. Use this before cancelling or changing an existing promise if you need message context.",
      inputSchema: z.object({
        sender: z.string().min(1).optional(),
        chatId: z.string().min(1).optional(),
        unreadOnly: z.boolean().optional(),
        since: z.string().min(1).optional(),
        search: z.string().min(1).optional(),
        limit: z.number().int().positive().max(100).optional(),
      }),
      outputSchema: z.object({
        total: z.number(),
        unreadCount: z.number(),
        messages: z.array(messageSchema),
      }),
      execute: async ({ sender, chatId, unreadOnly, since, search, limit }) => {
        const result = await runtime.sdk.getMessages({
          sender,
          chatId,
          unreadOnly,
          since: since ? new Date(since) : undefined,
          search,
          limit,
        });

        return {
          total: result.total,
          unreadCount: result.unreadCount,
          messages: result.messages.map(serializeMessage),
        };
      },
    }),
    imessage_get_unread_messages: createTool({
      id: "imessage_get_unread_messages",
      description: "Get unread iMessages grouped by sender.",
      inputSchema: z.object({}),
      outputSchema: z.object({
        total: z.number(),
        senderCount: z.number(),
        groups: z.array(
          z.object({
            sender: z.string(),
            count: z.number(),
          }),
        ),
      }),
      execute: async () => {
        const result = await runtime.sdk.getUnreadMessages();
        return {
          total: result.total,
          senderCount: result.senderCount,
          groups: result.groups.map((group) => ({
            sender: group.sender,
            count: group.messages.length,
          })),
        };
      },
    }),
    imessage_list_chats: createTool({
      id: "imessage_list_chats",
      description:
        "List iMessage chats and groups with filtering. Use this to discover chatId before sending to a group or ambiguous contact.",
      inputSchema: z.object({
        type: z.enum(["all", "group", "dm"]).optional(),
        hasUnread: z.boolean().optional(),
        sortBy: z.enum(["recent", "name"]).optional(),
        search: z.string().min(1).optional(),
        limit: z.number().int().positive().max(100).optional(),
      }),
      outputSchema: z.object({
        chats: z.array(chatSummarySchema),
      }),
      execute: async ({ type, hasUnread, sortBy, search, limit }) => {
        const chats = await runtime.sdk.listChats({
          type,
          hasUnread,
          sortBy,
          search,
          limit,
        });

        return {
          chats: chats.map((chat) => ({
            chatId: chat.chatId,
            displayName: chat.displayName,
            lastMessageAt: chat.lastMessageAt?.toISOString() ?? null,
            isGroup: chat.isGroup,
            unreadCount: chat.unreadCount,
          })),
        };
      },
    }),
  };
}
