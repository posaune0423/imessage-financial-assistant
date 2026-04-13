import { describe, expect, it } from "vitest";

import { env } from "../../../src/env";

describe("env", () => {
  it("has required fields populated", () => {
    expect(env.ANTHROPIC_API_KEY).toBeDefined();
    expect(env.OWNER_PHONE).toBeDefined();
    expect(env.TURNKEY_API_BASE_URL).toBe("https://api.turnkey.com");
    expect(env.TURNKEY_API_PUBLIC_KEY).toBe("test-turnkey-public-key");
    expect(env.TURNKEY_API_PRIVATE_KEY).toBe("test-turnkey-private-key");
    expect(env.TURNKEY_ORGANIZATION_ID).toBe("test-turnkey-org");
    expect(env.HYPERLIQUID_NETWORK).toBe("mainnet");
  });

  it("applies defaults for optional fields (test setup overrides some)", () => {
    expect(env.ANTHROPIC_MODEL).toBe("anthropic/claude-haiku-4-5");
    // setup.ts overrides these for test safety
    expect(env.DATABASE_URL).toBe("file:./data/test-agent.db");
    expect(env.IMESSAGE_SCHEDULER_PERSIST_PATH).toBe("./data/test-imessage-scheduler.json");
    expect(env.LOG_LEVEL).toBe("error");
  });
});
