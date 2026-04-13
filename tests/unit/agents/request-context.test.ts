import { describe, expect, it } from "vitest";

import { createAgentRequestContext, resolveRecipientAlias } from "../../../src/agents/request-context";

describe("request-context recipient aliases", () => {
  const requestContext = createAgentRequestContext({
    sender: "+819012345678",
    chatId: "chat-1",
    ownerPhone: "+819000000000",
  });

  it("resolves Japanese self aliases to the sender", () => {
    expect(resolveRecipientAlias("自分に", requestContext as never)).toBe("+819012345678");
    expect(resolveRecipientAlias("私", requestContext as never)).toBe("+819012345678");
  });

  it("resolves Japanese chat aliases to the current chat", () => {
    expect(resolveRecipientAlias("このチャット", requestContext as never)).toBe("chat-1");
    expect(resolveRecipientAlias("ここ", requestContext as never)).toBe("chat-1");
  });
});
