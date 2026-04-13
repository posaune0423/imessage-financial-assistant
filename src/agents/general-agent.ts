import { Agent } from "@mastra/core/agent";
import type { ToolsInput } from "@mastra/core/agent";
import { TokenLimiter, ToolCallFilter } from "@mastra/core/processors";

import type { GeneralAgentConfig } from "../config";
import { loadTextFile } from "../utils/fs";
import { createAgentMemory } from "./memory";
import { agentRequestContextSchema } from "./request-context";

const BASE_INSTRUCTIONS = loadTextFile(new URL("./SOUL.md", import.meta.url));
const TOOL_HISTORY_EXCLUDE = ["updateWorkingMemory"];
const INPUT_TOKEN_LIMIT = 12_000;
type RuntimeInstructionKey = "agentScope" | "hyperliquidNetwork" | "walletStatus" | "signerStatus" | "walletAddress";

function buildRuntimeInstructionBlock(requestContext?: { get: (key: RuntimeInstructionKey) => unknown }): string {
  if (!requestContext) {
    return BASE_INSTRUCTIONS;
  }

  const scope = requestContext.get("agentScope");
  const network = requestContext.get("hyperliquidNetwork");
  const walletStatus = requestContext.get("walletStatus");
  const signerStatus = requestContext.get("signerStatus");
  const walletAddress = requestContext.get("walletAddress");

  const lines = [
    typeof scope === "string" ? `- Active tool scope: ${scope}` : undefined,
    typeof network === "string" ? `- Hyperliquid network: ${network}` : undefined,
    typeof walletStatus === "string" ? `- Wallet status: ${walletStatus}` : undefined,
    typeof signerStatus === "string" ? `- Signer status: ${signerStatus}` : undefined,
    typeof walletAddress === "string" ? `- Wallet address: ${walletAddress}` : undefined,
  ].filter((line): line is string => Boolean(line));

  if (lines.length === 0) {
    return BASE_INSTRUCTIONS;
  }

  return `${BASE_INSTRUCTIONS}\n\nRuntime request context:\n${lines.join("\n")}`;
}

export function createGeneralAgent(config: GeneralAgentConfig, tools: ToolsInput = {}) {
  const { model, maxOutputTokens, memory } = config;

  return new Agent({
    id: "general-agent",
    name: "General Agent",
    requestContextSchema: agentRequestContextSchema,
    instructions: ({ requestContext }) => buildRuntimeInstructionBlock(requestContext),
    model,
    defaultOptions: {
      modelSettings: {
        maxOutputTokens,
        temperature: 0,
      },
    },
    tools,
    memory: createAgentMemory(memory),
    inputProcessors: () => [
      new ToolCallFilter({
        exclude: TOOL_HISTORY_EXCLUDE,
      }),
      new TokenLimiter({
        limit: INPUT_TOKEN_LIMIT,
      }),
    ],
  });
}
