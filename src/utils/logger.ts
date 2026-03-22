import { appConfig } from "../config";

const LOG_LEVEL_PRIORITY = {
  fatal: 0,
  error: 1,
  warn: 2,
  log: 3,
  info: 4,
  debug: 5,
  trace: 6,
} as const;

type LogLevel = keyof typeof LOG_LEVEL_PRIORITY;

const shouldLog = (level: LogLevel): boolean => {
  const currentLevel = appConfig.logLevel;
  return LOG_LEVEL_PRIORITY[level] <= LOG_LEVEL_PRIORITY[currentLevel];
};

const colorize = (message: string, level: LogLevel): string => {
  const colors = {
    fatal: "\x1B[31m",
    error: "\x1B[31m",
    warn: "\x1B[33m",
    log: null,
    info: "\x1B[36m",
    debug: "\x1B[32m",
    trace: "\x1B[90m",
  };

  const reset = "\x1B[0m";
  const color = colors[level];

  if (color === null) {
    return message;
  }

  return `${color}${message}${reset}`;
};

const formatHeader = (level: LogLevel): string => {
  const timestamp = `[${new Date().toISOString()}]`;
  const levelTag = `[${level.toUpperCase()}]`;
  return colorize(`${timestamp} ${levelTag}`, level);
};

export const logger = {
  log: (...args: unknown[]) => {
    if (!shouldLog("log")) return;
    const header = formatHeader("log");
    console.log(header, ...args);
  },
  info: (...args: unknown[]) => {
    if (!shouldLog("info")) return;
    const header = formatHeader("info");
    console.info(header, ...args);
  },
  debug: (...args: unknown[]) => {
    if (!shouldLog("debug")) return;
    const header = formatHeader("debug");
    console.log(header, ...args);
  },
  warn: (...args: unknown[]) => {
    if (!shouldLog("warn")) return;
    const header = formatHeader("warn");
    console.warn(header, ...args);
  },
  error: (...args: unknown[]) => {
    if (!shouldLog("error")) return;
    const header = formatHeader("error");
    console.error(header, ...args);
  },
  fatal: (...args: unknown[]) => {
    if (!shouldLog("fatal")) return;
    const header = formatHeader("fatal");
    console.error(header, ...args);
  },
  trace: (...args: unknown[]) => {
    if (!shouldLog("trace")) return;
    const header = formatHeader("trace");
    console.debug(header, ...args);
  },
};
