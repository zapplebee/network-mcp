# network-mcp

Standalone HTTP MCP server for home network management through a UniFi Dream Machine.

The current controller implementation uses the local UniFi Network UI/controller API because it supports the direct client blocklist behavior needed for plain-text device management. The rest of the application depends on a small `NetworkController` interface so this can be replaced or supplemented by the official UniFi Network API later.

## Setup

```bash
bun install
cp .env.example .env
bun run start
```

The service listens on `127.0.0.1:4123` by default.

## Docker

For the hosted/home setup, run it with Docker Compose:

```bash
cp .env.example .env
docker compose up -d --build
```

The compose file binds the service to `0.0.0.0` inside the container, publishes it only on host loopback at `127.0.0.1:4123`, and persists LowDB data in `./data`.

Rebuild/restart after code changes:

```bash
docker compose up -d --build
```

View logs:

```bash
docker compose logs -f network-mcp
```

## Endpoints

- `GET /health`
- `POST /mcp`
- `GET /mcp`
- `DELETE /mcp`

If `MCP_AUTH_TOKEN` is set, `/mcp` requires:

```text
Authorization: Bearer <token>
```

## OpenCode Config

Add a remote MCP server to `/home/zac/.config/opencode/opencode.json`:

```json
{
  "mcp": {
    "home-network": {
      "type": "remote",
      "url": "http://127.0.0.1:4123/mcp",
      "enabled": true,
      "headers": {
        "Authorization": "Bearer {env:HOME_NETWORK_MCP_TOKEN}"
      }
    }
  }
}
```

Restart the hosted OpenCode service after changing MCP config.

## Tools

- `list_clients`
- `find_device`
- `add_tag`
- `remove_tag`
- `list_tags`
- `add_displayname`
- `block_device`
- `unblock_device`
- `block_by_tag`
- `unblock_by_tag`
- `show_blocked`
- `unblock_all`
- `recent_actions`

MAC addresses are the canonical device key. Tags and display names are stored locally in LowDB under `DB_PATH`.
