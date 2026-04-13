import { RequestContext } from "@mastra/core/request-context";
import { z } from "zod";

export const AGENT_SCOPE_VALUES = ["core", "messaging", "full"] as const;
export const HYPERLIQUID_NETWORK_VALUES = ["mainnet", "testnet"] as const;

export interface AgentRequestContextValues {
  sender?: string;
  chatId?: string;
  ownerPhone?: string;
  isHeartbeat?: boolean;
  incomingText?: string;
  userId?: string;
  resourceKey?: string;
  walletAddress?: `0x${string}`;
  walletStatus?: "none" | "provisioning" | "ready" | "failed";
  signerStatus?: "not_bootstrapped" | "bootstrapping" | "ready" | "degraded";
  turnkeyOrganizationId?: string;
  turnkeyWalletId?: string;
  turnkeyAccountId?: string;
  turnkeyDelegatedUserId?: string;
  agentScope?: (typeof AGENT_SCOPE_VALUES)[number];
  hyperliquidNetwork?: (typeof HYPERLIQUID_NETWORK_VALUES)[number];
}

export const agentRequestContextSchema = z.object({
  sender: z.string().optional(),
  chatId: z.string().optional(),
  ownerPhone: z.string().optional(),
  isHeartbeat: z.boolean().optional(),
  incomingText: z.string().optional(),
  userId: z.string().optional(),
  resourceKey: z.string().optional(),
  walletAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional(),
  walletStatus: z.enum(["none", "provisioning", "ready", "failed"]).optional(),
  signerStatus: z.enum(["not_bootstrapped", "bootstrapping", "ready", "degraded"]).optional(),
  turnkeyOrganizationId: z.string().optional(),
  turnkeyWalletId: z.string().optional(),
  turnkeyAccountId: z.string().optional(),
  turnkeyDelegatedUserId: z.string().optional(),
  agentScope: z.enum(AGENT_SCOPE_VALUES).optional(),
  hyperliquidNetwork: z.enum(HYPERLIQUID_NETWORK_VALUES).optional(),
});

const SELF_RECIPIENT_ALIASES = new Set([
  "me",
  "myself",
  "self",
  "you",
  "the user",
  "owner",
  "自分",
  "自分に",
  "自分へ",
  "自分自身",
  "私",
  "わたし",
  "僕",
  "ぼく",
  "俺",
  "おれ",
]);

const CHAT_RECIPIENT_ALIASES = new Set([
  "this chat",
  "current chat",
  "here",
  "このチャット",
  "この会話",
  "このスレッド",
  "ここ",
]);

function cleanValue(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function createAgentRequestContext(values: AgentRequestContextValues) {
  const requestContext = new RequestContext<AgentRequestContextValues>();
  const sender = cleanValue(values.sender);
  const chatId = cleanValue(values.chatId);
  const ownerPhone = cleanValue(values.ownerPhone);

  if (sender) {
    requestContext.set("sender", sender);
  }

  if (chatId) {
    requestContext.set("chatId", chatId);
  }

  if (ownerPhone) {
    requestContext.set("ownerPhone", ownerPhone);
  }

  if (values.isHeartbeat === true) {
    requestContext.set("isHeartbeat", true);
  }

  const incomingText = cleanValue(values.incomingText);
  if (incomingText) {
    requestContext.set("incomingText", incomingText);
  }

  const userId = cleanValue(values.userId);
  if (userId) {
    requestContext.set("userId", userId);
  }

  const resourceKey = cleanValue(values.resourceKey);
  if (resourceKey) {
    requestContext.set("resourceKey", resourceKey);
  }

  if (values.walletAddress) {
    requestContext.set("walletAddress", values.walletAddress);
  }

  if (values.walletStatus) {
    requestContext.set("walletStatus", values.walletStatus);
  }

  if (values.signerStatus) {
    requestContext.set("signerStatus", values.signerStatus);
  }

  const turnkeyOrganizationId = cleanValue(values.turnkeyOrganizationId);
  if (turnkeyOrganizationId) {
    requestContext.set("turnkeyOrganizationId", turnkeyOrganizationId);
  }

  const turnkeyWalletId = cleanValue(values.turnkeyWalletId);
  if (turnkeyWalletId) {
    requestContext.set("turnkeyWalletId", turnkeyWalletId);
  }

  const turnkeyAccountId = cleanValue(values.turnkeyAccountId);
  if (turnkeyAccountId) {
    requestContext.set("turnkeyAccountId", turnkeyAccountId);
  }

  const turnkeyDelegatedUserId = cleanValue(values.turnkeyDelegatedUserId);
  if (turnkeyDelegatedUserId) {
    requestContext.set("turnkeyDelegatedUserId", turnkeyDelegatedUserId);
  }

  if (values.agentScope) {
    requestContext.set("agentScope", values.agentScope);
  }

  if (values.hyperliquidNetwork) {
    requestContext.set("hyperliquidNetwork", values.hyperliquidNetwork);
  }

  return requestContext;
}

export function isHeartbeatRequest(requestContext?: RequestContext): boolean {
  return requestContext?.get("isHeartbeat") === true;
}

export function resolveRecipientAlias(recipient: string, requestContext?: RequestContext): string {
  const trimmed = recipient.trim();
  const normalized = trimmed.toLowerCase();

  if (SELF_RECIPIENT_ALIASES.has(normalized)) {
    const sender = requestContext?.get("sender");
    const ownerPhone = requestContext?.get("ownerPhone");
    if (typeof sender === "string" && sender.trim()) {
      return sender.trim();
    }

    if (typeof ownerPhone === "string" && ownerPhone.trim()) {
      return ownerPhone.trim();
    }

    throw new Error(`Cannot resolve recipient alias "${recipient}" without sender context`);
  }

  if (CHAT_RECIPIENT_ALIASES.has(normalized)) {
    const chatId = requestContext?.get("chatId");
    const sender = requestContext?.get("sender");
    const ownerPhone = requestContext?.get("ownerPhone");

    if (typeof chatId === "string" && chatId.trim()) {
      return chatId.trim();
    }

    if (typeof sender === "string" && sender.trim()) {
      return sender.trim();
    }

    if (typeof ownerPhone === "string" && ownerPhone.trim()) {
      return ownerPhone.trim();
    }

    throw new Error(`Cannot resolve recipient alias "${recipient}" without chat context`);
  }

  return trimmed;
}

export function getUserId(requestContext?: RequestContext): string {
  const userId = requestContext?.get("userId");
  if (typeof userId === "string" && userId.trim()) {
    return userId.trim();
  }

  throw new Error("Missing user context");
}

export function getIncomingText(requestContext?: RequestContext): string | undefined {
  const incomingText = requestContext?.get("incomingText");
  return typeof incomingText === "string" && incomingText.trim() ? incomingText.trim() : undefined;
}
