# Next Session

## What We Built

- **Godot editor plugin UI**: A `Godot MCP` bottom panel is now wired up (start/stop + port), and common startup/“already running” behavior is handled.
- **Stable node IDs**: Edited scene snapshots include stable IDs persisted via node groups `godot_mcp_id:<id>`; IDs are meant to survive save/reload and support rename/reparent diffing.
- **Local scripts**:
  - `./scripts/build-server`, `./scripts/start-server`, `./scripts/stop-server`
  - `./scripts/mcp` (local MCP client to list/read/call tools/resources via stdio)
- **Testing**:
  - Unit tests (Vitest): `npm -C server test`
  - Integration tests (Vitest + MCP stdio): `npm -C server run test:integration`
    - Defaults to `GODOT_WS_URL=mock://...` so it runs without Godot or network sockets.
    - Optional real Godot test runs when `GODOT_WS_URL` is set.

## How To Run With Real Godot

1. Open the repo’s `project.godot` in Godot.
2. Enable the plugin: `Project Settings -> Plugins -> Godot MCP`.
3. Open the `Godot MCP` panel and start the server (default port `9080`).
4. Run the integration suite against the live editor:
   - `GODOT_WS_URL=ws://127.0.0.1:9080 npm -C server run test:integration`

## Stable ID Validation Checklist

- Read `godot/scene/edited` once (assigns IDs).
- Save the scene; confirm `.tscn` contains `godot_mcp_id:` in `groups=[...]`.
- Reload the scene and confirm the same nodes still report the same `id`.
- Rename/reparent nodes and confirm IDs remain stable after save/reload.

## Key Recent Commits

- `ffd1db8` Add MCP panel and server scripts
- `7428aad` Add local MCP test client
- `3326a57` Add MCP integration tests and GODOT_WS_URL
- `4ad5192` Fix integration tests to run without sockets
- `c8af109` Expand coverage for MCP integration and connection

## Suggested Next Steps

- Run the real-Godot integration test locally (non-sandboxed environment) and confirm it passes end-to-end.
- Add a small “ID workflow” example to docs (read edited snapshot → include IDs in desired tree → generate/apply patch).
- Consider making patch ops optionally **ID-addressable** (node_id/parent_id) to reduce path brittleness during apply.

