import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function createTurnkeyMocks() {
  return {
    instances: [] as Array<Record<string, unknown>>,
    server: {
      getWhoami: vi.fn(),
      getVerifiedSubOrgIds: vi.fn(),
      createSubOrganization: vi.fn(),
      getUsers: vi.fn(),
      getWallets: vi.fn(),
      getWalletAccounts: vi.fn(),
      getPolicies: vi.fn(),
      createPolicies: vi.fn(),
    },
    delegated: {
      getPolicies: vi.fn(),
      createPolicies: vi.fn(),
    },
  };
}

const turnkeyMocksKey = "__turnkeyProvisioningClientMocks";
const turnkeyMocks =
  (
    globalThis as typeof globalThis & {
      [turnkeyMocksKey]?: ReturnType<typeof createTurnkeyMocks>;
    }
  )[turnkeyMocksKey] ?? createTurnkeyMocks();

(
  globalThis as typeof globalThis & {
    [turnkeyMocksKey]?: ReturnType<typeof createTurnkeyMocks>;
  }
)[turnkeyMocksKey] = turnkeyMocks;

vi.mock("@turnkey/sdk-server", () => ({
  Turnkey: class {
    private readonly config: Record<string, unknown>;

    constructor(config: Record<string, unknown>) {
      this.config = config;
      turnkeyMocks.instances.push(config);
    }

    apiClient() {
      const isParentClient = this.config.apiPublicKey === "public-key";
      return {
        getWhoami: turnkeyMocks.server.getWhoami,
        getVerifiedSubOrgIds: turnkeyMocks.server.getVerifiedSubOrgIds,
        createSubOrganization: turnkeyMocks.server.createSubOrganization,
        getPolicies: isParentClient ? turnkeyMocks.server.getPolicies : turnkeyMocks.delegated.getPolicies,
        createPolicies: isParentClient ? turnkeyMocks.server.createPolicies : turnkeyMocks.delegated.createPolicies,
        getUsers: turnkeyMocks.server.getUsers,
        getWallets: turnkeyMocks.server.getWallets,
        getWalletAccounts: turnkeyMocks.server.getWalletAccounts,
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

const delegatedKeyStoreRoot = join(tmpdir(), "imessage-financial-assistant-turnkey-client-test");

describe("TurnkeyProvisioningClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    turnkeyMocks.instances.length = 0;
    process.env.TURNKEY_DELEGATED_KEY_STORE_ROOT = delegatedKeyStoreRoot;
    rmSync(delegatedKeyStoreRoot, { recursive: true, force: true });
    turnkeyMocks.server.getPolicies.mockResolvedValue({
      policies: [],
    });
    turnkeyMocks.server.createPolicies.mockResolvedValue({
      policyIds: ["policy-server"],
    });
    turnkeyMocks.delegated.getPolicies.mockResolvedValue({
      policies: [],
    });
    turnkeyMocks.delegated.createPolicies.mockResolvedValue({
      policyIds: ["policy-1"],
    });
  });

  afterEach(() => {
    rmSync(delegatedKeyStoreRoot, { recursive: true, force: true });
    delete process.env.TURNKEY_DELEGATED_KEY_STORE_ROOT;
  });

  it("surfaces an actionable error when the API key does not belong to the configured organization", async () => {
    turnkeyMocks.server.getWhoami.mockRejectedValue(
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
    turnkeyMocks.server.createSubOrganization.mockResolvedValue({
      subOrganizationId: "sub-org-1",
    });
    turnkeyMocks.server.getUsers.mockResolvedValue({
      users: [{ userId: "phone-user-1", userPhoneNumber: "+819012345678" }, { userId: "delegated-user-1" }],
    });
    turnkeyMocks.server.getWallets.mockResolvedValue({
      wallets: [{ walletId: "wallet-1" }],
    });
    turnkeyMocks.server.getWalletAccounts.mockResolvedValue({
      accounts: [{ walletAccountId: "account-1", address: "0x1234567890abcdef1234567890abcdef12345678" }],
    });
    const { TurnkeyProvisioningClient } = await loadClient();
    const client = new TurnkeyProvisioningClient(config);

    await client.provisionSubOrganization({
      phoneNumber: "+819012345678",
      userId: "user-1",
    });

    expect(turnkeyMocks.server.createSubOrganization).toHaveBeenCalledWith(
      expect.objectContaining({
        rootUsers: [
          expect.objectContaining({
            userPhoneNumber: "+819012345678",
            apiKeys: [],
            authenticators: [],
            oauthProviders: [],
          }),
          expect.objectContaining({
            userName: "delegated-signer-user-1",
            apiKeys: [
              expect.objectContaining({
                apiKeyName: "Delegated Signer",
                curveType: "API_KEY_CURVE_P256",
              }),
            ],
            authenticators: [],
            oauthProviders: [],
          }),
        ],
      }),
    );
  });

  it("creates and stores delegated signer credentials when provisioning a new sub-organization", async () => {
    turnkeyMocks.server.createSubOrganization.mockResolvedValue({
      subOrganizationId: "sub-org-1",
    });
    turnkeyMocks.server.getUsers.mockResolvedValue({
      users: [{ userId: "phone-user-1", userPhoneNumber: "+819012345678" }, { userId: "delegated-user-1" }],
    });
    turnkeyMocks.server.getWallets.mockResolvedValue({
      wallets: [{ walletId: "wallet-1" }],
    });
    turnkeyMocks.server.getWalletAccounts.mockResolvedValue({
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
    const { TurnkeyProvisioningClient } = await loadClient();
    const client = new TurnkeyProvisioningClient(config);

    await expect(
      client.bootstrapDelegatedSigner({
        organizationId: "sub-org-1",
        endUserId: "phone-user-1",
        walletId: "wallet-1",
        accountId: "account-1",
        address: "0x1234567890abcdef1234567890abcdef12345678",
        delegatedUserId: "delegated-user-1",
        delegatedKeyRef: "turnkey/delegated/sub-org-1/delegated-user-1",
      }),
    ).rejects.toThrow("Delegated signer credentials are missing locally");
  });

  it("creates the delegated signer policy when credentials already exist locally", async () => {
    const delegatedKeyRef = "turnkey/delegated/sub-org-1/delegated-user-1";
    const { writeDelegatedApiKeyCredentials } = await import("../../../../src/lib/turnkey/delegated-credentials");
    writeDelegatedApiKeyCredentials(delegatedKeyRef, {
      apiPublicKey: "delegated-public",
      apiPrivateKey: "delegated-private",
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
      delegatedKeyRef,
    });

    expect(result.signerStatus).toBe("ready");
    expect(turnkeyMocks.delegated.createPolicies).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "sub-org-1",
        policies: [
          expect.objectContaining({
            effect: "EFFECT_ALLOW",
            condition: "activity.action == 'SIGN' && wallet.id == 'wallet-1'",
            consensus: "approvers.any(user, user.id == 'delegated-user-1')",
          }),
        ],
      }),
    );
    expect(turnkeyMocks.server.createPolicies).not.toHaveBeenCalled();
    expect(turnkeyMocks.instances).toContainEqual(
      expect.objectContaining({
        apiPublicKey: "delegated-public",
        apiPrivateKey: "delegated-private",
        defaultOrganizationId: "sub-org-1",
      }),
    );
  });

  it("does not create a duplicate delegated signer policy when the expected policy already exists", async () => {
    const delegatedKeyRef = "turnkey/delegated/sub-org-1/delegated-user-1";
    const { writeDelegatedApiKeyCredentials } = await import("../../../../src/lib/turnkey/delegated-credentials");
    writeDelegatedApiKeyCredentials(delegatedKeyRef, {
      apiPublicKey: "delegated-public",
      apiPrivateKey: "delegated-private",
    });
    turnkeyMocks.delegated.getPolicies.mockResolvedValue({
      policies: [
        {
          policyName: "Allow delegated signer delegated-user-1 to sign with wallet wallet-1",
          effect: "EFFECT_ALLOW",
          consensus: "approvers.any(user, user.id == 'delegated-user-1')",
          condition: "activity.action == 'SIGN' && wallet.id == 'wallet-1'",
        },
      ],
    });
    const { TurnkeyProvisioningClient } = await loadClient();
    const client = new TurnkeyProvisioningClient(config);

    await client.bootstrapDelegatedSigner({
      organizationId: "sub-org-1",
      endUserId: "phone-user-1",
      walletId: "wallet-1",
      accountId: "account-1",
      address: "0x1234567890abcdef1234567890abcdef12345678",
      delegatedUserId: "delegated-user-1",
      delegatedKeyRef,
    });

    expect(turnkeyMocks.delegated.createPolicies).not.toHaveBeenCalled();
    expect(turnkeyMocks.server.createPolicies).not.toHaveBeenCalled();
  });
});
