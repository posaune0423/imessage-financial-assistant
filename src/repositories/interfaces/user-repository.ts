import type { MessagingChannel, MessagingIdentity, MessagingIdentityType, User } from "../../domain/users/types";

export interface CreateUserInput {
  id: string;
  resourceKey: string;
  displayName?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMessagingIdentityInput {
  id: string;
  userId: string;
  channel: MessagingChannel;
  identity: string;
  identityType: MessagingIdentityType;
  createdAt: string;
}

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByMessagingIdentity(channel: MessagingChannel, identity: string): Promise<User | null>;
  listMessagingIdentities(userId: string): Promise<MessagingIdentity[]>;
  createUser(input: CreateUserInput): Promise<User>;
  createMessagingIdentity(input: CreateMessagingIdentityInput): Promise<MessagingIdentity>;
  updateDisplayName(userId: string, displayName: string | null): Promise<void>;
}
