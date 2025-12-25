# Godot MCP Command Reference

This document provides a reference for the commands available through the Godot MCP integration.

## Resources

Resources are read-only endpoints. Some are fixed, others are parameterized templates.

### Static resources

- `godot/scene/current` - Current scene structure.
- `godot/scenes` - List of all scene files.
- `godot/scripts` - List of all scripts.
- `godot/project/structure` - Directory and file counts.
- `godot/project/settings` - Key project settings.
- `godot/project/resources` - Categorized resources.
- `godot/editor/state` - Editor state snapshot.
- `godot/editor/selected_node` - Selected node info.
- `godot/editor/current_script` - Current script content (if any).

### Dynamic resource templates

- `godot/script/{path}` - Script content by path.  
  Example: `@mcp godot-mcp read godot/script/res://scripts/player.gd`
- `godot/script/metadata/{path}` - Script metadata by path.
- `godot/scene/{path}` - Raw scene text by path.  
  Example: `@mcp godot-mcp read godot/scene/res://scenes/main.tscn`
- `godot/scene/{path}/structure` - Scene structure by path.
- `godot/scene/edited/{properties_csv}` - Edited scene snapshot including selected properties (comma-separated).
- `godot/resource/{path}` - Text-based resource content by path (e.g., `.tres`).

## Node Tools

### create_node
Create a new node in the Godot scene tree.

**Parameters:**
- `parent_path` - Path to the parent node (e.g., "/root", "/root/MainScene")
- `node_type` - Type of node to create (e.g., "Node2D", "Sprite2D", "Label")
- `node_name` - Name for the new node

**Example:**
```
Create a Button node named "StartButton" under the CanvasLayer.
```

### delete_node
Delete a node from the scene tree.

**Parameters:**
- `node_path` - Path to the node to delete

**Example:**
```
Delete the node at "/root/MainScene/UI/OldButton".
```

### update_node_property
Update a property of a node.

**Parameters:**
- `node_path` - Path to the node to update
- `property` - Name of the property to update
- `value` - New value for the property

**Example:**
```
Update the "text" property of the node at "/root/MainScene/UI/Label" to "Game Over".
```

### get_node_properties
Get all properties of a node.

**Parameters:**
- `node_path` - Path to the node to inspect

**Example:**
```
Show me all the properties of the node at "/root/MainScene/Player".
```

### list_nodes
List all child nodes under a parent node.

**Parameters:**
- `parent_path` - Path to the parent node

**Example:**
```
List all nodes under "/root/MainScene/UI".
```

## Script Tools

### create_script
Create a new GDScript file.

**Parameters:**
- `script_path` - Path where the script will be saved
- `content` - Content of the script
- `node_path` (optional) - Path to a node to attach the script to

**Example:**
```
Create a script at "res://scripts/player_controller.gd" with a basic movement system.
```

### edit_script
Edit an existing GDScript file.

**Parameters:**
- `script_path` - Path to the script file to edit
- `content` - New content of the script

**Example:**
```
Update the script at "res://scripts/player_controller.gd" to add a jump function.
```

### get_script
Get the content of a GDScript file.

**Parameters:**
- `script_path` (optional) - Path to the script file
- `node_path` (optional) - Path to a node with a script attached

**Example:**
```
Show me the script attached to the node at "/root/MainScene/Player".
```

### create_script_template
Generate a GDScript template with common boilerplate.

**Parameters:**
- `class_name` (optional) - Optional class name for the script
- `extends_type` - Base class that this script extends (default: "Node")
- `include_ready` - Whether to include the _ready() function (default: true)
- `include_process` - Whether to include the _process() function (default: false)
- `include_input` - Whether to include the _input() function (default: false)
- `include_physics` - Whether to include the _physics_process() function (default: false)

**Example:**
```
Create a script template for a KinematicBody2D with process and input functions.
```

## Scene Tools

### create_scene
Creates a new empty scene with an optional root node type.

**Parameters:**
- `path` (string): Path where the new scene will be saved (e.g. "res://scenes/new_scene.tscn")
- `root_node_type` (string, optional): Type of root node to create (e.g. "Node2D", "Node3D", "Control"). Defaults to "Node" if not specified

**Returns:**
- `scene_path` (string): Path where the scene was saved
- `root_node_type` (string): The type of the root node that was created

**Example:**
```typescript
// Create a new scene with a Node2D as root
const result = await mcp.execute('create_scene', {
  path: 'res://scenes/game_level.tscn',
  root_node_type: 'Node2D'
});
console.log(`Created scene at ${result.scene_path}`);
```

### save_scene
Save the current scene to disk.

**Parameters:**
- `path` (optional) - Path where the scene will be saved (uses current path if not provided)

**Example:**
```
Save the current scene to "res://scenes/level_1.tscn".
```

### open_scene
Open a scene in the editor.

**Parameters:**
- `path` - Path to the scene file to open

**Example:**
```
Open the scene at "res://scenes/main_menu.tscn".
```

### get_current_scene
Get information about the currently open scene.

**Parameters:** None

**Example:**
```
What scene am I currently editing?
```

### get_project_info
Get information about the current Godot project.

**Parameters:** None

**Example:**
```
Tell me about the current project.
```

### create_resource
Create a new resource in the project.

**Parameters:**
- `resource_type` - Type of resource to create
- `resource_path` - Path where the resource will be saved
- `properties` (optional) - Dictionary of property values to set on the resource

**Example:**
```
Create a StyleBoxFlat resource at "res://resources/button_style.tres" with a blue background color.
```

### apply_scene_patch
Apply a sequence of node operations to the currently edited scene (intended as a safer alternative to rewriting `.tscn` text).

**Parameters:**
- `operations` - Array of patch operations (see below)
- `strict` (optional) - Stop on first error (default: true)

**Supported operations:**
- `create_node` (`parent_path?`, `parent_id?`, `node_type`, `node_name`, `properties?`)
- `delete_node` (`node_path?`, `node_id?`)
- `set_property` (`node_path?`, `node_id?`, `property`, `value`)
- `rename_node` (`node_path?`, `node_id?`, `new_name`)
- `reparent_node` (`node_path?`, `node_id?`, `new_parent_path?`, `new_parent_id?`, `keep_global_transform?`, `index?`)

If you provide both an `*_id` and a path, the server will validate they resolve to the same node.

### generate_scene_patch
Generate an `apply_scene_patch` operation list by diffing the currently edited scene against a desired tree.

**Parameters:**
- `desired.children` - Desired node tree (by `name`, optional `id`, optional `type`, optional `properties`)
- `allow_delete` (optional) - Delete nodes not present in desired (default: false)
- `strict_types` (optional) - Error on node type mismatches (default: true)
- `detect_renames` (optional) - Attempt to detect simple renames within a parent (default: false)
- `reorder_children` (optional) - Attempt to reorder children to match `desired.children` order (default: false)
- `diff_properties` (optional) - Only emit `set_property` ops when a value differs (default: true)
- `apply` (optional) - Also apply the generated patch (default: false)

When `diff_properties` is enabled, the server requests a lightweight property snapshot from Godot for only the properties present in `desired` (to avoid fetching full property dumps for every node).

For reliable moves/renames across parents, include stable `id` values from `get_edited_scene_structure` in your desired tree. The server requests Godot to ensure IDs are present (`ensure_ids: true`).

IDs are persisted by adding the node to a persistent group named `godot_mcp_id:<id>` (stored in the `.tscn`), so they remain stable across editor restarts and scene reloads.

### ID workflow example

Use this flow when you want changes to survive renames/reparents without relying on brittle paths.

1. Read the edited scene snapshot (includes IDs):
   ```
   @mcp godot-mcp read godot/scene/edited
   ```
2. Build your desired tree using the returned `structure.id` and `children[].id` values:
   ```json
   {
     "desired": {
       "children": [
         {
           "id": "25827803-3664402523-2537788876286",
           "name": "Gameplay",
           "type": "Node3D",
           "children": [
             {
               "id": "25827846-4186853086-2537839221429",
               "name": "Player",
               "type": "CSGBox3D",
               "properties": {
                 "position": "Vector3(1, 0, 0)"
               }
             }
           ]
         }
       ]
     }
   }
   ```
3. Generate and apply a patch:
   ```
   @mcp godot-mcp call generate_scene_patch {"desired":{"children":[{"id":"25827803-3664402523-2537788876286","name":"Gameplay","type":"Node3D","children":[{"id":"25827846-4186853086-2537839221429","name":"Player","type":"CSGBox3D","properties":{"position":"Vector3(1, 0, 0)"}}]}]},"apply":true}
   ```

If you need properties for diffing, request them up front:
```
@mcp godot-mcp read godot/scene/edited/position,rotation,scale
```

### Patch by ID walkthrough

**Before** (edited snapshot, abbreviated):
```json
{
  "structure": {
    "id": "root-1",
    "path": "/root",
    "children": [
      { "id": "node-1", "name": "Player", "path": "/root/Player" },
      { "id": "node-2", "name": "UI", "path": "/root/UI" }
    ]
  }
}
```

**Goal**: Rename `Player` to `Hero` and move it under `UI` without depending on paths.

**Patch** (ID-addressed):
```json
[
  { "op": "rename_node", "node_id": "node-1", "new_name": "Hero" },
  { "op": "reparent_node", "node_id": "node-1", "new_parent_id": "node-2" }
]
```

**Call**:
```
@mcp godot-mcp call apply_scene_patch {"operations":[{"op":"rename_node","node_id":"node-1","new_name":"Hero"},{"op":"reparent_node","node_id":"node-1","new_parent_id":"node-2"}]}
```

## Editor Tools

### execute_editor_script
Execute arbitrary GDScript code in the editor context.

**Parameters:**
- `code` - GDScript code string.

**Example:**
```
Run an editor script that prints the current scene root name.
```

## Using Commands with Claude

When working with Claude, you don't need to specify the exact command name or format. Instead, describe what you want to do in natural language, and Claude will use the appropriate command. For example:

```
Claude, can you create a new Label node under the UI node with the text "Score: 0"?
```

Claude will understand this request and use the `create_node` command with the appropriate parameters.
