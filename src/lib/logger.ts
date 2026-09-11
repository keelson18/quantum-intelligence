// ============================================================================
// Structured logging — single logging entry point for server and client code.
//
// Emits one JSON object per line so log aggregators (Cloudflare Logpush,
// Datadog, Loki) can index fields without regex parsing. Never log secrets,
// bearer tokens, passwords or full request bodies: pass only the fields you
// intend to keep, and use `redact()` for anything user supplied.
// ============================================================================

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogFields {
  [key: string]: unknown;
}

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function configuredLevel(): LogLevel {
  const raw =
    (typeof process !== "undefined" ? process.env?.["LOG_LEVEL"] : undefined) ??
    (import.meta.env?.["VITE_LOG_LEVEL"] as string | undefined);
  const level = (raw ?? "info").toLowerCase() as LogLevel;
  return level in LEVEL_WEIGHT ? level : "info";
}

const SENSITIVE_KEY = /(pass(word)?|secret|token|authorization|api[-_]?key|cookie)/i;

/** Shallow-redacts values whose key names look credential-bearing. */
export function redact<T extends LogFields>(fields: T): LogFields {
  const out: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : value;
  }
  return out;
}

function emit(level: LogLevel, message: string, fields?: LogFields): void {
  if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[configuredLevel()]) return;

  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(fields ? redact(fields) : {}),
  };
  const line = JSON.stringify(entry);

  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  /** Returns a logger that merges `bound` into every entry. */
  child(bound: LogFields): Logger;
}

function makeLogger(bound: LogFields): Logger {
  return {
    debug: (m, f) => emit("debug", m, { ...bound, ...f }),
    info: (m, f) => emit("info", m, { ...bound, ...f }),
    warn: (m, f) => emit("warn", m, { ...bound, ...f }),
    error: (m, f) => emit("error", m, { ...bound, ...f }),
    child: (extra) => makeLogger({ ...bound, ...extra }),
  };
}

export const logger: Logger = makeLogger({});

/** Normalises an unknown throwable into log-safe fields. */
export function errorFields(error: unknown): LogFields {
  if (error instanceof Error) {
    return { error_name: error.name, error_message: error.message, stack: error.stack };
  }
  return { error_message: String(error) };
}
