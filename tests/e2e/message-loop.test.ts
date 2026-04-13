import { describe, expect, it, vi } from "vitest";

import type { UserContext } from "../../src/domain/users/types";
import {
  createDirectMessageHandler,
  createSchedulingLifecycleLogger,
  getDirectMessageFailureReply,
  selectAgentScope,
  shouldResolveMcpToolsets,
  shouldResolveMcpToolsetsForNetwork,
} from "../../src/main";
import { logger } from "../../src/utils/logger";

function createReadyUserContext(sender = "+819012345678"): UserContext {
  return {
    id: "user-1",
    resourceKey: "user:user-1",
    sender,
    wallet: {
      id: "wallet-1",
      userId: "user-1",
      chain: "ethereum",
      address: "0x1234567890abcdef1234567890abcdef12345678",
      status: "ready",
      turnkeyOrganizationId: "org-1",
      turnkeyEndUserId: "turnkey-user-1",
      turnkeyWalletId: "turnkey-wallet-1",
      turnkeyAccountId: "turnkey-account-1",
      turnkeyDelegatedUserId: "delegated-1",
      turnkeyDelegatedKeyRef: "turnkey/delegated/org-1/delegated-1",
      signerStatus: "ready",
      provisionedFrom: "phone_number_first_message",
      createdAt: "2099-03-22T00:00:00.000Z",
      updatedAt: "2099-03-22T00:00:00.000Z",
    },
  };
}

function createHandlerDeps(overrides?: {
  resolve?: ReturnType<typeof vi.fn>;
  ensurePrimaryWallet?: ReturnType<typeof vi.fn>;
}) {
  return {
    userContextResolver: {
      resolve: overrides?.resolve ?? vi.fn().mockResolvedValue(createReadyUserContext()),
    },
    turnkeyProvisioning: {
      ensurePrimaryWallet: overrides?.ensurePrimaryWallet ?? vi.fn().mockResolvedValue(createReadyUserContext().wallet),
    },
  };
}

function createSelectAgent(generate: ReturnType<typeof vi.fn>) {
  return vi.fn(() => ({ generate }) as never);
}

describe("message loop", () => {
  const ownerPhone = "+819012345678";

  it("routes a normal direct message through the agent with user resource keys", async () => {
    const generate = vi.fn().mockResolvedValue({ text: "Understood." });
    const selectAgent = createSelectAgent(generate);
    const sendMessage = vi.fn();
    const resolveToolsets = vi.fn().mockResolvedValue({});
    const deps = createHandlerDeps();
    const handler = createDirectMessageHandler({
      ownerPhone,
      selectAgent,
      sendMessage,
      userContextResolver: deps.userContextResolver as never,
      turnkeyProvisioning: deps.turnkeyProvisioning as never,
      hyperliquidNetwork: "mainnet",
      resolveToolsets,
      maxSteps: 3,
    });

    await handler({ sender: "+819012345678", text: "hello" });

    expect(resolveToolsets).not.toHaveBeenCalled();
    expect(selectAgent).toHaveBeenCalledWith("hello");
    expect(generate).toHaveBeenCalledWith(
      "hello",
      expect.objectContaining({
        memory: { resource: "user:user-1", thread: "default" },
        maxSteps: 3,
        toolsets: undefined,
        requestContext: expect.anything(),
        onStepFinish: expect.any(Function),
      }),
    );
    const requestContext = generate.mock.calls[0]?.[1]?.requestContext;
    expect(deps.userContextResolver.resolve).toHaveBeenCalledTimes(2);
    expect(requestContext?.get("sender")).toBe("+819012345678");
    expect(requestContext?.get("ownerPhone")).toBe(ownerPhone);
    expect(requestContext?.get("userId")).toBe("user-1");
    expect(requestContext?.get("resourceKey")).toBe("user:user-1");
    expect(sendMessage).toHaveBeenCalledWith("+819012345678", "Understood.");
  });

  it("sends wallet addresses as standalone messages so they are easy to copy", async () => {
    const generate = vi.fn().mockResolvedValue({
      text: "Wallet address: 0x1234567890abcdef1234567890abcdef12345678\nFund it with USDC on Arbitrum.",
    });
    const sendMessage = vi.fn();
    const deps = createHandlerDeps();
    const handler = createDirectMessageHandler({
      ownerPhone,
      selectAgent: createSelectAgent(generate),
      sendMessage,
      userContextResolver: deps.userContextResolver as never,
      turnkeyProvisioning: deps.turnkeyProvisioning as never,
      hyperliquidNetwork: "mainnet",
      maxSteps: 3,
    });

    await handler({ sender: "+819012345678", text: "show my wallet address" });

    expect(sendMessage).toHaveBeenNthCalledWith(1, "+819012345678", "Wallet address:");
    expect(sendMessage).toHaveBeenNthCalledWith(2, "+819012345678", "0x1234567890abcdef1234567890abcdef12345678");
    expect(sendMessage).toHaveBeenNthCalledWith(3, "+819012345678", "Fund it with USDC on Arbitrum.");
  });

  it("uses chatId as the conversation key and reply target when available", async () => {
    const generate = vi.fn().mockResolvedValue({ text: "Understood." });
    const sendMessage = vi.fn();
    const deps = createHandlerDeps();
    const handler = createDirectMessageHandler({
      ownerPhone,
      selectAgent: createSelectAgent(generate),
      sendMessage,
      userContextResolver: deps.userContextResolver as never,
      turnkeyProvisioning: deps.turnkeyProvisioning as never,
      hyperliquidNetwork: "mainnet",
      maxSteps: 3,
    });

    await handler({ sender: "090-1234-5678", chatId: "chat-1", text: "hello" });

    expect(generate).toHaveBeenCalledWith(
      "hello",
      expect.objectContaining({
        memory: { resource: "user:user-1", thread: "default" },
      }),
    );
    expect(sendMessage).toHaveBeenCalledWith("chat-1", "Understood.");
  });

  it("accepts non-owner senders instead of filtering them out", async () => {
    const generate = vi.fn().mockResolvedValue({ text: "Confirmed." });
    const sendMessage = vi.fn();
    const deps = createHandlerDeps({
      resolve: vi.fn().mockResolvedValue(createReadyUserContext("+819099999999")),
    });
    const handler = createDirectMessageHandler({
      ownerPhone,
      selectAgent: createSelectAgent(generate),
      sendMessage,
      userContextResolver: deps.userContextResolver as never,
      turnkeyProvisioning: deps.turnkeyProvisioning as never,
      hyperliquidNetwork: "mainnet",
      maxSteps: 3,
    });

    await handler({ sender: "+819099999999", text: "hello" });

    expect(generate).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith("+819099999999", "Confirmed.");
  });

  it("resolves MCP toolsets only for likely MCP-heavy requests", async () => {
    const generate = vi.fn().mockResolvedValue({ text: "Checking balances." });
    const selectAgent = createSelectAgent(generate);
    const sendMessage = vi.fn();
    const resolveToolsets = vi.fn().mockResolvedValue({ allium: {} });
    const deps = createHandlerDeps();
    const handler = createDirectMessageHandler({
      ownerPhone,
      selectAgent,
      sendMessage,
      userContextResolver: deps.userContextResolver as never,
      turnkeyProvisioning: deps.turnkeyProvisioning as never,
      hyperliquidNetwork: "mainnet",
      resolveToolsets,
      maxSteps: 3,
    });

    await handler({ sender: "+819012345678", text: "wallet balanceを見て" });

    expect(resolveToolsets).toHaveBeenCalledTimes(1);
    expect(resolveToolsets).toHaveBeenCalledWith("wallet balanceを見て");
    expect(selectAgent).toHaveBeenCalledWith("wallet balanceを見て");
    expect(generate).toHaveBeenCalledWith(
      "wallet balanceを見て",
      expect.objectContaining({
        memory: { resource: "user:user-1", thread: "default" },
        maxSteps: 3,
        toolsets: { allium: {} },
        requestContext: expect.anything(),
        onStepFinish: expect.any(Function),
      }),
    );
  });

  it("skips MCP balance toolsets for Hyperliquid testnet balance requests", async () => {
    const generate = vi.fn().mockResolvedValue({ text: "Checking balances." });
    const sendMessage = vi.fn();
    const resolveToolsets = vi.fn().mockResolvedValue({ allium: {} });
    const deps = createHandlerDeps();
    const handler = createDirectMessageHandler({
      ownerPhone,
      selectAgent: createSelectAgent(generate),
      sendMessage,
      userContextResolver: deps.userContextResolver as never,
      turnkeyProvisioning: deps.turnkeyProvisioning as never,
      hyperliquidNetwork: "testnet",
      resolveToolsets,
      maxSteps: 3,
    });

    await handler({ sender: "+819012345678", text: "please check my wallet balance" });

    expect(resolveToolsets).not.toHaveBeenCalled();
    expect(generate).toHaveBeenCalledWith(
      "please check my wallet balance",
      expect.objectContaining({
        toolsets: undefined,
      }),
    );
  });

  it("routes scheduling requests through the agent instead of bypassing it", async () => {
    const generate = vi.fn().mockResolvedValue({ text: "I set a reminder for tomorrow at 9:00." });
    const sendMessage = vi.fn();
    const deps = createHandlerDeps();
    const handler = createDirectMessageHandler({
      ownerPhone,
      selectAgent: createSelectAgent(generate),
      sendMessage,
      userContextResolver: deps.userContextResolver as never,
      turnkeyProvisioning: deps.turnkeyProvisioning as never,
      hyperliquidNetwork: "mainnet",
      maxSteps: 3,
    });

    await handler({ sender: "+819012345678", text: "Remind me in one minute." });

    expect(generate).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith("+819012345678", "I set a reminder for tomorrow at 9:00.");
  });

  it("logs tool steps and sends one progress message before the final reply", async () => {
    const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => {});
    const sendMessage = vi.fn();
    const generate = vi.fn(async (_text: string, options: { onStepFinish?: (step: unknown) => Promise<void> }) => {
      await options.onStepFinish?.({
        toolCalls: [
          {
            payload: {
              toolCallId: "tool-call-1",
              toolName: "brave-search",
              args: { query: "latest" },
            },
          },
        ],
        toolResults: [
          {
            payload: {
              toolCallId: "tool-call-1",
              toolName: "brave-search",
              result: { ok: true },
            },
          },
        ],
      });

      return { text: "Done checking." };
    });
    const deps = createHandlerDeps();
    const handler = createDirectMessageHandler({
      ownerPhone,
      selectAgent: createSelectAgent(generate),
      sendMessage,
      userContextResolver: deps.userContextResolver as never,
      turnkeyProvisioning: deps.turnkeyProvisioning as never,
      hyperliquidNetwork: "mainnet",
      maxSteps: 3,
    });

    await handler({ sender: "+819012345678", text: "Check the latest updates." });

    expect(sendMessage).toHaveBeenNthCalledWith(1, "+819012345678", "I am checking that now. Please wait a moment.");
    expect(sendMessage).toHaveBeenNthCalledWith(2, "+819012345678", "Done checking.");
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining("[agent] tool-call id=tool-call-1 name=brave-search"));
    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining("[agent] tool-result id=tool-call-1 name=brave-search status=ok"),
    );

    infoSpy.mockRestore();
  });

  it("redacts full working-memory snapshots from tool-call logs", async () => {
    const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => {});
    const sendMessage = vi.fn();
    const workingMemory =
      "# User Profile\n- Name:\n\n# Open Loops\n- Finished task A\n- Finished task B\n- Finished task C";
    const generate = vi.fn(async (_text: string, options: { onStepFinish?: (step: unknown) => Promise<void> }) => {
      await options.onStepFinish?.({
        toolCalls: [
          {
            payload: {
              toolCallId: "tool-call-2",
              toolName: "updateWorkingMemory",
              args: { memory: workingMemory },
            },
          },
        ],
      });

      return { text: "It looks sunny in Hakone." };
    });
    const deps = createHandlerDeps();
    const handler = createDirectMessageHandler({
      ownerPhone,
      selectAgent: createSelectAgent(generate),
      sendMessage,
      userContextResolver: deps.userContextResolver as never,
      turnkeyProvisioning: deps.turnkeyProvisioning as never,
      hyperliquidNetwork: "mainnet",
      maxSteps: 3,
    });

    await handler({ sender: "+819012345678", text: "What is the weather in Hakone tomorrow?" });

    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        '[agent] tool-call id=tool-call-2 name=updateWorkingMemory args={"memory":"[redacted working memory ',
      ),
    );
    expect(infoSpy).not.toHaveBeenCalledWith(expect.stringContaining("Finished task A"));

    infoSpy.mockRestore();
  });

  it("does not send a progress reply for internal-only working-memory tool steps", async () => {
    const sendMessage = vi.fn();
    const deps = createHandlerDeps();
    const generate = vi.fn(async (_text: string, options: { onStepFinish?: (step: unknown) => Promise<void> }) => {
      await options.onStepFinish?.({
        toolCalls: [
          {
            payload: {
              toolCallId: "tool-call-3",
              toolName: "updateWorkingMemory",
              args: { memory: "# Owner Profile\n- Name: Test" },
            },
          },
        ],
      });

      return { text: "I will remember that." };
    });
    const handler = createDirectMessageHandler({
      ownerPhone,
      selectAgent: createSelectAgent(generate),
      sendMessage,
      userContextResolver: deps.userContextResolver as never,
      turnkeyProvisioning: deps.turnkeyProvisioning as never,
      hyperliquidNetwork: "mainnet",
      maxSteps: 3,
    });

    await handler({ sender: "+819012345678", text: "Remember this." });

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith("+819012345678", "I will remember that.");
  });

  it("sends a short fallback reply on Anthropic rate limit errors", async () => {
    const generate = vi.fn().mockRejectedValue({
      statusCode: 429,
      responseHeaders: {
        "retry-after": "23",
      },
    });
    const sendMessage = vi.fn();
    const deps = createHandlerDeps();
    const handler = createDirectMessageHandler({
      ownerPhone,
      selectAgent: createSelectAgent(generate),
      sendMessage,
      userContextResolver: deps.userContextResolver as never,
      turnkeyProvisioning: deps.turnkeyProvisioning as never,
      hyperliquidNetwork: "mainnet",
      maxSteps: 3,
    });

    await handler({ sender: "+819012345678", text: "hello" });

    expect(sendMessage).toHaveBeenCalledWith(
      "+819012345678",
      "Things are busy right now. Please try again in about 23 seconds.",
    );
  });

  it("auto-provisions a wallet on first message and returns onboarding instructions", async () => {
    const generate = vi.fn().mockResolvedValue({ text: "Your wallet is ready." });
    const sendMessage = vi.fn();
    const resolve = vi
      .fn()
      .mockResolvedValueOnce({
        ...createReadyUserContext(),
        wallet: null,
      })
      .mockResolvedValueOnce(createReadyUserContext());
    const ensurePrimaryWallet = vi.fn().mockResolvedValue(createReadyUserContext().wallet);
    const deps = createHandlerDeps({
      resolve,
      ensurePrimaryWallet,
    });
    const handler = createDirectMessageHandler({
      ownerPhone,
      selectAgent: createSelectAgent(generate),
      sendMessage,
      userContextResolver: deps.userContextResolver as never,
      turnkeyProvisioning: deps.turnkeyProvisioning as never,
      hyperliquidNetwork: "mainnet",
      maxSteps: 3,
    });

    await handler({ sender: "+819012345678", text: "hi" });

    expect(ensurePrimaryWallet).toHaveBeenCalledTimes(1);
    expect(generate).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenNthCalledWith(
      1,
      "+819012345678",
      ["Your wallet is ready.", "Deposit address:"].join("\n"),
    );
    expect(sendMessage).toHaveBeenNthCalledWith(2, "+819012345678", "0x1234567890abcdef1234567890abcdef12345678");
    expect(sendMessage).toHaveBeenNthCalledWith(
      3,
      "+819012345678",
      [
        "Please deposit USDC to this address. Arbitrum is the default funding route.",
        'After funding, you can say things like "show my portfolio", "show BTC market data", or "buy 0.01 BTC".',
      ].join("\n"),
    );
  });

  it("returns the same onboarding structure in testnet mode and only changes the network hint", async () => {
    const generate = vi.fn().mockResolvedValue({ text: "Your wallet is ready." });
    const sendMessage = vi.fn();
    const resolve = vi
      .fn()
      .mockResolvedValueOnce({
        ...createReadyUserContext(),
        wallet: null,
      })
      .mockResolvedValueOnce(createReadyUserContext());
    const ensurePrimaryWallet = vi.fn().mockResolvedValue(createReadyUserContext().wallet);
    const deps = createHandlerDeps({
      resolve,
      ensurePrimaryWallet,
    });
    const handler = createDirectMessageHandler({
      ownerPhone,
      selectAgent: createSelectAgent(generate),
      sendMessage,
      userContextResolver: deps.userContextResolver as never,
      turnkeyProvisioning: deps.turnkeyProvisioning as never,
      hyperliquidNetwork: "testnet",
      maxSteps: 3,
    });

    await handler({ sender: "+819012345678", text: "hi" });

    expect(ensurePrimaryWallet).toHaveBeenCalledTimes(1);
    expect(generate).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenNthCalledWith(
      1,
      "+819012345678",
      ["Your wallet is ready.", "Deposit address:"].join("\n"),
    );
    expect(sendMessage).toHaveBeenNthCalledWith(2, "+819012345678", "0x1234567890abcdef1234567890abcdef12345678");
    expect(sendMessage).toHaveBeenNthCalledWith(
      3,
      "+819012345678",
      [
        "Please deposit USDC to this address. Hyperliquid testnet is the target network.",
        'After funding, you can say things like "show my portfolio", "show BTC market data", or "buy 0.01 BTC".',
      ].join("\n"),
    );
  });
});

describe("direct message helpers", () => {
  it("detects likely MCP requests from the message text", () => {
    expect(shouldResolveMcpToolsets("wallet balanceを見て")).toBe(true);
    expect(shouldResolveMcpToolsets("hello")).toBe(false);
  });

  it("disables MCP balance lookup on Hyperliquid testnet", () => {
    expect(shouldResolveMcpToolsetsForNetwork("show my wallet balance", "testnet")).toBe(false);
    expect(shouldResolveMcpToolsetsForNetwork("show my wallet balance", "mainnet")).toBe(true);
  });

  it("selects a smaller agent scope from the request intent", () => {
    expect(selectAgentScope("show my wallet balance")).toBe("core");
    expect(selectAgentScope("remind me tomorrow at 9")).toBe("messaging");
    expect(selectAgentScope("buy BTC and remind me to check fills later")).toBe("full");
  });

  it("creates a retry message for rate limits", () => {
    expect(
      getDirectMessageFailureReply({
        statusCode: 429,
        responseHeaders: { "retry-after": "12" },
      }),
    ).toBe("Things are busy right now. Please try again in about 12 seconds.");
  });

  it("logs scheduler and reminder lifecycle events", () => {
    const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => {});
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
    const schedulerLogger = createSchedulingLifecycleLogger("scheduler");
    const reminderLogger = createSchedulingLifecycleLogger("reminder");

    schedulerLogger.onSent?.(
      {
        id: "scheduled-1",
        type: "once",
        to: "+819012345678",
      } as never,
      {
        sentAt: new Date("2026-03-22T00:00:00.000Z"),
      } as never,
    );

    reminderLogger.onError?.(
      {
        id: "reminder-1",
        type: "once",
        to: "+819012345678",
      } as never,
      new Error("send failed"),
    );

    schedulerLogger.onComplete?.({
      id: "recurring-1",
      to: "+819012345678",
      sendCount: 3,
    } as never);

    expect(infoSpy).toHaveBeenCalledWith("[scheduler] sent id=scheduled-1 type=once to=+819012345678");
    expect(errorSpy).toHaveBeenCalledWith(
      "[reminder] failed id=reminder-1 type=once to=+819012345678",
      expect.any(Error),
    );
    expect(infoSpy).toHaveBeenCalledWith("[scheduler] completed id=recurring-1 to=+819012345678 sends=3");

    infoSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
