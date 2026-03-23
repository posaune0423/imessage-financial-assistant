import { randomUUID } from "node:crypto";

import type { UserContext } from "../../domain/users/types";
import type { UpsertAppWalletInput, WalletRepository } from "../../repositories/interfaces/wallet-repository";
import type { TurnkeyProvisioningAdapter, TurnkeyProvisioningPort } from "./interfaces";

function nowIso() {
  return new Date().toISOString();
}

export class TurnkeyProvisioningService implements TurnkeyProvisioningPort {
  constructor(
    private readonly wallets: WalletRepository,
    private readonly turnkey: TurnkeyProvisioningAdapter,
  ) {}

  async ensurePrimaryWallet(userContext: UserContext, options?: { force?: boolean }) {
    const current = await this.wallets.findPrimaryWalletByAppUserId(userContext.id);
    if (!options?.force && current?.status === "ready") {
      return current;
    }

    const startedAt = nowIso();
    const walletId = current?.id ?? randomUUID();

    await this.wallets.upsertPrimaryWallet({
      id: walletId,
      appUserId: userContext.id,
      chain: current?.chain ?? "ethereum",
      address: current?.address ?? null,
      status: "provisioning",
      turnkeyOrganizationId: current?.turnkeyOrganizationId ?? null,
      turnkeyEndUserId: current?.turnkeyEndUserId ?? null,
      turnkeyWalletId: current?.turnkeyWalletId ?? null,
      turnkeyAccountId: current?.turnkeyAccountId ?? null,
      turnkeyDelegatedUserId: current?.turnkeyDelegatedUserId ?? null,
      turnkeyDelegatedKeyRef: current?.turnkeyDelegatedKeyRef ?? null,
      signerStatus: current?.signerStatus ?? "bootstrapping",
      provisionedFrom: current?.provisionedFrom ?? "phone_number_first_message",
      createdAt: current?.createdAt ?? startedAt,
      updatedAt: startedAt,
    });

    if (!this.turnkey.isConfigured()) {
      await this.wallets.updateWalletStatus(userContext.id, "failed", nowIso());
      await this.wallets.updateSignerStatus(userContext.id, "degraded", nowIso());
      throw new Error("Turnkey is not configured");
    }

    try {
      const existing = await this.turnkey.lookupSubOrganizationByPhone(userContext.sender);
      const linkage =
        existing ??
        (await this.turnkey.provisionSubOrganization({
          phoneNumber: userContext.sender,
          appUserId: userContext.id,
        }));
      const bootstrap = await this.turnkey.bootstrapDelegatedSigner(linkage);
      const updatedAt = nowIso();

      return this.wallets.upsertPrimaryWallet(
        this.createWalletRecord({
          id: walletId,
          appUserId: userContext.id,
          linkage,
          signerStatus: bootstrap.signerStatus,
          createdAt: current?.createdAt ?? startedAt,
          updatedAt,
        }),
      );
    } catch (error) {
      const updatedAt = nowIso();
      await this.wallets.updateWalletStatus(userContext.id, "failed", updatedAt);
      await this.wallets.updateSignerStatus(userContext.id, "degraded", updatedAt);
      throw error;
    }
  }

  private createWalletRecord(args: {
    id: string;
    appUserId: string;
    linkage: Awaited<ReturnType<TurnkeyProvisioningAdapter["provisionSubOrganization"]>>;
    signerStatus: UpsertAppWalletInput["signerStatus"];
    createdAt: string;
    updatedAt: string;
  }): UpsertAppWalletInput {
    return {
      id: args.id,
      appUserId: args.appUserId,
      chain: "ethereum",
      address: args.linkage.address,
      status: "ready",
      turnkeyOrganizationId: args.linkage.organizationId,
      turnkeyEndUserId: args.linkage.endUserId,
      turnkeyWalletId: args.linkage.walletId,
      turnkeyAccountId: args.linkage.accountId,
      turnkeyDelegatedUserId: args.linkage.delegatedUserId,
      turnkeyDelegatedKeyRef: args.linkage.delegatedKeyRef,
      signerStatus: args.signerStatus,
      provisionedFrom: "phone_number_first_message",
      createdAt: args.createdAt,
      updatedAt: args.updatedAt,
    };
  }
}
