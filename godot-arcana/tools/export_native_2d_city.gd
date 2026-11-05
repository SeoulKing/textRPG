extends SceneTree
## Explicit one-time migration. Never called by the running game or editor refresh.
const Art = preload("res://scripts/illustrated_art.gd")
const Outdoor = preload("res://art/resources/outdoor_art.gd")
const Coordinates = preload("res://scripts/native_2d_coordinates.gd")
const Placement = preload("res://scripts/native_2d_placement.gd")
const OUTPUT = "res://scenes/native_2d/plaza.tscn"
var unresolved: Array[String] = []
var textures: Dictionary = {}
func _initialize() -> void:
	call_deferred("export_city")
func export_city() -> void:
	if ResourceLoader.exists(OUTPUT):
		push_error("Refusing to overwrite the native 2D edited scene: " + OUTPUT)
		quit(1)
		return
	var source = load("res://scenes/plaza.tscn").instantiate()
	var target = Node2D.new()
	target.name = "Plaza2D"
	target.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	var objects = Node2D.new()
	objects.name = "Placements"
	target.add_child(objects)
	objects.owner = target
	for entry in source.placements():
		var prop = Node2D.new()
		prop.set_script(Placement)
		prop.name = entry.name
		objects.add_child(prop)
		prop.owner = target
		for key in ["gameplay_id","model_kind","display_name","interaction_kind","entrance_id","entrance_target","entrance_enabled"]:
			prop.set(key,entry.get(key))
		prop.source_path = str(source.get_path_to(entry))
		prop.logical_anchor = entry.map_position(source)
		prop.interaction_point = entry.interaction_position(source)
		prop.collision_parts = entry.map_collision_parts(source)
		prop.round_collision = entry.map_round_collision(source)
		if not Art.supports(entry.model_kind):
			unresolved.append(prop.source_path + ":" + entry.model_kind)
			continue
		var art = Art.make(entry.model_kind)
		var texture: Texture2D = art.asset
		if art.use_outdoor_art and Outdoor.ITEMS.has(texture.resource_path): texture = Outdoor.ITEMS[texture.resource_path]
		var footprint: Vector2 = Vector2(art.pixel_size)
		var frame_grid = Vector2i(Vector2(texture.get_size()) / footprint)
		var transform: Transform3D = entry.layout_transform(source)
		var size = Vector2(transform.basis.x.length(),transform.basis.z.length())
		# The old billboard used horizontal scale uniformly, not ground depth scaling.
		size = Vector2.ONE * size.x
		var baked = texture.get_image()
		baked.decompress()
		var frame_size = Vector2i((footprint * size).round()).max(Vector2i.ONE)
		baked.resize(frame_size.x * frame_grid.x,frame_size.y * frame_grid.y,Image.INTERPOLATE_NEAREST)
		var sprite = Sprite2D.new()
		sprite.name = "Visual"
		var key = (texture.resource_path + str(frame_size) + str(frame_grid)).sha256_text()
		var texture_path = "res://art/export/native-2d/" + key + ".res"
		if not textures.has(key):
			DirAccess.make_dir_recursive_absolute("res://art/export/native-2d")
			ResourceSaver.save(ImageTexture.create_from_image(baked),texture_path)
			textures[key] = load(texture_path)
		sprite.texture = textures[key]
		sprite.centered = false
		sprite.region_enabled = frame_grid != Vector2i.ONE
		sprite.region_rect = Rect2(Vector2.ZERO,Vector2(frame_size))
		sprite.offset = (Coordinates.canvas(prop.logical_anchor) - art.foot * size).round()
		sprite.set_meta("frame_grid",frame_grid)
		sprite.set_meta("frame_size",frame_size)
		prop.add_child(sprite)
		sprite.owner = target
		art.free()
	target.set_meta("unresolved_assets",unresolved)
	target.set_meta("source_scene","res://scenes/plaza.tscn")
	DirAccess.make_dir_recursive_absolute("res://scenes/native_2d")
	var packed = PackedScene.new()
	var result = packed.pack(target)
	if result == OK: result = ResourceSaver.save(packed,OUTPUT)
	print("NATIVE_2D_CITY placements=",objects.get_child_count()," unresolved=",unresolved)
	target.free()
	source.free()
	quit(0 if result == OK else 1)
