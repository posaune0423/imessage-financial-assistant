import { describe, expect, it, vi } from "vitest";

import {
  createDirectMessageHandler,
  createSchedulingLifecycleLogger,
  getDirectMessageFailureReply,
  shouldResolveMcpToolsets,
} from "../../src/main";
import { logger } from "../../src/utils/logger";
import { samePhone } from "../../src/utils/phone";

describe("message loop", () => {
  const ownerPhone = "+819012345678";

  it("owner phone matches with samePhone", () => {
    expect(samePhone("+819012345678", ownerPhone)).toBe(true);
  });

  it("non-owner phone does not match", () => {
    expect(samePhone("+819099999999", ownerPhone)).toBe(false);
  });

  it("routes a normal direct message through the agent with tool options", async () => {
    const generate = vi.fn().mockResolvedValue({ text: "了解しました。" });
    const sendMessage = vi.fn();
    const resolveToolsets = vi.fn().mockResolvedValue({});
    const handler = createDirectMessageHandler({
      ownerPhone,
      agent: { generate } as never,
      sendMessage,
      resolveToolsets,
      maxSteps: 3,
    });

    await handler({ sender: "+819012345678", text: "こんにちは" });

    expect(resolveToolsets).not.toHaveBeenCalled();
    expect(generate).toHaveBeenCalledWith(
      "こんにちは",
      expect.objectContaining({
        memory: { resource: "+819012345678", thread: "default" },
        maxSteps: 3,
        toolsets: undefined,
        requestContext: expect.anything(),
        onStepFinish: expect.any(Function),
      }),
    );
    const requestContext = generate.mock.calls[0]?.[1]?.requestContext;
    expect(requestContext?.get("sender")).toBe("+819012345678");
    expect(requestContext?.get("ownerPhone")).toBe(ownerPhone);
    expect(sendMessage).toHaveBeenCalledWith("+819012345678", "了解しました。");
  });

  it("resolves MCP toolsets only for likely MCP-heavy requests", async () => {
    const generate = vi.fn().mockResolvedValue({ text: "残高を確認します。" });
    const sendMessage = vi.fn();
    const resolveToolsets = vi.fn().mockResolvedValue({ allium: {} });
    const handler = createDirectMessageHandler({
      ownerPhone,
      agent: { generate } as never,
      sendMessage,
      resolveToolsets,
      maxSteps: 3,
    });

    await handler({ sender: "+819012345678", text: "wallet balanceを見て" });

    expect(resolveToolsets).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledWith(
      "wallet balanceを見て",
      expect.objectContaining({
        memory: { resource: "+819012345678", thread: "default" },
        maxSteps: 3,
        toolsets: { allium: {} },
        requestContext: expect.anything(),
        onStepFinish: expect.any(Function),
      }),
    );
  });

  it("routes scheduling requests through the agent instead of bypassing it", async () => {
    const generate = vi.fn().mockResolvedValue({ text: "明日9:00にリマインダーを設定しました。" });
    const sendMessage = vi.fn();
    const handler = createDirectMessageHandler({
      ownerPhone,
      agent: { generate } as never,
      sendMessage,
      maxSteps: 3,
    });

    await handler({ sender: "+819012345678", text: "1分後に私に話しかけてください" });

    expect(generate).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith("+819012345678", "明日9:00にリマインダーを設定しました。");
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

      return { text: "調べ終わりました。" };
    });
    const handler = createDirectMessageHandler({
      ownerPhone,
      agent: { generate } as never,
      sendMessage,
      maxSteps: 3,
    });

    await handler({ sender: "+819012345678", text: "最新情報を見て" });

    expect(sendMessage).toHaveBeenNthCalledWith(1, "+819012345678", "確認しながら進めています。少し待ってください。");
    expect(sendMessage).toHaveBeenNthCalledWith(2, "+819012345678", "調べ終わりました。");
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
      "# Owner Profile\n- Name:\n\n# Open Loops\n- Finished task A\n- Finished task B\n- Finished task C";
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

      return { text: "箱根は晴れそうです。" };
    });
    const handler = createDirectMessageHandler({
      ownerPhone,
      agent: { generate } as never,
      sendMessage,
      maxSteps: 3,
    });

    await handler({ sender: "+819012345678", text: "明日の箱根の天気は？" });

    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        '[agent] tool-call id=tool-call-2 name=updateWorkingMemory args={"memory":"[redacted working memory ',
      ),
    );
    expect(infoSpy).not.toHaveBeenCalledWith(expect.stringContaining("Finished task A"));

    infoSpy.mockRestore();
  });

  it("sends a short fallback reply on Anthropic rate limit errors", async () => {
    const generate = vi.fn().mockRejectedValue({
      statusCode: 429,
      responseHeaders: {
        "retry-after": "23",
      },
    });
    const sendMessage = vi.fn();
    const handler = createDirectMessageHandler({
      ownerPhone,
      agent: { generate } as never,
      sendMessage,
      maxSteps: 3,
    });

    await handler({ sender: "+819012345678", text: "こんにちは" });

    expect(sendMessage).toHaveBeenCalledWith(
      "+819012345678",
      "今少し混み合っています。23秒ほど待ってからもう一度送ってください。",
    );
  });
});

describe("direct message helpers", () => {
  it("detects likely MCP requests from the message text", () => {
    expect(shouldResolveMcpToolsets("wallet balanceを見て")).toBe(true);
    expect(shouldResolveMcpToolsets("こんにちは")).toBe(false);
  });

  it("creates a retry message for rate limits", () => {
    expect(
      getDirectMessageFailureReply({
        statusCode: 429,
        responseHeaders: { "retry-after": "12" },
      }),
    ).toBe("今少し混み合っています。12秒ほど待ってからもう一度送ってください。");
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
