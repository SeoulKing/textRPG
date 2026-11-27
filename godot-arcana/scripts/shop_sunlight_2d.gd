@tool
extends Node2D
## One window field shared by real lighting, painted-light compensation and shadows.
const FLOOR_SIZE = Vector2(896, 576)
const SUN_COLOR = Color(1.0, 0.83, 0.52)
const SUN_ENERGY = 0.65
const FLOOR_SHADER = preload("res://art/resources/shop_sun_floor.gdshader")
const SHADOW_SHADER = preload("res://art/resources/shop_sun_shadow.gdshader")
var sunlight: PointLight2D
var floor_material: ShaderMaterial
var shadow_material: ShaderMaterial
var shadows: Dictionary = {}
var field: ImageTexture

func setup(floor_layer: TileMapLayer) -> void:
	# Sample in floor coordinates, including erased cells; never light outside the room.
	var image := Image.create(224, 144, false, Image.FORMAT_RGBA8)
	for y in range(144):
		for x in range(224):
			var point := Vector2(x * 4 + 2, y * 4 + 2)
			var cell := floor_layer.local_to_map(point)
			var strength := 0.0
			if floor_layer.get_cell_source_id(cell) != -1:
				var u := (point.x - 18.0) / 326.0
				var v := (point.y - 145.0 - (point.x - 18.0) * 0.62) / 122.0
				var edge := smoothstep(0.0, 0.045, u) * (1.0 - smoothstep(0.82, 1.0, u))
				edge *= smoothstep(0.0, 0.055, v) * (1.0 - smoothstep(0.88, 1.0, v))
				var bars := 1.0 - 0.82 * (1.0 - smoothstep(0.018, 0.035, absf(u - 0.19)))
				bars *= 1.0 - 0.8 * (1.0 - smoothstep(0.025, 0.055, absf(v - 0.49)))
				strength = edge * bars
			image.set_pixel(x, y, Color(strength, strength, strength, 1.0))
	field = ImageTexture.create_from_image(image)
	floor_material = ShaderMaterial.new()
	floor_material.shader = FLOOR_SHADER
	floor_material.set_shader_parameter("sun_field", field)
	floor_material.set_shader_parameter("sun_color", Vector3(SUN_COLOR.r, SUN_COLOR.g, SUN_COLOR.b))
	floor_material.set_shader_parameter("sun_energy", SUN_ENERGY)
	floor_layer.material = floor_material
	shadow_material = ShaderMaterial.new()
	shadow_material.shader = SHADOW_SHADER
	shadow_material.set_shader_parameter("sun_field", field)
	sunlight = PointLight2D.new()
	sunlight.name = "WindowSunlight"
	sunlight.texture = field
	sunlight.texture_scale = 4.0
	sunlight.position = FLOOR_SIZE * 0.5
	sunlight.color = SUN_COLOR
	sunlight.energy = SUN_ENERGY
	# Finite floor-projected silhouettes replace the infinite 2D occluder extrusion.
	sunlight.shadow_enabled = false
	add_child(sunlight)

func sync(actors: Array[Sprite2D], effects: bool) -> void:
	sunlight.enabled = effects
	floor_material.set_shader_parameter("sun_enabled", effects)
	var living: Dictionary = {}
	for actor in actors:
		if not is_instance_valid(actor): continue
		var id := actor.get_instance_id()
		living[id] = true
		if not shadows.has(id):
			var silhouette := Sprite2D.new()
			silhouette.name = "SunShadow"
			silhouette.centered = false
			silhouette.z_as_relative = false
			silhouette.z_index = -19
			silhouette.material = shadow_material
			silhouette.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
			add_child(silhouette)
			shadows[id] = silhouette
		var shadow: Sprite2D = shadows[id]
		shadow.visible = effects and actor.visible and actor.texture != null
		shadow.texture = actor.texture
		shadow.offset = actor.offset
		shadow.region_enabled = actor.region_enabled
		shadow.region_rect = actor.region_rect
		shadow.region_filter_clip_enabled = true
		shadow.flip_h = actor.flip_h
		shadow.flip_v = actor.flip_v
		shadow.modulate.a = actor.modulate.a * actor.self_modulate.a
		var foot := to_local(actor.to_global(Vector2.ZERO))
		# Frame foot remains fixed while the head projects away from the left window.
		shadow.transform = Transform2D(Vector2.RIGHT, preload("res://scripts/native_2d_sunlight.gd").PROJECTED_UP, foot)
	for id in shadows.keys():
		if not living.has(id):
			shadows[id].queue_free()
			shadows.erase(id)
