@tool
extends RefCounted

const DEFAULT_PROFILE := preload("res://art/resources/shop_astra_profile.tres")

enum DebugMode { BEAUTY, ALBEDO, DIRECT, EDGES, AO }

var _profile: ShaderMaterial
var _debug_mode := DebugMode.BEAUTY
var _materials: Dictionary[Array, ShaderMaterial] = {}


func _init(profile: ShaderMaterial = DEFAULT_PROFILE) -> void:
	_profile = profile


func apply(root: Node) -> void:
	var floor_ao_path := _floor_ao_path(root)
	var floor_ao: Texture2D
	if not floor_ao_path.is_empty():
		if ResourceLoader.exists(floor_ao_path, "Texture2D"):
			floor_ao = ResourceLoader.load(floor_ao_path, "Texture2D") as Texture2D
		if floor_ao == null:
			push_warning("Cannot load Astra floor AO texture: " + floor_ao_path)
	_apply_materials(root, floor_ao)


func _floor_ao_path(root: Node) -> String:
	var extras: Dictionary = root.get_meta("extras", {})
	if str(extras.get("astra_version", "")) == "1" and extras.has("layout_signature"):
		return str(extras.get("astra_floor_ao", ""))
	for child in root.get_children():
		if child is Node3D:
			extras = child.get_meta("extras", {})
			if str(extras.get("astra_version", "")) == "1" and extras.has("layout_signature"):
				return str(extras.get("astra_floor_ao", ""))
	return ""


func _apply_materials(root: Node, floor_ao: Texture2D) -> void:
	var instance := root as MeshInstance3D
	if instance != null and instance.mesh != null:
		if instance.material_override != null:
			var override_source := instance.material_override as BaseMaterial3D
			if _uses_astra_profile(override_source):
				instance.material_override = create_material(override_source, floor_ao)
		else:
			for surface in instance.mesh.get_surface_count():
				var source := instance.get_active_material(surface) as BaseMaterial3D
				if _uses_astra_profile(source):
					instance.set_surface_override_material(surface, create_material(source, floor_ao))

	for child in root.get_children():
		_apply_materials(child, floor_ao)


func create_material(source: BaseMaterial3D, floor_ao: Texture2D = null) -> ShaderMaterial:
	if source.resource_name != "AstraOakGrain":
		floor_ao = null
	var material_key := [source, floor_ao]
	if _materials.has(material_key):
		return _materials[material_key]

	var material := _profile.duplicate() as ShaderMaterial
	material.resource_name = source.resource_name
	material.set_shader_parameter("surface_color", source.albedo_color)
	if source.albedo_texture != null:
		material.set_shader_parameter("use_surface_texture", true)
		material.set_shader_parameter("surface_texture", source.albedo_texture)
		material.set_shader_parameter("texture_scale", Vector2(source.uv1_scale.x, source.uv1_scale.y))
		material.set_shader_parameter("texture_offset", Vector2(source.uv1_offset.x, source.uv1_offset.y))
	if floor_ao != null:
		material.set_shader_parameter("use_floor_ao", true)
		material.set_shader_parameter("floor_ao_texture", floor_ao)
	material.set_shader_parameter("debug_mode", _debug_mode)
	_materials[material_key] = material
	return material


func set_debug_mode(mode: DebugMode) -> void:
	_debug_mode = mode
	for material: ShaderMaterial in _materials.values():
		material.set_shader_parameter("debug_mode", mode)


func _uses_astra_profile(source: BaseMaterial3D) -> bool:
	return source != null and source.resource_name.begins_with("Astra") \
		and source.transparency == BaseMaterial3D.TRANSPARENCY_DISABLED