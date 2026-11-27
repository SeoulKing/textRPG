@tool
extends EditorScenePostImport


func _post_import(scene: Node) -> Object:
	# The academy's baked stone and cloth colors are stored on its vertices.
	for child in scene.find_children("*", "MeshInstance3D", true, false):
		var instance := child as MeshInstance3D
		var mesh := instance.mesh as ArrayMesh
		if mesh == null:
			continue
		for surface in range(mesh.get_surface_count()):
			var material := mesh.surface_get_material(surface) as StandardMaterial3D
			if material != null and (mesh.surface_get_format(surface) & Mesh.ARRAY_FORMAT_COLOR) != 0:
				material.vertex_color_use_as_albedo = true
	return scene
