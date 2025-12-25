@tool
class_name MCPGameCommands
extends MCPBaseCommandProcessor

## Command processor for game-specific operations like screenshots

func process_command(client_id: int, agent_id: String, command_type: String, params: Dictionary, command_id: String) -> bool:
	match command_type:
		"capture_game_frame":
			_capture_game_frame(client_id, params, command_id)
			return true
		"capture_node_viewport":
			_capture_node_viewport(client_id, params, command_id)
			return true
		"save_screenshot":
			_save_screenshot(client_id, params, command_id)
			return true
		"get_game_state":
			_get_game_state(client_id, params, command_id)
			return true
	return false  # Command not handled


## Capture the current game viewport with instrumentation
func _capture_game_frame(client_id: int, params: Dictionary, command_id: String) -> void:
	var include_instrumentation = params.get("include_instrumentation", true)
	var save_to_file = params.get("save_to_file", "")
	var format = params.get("format", "png")

	# Capture the viewport
	var result = GameScreenshot.capture_game_viewport(include_instrumentation)

	if not result.get("success", false):
		return _send_error(client_id, "Failed to capture game frame: " + result.get("error", "Unknown error"), command_id)

	# If requested to save to file
	if not save_to_file.is_empty():
		if not save_to_file.begins_with("res://"):
			save_to_file = "res://" + save_to_file

		# Create directory if needed
		var dir = save_to_file.get_base_dir()
		if not DirAccess.dir_exists_absolute(dir):
			DirAccess.make_dir_recursive_absolute(dir)

		# Decode base64 and save
		var image_data = Marshalls.base64_to_raw(result["image_data"])
		var image = Image.new()

		match result["format"]:
			"png":
				image.load_png_from_buffer(image_data)
			"jpg", "jpeg":
				image.load_jpg_from_buffer(image_data)
			"webp":
				image.load_webp_from_buffer(image_data)

		var save_result = GameScreenshot.save_screenshot_to_file(image, save_to_file, result["format"])

		if save_result != OK:
			return _send_error(client_id, "Failed to save screenshot to file: " + save_to_file, command_id)

		result["saved_path"] = save_to_file

	_send_success(client_id, result, command_id)


## Capture a specific node's viewport
func _capture_node_viewport(client_id: int, params: Dictionary, command_id: String) -> void:
	var node_path = params.get("node_path", "")

	# Validation
	if node_path.is_empty():
		return _send_error(client_id, "Node path cannot be empty", command_id)

	# Get the node
	var node = _get_editor_node(node_path)
	if not node:
		return _send_error(client_id, "Node not found: " + node_path, command_id)

	# Capture the node's viewport
	var result = GameScreenshot.capture_node_viewport(node)

	if not result.get("success", false):
		return _send_error(client_id, "Failed to capture node viewport: " + result.get("error", "Unknown error"), command_id)

	_send_success(client_id, result, command_id)


## Save a screenshot to a file with options
func _save_screenshot(client_id: int, params: Dictionary, command_id: String) -> void:
	var path = params.get("path", "")
	var format = params.get("format", "png")

	# Validation
	if path.is_empty():
		return _send_error(client_id, "Path cannot be empty", command_id)

	if not path.begins_with("res://"):
		path = "res://" + path

	# Ensure the file has the correct extension
	var ext = "." + format
	if not path.ends_with(ext):
		path += ext

	# Capture the viewport
	var capture_result = GameScreenshot.capture_game_viewport(true)

	if not capture_result.get("success", false):
		return _send_error(client_id, "Failed to capture screenshot: " + capture_result.get("error", "Unknown error"), command_id)

	# Decode base64 and create image
	var image_data = Marshalls.base64_to_raw(capture_result["image_data"])
	var image = Image.new()

	var img_format = capture_result.get("format", "png")
	match img_format:
		"png":
			image.load_png_from_buffer(image_data)
		"jpg", "jpeg":
			image.load_jpg_from_buffer(image_data)
		"webp":
			image.load_webp_from_buffer(image_data)

	if not image.is_valid():
		return _send_error(client_id, "Failed to decode image data", command_id)

	# Create directory if needed
	var dir = path.get_base_dir()
	if not DirAccess.dir_exists_absolute(dir):
		var err = DirAccess.make_dir_recursive_absolute(dir)
		if err != OK:
			return _send_error(client_id, "Failed to create directory: " + dir, command_id)

	# Save the image
	var save_result = GameScreenshot.save_screenshot_to_file(image, path, img_format)

	if save_result != OK:
		return _send_error(client_id, "Failed to save screenshot to: " + path, command_id)

	# Refresh filesystem
	var plugin = Engine.get_meta("GodotMCPPlugin")
	if plugin:
		var editor_interface = plugin.get_editor_interface()
		editor_interface.get_resource_filesystem().scan()

	_send_success(client_id, {
		"path": path,
		"format": img_format,
		"width": image.get_width(),
		"height": image.get_height()
	}, command_id)


## Get the current game state without capturing an image
func _get_game_state(client_id: int, params: Dictionary, command_id: String) -> void:
	var plugin = Engine.get_meta("GodotMCPPlugin")
	if not plugin:
		return _send_error(client_id, "GodotMCPPlugin not found", command_id)

	var editor_interface = plugin.get_editor_interface()

	var state = {
		"is_playing": editor_interface.is_playing_scene(),
		"current_scene": "",
		"fps": Engine.get_frames_per_second(),
		"timestamp": Time.get_datetime_string_from_system(),
		"unix_time": Time.get_unix_time_from_system()
	}

	# Get current scene info
	var edited_scene_root = editor_interface.get_edited_scene_root()
	if edited_scene_root:
		state["current_scene"] = edited_scene_root.scene_file_path

	# If playing, get runtime state
	if state["is_playing"]:
		var current_scene = get_tree().current_scene
		if current_scene:
			state["runtime_scene"] = {
				"name": current_scene.name,
				"root_type": current_scene.get_class(),
				"child_count": current_scene.get_child_count()
			}

	_send_success(client_id, state, command_id)
