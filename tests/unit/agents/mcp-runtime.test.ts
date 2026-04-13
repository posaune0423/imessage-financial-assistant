import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { describe, expect, it, vi } from "vitest";

import type { McpConfig } from "../../../src/config";

vi.mock("@mastra/mcp", () => {
  class FakeMCPClient {
    constructor(
      public readonly options: {
        servers: Record<string, unknown>;
        timeout: number;
      },
    ) {}

    async listToolsetsWithErrors() {
      return {
        toolsets: {
          allium: {
            echo: createTool({
              id: "echo",
              description: "Echo a message",
              inputSchema: z.object({
                message: z.string(),
              }),
              outputSchema: z.object({
                echoed: z.string(),
              }),
              execute: async ({ message }) => ({
                echoed: message,
              }),
            }),
            realtime_latest_token_balances: createTool({
              id: "realtime_latest_token_balances",
              description: "Latest balances",
              inputSchema: z.object({}),
              outputSchema: z.object({ ok: z.boolean() }),
              execute: async () => ({ ok: true }),
            }),
            realtime_token_latest_price: createTool({
              id: "realtime_token_latest_price",
              description: "Latest token price",
              inputSchema: z.object({}),
              outputSchema: z.object({ ok: z.boolean() }),
              execute: async () => ({ ok: true }),
            }),
            realtime_transactions: createTool({
              id: "realtime_transactions",
              description: "Transactions",
              inputSchema: z.object({}),
              outputSchema: z.object({ ok: z.boolean() }),
              execute: async () => ({ ok: true }),
            }),
          },
        },
        errors: {},
      };
    }

    async disconnect() {}
  }

  return {
    MCPClient: FakeMCPClient,
  };
});

interface ToolLike {
  execute?: (...args: unknown[]) => PromiseLike<unknown>;
}

async function executeTool(tool: unknown, args: unknown) {
  const executable = tool as ToolLike;
  expect(executable.execute).toBeTypeOf("function");
  return executable.execute?.(args, {
    toolCallId: "tool-call-1",
    messages: [],
  });
}

describe("createMcpRuntime", () => {
  it("builds the allium server and executes an MCP toolset tool", async () => {
    const { createMcpRuntime } = await import("../../../src/agents/mcp");
    const config: McpConfig = {
      timeoutMs: 1_000,
      servers: {
        allium: { apiKey: "allium-test-key" },
      },
    };
    const runtime = createMcpRuntime(config);
    const server = runtime.servers.allium;

    expect(server?.url?.toString()).toBe("https://mcp.allium.so/");
    expect(server?.requestInit?.headers).toEqual({
      "X-API-KEY": "allium-test-key",
    });

    const toolsets = await runtime.getToolsets();
    await expect(executeTool(toolsets.allium?.echo ?? {}, { message: "hello" })).resolves.toEqual({
      echoed: "hello",
    });
  });

  it("returns empty toolsets when no MCP server is configured", async () => {
    const { createMcpRuntime } = await import("../../../src/agents/mcp");
    const runtime = createMcpRuntime({
      timeoutMs: 1_000,
      servers: {
        allium: null,
      },
    });

    await expect(runtime.getToolsets()).resolves.toEqual({});
  });

  it("filters Allium tools by request intent", async () => {
    const { createMcpRuntime } = await import("../../../src/agents/mcp");
    const runtime = createMcpRuntime({
      timeoutMs: 1_000,
      servers: {
        allium: { apiKey: "allium-test-key" },
      },
    });

    const toolsets = await runtime.getToolsetsForText("show my wallet balance");
    const toolIds = Object.keys(toolsets.allium ?? {});

    expect(toolIds).toContain("realtime_latest_token_balances");
    expect(toolIds).not.toContain("echo");
  });
});
