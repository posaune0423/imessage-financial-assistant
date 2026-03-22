import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createAgentToolRuntime } from "../../src/agents/tools";
import { createAgentRequestContext } from "../../src/agents/request-context";
import { createReminderTools } from "../../src/agents/tools/reminder";
import { createSchedulingTools } from "../../src/agents/tools/scheduling";
import type { ToolRuntimeConfig } from "../../src/config";

const tempDirs: string[] = [];

afterEach(() => {
  vi.useRealTimers();

  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("createAgentToolRuntime", () => {
  it("persists scheduler and reminder state to disk", () => {
    const dir = mkdtempSync(join(tmpdir(), "tool-runtime-"));
    tempDirs.push(dir);
    const filePath = join(dir, "scheduler.json");
    const sdk = {
      send: vi.fn().mockResolvedValue({
        sentAt: new Date("2026-03-22T00:00:00.000Z"),
      }),
    } as never;
    const config: ToolRuntimeConfig = {
      persistPath: filePath,
      debug: false,
    };

    const runtime = createAgentToolRuntime(sdk, config);
    runtime.scheduler.schedule({
      to: "+819012345678",
      content: "Follow up",
      sendAt: new Date("2099-03-22T01:00:00.000Z"),
      id: "scheduled-1",
    });
    runtime.reminders.exact(new Date("2099-03-22T02:00:00.000Z"), "+819012345678", "Wake up", { id: "reminder-1" });
    runtime.persist();
    runtime.destroy();

    const saved = JSON.parse(readFileSync(filePath, "utf8")) as {
      scheduled: {
        scheduled: Array<{ id: string }>;
      };
      reminders: Array<{ id: string }>;
    };

    expect(saved.scheduled.scheduled[0]?.id).toBe("scheduled-1");
    expect(saved.reminders[0]?.id).toBe("reminder-1");
  });

  it("fires scheduler and reminder lifecycle callbacks when items become due", async () => {
    vi.useFakeTimers();

    const dir = mkdtempSync(join(tmpdir(), "tool-runtime-events-"));
    tempDirs.push(dir);
    const filePath = join(dir, "scheduler.json");
    const send = vi.fn().mockResolvedValue({
      sentAt: new Date("2026-03-22T00:00:00.000Z"),
      message: { guid: "guid-1" },
    });
    const schedulerSent = vi.fn();
    const reminderSent = vi.fn();

    const runtime = createAgentToolRuntime(
      { send } as never,
      {
        persistPath: filePath,
        debug: false,
      },
      {
        scheduler: {
          onSent: schedulerSent,
        },
        reminders: {
          onSent: reminderSent,
        },
      },
    );

    runtime.scheduler.schedule({
      to: "+819012345678",
      content: "Follow up",
      sendAt: new Date(Date.now() + 1_000),
      id: "scheduled-1",
    });
    runtime.reminders.exact(new Date(Date.now() + 1_000), "+819012345678", "Wake up", { id: "reminder-1" });

    await vi.advanceTimersByTimeAsync(1_100);

    expect(send).toHaveBeenCalledTimes(2);
    expect(schedulerSent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "scheduled-1",
        type: "once",
        to: "+819012345678",
      }),
      expect.objectContaining({
        sentAt: expect.any(Date),
      }),
    );
    expect(reminderSent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "reminder-1",
        type: "once",
        to: "+819012345678",
      }),
      expect.objectContaining({
        sentAt: expect.any(Date),
      }),
    );

    runtime.destroy();
  });

  it("resolves current-user aliases before due scheduler and reminder sends", async () => {
    vi.useFakeTimers();

    const dir = mkdtempSync(join(tmpdir(), "tool-runtime-aliases-"));
    tempDirs.push(dir);
    const filePath = join(dir, "scheduler.json");
    const send = vi.fn().mockResolvedValue({
      sentAt: new Date("2026-03-22T00:00:00.000Z"),
      message: { guid: "guid-1" },
    });

    const runtime = createAgentToolRuntime({ send } as never, {
      persistPath: filePath,
      debug: false,
    });
    const schedulingTools = createSchedulingTools(runtime);
    const reminderTools = createReminderTools(runtime);
    const requestContext = createAgentRequestContext({
      sender: "+819012345678",
      ownerPhone: "+819012345678",
    });

    await schedulingTools.imessage_schedule_message.execute?.(
      {
        to: "me",
        text: "Follow up",
        sendAt: new Date(Date.now() + 1_000).toISOString(),
      },
      { requestContext } as never,
    );
    await reminderTools.imessage_set_reminder_exact.execute?.(
      {
        to: "me",
        message: "Wake up",
        date: new Date(Date.now() + 1_000).toISOString(),
      },
      { requestContext } as never,
    );

    await vi.advanceTimersByTimeAsync(1_100);

    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(1, "+819012345678", "Follow up");
    expect(send).toHaveBeenNthCalledWith(2, "+819012345678", "⏰ Reminder: Wake up");

    runtime.destroy();
  });
});
