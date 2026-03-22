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
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "log", "info", "debug", "trace"]).default("info"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
