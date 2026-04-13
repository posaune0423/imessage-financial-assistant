import { beforeEach, describe, expect, it, vi } from "vitest";

const turnkeyMocks = vi.hoisted(() => ({
  getWhoami: vi.fn(),
  getVerifiedSubOrgIds: vi.fn(),
  createSubOrganization: vi.fn(),
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

describe("TurnkeyProvisioningClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
  });
});
