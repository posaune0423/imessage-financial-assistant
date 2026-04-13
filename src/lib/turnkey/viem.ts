import { ApiKeyStamper } from "@turnkey/sdk-server";
import { TurnkeyClient } from "@turnkey/http";
import { createAccount } from "@turnkey/viem";
import { getAddress } from "viem";

import type { TurnkeyConfig } from "../../config";
import type { AppWallet } from "../../domain/users/types";
import type { TurnkeySignerClientFactory } from "./interfaces";
import { readDelegatedApiKeyCredentials } from "./delegated-credentials";

export class TurnkeyViemAccountFactory implements TurnkeySignerClientFactory {
  constructor(private readonly config: TurnkeyConfig) {}

  async createSignerClient(wallet: AppWallet) {
    if (!wallet.turnkeyOrganizationId || !wallet.turnkeyDelegatedKeyRef || !wallet.address) {
      throw new Error("Wallet is missing Turnkey linkage");
    }

    const delegatedCredentials = readDelegatedApiKeyCredentials(wallet.turnkeyDelegatedKeyRef);
    const ethereumAddress = getAddress(wallet.address);

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
      signWith: ethereumAddress,
      ethereumAddress,
    });
  }
}
