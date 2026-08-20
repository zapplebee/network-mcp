import { loadConfig } from "./config"
import { UnifiUiController } from "./controllers/unifi-ui-controller"
import { createHttpServer } from "./http/server"
import { ActionLogService } from "./services/action-log-service"
import { DeviceService } from "./services/device-service"
import { openDb } from "./storage/db"

const config = loadConfig()
const db = await openDb(config.dbPath)
const actionLog = new ActionLogService(db)
const controller = new UnifiUiController(config)
const deviceService = new DeviceService(controller, db, actionLog)
const app = await createHttpServer(config, deviceService, actionLog)

Bun.serve({
  hostname: config.host,
  port: config.port,
  fetch: app.fetch,
})

console.log(`network-mcp listening on http://${config.host}:${config.port}`)
