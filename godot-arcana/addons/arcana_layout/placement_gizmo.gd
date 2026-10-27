@tool
extends EditorNode3DGizmoPlugin
const Placement = preload("res://scripts/arcana_placement.gd")

func _init() -> void:
	create_material("footprint",Color(.95,.65,.25),false,true)
	create_material("bounds",Color(.45,.78,.93))

func _has_gizmo(node: Node3D) -> bool:
	return node.get_script() == Placement

func _get_gizmo_name() -> String:
	return "Arcana Placement"

func _redraw(gizmo: EditorNode3DGizmo) -> void:
	gizmo.clear()
	var node = gizmo.get_node_3d()
	var box = node.bounds
	var mesh = BoxMesh.new()
	mesh.size = box.size.max(Vector3(.1,.1,.1))
	var vertices = mesh.get_faces()
	for i in range(vertices.size()): vertices[i] += box.get_center()
	var picking = TriangleMesh.new()
	picking.create_from_faces(vertices)
	gizmo.add_collision_triangles(picking)
	if not EditorInterface.get_selection().get_selected_nodes().has(node): return
	var edges = PackedVector3Array()
	var corners: Array[Vector3] = []
	for i in range(8):
		corners.append(box.position+Vector3(box.size.x if i&1 else 0,box.size.y if i&2 else 0,box.size.z if i&4 else 0))
	for i in range(8):
		for bit in [1,2,4]:
			if not i&bit:
				edges.append(corners[i])
				edges.append(corners[i|bit])
	gizmo.add_lines(edges,get_material("bounds",gizmo))
	var rect = node.collision_footprint
	if rect.has_area():
		var points = [Vector3(rect.position.x,.03,rect.position.y),Vector3(rect.end.x,.03,rect.position.y),Vector3(rect.end.x,.03,rect.end.y),Vector3(rect.position.x,.03,rect.end.y)]
		var footprint = PackedVector3Array()
		for i in range(4):
			footprint.append(points[i])
			footprint.append(points[(i+1)%4])
		gizmo.add_lines(footprint,get_material("footprint",gizmo))
