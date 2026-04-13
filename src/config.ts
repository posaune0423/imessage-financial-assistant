import { env } from "./env";

export type HyperliquidNetwork = "mainnet" | "testnet";

const HYPERLIQUID_ENDPOINTS = {
  mainnet: {
    apiUrl: "https://api.hyperliquid.xyz",
    wsUrl: "wss://api.hyperliquid.xyz/ws",
  },
  testnet: {
    apiUrl: "https://api.hyperliquid-testnet.xyz",
    wsUrl: "wss://api.hyperliquid-testnet.xyz/ws",
  },
} as const satisfies Record<HyperliquidNetwork, { apiUrl: string; wsUrl: string }>;

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

export interface TurnkeyConfig {
  apiBaseUrl: string;
  apiPublicKey: string;
  apiPrivateKey: string;
  organizationId: string;
  delegatedKeySecretNamespace: string;
}

export interface HyperliquidConfig {
  network: HyperliquidNetwork;
  isTestnet: boolean;
  apiUrl: string;
  wsUrl: string;
}

export interface AppConfig {
  ownerPhone: string;
  logLevel: typeof env.LOG_LEVEL;
  multiUserMode: boolean;
  agent: GeneralAgentConfig;
  heartbeat: HeartbeatConfig;
  tools: {
    web: WebToolConfig;
    runtime: ToolRuntimeConfig;
  };
  mcp: McpConfig;
  turnkey: TurnkeyConfig;
  hyperliquid: HyperliquidConfig;
}

export function createAppConfig(source = env): AppConfig {
  const hyperliquidEndpoints = HYPERLIQUID_ENDPOINTS[source.HYPERLIQUID_NETWORK];

  return {
    ownerPhone: source.OWNER_PHONE,
    logLevel: source.LOG_LEVEL,
    multiUserMode: source.MULTI_USER_MODE,
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
    turnkey: {
      apiBaseUrl: source.TURNKEY_API_BASE_URL,
      apiPublicKey: source.TURNKEY_API_PUBLIC_KEY,
      apiPrivateKey: source.TURNKEY_API_PRIVATE_KEY,
      organizationId: source.TURNKEY_ORGANIZATION_ID,
      delegatedKeySecretNamespace: source.TURNKEY_DELEGATED_KEY_SECRET_NAMESPACE,
    },
    hyperliquid: {
      network: source.HYPERLIQUID_NETWORK,
      isTestnet: source.HYPERLIQUID_NETWORK === "testnet",
      apiUrl: hyperliquidEndpoints.apiUrl,
      wsUrl: hyperliquidEndpoints.wsUrl,
    },
  };
}

export const appConfig = createAppConfig();
