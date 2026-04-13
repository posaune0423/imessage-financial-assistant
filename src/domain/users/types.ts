export type WalletStatus = "none" | "provisioning" | "ready" | "failed";
export type SignerStatus = "not_bootstrapped" | "bootstrapping" | "ready" | "degraded";
export type MessagingChannel = "imessage";
export type MessagingIdentityType = "phone_number" | "chat_id";

export interface User {
  id: string;
  resourceKey: string;
  displayName?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessagingIdentity {
  id: string;
  userId: string;
  channel: MessagingChannel;
  identity: string;
  identityType: MessagingIdentityType;
  createdAt: string;
}

export interface AppWallet {
  id: string;
  userId: string;
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

export interface UserContext {
  id: string;
  resourceKey: string;
  sender: string;
  chatId?: string;
  displayName?: string | null;
  wallet: AppWallet | null;
}

export interface IncomingUserMessage {
  sender?: string | null;
  chatId?: string | null;
  text?: string | null;
}
