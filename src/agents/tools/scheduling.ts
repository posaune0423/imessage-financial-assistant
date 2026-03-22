import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { resolveRecipientAlias } from "../request-context";
import type { AgentToolRuntime } from "./runtime";

function serializeContent(content: string | { text?: string; images?: string[]; files?: string[] }) {
  if (typeof content === "string") {
    return {
      text: content,
      images: [] as string[],
      files: [] as string[],
    };
  }

  return {
    text: content.text,
    images: content.images ?? [],
    files: content.files ?? [],
  };
}

export function createSchedulingTools(runtime: AgentToolRuntime) {
  const scheduledMessageSchema = z.object({
    id: z.string(),
    type: z.enum(["once", "recurring"]),
    to: z.string(),
    sendAt: z.string(),
    status: z.enum(["pending", "sent", "failed", "cancelled"]),
    text: z.string().optional(),
    images: z.array(z.string()),
    files: z.array(z.string()),
    interval: z.union([z.enum(["hourly", "daily", "weekly", "monthly"]), z.number()]).optional(),
    nextSendAt: z.string().optional(),
    endAt: z.string().optional(),
  });

  const listScheduledMessages = () =>
    runtime.scheduler.getPending().map((item) => {
      const content = serializeContent(item.content);
      return {
        id: item.id,
        type: item.type,
        to: item.to,
        sendAt: item.sendAt.toISOString(),
        status: item.status,
        text: content.text,
        images: content.images,
        files: content.files,
        interval: item.type === "recurring" ? item.interval : undefined,
        nextSendAt: item.type === "recurring" ? item.nextSendAt.toISOString() : undefined,
        endAt: item.type === "recurring" ? item.endAt?.toISOString() : undefined,
      };
    });

  return {
    imessage_schedule_message: createTool({
      id: "imessage_schedule_message",
      description:
        "Schedule a one-time iMessage for a specific future time. Use this when the user wants a message sent later at an exact time.",
      inputSchema: z.object({
        to: z.string().min(1),
        text: z.string().min(1).optional(),
        images: z.array(z.string().min(1)).optional(),
        files: z.array(z.string().min(1)).optional(),
        sendAt: z.string().min(1),
        id: z.string().min(1).optional(),
      }),
      outputSchema: z.object({
        id: z.string(),
        sendAt: z.string(),
      }),
      execute: async ({ to, text, images, files, sendAt, id }, context) => {
        const scheduledId = runtime.scheduler.schedule({
          id,
          to: resolveRecipientAlias(to, context.requestContext),
          content: !images?.length && !files?.length ? (text ?? "") : { text, images, files },
          sendAt: new Date(sendAt),
        });
        runtime.persist();

        return {
          id: scheduledId,
          sendAt: new Date(sendAt).toISOString(),
        };
      },
    }),
    imessage_schedule_recurring_message: createTool({
      id: "imessage_schedule_recurring_message",
      description: "Schedule a recurring iMessage. Use this for every day, every week, or other repeated sends.",
      inputSchema: z.object({
        to: z.string().min(1),
        text: z.string().min(1).optional(),
        images: z.array(z.string().min(1)).optional(),
        files: z.array(z.string().min(1)).optional(),
        startAt: z.string().min(1),
        interval: z.union([z.enum(["hourly", "daily", "weekly", "monthly"]), z.number().int().positive()]),
        endAt: z.string().min(1).optional(),
        id: z.string().min(1).optional(),
      }),
      outputSchema: z.object({
        id: z.string(),
        startAt: z.string(),
        interval: z.union([z.enum(["hourly", "daily", "weekly", "monthly"]), z.number()]),
      }),
      execute: async ({ to, text, images, files, startAt, interval, endAt, id }, context) => {
        const scheduledId = runtime.scheduler.scheduleRecurring({
          id,
          to: resolveRecipientAlias(to, context.requestContext),
          content: !images?.length && !files?.length ? (text ?? "") : { text, images, files },
          startAt: new Date(startAt),
          interval,
          endAt: endAt ? new Date(endAt) : undefined,
        });
        runtime.persist();

        return {
          id: scheduledId,
          startAt: new Date(startAt).toISOString(),
          interval,
        };
      },
    }),
    imessage_list_scheduled_messages: createTool({
      id: "imessage_list_scheduled_messages",
      description:
        "List pending scheduled and recurring iMessages. Use this before cancelling or rescheduling when the user refers to an existing plan.",
      inputSchema: z.object({}),
      outputSchema: z.object({
        items: z.array(scheduledMessageSchema),
      }),
      execute: async () => ({
        items: listScheduledMessages(),
      }),
    }),
    imessage_reschedule_message: createTool({
      id: "imessage_reschedule_message",
      description: "Move a pending one-time scheduled iMessage to a new time.",
      inputSchema: z.object({
        id: z.string().min(1),
        newSendAt: z.string().min(1),
      }),
      outputSchema: z.object({
        success: z.boolean(),
        newSendAt: z.string(),
      }),
      execute: async ({ id, newSendAt }) => {
        const success = runtime.scheduler.reschedule(id, new Date(newSendAt));
        runtime.persist();
        return {
          success,
          newSendAt: new Date(newSendAt).toISOString(),
        };
      },
    }),
    imessage_cancel_scheduled_message: createTool({
      id: "imessage_cancel_scheduled_message",
      description: "Cancel a pending scheduled or recurring iMessage by id.",
      inputSchema: z.object({
        id: z.string().min(1),
      }),
      outputSchema: z.object({
        success: z.boolean(),
      }),
      execute: async ({ id }) => {
        const success = runtime.scheduler.cancel(id);
        runtime.persist();
        return { success };
      },
    }),
  };
}
