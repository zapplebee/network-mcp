export type NetworkClient = {
  mac: string
  ip?: string
  hostname?: string
  controllerName?: string
  vendor?: string
  type: "wired" | "wireless" | "vpn" | "unknown"
  online: boolean
  blocked: boolean
  rawSource: "stat/sta" | "rest/user"
}

export type MutationResult = {
  mac: string
  changed: boolean
  blocked: boolean
  message: string
}

export interface NetworkController {
  listOnlineClients(): Promise<NetworkClient[]>
  listKnownClients(): Promise<NetworkClient[]>
  blockClient(mac: string): Promise<MutationResult>
  unblockClient(mac: string): Promise<MutationResult>
}
