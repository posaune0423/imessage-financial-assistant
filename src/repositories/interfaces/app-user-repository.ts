import type { AppUser, MessagingChannel, MessagingIdentity, MessagingIdentityType } from "../../domain/users/types";

export interface CreateAppUserInput {
  id: string;
  resourceKey: string;
  displayName?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMessagingIdentityInput {
  id: string;
  appUserId: string;
  channel: MessagingChannel;
  identity: string;
  identityType: MessagingIdentityType;
  createdAt: string;
}

export interface AppUserRepository {
  findById(id: string): Promise<AppUser | null>;
  findByMessagingIdentity(channel: MessagingChannel, identity: string): Promise<AppUser | null>;
  listMessagingIdentities(appUserId: string): Promise<MessagingIdentity[]>;
  createAppUser(input: CreateAppUserInput): Promise<AppUser>;
  createMessagingIdentity(input: CreateMessagingIdentityInput): Promise<MessagingIdentity>;
  updateDisplayName(appUserId: string, displayName: string | null): Promise<void>;
}
