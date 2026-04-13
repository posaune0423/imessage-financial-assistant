import { describe, expect, it, vi } from "vitest";

import { createAgentRequestContext } from "../../../src/agents/request-context";
import type { AgentToolRuntime } from "../../../src/agents/tools";
import { createAgentTools } from "../../../src/agents/tools";
import { createWebTools } from "../../../src/agents/tools/brave";
import { createHyperliquidTools } from "../../../src/agents/tools/hyperliquid";
import { createIMessageTools } from "../../../src/agents/tools/imessage";
import { createReminderTools } from "../../../src/agents/tools/reminder";
import { createSchedulingTools } from "../../../src/agents/tools/scheduling";
import { createWalletTools } from "../../../src/agents/tools/wallet";

function createFakeServices() {
  const explorerUrl = "https://app.hyperliquid-testnet.xyz/explorer/tx/0xabc123";
  const txHash = "0xabc123";
  const wallet = {
    id: "wallet-1",
    userId: "user-1",
    chain: "ethereum",
    address: "0x1234567890abcdef1234567890abcdef12345678" as const,
    status: "ready" as const,
    turnkeyOrganizationId: "org-1",
    turnkeyEndUserId: "user-turnkey-1",
    turnkeyWalletId: "wallet-turnkey-1",
    turnkeyAccountId: "account-turnkey-1",
    turnkeyDelegatedUserId: "delegated-1",
    turnkeyDelegatedKeyRef: "turnkey/delegated/org-1/delegated-1",
    signerStatus: "ready" as const,
    provisionedFrom: "phone_number_first_message",
    createdAt: "2099-03-22T00:00:00.000Z",
    updatedAt: "2099-03-22T00:00:00.000Z",
  };

  return {
    wallets: {
      getProfile: vi.fn().mockResolvedValue(wallet),
      ensurePrimaryWallet: vi.fn().mockResolvedValue(wallet),
    },
    userContextResolver: {
      resolve: vi.fn().mockResolvedValue({
        id: "user-1",
        resourceKey: "user:user-1",
        sender: "+819012345678",
        wallet,
      }),
    },
    turnkeyProvisioning: {
      ensurePrimaryWallet: vi.fn().mockResolvedValue(wallet),
    },
    hyperliquid: {
      searchMarkets: vi.fn().mockResolvedValue({
        network: "mainnet",
        query: "BTC",
        kind: "all",
        count: 2,
        markets: [
          { kind: "perp", symbol: "BTC", asset: 0, markPx: "95000" },
          { kind: "spot", symbol: "BTC/USDC", asset: 1000, markPx: "94990" },
        ],
      }),
      getMarketSnapshot: vi.fn().mockResolvedValue({
        network: "mainnet",
        timestamp: "2099-03-22T00:00:00.000Z",
        assets: [{ coin: "BTC", asset: 0, mid: "95000", szDecimals: 5, maxLeverage: 40 }],
      }),
      getOrderBook: vi.fn().mockResolvedValue({
        network: "mainnet",
        market: "BTC",
        book: { coin: "BTC", time: 1, levels: [[{ px: "94999", sz: "1", n: 1 }], [{ px: "95001", sz: "1", n: 1 }]] },
      }),
      getCandles: vi.fn().mockResolvedValue({
        network: "mainnet",
        market: "BTC",
        interval: "1h",
        candles: [{ t: 1, T: 2, s: "BTC", i: "1h", o: "1", c: "2", h: "3", l: "0.5", v: "10", n: 5 }],
      }),
      getOrderStatus: vi.fn().mockResolvedValue({
        network: "mainnet",
        address: wallet.address,
        status: { status: "order" },
      }),
      getHistoricalOrders: vi.fn().mockResolvedValue({
        network: "mainnet",
        address: wallet.address,
        orders: [{ oid: 1, status: "filled" }],
      }),
      getUserSummary: vi.fn().mockResolvedValue({
        network: "mainnet",
        address: wallet.address,
        summary: { marginSummary: { accountValue: "1000" } },
      }),
      getSpotBalance: vi.fn().mockImplementation(async (address: `0x${string}`, token = "USDC") => ({
        network: "mainnet",
        address,
        token:
          token.toUpperCase() === "HYPE"
            ? { index: 150, symbol: "HYPE", decimals: 8, tokenId: "0xhype", universe: "HYPE/USDC" }
            : { index: 0, symbol: "USDC", decimals: 8, tokenId: "0xusdc", universe: "USDC" },
        balance: {
          raw: "100000000",
          formatted: "1",
          heldRaw: "0",
          heldFormatted: "0",
          availableRaw: "100000000",
          availableFormatted: "1",
          entryNtlRaw: "0",
          entryNtlFormatted: "0",
        },
      })),
      getOpenOrders: vi.fn().mockResolvedValue({
        network: "mainnet",
        address: wallet.address,
        orders: [{ oid: 1 }],
      }),
      getRecentFills: vi.fn().mockResolvedValue({
        network: "mainnet",
        address: wallet.address,
        fills: [{ oid: 1 }],
      }),
      placeOrder: vi
        .fn()
        .mockResolvedValue({ network: "testnet", action: "order", result: { ok: true, oid: 1 }, txHash, explorerUrl }),
      cancelOrder: vi
        .fn()
        .mockResolvedValue({ network: "testnet", action: "cancel", result: { ok: true }, txHash, explorerUrl }),
      modifyOrder: vi
        .fn()
        .mockResolvedValue({ network: "testnet", action: "modify", result: { ok: true }, txHash, explorerUrl }),
      updateLeverage: vi.fn().mockResolvedValue({
        network: "testnet",
        action: "updateLeverage",
        result: { ok: true },
        txHash,
        explorerUrl,
      }),
      transferUsd: vi
        .fn()
        .mockResolvedValue({ network: "testnet", action: "usdSend", result: { ok: true }, txHash, explorerUrl }),
      transferSpot: vi.fn().mockResolvedValue({
        network: "testnet",
        action: "spotSend",
        result: { ok: true },
        txHash,
        explorerUrl,
      }),
      sendAsset: vi
        .fn()
        .mockResolvedValue({ network: "testnet", action: "sendAsset", result: { ok: true }, txHash, explorerUrl }),
      withdraw: vi
        .fn()
        .mockResolvedValue({ network: "testnet", action: "withdraw3", result: { ok: true }, txHash, explorerUrl }),
      queryInfo: vi.fn().mockImplementation(async (method: string) => ({
        network: "mainnet",
        method,
        result: { universe: [] },
      })),
      executeAction: vi.fn().mockImplementation(async (_wallet, action: string) => ({
        network: "mainnet",
        action,
        result: { ok: true },
        txHash,
        explorerUrl,
      })),
    },
  };
}

function createFakeRuntime(): AgentToolRuntime {
  const scheduledItems: Array<Record<string, unknown>> = [];
  const reminderItems: Array<Record<string, unknown>> = [];

  const scheduler = {
    schedule: vi.fn(({ id, to, content, sendAt }: Record<string, unknown>) => {
      const scheduledId = typeof id === "string" ? id : `scheduled-${scheduledItems.length + 1}`;
      scheduledItems.push({
        id: scheduledId,
        type: "once",
        to,
        content,
        sendAt,
        status: "pending",
      });
      return scheduledId;
    }),
    scheduleRecurring: vi.fn(({ id, to, content, startAt, interval, endAt }: Record<string, unknown>) => {
      const scheduledId = typeof id === "string" ? id : `recurring-${scheduledItems.length + 1}`;
      scheduledItems.push({
        id: scheduledId,
        type: "recurring",
        to,
        content,
        sendAt: startAt,
        nextSendAt: startAt,
        interval,
        endAt,
        status: "pending",
      });
      return scheduledId;
    }),
    getPending: vi.fn(() => scheduledItems.filter((item) => item.status === "pending")),
    reschedule: vi.fn((id: string, newSendAt: Date) => {
      const item = scheduledItems.find((entry) => entry.id === id && entry.type === "once");
      if (!item) {
        return false;
      }

      item.sendAt = newSendAt;
      return true;
    }),
    cancel: vi.fn((id: string) => {
      const item = scheduledItems.find((entry) => entry.id === id);
      if (!item) {
        return false;
      }

      item.status = "cancelled";
      return true;
    }),
    destroy: vi.fn(),
  };

  const reminders = {
    in: vi.fn((duration: string, to: string, message: string) => {
      const id = `reminder-in-${reminderItems.length + 1}`;
      reminderItems.push({
        id,
        to,
        message,
        duration,
        scheduledFor: new Date("2099-03-22T03:00:00.000Z"),
        createdAt: new Date("2099-03-22T00:00:00.000Z"),
      });
      return id;
    }),
    at: vi.fn((timeExpression: string, to: string, message: string) => {
      const id = `reminder-at-${reminderItems.length + 1}`;
      reminderItems.push({
        id,
        to,
        message,
        timeExpression,
        scheduledFor: new Date("2099-03-22T04:00:00.000Z"),
        createdAt: new Date("2099-03-22T00:00:00.000Z"),
      });
      return id;
    }),
    exact: vi.fn((date: Date, to: string, message: string, options?: { id?: string }) => {
      const id = options?.id ?? `reminder-exact-${reminderItems.length + 1}`;
      reminderItems.push({
        id,
        to,
        message,
        scheduledFor: date,
        createdAt: new Date("2099-03-22T00:00:00.000Z"),
      });
      return id;
    }),
    list: vi.fn(() => reminderItems),
    cancel: vi.fn((id: string) => {
      const index = reminderItems.findIndex((entry) => entry.id === id);
      if (index === -1) {
        return false;
      }

      reminderItems.splice(index, 1);
      return true;
    }),
    destroy: vi.fn(),
  };

  const sdk = {
    send: vi.fn(async () => ({
      sentAt: new Date("2099-03-22T00:00:00.000Z"),
      message: { guid: "message-1" },
    })),
    sendFile: vi.fn(async () => ({
      sentAt: new Date("2099-03-22T00:00:00.000Z"),
      message: { guid: "message-2" },
    })),
    sendFiles: vi.fn(async () => ({
      sentAt: new Date("2099-03-22T00:00:00.000Z"),
      message: { guid: "message-3" },
    })),
    sendBatch: vi.fn(async (messages: Array<{ to: string }>) =>
      messages.map((message) => ({
        to: message.to,
        success: true,
      })),
    ),
    getMessages: vi.fn(async () => ({
      total: 1,
      unreadCount: 0,
      messages: [
        {
          id: "msg-1",
          guid: "guid-1",
          text: "hello",
          sender: "+819012345678",
          senderName: "Owner",
          chatId: "chat-1",
          isGroupChat: false,
          service: "iMessage" as const,
          isRead: true,
          isFromMe: false,
          isReaction: false,
          reactionType: null,
          isReactionRemoval: false,
          associatedMessageGuid: null,
          attachments: [],
          date: new Date("2099-03-22T00:00:00.000Z"),
        },
      ],
    })),
    getUnreadMessages: vi.fn(async () => ({
      total: 1,
      senderCount: 1,
      groups: [
        {
          sender: "+819012345678",
          messages: [{ id: "msg-1" }],
        },
      ],
    })),
    listChats: vi.fn(async () => [
      {
        chatId: "chat-1",
        displayName: "Owner",
        lastMessageAt: new Date("2099-03-22T00:00:00.000Z"),
        isGroup: false,
        unreadCount: 0,
      },
    ]),
  };

  return {
    sdk: sdk as never,
    scheduler: scheduler as never,
    reminders: reminders as never,
    persist: vi.fn(),
    destroy: vi.fn(),
  };
}

interface ToolLike {
  execute?: (...args: unknown[]) => PromiseLike<unknown>;
}

async function executeTool(
  tool: unknown,
  args: unknown,
  requestContext?: ReturnType<typeof createAgentRequestContext>,
) {
  const executable = tool as ToolLike;
  expect(executable.execute).toBeTypeOf("function");
  return executable.execute?.(args, {
    agent: {
      toolCallId: "tool-call-1",
      messages: [],
    },
    requestContext,
  });
}

describe("agent tools", () => {
  it("combines all built-in tool definitions for the agent", () => {
    const runtime = createFakeRuntime();
    const services = createFakeServices();
    const tools = createAgentTools(
      runtime,
      {
        web: {
          braveSearch: { apiKey: "brave-test-key" },
        },
      },
      services as never,
    );

    expect(Object.keys(tools).toSorted()).toEqual([
      "brave-fetch",
      "brave-search",
      "hyperliquid_cancel_orders",
      "hyperliquid_get_candles",
      "hyperliquid_get_historical_orders",
      "hyperliquid_get_market_snapshot",
      "hyperliquid_get_open_orders",
      "hyperliquid_get_order_book",
      "hyperliquid_get_order_status",
      "hyperliquid_get_recent_fills",
      "hyperliquid_get_spot_balance",
      "hyperliquid_get_user_summary",
      "hyperliquid_modify_order",
      "hyperliquid_place_order",
      "hyperliquid_run_exchange_action",
      "hyperliquid_run_info_method",
      "hyperliquid_search_markets",
      "hyperliquid_send_asset",
      "hyperliquid_transfer_spot",
      "hyperliquid_transfer_usd",
      "hyperliquid_update_leverage",
      "hyperliquid_withdraw",
      "imessage_cancel_reminder",
      "imessage_cancel_scheduled_message",
      "imessage_get_messages",
      "imessage_get_unread_messages",
      "imessage_list_chats",
      "imessage_list_reminders",
      "imessage_list_scheduled_messages",
      "imessage_reschedule_message",
      "imessage_schedule_message",
      "imessage_schedule_recurring_message",
      "imessage_send_batch",
      "imessage_send_file",
      "imessage_send_files",
      "imessage_send_media",
      "imessage_send_message",
      "imessage_set_reminder_at",
      "imessage_set_reminder_exact",
      "imessage_set_reminder_in",
      "wallet_ensure_primary",
      "wallet_get_profile",
    ]);
  });

  it("builds a smaller core tool scope for finance requests", () => {
    const runtime = createFakeRuntime();
    const services = createFakeServices();
    const tools = createAgentTools(
      runtime,
      {
        web: {
          braveSearch: { apiKey: "brave-test-key" },
        },
      },
      services as never,
      "core",
    );

    expect(Object.keys(tools)).toContain("wallet_get_profile");
    expect(Object.keys(tools)).toContain("hyperliquid_get_market_snapshot");
    expect(Object.keys(tools)).not.toContain("hyperliquid_run_info_method");
    expect(Object.keys(tools)).not.toContain("hyperliquid_run_exchange_action");
    expect(Object.keys(tools)).not.toContain("imessage_send_message");
    expect(Object.keys(tools)).not.toContain("imessage_set_reminder_in");
  });

  it("builds a messaging-only tool scope for scheduling requests", () => {
    const runtime = createFakeRuntime();
    const services = createFakeServices();
    const tools = createAgentTools(
      runtime,
      {
        web: {
          braveSearch: { apiKey: "brave-test-key" },
        },
      },
      services as never,
      "messaging",
    );

    expect(Object.keys(tools)).toContain("imessage_send_message");
    expect(Object.keys(tools)).toContain("imessage_set_reminder_in");
    expect(Object.keys(tools)).not.toContain("wallet_get_profile");
    expect(Object.keys(tools)).not.toContain("hyperliquid_get_market_snapshot");
  });

  it("executes all iMessage tools successfully", async () => {
    const runtime = createFakeRuntime();
    const tools = createIMessageTools(runtime);

    await expect(executeTool(tools.imessage_send_message, { to: "+8190", text: "hello" })).resolves.toEqual({
      sentAt: "2099-03-22T00:00:00.000Z",
      hasMessage: true,
    });
    await expect(
      executeTool(tools.imessage_send_media, {
        to: "+8190",
        text: "hello",
        images: ["./image.png"],
      }),
    ).resolves.toEqual({
      sentAt: "2099-03-22T00:00:00.000Z",
      hasMessage: true,
    });
    await expect(
      executeTool(tools.imessage_send_file, {
        to: "+8190",
        filePath: "./note.txt",
        text: "see attached",
      }),
    ).resolves.toEqual({
      sentAt: "2099-03-22T00:00:00.000Z",
      hasMessage: true,
    });
    await expect(
      executeTool(tools.imessage_send_files, {
        to: "+8190",
        filePaths: ["./a.txt", "./b.txt"],
        text: "files",
      }),
    ).resolves.toEqual({
      sentAt: "2099-03-22T00:00:00.000Z",
      hasMessage: true,
    });
    await expect(
      executeTool(tools.imessage_send_batch, {
        messages: [
          { to: "+8190", text: "one" },
          { to: "+8191", text: "two" },
        ],
      }),
    ).resolves.toEqual({
      results: [
        { to: "+8190", success: true, error: undefined },
        { to: "+8191", success: true, error: undefined },
      ],
    });
    await expect(
      executeTool(tools.imessage_get_messages, {
        sender: "+8190",
        since: "2099-03-21T00:00:00.000Z",
        limit: 10,
      }),
    ).resolves.toMatchObject({
      total: 1,
      unreadCount: 0,
      messages: [{ id: "msg-1", chatId: "chat-1", text: "hello" }],
    });
    await expect(executeTool(tools.imessage_get_unread_messages, {})).resolves.toEqual({
      total: 1,
      senderCount: 1,
      groups: [{ sender: "+819012345678", count: 1 }],
    });
    await expect(
      executeTool(tools.imessage_list_chats, {
        type: "dm",
        sortBy: "recent",
      }),
    ).resolves.toEqual({
      chats: [
        {
          chatId: "chat-1",
          displayName: "Owner",
          lastMessageAt: "2099-03-22T00:00:00.000Z",
          isGroup: false,
          unreadCount: 0,
        },
      ],
    });
  });

  it("suppresses immediate iMessage sends during heartbeat runs", async () => {
    const runtime = createFakeRuntime();
    const tools = createIMessageTools(runtime);
    const sendMock = Reflect.get(runtime.sdk, "send") as ReturnType<typeof vi.fn>;
    const sendBatchMock = Reflect.get(runtime.sdk, "sendBatch") as ReturnType<typeof vi.fn>;
    const requestContext = createAgentRequestContext({
      sender: "+819012345678",
      ownerPhone: "+819012345678",
      isHeartbeat: true,
    });

    await expect(
      executeTool(
        tools.imessage_send_message,
        {
          to: "me",
          text: "hello",
        },
        requestContext,
      ),
    ).resolves.toMatchObject({
      hasMessage: false,
    });

    await expect(
      executeTool(
        tools.imessage_send_batch,
        {
          messages: [
            { to: "me", text: "one" },
            { to: "+8191", text: "two" },
          ],
        },
        requestContext,
      ),
    ).resolves.toEqual({
      results: [
        { to: "+819012345678", success: false, error: "suppressed during heartbeat" },
        { to: "+8191", success: false, error: "suppressed during heartbeat" },
      ],
    });

    expect(sendMock).not.toHaveBeenCalled();
    expect(sendBatchMock).not.toHaveBeenCalled();
  });

  it("executes all scheduling tools successfully", async () => {
    const runtime = createFakeRuntime();
    const tools = createSchedulingTools(runtime);

    await expect(
      executeTool(tools.imessage_schedule_message, {
        to: "+8190",
        text: "later",
        sendAt: "2099-03-22T01:00:00.000Z",
      }),
    ).resolves.toEqual({
      id: "scheduled-1",
      sendAt: "2099-03-22T01:00:00.000Z",
    });
    await expect(
      executeTool(tools.imessage_schedule_recurring_message, {
        to: "+8190",
        text: "daily",
        startAt: "2099-03-22T02:00:00.000Z",
        interval: "daily",
      }),
    ).resolves.toEqual({
      id: "recurring-2",
      startAt: "2099-03-22T02:00:00.000Z",
      interval: "daily",
    });
    await expect(executeTool(tools.imessage_list_scheduled_messages, {})).resolves.toMatchObject({
      items: [
        { id: "scheduled-1", type: "once", to: "+8190" },
        { id: "recurring-2", type: "recurring", to: "+8190", interval: "daily" },
      ],
    });
    await expect(
      executeTool(tools.imessage_reschedule_message, {
        id: "scheduled-1",
        newSendAt: "2099-03-22T03:00:00.000Z",
      }),
    ).resolves.toEqual({
      success: true,
      newSendAt: "2099-03-22T03:00:00.000Z",
    });
    await expect(
      executeTool(tools.imessage_cancel_scheduled_message, {
        id: "scheduled-1",
      }),
    ).resolves.toEqual({ success: true });
  });

  it("resolves current-user aliases in scheduling tools from request context", async () => {
    const runtime = createFakeRuntime();
    const tools = createSchedulingTools(runtime);
    const requestContext = createAgentRequestContext({
      sender: "+819012345678",
      ownerPhone: "+819012345678",
    });

    await expect(
      executeTool(
        tools.imessage_schedule_message,
        {
          to: "me",
          text: "later",
          sendAt: "2099-03-22T01:00:00.000Z",
        },
        requestContext,
      ),
    ).resolves.toEqual({
      id: "scheduled-1",
      sendAt: "2099-03-22T01:00:00.000Z",
    });

    await expect(executeTool(tools.imessage_list_scheduled_messages, {})).resolves.toMatchObject({
      items: [{ id: "scheduled-1", to: "+819012345678" }],
    });
  });

  it("executes all reminder tools successfully", async () => {
    const runtime = createFakeRuntime();
    const tools = createReminderTools(runtime);

    await expect(
      executeTool(tools.imessage_set_reminder_in, {
        duration: "5 minutes",
        to: "+8190",
        message: "check back",
      }),
    ).resolves.toEqual({ id: "reminder-in-1" });
    await expect(
      executeTool(tools.imessage_set_reminder_at, {
        timeExpression: "tomorrow 9am",
        to: "+8190",
        message: "at reminder",
      }),
    ).resolves.toEqual({ id: "reminder-at-2" });
    await expect(
      executeTool(tools.imessage_set_reminder_exact, {
        date: "2099-03-22T05:00:00.000Z",
        to: "+8190",
        message: "exact reminder",
      }),
    ).resolves.toEqual({ id: "reminder-exact-3" });
    await expect(executeTool(tools.imessage_list_reminders, {})).resolves.toMatchObject({
      items: [
        { id: "reminder-in-1", to: "+8190", message: "check back" },
        { id: "reminder-at-2", to: "+8190", message: "at reminder" },
        { id: "reminder-exact-3", to: "+8190", message: "exact reminder" },
      ],
    });
    await expect(
      executeTool(tools.imessage_cancel_reminder, {
        id: "reminder-at-2",
      }),
    ).resolves.toEqual({ success: true });
  });

  it("resolves current-user aliases in reminder tools from request context", async () => {
    const runtime = createFakeRuntime();
    const tools = createReminderTools(runtime);
    const requestContext = createAgentRequestContext({
      sender: "+819012345678",
      ownerPhone: "+819012345678",
    });

    await expect(
      executeTool(
        tools.imessage_set_reminder_in,
        {
          duration: "5 minutes",
          to: "me",
          message: "check back",
        },
        requestContext,
      ),
    ).resolves.toEqual({ id: "reminder-in-1" });

    await expect(executeTool(tools.imessage_list_reminders, {})).resolves.toMatchObject({
      items: [{ id: "reminder-in-1", to: "+819012345678", message: "check back" }],
    });
  });

  it("executes Brave tools successfully and only includes brave-search when configured", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          web: {
            results: [
              {
                title: "Mastra",
                url: "https://mastra.ai",
                description: "Agent framework",
              },
            ],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => "<html><body><h1>Hello</h1><p>World</p></body></html>",
      });

    const tools = createWebTools(
      {
        braveSearch: { apiKey: "brave-test-key" },
      },
      fetchMock as never,
    );

    expect("brave-search" in tools).toBe(true);
    if (!("brave-search" in tools)) {
      throw new Error("brave-search should be present when BRAVE_API_KEY is configured");
    }

    await expect(executeTool(tools["brave-search"], { query: "mastra", count: 1 })).resolves.toEqual({
      provider: "brave",
      results: [
        {
          title: "Mastra",
          url: "https://mastra.ai",
          snippet: "Agent framework",
        },
      ],
    });
    await expect(executeTool(tools["brave-fetch"], { url: "https://mastra.ai", maxChars: 20 })).resolves.toEqual({
      url: "https://mastra.ai",
      content: "Hello World",
    });

    const toolsWithoutBrave = createWebTools(
      {
        braveSearch: null,
      },
      fetchMock as never,
    );

    expect("brave-search" in toolsWithoutBrave).toBe(false);
    expect("brave-fetch" in toolsWithoutBrave).toBe(true);
  });

  it("returns wallet profile and ensures wallet provisioning from request context", async () => {
    const services = createFakeServices();
    const tools = createWalletTools({
      wallets: services.wallets as never,
      userContextResolver: services.userContextResolver as never,
    });
    const requestContext = createAgentRequestContext({
      sender: "+819012345678",
      chatId: "chat-1",
      userId: "user-1",
    });

    await expect(executeTool(tools.wallet_get_profile, {}, requestContext)).resolves.toEqual({
      status: "ready",
      signerStatus: "ready",
      address: "0x1234567890abcdef1234567890abcdef12345678",
      chain: "ethereum",
    });

    await expect(executeTool(tools.wallet_ensure_primary, {}, requestContext)).resolves.toEqual({
      status: "ready",
      signerStatus: "ready",
      address: "0x1234567890abcdef1234567890abcdef12345678",
    });

    expect(services.userContextResolver.resolve).toHaveBeenCalledWith({
      sender: "+819012345678",
      chatId: "chat-1",
    });
    expect(services.wallets.ensurePrimaryWallet).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "user-1",
        sender: "+819012345678",
      }),
      false,
    );
  });

  it("returns Hyperliquid spot USDC balance for the current wallet", async () => {
    const services = createFakeServices();
    const tools = createHyperliquidTools(
      {
        wallets: services.wallets as never,
        hyperliquid: services.hyperliquid as never,
      },
      { includeGenericPassthrough: true },
    );
    const requestContext = createAgentRequestContext({
      sender: "+819012345678",
      userId: "user-1",
    });

    await expect(executeTool(tools.hyperliquid_get_spot_balance, {}, requestContext)).resolves.toEqual({
      network: "mainnet",
      address: "0x1234567890abcdef1234567890abcdef12345678",
      token: { index: 0, symbol: "USDC", decimals: 8, tokenId: "0xusdc", universe: "USDC" },
      balance: {
        raw: "100000000",
        formatted: "1",
        heldRaw: "0",
        heldFormatted: "0",
        availableRaw: "100000000",
        availableFormatted: "1",
        entryNtlRaw: "0",
        entryNtlFormatted: "0",
      },
    });
  });

  it("returns explicit Hyperliquid spot asset balances for the current wallet", async () => {
    const services = createFakeServices();
    const tools = createHyperliquidTools(
      {
        wallets: services.wallets as never,
        hyperliquid: services.hyperliquid as never,
      },
      { includeGenericPassthrough: true },
    );
    const requestContext = createAgentRequestContext({
      sender: "+819012345678",
      userId: "user-1",
    });

    await expect(executeTool(tools.hyperliquid_get_spot_balance, { token: "HYPE" }, requestContext)).resolves.toEqual({
      network: "mainnet",
      address: "0x1234567890abcdef1234567890abcdef12345678",
      token: { index: 150, symbol: "HYPE", decimals: 8, tokenId: "0xhype", universe: "HYPE/USDC" },
      balance: {
        raw: "100000000",
        formatted: "1",
        heldRaw: "0",
        heldFormatted: "0",
        availableRaw: "100000000",
        availableFormatted: "1",
        entryNtlRaw: "0",
        entryNtlFormatted: "0",
      },
    });

    expect(services.hyperliquid.getSpotBalance).toHaveBeenCalledWith(
      "0x1234567890abcdef1234567890abcdef12345678",
      "HYPE",
    );
  });

  it("searches Hyperliquid markets across perp and spot", async () => {
    const services = createFakeServices();
    const tools = createHyperliquidTools({
      wallets: services.wallets as never,
      hyperliquid: services.hyperliquid as never,
    });

    await expect(executeTool(tools.hyperliquid_search_markets, { query: "BTC" })).resolves.toEqual({
      network: "mainnet",
      query: "BTC",
      kind: "all",
      count: 2,
      markets: [
        { kind: "perp", symbol: "BTC", asset: 0, markPx: "95000" },
        { kind: "spot", symbol: "BTC/USDC", asset: 1000, markPx: "94990" },
      ],
    });
  });

  it("defaults user-scoped generic info methods to the current wallet address", async () => {
    const services = createFakeServices();
    const tools = createHyperliquidTools(
      {
        wallets: services.wallets as never,
        hyperliquid: services.hyperliquid as never,
      },
      { includeGenericPassthrough: true },
    );
    const requestContext = createAgentRequestContext({
      sender: "+819012345678",
      userId: "user-1",
    });

    await expect(
      executeTool(tools.hyperliquid_run_info_method, { method: "userRateLimit" }, requestContext),
    ).resolves.toEqual({
      network: "mainnet",
      method: "userRateLimit",
      result: { universe: [] },
    });

    expect(services.hyperliquid.queryInfo).toHaveBeenCalledWith("userRateLimit", {
      user: "0x1234567890abcdef1234567890abcdef12345678",
    });
  });

  it("truncates oversized generic info method payloads before returning them to the agent", async () => {
    const services = createFakeServices();
    services.hyperliquid.queryInfo.mockResolvedValueOnce({
      network: "mainnet",
      method: "spotMetaAndAssetCtxs",
      result: [
        {
          universe: Array.from({ length: 20 }, (_, index) => ({
            name: `MARKET-${index}`,
            index,
          })),
        },
      ],
    });
    const tools = createHyperliquidTools(
      {
        wallets: services.wallets as never,
        hyperliquid: services.hyperliquid as never,
      },
      { includeGenericPassthrough: true },
    );
    const requestContext = createAgentRequestContext({
      sender: "+819012345678",
      userId: "user-1",
    });

    await expect(
      executeTool(tools.hyperliquid_run_info_method, { method: "spotMetaAndAssetCtxs" }, requestContext),
    ).resolves.toEqual({
      network: "mainnet",
      method: "spotMetaAndAssetCtxs",
      result: [
        {
          universe: {
            items: [
              "[truncated object]",
              "[truncated object]",
              "[truncated object]",
              "[truncated object]",
              "[truncated object]",
            ],
            omittedItems: 15,
            totalItems: 20,
          },
        },
      ],
    });
  });

  it("executes Hyperliquid writes immediately without a confirmation-code round trip", async () => {
    const services = createFakeServices();
    const tools = createHyperliquidTools({
      wallets: services.wallets as never,
      hyperliquid: services.hyperliquid as never,
    });
    const requestContext = createAgentRequestContext({
      sender: "+819012345678",
      userId: "user-1",
      incomingText: "BTC を 0.01 買って",
    });

    await expect(
      executeTool(
        tools.hyperliquid_place_order,
        {
          market: "BTC",
          side: "buy",
          size: "0.01",
          price: "95000",
        },
        requestContext,
      ),
    ).resolves.toMatchObject({
      status: "submitted",
      message: "Submitted BTC order.\nExplorer: https://app.hyperliquid-testnet.xyz/explorer/tx/0xabc123",
      txHash: "0xabc123",
      explorerUrl: "https://app.hyperliquid-testnet.xyz/explorer/tx/0xabc123",
    });

    expect(services.hyperliquid.placeOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        address: "0x1234567890abcdef1234567890abcdef12345678",
      }),
      expect.objectContaining({
        market: "BTC",
        side: "buy",
        size: "0.01",
      }),
    );
  });

  it("re-bootstrapstraps a degraded signer before executing Hyperliquid writes", async () => {
    const services = createFakeServices();
    services.wallets.getProfile.mockResolvedValueOnce({
      id: "wallet-1",
      userId: "user-1",
      chain: "ethereum",
      address: "0x1234567890abcdef1234567890abcdef12345678",
      status: "ready",
      turnkeyOrganizationId: "org-1",
      turnkeyEndUserId: "user-turnkey-1",
      turnkeyWalletId: "wallet-turnkey-1",
      turnkeyAccountId: "account-turnkey-1",
      turnkeyDelegatedUserId: "delegated-1",
      turnkeyDelegatedKeyRef: "turnkey/delegated/org-1/delegated-1",
      signerStatus: "degraded",
      provisionedFrom: "phone_number_first_message",
      createdAt: "2099-03-22T00:00:00.000Z",
      updatedAt: "2099-03-22T00:00:00.000Z",
    });
    services.wallets.ensurePrimaryWallet.mockResolvedValueOnce({
      id: "wallet-1",
      userId: "user-1",
      chain: "ethereum",
      address: "0x1234567890abcdef1234567890abcdef12345678",
      status: "ready",
      turnkeyOrganizationId: "org-1",
      turnkeyEndUserId: "user-turnkey-1",
      turnkeyWalletId: "wallet-turnkey-1",
      turnkeyAccountId: "account-turnkey-1",
      turnkeyDelegatedUserId: "delegated-1",
      turnkeyDelegatedKeyRef: "turnkey/delegated/org-1/delegated-1",
      signerStatus: "ready",
      provisionedFrom: "phone_number_first_message",
      createdAt: "2099-03-22T00:00:00.000Z",
      updatedAt: "2099-03-22T00:00:00.000Z",
    });
    const tools = createHyperliquidTools({
      wallets: services.wallets as never,
      hyperliquid: services.hyperliquid as never,
    });
    const initialRequestContext = createAgentRequestContext({
      sender: "+819012345678",
      userId: "user-1",
      incomingText: "send 0.1 usdc",
    });

    await expect(
      executeTool(
        tools.hyperliquid_transfer_usd,
        { destination: "0x572a0a5f79469046a21f45ec7febb0a6309ea0dd", amount: "0.1" },
        initialRequestContext,
      ),
    ).resolves.toMatchObject({
      status: "submitted",
      message:
        "Submitted USDC transfer to 0x572a0a5f79469046a21f45ec7febb0a6309ea0dd.\nExplorer: https://app.hyperliquid-testnet.xyz/explorer/tx/0xabc123",
      txHash: "0xabc123",
      explorerUrl: "https://app.hyperliquid-testnet.xyz/explorer/tx/0xabc123",
    });

    expect(services.wallets.ensurePrimaryWallet).toHaveBeenCalled();
    expect(services.hyperliquid.transferUsd).toHaveBeenCalledWith(
      expect.objectContaining({
        signerStatus: "ready",
      }),
      {
        destination: "0x572a0a5f79469046a21f45ec7febb0a6309ea0dd",
        amount: "0.1",
      },
    );
  });

  it("compacts first-class Hyperliquid read results before returning them to the model", async () => {
    const services = createFakeServices();
    services.hyperliquid.getUserSummary.mockResolvedValueOnce({
      network: "mainnet",
      address: "0x1234567890abcdef1234567890abcdef12345678",
      summary: {
        assetPositions: Array.from({ length: 12 }, (_, index) => ({
          position: {
            coin: `COIN-${index}`,
            sz: "1",
          },
        })),
      },
    });
    const tools = createHyperliquidTools({
      wallets: services.wallets as never,
      hyperliquid: services.hyperliquid as never,
    });
    const requestContext = createAgentRequestContext({
      sender: "+819012345678",
      userId: "user-1",
      incomingText: "portfolio を見せて",
    });

    await expect(executeTool(tools.hyperliquid_get_user_summary, {}, requestContext)).resolves.toEqual({
      network: "mainnet",
      address: "0x1234567890abcdef1234567890abcdef12345678",
      summary: {
        assetPositions: {
          items: [
            { position: "[truncated object]" },
            { position: "[truncated object]" },
            { position: "[truncated object]" },
            { position: "[truncated object]" },
            { position: "[truncated object]" },
          ],
          omittedItems: 7,
          totalItems: 12,
        },
      },
    });
  });

  it("executes generic Hyperliquid exchange actions immediately and compacts the result", async () => {
    const services = createFakeServices();
    services.hyperliquid.executeAction.mockResolvedValueOnce({
      network: "mainnet",
      action: "twapOrder",
      result: {
        statuses: Array.from({ length: 12 }, (_, index) => ({
          resting: { oid: index + 1 },
        })),
      },
      txHash: "0xabc123",
      explorerUrl: "https://app.hyperliquid-testnet.xyz/explorer/tx/0xabc123",
    });
    const tools = createHyperliquidTools(
      {
        wallets: services.wallets as never,
        hyperliquid: services.hyperliquid as never,
      },
      { includeGenericPassthrough: true },
    );
    const requestContext = createAgentRequestContext({
      sender: "+819012345678",
      userId: "user-1",
      incomingText: "TWAP を入れて",
    });

    await expect(
      executeTool(
        tools.hyperliquid_run_exchange_action,
        {
          action: "twapOrder",
          params: {
            twap: { a: 0, b: true, s: "1", r: false, m: 10, t: true },
          },
        },
        requestContext,
      ),
    ).resolves.toEqual({
      status: "submitted",
      message:
        'Execute Hyperliquid action twapOrder with params {"twap":{"a":0,"b":true,"s":"1","r":false,"m":10,"t":true}}.\nExplorer: https://app.hyperliquid-testnet.xyz/explorer/tx/0xabc123',
      txHash: "0xabc123",
      explorerUrl: "https://app.hyperliquid-testnet.xyz/explorer/tx/0xabc123",
      result: {
        network: "mainnet",
        action: "twapOrder",
        result: {
          statuses: {
            items: "[truncated array: 5 items]",
            omittedItems: 7,
            totalItems: 12,
          },
        },
      },
    });
  });
});
