import { describe, expect, it } from "vitest";

import { HyperliquidService } from "../../../../src/lib/hyperliquid/service";

describe("HyperliquidService", () => {
  it("builds the transport in testnet mode when configured", () => {
    const service = new HyperliquidService(
      {
        network: "testnet",
        isTestnet: true,
        apiUrl: "https://api.hyperliquid-testnet.xyz",
        wsUrl: "wss://api.hyperliquid-testnet.xyz/ws",
      },
      {
        createSignerClient: async () => {
          throw new Error("not used in this test");
        },
      },
    );

    const transport = (service as unknown as { transport: { isTestnet: boolean; apiUrl: string | URL } }).transport;

    expect(transport.isTestnet).toBe(true);
    expect(String(transport.apiUrl)).toBe("https://api.hyperliquid-testnet.xyz");
  });
});
