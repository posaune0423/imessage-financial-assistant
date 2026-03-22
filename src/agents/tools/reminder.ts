import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { resolveRecipientAlias } from "../request-context";
import type { AgentToolRuntime } from "./runtime";

export function createReminderTools(runtime: AgentToolRuntime) {
  const reminderSchema = z.object({
    id: z.string(),
    to: z.string(),
    message: z.string(),
    scheduledFor: z.string(),
    createdAt: z.string(),
  });

  const listReminders = () =>
    runtime.reminders.list().map((item) => ({
      id: item.id,
      to: item.to,
      message: item.message,
      scheduledFor: item.scheduledFor.toISOString(),
      createdAt: item.createdAt.toISOString(),
    }));

  return {
    imessage_set_reminder_in: createTool({
      id: "imessage_set_reminder_in",
      description:
        "Set a reminder using a relative time expression like '5 minutes' or '2 hours'. Use this for natural follow-up reminders.",
      inputSchema: z.object({
        duration: z.string().min(1),
        to: z.string().min(1),
        message: z.string().min(1),
        emoji: z.string().min(1).optional(),
      }),
      outputSchema: z.object({
        id: z.string(),
      }),
      execute: async ({ duration, to, message, emoji }, context) => {
        const id = runtime.reminders.in(duration, resolveRecipientAlias(to, context.requestContext), message, {
          emoji,
        });
        runtime.persist();
        return { id };
      },
    }),
    imessage_set_reminder_at: createTool({
      id: "imessage_set_reminder_at",
      description:
        "Set a reminder using a natural language time like 'tomorrow 9am' or 'friday 2pm'. Use this when the user speaks naturally about time.",
      inputSchema: z.object({
        timeExpression: z.string().min(1),
        to: z.string().min(1),
        message: z.string().min(1),
        emoji: z.string().min(1).optional(),
      }),
      outputSchema: z.object({
        id: z.string(),
      }),
      execute: async ({ timeExpression, to, message, emoji }, context) => {
        const id = runtime.reminders.at(timeExpression, resolveRecipientAlias(to, context.requestContext), message, {
          emoji,
        });
        runtime.persist();
        return { id };
      },
    }),
    imessage_set_reminder_exact: createTool({
      id: "imessage_set_reminder_exact",
      description: "Set a reminder at an exact ISO date-time.",
      inputSchema: z.object({
        date: z.string().min(1),
        to: z.string().min(1),
        message: z.string().min(1),
        emoji: z.string().min(1).optional(),
      }),
      outputSchema: z.object({
        id: z.string(),
      }),
      execute: async ({ date, to, message, emoji }, context) => {
        const id = runtime.reminders.exact(new Date(date), resolveRecipientAlias(to, context.requestContext), message, {
          emoji,
        });
        runtime.persist();
        return { id };
      },
    }),
    imessage_list_reminders: createTool({
      id: "imessage_list_reminders",
      description: "List pending reminders that were created for later follow-up.",
      inputSchema: z.object({}),
      outputSchema: z.object({
        items: z.array(reminderSchema),
      }),
      execute: async () => ({
        items: listReminders(),
      }),
    }),
    imessage_cancel_reminder: createTool({
      id: "imessage_cancel_reminder",
      description: "Cancel a reminder by id.",
      inputSchema: z.object({
        id: z.string().min(1),
      }),
      outputSchema: z.object({
        success: z.boolean(),
      }),
      execute: async ({ id }) => {
        const success = runtime.reminders.cancel(id);
        runtime.persist();
        return { success };
      },
    }),
  };
}
