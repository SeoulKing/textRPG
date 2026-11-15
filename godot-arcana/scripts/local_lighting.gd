extends RefCounted
## Shared authored point lights for painted sprites and native 3D geometry.
var sources: Array[Dictionary] = []
var omni_lights: Array[OmniLight3D] = []
var clock = 1.0
var uniform_cache: Dictionary = {}
var enabled = true
var indoor = false
var indoor_ambient = .78
var had_transient = false
func configure(layout: Node3D, parent: Node3D) -> void:
	for light in omni_lights:
		if is_instance_valid(light):
			light.get_parent().remove_child(light)
			light.queue_free()
	omni_lights.clear()
	sources.clear()
	for entry in layout.placements():
		var transform = entry.layout_transform(layout)
		if entry.model_kind in ["lamp-post","lantern"]:
			sources.append({"point":transform*Vector3(0,2.4,0),"range":4.0,"strength":1.6,"color":Color("ffcc80").srgb_to_linear()})
		if entry.model_kind != "academy-2d": continue
		var data = JSON.parse_string(FileAccess.get_file_as_string("res://art/export/reference/academy-lights.json"))
		if not data is Dictionary: continue
		var building_scale = transform.basis.get_scale().abs()
		var radius_scale = maxf(building_scale.x,maxf(building_scale.y,building_scale.z))
		for source in data.lights:
			var pixel = Vector2(source.pixel[0],source.pixel[1])
			var height = (1088.0-pixel.y)/(64.0*cos(deg_to_rad(layout.CAMERA_PITCH_DEGREES)))
			var point = transform*Vector3((pixel.x-640.0)/64.0,height,.06)
			var color = Color("ffd391").srgb_to_linear()
			sources.append({"point":point,"range":float(source.range)*radius_scale,"strength":source.strength,"color":color})
			var light = OmniLight3D.new()
			light.name = "SchoolLocalLight"
			light.position = point
			light.light_color = Color("ffd391")
			light.omni_range = float(source.range)*radius_scale
			light.shadow_enabled = false
			light.set_meta("strength",source.strength)
			parent.add_child(light)
			omni_lights.append(light)
		# Existing lanterns are high on the scaled facade. Low porch fills reach
		# the threshold and front steps without raising the plaza's ambient light.
		for side in [-.9,.9]:
			var point = transform*Vector3(side,1.0,.65)
			var range = 3.6*radius_scale
			var color = Color("ffe0ab").srgb_to_linear()
			sources.append({"point":point,"range":range,"strength":.65,"color":color})
			var light = OmniLight3D.new()
			light.name = "SchoolPorchLight"
			light.position = point
			light.light_color = Color("ffe0ab")
			light.omni_range = range
			light.shadow_enabled = false
			light.set_meta("strength",.65)
			parent.add_child(light)
			omni_lights.append(light)
	clock = 1.0
func configure_inn(entries: Array[Dictionary], ambient_level: float = .78) -> void:
	indoor = true
	indoor_ambient = ambient_level
	sources = entries.duplicate(true)
	clock = 1.0

func set_fireplace_time(time: float, animated: bool) -> void:
	var frame = floorf(maxf(0.0,time)*12.0) if animated else 0.0
	var phase = fmod(frame,12.0)*TAU/12.0
	var flicker = 1.0+0.065*sin(phase)+0.025*sin(phase*3.0+0.4) if animated else 1.0
	for source in sources:
		if source.get("fireplace",false):
			source.strength = float(source.base_strength)*flicker

func update(root: Node3D, player: Vector3, dusk: bool, effects: bool, delta: float) -> void:
	clock += maxf(0,delta)
	var moving: Array[Dictionary] = []
	if enabled and effects:
		for flame in root.get_tree().get_nodes_in_group("arcana_flame_lights"):
			if root.is_ancestor_of(flame):
				var source: Dictionary = flame.light_source()
				if not source.is_empty(): moving.append(source)
	# Moving fire uses a 30 Hz field; remove it immediately when the shot disappears.
	if clock<(.033 if not moving.is_empty() else .2) and not (had_transient and moving.is_empty()): return
	had_transient = not moving.is_empty()
	clock = 0
	var active = enabled and effects
	var strength = (0.85 if indoor else (1.0 if dusk else .18)) if active else 0.0
	for light in omni_lights:
		light.visible = active
		light.light_energy = float(light.get_meta("strength"))*strength*.45
	var ranked = sources.duplicate()
	ranked.sort_custom(func(a,b): return a.point.distance_squared_to(player)<b.point.distance_squared_to(player))
	# Reserve the nearest slots for short-lived spell lights, even in daylight.
	ranked = moving+ranked
	var points = PackedVector4Array()
	var colors = PackedVector4Array()
	for i in range(16):
		if i<ranked.size():
			var source = ranked[i]
			points.append(Vector4(source.point.x,source.point.y,source.point.z,source.range))
			colors.append(Vector4(source.color.r,source.color.g,source.color.b,source.strength*(1.0 if source.get("transient",false) and active else strength)))
		else:
			points.append(Vector4(0,0,0,1))
			colors.append(Vector4.ZERO)
	var seen: Dictionary = {}
	_apply(root,points,colors,mini(16,ranked.size()) if active else 0,(indoor_ambient if indoor else .42) if dusk and effects else 1.0,seen)
func _apply(node: Node, points: PackedVector4Array, colors: PackedVector4Array, count: int, ambient: float, seen: Dictionary) -> void:
	if node is MeshInstance3D:
		# Native skinned characters use one override per surface; sprites use a whole-mesh override.
		var candidates=[]
		if node.material_override!=null:candidates.append(node.material_override)
		elif node.mesh!=null:
			for i in range(node.mesh.get_surface_count()):candidates.append(node.get_active_material(i))
		for material in candidates:
			if material is ShaderMaterial and material.shader != null and not seen.has(material):
				seen[material] = true
				var shader = material.shader
				if not uniform_cache.has(shader):
					uniform_cache[shader] = shader.get_shader_uniform_list().any(func(u): return u.name=="local_light_count")
				if uniform_cache[shader]:
					material.set_shader_parameter("local_light_count",count)
					material.set_shader_parameter("local_light_points",points)
					material.set_shader_parameter("local_light_colors",colors)
					material.set_shader_parameter("local_ambient",ambient)
					material.set_shader_parameter("local_ambient_tint",Vector3(.98,.98,1.0) if indoor and count>0 else Vector3.ONE)
	for child in node.get_children(true): _apply(child,points,colors,count,ambient,seen)
