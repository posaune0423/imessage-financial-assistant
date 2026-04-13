import { randomUUID } from "node:crypto";

import type { UserRepository } from "../../repositories/interfaces/user-repository";
import type { WalletRepository } from "../../repositories/interfaces/wallet-repository";
import { normalizePhone } from "../../utils/phone";
import type { IncomingUserMessage, MessagingIdentity, MessagingIdentityType, UserContext } from "./types";

function nowIso() {
  return new Date().toISOString();
}

function createResourceKey(userId: string) {
  return `user:${userId}`;
}

function createIdentityRecord(
  userId: string,
  identity: string,
  identityType: MessagingIdentityType,
): MessagingIdentity {
  return {
    id: randomUUID(),
    userId,
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
    private readonly users: UserRepository,
    private readonly wallets: WalletRepository,
  ) {}

  async resolve(message: IncomingUserMessage): Promise<UserContext> {
    const sender = message.sender?.trim();
    if (!sender) {
      throw new Error("Cannot resolve user context without sender");
    }

    const chatId = message.chatId?.trim() || undefined;
    const candidates = buildIdentityCandidates(message);
    const user = (await this.findExistingUser(candidates)) ?? (await this.createUser());

    await this.bindMissingIdentities(user.id, candidates);

    const existingUser = await this.users.findById(user.id);
    if (!existingUser) {
      throw new Error(`Failed to reload user ${user.id}`);
    }

    const wallet = await this.wallets.findPrimaryWalletByUserId(existingUser.id);
    return {
      id: existingUser.id,
      resourceKey: existingUser.resourceKey,
      sender: normalizePhone(sender),
      chatId,
      displayName: existingUser.displayName ?? null,
      wallet,
    };
  }

  private async createUser() {
    const id = randomUUID();
    const createdAt = nowIso();

    return this.users.createUser({
      id,
      resourceKey: createResourceKey(id),
      createdAt,
      updatedAt: createdAt,
    });
  }

  private async findExistingUser(candidates: MessagingIdentity[]) {
    for (const candidate of candidates) {
      const user = await this.users.findByMessagingIdentity(candidate.channel, candidate.identity);
      if (user) {
        return user;
      }
    }

    return null;
  }

  private async bindMissingIdentities(userId: string, candidates: MessagingIdentity[]) {
    const existing = await this.users.listMessagingIdentities(userId);
    const existingKeys = new Set(existing.map((item) => `${item.channel}:${item.identity}`));

    for (const candidate of candidates) {
      const key = `${candidate.channel}:${candidate.identity}`;
      if (existingKeys.has(key)) {
        continue;
      }

      await this.users.createMessagingIdentity({
        id: candidate.id,
        userId,
        channel: candidate.channel,
        identity: candidate.identity,
        identityType: candidate.identityType,
        createdAt: candidate.createdAt,
      });
    }
  }
}
