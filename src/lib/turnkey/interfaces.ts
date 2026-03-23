import type { AppWallet, UserContext } from "../../domain/users/types";
import type { LocalAccount } from "viem/accounts";

export interface TurnkeyWalletLinkage {
  organizationId: string;
  endUserId: string | null;
  walletId: string;
  accountId: string;
  address: `0x${string}`;
  delegatedUserId: string | null;
  delegatedKeyRef: string | null;
}

export interface TurnkeyProvisioningAdapter {
  isConfigured(): boolean;
  lookupSubOrganizationByPhone(phoneNumber: string): Promise<TurnkeyWalletLinkage | null>;
  provisionSubOrganization(input: { phoneNumber: string; appUserId: string }): Promise<TurnkeyWalletLinkage>;
  bootstrapDelegatedSigner(linkage: TurnkeyWalletLinkage): Promise<{ signerStatus: AppWallet["signerStatus"] }>;
}

export interface TurnkeySignerClientFactory {
  createSignerClient(wallet: AppWallet): Promise<LocalAccount>;
}

export interface TurnkeyOwnershipAuthAdapter {
  initOtp(contact: string): Promise<{ otpId: string }>;
  verifyOtp(otpId: string, otpCode: string): Promise<{ verificationToken: string }>;
}

export interface TurnkeyProvisioningPort {
  ensurePrimaryWallet(userContext: UserContext, options?: { force?: boolean }): Promise<AppWallet>;
}
