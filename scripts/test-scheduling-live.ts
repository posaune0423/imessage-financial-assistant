import { join } from "node:path";
import { tmpdir } from "node:os";

import { IMessageSDK } from "@photon-ai/imessage-kit";
import type { RecurringMessage, ScheduledMessage } from "@photon-ai/imessage-kit";

import { createAgentToolRuntime } from "../src/agents/tools";

const ownerPhone = process.env.OWNER_PHONE?.trim();
if (!ownerPhone) {
  throw new Error("OWNER_PHONE is required to run the live scheduling test.");
}

const scheduleDelayMs = Number.parseInt(process.env.TEST_SCHEDULE_DELAY_MS ?? "5000", 10);
const reminderDelayMs = Number.parseInt(process.env.TEST_REMINDER_DELAY_MS ?? "9000", 10);
const settleMs = Number.parseInt(process.env.TEST_SCHEDULING_SETTLE_MS ?? "7000", 10);

if (!Number.isFinite(scheduleDelayMs) || scheduleDelayMs < 1000) {
  throw new Error("TEST_SCHEDULE_DELAY_MS must be a number >= 1000.");
}

if (!Number.isFinite(reminderDelayMs) || reminderDelayMs <= scheduleDelayMs) {
  throw new Error("TEST_REMINDER_DELAY_MS must be a number greater than TEST_SCHEDULE_DELAY_MS.");
}

const runId = `${Date.now()}`;
const persistPath = join(tmpdir(), `imessage-scheduling-live-${runId}.json`);
const sdk = new IMessageSDK();

function createDeferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

function log(message: string) {
  console.log(`[live-scheduling-test] ${message}`);
}

function describeMessage(message: ScheduledMessage | RecurringMessage) {
  return `id=${message.id} type=${message.type} to=${message.to}`;
}

async function waitForWithTimeout(label: string, promise: Promise<void>, timeoutMs: number) {
  const timeout = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} did not fire within ${timeoutMs}ms.`));
    }, timeoutMs);

    promise.finally(() => clearTimeout(timer)).catch(() => clearTimeout(timer));
  });

  await Promise.race([promise, timeout]);
}

const scheduledDelivered = createDeferred();
const reminderDelivered = createDeferred();

const runtime = createAgentToolRuntime(
  sdk,
  {
    persistPath,
    debug: true,
  },
  {
    scheduler: {
      onSent: (message) => {
        log(`[scheduler] sent ${describeMessage(message)}`);
        if (message.id === scheduledId) {
          scheduledDelivered.resolve();
        }
      },
      onError: (message, error) => {
        log(`[scheduler] failed ${describeMessage(message)} error=${error.message}`);
        if (message.id === scheduledId) {
          scheduledDelivered.reject(error);
        }
      },
      onComplete: (message) => log(`[scheduler] completed id=${message.id} sends=${message.sendCount}`),
    },
    reminders: {
      onSent: (message) => {
        log(`[reminder] sent ${describeMessage(message)}`);
        if (message.id === reminderId) {
          reminderDelivered.resolve();
        }
      },
      onError: (message, error) => {
        log(`[reminder] failed ${describeMessage(message)} error=${error.message}`);
        if (message.id === reminderId) {
          reminderDelivered.reject(error);
        }
      },
      onComplete: (message) => log(`[reminder] completed id=${message.id} sends=${message.sendCount}`),
    },
  },
);

const scheduledAt = new Date(Date.now() + scheduleDelayMs);
const reminderAt = new Date(Date.now() + reminderDelayMs);
const scheduledId = `live-scheduled-${runId}`;
const reminderId = `live-reminder-${runId}`;

log(`target=${ownerPhone}`);
log(`persistPath=${persistPath}`);
log(`scheduling one-time message for ${scheduledAt.toISOString()}`);
runtime.scheduler.schedule({
  id: scheduledId,
  to: ownerPhone,
  content: `[schedule-test ${runId}] scheduled message fired`,
  sendAt: scheduledAt,
});

log(`scheduling reminder for ${reminderAt.toISOString()}`);
runtime.reminders.exact(reminderAt, ownerPhone, `[reminder-test ${runId}] reminder fired`, {
  id: reminderId,
});

const waitMs = reminderDelayMs + settleMs;
log(`waiting up to ${waitMs}ms for both deliveries...`);

try {
  await waitForWithTimeout("scheduled message", scheduledDelivered.promise, waitMs);
  await waitForWithTimeout("reminder", reminderDelivered.promise, waitMs);
  const pendingScheduled = runtime.scheduler.getPending();
  const pendingReminders = runtime.reminders.list();

  log(`pending scheduled count=${pendingScheduled.length}`);
  log(`pending reminder count=${pendingReminders.length}`);

  if (pendingScheduled.length > 0) {
    log(`pending scheduled ids=${pendingScheduled.map((item) => item.id).join(",")}`);
  }

  if (pendingReminders.length > 0) {
    log(`pending reminder ids=${pendingReminders.map((item) => item.id).join(",")}`);
  }
} finally {
  runtime.destroy();
  await sdk.close();
  log("finished");
}
