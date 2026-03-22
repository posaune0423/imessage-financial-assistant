import { Agent } from "@mastra/core/agent";
import type { ToolsInput } from "@mastra/core/agent";

import type { GeneralAgentConfig } from "../config";
import { loadTextFile } from "../utils/fs";
import { createAgentMemory } from "./memory";

export function createGeneralAgent(config: GeneralAgentConfig, tools: ToolsInput = {}) {
  const { model, maxOutputTokens, memory } = config;

  return new Agent({
    id: "general-agent",
    name: "General Agent",
    instructions: loadTextFile(new URL("./SOUL.md", import.meta.url)),
    model,
    defaultOptions: {
      modelSettings: {
        maxOutputTokens,
        temperature: 0,
      },
    },
    tools,
    memory: createAgentMemory(memory),
  });
}
