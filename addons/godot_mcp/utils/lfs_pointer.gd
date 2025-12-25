class_name LFSPointer
extends RefCounted

## Utilities for parsing and generating Git LFS pointer files

const POINTER_VERSION = "https://git-lfs.github.com/spec/v1"


## Parse LFS pointer file content and return metadata
static func parse_pointer(content: String) -> Dictionary:
	var result = {
		"valid": false,
		"oid": "",
		"size": 0
	}

	var lines = content.split("\n")
	if lines.size() < 3:
		return result

	if not lines[0].begins_with("version " + POINTER_VERSION):
		return result

	for line in lines:
		if line.begins_with("oid sha256:"):
			result.oid = line.split(":")[1].strip_edges()
		elif line.begins_with("size "):
			result.size = int(line.split(" ")[1])

	result.valid = not result.oid.is_empty()
	return result


## Generate LFS pointer file content
static func generate_pointer(oid: String, size: int) -> String:
	return "version %s\noid sha256:%s\nsize %d\n" % [POINTER_VERSION, oid, size]


## Calculate SHA256 hash of a file for LFS OID
static func calculate_sha256(file_path: String) -> String:
	var file = FileAccess.open(file_path, FileAccess.READ)
	if not file:
		return ""

	var context = HashingContext.new()
	context.start(HashingContext.HASH_SHA256)

	while not file.eof_reached():
		var buffer = file.get_buffer(4096)
		context.update(buffer)

	file.close()
	var hash = context.finish()
	return hex_encode_buffer(hash)


## Helper to encode byte array to hex string
static func hex_encode_buffer(buffer: PackedByteArray) -> String:
	var hex = ""
	for byte in buffer:
		hex += "%02x" % byte
	return hex


## Check if file content is an LFS pointer
static func is_lfs_pointer(content: String) -> bool:
	return content.strip_edges().begins_with("version " + POINTER_VERSION)
