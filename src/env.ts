import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    ANTHROPIC_API_KEY: z.string().min(1),
    ANTHROPIC_MODEL: z.string().default("anthropic/claude-haiku-4-5"),
    OWNER_PHONE: z.string().min(1),

    HEARTBEAT_INTERVAL_MS: z.coerce.number().default(60 * 60 * 1000),
    HEARTBEAT_ACTIVE_START: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .default("08:00"),
    HEARTBEAT_ACTIVE_END: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .default("22:00"),

    DATABASE_URL: z.string().default("file:./data/agent.db"),
    IMESSAGE_SCHEDULER_PERSIST_PATH: z.string().default("./data/imessage-scheduler.json"),
    BRAVE_API_KEY: z.string().optional(),
    ALLIUM_API_KEY: z.string().optional(),
    MCP_TIMEOUT_MS: z.coerce.number().default(60_000),
    TURNKEY_API_BASE_URL: z.string().url().default("https://api.turnkey.com"),
    TURNKEY_API_PUBLIC_KEY: z.string().optional(),
    TURNKEY_API_PRIVATE_KEY: z.string().optional(),
    TURNKEY_ORGANIZATION_ID: z.string().optional(),
    TURNKEY_DELEGATED_KEY_SECRET_NAMESPACE: z.string().default("turnkey/delegated"),
    HYPERLIQUID_API_URL: z.string().url().default("https://api.hyperliquid.xyz"),
    HYPERLIQUID_WS_URL: z.string().url().default("wss://api.hyperliquid.xyz/ws"),
    HYPERLIQUID_SIGNATURE_CHAIN_ID: z.coerce.number().optional(),
    MULTI_USER_MODE: z.coerce.boolean().default(true),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "log", "info", "debug", "trace"]).default("info"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
