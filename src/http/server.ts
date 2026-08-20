import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { Hono } from "hono"
import type { Config } from "../config"
import type { ActionLogService } from "../services/action-log-service"
import type { DeviceService } from "../services/device-service"
import { createMcpServer } from "../mcp/tools"
import { bearerAuth } from "./auth"

export async function createHttpServer(config: Config, deviceService: DeviceService, actionLog: ActionLogService): Promise<Hono> {
  const app = new Hono()

  app.get("/health", (c) => c.json({ ok: true, service: "network-mcp" }))

  app.use("/mcp", bearerAuth(config.mcpAuthToken))
  app.all("/mcp", async (c) => {
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
