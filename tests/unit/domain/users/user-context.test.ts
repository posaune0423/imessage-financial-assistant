import { describe, expect, it } from "vitest";

import { UserContextResolver } from "../../../../src/domain/users/user-context";
import type { User, MessagingIdentity } from "../../../../src/domain/users/types";
import type { UserRepository } from "../../../../src/repositories/interfaces/user-repository";
import type { WalletRepository } from "../../../../src/repositories/interfaces/wallet-repository";

function createFakeRepositories() {
  const userStore = new Map<string, User>();
  const identities: MessagingIdentity[] = [];

  const users: UserRepository = {
    findById: async (id) => userStore.get(id) ?? null,
    findByMessagingIdentity: async (channel, identity) => {
      const match = identities.find((item) => item.channel === channel && item.identity === identity);
      return match ? (userStore.get(match.userId) ?? null) : null;
    },
    listMessagingIdentities: async (userId) => identities.filter((item) => item.userId === userId),
    createUser: async (input) => {
      const user: User = {
        id: input.id,
        resourceKey: input.resourceKey,
        displayName: input.displayName ?? null,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
      };
      userStore.set(user.id, user);
      return user;
    },
    createMessagingIdentity: async (input) => {
      const identity: MessagingIdentity = {
        id: input.id,
        userId: input.userId,
        channel: input.channel,
        identity: input.identity,
        identityType: input.identityType,
        createdAt: input.createdAt,
      };
      identities.push(identity);
      return identity;
    },
    updateDisplayName: async () => {},
  };

  const wallets: WalletRepository = {
    findPrimaryWalletByUserId: async () => null,
    upsertPrimaryWallet: async () => {
      throw new Error("not used");
    },
    updateWalletStatus: async () => {},
    updateSignerStatus: async () => {},
  };

  return {
    users,
    wallets,
    identities,
  };
}

describe("UserContextResolver", () => {
  it("creates a new user with stable resource key and binds sender/chat identities", async () => {
    const repos = createFakeRepositories();
    const resolver = new UserContextResolver(repos.users, repos.wallets);

    const context = await resolver.resolve({
      sender: "+81 90-1234-5678",
      chatId: "chat-1",
      text: "hello",
    });

    expect(context.sender).toBe("+819012345678");
    expect(context.resourceKey).toMatch(/^user:/);
    expect(repos.identities).toHaveLength(2);
    expect(repos.identities.map((item) => item.identity).toSorted()).toEqual(["+819012345678", "chat-1"]);
  });

  it("reuses the same user when the sender identity already exists", async () => {
    const repos = createFakeRepositories();
    const resolver = new UserContextResolver(repos.users, repos.wallets);

    const first = await resolver.resolve({
      sender: "+819012345678",
      text: "first",
    });
    const second = await resolver.resolve({
      sender: "+81 90-1234-5678",
      chatId: "chat-2",
      text: "second",
    });

    expect(second.id).toBe(first.id);
    expect(second.resourceKey).toBe(first.resourceKey);
    expect(repos.identities.map((item) => item.identity).toSorted()).toEqual(["+819012345678", "chat-2"]);
  });
});
