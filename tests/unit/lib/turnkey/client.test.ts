import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const turnkeyMocks = vi.hoisted(() => ({
  getWhoami: vi.fn(),
  getVerifiedSubOrgIds: vi.fn(),
  createSubOrganization: vi.fn(),
  createApiOnlyUsers: vi.fn(),
  createApiKeys: vi.fn(),
  getUsers: vi.fn(),
  getWallets: vi.fn(),
  getWalletAccounts: vi.fn(),
}));

vi.mock("@turnkey/sdk-server", () => ({
  Turnkey: class {
    apiClient() {
      return {
        getWhoami: turnkeyMocks.getWhoami,
        getVerifiedSubOrgIds: turnkeyMocks.getVerifiedSubOrgIds,
        createSubOrganization: turnkeyMocks.createSubOrganization,
        createApiOnlyUsers: turnkeyMocks.createApiOnlyUsers,
        createApiKeys: turnkeyMocks.createApiKeys,
        getUsers: turnkeyMocks.getUsers,
        getWallets: turnkeyMocks.getWallets,
        getWalletAccounts: turnkeyMocks.getWalletAccounts,
      };
    }
  },
}));

const config = {
  apiBaseUrl: "https://api.turnkey.com",
  apiPublicKey: "public-key",
  apiPrivateKey: "private-key",
  organizationId: "org-1",
  delegatedKeySecretNamespace: "turnkey/delegated",
} as const;

async function loadClient() {
  return import("../../../../src/lib/turnkey/client");
}

const delegatedKeyStoreRoot = fileURLToPath(new URL("../../../../data/turnkey-delegated-keys", import.meta.url));

describe("TurnkeyProvisioningClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rmSync(delegatedKeyStoreRoot, { recursive: true, force: true });
  });

  afterEach(() => {
    rmSync(delegatedKeyStoreRoot, { recursive: true, force: true });
  });

  it("surfaces an actionable error when the API key does not belong to the configured organization", async () => {
    turnkeyMocks.getWhoami.mockRejectedValue(
      new Error(
        "Turnkey error 7: authentication failed: rpc error: code = Unauthenticated desc = could not find public key in organization organizationId=org-1 publicKey=abc",
      ),
    );
    const { TurnkeyProvisioningClient } = await loadClient();
    const client = new TurnkeyProvisioningClient(config);

    await expect(client.validateAccess()).rejects.toThrow(
      "TURNKEY_ORGANIZATION_ID (org-1) must be the organization that owns TURNKEY_API_PUBLIC_KEY",
    );
  });

  it("creates sub-organizations with an explicit apiKeys array for phone-only root users", async () => {
    turnkeyMocks.createSubOrganization.mockResolvedValue({
      subOrganizationId: "sub-org-1",
    });
    turnkeyMocks.getUsers.mockResolvedValue({
      users: [{ userId: "phone-user-1", userPhoneNumber: "+819012345678" }, { userId: "delegated-user-1" }],
    });
    turnkeyMocks.getWallets.mockResolvedValue({
      wallets: [{ walletId: "wallet-1" }],
    });
    turnkeyMocks.getWalletAccounts.mockResolvedValue({
      accounts: [{ walletAccountId: "account-1", address: "0x1234567890abcdef1234567890abcdef12345678" }],
    });
    const { TurnkeyProvisioningClient } = await loadClient();
    const client = new TurnkeyProvisioningClient(config);

    await client.provisionSubOrganization({
      phoneNumber: "+819012345678",
      userId: "user-1",
    });

    expect(turnkeyMocks.createSubOrganization).toHaveBeenCalledWith(
      expect.objectContaining({
        rootUsers: [
          expect.objectContaining({
            userPhoneNumber: "+819012345678",
            apiKeys: [],
            authenticators: [],
            oauthProviders: [],
          }),
        ],
      }),
    );
    expect(turnkeyMocks.createApiKeys).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "sub-org-1",
        userId: "delegated-user-1",
        apiKeys: [
          expect.objectContaining({
            apiKeyName: "Delegated Signer",
            curveType: "API_KEY_CURVE_P256",
          }),
        ],
      }),
    );
  });

  it("creates and stores delegated signer credentials when provisioning a new sub-organization", async () => {
    turnkeyMocks.createSubOrganization.mockResolvedValue({
      subOrganizationId: "sub-org-1",
    });
    turnkeyMocks.createApiOnlyUsers.mockResolvedValue({
      userIds: ["delegated-user-1"],
    });
    turnkeyMocks.getUsers.mockResolvedValue({
      users: [{ userId: "phone-user-1", userPhoneNumber: "+819012345678" }],
    });
    turnkeyMocks.getWallets.mockResolvedValue({
      wallets: [{ walletId: "wallet-1" }],
    });
    turnkeyMocks.getWalletAccounts.mockResolvedValue({
      accounts: [{ walletAccountId: "account-1", address: "0x1234567890abcdef1234567890abcdef12345678" }],
    });
    const { TurnkeyProvisioningClient } = await loadClient();
    const client = new TurnkeyProvisioningClient(config);

    const linkage = await client.provisionSubOrganization({
      phoneNumber: "+819012345678",
      userId: "user-1",
    });

    expect(linkage.delegatedUserId).toBe("delegated-user-1");
    expect(linkage.delegatedKeyRef).toBe("turnkey/delegated/sub-org-1/delegated-user-1");
    expect(existsSync(`${delegatedKeyStoreRoot}/turnkey/delegated/sub-org-1/delegated-user-1.json`)).toBe(true);
  });

  it("backfills delegated signer credentials for an existing delegated user when the local key is missing", async () => {
    turnkeyMocks.createApiKeys.mockResolvedValue({
      apiKeyIds: ["api-key-1"],
    });
    const { TurnkeyProvisioningClient } = await loadClient();
    const client = new TurnkeyProvisioningClient(config);

    const result = await client.bootstrapDelegatedSigner({
      organizationId: "sub-org-1",
      endUserId: "phone-user-1",
      walletId: "wallet-1",
      accountId: "account-1",
      address: "0x1234567890abcdef1234567890abcdef12345678",
      delegatedUserId: "delegated-user-1",
      delegatedKeyRef: "turnkey/delegated/sub-org-1/delegated-user-1",
    });

    expect(result.signerStatus).toBe("ready");
    expect(turnkeyMocks.createApiKeys).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "sub-org-1",
        userId: "delegated-user-1",
      }),
    );
    expect(existsSync(`${delegatedKeyStoreRoot}/turnkey/delegated/sub-org-1/delegated-user-1.json`)).toBe(true);
  });
});
