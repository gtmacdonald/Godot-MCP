@tool
class_name MCPSceneCommands
extends MCPBaseCommandProcessor

const MCP_ID_GROUP_PREFIX := "godot_mcp_id:"

func process_command(client_id: int, agent_id: String, command_type: String, params: Dictionary, command_id: String) -> bool:
	match command_type:
		"get_edited_scene_structure":
			_get_edited_scene_structure(client_id, params, command_id)
			return true
		"get_scene_text":
			_get_scene_text(client_id, params, command_id)
			return true
		"apply_scene_patch":
			_apply_scene_patch(client_id, params, command_id)
			return true
		"save_scene":
			_save_scene(client_id, params, command_id)
			return true
		"open_scene":
			_open_scene(client_id, params, command_id)
			return true
		"get_current_scene":
			_get_current_scene(client_id, params, command_id)
			return true
		"get_scene_structure":
			_get_scene_structure(client_id, params, command_id)
			return true
		"create_scene":
			_create_scene(client_id, params, command_id)
			return true
	return false  # Command not handled

func _get_scene_text(client_id: int, params: Dictionary, command_id: String) -> void:
	var path = params.get("path", "")
	
	if path.is_empty():
		return _send_error(client_id, "Scene path cannot be empty", command_id)
	
	if not path.begins_with("res://"):
		path = "res://" + path
	
	if not FileAccess.file_exists(path):
		return _send_error(client_id, "Scene file not found: " + path, command_id)
	
	if not (path.ends_with(".tscn") or path.ends_with(".scn")):
		return _send_error(client_id, "Only .tscn/.scn scenes are supported", command_id)
	
	var file = FileAccess.open(path, FileAccess.READ)
	if file == null:
		return _send_error(client_id, "Failed to open scene file: " + path, command_id)
	
	var content = file.get_as_text()
	file = null
	
	_send_success(client_id, {
		"path": path,
		"content": content
	}, command_id)

func _get_edited_scene_structure(client_id: int, _params: Dictionary, command_id: String) -> void:
	var plugin = Engine.get_meta("GodotMCPPlugin")
	if not plugin:
		return _send_error(client_id, "GodotMCPPlugin not found in Engine metadata", command_id)
	
	var editor_interface = plugin.get_editor_interface()
	var edited_scene_root = editor_interface.get_edited_scene_root()
	if not edited_scene_root:
		return _send_error(client_id, "No scene is currently being edited", command_id)
	
	var scene_path = edited_scene_root.scene_file_path
	if scene_path.is_empty():
		scene_path = "Untitled"
	
	var include_properties: bool = _params.get("include_properties", false)
	var properties: Array = _params.get("properties", [])
	var ensure_ids: bool = _params.get("ensure_ids", true)
	var structure = _get_node_structure_for_patch(edited_scene_root, "/root", include_properties, properties, ensure_ids)
	
	_send_success(client_id, {
		"scene_path": scene_path,
		"structure": structure
	}, command_id)

func _get_node_structure_for_patch(node: Node, rel_path: String, include_properties: bool, properties: Array, ensure_ids: bool) -> Dictionary:
	var structure = {
		"name": node.name,
		"type": node.get_class(),
		"path": rel_path
	}
	
	if ensure_ids:
		structure["id"] = _get_or_create_mcp_id(node)
	else:
		var existing_id := _get_mcp_id(node)
		if not existing_id.is_empty():
			structure["id"] = existing_id
	
	if include_properties and properties.size() > 0:
		var out_props := {}
		for prop in properties:
			var prop_name := str(prop)
			if prop_name in node:
				out_props[prop_name] = node.get(prop_name)
		structure["properties"] = out_props
	
	var children: Array = []
	for child in node.get_children():
		if child is Node:
			children.append(_get_node_structure_for_patch(child, rel_path + "/" + str(child.name), include_properties, properties, ensure_ids))
	
	structure["children"] = children
	return structure

func _get_or_create_mcp_id(node: Node) -> String:
	var existing_id := _get_mcp_id(node)
	if not existing_id.is_empty():
		return existing_id
	
	var rng := RandomNumberGenerator.new()
	rng.randomize()
	var id := "%d-%d-%d" % [Time.get_ticks_usec(), rng.randi(), node.get_instance_id()]
	_set_mcp_id(node, id)
	return id

func _get_mcp_id(node: Node) -> String:
	for group_name in node.get_groups():
		var g := str(group_name)
		if g.begins_with(MCP_ID_GROUP_PREFIX):
			return g.trim_prefix(MCP_ID_GROUP_PREFIX)
	return ""

func _set_mcp_id(node: Node, id: String) -> void:
	# Remove any previous id groups to avoid duplication.
	for group_name in node.get_groups():
		var g := str(group_name)
		if g.begins_with(MCP_ID_GROUP_PREFIX):
			node.remove_from_group(group_name)
	# Persist = true so it is serialized into the scene file.
	node.add_to_group(MCP_ID_GROUP_PREFIX + id, true)

func _apply_scene_patch(client_id: int, params: Dictionary, command_id: String) -> void:
	var operations: Array = params.get("operations", [])
	var strict: bool = params.get("strict", true)
	
	if operations.is_empty():
		return _send_error(client_id, "operations must be a non-empty array", command_id)
	
	var plugin = Engine.get_meta("GodotMCPPlugin")
	if not plugin:
		return _send_error(client_id, "GodotMCPPlugin not found in Engine metadata", command_id)
	
	var editor_interface = plugin.get_editor_interface()
	var edited_scene_root = editor_interface.get_edited_scene_root()
	if not edited_scene_root:
		return _send_error(client_id, "No scene is currently being edited", command_id)
	
	var undo_redo = _get_undo_redo()
	var errors: Array = []
	var queued := 0
	var applied := 0
	
	if undo_redo:
		undo_redo.create_action("Apply Scene Patch")
	
	for op_dict in operations:
		if typeof(op_dict) != TYPE_DICTIONARY:
			errors.append("Invalid operation (expected Dictionary)")
			if strict:
				break
			continue
		
		var ok := false
		if undo_redo:
			ok = _queue_patch_operation(undo_redo, edited_scene_root, op_dict, errors)
			if ok:
				queued += 1
		else:
			ok = _apply_patch_operation_immediate(edited_scene_root, op_dict, errors)
			if ok:
				applied += 1
		
		if not ok and strict:
			break
	
	if undo_redo:
		if strict and errors.size() > 0:
			# Do not commit: nothing is applied.
			pass
		else:
			undo_redo.commit_action()
			applied = queued
	
	if applied > 0:
		_mark_scene_modified()
	
	var result = {
		"applied": applied,
		"total": operations.size(),
		"used_undo_redo": undo_redo != null
	}
	if errors.size() > 0:
		result["errors"] = errors
	
	if strict and errors.size() > 0:
		return _send_error(client_id, errors[0], command_id)
	
	_send_success(client_id, result, command_id)

func _queue_patch_operation(undo_redo, edited_scene_root: Node, op_dict: Dictionary, errors: Array) -> bool:
	var op = op_dict.get("op", "")
	
	match op:
		"create_node":
			return _queue_create_node(undo_redo, edited_scene_root, op_dict, errors)
		"delete_node":
			return _queue_delete_node(undo_redo, edited_scene_root, op_dict, errors)
		"set_property":
			return _queue_set_property(undo_redo, op_dict, errors)
		"rename_node":
			return _queue_rename_node(undo_redo, op_dict, errors)
		"reparent_node":
			return _queue_reparent_node(undo_redo, edited_scene_root, op_dict, errors)
		_:
			errors.append("Unknown op: %s" % str(op))
			return false

func _apply_patch_operation_immediate(edited_scene_root: Node, op_dict: Dictionary, errors: Array) -> bool:
	var op = op_dict.get("op", "")
	
	match op:
		"create_node":
			return _apply_create_node_immediate(edited_scene_root, op_dict, errors)
		"delete_node":
			return _apply_delete_node_immediate(edited_scene_root, op_dict, errors)
		"set_property":
			return _apply_set_property_immediate(op_dict, errors)
		"rename_node":
			return _apply_rename_node_immediate(op_dict, errors)
		"reparent_node":
			return _apply_reparent_node_immediate(edited_scene_root, op_dict, errors)
		_:
			errors.append("Unknown op: %s" % str(op))
			return false

func _queue_create_node(undo_redo, edited_scene_root: Node, op: Dictionary, errors: Array) -> bool:
	var parent_path: String = op.get("parent_path", "/root")
	var node_type: String = op.get("node_type", "Node")
	var node_name: String = op.get("node_name", "")
	var properties: Dictionary = op.get("properties", {})
	var set_owner: bool = op.get("set_owner", true)
	
	if node_name.is_empty():
		errors.append("create_node: node_name cannot be empty")
		return false
	
	if not ClassDB.class_exists(node_type) or not ClassDB.can_instantiate(node_type):
		errors.append("create_node: invalid node_type: %s" % node_type)
		return false
	
	var parent = _get_editor_node(parent_path)
	if not parent:
		errors.append("create_node: parent not found: %s" % parent_path)
		return false
	
	if parent.get_node_or_null(node_name) != null:
		errors.append("create_node: node already exists under parent: %s" % node_name)
		return false
	
	var node = ClassDB.instantiate(node_type)
	node.name = node_name
	_set_mcp_id(node, _get_or_create_mcp_id(node))
	
	undo_redo.add_do_method(parent, "add_child", node)
	undo_redo.add_undo_method(parent, "remove_child", node)
	
	if set_owner:
		undo_redo.add_do_property(node, "owner", edited_scene_root)
		undo_redo.add_undo_property(node, "owner", null)
	
	for key in properties.keys():
		var property_name = str(key)
		var parsed_value = _parse_property_value(properties[key])
		if property_name in node:
			undo_redo.add_do_property(node, property_name, parsed_value)
	
	return true

func _queue_delete_node(undo_redo, edited_scene_root: Node, op: Dictionary, errors: Array) -> bool:
	var node_path: String = op.get("node_path", "")
	if node_path.is_empty():
		errors.append("delete_node: node_path cannot be empty")
		return false
	
	var node = _get_editor_node(node_path)
	if not node:
		errors.append("delete_node: node not found: %s" % node_path)
		return false
	
	if node == edited_scene_root:
		errors.append("delete_node: cannot delete root node")
		return false
	
	var parent = node.get_parent()
	if not parent:
		errors.append("delete_node: node has no parent")
		return false
	
	var old_index = parent.get_children().find(node)
	
	undo_redo.add_do_method(parent, "remove_child", node)
	undo_redo.add_undo_method(parent, "add_child", node)
	undo_redo.add_undo_method(parent, "move_child", node, old_index)
	return true

func _queue_set_property(undo_redo, op: Dictionary, errors: Array) -> bool:
	var node_path: String = op.get("node_path", "")
	var property_name: String = op.get("property", "")
	var value = op.get("value")
	
	if node_path.is_empty() or property_name.is_empty():
		errors.append("set_property: node_path and property are required")
		return false
	
	var node = _get_editor_node(node_path)
	if not node:
		errors.append("set_property: node not found: %s" % node_path)
		return false
	
	if not property_name in node:
		errors.append("set_property: property does not exist: %s" % property_name)
		return false
	
	var parsed_value = _parse_property_value(value)
	var old_value = node.get(property_name)
	
	undo_redo.add_do_property(node, property_name, parsed_value)
	undo_redo.add_undo_property(node, property_name, old_value)
	return true

func _queue_rename_node(undo_redo, op: Dictionary, errors: Array) -> bool:
	var node_path: String = op.get("node_path", "")
	var new_name: String = op.get("new_name", "")
	
	if node_path.is_empty() or new_name.is_empty():
		errors.append("rename_node: node_path and new_name are required")
		return false
	
	var node = _get_editor_node(node_path)
	if not node:
		errors.append("rename_node: node not found: %s" % node_path)
		return false
	
	var parent = node.get_parent()
	if parent and parent.get_node_or_null(new_name) != null:
		errors.append("rename_node: sibling already exists with name: %s" % new_name)
		return false
	
	var old_name = node.name
	undo_redo.add_do_property(node, "name", new_name)
	undo_redo.add_undo_property(node, "name", old_name)
	return true

func _queue_reparent_node(undo_redo, edited_scene_root: Node, op: Dictionary, errors: Array) -> bool:
	var node_path: String = op.get("node_path", "")
	var new_parent_path: String = op.get("new_parent_path", "")
	var keep_global: bool = op.get("keep_global_transform", false)
	var index = op.get("index", -1)
	
	if node_path.is_empty() or new_parent_path.is_empty():
		errors.append("reparent_node: node_path and new_parent_path are required")
		return false
	
	var node = _get_editor_node(node_path)
	if not node:
		errors.append("reparent_node: node not found: %s" % node_path)
		return false
	
	if node == edited_scene_root:
		errors.append("reparent_node: cannot reparent root node")
		return false
	
	var new_parent = _get_editor_node(new_parent_path)
	if not new_parent:
		errors.append("reparent_node: new parent not found: %s" % new_parent_path)
		return false
	
	var old_parent = node.get_parent()
	if not old_parent:
		errors.append("reparent_node: node has no parent")
		return false
	
	var old_index = old_parent.get_children().find(node)
	var saved_global = null
	if keep_global:
		saved_global = _get_global_transform_variant(node)
	
	undo_redo.add_do_method(self, "_reparent_node_internal", node, new_parent, edited_scene_root, keep_global, saved_global, index)
	undo_redo.add_undo_method(self, "_reparent_node_internal", node, old_parent, edited_scene_root, keep_global, saved_global, old_index)
	return true

func _reparent_node_internal(node: Node, new_parent: Node, edited_scene_root: Node, keep_global: bool, saved_global, index: int) -> void:
	var current_parent = node.get_parent()
	if current_parent:
		current_parent.remove_child(node)
	new_parent.add_child(node)
	if index >= 0:
		new_parent.move_child(node, index)
	_set_owner_recursive(node, edited_scene_root)
	if keep_global and saved_global != null:
		_set_global_transform_variant(node, saved_global)

func _set_owner_recursive(node: Node, owner: Node) -> void:
	node.owner = owner
	for child in node.get_children():
		if child is Node:
			_set_owner_recursive(child, owner)

func _get_global_transform_variant(node: Node):
	if node is Node2D:
		return node.global_transform
	if node is Node3D:
		return node.global_transform
	return null

func _set_global_transform_variant(node: Node, value) -> void:
	if node is Node2D:
		node.global_transform = value
	elif node is Node3D:
		node.global_transform = value

func _apply_create_node_immediate(edited_scene_root: Node, op: Dictionary, errors: Array) -> bool:
	var parent_path: String = op.get("parent_path", "/root")
	var node_type: String = op.get("node_type", "Node")
	var node_name: String = op.get("node_name", "")
	var properties: Dictionary = op.get("properties", {})
	var set_owner: bool = op.get("set_owner", true)
	
	if node_name.is_empty():
		errors.append("create_node: node_name cannot be empty")
		return false
	
	if not ClassDB.class_exists(node_type) or not ClassDB.can_instantiate(node_type):
		errors.append("create_node: invalid node_type: %s" % node_type)
		return false
	
	var parent = _get_editor_node(parent_path)
	if not parent:
		errors.append("create_node: parent not found: %s" % parent_path)
		return false
	
	if parent.get_node_or_null(node_name) != null:
		errors.append("create_node: node already exists under parent: %s" % node_name)
		return false
	
	var node = ClassDB.instantiate(node_type)
	node.name = node_name
	_set_mcp_id(node, _get_or_create_mcp_id(node))
	parent.add_child(node)
	if set_owner:
		_set_owner_recursive(node, edited_scene_root)
	
	for key in properties.keys():
		var property_name = str(key)
		var parsed_value = _parse_property_value(properties[key])
		if property_name in node:
			node.set(property_name, parsed_value)
	
	return true

func _apply_delete_node_immediate(edited_scene_root: Node, op: Dictionary, errors: Array) -> bool:
	var node_path: String = op.get("node_path", "")
	if node_path.is_empty():
		errors.append("delete_node: node_path cannot be empty")
		return false
	
	var node = _get_editor_node(node_path)
	if not node:
		errors.append("delete_node: node not found: %s" % node_path)
		return false
	
	if node == edited_scene_root:
		errors.append("delete_node: cannot delete root node")
		return false
	
	var parent = node.get_parent()
	if not parent:
		errors.append("delete_node: node has no parent")
		return false
	
	parent.remove_child(node)
	node.queue_free()
	return true

func _apply_set_property_immediate(op: Dictionary, errors: Array) -> bool:
	var node_path: String = op.get("node_path", "")
	var property_name: String = op.get("property", "")
	var value = op.get("value")
	
	if node_path.is_empty() or property_name.is_empty():
		errors.append("set_property: node_path and property are required")
		return false
	
	var node = _get_editor_node(node_path)
	if not node:
		errors.append("set_property: node not found: %s" % node_path)
		return false
	
	if not property_name in node:
		errors.append("set_property: property does not exist: %s" % property_name)
		return false
	
	var parsed_value = _parse_property_value(value)
	node.set(property_name, parsed_value)
	return true

func _apply_rename_node_immediate(op: Dictionary, errors: Array) -> bool:
	var node_path: String = op.get("node_path", "")
	var new_name: String = op.get("new_name", "")
	
	if node_path.is_empty() or new_name.is_empty():
		errors.append("rename_node: node_path and new_name are required")
		return false
	
	var node = _get_editor_node(node_path)
	if not node:
		errors.append("rename_node: node not found: %s" % node_path)
		return false
	
	var parent = node.get_parent()
	if parent and parent.get_node_or_null(new_name) != null:
		errors.append("rename_node: sibling already exists with name: %s" % new_name)
		return false
	
	node.name = new_name
	return true

func _apply_reparent_node_immediate(edited_scene_root: Node, op: Dictionary, errors: Array) -> bool:
	var node_path: String = op.get("node_path", "")
	var new_parent_path: String = op.get("new_parent_path", "")
	var keep_global: bool = op.get("keep_global_transform", false)
	var index = op.get("index", -1)
	
	if node_path.is_empty() or new_parent_path.is_empty():
		errors.append("reparent_node: node_path and new_parent_path are required")
		return false
	
	var node = _get_editor_node(node_path)
	if not node:
		errors.append("reparent_node: node not found: %s" % node_path)
		return false
	
	if node == edited_scene_root:
		errors.append("reparent_node: cannot reparent root node")
		return false
	
	var new_parent = _get_editor_node(new_parent_path)
	if not new_parent:
		errors.append("reparent_node: new parent not found: %s" % new_parent_path)
		return false
	
	var saved_global = null
	if keep_global:
		saved_global = _get_global_transform_variant(node)
	
	_reparent_node_internal(node, new_parent, edited_scene_root, keep_global, saved_global, index)
	return true

func _save_scene(client_id: int, params: Dictionary, command_id: String) -> void:
	var path = params.get("path", "")
	
	# Get editor plugin and interfaces
	var plugin = Engine.get_meta("GodotMCPPlugin")
	if not plugin:
		return _send_error(client_id, "GodotMCPPlugin not found in Engine metadata", command_id)
	
	var editor_interface = plugin.get_editor_interface()
	var edited_scene_root = editor_interface.get_edited_scene_root()
	
	# If no path provided, use the current scene path
	if path.is_empty() and edited_scene_root:
		path = edited_scene_root.scene_file_path
	
	# Validation
	if path.is_empty():
		return _send_error(client_id, "Scene path cannot be empty", command_id)
	
	# Make sure we have an absolute path
	if not path.begins_with("res://"):
		path = "res://" + path
	
	if not path.ends_with(".tscn"):
		path += ".tscn"
	
	# Check if we have an edited scene
	if not edited_scene_root:
		return _send_error(client_id, "No scene is currently being edited", command_id)
	
	# Save the scene
	var packed_scene = PackedScene.new()
	var result = packed_scene.pack(edited_scene_root)
	if result != OK:
		return _send_error(client_id, "Failed to pack scene: %d" % result, command_id)
	
	result = ResourceSaver.save(packed_scene, path)
	if result != OK:
		return _send_error(client_id, "Failed to save scene: %d" % result, command_id)
	
	_send_success(client_id, {
		"scene_path": path
	}, command_id)

func _open_scene(client_id: int, params: Dictionary, command_id: String) -> void:
	var path = params.get("path", "")
	
	# Validation
	if path.is_empty():
		return _send_error(client_id, "Scene path cannot be empty", command_id)
	
	# Make sure we have an absolute path
	if not path.begins_with("res://"):
		path = "res://" + path
	
	# Check if the file exists
	if not FileAccess.file_exists(path):
		return _send_error(client_id, "Scene file not found: %s" % path, command_id)
	
	# Since we can't directly open scenes in tool scripts,
	# we need to defer to the plugin which has access to EditorInterface
	var plugin = Engine.get_meta("GodotMCPPlugin") if Engine.has_meta("GodotMCPPlugin") else null
	
	if plugin and plugin.has_method("get_editor_interface"):
		var editor_interface = plugin.get_editor_interface()
		editor_interface.open_scene_from_path(path)
		_send_success(client_id, {
			"scene_path": path
		}, command_id)
	else:
		_send_error(client_id, "Cannot access EditorInterface. Please open the scene manually: %s" % path, command_id)

func _get_current_scene(client_id: int, _params: Dictionary, command_id: String) -> void:
	# Get editor plugin and interfaces
	var plugin = Engine.get_meta("GodotMCPPlugin")
	if not plugin:
		return _send_error(client_id, "GodotMCPPlugin not found in Engine metadata", command_id)
	
	var editor_interface = plugin.get_editor_interface()
	var edited_scene_root = editor_interface.get_edited_scene_root()
	
	if not edited_scene_root:
		print("No scene is currently being edited")
		# Instead of returning an error, return a valid response with empty/default values
		_send_success(client_id, {
			"scene_path": "None",
			"root_node_type": "None",
			"root_node_name": "None"
		}, command_id)
		return
	
	var scene_path = edited_scene_root.scene_file_path
	if scene_path.is_empty():
		scene_path = "Untitled"
	
	print("Current scene path: ", scene_path)
	print("Root node type: ", edited_scene_root.get_class())
	print("Root node name: ", edited_scene_root.name)
	
	_send_success(client_id, {
		"scene_path": scene_path,
		"root_node_type": edited_scene_root.get_class(),
		"root_node_name": edited_scene_root.name
	}, command_id)

func _get_scene_structure(client_id: int, params: Dictionary, command_id: String) -> void:
	var path = params.get("path", "")
	
	# Validation
	if path.is_empty():
		return _send_error(client_id, "Scene path cannot be empty", command_id)
	
	if not path.begins_with("res://"):
		path = "res://" + path
	
	if not FileAccess.file_exists(path):
		return _send_error(client_id, "Scene file not found: " + path, command_id)
	
	# Load the scene to analyze its structure
	var packed_scene = load(path)
	if not packed_scene:
		return _send_error(client_id, "Failed to load scene: " + path, command_id)
	
	# Create a temporary instance to analyze
	var scene_instance = packed_scene.instantiate()
	if not scene_instance:
		return _send_error(client_id, "Failed to instantiate scene: " + path, command_id)
	
	# Get the scene structure
	var structure = _get_node_structure(scene_instance)
	
	# Clean up the temporary instance
	scene_instance.queue_free()
	
	# Return the structure
	_send_success(client_id, {
		"path": path,
		"structure": structure
	}, command_id)

func _get_node_structure(node: Node) -> Dictionary:
	var structure = {
		"name": node.name,
		"type": node.get_class(),
		"path": node.get_path()
	}
	
	# Get script information
	var script = node.get_script()
	if script:
		structure["script"] = script.resource_path
	
	# Get important properties
	var properties = {}
	var property_list = node.get_property_list()
	
	for prop in property_list:
		var name = prop["name"]
		# Filter to include only the most useful properties
		if not name.begins_with("_") and name not in ["script", "children", "position", "rotation", "scale"]:
			continue
		
		# Skip properties that are default values
		if name == "position" and node.position == Vector2():
			continue
		if name == "rotation" and node.rotation == 0:
			continue
		if name == "scale" and node.scale == Vector2(1, 1):
			continue
		
		properties[name] = node.get(name)
	
	structure["properties"] = properties
	
	# Get children
	var children = []
	for child in node.get_children():
		children.append(_get_node_structure(child))
	
	structure["children"] = children
	
	return structure

func _create_scene(client_id: int, params: Dictionary, command_id: String) -> void:
	var path = params.get("path", "")
	var root_node_type = params.get("root_node_type", "Node")
	
	# Validation
	if path.is_empty():
		return _send_error(client_id, "Scene path cannot be empty", command_id)
	
	# Make sure we have an absolute path
	if not path.begins_with("res://"):
		path = "res://" + path
	
	# Ensure path ends with .tscn
	if not path.ends_with(".tscn"):
		path += ".tscn"
	
	# Create directory structure if it doesn't exist
	var dir_path = path.get_base_dir()
	if not DirAccess.dir_exists_absolute(dir_path):
		var dir = DirAccess.open("res://")
		if dir:
			dir.make_dir_recursive(dir_path.trim_prefix("res://"))
	
	# Check if file already exists
	if FileAccess.file_exists(path):
		return _send_error(client_id, "Scene file already exists: %s" % path, command_id)
	
	# Create the root node of the specified type
	var root_node = null
	
	match root_node_type:
		"Node":
			root_node = Node.new()
		"Node2D":
			root_node = Node2D.new()
		"Node3D", "Spatial":
			root_node = Node3D.new()
		"Control":
			root_node = Control.new()
		"CanvasLayer":
			root_node = CanvasLayer.new()
		"Panel":
			root_node = Panel.new()
		_:
			# Attempt to create a custom class if built-in type not recognized
			if ClassDB.class_exists(root_node_type):
				root_node = ClassDB.instantiate(root_node_type)
			else:
				return _send_error(client_id, "Invalid root node type: %s" % root_node_type, command_id)
	
	# Give the root node a name based on the file name
	var file_name = path.get_file().get_basename()
	root_node.name = file_name
	
	# Create a packed scene
	var packed_scene = PackedScene.new()
	var result = packed_scene.pack(root_node)
	if result != OK:
		root_node.free()
		return _send_error(client_id, "Failed to pack scene: %d" % result, command_id)
	
	# Save the packed scene to disk
	result = ResourceSaver.save(packed_scene, path)
	if result != OK:
		root_node.free()
		return _send_error(client_id, "Failed to save scene: %d" % result, command_id)
	
	# Clean up
	root_node.free()
	
	# Try to open the scene in the editor
	var plugin = Engine.get_meta("GodotMCPPlugin") if Engine.has_meta("GodotMCPPlugin") else null
	if plugin and plugin.has_method("get_editor_interface"):
		var editor_interface = plugin.get_editor_interface()
		editor_interface.open_scene_from_path(path)
	
	_send_success(client_id, {
		"scene_path": path,
		"root_node_type": root_node_type
	}, command_id)
