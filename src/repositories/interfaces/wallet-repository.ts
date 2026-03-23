import type { AppWallet, SignerStatus, WalletStatus } from "../../domain/users/types";

export interface UpsertAppWalletInput {
  id: string;
  appUserId: string;
  chain: string;
  address: `0x${string}` | null;
  status: WalletStatus;
  turnkeyOrganizationId: string | null;
  turnkeyEndUserId: string | null;
  turnkeyWalletId: string | null;
  turnkeyAccountId: string | null;
  turnkeyDelegatedUserId: string | null;
  turnkeyDelegatedKeyRef: string | null;
  signerStatus: SignerStatus;
  provisionedFrom: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WalletRepository {
  findPrimaryWalletByAppUserId(appUserId: string): Promise<AppWallet | null>;
  upsertPrimaryWallet(input: UpsertAppWalletInput): Promise<AppWallet>;
  updateWalletStatus(appUserId: string, status: WalletStatus, updatedAt: string): Promise<void>;
  updateSignerStatus(appUserId: string, signerStatus: SignerStatus, updatedAt: string): Promise<void>;
}
