import { describe, expect, it, vi } from "vitest";

import { HeartbeatEngine, isHeartbeatActive } from "../../../src/agents/heartbeat";

const heartbeat = {
  intervalMs: 60_000,
  activeStart: "08:00",
  activeEnd: "22:00",
} as const;

describe("HeartbeatEngine", () => {
  it("returns silent when the agent says HEARTBEAT_OK", async () => {
    const sendMessage = vi.fn();
    const generate = vi.fn().mockResolvedValue({ text: "HEARTBEAT_OK" });
    const engine = new HeartbeatEngine({
      ownerPhone: "+819012345678",
      heartbeat,
      sendMessage,
      agent: {
        generate,
      },
    });

    await expect(engine.tick(new Date("2026-03-21T09:00:00+09:00"))).resolves.toBe("silent");
    expect(sendMessage).not.toHaveBeenCalled();
    const requestContext = generate.mock.calls[0]?.[1]?.requestContext;
    expect(requestContext?.get("isHeartbeat")).toBe(true);
    expect(requestContext?.get("sender")).toBe("+819012345678");
    expect(requestContext?.get("ownerPhone")).toBe("+819012345678");
  });

  it("returns silent when malformed heartbeat output still contains HEARTBEAT_OK", async () => {
    const sendMessage = vi.fn();
    const engine = new HeartbeatEngine({
      ownerPhone: "+819012345678",
      heartbeat,
      sendMessage,
      agent: {
        generate: vi
          .fn()
          .mockResolvedValue({ text: "Let me check for any pending reminders or scheduled messages.HEARTBEAT_OK" }),
      },
    });

    await expect(engine.tick(new Date("2026-03-21T09:00:00+09:00"))).resolves.toBe("silent");
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("sends a heartbeat message when the agent returns actionable text", async () => {
    const sendMessage = vi.fn();
    const engine = new HeartbeatEngine({
      ownerPhone: "+819012345678",
      heartbeat,
      sendMessage,
      agent: {
        generate: vi.fn().mockResolvedValue({ text: "Stand up and stretch." }),
      },
    });

    await expect(engine.tick(new Date("2026-03-21T09:00:00+09:00"))).resolves.toBe("sent");
    expect(sendMessage).toHaveBeenCalledWith("+819012345678", "Stand up and stretch.");
  });
});

describe("isHeartbeatActive", () => {
  it("supports a normal daytime window", () => {
    expect(isHeartbeatActive(new Date("2026-03-21T09:00:00+09:00"), "08:00", "22:00")).toBe(true);
    expect(isHeartbeatActive(new Date("2026-03-21T23:00:00+09:00"), "08:00", "22:00")).toBe(false);
  });
});
