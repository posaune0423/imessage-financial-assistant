import { randomUUID } from "node:crypto";

import type { AppWallet, UserContext } from "../../domain/users/types";
import type { UpsertAppWalletInput, WalletRepository } from "../../repositories/interfaces/wallet-repository";
import type { TurnkeyProvisioningAdapter, TurnkeyProvisioningPort } from "./interfaces";

function nowIso() {
  return new Date().toISOString();
}

export class TurnkeyProvisioningService implements TurnkeyProvisioningPort {
  private readonly inFlightProvisioning = new Map<string, Promise<AppWallet>>();

  constructor(
    private readonly wallets: WalletRepository,
    private readonly turnkey: TurnkeyProvisioningAdapter,
  ) {}

  async ensurePrimaryWallet(userContext: UserContext, options?: { force?: boolean }) {
    if (!options?.force) {
      const inFlight = this.inFlightProvisioning.get(userContext.id);
      if (inFlight) {
        return inFlight;
      }
    }
    const provisioningPromise = (async () => {
      const current = await this.wallets.findPrimaryWalletByUserId(userContext.id);
      if (!options?.force && current?.status === "ready") {
        return current;
      }

      return this.runProvisioning(userContext, current);
    })();
    this.inFlightProvisioning.set(userContext.id, provisioningPromise);

    try {
      return await provisioningPromise;
    } finally {
      if (this.inFlightProvisioning.get(userContext.id) === provisioningPromise) {
        this.inFlightProvisioning.delete(userContext.id);
      }
    }
  }

  private async runProvisioning(userContext: UserContext, current: AppWallet | null) {
    const startedAt = nowIso();
    const walletId = current?.id ?? randomUUID();

    await this.wallets.upsertPrimaryWallet({
      id: walletId,
      userId: userContext.id,
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

    try {
      const existing = await this.turnkey.lookupSubOrganizationByPhone(userContext.sender);
      const linkage =
        existing ??
        (await this.turnkey.provisionSubOrganization({
          phoneNumber: userContext.sender,
          userId: userContext.id,
        }));
      const bootstrap = await this.turnkey.bootstrapDelegatedSigner(linkage);
      const updatedAt = nowIso();

      return this.wallets.upsertPrimaryWallet(
        this.createWalletRecord({
          id: walletId,
          userId: userContext.id,
          linkage: bootstrap.linkage,
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
    userId: string;
    linkage: Awaited<ReturnType<TurnkeyProvisioningAdapter["provisionSubOrganization"]>>;
    signerStatus: UpsertAppWalletInput["signerStatus"];
    createdAt: string;
    updatedAt: string;
  }): UpsertAppWalletInput {
    return {
      id: args.id,
      userId: args.userId,
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
