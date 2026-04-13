import { describe, expect, it } from "vitest";

import { appConfig, createAppConfig } from "../../../src/config";
import { env } from "../../../src/env";

describe("appConfig", () => {
  it("maps env-derived runtime settings into typed config slices", () => {
    expect(appConfig.ownerPhone).toBe("+819012345678");
    expect(appConfig.agent.model).toBe("openai/gpt-5.4-mini");
    expect(appConfig.agent.maxSteps).toBe(10);
    expect(appConfig.agent.maxOutputTokens).toBe(2_048);
    expect(appConfig.agent.memory.databaseUrl).toBe("file:./data/test-agent.db");
    expect(appConfig.agent.memory.lastMessages).toBe(4);
    expect(appConfig.agent.memory.observationalMemory.enabled).toBe(false);
    expect(appConfig.agent.memory.observationalMemory.model).toBe("openai/gpt-5.4-mini");
    expect(appConfig.tools.runtime.persistPath).toBe("./data/test-imessage-scheduler.json");
    expect(appConfig.tools.web.braveSearch).toBeNull();
    expect(appConfig.mcp.timeoutMs).toBe(1_000);
    expect(appConfig.mcp.servers.allium).toBeNull();
    expect(appConfig.turnkey).toEqual({
      apiBaseUrl: "https://api.turnkey.com",
      apiPublicKey: "test-turnkey-public-key",
      apiPrivateKey: "test-turnkey-private-key",
      organizationId: "test-turnkey-org",
      delegatedKeySecretNamespace: "turnkey/delegated",
    });
    expect(appConfig.hyperliquid).toEqual({
      network: "mainnet",
      isTestnet: false,
      apiUrl: "https://api.hyperliquid.xyz",
      wsUrl: "wss://api.hyperliquid.xyz/ws",
    });
  });

  it("derives Hyperliquid testnet endpoints from the network enum", () => {
    const config = createAppConfig({
      ...env,
      HYPERLIQUID_NETWORK: "testnet",
    });

    expect(config.hyperliquid).toEqual({
      network: "testnet",
      isTestnet: true,
      apiUrl: "https://api.hyperliquid-testnet.xyz",
      wsUrl: "wss://api.hyperliquid-testnet.xyz/ws",
    });
  });
});
