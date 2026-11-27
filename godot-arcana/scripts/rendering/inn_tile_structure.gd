extends RefCounted

## Unit-cell structure of the approved inn. The floor surface is Y=0.
## Parent coordinates are the room grid. Keep layout decisions in tile coordinates.
const TOON_SURFACE := preload("res://art/resources/tutorial_toon_surface.gdshader")
const TileStyle := preload("res://scripts/rendering/tile_world_style.gd")
const BOUNDS := AABB(Vector3(-1, -1, -1), Vector3(15, 5, 12))
const FLOOR_SIZE := Vector2i(14, 10)
const WALL_HEIGHT := 4
const ENTRANCE_START := 6
const ENTRANCE_END := 8
const FLOOR_COLORS: Array[Color] = [
	Color("a88262"), Color("a27a58"), Color("ad8562"),
	Color("a57d5d"), Color("9c7658"), Color("ab805c"),
]
const CREAM := 0
const DARK := 1
const SHADOW := 2
const HONEY := 3
const POLISHED := 4


static func build(parent: Node3D, wall_materials: Array[Material], floor_materials: Array[Material],
		collision_layer := 0) -> GridMap:
	if not is_instance_valid(parent) or wall_materials.size() != 5 or floor_materials.is_empty():
		push_error("The inn structure needs five wall materials and at least one floor material.")
		return null

	var library := MeshLibrary.new()
	var shape := BoxShape3D.new()
	shape.size = Vector3.ONE
	var floor_items: Array[int] = []
	for index in floor_materials.size():
		var cube := BoxMesh.new()
		cube.size = Vector3.ONE
		cube.material = floor_materials[index]
		floor_items.append(_add_item(library, cube, shape, "Oak floor %d" % index, false))
	var footing := BoxMesh.new()
	footing.size = Vector3.ONE
	footing.material = wall_materials[DARK]
	var footing_item := _add_item(library, footing, shape, "Oak footing", false)
	var rail_item := _add_item(library, _front_rail(wall_materials), shape, "Cutaway rail")
	var plain_walls: Array[int] = []
	var pillared_walls: Array[int] = []
	var corner_walls: Array[int] = []
	for level in WALL_HEIGHT:
		plain_walls.append(_add_item(library, _wall(wall_materials, level, false), shape, "Wall %d" % level))
		pillared_walls.append(_add_item(library, _wall(wall_materials, level, true), shape, "Pilaster %d" % level))
		corner_walls.append(_add_item(library, _corner(wall_materials, level), shape, "Corner %d" % level))
	if not _meshes_fit_cells(library):
		return null

	var grid := GridMap.new()
	grid.name = "UnitInnStructure"
	grid.mesh_library = library
	grid.cell_size = Vector3.ONE
	grid.collision_layer = collision_layer
	grid.collision_mask = 0

	# The north and west walls share the single corner cell. The south rail leaves a two-cell entrance.
	var north_to_west := grid.get_orthogonal_index_from_basis(Basis(Vector3.UP, PI * 0.5))
	for z in FLOOR_SIZE.y:
		for x in FLOOR_SIZE.x:
			var tone := ((x * 13 + z * 7) ^ (x * z * 31)) % floor_items.size()
			var orientation := 0 if (x + z) % 2 == 0 else north_to_west
			grid.set_cell_item(Vector3i(x, -1, z), floor_items[tone], orientation)
	for x in range(-1, FLOOR_SIZE.x):
		grid.set_cell_item(Vector3i(x, -1, -1), footing_item)
		grid.set_cell_item(Vector3i(x, -1, FLOOR_SIZE.y), footing_item)
		if x < ENTRANCE_START or x >= ENTRANCE_END:
			grid.set_cell_item(Vector3i(x, 0, FLOOR_SIZE.y), rail_item)
	for z in FLOOR_SIZE.y:
		grid.set_cell_item(Vector3i(-1, -1, z), footing_item)
	for level in WALL_HEIGHT:
		grid.set_cell_item(Vector3i(-1, level, -1), corner_walls[level])
		for x in FLOOR_SIZE.x:
			var item := pillared_walls[level] if x % 3 == 2 else plain_walls[level]
			grid.set_cell_item(Vector3i(x, level, -1), item)
		for z in FLOOR_SIZE.y:
			var item := pillared_walls[level] if z % 3 == 2 else plain_walls[level]
			grid.set_cell_item(Vector3i(-1, level, z), item, north_to_west)

	parent.add_child(grid)
	return grid


static func make_floor_materials() -> Array[Material]:
	var tile_shader := Shader.new()
	tile_shader.code = "#define ARCANA_INN_FLOOR\n" + TOON_SURFACE.code.replace("filter_linear_mipmap", "filter_nearest")
	var grain := _oak_pattern()
	var materials: Array[Material] = []
	for color: Color in FLOOR_COLORS:
		var material := ShaderMaterial.new()
		material.shader = tile_shader
		material.set_meta(&"arcana_edge_cull_mode", BaseMaterial3D.CULL_BACK)
		material.set_shader_parameter("surface_color", color)
		material.set_shader_parameter("surface_roughness", 0.82)
		material.set_shader_parameter("orthographic_view", true)
		material.set_shader_parameter("specular_nonmetal", 0.05)
		material.set_shader_parameter("use_surface_texture", true)
		material.set_shader_parameter("surface_texture", grain)
		material.set_shader_parameter("floor_lip_width", 1.0 / TileStyle.DOTS_PER_TILE)
		material.set_shader_parameter("floor_lip_strength", TileStyle.HIGHLIGHT_STRENGTH)
		materials.append(material)
	return materials


static func _oak_pattern() -> ImageTexture:
	# BoxMesh packs its faces into a 3×2 UV atlas. Repeat the oak motif across each face.
	var pattern := Image.create_empty(96, 64, false, Image.FORMAT_RGBA8)
	for atlas_row in range(2):
		for atlas_column in range(3):
			var origin := Vector2i(atlas_column, atlas_row) * 32
			for y in range(32):
				for x in range(32):
					var value := 1.0
					if x == 0 or y == 0:
						value = 0.83
					elif x == 31 or y == 31:
						value = 0.89
					elif y == 10 or y == 21:
						value = 0.91
					elif (y == 5 and x > 7 and x < 19) or (y == 16 and x > 15 and x < 28) or (y == 26 and x > 4 and x < 15):
						value = 0.95
					pattern.set_pixel(origin.x + x, origin.y + y, Color(value, value, value))
	return ImageTexture.create_from_image(pattern)


static func _add_item(library: MeshLibrary, mesh: Mesh, shape: BoxShape3D, label: String,
		casts_shadow := true) -> int:
	var item := library.get_last_unused_item_id()
	library.create_item(item)
	library.set_item_name(item, label)
	library.set_item_mesh(item, mesh)
	library.set_item_shapes(item, [shape, Transform3D.IDENTITY])
	if not casts_shadow:
		library.set_item_mesh_cast_shadow(item, RenderingServer.SHADOW_CASTING_SETTING_OFF)
	return item


static func _meshes_fit_cells(library: MeshLibrary) -> bool:
	var cell_bounds := AABB(-Vector3.ONE * 0.5, Vector3.ONE).grow(0.0001)
	for item: int in library.get_item_list():
		if not cell_bounds.encloses(library.get_item_mesh(item).get_aabb()):
			push_error("Inn tile extends past its unit cell: " + library.get_item_name(item))
			return false
	return true


static func _wall(materials: Array[Material], level: int, has_pillar: bool) -> ArrayMesh:
	# The positive Z face is the inside face. The west wall turns this same module ninety degrees.
	var layers := _layers(materials.size())
	var cap_height := 0.14 if level == WALL_HEIGHT - 1 else 0.0
	_box(layers, DARK if level == 0 else CREAM,
		Vector3(1.0, 1.0 - cap_height, 0.86), Vector3(0, -cap_height * 0.5, -0.07))
	if level == 0:
		_wainscot(layers)
	elif level == WALL_HEIGHT - 1:
		_cornice(layers)
	if has_pillar:
		_pilaster(layers, level, false)
	return _finish(layers, materials)


static func _corner(materials: Array[Material], level: int) -> ArrayMesh:
	var layers := _layers(materials.size())
	var cap_height := 0.14 if level == WALL_HEIGHT - 1 else 0.0
	_box(layers, DARK if level == 0 else CREAM,
		Vector3(0.86, 1.0 - cap_height, 0.86), Vector3(-0.07, -cap_height * 0.5, -0.07))
	if level == 0:
		_wainscot(layers)
		_wainscot(layers, Basis(Vector3.UP, PI * 0.5))
	elif level == WALL_HEIGHT - 1:
		_cornice(layers)
		_cornice(layers, Basis(Vector3.UP, PI * 0.5), false)
	_pilaster(layers, level, true)
	return _finish(layers, materials)


static func _wainscot(layers: Array[SurfaceTool], axis := Basis.IDENTITY) -> void:
	_box(layers, HONEY, Vector3(1.0, 0.085, 0.10), Vector3(0, -0.43, 0.40), axis)
	_box(layers, DARK, Vector3(1.0, 0.065, 0.13), Vector3(0, 0.405, 0.415), axis)
	_box(layers, POLISHED, Vector3(1.0, 0.031, 0.14), Vector3(0, 0.452, 0.43), axis)
	for x: float in [-0.255, 0.255]:
		_box(layers, HONEY, Vector3(0.397, 0.618, 0.049), Vector3(x, -0.009, 0.385), axis)
		_box(layers, SHADOW, Vector3(0.307, 0.504, 0.044), Vector3(x, -0.004, 0.408), axis)
		_box(layers, DARK, Vector3(0.255, 0.444, 0.034), Vector3(x, 0.002, 0.433), axis)
		_box(layers, POLISHED, Vector3(0.071, 0.071, 0.02), Vector3(x, -0.005, 0.456), axis,
			Basis(Vector3.BACK, PI * 0.25))


static func _cornice(layers: Array[SurfaceTool], axis := Basis.IDENTITY, cap := true) -> void:
	_box(layers, DARK, Vector3(1.0, 0.057, 0.09), Vector3(0, 0.268, 0.394), axis)
	_box(layers, POLISHED, Vector3(1.0, 0.041, 0.113), Vector3(0, 0.313, 0.412), axis)
	if cap:
		_box(layers, HONEY, Vector3(1.0, 0.14, 1.0), Vector3(0, 0.43, 0.0), axis)


static func _pilaster(layers: Array[SurfaceTool], level: int, corner: bool) -> void:
	var x := 0.397 if corner else 0.0
	var z := 0.401
	var cap_height := 0.14 if level == WALL_HEIGHT - 1 else 0.0
	_box(layers, DARK, Vector3(0.148, 1.0 - cap_height, 0.142), Vector3(x, -cap_height * 0.5, z))
	_box(layers, HONEY, Vector3(0.087, 0.974 - cap_height, 0.029), Vector3(x, -cap_height * 0.5, 0.482))
	if corner:
		_box(layers, HONEY, Vector3(0.027, 0.974 - cap_height, 0.087), Vector3(0.482, -cap_height * 0.5, z))
	if level == 0 or level == WALL_HEIGHT - 1:
		var height := -0.355 if level == 0 else 0.243
		_box(layers, DARK, Vector3(0.202, 0.146, 0.171), Vector3(x, height, 0.414))
		_box(layers, POLISHED, Vector3(0.184, 0.043, 0.171), Vector3(x, height + 0.083, 0.414))


static func _front_rail(materials: Array[Material]) -> ArrayMesh:
	var layers := _layers(materials.size())
	_box(layers, DARK, Vector3(1.0, 0.10, 0.76), Vector3(0, -0.45, -0.105))
	_box(layers, SHADOW, Vector3(1.0, 0.34, 0.62), Vector3(0, -0.244, -0.105))
	_box(layers, HONEY, Vector3(1.0, 0.088, 0.77), Vector3(0, -0.045, -0.105))
	for x: float in [-0.25, 0.25]:
		_box(layers, HONEY, Vector3(0.414, 0.235, 0.044), Vector3(x, -0.24, 0.216))
		_box(layers, DARK, Vector3(0.325, 0.175, 0.031), Vector3(x, -0.227, 0.248))
		_box(layers, POLISHED, Vector3(0.045, 0.045, 0.019), Vector3(x, -0.222, 0.273),
			Basis.IDENTITY, Basis(Vector3.BACK, PI * 0.25))
	return _finish(layers, materials)


static func _layers(count: int) -> Array[SurfaceTool]:
	var layers: Array[SurfaceTool] = []
	for index in count:
		var tool := SurfaceTool.new()
		tool.begin(Mesh.PRIMITIVE_TRIANGLES)
		layers.append(tool)
	return layers


static func _box(layers: Array[SurfaceTool], material: int, size: Vector3, center: Vector3,
		axis := Basis.IDENTITY, rotation := Basis.IDENTITY) -> void:
	var component := BoxMesh.new()
	component.size = size
	layers[material].append_from(component, 0, Transform3D(axis * rotation, axis * center))


static func _finish(layers: Array[SurfaceTool], materials: Array[Material]) -> ArrayMesh:
	var result := ArrayMesh.new()
	for index in layers.size():
		var arrays := layers[index].commit_to_arrays()
		if arrays.is_empty():
			continue
		var vertices: Variant = arrays[Mesh.ARRAY_VERTEX]
		if vertices == null or vertices.is_empty():
			continue
		result.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
		result.surface_set_material(result.get_surface_count() - 1, materials[index])
	return result
