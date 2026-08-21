import pino from "pino";
import pretty from "pino-pretty";

/**
 * Passes pino-pretty as a stream rather than pino's string-based `transport`
 * target, which resolves the target module from a worker thread relative to
 * pino's own install location — that breaks across workspace package
 * boundaries in this monorepo (the caller's node_modules isn't where pino
 * looks). A direct stream sidesteps that resolution entirely.
 */
export function createLogger(service: string) {
  const options: pino.LoggerOptions = {
    name: service,
    level: process.env.LOG_LEVEL ?? "info",
  };
  return process.env.NODE_ENV !== "production"
    ? pino(options, pretty({ colorize: true }))
    : pino(options);
}

export type Logger = ReturnType<typeof createLogger>;
