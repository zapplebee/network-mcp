import type { MiddlewareHandler } from "hono"

export function bearerAuth(expectedToken?: string): MiddlewareHandler {
  return async (c, next) => {
    if (!expectedToken) return next()

    const header = c.req.header("authorization")
    if (header !== `Bearer ${expectedToken}`) return c.json({ error: "unauthorized" }, 401)

    return next()
  }
}
