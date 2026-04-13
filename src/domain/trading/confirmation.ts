import { createHash } from "node:crypto";

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function buildTradeConfirmationCode(parts: string[]): string {
  const hash = createHash("sha256");
  hash.update(parts.map(normalizeText).join("|"));
  return hash.digest("hex").slice(0, 8);
}

export function containsTradeConfirmation(message: string | undefined, code: string): boolean {
  if (!message) {
    return false;
  }

  const normalized = normalizeText(message);
  return normalized.includes(`confirm ${code}`) || normalized.includes(`execute ${code}`);
}

export function createTradeConfirmationMessage(summary: string, code: string): string {
  return `${summary}\nTo execute, reply with "confirm ${code}".`;
}
