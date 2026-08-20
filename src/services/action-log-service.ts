import type { Low } from "lowdb"
import type { ActionLog, DbSchema } from "../storage/schema"

export class ActionLogService {
  constructor(private readonly db: Low<DbSchema>) {}

  async record(action: Omit<ActionLog, "id" | "time">): Promise<ActionLog> {
    const entry: ActionLog = {
      id: crypto.randomUUID(),
      time: new Date().toISOString(),
      ...action,
    }

    this.db.data.actions.unshift(entry)
    this.db.data.actions = this.db.data.actions.slice(0, 500)
    await this.db.write()
    return entry
  }

  recent(limit = 25): ActionLog[] {
    return this.db.data.actions.slice(0, limit)
  }
}
