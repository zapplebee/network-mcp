export type Config = {
  host: string
  port: number
  logLevel: string
  mcpAuthToken?: string
  udmBaseUrl: string
  udmUsername: string
  udmPassword: string
  udmSite: string
  udmTlsRejectUnauthorized: boolean
  dbPath: string
}

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

export function loadConfig(): Config {
  return {
    host: process.env.HOST ?? "127.0.0.1",
    port: Number(process.env.PORT ?? "4123"),
    logLevel: process.env.LOG_LEVEL ?? "info",
    mcpAuthToken: process.env.MCP_AUTH_TOKEN,
    udmBaseUrl: requiredEnv("UDM_BASE_URL").replace(/\/$/, ""),
    udmUsername: requiredEnv("UDM_USERNAME"),
    udmPassword: requiredEnv("UDM_PASSWORD"),
    udmSite: process.env.UDM_SITE ?? "default",
    udmTlsRejectUnauthorized: (process.env.UDM_TLS_REJECT_UNAUTHORIZED ?? "false") === "true",
    dbPath: process.env.DB_PATH ?? "./data/db.json",
  }
}
