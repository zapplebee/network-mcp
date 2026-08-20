import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { Hono } from "hono"
import type { Config } from "../config"
import type { AppLogger } from "../logger"
import type { ActionLogService } from "../services/action-log-service"
import type { DeviceService } from "../services/device-service"
import { createMcpServer } from "../mcp/tools"
import { bearerAuth } from "./auth"

export async function createHttpServer(config: Config, deviceService: DeviceService, actionLog: ActionLogService, logger: AppLogger): Promise<Hono> {
  const app = new Hono()

  app.use("*", async (c, next) => {
    const started = performance.now()
    await next()
    logger.info("http_request", {
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      status: c.res.status,
      durationMs: Math.round(performance.now() - started),
    })
  })

  app.onError((error, c) => {
    logger.error("http_error", {
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      error,
    })
    return c.json({ error: "internal_server_error" }, 500)
  })

  app.get("/health", (c) => c.json({ ok: true, service: "network-mcp" }))

  app.use("/mcp", bearerAuth(config.mcpAuthToken))
  app.all("/mcp", async (c) => {
    logger.debug("mcp_request", { method: c.req.method })
    const mcpServer = createMcpServer(deviceService, actionLog)
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })
    await mcpServer.connect(transport)
    return transport.handleRequest(c.req.raw)
  })

  return app
}
