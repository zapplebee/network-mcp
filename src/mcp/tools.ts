import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { ActionLogService } from "../services/action-log-service"
import { DeviceService } from "../services/device-service"

const selectorSchema = {
  mac: z.string().optional(),
  ip: z.string().optional(),
  hostname: z.string().optional(),
  displayName: z.string().optional(),
  query: z.string().optional(),
}

export function createMcpServer(deviceService: DeviceService, actionLog: ActionLogService): McpServer {
  const server = new McpServer({ name: "network-mcp", version: "0.1.0" })

  registerJsonTool(server, "list_clients", "List UniFi clients merged with local display names and tags.", {}, async () => deviceService.listClients())
  registerJsonTool(server, "find_device", "Find devices by MAC, IP, hostname, display name, vendor, or fuzzy query.", selectorSchema, async (args) => deviceService.findDevices(args))
  registerJsonTool(server, "list_tags", "List locally defined tags and device counts.", {}, async () => deviceService.listTags())
  registerJsonTool(server, "show_blocked", "List currently blocked clients.", {}, async () => deviceService.showBlocked())
  registerJsonTool(server, "recent_actions", "Show recent network-mcp mutation history.", { limit: z.number().int().min(1).max(100).default(25) }, async ({ limit }) => actionLog.recent(limit))

  registerJsonTool(server, "add_tag", "Add a local tag to exactly one matching device.", { ...selectorSchema, tag: z.string().min(1) }, async ({ tag, ...selector }) => deviceService.addTag(selector, tag))
  registerJsonTool(server, "remove_tag", "Remove a local tag from exactly one matching device.", { ...selectorSchema, tag: z.string().min(1) }, async ({ tag, ...selector }) => deviceService.removeTag(selector, tag))
  registerJsonTool(server, "add_displayname", "Set a local display name for exactly one matching device.", { ...selectorSchema, displayName: z.string().min(1) }, async ({ displayName, ...selector }) => deviceService.addDisplayName(selector, displayName))
  registerJsonTool(server, "block_device", "Block exactly one matching device.", selectorSchema, async (selector) => deviceService.blockDevice(selector))
  registerJsonTool(server, "unblock_device", "Unblock exactly one matching device.", selectorSchema, async (selector) => deviceService.unblockDevice(selector))
  registerJsonTool(server, "block_by_tag", "Block devices with a tag. Multiple matches require confirm=true unless dryRun=true.", { tag: z.string().min(1), dryRun: z.boolean().default(false), confirm: z.boolean().default(false) }, async ({ tag, dryRun, confirm }) => deviceService.blockByTag(tag, { dryRun, confirm }))
  registerJsonTool(server, "unblock_by_tag", "Unblock devices with a tag. Multiple matches require confirm=true unless dryRun=true.", { tag: z.string().min(1), dryRun: z.boolean().default(false), confirm: z.boolean().default(false) }, async ({ tag, dryRun, confirm }) => deviceService.unblockByTag(tag, { dryRun, confirm }))
  registerJsonTool(server, "unblock_all", "Unblock blocked devices. Defaults to devices previously blocked by this MCP only.", { managedOnly: z.boolean().default(true), dryRun: z.boolean().default(false), confirm: z.boolean().default(false) }, async (args) => deviceService.unblockAll(args))

  return server
}

function registerJsonTool<T extends z.ZodRawShape>(
  server: McpServer,
  name: string,
  description: string,
  inputSchema: T,
  handler: (args: z.infer<z.ZodObject<T>>) => Promise<unknown> | unknown,
) {
  const callback = async (args: z.infer<z.ZodObject<T>>) => {
    try {
      const result = await handler(args as z.infer<z.ZodObject<T>>)
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] }
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: error instanceof Error ? error.message : String(error) }],
      }
    }
  }

  server.registerTool(name, { description, inputSchema }, callback as never)
}
