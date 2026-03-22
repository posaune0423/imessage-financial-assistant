import { env } from "./env";

const AGENT_AUTONOMY_DEFAULTS = {
  maxSteps: 5,
  maxOutputTokens: 1_024,
  observationalMemory: {
    enabled: false,
  },
  memory: {
    lastMessages: 8,
  },
} as const;

export interface AgentMemoryConfig {
  databaseUrl: string;
  lastMessages: number;
  observationalMemory: {
    enabled: boolean;
    model: string;
  };
}

export interface GeneralAgentConfig {
  model: string;
  maxSteps: number;
  maxOutputTokens: number;
  memory: AgentMemoryConfig;
}

export interface HeartbeatConfig {
  intervalMs: number;
  activeStart: string;
  activeEnd: string;
}

export interface WebToolConfig {
  braveSearch: {
    apiKey: string;
  } | null;
}

export interface ToolRuntimeConfig {
  persistPath: string;
  debug: boolean;
}

export interface AlliumMcpConfig {
  apiKey: string;
}

export interface McpConfig {
  timeoutMs: number;
  servers: {
    allium: AlliumMcpConfig | null;
  };
}

export interface AppConfig {
  ownerPhone: string;
  logLevel: typeof env.LOG_LEVEL;
  agent: GeneralAgentConfig;
  heartbeat: HeartbeatConfig;
  tools: {
    web: WebToolConfig;
    runtime: ToolRuntimeConfig;
  };
  mcp: McpConfig;
}

export function createAppConfig(source = env): AppConfig {
  return {
    ownerPhone: source.OWNER_PHONE,
    logLevel: source.LOG_LEVEL,
    agent: {
      model: source.ANTHROPIC_MODEL,
      maxSteps: AGENT_AUTONOMY_DEFAULTS.maxSteps,
      maxOutputTokens: AGENT_AUTONOMY_DEFAULTS.maxOutputTokens,
      memory: {
        databaseUrl: source.DATABASE_URL,
        lastMessages: AGENT_AUTONOMY_DEFAULTS.memory.lastMessages,
        observationalMemory: {
          enabled: AGENT_AUTONOMY_DEFAULTS.observationalMemory.enabled,
          model: source.ANTHROPIC_MODEL,
        },
      },
    },
    heartbeat: {
      intervalMs: source.HEARTBEAT_INTERVAL_MS,
      activeStart: source.HEARTBEAT_ACTIVE_START,
      activeEnd: source.HEARTBEAT_ACTIVE_END,
    },
    tools: {
      web: {
        braveSearch: source.BRAVE_API_KEY ? { apiKey: source.BRAVE_API_KEY } : null,
      },
      runtime: {
        persistPath: source.IMESSAGE_SCHEDULER_PERSIST_PATH,
        debug: source.LOG_LEVEL === "debug" || source.LOG_LEVEL === "trace",
      },
    },
    mcp: {
      timeoutMs: source.MCP_TIMEOUT_MS,
      servers: {
        allium: source.ALLIUM_API_KEY ? { apiKey: source.ALLIUM_API_KEY } : null,
      },
    },
  };
}

export const appConfig = createAppConfig();
