import { ApiKeyStamper } from "@turnkey/sdk-server";
import { TurnkeyClient } from "@turnkey/http";
import { createAccount } from "@turnkey/viem";

import type { TurnkeyConfig } from "../../config";
import type { AppWallet } from "../../domain/users/types";
import type { TurnkeySignerClientFactory } from "./interfaces";
import { readDelegatedApiKeyCredentials } from "./delegated-credentials";

export class TurnkeyViemAccountFactory implements TurnkeySignerClientFactory {
  constructor(private readonly config: TurnkeyConfig) {}

  async createSignerClient(wallet: AppWallet) {
    if (!wallet.turnkeyOrganizationId || !wallet.turnkeyAccountId || !wallet.turnkeyDelegatedKeyRef) {
      throw new Error("Wallet is missing Turnkey linkage");
    }

    const delegatedCredentials = readDelegatedApiKeyCredentials(wallet.turnkeyDelegatedKeyRef);

    const client = new TurnkeyClient(
      {
        baseUrl: this.config.apiBaseUrl,
      },
      new ApiKeyStamper({
        apiPublicKey: delegatedCredentials.apiPublicKey,
        apiPrivateKey: delegatedCredentials.apiPrivateKey,
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
