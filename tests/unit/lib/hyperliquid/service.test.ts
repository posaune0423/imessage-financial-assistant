import { describe, expect, it, vi } from "vitest";

import { HyperliquidService } from "../../../../src/lib/hyperliquid/service";

const explorerMocks = vi.hoisted(() => ({
  explorerCloseMock: vi.fn().mockResolvedValue(undefined),
  explorerReadyMock: vi.fn().mockRejectedValue(new Error("explorer disabled")),
  explorerTxsMock: vi.fn(),
}));

const callMock = vi.fn();
const spotMetaMock = vi.fn();
const metaMock = vi.fn();
const metaAndAssetCtxsMock = vi.fn();
const spotMetaAndAssetCtxsMock = vi.fn();
const allMidsMock = vi.fn();
const clearinghouseStateMock = vi.fn();
const exchangeOrderMock = vi.fn();
const exchangeUsdSendMock = vi.fn();
const exchangeSpotSendMock = vi.fn();
const toWord = (value: bigint) => value.toString(16).padStart(64, "0");

function encodeBalanceResult(total: bigint, hold: bigint, entryNtl: bigint) {
  return `0x${toWord(total)}${toWord(hold)}${toWord(entryNtl)}`;
}

vi.mock("@nktkas/hyperliquid", async () => {
  const actual = await vi.importActual<typeof import("@nktkas/hyperliquid")>("@nktkas/hyperliquid");
  class MockInfoClient {
    allMids = allMidsMock;
    clearinghouseState = clearinghouseStateMock;
    meta = metaMock;
    metaAndAssetCtxs = metaAndAssetCtxsMock;
    spotMeta = spotMetaMock;
    spotMetaAndAssetCtxs = spotMetaAndAssetCtxsMock;
  }
  class MockExchangeClient {
    order = exchangeOrderMock;
    spotSend = exchangeSpotSendMock;
    usdSend = exchangeUsdSendMock;
  }
  class MockWebSocketTransport {
    ready = explorerMocks.explorerReadyMock;
    close = explorerMocks.explorerCloseMock;
  }
  return {
    ...actual,
    ExchangeClient: MockExchangeClient,
    InfoClient: MockInfoClient,
    WebSocketTransport: MockWebSocketTransport,
  };
});

vi.mock("@nktkas/hyperliquid/api/subscription", () => ({
  explorerTxs: explorerMocks.explorerTxsMock,
}));

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
  it("searches perp and spot markets from Hyperliquid metadata", async () => {
    metaAndAssetCtxsMock.mockResolvedValueOnce([
      {
        universe: [{ name: "BTC", szDecimals: 5, maxLeverage: 40, marginTableId: 1 }],
      },
      [
        {
          markPx: "95000",
          midPx: "94999",
          oraclePx: "95010",
          funding: "0.0001",
          openInterest: "100",
          dayNtlVlm: "1000",
        },
      ],
    ]);
    spotMetaAndAssetCtxsMock.mockResolvedValueOnce([
      {
        universe: [{ tokens: [10, 0], name: "HYPE/USDC", index: 100, isCanonical: true }],
        tokens: [
          {
            index: 10,
            name: "HYPE",
            szDecimals: 2,
            weiDecimals: 8,
            tokenId: "0x00000000000000000000000000000010",
            isCanonical: true,
            evmContract: null,
            fullName: "Hyperliquid",
            deployerTradingFeeShare: "0",
          },
          {
            index: 0,
            name: "USDC",
            szDecimals: 2,
            weiDecimals: 8,
            tokenId: "0x00000000000000000000000000000000",
            isCanonical: true,
            evmContract: null,
            fullName: "USD Coin",
            deployerTradingFeeShare: "0",
          },
        ],
      },
      [
        {
          coin: "HYPE",
          markPx: "20",
          midPx: "19.9",
          prevDayPx: "18",
          dayNtlVlm: "500",
          circulatingSupply: "10",
          totalSupply: "100",
          dayBaseVlm: "25",
        },
      ],
    ]);

    const service = new HyperliquidService(
      {
        network: "mainnet",
        isTestnet: false,
        apiUrl: "https://api.hyperliquid.xyz",
        wsUrl: "wss://api.hyperliquid.xyz/ws",
      },
      {
        createSignerClient: async () => {
          throw new Error("not used in this test");
        },
      },
    );

    await expect(service.searchMarkets({ query: "HYPE" })).resolves.toEqual({
      network: "mainnet",
      query: "HYPE",
      kind: "all",
      count: 1,
      markets: [
        {
          kind: "spot",
          symbol: "HYPE/USDC",
          asset: 100,
          tokenIds: [10, 0],
          baseToken: "HYPE",
          quoteToken: "USDC",
          markPx: "20",
          midPx: "19.9",
          prevDayPx: "18",
          dayNtlVlm: "500",
          circulatingSupply: "10",
          totalSupply: "100",
        },
      ],
    });
  });

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
    spotMetaMock.mockResolvedValueOnce({
      tokens: [{ index: 0, name: "USDC", weiDecimals: 8, tokenId: "0x00000000000000000000000000000000" }],
      universe: [],
    });
    callMock.mockResolvedValueOnce({
      data: encodeBalanceResult(100000000n, 0n, 0n),
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
        tokenId: "0x00000000000000000000000000000000",
        universe: null,
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

  it("reads explicit spot assets like HYPE from the HyperCore precompile", async () => {
    spotMetaMock.mockResolvedValueOnce({
      tokens: [
        { index: 0, name: "USDC", weiDecimals: 8, tokenId: "0x00000000000000000000000000000000" },
        { index: 150, name: "HYPE", weiDecimals: 8, tokenId: "0x00000000000000000000000000000096" },
      ],
      universe: [],
    });
    callMock.mockResolvedValueOnce({
      data: encodeBalanceResult(200000000n, 1250000n, 0n),
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

    await expect(service.getSpotBalance("0x0f79aE66c53EF40D03292407C4b5530da6A5BDAB", "HYPE")).resolves.toEqual({
      network: "testnet",
      address: "0x0f79aE66c53EF40D03292407C4b5530da6A5BDAB",
      token: {
        index: 150,
        symbol: "HYPE",
        decimals: 8,
        tokenId: "0x00000000000000000000000000000096",
        universe: null,
      },
      balance: {
        raw: "200000000",
        formatted: "2",
        heldRaw: "1250000",
        heldFormatted: "0.0125",
        availableRaw: "198750000",
        availableFormatted: "1.9875",
        entryNtlRaw: "0",
        entryNtlFormatted: "0",
      },
    });
  });

  it("passes through generic exchange actions via the ExchangeClient", async () => {
    exchangeOrderMock.mockResolvedValueOnce({ status: "ok" });
    metaMock.mockResolvedValueOnce({
      universe: [{ name: "BTC", szDecimals: 5, maxLeverage: 40, marginTableId: 1 }],
      marginTables: [],
      collateralToken: 0,
    });
    allMidsMock.mockResolvedValueOnce({ BTC: "95000" });

    const service = new HyperliquidService(
      {
        network: "mainnet",
        isTestnet: false,
        apiUrl: "https://api.hyperliquid.xyz",
        wsUrl: "wss://api.hyperliquid.xyz/ws",
      },
      {
        createSignerClient: async () => ({ address: "0x1234567890abcdef1234567890abcdef12345678" }) as never,
      },
    );

    await expect(
      service.placeOrder(
        {
          id: "wallet-1",
          userId: "user-1",
          chain: "ethereum",
          address: "0x1234567890abcdef1234567890abcdef12345678",
          status: "ready",
          turnkeyOrganizationId: "org-1",
          turnkeyEndUserId: "user-1",
          turnkeyWalletId: "wallet-1",
          turnkeyAccountId: "account-1",
          turnkeyDelegatedUserId: "delegated-1",
          turnkeyDelegatedKeyRef: "turnkey/delegated/org-1/delegated-1",
          signerStatus: "ready",
          provisionedFrom: "phone_number_first_message",
          createdAt: "2099-03-22T00:00:00.000Z",
          updatedAt: "2099-03-22T00:00:00.000Z",
        },
        {
          market: "BTC",
          side: "buy",
          size: "0.01",
          orderType: "market",
        },
      ),
    ).resolves.toEqual({
      network: "mainnet",
      action: "order",
      result: { status: "ok" },
    });

    expect(exchangeOrderMock).toHaveBeenCalledWith({
      orders: [
        {
          a: 0,
          b: true,
          p: "95000",
          s: "0.01",
          r: false,
          t: {
            limit: {
              tif: "FrontendMarket",
            },
          },
          c: undefined,
        },
      ],
      grouping: "na",
    });
  });

  it("falls back to spotSend when usdSend fails from insufficient core USDC but spot USDC is available", async () => {
    exchangeUsdSendMock.mockRejectedValueOnce(new Error("Insufficient balance for withdrawal."));
    exchangeSpotSendMock.mockResolvedValueOnce({ status: "ok", route: "spot" });
    spotMetaMock.mockResolvedValueOnce({
      tokens: [{ index: 0, name: "USDC", weiDecimals: 8, tokenId: "0x00000000000000000000000000000000" }],
      universe: [],
    });
    callMock.mockResolvedValueOnce({
      data: encodeBalanceResult(100000000n, 0n, 0n),
    });

    const service = new HyperliquidService(
      {
        network: "testnet",
        isTestnet: true,
        apiUrl: "https://api.hyperliquid-testnet.xyz",
        wsUrl: "wss://api.hyperliquid-testnet.xyz/ws",
      },
      {
        createSignerClient: async () => ({ address: "0x1234567890abcdef1234567890abcdef12345678" }) as never,
      },
    );

    await expect(
      service.transferUsd(
        {
          id: "wallet-1",
          userId: "user-1",
          chain: "ethereum",
          address: "0x1234567890abcdef1234567890abcdef12345678",
          status: "ready",
          turnkeyOrganizationId: "org-1",
          turnkeyEndUserId: "user-1",
          turnkeyWalletId: "wallet-1",
          turnkeyAccountId: "account-1",
          turnkeyDelegatedUserId: "delegated-1",
          turnkeyDelegatedKeyRef: "turnkey/delegated/org-1/delegated-1",
          signerStatus: "ready",
          provisionedFrom: "phone_number_first_message",
          createdAt: "2099-03-22T00:00:00.000Z",
          updatedAt: "2099-03-22T00:00:00.000Z",
        },
        {
          destination: "0x572a0a5f79469046a21f45ec7febb0a6309ea0dd",
          amount: "0.1",
        },
      ),
    ).resolves.toEqual({
      network: "testnet",
      action: "spotSend",
      result: { status: "ok", route: "spot" },
    });

    expect(exchangeUsdSendMock).toHaveBeenCalledWith({
      destination: "0x572a0a5f79469046a21f45ec7febb0a6309ea0dd",
      amount: "0.1",
    });
    expect(exchangeSpotSendMock).toHaveBeenCalledWith({
      destination: "0x572a0a5f79469046a21f45ec7febb0a6309ea0dd",
      token: "USDC:0x00000000000000000000000000000000",
      amount: "0.1",
    });
  });

  it("attaches explorer hash metadata to tracked signed actions", async () => {
    explorerMocks.explorerReadyMock.mockResolvedValueOnce(undefined);
    explorerMocks.explorerTxsMock.mockImplementationOnce(async (_config, listener) => {
      listener([
        {
          action: {
            type: "spotSend",
            destination: "0x572a0a5f79469046a21f45ec7febb0a6309ea0dd",
            token: "USDC:0x00000000000000000000000000000000",
            amount: "0.1",
          },
          block: 1,
          error: null,
          hash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          time: Date.now(),
          user: "0x1234567890abcdef1234567890abcdef12345678",
        },
      ]);
      return { unsubscribe: vi.fn().mockResolvedValue(undefined) };
    });
    exchangeSpotSendMock.mockResolvedValueOnce({ status: "ok" });
    spotMetaMock.mockResolvedValueOnce({
      tokens: [{ index: 0, name: "USDC", weiDecimals: 8, tokenId: "0x00000000000000000000000000000000" }],
      universe: [],
    });

    const service = new HyperliquidService(
      {
        network: "testnet",
        isTestnet: true,
        apiUrl: "https://api.hyperliquid-testnet.xyz",
        wsUrl: "wss://api.hyperliquid-testnet.xyz/ws",
      },
      {
        createSignerClient: async () => ({ address: "0x1234567890abcdef1234567890abcdef12345678" }) as never,
      },
    );

    await expect(
      service.transferSpot(
        {
          id: "wallet-1",
          userId: "user-1",
          chain: "ethereum",
          address: "0x1234567890abcdef1234567890abcdef12345678",
          status: "ready",
          turnkeyOrganizationId: "org-1",
          turnkeyEndUserId: "user-1",
          turnkeyWalletId: "wallet-1",
          turnkeyAccountId: "account-1",
          turnkeyDelegatedUserId: "delegated-1",
          turnkeyDelegatedKeyRef: "turnkey/delegated/org-1/delegated-1",
          signerStatus: "ready",
          provisionedFrom: "phone_number_first_message",
          createdAt: "2099-03-22T00:00:00.000Z",
          updatedAt: "2099-03-22T00:00:00.000Z",
        },
        {
          destination: "0x572a0a5f79469046a21f45ec7febb0a6309ea0dd",
          token: "USDC",
          amount: "0.1",
        },
      ),
    ).resolves.toEqual({
      network: "testnet",
      action: "spotSend",
      result: { status: "ok" },
      txHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      explorerUrl:
        "https://app.hyperliquid-testnet.xyz/explorer/tx/0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    });
  });
});
