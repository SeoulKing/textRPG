@tool
extends Node3D

const StoneShader := preload("res://art/resources/plaza_street_stone.gdshader")
const RoadSettsShader := preload("res://art/resources/plaza_road_setts.gdshader")
const CORE := Rect2(-11.0, -15.0, 22.0, 30.0)
const PLANTER_HEIGHT := 0.22
const KERB_WIDTH := 0.23
const KERB_LENGTH := 0.78

@export var ground_path: NodePath
@export var roads: Array[Dictionary] = []
@export var forecourt := Rect2()
@export var terrace := Rect2()
@export var planter_footprints: Array[Rect2] = []


func _ready() -> void:
	var ground := get_node_or_null(ground_path) as MeshInstance3D
	if ground == null or not ground.mesh is PlaneMesh:
		return
	var ground_mesh := ground.mesh as PlaneMesh
	var center := Vector2(ground.position.x, ground.position.z)
	_build_extension(Rect2(center - ground_mesh.size * 0.5, ground_mesh.size))
	_build_streets()
	_build_planters()


func _build_extension(land: Rect2) -> void:
	var strips: Array[Rect2] = [
		Rect2(land.position, Vector2(land.size.x, CORE.position.y - land.position.y)),
		Rect2(land.position.x, CORE.position.y, CORE.position.x - land.position.x, CORE.size.y),
		Rect2(CORE.end.x, CORE.position.y, land.end.x - CORE.end.x, CORE.size.y),
		Rect2(land.position.x, CORE.end.y, land.size.x, land.end.y - CORE.end.y),
	]
	var pavers := SurfaceTool.new()
	pavers.begin(Mesh.PRIMITIVE_TRIANGLES)
	var bedding := _solid_material(Color("927f6a"))
	for strip in strips:
		if strip.size.x <= 0.0 or strip.size.y <= 0.0:
			continue
		_append_polygon(pavers, _corners(strip), -0.001)
		_box(self, "LimestoneBedding", strip, -0.115, 0.19, bedding)
	_add_surface("LimestoneExtension", pavers, _stone(Color("b4a189"), Color("96846f")))


func _build_streets() -> void:
	var paving := SurfaceTool.new()
	paving.begin(Mesh.PRIMITIVE_TRIANGLES)
	var kerbs := SurfaceTool.new()
	kerbs.begin(Mesh.PRIMITIVE_TRIANGLES)
	var footprints: Array[PackedVector2Array] = []
	var main_roads: Array[Dictionary] = []
	for road in roads:
		var centerline: PackedVector2Array = road["centerline"]
		var half_width: float = road["width"] * 0.5
		for outline: PackedVector2Array in Geometry2D.offset_polyline(
				centerline, half_width, Geometry2D.JOIN_ROUND, Geometry2D.END_BUTT):
			footprints.append(outline)
			if half_width >= 2.0:
				main_roads.append({"outline": outline, "centerline": centerline})
	for court in [forecourt, terrace]:
		if court.has_area():
			footprints.append(_corners(court))
	# One continuous bond across junctions and forecourts. A small height offset
	# keeps overlapping branches clear of z-fighting without coloring the joints.
	for index in footprints.size():
		_append_polygon(paving, footprints[index], 0.010 + float(index) * 0.001)
	for road in main_roads:
		_append_kerbs(kerbs, road["outline"], road["centerline"], footprints)
	var setts := ShaderMaterial.new()
	setts.shader = RoadSettsShader
	_add_surface("StreetSetts", paving, setts)
	var edging := _solid_material(Color.WHITE)
	edging.vertex_color_use_as_albedo = true
	edging.vertex_color_is_srgb = true
	_add_surface("StreetKerbstones", kerbs, edging)


func _append_kerbs(surface: SurfaceTool, outline: PackedVector2Array,
		centerline: PackedVector2Array, footprints: Array[PackedVector2Array]) -> void:
	var entry := centerline[0]
	var exit := centerline[-1]
	var entry_direction := entry.direction_to(centerline[1])
	var exit_direction := exit.direction_to(centerline[-2])
	for edge in outline.size():
		var start := outline[edge]
		var end := outline[(edge + 1) % outline.size()]
		var length := start.distance_to(end)
		if length < 0.16:
			continue
		var along := start.direction_to(end)
		# Leave walking entrances and the plaza boundary open at both ends.
		if (absf(along.dot(entry_direction)) < 0.01 and absf((start - entry).dot(entry_direction)) < 0.02) \
				or (absf(along.dot(exit_direction)) < 0.01 and absf((start - exit).dot(exit_direction)) < 0.02):
			continue
		var inward := along.orthogonal()
		if not Geometry2D.is_point_in_polygon((start + end) * 0.5 + inward * 0.06, outline):
			inward = -inward
		var count := maxi(1, roundi(length / KERB_LENGTH))
		for index in count:
			var midpoint := start.lerp(end, (float(index) + 0.5) / count)
			if not _is_kerb_edge(midpoint + inward * 0.1, outline, footprints):
				continue
			var half := along * (length / count * 0.5 - 0.016)
			var inner := inward * KERB_WIDTH
			var from := midpoint - half
			var to := midpoint + half
			var tone := Color("a9a091").lerp(Color("91897d"), float((index * 7 + edge * 3) % 11) / 10.0)
			_append_polygon(surface, PackedVector2Array([from, to, to + inner, from + inner]), 0.037, tone)


func _is_kerb_edge(point: Vector2, outline: PackedVector2Array,
		footprints: Array[PackedVector2Array]) -> bool:
	if not Geometry2D.is_point_in_polygon(point, outline):
		return false
	for other in footprints:
		if other != outline and Geometry2D.is_point_in_polygon(point, other):
			return false
	return true


func _build_planters() -> void:
	var base := _solid_material(Color("a18c70"))
	var rim := _solid_material(Color("c9b591"))
	var soil := _solid_material(Color("5a4b34"))
	var canopy := _solid_material(Color.WHITE)
	canopy.vertex_color_use_as_albedo = true
	var leaves := SphereMesh.new()
	leaves.radial_segments = 5
	leaves.rings = 2
	leaves.material = canopy
	for footprint in planter_footprints:
		var bed := StaticBody3D.new()
		bed.name = "LowPlanter"
		add_child(bed, true)
		var collision := CollisionShape3D.new()
		var shape := BoxShape3D.new()
		shape.size = Vector3(footprint.size.x, PLANTER_HEIGHT, footprint.size.y)
		collision.shape = shape
		collision.position = _at_center(footprint, PLANTER_HEIGHT * 0.5)
		bed.add_child(collision)
		_box(bed, "StoneBase", footprint.grow(-0.03), 0.08, 0.16, base)
		var lip := 0.12
		var interior := footprint.grow(-lip)
		var edges: Array[Rect2] = [
			Rect2(footprint.position, Vector2(footprint.size.x, lip)),
			Rect2(footprint.position.x, footprint.end.y - lip, footprint.size.x, lip),
			Rect2(footprint.position.x, interior.position.y, lip, interior.size.y),
			Rect2(interior.end.x, interior.position.y, lip, interior.size.y),
		]
		for edge in edges:
			_box(bed, "StoneRim", edge, 0.17, 0.10, rim)
		_box(bed, "Earth", interior, 0.191, 0.06, soil)
		_add_leaves(bed, interior, leaves)


func _add_leaves(bed: Node3D, interior: Rect2, mesh: SphereMesh) -> void:
	var palette: Array[Color] = [Color("536b3f"), Color("6b7b46"), Color("889354"), Color("71864e")]
	var columns := maxi(1, floori(interior.size.x / 0.44))
	var instances := MultiMesh.new()
	instances.transform_format = MultiMesh.TRANSFORM_3D
	instances.use_colors = true
	instances.mesh = mesh
	instances.instance_count = columns * 2
	for column in columns:
		for row in 2:
			var at := interior.position + interior.size * Vector2(
				(float(column) + (0.44 if row == 0 else 0.57)) / columns,
				0.31 if row == 0 else 0.69)
			var variation := float((column * 5 + row * 3) % 7) / 6.0
			var scale := Vector3(0.53, lerpf(0.27, 0.35, variation), 0.51)
			var index := column * 2 + row
			var leaf_transform := Transform3D(Basis.from_scale(scale), Vector3(at.x, 0.34, at.y))
			instances.set_instance_transform(index, leaf_transform)
			instances.set_instance_color(index, palette[(column * 3 + row) % palette.size()])
	var foliage := MultiMeshInstance3D.new()
	foliage.name = "LowFoliage"
	foliage.multimesh = instances
	bed.add_child(foliage)


func _append_polygon(surface: SurfaceTool, points: PackedVector2Array, height: float,
		color := Color.WHITE) -> void:
	var indices := Geometry2D.triangulate_polygon(points)
	for index in indices:
		var point := points[index]
		surface.set_normal(Vector3.UP)
		surface.set_color(color)
		surface.add_vertex(Vector3(point.x, height, point.y))


func _add_surface(label: String, surface: SurfaceTool, material: Material) -> void:
	var mesh := surface.commit()
	if mesh == null:
		return
	var node := MeshInstance3D.new()
	node.name = label
	node.mesh = mesh
	node.material_override = material
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(node, true)


func _box(parent: Node3D, label: String, footprint: Rect2, height: float, depth: float,
		material: Material) -> void:
	var mesh := BoxMesh.new()
	mesh.size = Vector3(footprint.size.x, depth, footprint.size.y)
	mesh.material = material
	var node := MeshInstance3D.new()
	node.name = label
	node.mesh = mesh
	node.position = _at_center(footprint, height)
	parent.add_child(node, true)


func _stone(stone: Color, mortar: Color) -> ShaderMaterial:
	var material := ShaderMaterial.new()
	material.shader = StoneShader
	material.set_shader_parameter("stone", stone)
	material.set_shader_parameter("mortar", mortar)
	return material


func _solid_material(tone: Color) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = tone
	material.roughness = 0.94
	return material


func _corners(rect: Rect2) -> PackedVector2Array:
	return PackedVector2Array([rect.position, Vector2(rect.end.x, rect.position.y),
		rect.end, Vector2(rect.position.x, rect.end.y)])


func _at_center(rect: Rect2, height: float) -> Vector3:
	var center := rect.get_center()
	return Vector3(center.x, height, center.y)
