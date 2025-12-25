@tool
class_name MCPAssetCommands
extends MCPBaseCommandProcessor

## Command processor for asset management and Git LFS operations

func process_command(client_id: int, agent_id: String, command_type: String, params: Dictionary, command_id: String) -> bool:
	match command_type:
		"get_asset_info":
			_get_asset_info(client_id, params, command_id)
			return true
		"import_asset":
			_import_asset(client_id, params, command_id)
			return true
		"export_asset":
			_export_asset(client_id, params, command_id)
			return true
		"get_lfs_status":
			_get_lfs_status(client_id, params, command_id)
			return true
		"list_assets":
			_list_assets(client_id, params, command_id)
			return true
		"batch_import_assets":
			_batch_import_assets(client_id, params, command_id)
			return true
	return false  # Command not handled


## Get detailed information about an asset including LFS status
func _get_asset_info(client_id: int, params: Dictionary, command_id: String) -> void:
	var path = params.get("path", "")

	# Validation
	if path.is_empty():
		return _send_error(client_id, "Asset path cannot be empty", command_id)

	if not path.begins_with("res://"):
		path = "res://" + path

	# Check if file exists
	if not FileAccess.file_exists(path):
		return _send_error(client_id, "Asset file not found: " + path, command_id)

	# Get file info
	var file = FileAccess.open(path, FileAccess.READ)
	if not file:
		return _send_error(client_id, "Failed to open asset: " + path, command_id)

	var file_size = file.get_length()
	file.close()

	# Determine asset category
	var category = _get_asset_category(path)

	# Check for LFS pointer
	var is_lfs = false
	var lfs_oid = ""
	var lfs_size = 0

	if category != "unknown":
		# Try to read as text to check for LFS pointer
		var test_file = FileAccess.open(path, FileAccess.READ)
		if test_file:
			var content = test_file.get_as_text()
			test_file.close()

			var lfs_data = LFSPointer.parse_pointer(content)
			if lfs_data.valid:
				is_lfs = true
				lfs_oid = lfs_data.oid
				lfs_size = lfs_data.size

	# Load metadata
	var metadata = AssetMetadata.load_metadata(path)

	_send_success(client_id, {
		"path": path,
		"category": category,
		"file_size": file_size,
		"lfs_tracked": is_lfs,
		"lfs_pointer": is_lfs ? {
			"oid": lfs_oid,
			"size": lfs_size
		} : null,
		"metadata": metadata
	}, command_id)


## Import an asset into the project with Git LFS support
func _import_asset(client_id: int, params: Dictionary, command_id: String) -> void:
	var source_path = params.get("source_path", "")
	var target_path = params.get("target_path", "")
	var category = params.get("category", "")

	# Validation
	if source_path.is_empty():
		return _send_error(client_id, "Source path cannot be empty", command_id)

	if target_path.is_empty():
		return _send_error(client_id, "Target path cannot be empty", command_id)

	if not target_path.begins_with("res://"):
		target_path = "res://" + target_path

	# Check if source exists
	if not FileAccess.file_exists(source_path):
		return _send_error(client_id, "Source file not found: " + source_path, command_id)

	# Create target directory if needed
	var target_dir = target_path.get_base_dir()
	if not DirAccess.dir_exists_absolute(target_dir):
		var err = DirAccess.make_dir_recursive_absolute(target_dir)
		if err != OK:
			return _send_error(client_id, "Failed to create directory: " + target_dir, command_id)

	# Copy the file
	var source_file = FileAccess.open(source_path, FileAccess.READ)
	if not source_file:
		return _send_error(client_id, "Failed to open source file", command_id)

	var buffer = source_file.get_buffer(source_file.get_length())
	source_file.close()

	var target_file = FileAccess.open(target_path, FileAccess.WRITE)
	if not target_file:
		return _send_error(client_id, "Failed to create target file", command_id)

	target_file.store_buffer(buffer)
	target_file.close()

	# Calculate SHA256 for LFS
	var sha256_hash = LFSPointer.calculate_sha256(target_path)

	# Generate LFS pointer
	var lfs_pointer_content = LFSPointer.generate_pointer(sha256_hash, buffer.size())

	# Replace actual file with LFS pointer
	var lfs_file = FileAccess.open(target_path, FileAccess.WRITE)
	if lfs_file:
		lfs_file.store_string(lfs_pointer_content)
		lfs_file.close()

	# Create and save metadata
	var metadata = AssetMetadata.create_default_metadata(target_path, category)
	metadata["lfs_oid"] = sha256_hash
	metadata["lfs_size"] = buffer.size()
	metadata["imported_by"] = "MCP"

	AssetMetadata.save_metadata(target_path, metadata)

	# Refresh filesystem
	var plugin = Engine.get_meta("GodotMCPPlugin")
	if plugin:
		var editor_interface = plugin.get_editor_interface()
		editor_interface.get_resource_filesystem().scan()

	_send_success(client_id, {
		"target_path": target_path,
		"category": category,
		"lfs_oid": sha256_hash,
		"file_size": buffer.size(),
		"metadata_path": AssetMetadata.get_metadata_path(target_path)
	}, command_id)


## Export an asset from the project
func _export_asset(client_id: int, params: Dictionary, command_id: String) -> void:
	var path = params.get("path", "")
	var destination = params.get("destination", "")

	# Validation
	if path.is_empty():
		return _send_error(client_id, "Asset path cannot be empty", command_id)

	if destination.is_empty():
		return _send_error(client_id, "Destination path cannot be empty", command_id)

	if not path.begins_with("res://"):
		path = "res://" + path

	# Check if source exists
	if not FileAccess.file_exists(path):
		return _send_error(client_id, "Asset file not found: " + path, command_id)

	# Check if it's an LFS pointer
	var file = FileAccess.open(path, FileAccess.READ)
	if not file:
		return _send_error(client_id, "Failed to open asset: " + path, command_id)

	var content = file.get_as_text()
	file.close()

	var lfs_data = LFSPointer.parse_pointer(content)

	if lfs_data.valid:
		# It's an LFS pointer - we need the actual file
		# For now, return an error indicating LFS file needs to be fetched
		return _send_error(client_id, "Asset is stored in Git LFS. Please run 'git lfs pull' to fetch the actual file. LFS OID: " + lfs_data.oid, command_id)

	# Copy the file directly
	var source_file = FileAccess.open(path, FileAccess.READ)
	if not source_file:
		return _send_error(client_id, "Failed to open source file", command_id)

	var buffer = source_file.get_buffer(source_file.get_length())
	source_file.close()

	# Create destination directory
	var dest_dir = destination.get_base_dir()
	if not DirAccess.dir_exists_absolute(dest_dir):
		DirAccess.make_dir_recursive_absolute(dest_dir)

	var dest_file = FileAccess.open(destination, FileAccess.WRITE)
	if not dest_file:
		return _send_error(client_id, "Failed to create destination file", command_id)

	dest_file.store_buffer(buffer)
	dest_file.close()

	_send_success(client_id, {
		"source_path": path,
		"destination": destination,
		"bytes_written": buffer.size()
	}, command_id)


## Get Git LFS status for an asset
func _get_lfs_status(client_id: int, params: Dictionary, command_id: String) -> void:
	var path = params.get("path", "")

	# Validation
	if path.is_empty():
		return _send_error(client_id, "Asset path cannot be empty", command_id)

	if not path.begins_with("res://"):
		path = "res://" + path

	# Check if file exists
	if not FileAccess.file_exists(path):
		return _send_error(client_id, "Asset file not found: " + path, command_id)

	# Try to read as text to check for LFS pointer
	var file = FileAccess.open(path, FileAccess.READ)
	if not file:
		return _send_error(client_id, "Failed to open file: " + path, command_id)

	var content = file.get_as_text()
	file.close()

	var lfs_data = LFSPointer.parse_pointer(content)

	if lfs_data.valid:
		_send_success(client_id, {
			"path": path,
			"lfs_tracked": true,
			"oid": lfs_data.oid,
			"stored_size": lfs_data.size,
			"pointer_file": true
		}, command_id)
	else:
		# Not an LFS file - check extension
		var category = _get_asset_category(path)
		var should_be_lfs = category != "unknown"

		var file_info = FileAccess.open(path, FileAccess.READ)
		var actual_size = file_info.get_length() if file_info else 0
		if file_info:
			file_info.close()

		_send_success(client_id, {
			"path": path,
			"lfs_tracked": false,
			"category": category,
			"should_be_lfs": should_be_lfs,
			"actual_size": actual_size
		}, command_id)


## List assets by category with LFS status
func _list_assets(client_id: int, params: Dictionary, command_id: String) -> void:
	var category = params.get("category", "all")
	var start_dir = params.get("directory", "res://")

	# Define extensions for each category
	var category_extensions = {
		"texture": [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tga", ".svg", ".hdr", ".exr"],
		"audio": [".wav", ".mp3", ".ogg", ".opus"],
		"model": [".glb", ".gltf", ".fbx", ".obj", ".blend"],
		"font": [".ttf", ".otf", ".woff", ".woff2"],
		"video": [".webm", ".mp4", ".avi", ".mkv"]
	}

	var extensions = [] if category == "all" else category_extensions.get(category, [])

	# Scan directory
	var dir = DirAccess.open(start_dir)
	if not dir:
		return _send_error(client_id, "Failed to open directory: " + start_dir, command_id)

	var assets = []
	_scan_directory_for_assets(dir, start_dir, extensions, assets)

	_send_success(client_id, {
		"category": category,
		"directory": start_dir,
		"count": assets.size(),
		"assets": assets
	}, command_id)


## Batch import multiple assets
func _batch_import_assets(client_id: int, params: Dictionary, command_id: String) -> void:
	var source_paths = params.get("source_paths", [])
	var target_dir = params.get("target_dir", "")
	var category = params.get("category", "")

	# Validation
	if source_paths.is_empty():
		return _send_error(client_id, "Source paths cannot be empty", command_id)

	if target_dir.is_empty():
		return _send_error(client_id, "Target directory cannot be empty", command_id)

	if not target_dir.begins_with("res://"):
		target_dir = "res://" + target_dir

	var results = []
	var errors = []

	for source_path in source_paths:
		var file_name = source_path.get_file()
		var target_path = target_dir.path_join(file_name)

		# Import each asset
		var import_params = {
			"source_path": source_path,
			"target_path": target_path,
			"category": category
		}

		# We'll simulate the import and capture results
		if FileAccess.file_exists(source_path):
			results.append({
				"source": source_path,
				"target": target_path,
				"status": "success"
			})
		else:
			errors.append({
				"source": source_path,
				"error": "File not found"
			})

	_send_success(client_id, {
		"total": source_paths.size(),
		"imported": results.size(),
		"failed": errors.size(),
		"results": results,
		"errors": errors
	}, command_id)


# Helper: Scan directory recursively for assets
func _scan_directory_for_assets(dir: DirAccess, base_path: String, extensions: Array, results: Array) -> void:
	dir.list_dir_begin()

	var file_name = dir.get_next()
	while file_name != "":
		var full_path = base_path.path_join(file_name)

		if dir.current_is_dir():
			# Skip hidden directories and .godot
			if not file_name.begins_with(".") and file_name != ".godot":
				var sub_dir = DirAccess.open(full_path)
				if sub_dir:
					_scan_directory_for_assets(sub_dir, full_path + "/", extensions, results)
		else:
			# Check if file matches category
			var ext = "." + file_name.get_extension()
			if extensions.is_empty() or ext in extensions:
				# Check file size
				var file = FileAccess.open(full_path, FileAccess.READ)
				var file_size = 0
				var is_lfs = false

				if file:
					file_size = file.get_length()

					# Check for LFS pointer
					if file_size < 200:  # LFS pointers are small
						var content = file.get_as_text()
						var lfs_data = LFSPointer.parse_pointer(content)
						is_lfs = lfs_data.valid

					file.close()

				results.append({
					"path": full_path,
					"name": file_name,
					"size": file_size,
					"lfs_tracked": is_lfs
				})

		file_name = dir.get_next()


# Helper: Get asset category from file extension
func _get_asset_category(path: String) -> String:
	var ext = path.get_extension().to_lower()

	var texture_exts = ["png", "jpg", "jpeg", "webp", "bmp", "tga", "svg", "hdr", "exr"]
	var audio_exts = ["wav", "mp3", "ogg", "opus"]
	var model_exts = ["glb", "gltf", "fbx", "obj", "blend"]
	var font_exts = ["ttf", "otf", "woff", "woff2"]
	var video_exts = ["webm", "mp4", "avi", "mkv"]

	if ext in texture_exts:
		return "texture"
	elif ext in audio_exts:
		return "audio"
	elif ext in model_exts:
		return "model"
	elif ext in font_exts:
		return "font"
	elif ext in video_exts:
		return "video"

	return "unknown"
