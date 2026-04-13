import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createECDH } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export interface TurnkeyDelegatedApiKeyCredentials {
  apiPublicKey: string;
  apiPrivateKey: string;
}

const DEFAULT_DELEGATED_KEY_STORE_ROOT = fileURLToPath(
  new URL("../../../data/turnkey-delegated-keys", import.meta.url),
);

function getDelegatedKeyStoreRoot(): string {
  const override = process.env.TURNKEY_DELEGATED_KEY_STORE_ROOT?.trim();
  return override ? override : DEFAULT_DELEGATED_KEY_STORE_ROOT;
}

function toKeySegments(keyRef: string): string[] {
  const segments = keyRef.split("/").filter(Boolean);
  if (segments.length === 0 || segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error(`Invalid delegated key ref: ${keyRef}`);
  }

  return segments;
}

function getCredentialPath(keyRef: string): string {
  return join(getDelegatedKeyStoreRoot(), ...toKeySegments(keyRef)) + ".json";
}

function isDelegatedApiKeyCredentials(value: unknown): value is TurnkeyDelegatedApiKeyCredentials {
  return (
    typeof value === "object" &&
    value !== null &&
    "apiPublicKey" in value &&
    typeof value.apiPublicKey === "string" &&
    value.apiPublicKey.length > 0 &&
    "apiPrivateKey" in value &&
    typeof value.apiPrivateKey === "string" &&
    value.apiPrivateKey.length > 0
  );
}

export function generateDelegatedApiKeyPair(): TurnkeyDelegatedApiKeyCredentials {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();

  return {
    apiPublicKey: ecdh.getPublicKey("hex", "compressed"),
    apiPrivateKey: ecdh.getPrivateKey("hex"),
  };
}

export function hasDelegatedApiKeyCredentials(keyRef: string): boolean {
  return existsSync(getCredentialPath(keyRef));
}

export function readDelegatedApiKeyCredentials(keyRef: string): TurnkeyDelegatedApiKeyCredentials {
  const raw = JSON.parse(readFileSync(getCredentialPath(keyRef), "utf8")) as unknown;
  if (!isDelegatedApiKeyCredentials(raw)) {
    throw new Error(`Delegated key ref ${keyRef} is missing API key material`);
  }

  return raw;
}

export function writeDelegatedApiKeyCredentials(keyRef: string, credentials: TurnkeyDelegatedApiKeyCredentials): void {
  const path = getCredentialPath(keyRef);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(credentials), "utf8");
}
