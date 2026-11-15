@tool
extends Marker2D
## Outdoor sun control. Move SunPosition in the 2D editor; save this scene to apply.
const Shadows = preload("res://scripts/native_2d_sunlight.gd")
@export_category("Sunlight")
@export var sun_enabled: bool = true
## Height above the reference ground in source pixels. Higher means shorter shadows.
@export_range(128.0, 8192.0, 16.0, "or_greater") var sun_height: float = 1800.0
@export_range(0.0, 1.0, 0.01) var shadow_opacity: float = 0.26
## Preview only; does not disable sunlight in the game.
@export var editor_preview: bool = true
var preview: Node2D
var refresh_age: float = 0.0
var wall_sources: Dictionary = {}

func projected_up() -> Vector2:
	var marker := get_node_or_null("SunPosition") as Node2D
	if marker == null: return Vector2(-640, 120) / maxf(128.0, sun_height)
	# Treat the saved marker as a distant sun: one direction for the entire map.
	var up := (marker.global_position - global_position) / maxf(128.0, sun_height)
	# A side-on sun still needs a thin floor silhouette, not a singular transform.
	if absf(up.y) < 0.04: up.y = 0.04 if up.y >= 0.0 else -0.04
	return up

func _ready() -> void:
	set_process(Engine.is_editor_hint())

func _process(delta: float) -> void:
	if not Engine.is_editor_hint(): return
	refresh_age += delta
	if refresh_age < 0.15: return
	refresh_age = 0.0
	queue_redraw()
	var layout := get_parent() as Node2D
	if layout == null or not layout.has_method("placements"): return
	if not is_instance_valid(preview):
		preview = Shadows.new()
		preview.name = "_SunShadowPreview"
		# No owner: these temporary silhouettes are never saved into the scene.
		add_child(preview)
		preview.configure(layout, self)
	var entries: Array[Dictionary] = []
	var living_walls: Dictionary = {}
	_collect_preview(layout, layout, entries, living_walls)
	for key in wall_sources.keys():
		if not living_walls.has(key):
			if is_instance_valid(wall_sources[key]): wall_sources[key].queue_free()
			wall_sources.erase(key)
	var actors: Array[Node2D] = []
	preview.sync(entries, actors, editor_preview and sun_enabled, false)

func _draw() -> void:
	if not Engine.is_editor_hint(): return
	var marker := get_node_or_null("SunPosition") as Node2D
	if marker == null: return
	var point := to_local(marker.global_position)
	var color := Color(1.0, 0.78, 0.30, 0.9)
	draw_line(Vector2.ZERO, point, Color(color, 0.45), 2.0)
	draw_arc(point, 26.0, 0, TAU, 32, color, 2.0)
	for i in range(8):
		var ray := Vector2.from_angle(i * TAU / 8.0)
		draw_line(point + ray * 33, point + ray * 45, color, 2.0)
	# Arrow shows where the shadow of a 300px object will end.
	var end := -projected_up() * 300.0
	draw_line(Vector2.ZERO, end, color, 3.0)
	if end.length() > 1.0:
		var direction := end.normalized()
		draw_line(end, end - direction.rotated(0.5) * 18, color, 3.0)
		draw_line(end, end - direction.rotated(-0.5) * 18, color, 3.0)

func _collect_preview(container: Node, layout: Node2D, entries: Array[Dictionary], living_walls: Dictionary) -> void:
	for node in container.get_children():
		# Never feed our generated silhouettes back into the caster collection.
		if node == self: continue
		if node is Sprite2D and node.texture != null:
			entries.append({"sprite": node, "root": layout})
		if node is TileMapLayer and node.has_method("prepare_runtime_visuals"):
			_collect_wall_sources(node, layout, entries, living_walls)
		_collect_preview(node, layout, entries, living_walls)

func _collect_wall_sources(layer: TileMapLayer, layout: Node2D, entries: Array[Dictionary], living: Dictionary) -> void:
	if not layer.enabled or layer.tile_set == null: return
	for cell in layer.get_used_cells():
		var atlas := layer.tile_set.get_source(layer.get_cell_source_id(cell)) as TileSetAtlasSource
		var data := layer.get_cell_tile_data(cell)
		if atlas == null or data == null: continue
		var key := str(layer.get_instance_id()) + ":" + str(cell)
		living[key] = true
		if not wall_sources.has(key):
			var source := Sprite2D.new()
			source.name = "_WallShadowSource"
			source.centered = false
			# Sampleable geometry only: the saved TileMapLayer still draws the wall.
			source.visibility_layer = 0
			preview.add_child(source)
			wall_sources[key] = source
		var source: Sprite2D = wall_sources[key]
		var region := atlas.get_tile_texture_region(layer.get_cell_atlas_coords(cell))
		var texture := source.texture as AtlasTexture
		if texture == null:
			texture = AtlasTexture.new()
			source.texture = texture
		texture.atlas = atlas.texture
		texture.region = Rect2(region)
		source.global_transform = layer.global_transform * Transform2D(0.0, layer.map_to_local(cell))
		source.offset = -Vector2(region.size) * 0.5 - Vector2(data.texture_origin)
		source.flip_h = data.flip_h
		source.flip_v = data.flip_v
		source.modulate = data.modulate
		source.visible = layer.is_visible_in_tree()
		source.set_meta("casts_sun_shadow", bool(layer.get_meta("casts_sun_shadow", true)))
		entries.append({"sprite": source, "root": layout})