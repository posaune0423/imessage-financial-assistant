import { afterEach, describe, expect, it, vi } from "vitest";

import { env } from "../../../src/env";

afterEach(() => {
  delete process.env.MULTI_USER_MODE;
});

describe("env", () => {
  it("has required fields populated", () => {
    expect(env.OPENAI_API_KEY).toBeDefined();
    expect(env.OWNER_PHONE).toBeDefined();
    expect(env.TURNKEY_API_BASE_URL).toBe("https://api.turnkey.com");
    expect(env.TURNKEY_API_PUBLIC_KEY).toBe("test-turnkey-public-key");
    expect(env.TURNKEY_API_PRIVATE_KEY).toBe("test-turnkey-private-key");
    expect(env.TURNKEY_ORGANIZATION_ID).toBe("test-turnkey-org");
    expect(env.HYPERLIQUID_NETWORK).toBe("mainnet");
  });

  it("applies defaults for optional fields (test setup overrides some)", () => {
    expect(env.OPENAI_MODEL).toBe("openai/gpt-5.4-mini");
    // setup.ts overrides these for test safety
    expect(env.DATABASE_URL).toBe("file:./data/test-agent.db");
    expect(env.IMESSAGE_SCHEDULER_PERSIST_PATH).toBe("./data/test-imessage-scheduler.json");
    expect(env.LOG_LEVEL).toBe("error");
  });

  it('parses MULTI_USER_MODE="false" as false', async () => {
    process.env.MULTI_USER_MODE = "false";
    vi.resetModules();
    const { env: reloadedEnv } = await import("../../../src/env");

    expect(reloadedEnv.MULTI_USER_MODE).toBe(false);
  });
});
