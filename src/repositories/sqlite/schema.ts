import { sql } from "drizzle-orm";
import { sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const usersTable = sqliteTable(
  "app_users",
  {
    id: text("id").primaryKey(),
    resourceKey: text("resource_key").notNull(),
    displayName: text("display_name"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("app_users_resource_key_unique").on(table.resourceKey)],
);

export const messagingIdentitiesTable = sqliteTable(
  "messaging_identities",
  {
    id: text("id").primaryKey(),
    userId: text("app_user_id")
      .notNull()
      .references(() => usersTable.id),
    channel: text("channel").notNull(),
    identity: text("identity").notNull(),
    identityType: text("identity_type").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("messaging_identities_channel_identity_unique").on(table.channel, table.identity)],
);

export const appWalletsTable = sqliteTable(
  "app_wallets",
  {
    id: text("id").primaryKey(),
    userId: text("app_user_id")
      .notNull()
      .references(() => usersTable.id),
    chain: text("chain").notNull(),
    address: text("address"),
    status: text("status").notNull(),
    turnkeyOrganizationId: text("turnkey_organization_id"),
    turnkeyEndUserId: text("turnkey_end_user_id"),
    turnkeyWalletId: text("turnkey_wallet_id"),
    turnkeyAccountId: text("turnkey_account_id"),
    turnkeyDelegatedUserId: text("turnkey_delegated_user_id"),
    turnkeyDelegatedKeyRef: text("turnkey_delegated_key_ref"),
    signerStatus: text("signer_status").notNull(),
    provisionedFrom: text("provisioned_from"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("app_wallets_app_user_id_unique").on(table.userId)],
);

export async function ensureSqliteSchema(db: { run: (statement: ReturnType<typeof sql>) => Promise<unknown> }) {
  await db.run(sql`
    create table if not exists app_users (
      id text primary key,
      resource_key text not null unique,
      display_name text,
      created_at text not null,
      updated_at text not null
    )
  `);
  await db.run(sql`
    create table if not exists messaging_identities (
      id text primary key,
      app_user_id text not null references app_users(id),
      channel text not null,
      identity text not null,
      identity_type text not null,
      created_at text not null
    )
  `);
  await db.run(sql`
    create unique index if not exists messaging_identities_channel_identity_unique
    on messaging_identities(channel, identity)
  `);
  await db.run(sql`
    create table if not exists app_wallets (
      id text primary key,
      app_user_id text not null unique references app_users(id),
      chain text not null,
      address text,
      status text not null,
      turnkey_organization_id text,
      turnkey_end_user_id text,
      turnkey_wallet_id text,
      turnkey_account_id text,
      turnkey_delegated_user_id text,
      turnkey_delegated_key_ref text,
      signer_status text not null,
      provisioned_from text,
      created_at text not null,
      updated_at text not null
    )
  `);
}
