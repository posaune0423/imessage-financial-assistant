import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { MessageScheduler, Reminders } from "@photon-ai/imessage-kit";
import type {
  IMessageSDK,
  Reminder,
  RecurringMessage,
  ScheduledMessage,
  SchedulerEvents,
} from "@photon-ai/imessage-kit";

import type { ToolRuntimeConfig } from "../../config";
import { logger } from "../../utils/logger";

interface PersistedSchedulingState {
  scheduled?: {
    scheduled?: ScheduledMessage[];
    recurring?: RecurringMessage[];
  };
  reminders?: Array<{
    id: string;
    to: string;
    message: string;
    scheduledFor: string;
    createdAt: string;
  }>;
}

const noop = () => {};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export interface AgentToolRuntime {
  sdk: IMessageSDK;
  scheduler: MessageScheduler;
  reminders: Reminders;
  persist: () => void;
  destroy: () => void;
}

export interface AgentToolRuntimeEvents {
  scheduler?: SchedulerEvents;
  reminders?: SchedulerEvents;
}

function readState(filePath: string): PersistedSchedulingState {
  if (!existsSync(filePath)) {
    return {};
  }

  try {
    const raw = readFileSync(filePath, "utf8").trim();
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? (parsed as PersistedSchedulingState) : {};
  } catch (error) {
    logger.warn("[scheduler] failed to read persisted state", error);
    return {};
  }
}

function writeState(filePath: string, state: PersistedSchedulingState) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function serializeReminder(reminder: Reminder) {
  return {
    id: reminder.id,
    to: reminder.to,
    message: reminder.message,
    scheduledFor: reminder.scheduledFor.toISOString(),
    createdAt: reminder.createdAt.toISOString(),
  };
}

function rehydrateState(filePath: string, scheduler: MessageScheduler, reminders: Reminders) {
  const state = readState(filePath);
  if (state.scheduled) {
    scheduler.import({
      scheduled:
        state.scheduled.scheduled?.map((item) => ({
          ...item,
          sendAt: new Date(item.sendAt),
          createdAt: new Date(item.createdAt),
        })) ?? [],
      recurring:
        state.scheduled.recurring?.map((item) => ({
          ...item,
          sendAt: new Date(item.sendAt),
          nextSendAt: new Date(item.nextSendAt),
          createdAt: new Date(item.createdAt),
          endAt: item.endAt ? new Date(item.endAt) : undefined,
        })) ?? [],
    });
  }

  for (const reminder of state.reminders ?? []) {
    const scheduledFor = new Date(reminder.scheduledFor);
    if (Number.isNaN(scheduledFor.getTime()) || scheduledFor.getTime() <= Date.now()) {
      continue;
    }

    reminders.exact(scheduledFor, reminder.to, reminder.message, { id: reminder.id });
  }
}

function runLifecycleCallback(callback: (() => void) | undefined, label: string) {
  try {
    callback?.();
  } catch (error) {
    logger.error(`[scheduler] ${label} callback failed`, error);
  }
}

export function createAgentToolRuntime(
  sdk: IMessageSDK,
  config: ToolRuntimeConfig,
  events?: AgentToolRuntimeEvents,
): AgentToolRuntime {
  const filePath = config.persistPath;
  let persist = noop;

  const scheduler = new MessageScheduler(
    sdk,
    { debug: config.debug },
    {
      onSent: (message, result) => {
        persist();
        runLifecycleCallback(() => events?.scheduler?.onSent?.(message, result), "scheduler.onSent");
      },
      onError: (message, error) => {
        persist();
        runLifecycleCallback(() => events?.scheduler?.onError?.(message, error), "scheduler.onError");
      },
      onComplete: (message) => {
        persist();
        runLifecycleCallback(() => events?.scheduler?.onComplete?.(message), "scheduler.onComplete");
      },
    },
  );

  const reminders = new Reminders(sdk, {
    onSent: (message, result) => {
      persist();
      runLifecycleCallback(() => events?.reminders?.onSent?.(message, result), "reminders.onSent");
    },
    onError: (message, error) => {
      persist();
      runLifecycleCallback(() => events?.reminders?.onError?.(message, error), "reminders.onError");
    },
    onComplete: (message) => {
      persist();
      runLifecycleCallback(() => events?.reminders?.onComplete?.(message), "reminders.onComplete");
    },
  });

  persist = () => {
    writeState(filePath, {
      scheduled: scheduler.export(),
      reminders: reminders.list().map(serializeReminder),
    });
  };

  rehydrateState(filePath, scheduler, reminders);

  return {
    sdk,
    scheduler,
    reminders,
    persist,
    destroy: () => {
      persist();
      reminders.destroy();
      scheduler.destroy();
    },
  };
}
