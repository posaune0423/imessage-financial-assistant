import { describe, expect, it } from "vitest";

import { UserContextResolver } from "../../../../src/domain/users/user-context";
import type { AppUser, MessagingIdentity } from "../../../../src/domain/users/types";
import type { AppUserRepository } from "../../../../src/repositories/interfaces/app-user-repository";
import type { WalletRepository } from "../../../../src/repositories/interfaces/wallet-repository";

function createFakeRepositories() {
  const users = new Map<string, AppUser>();
  const identities: MessagingIdentity[] = [];

  const appUsers: AppUserRepository = {
    findById: async (id) => users.get(id) ?? null,
    findByMessagingIdentity: async (channel, identity) => {
      const match = identities.find((item) => item.channel === channel && item.identity === identity);
      return match ? (users.get(match.appUserId) ?? null) : null;
    },
    listMessagingIdentities: async (appUserId) => identities.filter((item) => item.appUserId === appUserId),
    createAppUser: async (input) => {
      const appUser: AppUser = {
        id: input.id,
        resourceKey: input.resourceKey,
        displayName: input.displayName ?? null,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
      };
      users.set(appUser.id, appUser);
      return appUser;
    },
    createMessagingIdentity: async (input) => {
      const identity: MessagingIdentity = {
        id: input.id,
        appUserId: input.appUserId,
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
    findPrimaryWalletByAppUserId: async () => null,
    upsertPrimaryWallet: async () => {
      throw new Error("not used");
    },
    updateWalletStatus: async () => {},
    updateSignerStatus: async () => {},
  };

  return {
    appUsers,
    wallets,
    identities,
  };
}

describe("UserContextResolver", () => {
  it("creates a new app user with stable resource key and binds sender/chat identities", async () => {
    const repos = createFakeRepositories();
    const resolver = new UserContextResolver(repos.appUsers, repos.wallets);

    const context = await resolver.resolve({
      sender: "+81 90-1234-5678",
      chatId: "chat-1",
      text: "hello",
    });

    expect(context.sender).toBe("+819012345678");
    expect(context.resourceKey).toMatch(/^app-user:/);
    expect(repos.identities).toHaveLength(2);
    expect(repos.identities.map((item) => item.identity).toSorted()).toEqual(["+819012345678", "chat-1"]);
  });

  it("reuses the same app user when the sender identity already exists", async () => {
    const repos = createFakeRepositories();
    const resolver = new UserContextResolver(repos.appUsers, repos.wallets);

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
