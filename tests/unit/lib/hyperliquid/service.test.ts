import { describe, expect, it, vi } from "vitest";

import { HyperliquidService } from "../../../../src/lib/hyperliquid/service";

const callMock = vi.fn();

vi.mock("viem", async () => {
  const actual = await vi.importActual<typeof import("viem")>("viem");
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      call: callMock,
    })),
  };
});

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

  it("reads Hyperliquid spot USDC balances from the HyperCore precompile", async () => {
    callMock.mockResolvedValueOnce({
      data: "0x0000000000000000000000000000000000000000000000000000000005f5e10000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
    });

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

    await expect(service.getSpotBalance("0x0f79aE66c53EF40D03292407C4b5530da6A5BDAB")).resolves.toEqual({
      network: "testnet",
      address: "0x0f79aE66c53EF40D03292407C4b5530da6A5BDAB",
      token: {
        index: 0,
        symbol: "USDC",
        decimals: 8,
      },
      balance: {
        raw: "100000000",
        formatted: "1",
        heldRaw: "0",
        heldFormatted: "0",
        availableRaw: "100000000",
        availableFormatted: "1",
        entryNtlRaw: "0",
        entryNtlFormatted: "0",
      },
    });
  });
});
