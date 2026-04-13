import { and, eq } from "drizzle-orm";

import type { MessagingChannel, MessagingIdentity, MessagingIdentityType, User } from "../../domain/users/types";
import type { CreateUserInput, CreateMessagingIdentityInput, UserRepository } from "../interfaces/user-repository";
import type { SqliteRepositoryContext } from "./client";
import { messagingIdentitiesTable, usersTable } from "./schema";

function mapUser(row: typeof usersTable.$inferSelect): User {
  return {
    id: row.id,
    resourceKey: row.resourceKey,
    displayName: row.displayName,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapMessagingIdentity(row: typeof messagingIdentitiesTable.$inferSelect): MessagingIdentity {
  const channel: MessagingChannel = row.channel === "imessage" ? row.channel : "imessage";
  const identityType: MessagingIdentityType =
    row.identityType === "chat_id" || row.identityType === "phone_number" ? row.identityType : "phone_number";

  return {
    id: row.id,
    userId: row.userId,
    channel,
    identity: row.identity,
    identityType,
    createdAt: row.createdAt,
  };
}

export class SqliteUserRepository implements UserRepository {
  constructor(private readonly context: SqliteRepositoryContext) {}

  async findById(id: string): Promise<User | null> {
    const row = await this.context.db.query.usersTable.findFirst({
      where: eq(usersTable.id, id),
    });
    return row ? mapUser(row) : null;
  }

  async findByMessagingIdentity(channel: MessagingIdentity["channel"], identity: string): Promise<User | null> {
    const row = await this.context.db
      .select({
        id: usersTable.id,
        resourceKey: usersTable.resourceKey,
        displayName: usersTable.displayName,
        createdAt: usersTable.createdAt,
        updatedAt: usersTable.updatedAt,
      })
      .from(messagingIdentitiesTable)
      .innerJoin(usersTable, eq(messagingIdentitiesTable.userId, usersTable.id))
      .where(and(eq(messagingIdentitiesTable.channel, channel), eq(messagingIdentitiesTable.identity, identity)))
      .limit(1);

    return row[0] ? mapUser(row[0]) : null;
  }

  async listMessagingIdentities(userId: string): Promise<MessagingIdentity[]> {
    const rows = await this.context.db.query.messagingIdentitiesTable.findMany({
      where: eq(messagingIdentitiesTable.userId, userId),
    });

    return rows.map(mapMessagingIdentity);
  }

  async createUser(input: CreateUserInput): Promise<User> {
    await this.context.db.insert(usersTable).values({
      id: input.id,
      resourceKey: input.resourceKey,
      displayName: input.displayName ?? null,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    });

    return {
      id: input.id,
      resourceKey: input.resourceKey,
      displayName: input.displayName ?? null,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    };
  }

  async createMessagingIdentity(input: CreateMessagingIdentityInput): Promise<MessagingIdentity> {
    await this.context.db
      .insert(messagingIdentitiesTable)
      .values({
        id: input.id,
        userId: input.userId,
        channel: input.channel,
        identity: input.identity,
        identityType: input.identityType,
        createdAt: input.createdAt,
      })
      .onConflictDoNothing();

    return {
      id: input.id,
      userId: input.userId,
      channel: input.channel,
      identity: input.identity,
      identityType: input.identityType,
      createdAt: input.createdAt,
    };
  }

  async updateDisplayName(userId: string, displayName: string | null): Promise<void> {
    await this.context.db
      .update(usersTable)
      .set({
        displayName,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(usersTable.id, userId));
  }
}
