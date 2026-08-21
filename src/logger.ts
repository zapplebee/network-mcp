import winston from "winston"
import type { Config } from "./config"

export function createLogger(config: Pick<Config, "logLevel">) {
  return winston.createLogger({
    level: config.logLevel,
    defaultMeta: { service: "network-mcp" },
    format: winston.format.combine(winston.format.timestamp(), winston.format.errors({ stack: true }), winston.format.json()),
    transports: [new winston.transports.Console()],
  })
}

export type AppLogger = ReturnType<typeof createLogger>
