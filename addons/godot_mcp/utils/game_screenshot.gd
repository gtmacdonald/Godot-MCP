class_name GameScreenshot
extends RefCounted

## Utilities for capturing game screenshots with instrumentation data


## Capture the current game viewport with instrumentation
## Returns a dictionary with image data and metadata
static func capture_game_viewport(include_instrumentation: bool = true) -> Dictionary:
	var result = {
		"success": false,
		"image_data": "",
		"width": 0,
		"height": 0,
		"format": "",
		"instrumentation": {}
	}

	# Get the current viewport
	var viewport: Viewport = null

	# Try to get the main viewport
	var root = get_tree().root
	if root:
		# Find the first Viewport that's actually rendering the game
		for child in root.get_children():
			if child is Viewport:
				viewport = child
				# Prefer the viewport that's set to render to the screen
				if viewport.is_processing():
					break

	if not viewport:
		result["error"] = "No active viewport found"
		return result

	# Capture the viewport
	var image: Image = viewport.get_texture().get_data()

	if not image:
		result["error"] = "Failed to capture viewport image"
		return result

	# Flip image vertically (Godot viewports are upside down)
	image.flip_y()

	result["success"] = true
	result["width"] = image.get_width()
	result["height"] = image.get_height()

	# Convert to requested format (default to PNG)
	var format = "png"
	match format:
		"png":
			result["image_data"] = Marshalls.raw_to_base64(image.save_png_to_buffer())
			result["format"] = "png"
		"jpg", "jpeg":
			result["image_data"] = Marshalls.raw_to_base64(image.save_jpg_to_buffer())
			result["format"] = "jpg"
		"webp":
			result["image_data"] = Marshalls.raw_to_base64(image.save_webp_to_buffer())
			result["format"] = "webp"
		_:
			result["image_data"] = Marshalls.raw_to_base64(image.save_png_to_buffer())
			result["format"] = "png"

	# Add instrumentation data if requested
	if include_instrumentation:
		result["instrumentation"] = _gather_instrumentation_data(viewport)

	return result


## Save screenshot to file
static func save_screenshot_to_file(image: Image, path: String, format: String = "png") -> int:
	match format:
		"png":
			return image.save_png(path)
		"jpg", "jpeg":
			return image.save_jpg(path)
		"webp":
			return image.save_webp(path)
		_:
			return image.save_png(path)


## Capture a specific node's viewport (for SubViewport containers)
static func capture_node_viewport(node: Node) -> Dictionary:
	var result = {
		"success": false,
		"image_data": "",
		"width": 0,
		"height": 0,
		"format": "png",
		"instrumentation": {}
	}

	if not node:
		result["error"] = "Node is null"
		return result

	var viewport: Viewport = null

	# Check if node is a Viewport
	if node is Viewport:
		viewport = node as Viewport
	# Check if node has a viewport
	else:
		viewport = node.get_viewport()

	if not viewport:
		result["error"] = "Node has no viewport"
		return result

	var image: Image = viewport.get_texture().get_data()

	if not image:
		result["error"] = "Failed to capture viewport image"
		return result

	image.flip_y()

	result["success"] = true
	result["width"] = image.get_width()
	result["height"] = image.get_height()
	result["image_data"] = Marshalls.raw_to_base64(image.save_png_to_buffer())
	result["instrumentation"] = _gather_node_instrumentation(node)

	return result


## Gather instrumentation data about the current game state
static func _gather_instrumentation_data(viewport: Viewport) -> Dictionary:
	var data = {}

	# Timestamp
	data["timestamp"] = Time.get_datetime_string_from_system()
	data["unix_time"] = Time.get_unix_time_from_system()

	# Engine info
	data["engine_version"] = Engine.get_version_info()
	data["godot_version"] = Engine.get_version_info()["string"]

	# Viewport info
	data["viewport"] = {
		"width": viewport.get_size().x,
		"height": viewport.get_size().y,
		"render_target": viewport.is_using_screen_space()
	}

	# Scene info
	var current_scene = get_tree().current_scene
	if current_scene:
		data["scene"] = {
			"path": current_scene.scene_file_path,
			"name": current_scene.name,
			"root_type": current_scene.get_class()
		}

		# Try to find common game objects
		_find_and_instrument_player(current_scene, data)
		_find_and_instrument_camera(current_scene, data)

	# Performance info
	data["performance"] = {
		"fps": Engine.get_frames_per_second(),
		"process_time": Performance.get_monitor(Performance.TIME_PROCESS),
		"physics_time": Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS)
	}

	return data


## Gather instrumentation data for a specific node
static func _gather_node_instrumentation(node: Node) -> Dictionary:
	var data = {}

	data["node"] = {
		"name": node.name,
		"type": node.get_class(),
		"path": str(node.get_path())
	}

	# If it's a Node2D or Node3D, get transform info
	if node is Node2D:
		var node2d = node as Node2D
		data["transform"] = {
			"position": str(node2d.position),
			"rotation": node2d.rotation,
			"scale": str(node2d.scale)
		}
	elif node is Node3D:
		var node3d = node as Node3D
		data["transform"] = {
			"position": str(node3d.position),
			"rotation": str(node3d.rotation),
			"scale": str(node3d.scale)
		}

	return data


## Try to find and instrument player object
static func _find_and_instrument_player(scene: Node, data: Dictionary) -> void:
	# Look for common player node patterns
	var player_names = ["Player", "player", "Character", "character", "Hero", "hero"]

	for name in player_names:
		var player = scene.find_child(name, true, false)
		if player:
			data["player"] = {
				"name": player.name,
				"type": player.get_class(),
				"path": str(player.get_path())
			}

			# Try to get common player properties
			if player.has_method("get_health"):
				data["player"]["health"] = player.call("get_health")
			if player.has_method("get_score"):
				data["player"]["score"] = player.call("get_score")
			if "health" in player:
				data["player"]["health"] = player.health
			if "score" in player:
				data["player"]["score"] = player.score

			# Get position
			if player is Node2D:
				data["player"]["position"] = str(player.position)
			elif player is Node3D:
				data["player"]["position"] = str(player.position)

			break


## Try to find and instrument camera
static func _find_and_instrument_camera(scene: Node, data: Dictionary) -> void:
	# Look for Camera2D or Camera3D
	var cameras = []

	# Find all cameras
	var nodes = [scene]
	var idx = 0
	while idx < nodes.size():
		var node = nodes[idx]
		nodes.append_array(node.get_children())
		idx += 1

		if node is Camera2D or node is Camera3D:
			cameras.append(node)

	if cameras.is_empty():
		return

	# Use the first enabled camera
	var camera = null
	for cam in cameras:
		if cam is Camera2D:
			var c2d = cam as Camera2D
			if c2d.enabled:
				camera = c2d
				break
		elif cam is Camera3D:
			var c3d = cam as Camera3D
			if c3d.current:
				camera = c3d
				break

	# Fall back to first camera if none enabled
	if not camera and not cameras.is_empty():
		camera = cameras[0]

	if camera:
		data["camera"] = {
			"type": camera.get_class(),
			"name": camera.name,
			"path": str(camera.get_path())
		}

		if camera is Camera2D:
			var c2d = camera as Camera2D
			data["camera"]["position"] = str(c2d.position)
			data["camera"]["zoom"] = str(c2d.zoom)
			data["camera"]["enabled"] = c2d.enabled
		elif camera is Camera3D:
			var c3d = camera as Camera3D
			data["camera"]["position"] = str(c3d.position)
			data["camera"]["rotation"] = str(c3d.rotation)
			data["camera"]["current"] = c3d.current
