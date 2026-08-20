import type { Low } from "lowdb"
import type { NetworkClient, NetworkController } from "../controllers/network-controller"
import { normalizeMac } from "../controllers/unifi-ui-controller"
import type { DbSchema, DeviceMeta } from "../storage/schema"
import { ActionLogService } from "./action-log-service"

export type ManagedDevice = NetworkClient & {
  displayName?: string
  tags: string[]
  notes?: string
}

export type Selector = {
  mac?: string
  ip?: string
  hostname?: string
  displayName?: string
  query?: string
}

export class DeviceService {
  constructor(
    private readonly controller: NetworkController,
    private readonly db: Low<DbSchema>,
    private readonly actions: ActionLogService,
  ) {}

  async listClients(): Promise<ManagedDevice[]> {
    const [knownClients, onlineClients] = await Promise.all([
      this.controller.listKnownClients(),
      this.controller.listOnlineClients(),
    ])

    const byMac = new Map<string, NetworkClient>()
    for (const client of knownClients) byMac.set(client.mac, client)
    for (const client of onlineClients) byMac.set(client.mac, { ...byMac.get(client.mac), ...client, online: true })

    return [...byMac.values()]
      .map((client) => this.withMeta(client))
      .sort((a, b) => this.deviceLabel(a).localeCompare(this.deviceLabel(b)))
  }

  async findDevices(selector: Selector): Promise<ManagedDevice[]> {
    const clients = await this.listClients()
    return clients.filter((client) => matchesSelector(client, selector))
  }

  async addTag(selector: Selector, tag: string): Promise<ManagedDevice> {
    const device = await this.resolveOne(selector)
    const meta = this.ensureMeta(device.mac)
    if (!meta.tags.includes(tag)) meta.tags.push(tag)
    meta.tags.sort()
    await this.db.write()
    await this.actions.record({ action: "tag", mac: device.mac, tag, result: "success", message: `Added tag ${tag}` })
    return this.withMeta(device)
  }

  async removeTag(selector: Selector, tag: string): Promise<ManagedDevice> {
    const device = await this.resolveOne(selector)
    const meta = this.ensureMeta(device.mac)
    meta.tags = meta.tags.filter((value) => value !== tag)
    await this.db.write()
    await this.actions.record({ action: "untag", mac: device.mac, tag, result: "success", message: `Removed tag ${tag}` })
    return this.withMeta(device)
  }

  async addDisplayName(selector: Selector, displayName: string): Promise<ManagedDevice> {
    const device = await this.resolveOne(selector)
    const meta = this.ensureMeta(device.mac)
    meta.displayName = displayName
    await this.db.write()
    await this.actions.record({ action: "rename", mac: device.mac, displayName, result: "success", message: `Set display name to ${displayName}` })
    return this.withMeta(device)
  }

  async listTags() {
    const counts = new Map<string, number>()
    for (const device of Object.values(this.db.data.devices)) {
      for (const tag of device.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
    return [...counts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => a.tag.localeCompare(b.tag))
  }

  async blockDevice(selector: Selector) {
    const device = await this.resolveOne(selector)
    if (device.blocked) {
      await this.actions.record({ action: "block", mac: device.mac, result: "noop", message: "Already blocked" })
      return { affected: [{ ...device, blocked: true }], dryRun: false }
    }

    const result = await this.controller.blockClient(device.mac)
    await this.actions.record({ action: "block", mac: device.mac, result: result.blocked ? "success" : "error", message: result.message })
    return { affected: [await this.refreshDevice(device.mac)], dryRun: false }
  }

  async unblockDevice(selector: Selector) {
    const device = await this.resolveOne(selector)
    if (!device.blocked) {
      await this.actions.record({ action: "unblock", mac: device.mac, result: "noop", message: "Already unblocked" })
      return { affected: [{ ...device, blocked: false }], dryRun: false }
    }

    const result = await this.controller.unblockClient(device.mac)
    await this.actions.record({ action: "unblock", mac: device.mac, result: !result.blocked ? "success" : "error", message: result.message })
    return { affected: [await this.refreshDevice(device.mac)], dryRun: false }
  }

  async blockByTag(tag: string, options: { dryRun?: boolean; confirm?: boolean } = {}) {
    const devices = (await this.listClients()).filter((device) => device.tags.includes(tag))
    if (options.dryRun || (devices.length > 1 && !options.confirm)) return { affected: devices, dryRun: true }

    const affected: ManagedDevice[] = []
    for (const device of devices) {
      if (!device.blocked) {
        const result = await this.controller.blockClient(device.mac)
        await this.actions.record({ action: "block", mac: device.mac, tag, result: result.blocked ? "success" : "error", message: `block_by_tag:${tag}` })
      }
      affected.push(await this.refreshDevice(device.mac))
    }
    return { affected, dryRun: false }
  }

  async unblockByTag(tag: string, options: { dryRun?: boolean; confirm?: boolean } = {}) {
    const devices = (await this.listClients()).filter((device) => device.tags.includes(tag))
    if (options.dryRun || (devices.length > 1 && !options.confirm)) return { affected: devices, dryRun: true }

    const affected: ManagedDevice[] = []
    for (const device of devices) {
      if (device.blocked) {
        const result = await this.controller.unblockClient(device.mac)
        await this.actions.record({ action: "unblock", mac: device.mac, tag, result: !result.blocked ? "success" : "error", message: `unblock_by_tag:${tag}` })
      }
      affected.push(await this.refreshDevice(device.mac))
    }
    return { affected, dryRun: false }
  }

  async showBlocked(): Promise<ManagedDevice[]> {
    return (await this.listClients()).filter((device) => device.blocked)
  }

  async unblockAll(options: { managedOnly?: boolean; dryRun?: boolean; confirm?: boolean } = {}) {
    const managedOnly = options.managedOnly ?? true
    const managedBlockedMacs = new Set(
      this.db.data.actions
        .filter((action) => action.action === "block" && action.result === "success" && action.mac)
        .map((action) => action.mac!),
    )
    const devices = (await this.showBlocked()).filter((device) => !managedOnly || managedBlockedMacs.has(device.mac))
    if (options.dryRun || (devices.length > 1 && !options.confirm)) return { affected: devices, dryRun: true, managedOnly }

    const affected: ManagedDevice[] = []
    for (const device of devices) {
      const result = await this.controller.unblockClient(device.mac)
      await this.actions.record({ action: "unblock", mac: device.mac, result: !result.blocked ? "success" : "error", message: "unblock_all" })
      affected.push(await this.refreshDevice(device.mac))
    }
    return { affected, dryRun: false, managedOnly }
  }

  private async resolveOne(selector: Selector): Promise<ManagedDevice> {
    const matches = await this.findDevices(selector)
    if (matches.length === 0) throw new Error("No matching device found")
    if (matches.length > 1) throw new Error(`Ambiguous selector matched ${matches.length} devices: ${matches.map((device) => this.deviceLabel(device)).join(", ")}`)
    return matches[0]
  }

  private async refreshDevice(mac: string): Promise<ManagedDevice> {
    const matches = await this.findDevices({ mac })
    return matches[0] ?? this.withMeta({ mac, type: "unknown", online: false, blocked: false, rawSource: "rest/user" })
  }

  private withMeta(client: NetworkClient): ManagedDevice {
    const meta = this.db.data.devices[client.mac]
    return { ...client, displayName: meta?.displayName, tags: meta?.tags ?? [], notes: meta?.notes }
  }

  private ensureMeta(mac: string): DeviceMeta {
    const normalizedMac = normalizeMac(mac)
    this.db.data.devices[normalizedMac] ??= { mac: normalizedMac, tags: [] }
    return this.db.data.devices[normalizedMac]
  }

  private deviceLabel(device: ManagedDevice): string {
    return device.displayName ?? device.controllerName ?? device.hostname ?? device.ip ?? device.mac
  }
}

function matchesSelector(device: ManagedDevice, selector: Selector): boolean {
  if (selector.mac && device.mac !== normalizeMac(selector.mac)) return false
  if (selector.ip && device.ip !== selector.ip) return false
  if (selector.hostname && !sameText(device.hostname, selector.hostname)) return false
  if (selector.displayName && !sameText(device.displayName, selector.displayName)) return false
  if (selector.query) {
    const haystack = [device.mac, device.ip, device.hostname, device.controllerName, device.displayName, device.vendor].filter(Boolean).join(" ").toLowerCase()
    if (!haystack.includes(selector.query.toLowerCase())) return false
  }
  return true
}

function sameText(a: string | undefined, b: string): boolean {
  return a?.toLowerCase() === b.toLowerCase()
}
