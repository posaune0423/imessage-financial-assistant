import { and, eq } from "drizzle-orm";

import type { AppUser, MessagingIdentity } from "../../domain/users/types";
import type {
  AppUserRepository,
  CreateAppUserInput,
  CreateMessagingIdentityInput,
} from "../interfaces/app-user-repository";
import type { SqliteRepositoryContext } from "./client";
import { appUsersTable, messagingIdentitiesTable } from "./schema";

function mapAppUser(row: typeof appUsersTable.$inferSelect): AppUser {
  return {
    id: row.id,
    resourceKey: row.resourceKey,
    displayName: row.displayName,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapMessagingIdentity(row: typeof messagingIdentitiesTable.$inferSelect): MessagingIdentity {
  const channel = row.channel === "imessage" ? "imessage" : "imessage";
  const identityType = row.identityType === "chat_id" ? "chat_id" : "phone_number";

  return {
    id: row.id,
    appUserId: row.appUserId,
    channel,
    identity: row.identity,
    identityType,
    createdAt: row.createdAt,
  };
}

export class SqliteAppUserRepository implements AppUserRepository {
  constructor(private readonly context: SqliteRepositoryContext) {}

  async findById(id: string): Promise<AppUser | null> {
    const row = await this.context.db.query.appUsersTable.findFirst({
      where: eq(appUsersTable.id, id),
    });
    return row ? mapAppUser(row) : null;
  }

  async findByMessagingIdentity(channel: MessagingIdentity["channel"], identity: string): Promise<AppUser | null> {
    const row = await this.context.db
      .select({
        id: appUsersTable.id,
        resourceKey: appUsersTable.resourceKey,
        displayName: appUsersTable.displayName,
        createdAt: appUsersTable.createdAt,
        updatedAt: appUsersTable.updatedAt,
      })
      .from(messagingIdentitiesTable)
      .innerJoin(appUsersTable, eq(messagingIdentitiesTable.appUserId, appUsersTable.id))
      .where(and(eq(messagingIdentitiesTable.channel, channel), eq(messagingIdentitiesTable.identity, identity)))
      .limit(1);

    return row[0] ? mapAppUser(row[0]) : null;
  }

  async listMessagingIdentities(appUserId: string): Promise<MessagingIdentity[]> {
    const rows = await this.context.db.query.messagingIdentitiesTable.findMany({
      where: eq(messagingIdentitiesTable.appUserId, appUserId),
    });

    return rows.map(mapMessagingIdentity);
  }

  async createAppUser(input: CreateAppUserInput): Promise<AppUser> {
    await this.context.db.insert(appUsersTable).values({
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
        appUserId: input.appUserId,
        channel: input.channel,
        identity: input.identity,
        identityType: input.identityType,
        createdAt: input.createdAt,
      })
      .onConflictDoNothing();

    return {
      id: input.id,
      appUserId: input.appUserId,
      channel: input.channel,
      identity: input.identity,
      identityType: input.identityType,
      createdAt: input.createdAt,
    };
  }

  async updateDisplayName(appUserId: string, displayName: string | null): Promise<void> {
    await this.context.db
      .update(appUsersTable)
      .set({
        displayName,
      })
      .where(eq(appUsersTable.id, appUserId));
  }
}
