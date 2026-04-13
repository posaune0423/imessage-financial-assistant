import { beforeEach, describe, expect, it, vi } from "vitest";

function createMocks() {
  return {
    turnkeyViem: {
      createAccount: vi.fn(async () => ({ address: "0x1234567890abcdef1234567890abcdef12345678" })),
    },
    sdkServer: {
      Turnkey: vi.fn(),
    },
    delegatedCredentials: {
      readDelegatedApiKeyCredentials: vi.fn(() => ({
        apiPublicKey: "delegated-public",
        apiPrivateKey: "delegated-private",
      })),
    },
  };
}

const mocksKey = "__turnkeyViemAccountFactoryMocks";
const mocks =
  (
    globalThis as typeof globalThis & {
      [mocksKey]?: ReturnType<typeof createMocks>;
    }
  )[mocksKey] ?? createMocks();

(
  globalThis as typeof globalThis & {
    [mocksKey]?: ReturnType<typeof createMocks>;
  }
)[mocksKey] = mocks;

vi.mock("@turnkey/viem", () => ({
  createAccount: mocks.turnkeyViem.createAccount,
}));

vi.mock("@turnkey/sdk-server", () => ({
  Turnkey: mocks.sdkServer.Turnkey,
}));

vi.mock("../../../../src/lib/turnkey/delegated-credentials", () => ({
  readDelegatedApiKeyCredentials: mocks.delegatedCredentials.readDelegatedApiKeyCredentials,
}));

describe("TurnkeyViemAccountFactory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sdkServer.Turnkey.mockImplementation(function TurnkeyMock(config: unknown) {
      return {
        config,
        apiClient: () => ({ kind: "server-client" }),
      };
    });
    mocks.delegatedCredentials.readDelegatedApiKeyCredentials.mockReturnValue({
      apiPublicKey: "delegated-public",
      apiPrivateKey: "delegated-private",
    });
  });

  it("builds the viem signer with delegated API key credentials and signs with the canonical Ethereum address", async () => {
    const { TurnkeyViemAccountFactory } = await import("../../../../src/lib/turnkey/viem");
    const factory = new TurnkeyViemAccountFactory({
      apiBaseUrl: "https://api.turnkey.com",
      apiPublicKey: "root-public",
      apiPrivateKey: "root-private",
      organizationId: "root-org",
      delegatedKeySecretNamespace: "turnkey/delegated",
    });

    await factory.createSignerClient({
      id: "wallet-1",
      userId: "user-1",
      chain: "ethereum",
      address: "0x1234567890abcdef1234567890abcdef12345678",
      status: "ready",
      turnkeyOrganizationId: "org-1",
      turnkeyEndUserId: "phone-user-1",
      turnkeyWalletId: "wallet-1",
      turnkeyAccountId: "account-1",
      turnkeyDelegatedUserId: "delegated-1",
      turnkeyDelegatedKeyRef: "turnkey/delegated/org-1/delegated-1",
      signerStatus: "ready",
      provisionedFrom: "phone_number_first_message",
      createdAt: "2099-01-01T00:00:00.000Z",
      updatedAt: "2099-01-01T00:00:00.000Z",
    });

    expect(mocks.delegatedCredentials.readDelegatedApiKeyCredentials).toHaveBeenCalledWith(
      "turnkey/delegated/org-1/delegated-1",
    );
    expect(mocks.sdkServer.Turnkey).toHaveBeenCalledWith({
      apiBaseUrl: "https://api.turnkey.com",
      apiPublicKey: "delegated-public",
      apiPrivateKey: "delegated-private",
      defaultOrganizationId: "org-1",
    });
    expect(mocks.turnkeyViem.createAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        client: { kind: "server-client" },
        organizationId: "org-1",
        signWith: "0x1234567890AbcdEF1234567890aBcdef12345678",
        ethereumAddress: "0x1234567890AbcdEF1234567890aBcdef12345678",
      }),
    );
  });
});
