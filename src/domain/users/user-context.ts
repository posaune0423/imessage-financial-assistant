import { randomUUID } from "node:crypto";

import { normalizePhone } from "../../utils/phone";
import type { AppUserRepository } from "../../repositories/interfaces/app-user-repository";
import type { WalletRepository } from "../../repositories/interfaces/wallet-repository";
import type { IncomingUserMessage, MessagingIdentity, MessagingIdentityType, UserContext } from "./types";

function nowIso() {
  return new Date().toISOString();
}

function createResourceKey(appUserId: string) {
  return `app-user:${appUserId}`;
}

function createIdentityRecord(
  appUserId: string,
  identity: string,
  identityType: MessagingIdentityType,
): MessagingIdentity {
  return {
    id: randomUUID(),
    appUserId,
    channel: "imessage",
    identity,
    identityType,
    createdAt: nowIso(),
  };
}

function buildIdentityCandidates(message: IncomingUserMessage): Array<MessagingIdentity> {
  const sender = message.sender?.trim();
  const chatId = message.chatId?.trim();
  const identities: Array<MessagingIdentity> = [];

  if (sender) {
    identities.push(createIdentityRecord("", normalizePhone(sender), "phone_number"));
  }

  if (chatId) {
    identities.push(createIdentityRecord("", chatId, "chat_id"));
  }

  return identities;
}

export class UserContextResolver {
  constructor(
    private readonly appUsers: AppUserRepository,
    private readonly wallets: WalletRepository,
  ) {}

  async resolve(message: IncomingUserMessage): Promise<UserContext> {
    const sender = message.sender?.trim();
    if (!sender) {
      throw new Error("Cannot resolve user context without sender");
    }

    const chatId = message.chatId?.trim() || undefined;
    const candidates = buildIdentityCandidates(message);
    const appUser = (await this.findExistingUser(candidates)) ?? (await this.createAppUser());

    await this.bindMissingIdentities(appUser.id, candidates);

    const existingUser = await this.appUsers.findById(appUser.id);
    if (!existingUser) {
      throw new Error(`Failed to reload app user ${appUser.id}`);
    }

    const wallet = await this.wallets.findPrimaryWalletByAppUserId(existingUser.id);
    return {
      id: existingUser.id,
      resourceKey: existingUser.resourceKey,
      sender: normalizePhone(sender),
      chatId,
      displayName: existingUser.displayName ?? null,
      wallet,
    };
  }

  private async createAppUser() {
    const id = randomUUID();
    const createdAt = nowIso();

    return this.appUsers.createAppUser({
      id,
      resourceKey: createResourceKey(id),
      createdAt,
      updatedAt: createdAt,
    });
  }

  private async findExistingUser(candidates: MessagingIdentity[]) {
    for (const candidate of candidates) {
      const appUser = await this.appUsers.findByMessagingIdentity(candidate.channel, candidate.identity);
      if (appUser) {
        return appUser;
      }
    }

    return null;
  }

  private async bindMissingIdentities(appUserId: string, candidates: MessagingIdentity[]) {
    const existing = await this.appUsers.listMessagingIdentities(appUserId);
    const existingKeys = new Set(existing.map((item) => `${item.channel}:${item.identity}`));

    for (const candidate of candidates) {
      const key = `${candidate.channel}:${candidate.identity}`;
      if (existingKeys.has(key)) {
        continue;
      }

      await this.appUsers.createMessagingIdentity({
        id: candidate.id,
        appUserId,
        channel: candidate.channel,
        identity: candidate.identity,
        identityType: candidate.identityType,
        createdAt: candidate.createdAt,
      });
    }
  }
}
