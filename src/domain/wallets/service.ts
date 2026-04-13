import type { AppWallet, UserContext } from "../users/types";
import type { WalletRepository } from "../../repositories/interfaces/wallet-repository";
import type { TurnkeyProvisioningService } from "../../lib/turnkey/provisioning";

export class WalletService {
  constructor(
    private readonly wallets: WalletRepository,
    private readonly provisioning: TurnkeyProvisioningService,
  ) {}

  async getProfile(userId: string): Promise<AppWallet | null> {
    return this.wallets.findPrimaryWalletByUserId(userId);
  }

  async ensurePrimaryWallet(userContext: UserContext, force = false): Promise<AppWallet> {
    const existing = await this.wallets.findPrimaryWalletByUserId(userContext.id);
    if (!force && existing && existing.status === "ready") {
      return existing;
    }

    return this.provisioning.ensurePrimaryWallet(userContext, { force });
  }
}
