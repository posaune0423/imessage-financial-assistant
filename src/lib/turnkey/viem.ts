import { ApiKeyStamper } from "@turnkey/sdk-server";
import { TurnkeyClient } from "@turnkey/http";
import { createAccount } from "@turnkey/viem";

import type { TurnkeyConfig } from "../../config";
import type { AppWallet } from "../../domain/users/types";
import type { TurnkeySignerClientFactory } from "./interfaces";

export class TurnkeyViemAccountFactory implements TurnkeySignerClientFactory {
  constructor(private readonly config: TurnkeyConfig) {}

  async createSignerClient(wallet: AppWallet) {
    if (!wallet.turnkeyOrganizationId || !wallet.turnkeyAccountId) {
      throw new Error("Wallet is missing Turnkey linkage");
    }

    const client = new TurnkeyClient(
      {
        baseUrl: this.config.apiBaseUrl,
      },
      new ApiKeyStamper({
        apiPublicKey: this.config.apiPublicKey,
        apiPrivateKey: this.config.apiPrivateKey,
      }),
    );

    return createAccount({
      client,
      organizationId: wallet.turnkeyOrganizationId,
      signWith: wallet.turnkeyAccountId,
      ethereumAddress: wallet.address ?? undefined,
    });
  }
}
