import { describe, expect, it } from "vitest";

import { loadTextFile } from "../../../src/utils/fs";

describe("agent markdown files", () => {
  it("loads SOUL.md from src/agents", () => {
    const soul = loadTextFile(new URL("../../../src/agents/SOUL.md", import.meta.url));
    expect(soul).toContain("personal assistant");
    expect(soul).toContain("scheduled message");
    expect(soul).toContain("brave-search");
    expect(soul).toContain("MCP tools");
    expect(soul).toContain("IMESSAGE-SAFE TEXT ONLY");
    expect(soul).toContain("Markdown emphasis such as **bold**");
    expect(soul).toContain("They can lead short sections or status lines");
    expect(soul).toContain("browse/search");
    expect(soul).toContain("generic Hyperliquid InfoClient or ExchangeClient tool");
    expect(soul).toContain("Never dump raw API payloads");
    expect(soul).toContain("returns an explorer URL");
  });

  it("loads HEARTBEAT.md from src/agents", () => {
    const heartbeat = loadTextFile(new URL("../../../src/agents/HEARTBEAT.md", import.meta.url));
    expect(heartbeat).toContain("HEARTBEAT_OK");
    expect(heartbeat).toContain("scheduling");
    expect(heartbeat).toContain("brave-search");
    expect(heartbeat).toContain("Do not use immediate `imessage_send_*` tools during heartbeat.");
    expect(heartbeat).toContain("Emoji can lead short status lines");
  });
});
