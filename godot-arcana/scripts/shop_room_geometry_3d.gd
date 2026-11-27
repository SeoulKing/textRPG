@tool
extends Node3D
## Builds the shop meshes and physics from its authored floor, doorway and furniture.
signal astra_debug_mode_changed(mode: AstraLook.DebugMode)

const Layout = preload("res://scripts/shop_layout_2d.gd")
const AstraLook = preload("res://scripts/shop_astra_look.gd")
const CounterScene = preload("res://scenes/props/shop/furniture/counter_face_3d.tscn")
const WINDOW_FRAME_ASSET = preload("res://art/source/shop-oak-planks-v2/west-window-frame.glb")
const OAK_PLANKS = preload("res://art/source/shop-oak-planks-v2/oak-plank-floor.glb")
const OAK_PLANK_SHADER = preload("res://art/resources/shop_oak_planks.gdshader")
const EDGE_CUTOUT_NORMALS = preload("res://art/resources/tutorial_cutout_normals.gdshader")
const PIXEL_SHADING = preload("res://art/resources/arcana_pixel_shading.gdshader")
const LAMP_GLOW_SHADER = preload("res://art/resources/shop_lamp_glow.gdshader")
const LIGHT_VOLUME_SHADER = preload("res://art/resources/shop_light_volume.gdshader")
const ROOM_LIGHT_SHADER = preload("res://art/resources/shop_room_lighting.gdshader")
const CABINET_MODELS := {
	"herb-cabinet": preload("res://art/source/shop-cabinets-smooth-v1/herb-cabinet.glb"),
	"potion-cabinet": preload("res://art/source/shop-cabinets-smooth-v1/potion-cabinet.glb"),
	"travel-cabinet": preload("res://art/source/shop-cabinets-3d-v3/travel-cabinet.glb"),
}
const CABINET_FACE_ART := {
	"herb-cabinet": preload("res://art/export/shop-cabinet-face-v2/herb-cabinet.png"),
	"potion-cabinet": preload("res://art/export/shop-cabinet-face-v2/potion-cabinet.png"),
	"travel-cabinet": preload("res://art/export/shop-cabinet-face-v2/travel-cabinet.png"),
}
const REAR_WALL_ART = preload("res://art/export/shop-rear-wall-face-v1/upper-wall.png")
const OUTLINE_SHADER = preload("res://art/resources/shop_furniture_outline.gdshader")
const WALL_DEPTH := 0.25
const FLOOR_DEPTH := 0.2
const SUN_ROOF_LAYER := 1 << 18
const PLASTER := Color("ead8b4")
const NAVY := Color("30374a")
const WALNUT := Color("493328")
const OAK := Color("987150")
const BRASS := Color("c19a60")
const WALL_CAP := Color("bda684")
const TOP_OVERHANG := {"potion-island": 8, "travel-island": 9}
const FRONT_PIXELS_PER_UNIT := Layout.PPU * sqrt(0.5)
@export var authored_room: PackedScene
@onready var wooden_crate: Node3D = $WoodenCrate_Test
@onready var split_room := get_node_or_null("AuthoredRoom") as Node3D

var floor_bounds := Rect2()
var interaction_bounds: Dictionary = {}
var authored_scene_active := false
var astra_active := false
var authored_sun: DirectionalLight3D
var use_approved_lighting := false
var _lamp_lights: Array[OmniLight3D] = []
var _pixel_lighting := false
var _generated: Node3D
var _body: StaticBody3D
var _materials: Dictionary = {}
var _room_light_materials: Dictionary = {}
var _floor_edge_proxy: ShaderMaterial
var _face_edge_proxies: Dictionary[Texture2D, ShaderMaterial] = {}
var _astra_look: AstraLook
var _astra_debug_mode := AstraLook.DebugMode.BEAUTY


func _ready() -> void:
	if not use_approved_lighting:
		_apply_crate_palette(wooden_crate, {})


static func layout_signature(layout: Dictionary) -> String:
	var floor_cells: Array = layout.get("floor", {}).keys()
	floor_cells.sort()
	var objects: Array[String] = []
	for entry: Dictionary in layout.get("entries", []):
		objects.append("%s@%.4f,%.4f" % [entry.id, entry.start.x, entry.start.y])
	objects.sort()
	return JSON.stringify([floor_cells, objects])


func rebuild(layout: Dictionary) -> void:
	if is_instance_valid(_generated):
		remove_child(_generated)
		_generated.queue_free()
	floor_bounds = Rect2()
	interaction_bounds.clear()
	_materials.clear()
	_room_light_materials.clear()
	_floor_edge_proxy = null
	_face_edge_proxies.clear()
	authored_scene_active = false
	astra_active = false
	_astra_look = null
	authored_sun = null
	_lamp_lights.clear()
	var floor_rects := _floor_rectangles(layout.get("floor", {}))
	if floor_rects.is_empty():
		if split_room != null:
			split_room.hide()
		if not Engine.is_editor_hint():
			wooden_crate.hide()
		return

	_generated = _group(self, "Structure")
	_body = StaticBody3D.new()
	_body.name = "ShopCollision"
	_generated.add_child(_body)
	var authored: Node3D
	if split_room != null:
		var use_split_room: bool = authored_room == null \
			and split_room.get_meta("layout_signature_hash") == layout_signature(layout).sha256_text()
		split_room.visible = use_split_room
		if use_split_room:
			authored = split_room
		elif authored_room == null:
			push_warning("The saved 3D shop parts do not match the 2D layout; using the generated layout.")
	if authored == null:
		authored = _instantiate_authored_room(layout)
	authored_scene_active = authored != null
	wooden_crate.visible = not astra_active and (authored_scene_active or Engine.is_editor_hint())
	if authored_scene_active and authored != split_room:
		_generated.add_child(authored)
	var floor_node := _group(_generated, "Floor") if not authored_scene_active else null
	var floor_mask: Texture2D
	if not astra_active:
		floor_mask = _floor_mask(layout.get("floor", {}))
	_build_floor(floor_node, floor_rects, floor_mask)
	if astra_active:
		_configure_astra_room(authored)
		_astra_look = AstraLook.new()
		_astra_look.set_debug_mode(_astra_debug_mode)
		_astra_look.apply(authored)
	elif authored_scene_active:
		_configure_authored_room(authored, floor_mask)
		_apply_lamp_lighting()

	var walls := _group(_generated, "Walls") if not authored_scene_active else null
	var furniture := _group(_generated, "Furniture") if not authored_scene_active else null
	var door := Rect2()
	for entry: Dictionary in layout.get("entries", []):
		var spec: Dictionary = entry.spec
		var start: Vector2 = entry.start
		var footprint := Vector2(spec.footprint[0], spec.footprint[1])
		var id: String = entry.id
		match str(spec.kind):
			"door":
				door = Rect2(start, footprint)
			"wall":
				for blocker: Rect2 in entry.collision_rectangles:
					var rect := Rect2(blocker.position / Layout.UNIT, blocker.size / Layout.UNIT)
					var height := float(spec.height)
					_wall(walls, rect, height, id)
					_collider(rect, 0.0, height)
			"furniture":
				var rect := Rect2(start, footprint)
				var height := float(spec.height)
				if authored_scene_active:
					for blocker: Rect2 in entry.collision_rectangles:
						_collider(Rect2(blocker.position / Layout.UNIT, blocker.size / Layout.UNIT), 0.0, height)
				else:
					var piece := _build_furniture(furniture, id, spec, rect, height)
					_build_furniture_collision(piece, entry.collision_rectangles, height)
				if spec.has("interaction"):
					interaction_bounds["merchant"] = _bounds(rect, 0.0, height)
	_build_perimeter(walls, door)
	if walls != null:
		_build_sun_room(walls)
	var actor: Rect2 = layout.get("actor_collision", Rect2())
	if actor.has_area():
		_collider(Rect2(actor.position / Layout.UNIT, actor.size / Layout.UNIT), 0.0, 2.2)


func _instantiate_authored_room(layout: Dictionary) -> Node3D:
	if authored_room == null:
		return null
	var room := authored_room.instantiate() as Node3D
	if room == null:
		return null
	var authored_root := room
	if not room.get_meta("extras", {}).has("layout_signature"):
		for child in room.get_children():
			if child is Node3D:
				var extras: Dictionary = child.get_meta("extras", {})
				if extras.has("layout_signature") and str(extras.get("astra_version", "")) == "1":
					authored_root = child
					break
		if authored_root == room:
			for name_candidate: String in ["AstraShop", "ArcanaShop"]:
				var child := room.get_node_or_null(name_candidate) as Node3D
				if child != null:
					authored_root = child
					break
	var metadata: Dictionary = authored_root.get_meta("extras", {})
	var astra_version := str(metadata.get("astra_version", ""))
	if astra_version != "" and astra_version != "1":
		push_warning("Unsupported Astra shop asset version: " + astra_version)
		room.free()
		return null
	if metadata.get("layout_signature") == layout_signature(layout):
		astra_active = astra_version == "1"
		# The signed layout is in the authored root local space. Blender may translate
		# or scale its root when staging the room next to other authoring assets.
		if authored_root != room:
			var into_layout := authored_root.transform.affine_inverse()
			for sibling in room.get_children():
				if sibling is Node3D and sibling != authored_root:
					sibling.transform = into_layout * sibling.transform
		room.transform = Transform3D.IDENTITY
		authored_root.transform = Transform3D.IDENTITY
		return room
	push_warning("The Blender shop uses a different floor or furniture layout; using the Godot-authored layout.")
	room.free()
	return null


func set_astra_debug_mode(mode: AstraLook.DebugMode) -> void:
	_astra_debug_mode = mode
	if _astra_look != null:
		_astra_look.set_debug_mode(mode)
	astra_debug_mode_changed.emit(mode)


func _configure_astra_room(node: Node) -> void:
	var metadata: Dictionary = node.get_meta("extras", {})
	if node is MeshInstance3D:
		if metadata.get("shadow_only", false):
			node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_SHADOWS_ONLY
		elif metadata.get("no_shadow", false):
			node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	elif node is Light3D:
		node.hide()
	for child in node.get_children():
		_configure_astra_room(child)


func _configure_authored_room(node: Node3D, floor_mask: Texture2D) -> void:
	var metadata: Dictionary = node.get_meta("extras", {})
	if node.name == &"WoodenCrate_Test":
		# The crate is placed directly in the Godot scene.
		node.hide()
		return
	if node is MeshInstance3D and node.mesh != null:
		if metadata.get("shadow_only", false):
			node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_SHADOWS_ONLY
			if node.name == &"SunRoof":
				node.layers = SUN_ROOF_LAYER
		elif metadata.get("no_shadow", false):
			node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		for surface in node.mesh.get_surface_count():
			var override: Material = node.get_surface_override_material(surface)
			var imported := node.get_active_material(surface) as BaseMaterial3D
			if override is ShaderMaterial and override.shader in [OAK_PLANK_SHADER, OUTLINE_SHADER, ROOM_LIGHT_SHADER]:
				imported = node.mesh.surface_get_material(surface) as BaseMaterial3D
			if imported == null:
				continue
			var art := imported.albedo_texture if imported.albedo_texture != null else imported.emission_texture
			if metadata.get("oak_floor", false):
				node.set_surface_override_material(surface, _oak_material(floor_mask, imported))
			elif metadata.has("counter_silhouette") and art != null:
				var material := _cutout_face_material(art)
				material.set_shader_parameter("ink_enabled", false)
				var silhouette: Array = metadata.counter_silhouette
				material.set_shader_parameter("counter_silhouette", Vector4(
					silhouette[0], silhouette[1], silhouette[2], silhouette[3]))
				node.set_surface_override_material(surface, material)
			else:
				_configure_lit_surface(node, surface, imported)
	elif node is DirectionalLight3D and metadata.get("shop_light") == "Sun":
		authored_sun = node
		node.hide()
	elif node is OmniLight3D:
		if metadata.get("shop_light") == "OverheadFill":
			node.hide()
		elif metadata.has("godot_glow_radius"):
			# Older imported lights store their Godot units in GLB extras.
			node.light_energy = float(metadata.get("godot_energy", node.light_energy))
			node.omni_range = float(metadata.get("godot_range", node.omni_range))
			node.omni_attenuation = float(metadata.get("godot_attenuation", node.omni_attenuation))
			for effect_name in ["LampGlow", "LampLightVolume"]:
				var effect := node.get_node_or_null(effect_name)
				if effect != null:
					node.remove_child(effect)
					effect.queue_free()
			var glow_radius := float(metadata.get("godot_glow_radius", 0.0))
			if glow_radius > 0.0 and node.light_energy > 0.0:
				_add_lamp_glow(node, glow_radius)
				_add_light_volume(node)
				_lamp_lights.append(node)
	for child in node.get_children():
		if child is Node3D:
			_configure_authored_room(child, floor_mask)


func _apply_crate_palette(node: Node, palette: Dictionary) -> void:
	if node is MeshInstance3D and node.mesh != null:
		for surface in node.mesh.get_surface_count():
			var source := node.get_active_material(surface) as BaseMaterial3D
			if source == null:
				continue
			var material := palette.get(source) as ShaderMaterial
			if material == null:
				material = ShaderMaterial.new()
				material.shader = PIXEL_SHADING
				material.set_shader_parameter("paint", source.albedo_color)
				palette[source] = material
			node.set_surface_override_material(surface, material)
	for child in node.get_children():
		_apply_crate_palette(child, palette)


func _add_lamp_glow(light: OmniLight3D, radius: float) -> void:
	var quad := QuadMesh.new()
	quad.size = Vector2.ONE * radius * 2.0
	var material := ShaderMaterial.new()
	material.shader = LAMP_GLOW_SHADER
	var glow := MeshInstance3D.new()
	glow.name = "LampGlow"
	glow.mesh = quad
	glow.material_override = material
	glow.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	light.add_child(glow)


func _add_light_volume(light: OmniLight3D) -> void:
	var sphere := SphereMesh.new()
	sphere.radius = light.omni_range
	sphere.height = light.omni_range * 2.0
	sphere.radial_segments = 16
	sphere.rings = 8
	var material := ShaderMaterial.new()
	material.shader = LIGHT_VOLUME_SHADER
	material.render_priority = -90
	material.set_shader_parameter("light_tint", light.light_color)
	material.set_shader_parameter("light_radius", light.omni_range)
	material.set_shader_parameter("surface_strength", clampf(light.light_energy * 0.045, 0.0, 0.45))
	material.set_shader_parameter("back_wall_z", floor_bounds.position.y)
	var volume := MeshInstance3D.new()
	volume.name = "LampLightVolume"
	volume.mesh = sphere
	volume.material_override = material
	volume.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	light.add_child(volume)


func set_pixel_lighting(enabled: bool) -> void:
	if _pixel_lighting != enabled:
		_pixel_lighting = enabled
		_apply_lamp_lighting()
		for material: ShaderMaterial in _room_light_materials.values():
			material.set_shader_parameter("stepped_light", enabled)


func lamp_foot() -> Vector3:
	if _lamp_lights.is_empty():
		return Vector3.ZERO
	var fixture := _lamp_lights[0].get_parent() as Node3D
	return fixture.global_position


func _apply_lamp_lighting() -> void:
	var editing := Engine.is_editor_hint()
	var use_legacy_volume := _pixel_lighting and not editing and not use_approved_lighting
	for light in _lamp_lights:
		light.light_cull_mask = 0 if use_legacy_volume else 0xffffffff
		light.get_node("LampLightVolume").visible = use_legacy_volume
		var glow := light.get_node("LampGlow") as MeshInstance3D
		glow.visible = not editing
		glow.material_override.set_shader_parameter("pixel_bands", _pixel_lighting)


func _floor_rectangles(cells: Dictionary) -> Array[Rect2]:
	var occupied: Dictionary = {}
	for key: String in cells:
		var axes := key.split(":")
		occupied[Vector2i(int(axes[0]), int(axes[1]))] = true
	var rectangles: Array[Rect2] = []
	if occupied.is_empty():
		return rectangles
	var cell_bounds := Rect2i(occupied.keys()[0], Vector2i.ONE)
	for cell: Vector2i in occupied:
		cell_bounds = cell_bounds.merge(Rect2i(cell, Vector2i.ONE))
	floor_bounds = Rect2(Layout.ORIGIN + Vector2(cell_bounds.position) * Layout.STEP,
		Vector2(cell_bounds.size) * Layout.STEP)
	if occupied.size() == cell_bounds.get_area():
		rectangles.append(floor_bounds)
		return rectangles

	for y in range(cell_bounds.position.y, cell_bounds.end.y):
		var x := cell_bounds.position.x
		while x < cell_bounds.end.x:
			if not occupied.has(Vector2i(x, y)):
				x += 1
				continue
			var start := x
			while occupied.has(Vector2i(x, y)):
				x += 1
			rectangles.append(Rect2(Layout.ORIGIN + Vector2(start, y) * Layout.STEP,
				Vector2(x - start, 1) * Layout.STEP))
	return rectangles


func _floor_mask(cells: Dictionary) -> Texture2D:
	var cell_dimensions := Vector2i((floor_bounds.size / Layout.STEP).round())
	var cell_origin := Vector2i(((floor_bounds.position - Layout.ORIGIN) / Layout.STEP).round())
	var occupancy := Image.create_empty(cell_dimensions.x, cell_dimensions.y, false, Image.FORMAT_L8)
	for key: String in cells:
		var axes := key.split(":")
		var cell := Vector2i(int(axes[0]), int(axes[1])) - cell_origin
		occupancy.set_pixelv(cell, Color.WHITE)
	return ImageTexture.create_from_image(occupancy)


func _build_floor(parent: Node3D, rectangles: Array[Rect2], floor_mask: Texture2D) -> void:
	for rect in rectangles:
		_box(parent, "Slab", rect, -FLOOR_DEPTH, -0.036, WALNUT)
		_collider(rect, -FLOOR_DEPTH, 0.0)
	if parent == null:
		return

	var source := OAK_PLANKS.instantiate()
	var original := source as MeshInstance3D
	if original == null:
		original = source.find_child("OakPlankFloor", true, false) as MeshInstance3D
	if original == null or original.mesh == null:
		push_error("Missing Blender oak plank mesh")
		source.free()
		return
	var boards := _mesh(parent, "OakPlankFloor", original.mesh, null)
	boards.position = Vector3(floor_bounds.position.x, 0, floor_bounds.position.y)
	boards.scale = Vector3(floor_bounds.size.x / 14.0, 1.0, floor_bounds.size.y / 9.0)
	boards.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	for surface in original.mesh.get_surface_count():
		var imported := original.mesh.surface_get_material(surface) as BaseMaterial3D
		boards.set_surface_override_material(surface, _oak_material(floor_mask, imported))
	source.free()


func _oak_material(floor_mask: Texture2D, source: BaseMaterial3D) -> ShaderMaterial:
	var material := ShaderMaterial.new()
	material.shader = OAK_PLANK_SHADER
	material.set_shader_parameter("floor_cells", floor_mask)
	material.set_shader_parameter("floor_origin", floor_bounds.position)
	material.set_shader_parameter("floor_size", floor_bounds.size)
	if use_approved_lighting:
		if _floor_edge_proxy == null:
			_floor_edge_proxy = ShaderMaterial.new()
			_floor_edge_proxy.shader = EDGE_CUTOUT_NORMALS
			_floor_edge_proxy.set_shader_parameter("use_floor_mask", true)
			_floor_edge_proxy.set_shader_parameter("coverage_mask", floor_mask)
			_floor_edge_proxy.set_shader_parameter("floor_origin", floor_bounds.position)
			_floor_edge_proxy.set_shader_parameter("floor_size", floor_bounds.size)
		material.set_meta("arcana_edge_proxy_material", _floor_edge_proxy)
	material.set_shader_parameter("use_grain", source != null and source.albedo_texture != null)
	if source != null:
		material.set_shader_parameter("base_color", source.albedo_color)
		material.set_shader_parameter("roughness", source.roughness)
		if source.albedo_texture != null:
			material.set_shader_parameter("plank_grain", source.albedo_texture)
	return material


func _build_sun_room(parent: Node3D) -> void:
	var x0 := floor_bounds.position.x
	var z0 := floor_bounds.position.y
	# The roof casts shade while the orthographic camera looks into the cutaway.
	var roof := _shadow_box(parent, "SunRoof", Rect2(x0 - 0.10, z0 - 8.0,
		floor_bounds.size.x + 8.0, floor_bounds.size.y + 16.0), 3.5, 3.65)
	roof.layers = SUN_ROOF_LAYER


func _shadow_box(parent: Node3D, label: String, rect: Rect2, base: float, top: float) -> MeshInstance3D:
	var bounds := _bounds(rect, base, top)
	var box := BoxMesh.new()
	box.size = bounds.size
	var instance := _mesh(parent, label, box, _color_material(WALNUT))
	instance.position = bounds.get_center()
	instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_SHADOWS_ONLY
	return instance

func _build_perimeter(parent: Node3D, door: Rect2) -> void:
	var x0 := floor_bounds.position.x
	var x1 := floor_bounds.end.x
	var z0 := floor_bounds.position.y
	var z1 := floor_bounds.end.y
	var t := WALL_DEPTH
	_boundary_wall(parent, Rect2(x0 - t, z0 - t, floor_bounds.size.x + 2.0 * t, t), 3.5, "RearWall")
	_build_west_window_wall(parent, Rect2(x0 - t, z0, t, floor_bounds.size.y))
	_boundary_wall(parent, Rect2(x1, z0, t, floor_bounds.size.y), 0.48, "RightWall")
	if not door.has_area():
		_boundary_wall(parent, Rect2(x0 - t, z1, floor_bounds.size.x + 2.0 * t, t), 0.24, "FrontWall")
		return

	var left := clampf(door.position.x, x0, x1)
	var right := clampf(door.end.x, left, x1)
	_boundary_wall(parent, Rect2(x0 - t, z1, left - x0 + t, t), 0.24, "FrontLeftWall")
	_boundary_wall(parent, Rect2(right, z1, x1 - right + t, t), 0.24, "FrontRightWall")
	for post_x: float in [left - t, right]:
		var post := Rect2(post_x, z1, t, t)
		_box(parent, "DoorPost", post, 0.24, 0.79, OAK)
		_box(parent, "DoorPostCap", post, 0.79, 0.85, BRASS)
		_collider(post, 0.24, 0.85)
	var landing := Rect2(left, z1, right - left, t)
	_box(parent, "StoneThreshold", landing, -FLOOR_DEPTH, 0.0, PLASTER)
	_collider(landing, -FLOOR_DEPTH, 0.0)
	interaction_bounds["exit"] = _bounds(Rect2(left, door.position.y, right - left,
		z1 + t - door.position.y), 0.0, 0.12)


func _build_west_window_wall(parent: Node3D, rect: Rect2) -> void:
	_collider(rect, 0.0, 0.48)
	if parent == null:
		return
	var wall := _group(parent, "WestWall")
	_wall(wall, rect, 0.48, "WestCutaway")
	var width := minf(2.7, rect.size.y * 0.6)
	var center := rect.position.y + rect.size.y * 0.39
	var opening_start := center - width * 0.5
	var opening_end := center + width * 0.5
	var bottom := 1.0
	var top := 3.2
	var opening := Rect2(rect.position.x, opening_start, rect.size.x, width)
	_shadow_box(wall, "WestBelowWindow", rect, 0.0, bottom)
	_shadow_box(wall, "WestAboveWindow", rect, top, 3.5)
	_shadow_box(wall, "WestNorthJamb", Rect2(rect.position, Vector2(rect.size.x,
		opening_start - rect.position.y)), bottom, top)
	_shadow_box(wall, "WestSouthJamb", Rect2(rect.position.x, opening_end, rect.size.x,
		rect.end.y - opening_end), bottom, top)

	var source := WINDOW_FRAME_ASSET.instantiate()
	var original := source as MeshInstance3D
	if original == null:
		original = source.find_child("WindowFrame", true, false) as MeshInstance3D
	if original != null and original.mesh != null:
		var frame := _mesh(wall, "WestWindowFrame", original.mesh, null)
		frame.position = Vector3(rect.get_center().x, 0.0, center)
		frame.scale.z = width / 3.0
	else:
		push_error("Missing Blender window frame")
	source.free()

	var sill := opening.grow_individual(0.035, 0.06, 0.16, 0.06)
	_box(wall, "WestWindowSill", sill, 0.91, bottom + 0.015, OAK)
	_box(wall, "WestWindowSillTrim", sill, bottom + 0.015, bottom + 0.035, BRASS)


func _boundary_wall(parent: Node3D, rect: Rect2, height: float, label: String) -> void:
	_wall(parent, rect, height, label)
	_collider(rect, 0.0, height)


func _wall(parent: Node3D, rect: Rect2, height: float, label: String) -> void:
	if parent == null:
		return
	var wall := _group(parent, label)
	var rail_y := minf(height * 0.55, 0.73)
	var cap_y := height - minf(0.055, height * 0.14)
	_box(wall, "Wainscot", rect, 0.0, rail_y, NAVY)
	_box(wall, "BrassRail", rect, rail_y, rail_y + 0.045, BRASS)
	_box(wall, "Plaster", rect, rail_y + 0.045, cap_y, PLASTER)
	_box(wall, "Cap", rect, cap_y, height, WALL_CAP)
	if label == "RearWall":
		var front := rect.end.y + 0.001
		var base := rail_y + 0.045
		var material := _texture_material(REAR_WALL_ART)
		material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		var surface := _art_face(wall, "LimestoneFront", material, REAR_WALL_ART.get_size(),
			Rect2(Vector2.ZERO, REAR_WALL_ART.get_size()), [
			Vector3(rect.position.x, cap_y, front), Vector3(rect.end.x, cap_y, front),
			Vector3(rect.end.x, base, front), Vector3(rect.position.x, base, front),
		], Vector3.BACK)
		surface.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF


func _build_furniture(parent: Node3D, id: String, spec: Dictionary, rect: Rect2, height: float) -> Node3D:
	if id == "counter":
		var counter := CounterScene.instantiate() as Node3D
		counter.name = "Counter"
		var center := rect.get_center()
		counter.position = Vector3(center.x, 0, center.y)
		counter.set("shop_outline", false)
		counter.get_node("Body").free()
		parent.add_child(counter)
		return counter

	var cabinet_scene: PackedScene = CABINET_MODELS.get(id)
	if cabinet_scene != null:
		var cabinet := cabinet_scene.instantiate() as Node3D
		cabinet.name = id.to_pascal_case()
		cabinet.position = Vector3(rect.position.x, 0, rect.position.y)
		cabinet.scale = Vector3(rect.size.x / 2.0, height / 3.0, rect.size.y / 0.5)
		parent.add_child(cabinet)
		_configure_cabinet_materials(cabinet)
		return cabinet

	var piece := _group(parent, id.to_pascal_case())
	piece.position = Vector3(rect.position.x, 0, rect.position.y)
	var cabinet_art: Texture2D = CABINET_FACE_ART.get(id)
	var art := cabinet_art
	if art == null:
		art = load(str(spec.file)) as Texture2D
	if art == null:
		push_error("Missing shop furniture art: " + str(spec.file))
		return piece

	var image_size := art.get_size()
	var width := rect.size.x
	var depth := rect.size.y
	var geometry: Dictionary = spec.get("geometry", {})
	if cabinet_art != null:
		# The upper band is an orthographic top view, at 64 pixels per world unit.
		geometry = {"roofBackY": 0, "roofFrontY": roundi(depth * Layout.PPU), "baseline": roundi(image_size.y)}
	if geometry.is_empty():
		# Foliage has a transparent front silhouette in the approved source.
		var foot := Vector2(spec.foot[0], spec.foot[1])
		var left := width * 0.5 - foot.x / Layout.PPU
		var right := left + image_size.x / Layout.PPU
		var top := foot.y / FRONT_PIXELS_PER_UNIT
		var bottom := (foot.y - image_size.y) / FRONT_PIXELS_PER_UNIT
		var region := Rect2(Vector2.ZERO, image_size)
		var material := _outline_material(art, region, Vector4.ONE)
		_art_face(piece, "Front", material, image_size, region, [
			Vector3(left, top, depth), Vector3(right, top, depth),
			Vector3(right, bottom, depth), Vector3(left, bottom, depth),
		], Vector3.BACK)
		return piece

	# Apply each registered art band to its matching face.
	var seam := int(geometry.roofFrontY)
	var roof_back := int(geometry.roofBackY)
	var baseline := int(geometry.baseline)
	var overhang := int(TOP_OVERHANG.get(id, 0))
	var back := -depth * float(overhang) / float(seam - roof_back)
	var top_region := Rect2(0, roof_back - overhang, image_size.x, seam - roof_back + overhang)
	var front_region := Rect2(0, seam, image_size.x, baseline - seam)
	_art_face(piece, "Top", _outline_material(art, top_region, Vector4(1, 1, 1, 0)), image_size, top_region, [
		Vector3(0, height, back), Vector3(width, height, back),
		Vector3(width, height, depth), Vector3(0, height, depth),
	], Vector3.UP)
	_art_face(piece, "Front", _outline_material(art, front_region, Vector4(1, 0, 1, 1)), image_size, front_region, [
		Vector3(0, height, depth), Vector3(width, height, depth),
		Vector3(width, 0, depth), Vector3(0, 0, depth),
	], Vector3.BACK)
	return piece


func _configure_cabinet_materials(node: Node) -> void:
	if node is MeshInstance3D:
		var instance := node as MeshInstance3D
		if instance.mesh != null:
			for surface in instance.mesh.get_surface_count():
				var source := instance.get_active_material(surface) as BaseMaterial3D
				if source != null:
					_configure_lit_surface(instance, surface, source)
	for child in node.get_children():
		_configure_cabinet_materials(child)


func _configure_lit_surface(node: MeshInstance3D, surface: int, source: BaseMaterial3D) -> void:
	var stepped := _room_light_material(source) if not use_approved_lighting else null
	if stepped != null:
		node.set_surface_override_material(surface, stepped)
	elif source.albedo_texture != null or source.emission_texture != null:
		var nearest := source.duplicate() as BaseMaterial3D
		nearest.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
		node.set_surface_override_material(surface, nearest)
	elif use_approved_lighting:
		node.set_surface_override_material(surface, source)


func _room_light_material(source: BaseMaterial3D) -> ShaderMaterial:
	# Keep authored cutouts, glass, emissive art and metals on their own shaders.
	if source.shading_mode != BaseMaterial3D.SHADING_MODE_PER_PIXEL \
		or source.transparency != BaseMaterial3D.TRANSPARENCY_DISABLED \
		or source.emission_enabled or source.metallic > 0.0 or source.normal_enabled \
		or source.cull_mode == BaseMaterial3D.CULL_FRONT:
		return null
	var material := _room_light_materials.get(source) as ShaderMaterial
	if material == null:
		material = ShaderMaterial.new()
		material.shader = ROOM_LIGHT_SHADER
		material.set_shader_parameter("paint", source.albedo_color)
		material.set_shader_parameter("use_texture", source.albedo_texture != null)
		if source.albedo_texture != null:
			material.set_shader_parameter("paint_texture", source.albedo_texture)
		material.set_shader_parameter("use_vertex_color", source.vertex_color_use_as_albedo)
		material.set_shader_parameter("cull_back_faces", source.cull_mode == BaseMaterial3D.CULL_BACK)
		material.set_shader_parameter("uv_scale", Vector2(source.uv1_scale.x, source.uv1_scale.y))
		material.set_shader_parameter("uv_offset", Vector2(source.uv1_offset.x, source.uv1_offset.y))
		material.set_shader_parameter("stepped_light", _pixel_lighting)
		_room_light_materials[source] = material
	return material


func _cutout_face_material(art: Texture2D) -> ShaderMaterial:
	var material := ShaderMaterial.new()
	material.shader = OUTLINE_SHADER
	material.set_shader_parameter("face_art", art)
	if use_approved_lighting:
		if not _face_edge_proxies.has(art):
			var proxy := ShaderMaterial.new()
			proxy.shader = EDGE_CUTOUT_NORMALS
			proxy.set_shader_parameter("coverage_mask", art)
			_face_edge_proxies[art] = proxy
		material.set_meta("arcana_edge_proxy_material", _face_edge_proxies[art])
	return material


func _outline_material(art: Texture2D, region: Rect2, outer_edges: Vector4) -> ShaderMaterial:
	var material := _cutout_face_material(art)
	material.set_shader_parameter("art_region", Vector4(region.position.x, region.position.y,
		region.end.x - 1.0, region.end.y - 1.0))
	material.set_shader_parameter("outer_edges", outer_edges)
	return material


func _art_face(parent: Node3D, label: String, material: Material, image_size: Vector2,
		region: Rect2, vertices: Array[Vector3], normal: Vector3) -> MeshInstance3D:
	var start := (region.position + Vector2(0.5, 0.5)) / image_size
	var end := (region.end - Vector2(0.5, 0.5)) / image_size
	var uvs: Array[Vector2] = [start, Vector2(end.x, start.y), end, Vector2(start.x, end.y)]
	var builder := SurfaceTool.new()
	builder.begin(Mesh.PRIMITIVE_TRIANGLES)
	for index: int in [0, 1, 2, 0, 2, 3]:
		builder.set_normal(normal)
		builder.set_uv(uvs[index])
		builder.add_vertex(vertices[index])
	return _mesh(parent, label, builder.commit(), material)


func _bounds(rect: Rect2, base: float, top: float) -> AABB:
	return AABB(Vector3(rect.position.x, base, rect.position.y), Vector3(rect.size.x, top - base, rect.size.y))


func _build_furniture_collision(piece: Node3D, blockers: Array[Rect2], height: float) -> void:
	if blockers.is_empty():
		return
	var body := StaticBody3D.new()
	body.name = "Body"
	piece.add_child(body)
	var origin := Vector2(piece.position.x, piece.position.z)
	for blocker in blockers:
		var local := Rect2(blocker.position / Layout.UNIT - origin, blocker.size / Layout.UNIT)
		_collider(local, 0.0, height, body)


func _collider(rect: Rect2, base: float, top: float, body: StaticBody3D = null) -> void:
	var bounds := _bounds(rect, base, top)
	var collision := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = bounds.size
	collision.shape = shape
	collision.position = bounds.get_center()
	collision.name = "Collision"
	var target := _body if body == null else body
	target.add_child(collision, true)


func _box(parent: Node3D, label: String, rect: Rect2, base: float, top: float, color: Color) -> void:
	if parent == null:
		return
	var bounds := _bounds(rect, base, top)
	var box := BoxMesh.new()
	box.size = bounds.size
	var instance := _mesh(parent, label, box, _color_material(color))
	instance.position = bounds.get_center()


func _mesh(parent: Node3D, label: String, mesh: Mesh, material: Material) -> MeshInstance3D:
	var node := MeshInstance3D.new()
	node.name = label
	node.mesh = mesh
	node.material_override = material
	parent.add_child(node, true)
	return node


func _group(parent: Node3D, label: String) -> Node3D:
	var node := Node3D.new()
	node.name = label
	parent.add_child(node, true)
	return node


func _color_material(color: Color) -> Material:
	if not _materials.has(color):
		var material := StandardMaterial3D.new()
		material.albedo_color = color
		_materials[color] = material if use_approved_lighting else _room_light_material(material)
	return _materials[color]


func _texture_material(texture: Texture2D) -> StandardMaterial3D:
	if not _materials.has(texture):
		var material := StandardMaterial3D.new()
		material.albedo_texture = texture
		material.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
		_materials[texture] = material
	return _materials[texture]
