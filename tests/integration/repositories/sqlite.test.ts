import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createSqliteRepositoryContext } from "../../../src/repositories/sqlite/client";
import { SqliteAppUserRepository } from "../../../src/repositories/sqlite/sqlite-app-user-repository";
import { SqliteWalletRepository } from "../../../src/repositories/sqlite/sqlite-wallet-repository";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    const cleanup = cleanups.pop();
    await cleanup?.();
  }
});

async function createRepositories() {
  const directory = await mkdtemp(join(tmpdir(), "imessage-financial-assistant-"));
  const databasePath = join(directory, "app.db");
  const context = await createSqliteRepositoryContext(`file:${databasePath}`);
  const appUsers = new SqliteAppUserRepository(context);
  const wallets = new SqliteWalletRepository(context);

  cleanups.push(async () => {
    context.client.close();
    await rm(directory, { recursive: true, force: true });
  });

  return {
    appUsers,
    wallets,
  };
}

describe("SQLite repositories", () => {
  it("persists app users and messaging identities", async () => {
    const { appUsers } = await createRepositories();

    await appUsers.createAppUser({
      id: "user-1",
      resourceKey: "app-user:user-1",
      displayName: null,
      createdAt: "2099-03-22T00:00:00.000Z",
      updatedAt: "2099-03-22T00:00:00.000Z",
    });
    await appUsers.createMessagingIdentity({
      id: "identity-1",
      appUserId: "user-1",
      channel: "imessage",
      identity: "+819012345678",
      identityType: "phone_number",
      createdAt: "2099-03-22T00:00:00.000Z",
    });
    await appUsers.createMessagingIdentity({
      id: "identity-2",
      appUserId: "user-1",
      channel: "imessage",
      identity: "chat-1",
      identityType: "chat_id",
      createdAt: "2099-03-22T00:00:01.000Z",
    });
    await appUsers.updateDisplayName("user-1", "Trader");

    await expect(appUsers.findById("user-1")).resolves.toMatchObject({
      id: "user-1",
      resourceKey: "app-user:user-1",
      displayName: "Trader",
    });
    await expect(appUsers.findByMessagingIdentity("imessage", "+819012345678")).resolves.toMatchObject({
      id: "user-1",
      resourceKey: "app-user:user-1",
      displayName: "Trader",
    });
    await expect(appUsers.listMessagingIdentities("user-1")).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          identity: "+819012345678",
          identityType: "phone_number",
        }),
        expect.objectContaining({
          identity: "chat-1",
          identityType: "chat_id",
        }),
      ]),
    );
  });

  it("upserts the primary wallet and persists state transitions", async () => {
    const { appUsers, wallets } = await createRepositories();

    await appUsers.createAppUser({
      id: "user-1",
      resourceKey: "app-user:user-1",
      displayName: null,
      createdAt: "2099-03-22T00:00:00.000Z",
      updatedAt: "2099-03-22T00:00:00.000Z",
    });

    await wallets.upsertPrimaryWallet({
      id: "wallet-1",
      appUserId: "user-1",
      chain: "ethereum",
      address: "0x1234567890abcdef1234567890abcdef12345678",
      status: "provisioning",
      turnkeyOrganizationId: "org-1",
      turnkeyEndUserId: "end-user-1",
      turnkeyWalletId: "turnkey-wallet-1",
      turnkeyAccountId: "turnkey-account-1",
      turnkeyDelegatedUserId: "delegated-1",
      turnkeyDelegatedKeyRef: "turnkey/delegated/org-1/delegated-1",
      signerStatus: "bootstrapping",
      provisionedFrom: "phone_number_first_message",
      createdAt: "2099-03-22T00:00:00.000Z",
      updatedAt: "2099-03-22T00:00:00.000Z",
    });
    await wallets.updateWalletStatus("user-1", "ready", "2099-03-22T00:00:01.000Z");
    await wallets.updateSignerStatus("user-1", "ready", "2099-03-22T00:00:02.000Z");

    await expect(wallets.findPrimaryWalletByAppUserId("user-1")).resolves.toMatchObject({
      id: "wallet-1",
      appUserId: "user-1",
      address: "0x1234567890abcdef1234567890abcdef12345678",
      status: "ready",
      signerStatus: "ready",
      turnkeyOrganizationId: "org-1",
      turnkeyDelegatedUserId: "delegated-1",
    });
  });
});
