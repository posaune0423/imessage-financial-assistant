import { Turnkey } from "@turnkey/sdk-server";

import type { TurnkeyConfig } from "../../config";
import type { TurnkeyProvisioningAdapter, TurnkeyWalletLinkage } from "./interfaces";
import { logger } from "../../utils/logger";

const DEFAULT_ETHEREUM_ACCOUNT = {
  curve: "CURVE_SECP256K1",
  pathFormat: "PATH_FORMAT_BIP32",
  path: "m/44'/60'/0'/0/0",
  addressFormat: "ADDRESS_FORMAT_ETHEREUM",
} as const;

type UnaryCallable = (input: unknown) => unknown;
const TURNKEY_LOG_VALUE_LIMIT = 1_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getString(value: unknown, key: string): string | null {
  if (!isRecord(value)) {
    return null;
  }

  const candidate = value[key];
  return typeof candidate === "string" && candidate.trim() ? candidate : null;
}

function getArray(value: unknown, key: string): unknown[] {
  if (!isRecord(value)) {
    return [];
  }

  const candidate = value[key];
  return Array.isArray(candidate) ? candidate : [];
}

function isHexAddress(value: string): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function asHexAddress(value: string | null): `0x${string}` | null {
  if (!value || !isHexAddress(value)) {
    return null;
  }

  return value;
}

function isCallable(value: unknown): value is UnaryCallable {
  return typeof value === "function";
}

function getAddressFromAccount(account: unknown): `0x${string}` | null {
  const direct =
    getString(account, "address") ??
    getString(account, "ethereumAddress") ??
    getString(getArray(account, "addresses")[0], "address") ??
    getString(getArray(account, "addresses")[0], "formattedAddress");

  return asHexAddress(direct);
}

function getTurnkeyMethod(target: unknown, methodName: string): (input: unknown) => Promise<unknown> {
  if (!isRecord(target)) {
    throw new TypeError("Turnkey API client is not an object");
  }

  const candidate = target[methodName];
  if (!isCallable(candidate)) {
    throw new TypeError(`Turnkey API client is missing method ${methodName}`);
  }

  const boundCandidate = candidate.bind(target);

  return async (input: unknown) => {
    const result = await Promise.resolve(boundCandidate(input));
    return result;
  };
}

function getWalletId(wallet: unknown): string | null {
  const direct = getString(wallet, "walletId");
  if (direct) {
    return direct;
  }

  const nested = isRecord(wallet) ? wallet.walletId : null;
  return getString(nested, "walletId");
}

function getWalletAccountId(account: unknown): string | null {
  return getString(account, "walletAccountId");
}

function getUserPhoneNumber(user: unknown): string | null {
  return getString(user, "userPhoneNumber");
}

function getUserId(user: unknown): string | null {
  return getString(user, "userId");
}

function formatDebugValue(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    if (!serialized) {
      return String(value);
    }

    return serialized.length > TURNKEY_LOG_VALUE_LIMIT
      ? `${serialized.slice(0, TURNKEY_LOG_VALUE_LIMIT)}...`
      : serialized;
  } catch {
    return String(value);
  }
}

function formatTurnkeyConfigurationError(organizationId: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("could not find public key in organization")) {
    return new Error(
      `Turnkey authentication failed. TURNKEY_ORGANIZATION_ID (${organizationId}) must be the organization that owns TURNKEY_API_PUBLIC_KEY. Verify that TURNKEY_API_PUBLIC_KEY and TURNKEY_API_PRIVATE_KEY were created under that organization.`,
      { cause: error },
    );
  }

  return new Error(`Turnkey request failed for organization ${organizationId}: ${message}`, { cause: error });
}

export class TurnkeyProvisioningClient implements TurnkeyProvisioningAdapter {
  private readonly sdk: Turnkey;

  constructor(private readonly config: TurnkeyConfig) {
    this.sdk = new Turnkey({
      apiBaseUrl: config.apiBaseUrl,
      apiPublicKey: config.apiPublicKey,
      apiPrivateKey: config.apiPrivateKey,
      defaultOrganizationId: config.organizationId,
    });
  }

  async validateAccess(): Promise<void> {
    const client = this.sdk.apiClient();
    const whoami = getTurnkeyMethod(client, "getWhoami");

    try {
      await this.runTurnkeyRequest(
        "getWhoami",
        {
          organizationId: this.config.organizationId,
        },
        async () =>
          whoami({
            organizationId: this.config.organizationId,
          }),
      );
    } catch (error) {
      throw formatTurnkeyConfigurationError(this.config.organizationId, error);
    }
  }

  async lookupSubOrganizationByPhone(phoneNumber: string): Promise<TurnkeyWalletLinkage | null> {
    const client = this.sdk.apiClient();
    const getVerifiedSubOrgIds = getTurnkeyMethod(client, "getVerifiedSubOrgIds");
    const response = await this.runTurnkeyRequest(
      "getVerifiedSubOrgIds",
      {
        organizationId: this.config.organizationId,
        filterType: "PHONE_NUMBER",
        filterValue: phoneNumber,
      },
      async () =>
        getVerifiedSubOrgIds({
          organizationId: this.config.organizationId,
          filterType: "PHONE_NUMBER",
          filterValue: phoneNumber,
        }),
    );
    const organizationId = getArray(response, "organizationIds")[0];

    if (typeof organizationId !== "string" || !organizationId.trim()) {
      return null;
    }

    return this.loadWalletLinkage(organizationId);
  }

  async provisionSubOrganization(input: { phoneNumber: string; userId: string }): Promise<TurnkeyWalletLinkage> {
    const client = this.sdk.apiClient();
    const createSubOrganization = getTurnkeyMethod(client, "createSubOrganization");
    const request = {
      subOrganizationName: `imessage-user-${input.userId}`,
      rootQuorumThreshold: 1,
      rootUsers: [
        {
          userName: input.phoneNumber,
          userPhoneNumber: input.phoneNumber,
          apiKeys: [],
          authenticators: [],
          oauthProviders: [],
        },
      ],
      wallet: {
        walletName: "Primary Wallet",
        accounts: [DEFAULT_ETHEREUM_ACCOUNT],
      },
    } as const;
    const response = await this.runTurnkeyRequest("createSubOrganization", request, async () =>
      createSubOrganization(request),
    );

    const organizationId = getString(response, "subOrganizationId");
    if (!organizationId) {
      throw new Error("Turnkey createSubOrganization did not return a subOrganizationId");
    }

    return this.loadWalletLinkage(organizationId);
  }

  async bootstrapDelegatedSigner(linkage: TurnkeyWalletLinkage) {
    return {
      signerStatus: linkage.delegatedUserId ? "ready" : "degraded",
    } as const;
  }

  private async loadWalletLinkage(organizationId: string): Promise<TurnkeyWalletLinkage> {
    const client = this.sdk.apiClient();
    const getUsers = getTurnkeyMethod(client, "getUsers");
    const getWallets = getTurnkeyMethod(client, "getWallets");
    const [usersResponse, walletsResponse] = await this.runTurnkeyRequest(
      "loadWalletLinkage:getUsers+getWallets",
      {
        organizationId,
      },
      async () =>
        Promise.all([
          getUsers({
            organizationId,
          }),
          getWallets({
            organizationId,
          }),
        ]),
    );

    const wallet = getArray(walletsResponse, "wallets")[0];
    const walletId = getWalletId(wallet);
    if (!walletId) {
      throw new Error(`Turnkey sub-organization ${organizationId} has no wallet`);
    }

    const getWalletAccounts = getTurnkeyMethod(client, "getWalletAccounts");
    const accountsResponse = await this.runTurnkeyRequest(
      "getWalletAccounts",
      {
        organizationId,
        walletId,
      },
      async () =>
        getWalletAccounts({
          organizationId,
          walletId,
        }),
    );
    const account = getArray(accountsResponse, "accounts")[0];
    const accountId = getWalletAccountId(account);
    const address = getAddressFromAccount(account);
    if (!accountId || !address) {
      throw new Error(`Turnkey wallet ${walletId} is missing an Ethereum account`);
    }

    const users = getArray(usersResponse, "users");
    const phoneUser = users.find((user) => typeof getUserPhoneNumber(user) === "string");
    const phoneUserId = phoneUser ? getUserId(phoneUser) : null;
    const delegatedUser = users.find((user) => {
      const userId = getUserId(user);
      return userId !== null && userId !== phoneUserId;
    });
    const delegatedUserId = delegatedUser ? getUserId(delegatedUser) : null;

    return {
      organizationId,
      endUserId: phoneUserId,
      walletId,
      accountId,
      address,
      delegatedUserId,
      delegatedKeyRef: delegatedUserId
        ? `${this.config.delegatedKeySecretNamespace}/${organizationId}/${delegatedUserId}`
        : null,
    };
  }

  private async runTurnkeyRequest<T>(operationName: string, input: unknown, operation: () => Promise<T>): Promise<T> {
    logger.debug(`[turnkey] -> ${operationName} input=${formatDebugValue(input)}`);

    try {
      const result = await operation();
      logger.debug(`[turnkey] <- ${operationName} result=${formatDebugValue(result)}`);
      return result;
    } catch (error) {
      logger.debug(
        `[turnkey] !! ${operationName} error=${formatDebugValue(error instanceof Error ? error.message : error)}`,
      );
      throw formatTurnkeyConfigurationError(this.config.organizationId, error);
    }
  }
}
