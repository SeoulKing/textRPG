@tool
extends Node2D
## Sunlight from front-left; silhouettes extend right and slightly back.
const FOUNTAIN_SHADOW = preload("res://scripts/fountain_sun_shadow.gd")
const SHADOW_SHADER = preload("res://art/resources/native_2d_sun_shadow.gdshader")
const PROJECTED_UP = Vector2(-640, 120) / 1800.0
const POSE_PARAMETERS = ["avatar_texture", "sheet_grid", "frame_cell", "sprite_lift", "opacity", "hurt_offset", "hurt_angle"]
var outdoor_root: Node2D
var sun_settings: Node2D
var shadows: Dictionary = {}
var alpha_masks: Dictionary = {}
var ground_rows: Dictionary = {}
var fountain_masks: Dictionary = {}

func configure(root: Node2D, settings: Node2D) -> void:
	outdoor_root = root
	sun_settings = settings

func floor_projection(foot: Vector2) -> Transform2D:
	var up: Vector2 = sun_settings.projected_up() if is_instance_valid(sun_settings) else PROJECTED_UP
	var projection := Transform2D(Vector2.RIGHT, up, Vector2.ZERO)
	projection.origin = foot - projection.basis_xform(foot)
	return projection

func sync(entries: Array[Dictionary], actors: Array[Node2D], enabled: bool, dusk: bool) -> void:
	enabled = enabled and (sun_settings.sun_enabled if is_instance_valid(sun_settings) else true)
	visible = enabled
	# Directional silhouettes already meet the soles; avoid a second dark oval.
	for actor in actors:
		if not is_instance_valid(actor): continue
		var contact := actor.get_node_or_null("ContactShadow") as CanvasItem
		if contact != null: contact.visible = not enabled
	if not enabled: return
	var living: Dictionary = {}
	for entry in entries:
		if entry.root != outdoor_root: continue
		if not is_instance_valid(entry.sprite): continue
		if not casts_shadow(entry.sprite): continue
		_sync_sprite(entry.sprite, null, dusk, living)
	for actor in actors:
		if not is_instance_valid(actor): continue
		var art := actor.get("art") as Sprite2D
		var pose_material := actor.get("sprite_material") as ShaderMaterial
		if art == null:
			art = actor.get("sprite") as Sprite2D
			pose_material = actor.material as ShaderMaterial
		if art == null or not casts_shadow(art): continue
		_sync_sprite(art, pose_material, dusk, living)
	for id in shadows.keys():
		if not living.has(id):
			shadows[id].queue_free()
			shadows.erase(id)
			fountain_masks.erase(id)

func _sync_sprite(source: Sprite2D, pose_material: ShaderMaterial, dusk: bool, living: Dictionary) -> void:
	var id := source.get_instance_id()
	living[id] = true
	if not shadows.has(id):
		var silhouette := Sprite2D.new()
		silhouette.name = "SunShadow"
		silhouette.z_as_relative = false
		# All floor layers end at -37; silhouettes stay below scenery and actors.
		silhouette.z_index = -19
		silhouette.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		var shadow_material := ShaderMaterial.new()
		shadow_material.shader = SHADOW_SHADER
		silhouette.material = shadow_material
		add_child(silhouette)
		shadows[id] = silhouette
	var shadow: Sprite2D = shadows[id]
	shadow.visible = source.is_visible_in_tree() and source.texture != null
	if not shadow.visible: return
	shadow.texture = source.texture
	shadow.centered = source.centered
	shadow.offset = source.offset
	shadow.region_enabled = source.region_enabled
	shadow.region_rect = source.region_rect
	shadow.region_filter_clip_enabled = true
	shadow.hframes = source.hframes
	shadow.vframes = source.vframes
	shadow.frame = source.frame
	shadow.flip_h = source.flip_h
	shadow.flip_v = source.flip_v
	shadow.modulate = Color(1, 1, 1, source.modulate.a * source.self_modulate.a)
	var source_transform := global_transform.affine_inverse() * source.global_transform
	# The visible sole/base is the projection pivot, never transparent canvas padding.
	var foot := source_transform * Vector2(0, _ground_line(source, pose_material))
	shadow.transform = floor_projection(foot) * source_transform
	var placement := source.get_parent()
	if pose_material == null and placement != null and placement.get("model_kind") == "fountain":
		# Keep the registered basin center (sprite origin), not its frontmost pixel.
		var up: Vector2 = sun_settings.projected_up() if is_instance_valid(sun_settings) else PROJECTED_UP
		var local_up := source_transform.basis_xform_inv(up * source_transform.y.length())
		if not fountain_masks.has(id) or not fountain_masks[id].up.is_equal_approx(local_up):
			var built_proxy: Dictionary = FOUNTAIN_SHADOW.build(local_up)
			built_proxy["up"] = local_up
			fountain_masks[id] = built_proxy
		var proxy: Dictionary = fountain_masks[id]
		shadow.texture = proxy.texture
		shadow.centered = false
		shadow.offset = proxy.offset
		shadow.region_enabled = false
		shadow.hframes = 1
		shadow.vframes = 1
		shadow.frame = 0
		shadow.flip_h = false
		shadow.flip_v = false
		shadow.transform = source_transform
	var shadow_material: ShaderMaterial = shadow.material
	shadow_material.set_shader_parameter("atlas_actor", pose_material != null)
	var strength: float = sun_settings.shadow_opacity if is_instance_valid(sun_settings) else 0.26
	shadow_material.set_shader_parameter("shadow_strength", strength * (0.62 if dusk else 1.0))
	if pose_material != null:
		for parameter in POSE_PARAMETERS:
			shadow_material.set_shader_parameter(parameter, pose_material.get_shader_parameter(parameter))

func _ground_line(source: Sprite2D, pose_material: ShaderMaterial) -> float:
	# Live skeleton viewport pixels change every frame. Its logical foot is
	# explicit, so no GPU readback or first-pose alpha cache is needed.
	if bool(source.get_meta("dynamic_character", false)):
		return float(source.get_meta("character_ground_y", 0.0))
	var texture: Texture2D = source.texture
	var frame_rect := Rect2i(Vector2i.ZERO, Vector2i(texture.get_size()))
	if pose_material != null:
		texture = pose_material.get_shader_parameter("avatar_texture")
		var grid: Vector2 = pose_material.get_shader_parameter("sheet_grid")
		var cell: Vector2 = pose_material.get_shader_parameter("frame_cell")
		var frame_size := Vector2(texture.get_size()) / grid
		frame_rect = Rect2i(Vector2i(cell * frame_size), Vector2i(frame_size))
	else:
		if source.region_enabled: frame_rect = Rect2i(source.region_rect)
		var cell_size := Vector2i(Vector2(frame_rect.size) / Vector2(source.hframes, source.vframes))
		frame_rect = Rect2i(frame_rect.position + source.frame_coords * cell_size, cell_size)
	var key := str(texture.get_instance_id()) + ":" + str(frame_rect) + ":" + str(source.flip_v)
	if not ground_rows.has(key):
		if not alpha_masks.has(texture):
			var image := texture.get_image()
			if image == null or image.is_empty(): return source.get_rect().end.y
			if image.is_compressed():
				if image.decompress() != OK: return source.get_rect().end.y
			var mask := BitMap.new()
			mask.create_from_image_alpha(image, 0.5)
			alpha_masks[texture] = mask
		var mask: BitMap = alpha_masks[texture]
		var mask_size := mask.get_size()
		var bottom := frame_rect.size.y
		var found := false
		# Ignore translucent painted contact shadows; retain the solid base/soles.
		for row in range(frame_rect.size.y - 1, -1, -1):
			var y := frame_rect.position.y + (frame_rect.size.y - 1 - row if source.flip_v else row)
			for x in range(frame_rect.position.x, frame_rect.end.x):
				if x < 0 or y < 0 or x >= mask_size.x or y >= mask_size.y: continue
				if mask.get_bitv(Vector2i(x, y)):
					bottom = row + 1
					found = true
					break
			if found: break
		ground_rows[key] = float(bottom) / maxf(1.0, frame_rect.size.y)
	var draw_rect := source.get_rect()
	return draw_rect.position.y + draw_rect.size.y * float(ground_rows[key])
func casts_shadow(source: Sprite2D) -> bool:
	if not is_instance_valid(source) or source.z_index <= -20: return false
	# Any physical world sprite casts by default, including unknown future kinds.
	var node: Node = source
	while node != null:
		if node.has_meta("casts_sun_shadow") and not bool(node.get_meta("casts_sun_shadow")): return false
		var setting: Variant = node.get("casts_sun_shadow")
		if setting != null and not bool(setting): return false
		if node == outdoor_root: break
		node = node.get_parent()
	return true