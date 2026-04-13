import { describe, expect, it, vi } from "vitest";

import { TurnkeyProvisioningService } from "../../../../src/lib/turnkey/provisioning";
import type { TurnkeyProvisioningAdapter, TurnkeyWalletLinkage } from "../../../../src/lib/turnkey/interfaces";
import type { AppWallet, UserContext } from "../../../../src/domain/users/types";
import type { UpsertAppWalletInput, WalletRepository } from "../../../../src/repositories/interfaces/wallet-repository";

const userContext: UserContext = {
  id: "user-1",
  resourceKey: "user:user-1",
  sender: "+819012345678",
  wallet: null,
};

const linkage: TurnkeyWalletLinkage = {
  organizationId: "org-1",
  endUserId: "end-user-1",
  walletId: "wallet-1",
  accountId: "account-1",
  address: "0x1234567890abcdef1234567890abcdef12345678",
  delegatedUserId: "delegated-1",
  delegatedKeyRef: "turnkey/delegated/org-1/delegated-1",
};

function createWalletRepository(initialWallet: AppWallet | null = null) {
  const state = {
    wallet: initialWallet,
  };

  const findPrimaryWalletByUserId = vi.fn(async () => state.wallet);
  const upsertPrimaryWallet = vi.fn(async (input: UpsertAppWalletInput) => {
    state.wallet = {
      ...input,
    };

    return state.wallet;
  });
  const updateWalletStatus = vi.fn(async (_userId: string, status: AppWallet["status"], updatedAt: string) => {
    if (!state.wallet) {
      return;
    }

    state.wallet = {
      ...state.wallet,
      status,
      updatedAt,
    };
  });
  const updateSignerStatus = vi.fn(
    async (_userId: string, signerStatus: AppWallet["signerStatus"], updatedAt: string) => {
      if (!state.wallet) {
        return;
      }

      state.wallet = {
        ...state.wallet,
        signerStatus,
        updatedAt,
      };
    },
  );

  const repository: WalletRepository = {
    findPrimaryWalletByUserId,
    upsertPrimaryWallet,
    updateWalletStatus,
    updateSignerStatus,
  };

  return {
    repository,
    state,
    mocks: {
      findPrimaryWalletByUserId,
      upsertPrimaryWallet,
      updateWalletStatus,
      updateSignerStatus,
    },
  };
}

function createTurnkeyAdapter(overrides?: Partial<TurnkeyProvisioningAdapter>): TurnkeyProvisioningAdapter {
  return {
    validateAccess: async () => {},
    lookupSubOrganizationByPhone: async () => null,
    provisionSubOrganization: async () => linkage,
    bootstrapDelegatedSigner: async () => ({ signerStatus: "ready" as const, linkage }),
    ...overrides,
  };
}

describe("TurnkeyProvisioningService", () => {
  it("marks the wallet failed and degraded when provisioning fails", async () => {
    const { repository, state, mocks } = createWalletRepository();
    const turnkey = createTurnkeyAdapter({
      provisionSubOrganization: async () => {
        throw new Error("Turnkey provisioning failed");
      },
    });
    const service = new TurnkeyProvisioningService(repository, turnkey);

    await expect(service.ensurePrimaryWallet(userContext)).rejects.toThrow("Turnkey provisioning failed");

    expect(mocks.upsertPrimaryWallet).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        status: "provisioning",
        signerStatus: "bootstrapping",
      }),
    );
    expect(mocks.updateWalletStatus).toHaveBeenCalledWith("user-1", "failed", expect.any(String));
    expect(mocks.updateSignerStatus).toHaveBeenCalledWith("user-1", "degraded", expect.any(String));
    expect(state.wallet).toMatchObject({
      userId: "user-1",
      status: "failed",
      signerStatus: "degraded",
    });
  });

  it("reuses an existing sub-organization linkage when lookup succeeds", async () => {
    const { repository } = createWalletRepository();
    const lookupSubOrganizationByPhone = vi.fn(async (): Promise<TurnkeyWalletLinkage | null> => linkage);
    const provisionSubOrganization = vi.fn(async (): Promise<TurnkeyWalletLinkage> => {
      throw new Error("should not provision");
    });
    const bootstrapDelegatedSigner = vi.fn(
      async (): Promise<{ signerStatus: AppWallet["signerStatus"]; linkage: TurnkeyWalletLinkage }> => ({
        signerStatus: "ready",
        linkage,
      }),
    );
    const turnkey = createTurnkeyAdapter({
      lookupSubOrganizationByPhone,
      provisionSubOrganization,
      bootstrapDelegatedSigner,
    });
    const service = new TurnkeyProvisioningService(repository, turnkey);

    const wallet = await service.ensurePrimaryWallet(userContext);

    expect(lookupSubOrganizationByPhone).toHaveBeenCalledWith("+819012345678");
    expect(provisionSubOrganization).not.toHaveBeenCalled();
    expect(bootstrapDelegatedSigner).toHaveBeenCalledWith(linkage);
    expect(wallet).toMatchObject({
      userId: "user-1",
      address: linkage.address,
      status: "ready",
      signerStatus: "ready",
      turnkeyOrganizationId: "org-1",
      turnkeyWalletId: "wallet-1",
      turnkeyAccountId: "account-1",
    });
  });

  it("provisions a new linkage when lookup misses", async () => {
    const { repository } = createWalletRepository();
    const lookupSubOrganizationByPhone = vi.fn(async (): Promise<TurnkeyWalletLinkage | null> => null);
    const provisionSubOrganization = vi.fn(async (): Promise<TurnkeyWalletLinkage> => linkage);
    const bootstrapDelegatedSigner = vi.fn(
      async (): Promise<{ signerStatus: AppWallet["signerStatus"]; linkage: TurnkeyWalletLinkage }> => ({
        signerStatus: "degraded",
        linkage,
      }),
    );
    const turnkey = createTurnkeyAdapter({
      lookupSubOrganizationByPhone,
      provisionSubOrganization,
      bootstrapDelegatedSigner,
    });
    const service = new TurnkeyProvisioningService(repository, turnkey);

    const wallet = await service.ensurePrimaryWallet(userContext);

    expect(provisionSubOrganization).toHaveBeenCalledWith({
      phoneNumber: "+819012345678",
      userId: "user-1",
    });
    expect(wallet).toMatchObject({
      status: "ready",
      signerStatus: "degraded",
      turnkeyDelegatedUserId: "delegated-1",
      turnkeyDelegatedKeyRef: "turnkey/delegated/org-1/delegated-1",
    });
  });
});
