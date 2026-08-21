import { dirname } from "node:path"
import { mkdir } from "node:fs/promises"
import { JSONFilePreset } from "lowdb/node"
import { defaultDb, type DbSchema } from "./schema"

export async function openDb(path: string) {
  await mkdir(dirname(path), { recursive: true })
  return JSONFilePreset<DbSchema>(path, structuredClone(defaultDb))
}
