import type { MastraMCPServerDefinition } from "@mastra/mcp";

import type { AlliumMcpConfig } from "../../config";

export function createAlliumServer(config: AlliumMcpConfig | null): MastraMCPServerDefinition | null {
  if (!config) {
    return null;
  }

  return {
    url: new URL("https://mcp.allium.so"),
    requestInit: {
      headers: {
        "X-API-KEY": config.apiKey,
      },
    },
  };
}
