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
  };
}
