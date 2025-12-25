# This Session

## Session 2025-12-24

### Summary
- Implemented **Per-Agent API Key Authentication** - Unique authentication for each agent using configurable API keys
- Implemented **Git LFS Asset Pipeline** - Complete asset management with Git LFS integration for binary assets

### Key Changes - Authentication System

**New Files:**
- `mcp_agents.json` - Configuration file with `auth_required` flag and agent definitions

**Modified Files:**
- `addons/godot_mcp/mcp_server.gd` - Added `agent_id`, `api_key` to `WebSocketClient` class, API key validation functions
- `server/src/utils/godot_connection.ts` - Added API key parameter and `X-API-Key` header transmission
- `addons/godot_mcp/command_handler.gd` - Updated to propagate `agent_id` through command pipeline
- All command processors (`*_commands.gd`) - Updated signature: `process_command(client_id, agent_id, command_type, params, command_id)`

**How to Use:**
1. Set `auth_required: true` in `mcp_agents.json` to enable authentication
2. Each agent gets a unique API key (configurable in `mcp_agents.json`)
3. Set environment variable: `export GODOT_MCP_API_KEY=sk_agent_xxx`

### Key Changes - Git LFS Asset Pipeline

**New Files:**
- `addons/godot_mcp/utils/lfs_pointer.gd` - LFS pointer parsing/generation utilities (GDScript)
- `server/src/utils/lfs_pointer.ts` - LFS pointer utilities (TypeScript)
- `addons/godot_mcp/utils/asset_metadata.gd` - Asset metadata tracking
- `addons/godot_mcp/commands/asset_commands.gd` - Asset command processor
- `server/src/tools/asset_tools.ts` - MCP asset tools

**Modified Files:**
- `.gitattributes` - Added LFS patterns for all Godot asset types (textures, audio, models, fonts, video)

**New MCP Tools:**
- `get_asset_info` - Get detailed asset info including LFS status
- `import_asset` - Import assets with Git LFS support
- `export_asset` - Export assets from project
- `get_lfs_status` - Check LFS tracking status
- `list_assets` - List assets by category
- `batch_import_assets` - Bulk import multiple assets

### Tests Run
- All 33 tests passed: `npm run test`

### Feature Backlog (New)

#### 1. Game Screenshot System (LLM Instrumentation)
**Goal:** Capture game screenshots while the game is running, with instrumentation for AI analysis.

**Implementation Plan:**
- Create `take_game_screenshot` command that captures the active game viewport
- Add instrumentation data: timestamp, scene path, player state, camera position
- Support optional metadata annotation for LLM context
- Output to file or return base64-encoded data for direct analysis
- Add MCP tool: `capture_game_frame` with options for resolution and region of interest

**Use Cases:**
- Visual debugging during AI-assisted development
- Capture test states for regression testing
- Generate documentation screenshots
- AI vision analysis of game states

#### 2. Runtime Value Update System (No GUI)
**Goal:** Update game values while running without touching the GUI system.

**Implementation Plan:**
- Create `MCPGameBridge` autoload singleton that receives WebSocket messages during gameplay
- Messages bypass editor interface and directly update game state
- Support different update types:
  - Node property updates (position, health, score, etc.)
  - Variable changes in autoloads/singletons
  - Signal emissions with parameters
  - Method calls with arguments
- Add safety checks: validation, undo/redo queue, debug logging
- Add MCP tools:
  - `set_runtime_value` - Update a property/variable while game runs
  - `call_runtime_method` - Call a method with parameters
  - `emit_runtime_signal` - Emit a signal with data
  - `get_runtime_state` - Query current game state

**Use Cases:**
- AI-assisted playtesting (modify health, position, inventory)
- Automated testing scenarios
- Dynamic game balancing
- Debug state injection

#### 3. Editor Screenshot System (Backlog)
**Goal:** Capture editor viewport for documentation and AI analysis.

**Planned Features:**
- `take_editor_screenshot` - Capture current editor viewport
- Support for different editor panels (3D viewport, 2D editor, inspector)
- Annotation support for AI context

---

# Previous Sessions

## Summary
- Added ID-addressable support to `apply_scene_patch`, resolving node/parent IDs against the current edited scene before sending ops to Godot.
- Expanded docs with an ID workflow example, an ID-addressable patch walkthrough, and a ready-to-use checklist + tips to prefer IDs.
- Added/updated tests for ID resolution and validated unit + integration suites.

## Key Changes
- `server/src/tools/scene_tools.ts`: apply_scene_patch now accepts `node_id`, `parent_id`, `new_parent_id`; resolves IDs to paths with consistency checks and handles rename/reparent order updates.
- `server/src/tools/scene_tools.test.ts`: new test covering ID-based resolution + path updates.
- `docs/command-reference.md`: ID workflow example, ID-addressable patch walkthrough, updated op parameter list.
- `docs/getting-started.md`: ready-to-use checklist and note to prefer IDs for renames/reparents.

## Commit
- `2f4c5a3` Add id-based scene patching

## Tests Run
- `npm -C server test`
- `npm -C server run test:integration`

## Notes
- One integration test remains skipped (expected).
- Uncommitted/unrelated changes still in working tree: `TestScene.tscn`, `icon.svg.import`, `project.godot`, `addons/godot_mcp/tests/test_command_handler.gd.uid`.

## Next Steps
- Decide whether to include the unrelated working-tree changes in a future commit.
- Optional: add a brief "prefer ID-based patching" callout in other docs (e.g., `docs/installation-guide.md`), if desired.
