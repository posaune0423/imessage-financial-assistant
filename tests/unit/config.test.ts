import { describe, expect, it } from "vitest";

import { appConfig } from "../../src/config";

describe("appConfig", () => {
  it("maps env-derived runtime settings into typed config slices", () => {
    expect(appConfig.ownerPhone).toBe("+819012345678");
    expect(appConfig.agent.model).toBe("anthropic/claude-haiku-4-5");
    expect(appConfig.agent.maxSteps).toBe(5);
    expect(appConfig.agent.maxOutputTokens).toBe(1_024);
    expect(appConfig.agent.memory.databaseUrl).toBe("file:./data/test-agent.db");
    expect(appConfig.agent.memory.lastMessages).toBe(8);
    expect(appConfig.agent.memory.observationalMemory.enabled).toBe(false);
    expect(appConfig.agent.memory.observationalMemory.model).toBe("anthropic/claude-haiku-4-5");
    expect(appConfig.tools.runtime.persistPath).toBe("./data/test-imessage-scheduler.json");
    expect(appConfig.tools.web.braveSearch).toBeNull();
    expect(appConfig.mcp.timeoutMs).toBe(1_000);
    expect(appConfig.mcp.servers.allium).toBeNull();
  });
});
