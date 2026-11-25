extends SceneTree

# One-time migration from the procedural shop to the editable Blender scene.
func _initialize() -> void:
	call_deferred("_export_room")


func _export_room() -> void:
	var shop := load("res://scenes/shop_3d.tscn").instantiate() as Node3D
	shop.get_node("Geometry").authored_room = null
	shop.get_node("Geometry/AuthoredRoom").free()
	var staging := Node3D.new()
	root.add_child(staging)
	staging.add_child(shop)
	var source: Node3D = shop.geometry.get_node("Structure")
	var room := Node3D.new()
	room.name = "ArcanaShop"
	room.set_meta("extras", {"layout_signature": shop.geometry.layout_signature(shop.layout)})
	_copy_visuals(source, room)
	var light_paths := {"Sun": "Lighting/KeyLight", "OverheadFill": "Lighting/OverheadFill"}
	for light_name: String in light_paths:
		var light := shop.get_node(light_paths[light_name]).duplicate() as Light3D
		light.name = light_name
		light.set_meta("extras", {"shop_light": light_name, "godot_energy": light.light_energy})
		room.add_child(light)
	var camera := shop.get_node("Camera3D").duplicate() as Camera3D
	camera.name = "GameFraming"
	camera.environment = null
	room.add_child(camera)
	var markers := Node3D.new()
	markers.name = "LayoutReference"
	room.add_child(markers)
	for id in shop.layout.markers:
		var point: Vector2 = shop.layout.markers[id] / 16.0
		var marker := Node3D.new()
		marker.name = str(id).capitalize()
		marker.position = Vector3(point.x, 0, point.y)
		markers.add_child(marker)
	var document := GLTFDocument.new()
	var state := GLTFState.new()
	var code := document.append_from_scene(room, state)
	if code == OK:
		code = document.write_to_filesystem(state, ProjectSettings.globalize_path("res://../.runtime/shop-blender-work/source.glb"))
	print("SHOP_LAYOUT_EXPORT ", code)
	room.free()
	staging.free()
	quit(code)


func _copy_visuals(source: Node3D, parent: Node3D) -> void:
	for child in source.get_children():
		if not child is Node3D or child is CollisionObject3D or child is CollisionShape3D:
			continue
		if child.name == "OakPlankFloor":
			continue
		var copy: Node3D
		if child is MeshInstance3D:
			var model := MeshInstance3D.new()
			var mesh := ArrayMesh.new()
			var extras := {}
			if child.mesh == null:
				continue
			for i in child.mesh.get_surface_count():
				var active: Material = child.get_active_material(i)
				var material := active as StandardMaterial3D
				if active is ShaderMaterial:
					material = StandardMaterial3D.new()
					material.albedo_texture = active.get_shader_parameter("face_art")
					material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
					material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA_SCISSOR
					material.alpha_scissor_threshold = 0.5
					material.cull_mode = BaseMaterial3D.CULL_DISABLED
					for property in ["art_region", "outer_edges", "counter_silhouette"]:
						var param: Variant = active.get_shader_parameter(property)
						if param is Vector4:
							extras[property] = [param.x, param.y, param.z, param.w]
				if child.cast_shadow == GeometryInstance3D.SHADOW_CASTING_SETTING_SHADOWS_ONLY:
					extras["shadow_only"] = true
				elif child.cast_shadow == GeometryInstance3D.SHADOW_CASTING_SETTING_OFF:
					extras["no_shadow"] = true
				mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, child.mesh.surface_get_arrays(i))
				mesh.surface_set_material(i, material)
			if not extras.is_empty():
				model.set_meta("extras", extras)
			model.mesh = mesh
			copy = model
		else:
			copy = Node3D.new()
		copy.name = child.name
		copy.transform = child.transform
		parent.add_child(copy, true)
		_copy_visuals(child, copy)

