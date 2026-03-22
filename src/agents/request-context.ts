import { RequestContext } from "@mastra/core/request-context";

export interface AgentRequestContextValues {
  sender?: string;
  chatId?: string;
  ownerPhone?: string;
  isHeartbeat?: boolean;
}

const SELF_RECIPIENT_ALIASES = new Set([
  "me",
  "myself",
  "self",
  "you",
  "the user",
  "owner",
  "私",
  "わたし",
  "私に",
  "わたしに",
  "自分",
  "自分に",
  "自分自身",
]);

const CHAT_RECIPIENT_ALIASES = new Set(["this chat", "current chat", "here", "このチャット", "この会話", "ここ"]);

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
