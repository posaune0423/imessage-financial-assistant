import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { writeDelegatedApiKeyCredentials } from "../../../../src/lib/turnkey/delegated-credentials";

const turnkeyHttpMocks = vi.hoisted(() => ({
  TurnkeyClient: vi.fn(),
}));

const turnkeyViemMocks = vi.hoisted(() => ({
  createAccount: vi.fn(async () => ({ address: "0x1234567890abcdef1234567890abcdef12345678" })),
}));

const sdkServerMocks = vi.hoisted(() => ({
  ApiKeyStamper: vi.fn(),
}));

vi.mock("@turnkey/http", () => ({
  TurnkeyClient: turnkeyHttpMocks.TurnkeyClient,
}));

vi.mock("@turnkey/viem", () => ({
  createAccount: turnkeyViemMocks.createAccount,
}));

vi.mock("@turnkey/sdk-server", () => ({
  ApiKeyStamper: sdkServerMocks.ApiKeyStamper,
}));

const delegatedKeyStoreRoot = fileURLToPath(new URL("../../../../data/turnkey-delegated-keys", import.meta.url));

describe("TurnkeyViemAccountFactory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rmSync(delegatedKeyStoreRoot, { recursive: true, force: true });
    sdkServerMocks.ApiKeyStamper.mockImplementation(function ApiKeyStamperMock(
      this: { config: unknown },
      config: unknown,
    ) {
      this.config = config;
    });
    turnkeyHttpMocks.TurnkeyClient.mockImplementation(function TurnkeyClientMock(
      this: { config: unknown; stamper: unknown },
      config: unknown,
      stamper: unknown,
    ) {
      this.config = config;
      this.stamper = stamper;
    });
  });

  afterEach(() => {
    rmSync(delegatedKeyStoreRoot, { recursive: true, force: true });
  });

  it("builds the viem signer with delegated API key credentials instead of the root key", async () => {
    writeDelegatedApiKeyCredentials("turnkey/delegated/org-1/delegated-1", {
      apiPublicKey: "delegated-public",
      apiPrivateKey: "delegated-private",
    });
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

    expect(sdkServerMocks.ApiKeyStamper).toHaveBeenCalledWith({
      apiPublicKey: "delegated-public",
      apiPrivateKey: "delegated-private",
    });
    expect(turnkeyViemMocks.createAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        signWith: "account-1",
      }),
    );
  });
});
