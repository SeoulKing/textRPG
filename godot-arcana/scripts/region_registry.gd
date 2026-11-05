extends RefCounted
## Shared by runtime, authoring and web resource selection. No scene generation.
const DATA = "res://data/regions.json"
static func all() -> Dictionary:
	var value: Variant = JSON.parse_string(FileAccess.get_file_as_string(DATA))
	return value.get("regions", {}) if value is Dictionary else {}
static func key(location: String, floor_number: int = 1) -> String:
	if location.is_empty(): return "outside"
	return location + ":" + str(floor_number) if location == "arcana_academy" else location
static func definition(location: String, floor_number: int = 1) -> Dictionary:
	return all().get(key(location, floor_number), {})
static func scene(location: String, floor_number: int = 1) -> PackedScene:
	var entry := definition(location, floor_number)
	var path: String = str(entry.get("scene", ""))
	return load(path) as PackedScene if not path.is_empty() else null
static func camera_bounds(location: String, floor_number: int = 1) -> Rect2:
	var box: Array = definition(location, floor_number).get("bounds", [0,0,1536,1312])
	return Rect2(box[0], box[1], box[2], box[3])
