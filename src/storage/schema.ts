export type DeviceMeta = {
  mac: string
  displayName?: string
  tags: string[]
  notes?: string
}

export type ActionLog = {
  id: string
  time: string
  action: "block" | "unblock" | "tag" | "untag" | "rename"
  mac?: string
  tag?: string
  displayName?: string
  result: "success" | "error" | "noop"
  message?: string
}

export type DbSchema = {
  devices: Record<string, DeviceMeta>
  actions: ActionLog[]
}

export const defaultDb: DbSchema = {
  devices: {},
  actions: [],
}
