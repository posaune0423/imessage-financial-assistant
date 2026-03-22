import type { ToolsInput } from "@mastra/core/agent";
import type { AgentToolRuntime } from "./runtime";

import { createIMessageTools } from "./imessage";
import { createReminderTools } from "./reminder";
import { createSchedulingTools } from "./scheduling";
import { createAgentToolRuntime } from "./runtime";
import { createWebTools } from "./brave";
import type { ToolRuntimeConfig, WebToolConfig } from "../../config";

export function createAgentTools(runtime: AgentToolRuntime, config: { web: WebToolConfig }): ToolsInput {
  return {
    ...createWebTools(config.web),
    ...createIMessageTools(runtime),
    ...createSchedulingTools(runtime),
    ...createReminderTools(runtime),
  };
}

export { createAgentToolRuntime };
export type { AgentToolRuntime };
export type { ToolRuntimeConfig };
