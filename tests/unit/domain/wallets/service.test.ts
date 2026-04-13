import { describe, expect, it, vi } from "vitest";

import { WalletService } from "../../../../src/domain/wallets/service";
import type { AppWallet, UserContext } from "../../../../src/domain/users/types";
import type { WalletRepository } from "../../../../src/repositories/interfaces/wallet-repository";

const userContext: UserContext = {
  id: "user-1",
  resourceKey: "user:user-1",
  sender: "+819012345678",
  wallet: null,
};

const readyWallet = {
  id: "wallet-1",
  userId: "user-1",
  chain: "ethereum",
  address: "0x1234567890abcdef1234567890abcdef12345678" as const,
  status: "ready" as const,
  turnkeyOrganizationId: "org-1",
  turnkeyEndUserId: "turnkey-user-1",
  turnkeyWalletId: "turnkey-wallet-1",
  turnkeyAccountId: "turnkey-account-1",
  turnkeyDelegatedUserId: "delegated-1",
  turnkeyDelegatedKeyRef: "turnkey/delegated/org-1/delegated-1",
  signerStatus: "ready" as const,
  provisionedFrom: "phone_number_first_message",
  createdAt: "2099-03-22T00:00:00.000Z",
  updatedAt: "2099-03-22T00:00:00.000Z",
};

function createWalletRepository(wallet: AppWallet | null = readyWallet): WalletRepository {
  return {
    findPrimaryWalletByUserId: vi.fn().mockResolvedValue(wallet),
    upsertPrimaryWallet: vi.fn(),
    updateWalletStatus: vi.fn(),
    updateSignerStatus: vi.fn(),
  };
}

describe("WalletService", () => {
  it("returns the existing ready wallet without reprovisioning", async () => {
    const wallets = createWalletRepository();
    const provisioning = {
      ensurePrimaryWallet: vi.fn(),
    };
    const service = new WalletService(wallets, provisioning as never);

    await expect(service.ensurePrimaryWallet(userContext)).resolves.toEqual(readyWallet);
    expect(provisioning.ensurePrimaryWallet).not.toHaveBeenCalled();
  });

  it("forces reprovisioning when requested", async () => {
    const wallets = createWalletRepository();
    const provisioning = {
      ensurePrimaryWallet: vi.fn().mockResolvedValue(readyWallet),
    };
    const service = new WalletService(wallets, provisioning as never);

    await expect(service.ensurePrimaryWallet(userContext, true)).resolves.toEqual(readyWallet);
    expect(provisioning.ensurePrimaryWallet).toHaveBeenCalledWith(userContext, { force: true });
  });

  it("provisions when the current wallet is missing", async () => {
    const wallets = createWalletRepository(null);
    const provisioning = {
      ensurePrimaryWallet: vi.fn().mockResolvedValue(readyWallet),
    };
    const service = new WalletService(wallets, provisioning as never);

    await expect(service.ensurePrimaryWallet(userContext)).resolves.toEqual(readyWallet);
    expect(provisioning.ensurePrimaryWallet).toHaveBeenCalledWith(userContext, { force: false });
  });
});
