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
  it("creates a new user with stable resource key and binds the sender identity", async () => {
    const repos = createFakeRepositories();
    const resolver = new UserContextResolver(repos.users, repos.wallets);

    const context = await resolver.resolve({
      sender: "+81 90-1234-5678",
      chatId: "chat-1",
      text: "hello",
    });

    expect(context.sender).toBe("+819012345678");
    expect(context.resourceKey).toMatch(/^user:/);
    expect(repos.identities).toHaveLength(1);
    expect(repos.identities.map((item) => item.identity)).toEqual(["+819012345678"]);
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
    expect(repos.identities.map((item) => item.identity)).toEqual(["+819012345678"]);
  });

  it("does not merge different senders that share the same group chat id", async () => {
    const repos = createFakeRepositories();
    const resolver = new UserContextResolver(repos.users, repos.wallets);

    const first = await resolver.resolve({
      sender: "+819012345678",
      chatId: "group-1",
      text: "first",
    });
    const second = await resolver.resolve({
      sender: "+819099988877",
      chatId: "group-1",
      text: "second",
    });

    expect(second.id).not.toBe(first.id);
    expect(second.resourceKey).not.toBe(first.resourceKey);
    expect(repos.identities.map((item) => item.identity).toSorted()).toEqual(["+819012345678", "+819099988877"]);
  });

  it("re-resolves by identity after binding so an orphan user is not returned on conflicts", async () => {
    const existingUser: User = {
      id: "existing-user",
      resourceKey: "user:existing-user",
      displayName: null,
      createdAt: "2099-03-22T00:00:00.000Z",
      updatedAt: "2099-03-22T00:00:00.000Z",
    };
    const userStore = new Map<string, User>([[existingUser.id, existingUser]]);
    const identities: MessagingIdentity[] = [
      {
        id: "identity-existing",
        userId: existingUser.id,
        channel: "imessage",
        identity: "+819012345678",
        identityType: "phone_number",
        createdAt: "2099-03-22T00:00:00.000Z",
      },
    ];
    let hideExistingIdentityOnce = true;

    const users: UserRepository = {
      findById: async (id) => userStore.get(id) ?? null,
      findByMessagingIdentity: async (_channel, identity) => {
        if (hideExistingIdentityOnce && identity === "+819012345678") {
          hideExistingIdentityOnce = false;
          return null;
        }

        const match = identities.find((item) => item.identity === identity);
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
        const existing = identities.find((item) => item.channel === input.channel && item.identity === input.identity);
        if (!existing) {
          identities.push({
            id: input.id,
            userId: input.userId,
            channel: input.channel,
            identity: input.identity,
            identityType: input.identityType,
            createdAt: input.createdAt,
          });
        }

        return {
          id: input.id,
          userId: input.userId,
          channel: input.channel,
          identity: input.identity,
          identityType: input.identityType,
          createdAt: input.createdAt,
        };
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
    const resolver = new UserContextResolver(users, wallets);

    const context = await resolver.resolve({
      sender: "+819012345678",
      text: "hello",
    });

    expect(context.id).toBe("existing-user");
    expect(context.resourceKey).toBe("user:existing-user");
  });
});
