import { eq } from "drizzle-orm";

import type { AppWallet } from "../../domain/users/types";
import type { UpsertAppWalletInput, WalletRepository } from "../interfaces/wallet-repository";
import type { SqliteRepositoryContext } from "./client";
import { appWalletsTable } from "./schema";

function isHexAddress(value: string): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function toWalletStatus(value: string): AppWallet["status"] {
  if (value === "provisioning" || value === "ready" || value === "failed") {
    return value;
  }

  return "none";
}

function toSignerStatus(value: string): AppWallet["signerStatus"] {
  if (value === "bootstrapping" || value === "ready" || value === "degraded") {
    return value;
  }

  return "not_bootstrapped";
}

function mapAppWallet(row: typeof appWalletsTable.$inferSelect): AppWallet {
  return {
    id: row.id,
    appUserId: row.appUserId,
    chain: row.chain,
    address: row.address && isHexAddress(row.address) ? row.address : null,
    status: toWalletStatus(row.status),
    turnkeyOrganizationId: row.turnkeyOrganizationId,
    turnkeyEndUserId: row.turnkeyEndUserId,
    turnkeyWalletId: row.turnkeyWalletId,
    turnkeyAccountId: row.turnkeyAccountId,
    turnkeyDelegatedUserId: row.turnkeyDelegatedUserId,
    turnkeyDelegatedKeyRef: row.turnkeyDelegatedKeyRef,
    signerStatus: toSignerStatus(row.signerStatus),
    provisionedFrom: row.provisionedFrom,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class SqliteWalletRepository implements WalletRepository {
  constructor(private readonly context: SqliteRepositoryContext) {}

  async findPrimaryWalletByAppUserId(appUserId: string): Promise<AppWallet | null> {
    const row = await this.context.db.query.appWalletsTable.findFirst({
      where: eq(appWalletsTable.appUserId, appUserId),
    });
    return row ? mapAppWallet(row) : null;
  }

  async upsertPrimaryWallet(input: UpsertAppWalletInput): Promise<AppWallet> {
    await this.context.db
      .insert(appWalletsTable)
      .values({
        id: input.id,
        appUserId: input.appUserId,
        chain: input.chain,
        address: input.address,
        status: input.status,
        turnkeyOrganizationId: input.turnkeyOrganizationId,
        turnkeyEndUserId: input.turnkeyEndUserId,
        turnkeyWalletId: input.turnkeyWalletId,
        turnkeyAccountId: input.turnkeyAccountId,
        turnkeyDelegatedUserId: input.turnkeyDelegatedUserId,
        turnkeyDelegatedKeyRef: input.turnkeyDelegatedKeyRef,
        signerStatus: input.signerStatus,
        provisionedFrom: input.provisionedFrom,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
      })
      .onConflictDoUpdate({
        target: appWalletsTable.appUserId,
        set: {
          chain: input.chain,
          address: input.address,
          status: input.status,
          turnkeyOrganizationId: input.turnkeyOrganizationId,
          turnkeyEndUserId: input.turnkeyEndUserId,
          turnkeyWalletId: input.turnkeyWalletId,
          turnkeyAccountId: input.turnkeyAccountId,
          turnkeyDelegatedUserId: input.turnkeyDelegatedUserId,
          turnkeyDelegatedKeyRef: input.turnkeyDelegatedKeyRef,
          signerStatus: input.signerStatus,
          provisionedFrom: input.provisionedFrom,
          updatedAt: input.updatedAt,
        },
      });

    const row = await this.context.db.query.appWalletsTable.findFirst({
      where: eq(appWalletsTable.appUserId, input.appUserId),
    });

    if (!row) {
      throw new Error(`Expected wallet upsert for app user ${input.appUserId}`);
    }

    return mapAppWallet(row);
  }

  async updateWalletStatus(appUserId: string, status: AppWallet["status"], updatedAt: string): Promise<void> {
    await this.context.db
      .update(appWalletsTable)
      .set({
        status,
        updatedAt,
      })
      .where(eq(appWalletsTable.appUserId, appUserId));
  }

  async updateSignerStatus(
    appUserId: string,
    signerStatus: AppWallet["signerStatus"],
    updatedAt: string,
  ): Promise<void> {
    await this.context.db
      .update(appWalletsTable)
      .set({
        signerStatus,
        updatedAt,
      })
      .where(eq(appWalletsTable.appUserId, appUserId));
  }
}
