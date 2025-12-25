class_name AssetMetadata
extends RefCounted

## Asset metadata tracking for Git LFS integration
## Stores metadata in sidecar JSON files


## Get the metadata file path for an asset
static func get_metadata_path(asset_path: String) -> String:
	var base = asset_path.get_basename()
	return base + ".asset.json"


## Save asset metadata to sidecar file
static func save_metadata(asset_path: String, metadata: Dictionary) -> void:
	var meta_path = get_metadata_path(asset_path)
	var file = FileAccess.open(meta_path, FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify(metadata, "\t"))
		file.close()


## Load asset metadata from sidecar file
static func load_metadata(asset_path: String) -> Dictionary:
	var meta_path = get_metadata_path(asset_path)
	if not FileAccess.file_exists(meta_path):
		return {}

	var file = FileAccess.open(meta_path, FileAccess.READ)
	if not file:
		return {}

	var content = file.get_as_text()
	file.close()

	var json = JSON.new()
	var error = json.parse(content)
	if error == OK:
		return json.data
	return {}


## Create default metadata for an imported asset
static func create_default_metadata(asset_path: String, category: String) -> Dictionary:
	var file = FileAccess.open(asset_path, FileAccess.READ)
	var file_size = 0
	if file:
		file_size = file.get_length()
		file.close()

	return {
		"path": asset_path,
		"category": category,
		"imported_at": Time.get_datetime_string_from_system(),
		"file_size": file_size,
		"lfs_enabled": true,
		"dependencies": [],
		"tags": []
	}
