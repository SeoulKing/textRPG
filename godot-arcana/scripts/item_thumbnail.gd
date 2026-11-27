extends TextureRect

const SIDE := 40

func _init(item_texture: Texture2D, side: int = SIDE) -> void:
	texture = item_texture
	custom_minimum_size = Vector2(side, side)
	size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	size_flags_vertical = Control.SIZE_SHRINK_CENTER
	expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	mouse_filter = Control.MOUSE_FILTER_IGNORE

static func load_texture(thumbnail: Dictionary) -> Texture2D:
	var path: String = str(thumbnail.get("path", ""))
	if not path.begins_with("res://art/export/") or not ResourceLoader.exists(path):
		return null
	var item_texture := load(path) as Texture2D
	var region: Variant = thumbnail.get("region")
	if item_texture != null and region is Array and region.size() == 4:
		var atlas := AtlasTexture.new()
		atlas.atlas = item_texture
		atlas.region = Rect2(float(region[0]), float(region[1]), float(region[2]), float(region[3]))
		return atlas
	return item_texture
