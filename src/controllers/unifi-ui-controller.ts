import type { Config } from "../config"
import type { AppLogger } from "../logger"
import type { MutationResult, NetworkClient, NetworkController } from "./network-controller"

type RawClient = Record<string, unknown>

type LoginSession = {
  cookie: string
  csrfToken: string
}

export class UnifiUiController implements NetworkController {
  private session?: LoginSession

  constructor(private readonly config: Config, private readonly logger: AppLogger) {}

  async listOnlineClients(): Promise<NetworkClient[]> {
    const response = await this.requestJson<{ data?: RawClient[] }>("GET", `/proxy/network/api/s/${this.config.udmSite}/stat/sta`)
    return (response.data ?? []).map((client) => this.normalizeClient(client, true, "stat/sta"))
  }

  async listKnownClients(): Promise<NetworkClient[]> {
    const response = await this.requestJson<{ data?: RawClient[] }>("GET", `/proxy/network/api/s/${this.config.udmSite}/rest/user`)
    return (response.data ?? []).map((client) => this.normalizeClient(client, false, "rest/user"))
  }

  async blockClient(mac: string): Promise<MutationResult> {
    return this.setBlocked(mac, true)
  }

  async unblockClient(mac: string): Promise<MutationResult> {
    return this.setBlocked(mac, false)
  }

  private async setBlocked(mac: string, blocked: boolean): Promise<MutationResult> {
    const normalizedMac = normalizeMac(mac)
    this.logger.info("unifi_client_block_state_requested", { mac: normalizedMac, blocked })
    await this.requestJson("POST", `/proxy/network/api/s/${this.config.udmSite}/cmd/stamgr`, {
      cmd: blocked ? "block-sta" : "unblock-sta",
      mac: normalizedMac,
    })

    const client = (await this.listKnownClients()).find((candidate) => candidate.mac === normalizedMac)
    const current = client?.blocked ?? blocked
    this.logger.info("unifi_client_block_state_observed", { mac: normalizedMac, requestedBlocked: blocked, currentBlocked: current })

    return {
      mac: normalizedMac,
      changed: current === blocked,
      blocked: current,
      message: current === blocked ? `Client is ${blocked ? "blocked" : "unblocked"}.` : "Command completed, but client state did not update yet.",
    }
  }

  private async requestJson<T>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
    const session = await this.ensureSession()
    const started = performance.now()
    const response = await fetch(`${this.config.udmBaseUrl}${path}`, {
      method,
      headers: {
        Cookie: session.cookie,
        "Content-Type": "application/json",
        "X-CSRF-Token": session.csrfToken,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      tls: { rejectUnauthorized: this.config.udmTlsRejectUnauthorized },
    } as RequestInit)

    this.logger.debug("unifi_request", {
      method,
      path,
      status: response.status,
      durationMs: Math.round(performance.now() - started),
      retry,
    })

    if ((response.status === 401 || response.status === 403) && retry) {
      this.logger.warn("unifi_session_refresh", { method, path, status: response.status })
      this.session = undefined
      return this.requestJson<T>(method, path, body, false)
    }

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`UDM request failed: ${method} ${path} -> ${response.status} ${text}`)
    }

    return (await response.json()) as T
  }

  private async ensureSession(): Promise<LoginSession> {
    if (this.session) return this.session

    const started = performance.now()
    const response = await fetch(`${this.config.udmBaseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: this.config.udmUsername,
        password: this.config.udmPassword,
        rememberMe: true,
      }),
      tls: { rejectUnauthorized: this.config.udmTlsRejectUnauthorized },
    } as RequestInit)

    this.logger.info("unifi_login", {
      status: response.status,
      durationMs: Math.round(performance.now() - started),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`UDM login failed: ${response.status} ${text}`)
    }

    const cookie = extractTokenCookie(response.headers)
    const csrfToken = response.headers.get("x-csrf-token") ?? response.headers.get("x-updated-csrf-token")
    if (!cookie || !csrfToken) throw new Error("UDM login did not return TOKEN cookie and CSRF token")

    this.session = { cookie, csrfToken }
    return this.session
  }

  private normalizeClient(client: RawClient, online: boolean, rawSource: NetworkClient["rawSource"]): NetworkClient {
    const mac = getString(client, "mac")
    if (!mac) throw new Error(`UniFi client missing mac: ${JSON.stringify(client)}`)

    return {
      mac: normalizeMac(mac),
      ip: getString(client, "ip"),
      hostname: getString(client, "hostname") ?? getString(client, "dns_name"),
      controllerName: getString(client, "name"),
      vendor: getString(client, "oui") ?? getString(client, "manufacturer"),
      type: getClientType(client),
      online,
      blocked: Boolean(client.blocked),
      rawSource,
    }
  }
}

export function normalizeMac(mac: string): string {
  return mac.trim().toLowerCase()
}

function getString(record: RawClient, key: string): string | undefined {
  const value = record[key]
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function getClientType(client: RawClient): NetworkClient["type"] {
  if (client.is_wired === true) return "wired"
  if (client.is_wired === false) return "wireless"
  return "unknown"
}

function extractTokenCookie(headers: Headers): string | undefined {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie
  const cookies = getSetCookie ? getSetCookie.call(headers) : [headers.get("set-cookie") ?? ""]
  const token = cookies.flatMap((header) => header.split(/,(?=\s*TOKEN=)/)).find((header) => header.trim().startsWith("TOKEN="))
  return token?.split(";")[0]
}
