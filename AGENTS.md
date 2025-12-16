# Repository Guidelines

## Project Structure & Module Organization

- `addons/godot_mcp/`: Godot 4.x editor plugin written in GDScript. Core pieces include `mcp_server.gd` (WebSocket server), `command_handler.gd`, and `commands/` (per-command scripts). UI lives in `ui/`.
- `server/`: Node/TypeScript MCP server that talks to Godot over WebSockets. Source in `server/src/`, compiled output in `server/dist/`. Tools are organized under `server/src/tools/`; connection and types under `server/src/utils/`.
- `docs/`: User and architecture documentation.
- Root `project.godot`, `.tscn`, and assets (`icon.svg`) form the example Godot project.

## Build, Test, and Development Commands

Run from repo root unless noted:

- `cd server && npm install`: install server dependencies.
- `cd server && npm run build`: compile TypeScript to `server/dist/` via `tsc`.
- `cd server && npm run dev`: watch `server/src/`, rebuild, and restart (`nodemon`).
- `cd server && npm run start`: run the compiled MCP server (`node dist/index.js`).
- `./scripts/mcp ...`: local MCP client for listing/reading/calling against `server/dist/index.js` (see `./scripts/mcp --help`).
- Godot side: open `project.godot` in the Godot editor and ensure the “Godot MCP” plugin is enabled.

## Coding Style & Naming Conventions

- TypeScript (server):
  - 2‑space indentation, ESM imports with `.js` extensions in import paths.
  - `camelCase` for variables/functions; `PascalCase` for classes/types.
  - Keep `strict` typing; avoid `any`; prefer `async/await`.
- GDScript (addon):
  - Use tabs (Godot default).
  - `snake_case` for variables/functions; `PascalCase` for classes.
  - Add type hints where practical; prefer signals for cross‑node communication.

## Testing Guidelines

Server tests are set up with Vitest. Run from `server/`:

- `npm test`: run unit tests.
- `npm run test:integration`: runs MCP integration tests via stdio against a fake local Godot websocket.
- `GODOT_WS_URL=ws://127.0.0.1:9080 npm run test:integration`: also runs the optional “real Godot” integration test (requires Godot running with the plugin server started).
- `npm run test:watch`: watch mode.
- `npm run coverage`: generate coverage in `server/coverage/`.

Godot addon tests use the optional GUT plugin (see `addons/godot_mcp/tests/README.md`). Validate addon changes by:

- Running the server in dev mode and exercising tools from an MCP client.
- Verifying plugin behavior inside Godot (scene tree changes, script edits, etc.).

Add new server tests under `server/src/**/*.test.ts`. Prefer mocking the Godot boundary using the `create*Tools`/`create*Resource` factories.

## Commit & Pull Request Guidelines

- Commits in history are short, imperative, and pragmatic (e.g., “Fix …”, “Add …”, “Cleanup”). Follow that style; use “WIP” only for draft branches.
- PRs should include:
  - A clear description of behavior changes and motivation.
  - Any related issue links.
  - Screenshots or short clips for editor/UI changes.
  - Notes on manual validation steps taken in Godot and/or the MCP client.

## Security & Configuration Tips

- Server defaults to a local WebSocket connection (see `docs/mcp-server-readme.md`); avoid exposing it publicly without authentication.
- Keep paths in MCP client configs absolute and repo‑local (example in `README.md`).
