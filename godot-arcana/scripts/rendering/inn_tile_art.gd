extends RefCounted

## Fits the authored inn meshes to the shared gameplay tile layout.
const Layout := preload("res://scripts/inn_tile_layout.gd")
const Coordinates := preload("res://scripts/native_2d_coordinates.gd")
const Structure := preload("res://scripts/rendering/inn_tile_structure.gd")
const AUTHORED_TO_GRID := 0.8


func apply(lobby: Node3D) -> bool:
	# The main world instantiates the inn directly in its gameplay viewport at the origin.
	if not lobby.global_transform.is_equal_approx(Transform3D.IDENTITY):
		push_error("The tiled inn requires a world-aligned lobby root.")
		return false
	var authored_origin := Layout.tile_to_logical(Vector2.ZERO) / Coordinates.LOGICAL_UNIT
	_normalize_coordinates(lobby, authored_origin)
	var grid := Rect2(Vector2.ZERO, Vector2(Structure.FLOOR_SIZE))
	return _place_furniture(lobby, grid) and _align_rugs(lobby, grid) and _set_unit_structure(lobby)


func _normalize_coordinates(lobby: Node3D, authored_origin: Vector2) -> void:
	var offset := -Vector3(authored_origin.x, 0.0, authored_origin.y) * AUTHORED_TO_GRID
	var to_grid := Transform3D(Basis.from_scale(Vector3.ONE * AUTHORED_TO_GRID), offset)
	var camera := lobby.get_node("Camera3D")
	for child: Node in lobby.get_children():
		if not child is Node3D or child == camera:
			continue
		child.global_transform = to_grid * child.global_transform
		if child is OmniLight3D:
			child.omni_range *= AUTHORED_TO_GRID


func _set_unit_structure(lobby: Node3D) -> bool:
	var room := lobby.get_node("Room") as Node3D
	var rear := room.get_node("Architecture_plaster_and_timber_back_wall") as Node3D
	var rear_mesh := rear.get_child(0) as MeshInstance3D
	var palette: Array[Material] = []
	for surface in range(5):
		palette.append(rear_mesh.get_active_material(surface))
	var grid := Structure.build(room, palette, Structure.make_floor_materials())
	if grid == null:
		return false
	grid.global_transform = Transform3D.IDENTITY
	for name: String in ["Architecture_oak_floor", "Architecture_cutaway_entrance", rear.name]:
		(room.get_node(name) as Node3D).hide()
	var west_lamp_template := room.get_node("Sconce_west_post") as Node3D
	for z: float in [3.74, 8.64]:
		var west := west_lamp_template.duplicate() as Node3D
		west.name = "UnitWallSconce"
		room.add_child(west, true)
		west.global_transform = Transform3D(Basis(Vector3.UP, PI * 0.5) * west_lamp_template.global_basis,
			Vector3(0.0, west_lamp_template.global_position.y, 0.0))
		if not _fit_wall_fixture(lobby, west, true, z):
			return false
		var lamp := OmniLight3D.new()
		lamp.name = "UnitWallSconceLight"
		lamp.light_color = Color(1.0, 0.79, 0.56)
		lamp.light_energy = 1.10
		lamp.omni_range = 4.10
		lamp.omni_attenuation = 1.35
		lobby.add_child(lamp, true)
		lamp.global_position = Vector3(0.55, 2.23, z)
		lobby._local_lights.append(lamp)
	for name: String in ["Quest_board", "Brass_room_key_rack", "Sconce_west_post", "Sconce_east_post"]:
		var fixture := room.get_node(name) as Node3D
		var bounds: AABB = lobby._mesh_bounds(fixture)
		var x := bounds.get_center().x
		if name == "Sconce_west_post":
			x = 6.13
		elif name == "Sconce_east_post":
			x = 13.62
		if not _fit_wall_fixture(lobby, fixture, false, x):
			return false
	# Existing door lights move to the inner lip of the new threshold row.
	for name: String in ["Entry_lantern_left", "Entry_lantern_right"]:
		var fixture := room.get_node(name) as Node3D
		var bounds: AABB = lobby._mesh_bounds(fixture)
		var p := fixture.global_position
		var gate_x := 5.86 if name == "Entry_lantern_left" else 8.14
		p.x += gate_x - bounds.get_center().x
		p.z += 10.25 - bounds.get_center().z
		p.y += 0.64 - bounds.position.y
		fixture.global_position = p
	return true


func _fit_wall_fixture(lobby: Node3D, fixture: Node3D, west: bool, along: float) -> bool:
	var raw: AABB = lobby._mesh_bounds(fixture)
	var depth := raw.size.x if west else raw.size.z
	if depth <= 0.0:
		push_error("Missing mesh for inn wall fixture: " + str(fixture.name))
		return false
	var scale := minf(1.0, 0.19 / depth)
	var axis := Vector3(scale, 1.0, 1.0) if west else Vector3(1.0, 1.0, scale)
	fixture.global_basis = Basis.from_scale(axis) * fixture.global_basis
	var bounds: AABB = lobby._mesh_bounds(fixture)
	var shift := Vector3(-0.012 - bounds.end.x, 0.0, along - bounds.get_center().z) if west \
		else Vector3(along - bounds.get_center().x, 0.0, -0.012 - bounds.end.z)
	fixture.global_position += shift
	var placed: AABB = lobby._mesh_bounds(fixture)
	var inner_face := placed.end.x if west else placed.end.z
	var outer_face := placed.position.x if west else placed.position.z
	if inner_face > 0.001 or outer_face < -1.001:
		push_error("Wall fixture extends beyond its tile row: " + str(fixture.name))
		return false
	return true


func _place_furniture(lobby: Node3D, grid: Rect2) -> bool:
	for entry: Array in Layout.FURNITURE:
		var slot: Rect2i = entry[2]
		var prop := lobby.get_node_or_null("Room/" + str(entry[0])) as Node3D
		if prop == null or not Rect2i(Vector2i.ZERO, Structure.FLOOR_SIZE).encloses(slot):
			push_error("Inn furniture missing or outside tile grid: " + str(entry[0]))
			return false
		var mode: String = entry[3]
		var original := _ground_bounds(lobby, prop, mode, grid)
		if not original.has_area():
			push_error("Inn furniture has no floor bounds: " + str(entry[0]))
			return false
		var space := _slot_bounds(grid, slot)
		var fit := space.grow(-0.0475 * AUTHORED_TO_GRID)
		var scale := minf(1.0, minf(fit.size.x / original.size.x, fit.size.y / original.size.y))
		if mode == "wall":
			scale = minf(1.0, fit.size.x / original.size.x)
		var horizontal_scale := fit.size / original.size if mode == "counter" else Vector2.ONE * scale
		prop.scale *= Vector3(horizontal_scale.x, 1.0, horizontal_scale.y)
		var resized := _ground_bounds(lobby, prop, mode, grid)
		var target := fit.get_center()
		if mode == "wall":
			target.y = resized.get_center().y
		var offset := target - resized.get_center()
		prop.global_position += Vector3(offset.x, 0.0, offset.y)
		if mode == "counter" and not _reshape_counter_front(prop, space):
			return false
		var placed := _ground_bounds(lobby, prop, mode, grid)
		if not space.grow(0.001).encloses(placed):
			push_error("Furniture extends out of its cells: " + str(entry[0]) + " " + str(placed))
			return false
		var shift := placed.get_center() - original.get_center()
		if mode == "counter":
			_align_counter_companions(lobby, original, placed, horizontal_scale)
			continue
		for companion: String in entry[4]:
			var node := lobby.get_node(companion) as Node3D
			node.global_position += Vector3(shift.x, 0.0, shift.y)
	return true


func _reshape_counter_front(counter: Node3D, slot: Rect2) -> bool:
	var body := counter.get_node_or_null("Reception_counter_Mesh") as MeshInstance3D
	if body == null or body.mesh == null or not is_equal_approx(slot.size.x, 3.0):
		push_error("The three-tile inn counter needs the authored reception mesh.")
		return false
	var source := body.mesh
	var finished := ArrayMesh.new()
	var overrides: Array[Material] = []
	var centers := PackedFloat32Array()
	var seams := PackedFloat32Array()
	for column in range(roundi(slot.size.x)):
		var x := slot.position.x + (column + 0.5)
		centers.append(body.to_local(Vector3(x, body.global_position.y, body.global_position.z)).x)
	for column in range(1, roundi(slot.size.x)):
		var x := slot.position.x + column
		seams.append(body.to_local(Vector3(x, body.global_position.y, body.global_position.z)).x)
	var panel_templates := 0
	var moved_dividers := [0, 0]
	for surface in range(source.get_surface_count()):
		var original_material := source.surface_get_material(surface)
		var arrays := source.surface_get_arrays(surface)
		overrides.append(body.get_surface_override_material(surface))
		if surface > 6:
			finished.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
			finished.surface_set_material(surface, original_material)
			continue
		var vertices: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
		var normals: PackedVector3Array = arrays[Mesh.ARRAY_NORMAL]
		var uvs: PackedVector2Array = arrays[Mesh.ARRAY_TEX_UV]
		var indices: PackedInt32Array = arrays[Mesh.ARRAY_INDEX]
		var rebuild := SurfaceTool.new()
		rebuild.begin(Mesh.PRIMITIVE_TRIANGLES)
		rebuild.set_material(original_material)
		for i in range(0, indices.size(), 3):
			var triangle := Vector3i(indices[i], indices[i + 1], indices[i + 2])
			var low := vertices[triangle.x].min(vertices[triangle.y]).min(vertices[triangle.z])
			var high := vertices[triangle.x].max(vertices[triangle.y]).max(vertices[triangle.z])
			if _is_counter_panel(surface, low, high):
				if low.x >= 0.13 and high.x <= 0.77:
					for center in centers:
						_add_counter_triangle(rebuild, vertices, normals, uvs, triangle,
							center - 0.45 * 1.12, 1.12, false)
					panel_templates += 1
				continue
			var offset_x := 0.0
			if _is_counter_post(surface, low, high):
				var middle := (low.x + high.x) * 0.5
				if absf(middle) < 1.2:
					var index := 0 if middle < 0.0 else 1
					offset_x = seams[index] - 0.86 * signf(middle)
					moved_dividers[index] += 1
				else:
					offset_x = 0.046 * signf(middle)
			_add_counter_triangle(rebuild, vertices, normals, uvs, triangle, offset_x, 1.0, surface >= 4)
		rebuild.commit(finished)
	if panel_templates == 0 or moved_dividers.has(0):
		push_error("The original counter panel or divider geometry could not be identified.")
		return false
	body.mesh = finished
	for surface in range(overrides.size()):
		body.set_surface_override_material(surface, overrides[surface])
	return true


func _is_counter_panel(surface: int, low: Vector3, high: Vector3) -> bool:
	match surface:
		0: return low.z >= 0.485
		1: return low.z >= 0.46 and low.y >= -0.345 and high.y <= 0.32
		2: return low.z >= 0.51 and low.y >= -0.302 and high.y <= 0.270
	return false


func _is_counter_post(surface: int, low: Vector3, high: Vector3) -> bool:
	var middle := (low.x + high.x) * 0.5
	var post_center := 0.86 if absf(middle) < 1.2 else 1.66
	if low.x * high.x <= 0.0 or minf(absf(low.x), absf(high.x)) < post_center - 0.11 \
			or maxf(absf(low.x), absf(high.x)) > post_center + 0.11:
		return false
	if surface == 2 and low.z >= 0.44:
		return (low.y >= -0.435 and high.y <= -0.300) or (low.y >= 0.272 and high.y <= 0.373)
	return surface == 3 and low.z >= 0.43 and low.y >= -0.424 and high.y <= 0.375


func _add_counter_triangle(surface: SurfaceTool, vertices: PackedVector3Array, normals: PackedVector3Array,
		uvs: PackedVector2Array, triangle: Vector3i, offset_x: float, scale_x: float, shorten_cloth: bool) -> void:
	for index in [triangle.x, triangle.y, triangle.z]:
		var point := vertices[index]
		var normal := normals[index]
		point.x = point.x * scale_x + offset_x
		normal.x /= scale_x
		if shorten_cloth and absf(point.x) <= 0.365 and point.z >= 0.56 and point.y < 0.61:
			point.y = lerpf(0.61, point.y, 0.48)
			normal.y /= 0.48
		surface.set_normal(normal.normalized())
		surface.set_uv(uvs[index])
		surface.add_vertex(point)


func _align_counter_companions(lobby: Node3D, original: Rect2, placed: Rect2, ratio: Vector2) -> void:
	var keeper := lobby.get_node("Innkeeper") as Sprite3D
	var keeper_position := keeper.global_position
	keeper_position.x = placed.get_center().x + (keeper_position.x - original.get_center().x) * ratio.x
	keeper_position.z += placed.position.y - original.position.y
	keeper.global_position = keeper_position
	var lamp := lobby.get_node("ReceptionLight") as OmniLight3D
	var lamp_position := lamp.global_position
	var old_offset := Vector2(lamp_position.x, lamp_position.z) - original.get_center()
	var new_lamp_anchor := placed.get_center() + old_offset * ratio
	lamp.global_position = Vector3(new_lamp_anchor.x, lamp_position.y, new_lamp_anchor.y)


func _slot_bounds(grid: Rect2, slot: Rect2i) -> Rect2:
	return Rect2(grid.position + Vector2(slot.position), Vector2(slot.size))


func _align_rugs(lobby: Node3D, grid: Rect2) -> bool:
	var board := Rect2i(Vector2i.ZERO, Structure.FLOOR_SIZE)
	for name: String in Layout.RUGS:
		var slot: Rect2i = Layout.RUGS[name]
		var rug := lobby.get_node_or_null("Room/" + name) as Node3D
		if rug == null or not board.encloses(slot):
			push_error("Rug missing or outside grid: " + name)
			return false
		var base := _ground_bounds(lobby, rug, "floor", grid)
		if not base.has_area():
			push_error("Inn rug has no floor bounds: " + name)
			return false
		var space := _slot_bounds(grid, slot).grow(-0.065 * AUTHORED_TO_GRID)
		var scale := space.size / base.size
		rug.scale *= Vector3(scale.x, 1.0, scale.y)
		var offset := space.get_center() - _ground_bounds(lobby, rug, "floor", grid).get_center()
		rug.global_position += Vector3(offset.x, 0.0, offset.y)
		var placed := _ground_bounds(lobby, rug, "floor", grid)
		if not space.grow(0.001).encloses(placed) or not placed.grow(0.001).encloses(space):
			push_error("Rug does not match its assigned tile rectangle: " + name)
			return false
	return true


func _ground_bounds(lobby: Node3D, prop: Node3D, mode: String, grid: Rect2) -> Rect2:
	var bounds: AABB = lobby._mesh_bounds(prop)
	if mode == "pot":
		# The ceramic pot reserves a tile. Its hanging leaves can overhang the ground footprint.
		var contact := Rect2()
		for mesh: MeshInstance3D in prop.find_children("*", "MeshInstance3D", true, false):
			for surface in range(mesh.mesh.get_surface_count()):
				var vertices: PackedVector3Array = mesh.mesh.surface_get_arrays(surface)[Mesh.ARRAY_VERTEX]
				for vertex in vertices:
					var point := mesh.global_transform * vertex
					if point.y > bounds.position.y + 0.26 * AUTHORED_TO_GRID:
						continue
					var flat := Vector2(point.x, point.z)
					if contact.size != Vector2.ZERO:
						contact = contact.expand(flat)
					else:
						contact = Rect2(flat - Vector2.ONE * 0.0001, Vector2.ONE * 0.0002)
		if contact.has_area():
			return contact
	var min_z := maxf(bounds.position.z, grid.position.y) if mode == "wall" else bounds.position.z
	return Rect2(Vector2(bounds.position.x, min_z), Vector2(bounds.size.x, bounds.end.z - min_z))
