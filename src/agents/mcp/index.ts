import type { ToolsetsInput } from "@mastra/core/agent";
import { MCPClient } from "@mastra/mcp";
import type { MastraMCPServerDefinition } from "@mastra/mcp";

import type { McpConfig } from "../../config";
import { logger } from "../../utils/logger";
import { createAlliumServer } from "./allium";

export { createAlliumServer } from "./allium";

export interface McpRuntime {
  client: MCPClient | null;
  servers: Record<string, MastraMCPServerDefinition>;
  getToolsets: () => Promise<ToolsetsInput>;
  getToolsetsForText: (text: string) => Promise<ToolsetsInput>;
}

function createMcpServers(config: McpConfig) {
  const servers: Record<string, MastraMCPServerDefinition> = {};

  const allium = createAlliumServer(config.servers.allium);
  if (allium) {
    servers.allium = allium;
  }

  return servers;
}

async function getMcpToolsets(client: MCPClient | null): Promise<ToolsetsInput> {
  if (!client) {
    return {};
  }

  const { toolsets, errors } = await client.listToolsetsWithErrors();
  for (const [serverName, error] of Object.entries(errors)) {
    logger.warn(`[mcp] failed to connect to ${serverName}`, error);
  }

  return toolsets;
}

function filterToolsetsByName(toolsets: ToolsetsInput, allowedToolIds: string[]): ToolsetsInput {
  if (allowedToolIds.length === 0) {
    return {};
  }

  const filteredToolsets: ToolsetsInput = {};
  for (const [toolsetName, toolset] of Object.entries(toolsets)) {
    const filteredEntries = Object.entries(toolset ?? {}).filter(([toolId]) => allowedToolIds.includes(toolId));
    if (filteredEntries.length > 0) {
      filteredToolsets[toolsetName] = Object.fromEntries(filteredEntries);
    }
  }

  return filteredToolsets;
}

function resolveAlliumToolAllowlist(text: string): string[] {
  const normalized = text.toLowerCase();
  const wantsBalance = /\b(balance|balances|portfolio|holdings|wallet|position|positions|pnl|net worth|worth)\b/.test(
    normalized,
  );
  const wantsTransactions = /\b(transaction|transactions|transfer|activity|activities|history|fills)\b/.test(
    normalized,
  );
  const wantsMarket = /\b(price|prices|market|markets|quote|quotes|token|tokens|btc|eth|usdc)\b/.test(normalized);

  const allowed = new Set<string>();

  if (wantsBalance) {
    allowed.add("realtime_latest_token_balances");
    allowed.add("realtime_holdings_pnl");
    allowed.add("realtime_holdings_history");
    allowed.add("realtime_get_positions");
    allowed.add("realtime_token_latest_price");
    allowed.add("realtime_token_price_stats");
  }

  if (wantsTransactions) {
    allowed.add("realtime_transactions");
    allowed.add("realtime_holdings_history");
    allowed.add("realtime_latest_token_balances");
  }

  if (wantsMarket) {
    allowed.add("realtime_search_tokens");
    allowed.add("realtime_list_tokens");
    allowed.add("realtime_token_latest_price");
    allowed.add("realtime_token_price_stats");
    allowed.add("realtime_token_price_history");
  }

  if (allowed.size === 0) {
    allowed.add("realtime_latest_token_balances");
    allowed.add("realtime_token_latest_price");
    allowed.add("realtime_token_price_stats");
  }

  return [...allowed];
}

export function createMcpRuntime(config: McpConfig): McpRuntime {
  const servers = createMcpServers(config);
  const client =
    Object.keys(servers).length === 0
      ? null
      : new MCPClient({
          servers,
          timeout: config.timeoutMs,
        });

  return {
    client,
    servers,
    getToolsets: async () => getMcpToolsets(client),
    getToolsetsForText: async (text) => {
      const toolsets = await getMcpToolsets(client);
      return filterToolsetsByName(toolsets, resolveAlliumToolAllowlist(text));
    },
  };
}
