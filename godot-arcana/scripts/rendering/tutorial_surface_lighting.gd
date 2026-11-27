extends RefCounted
## Reversible per-instance toon lighting. Imported material resources stay untouched.

const SURFACE_SHADER := preload("res://art/resources/tutorial_toon_surface.gdshader")
const UNSUPPORTED_FLAGS: Array[StringName] = [
	&"normal_enabled", &"bent_normal_enabled", &"heightmap_enabled", &"detail_enabled",
	&"ao_enabled", &"clearcoat_enabled", &"rim_enabled", &"anisotropy_enabled",
	&"backlight_enabled", &"subsurf_scatter_enabled", &"subsurf_scatter_transmittance_enabled",
	&"refraction_enabled", &"proximity_fade_enabled", &"uv1_triplanar", &"uv2_triplanar",
	&"grow", &"fixed_size", &"use_point_size", &"no_depth_test", &"use_fov_override",
	&"disable_ambient_light", &"disable_receive_shadows", &"shadow_to_opacity",
	&"albedo_texture_msdf", &"albedo_texture_force_srgb", &"particle_trails_mode",
]

var _bindings: Array[Dictionary] = []
var _materials: Dictionary[BaseMaterial3D, ShaderMaterial] = {}
var _shaders: Dictionary[Vector3i, Shader] = {}
var _skip_cache: Dictionary[Material, String] = {}
var _enabled := false
var _stepped := true
var _orthographic := false
var _specular_nonmetal := 0.2
var _specular_metal := 1.0
var _specular_cutoff := 0.791
var _stats: Dictionary = {}


func configure(root: Node3D) -> void:
	var was_enabled := _enabled
	set_enabled(false)
	_bindings.clear()
	_materials.clear()
	_shaders.clear()
	_skip_cache.clear()
	_stats = {"mesh_instances": 0, "converted_surfaces": 0, "skipped_surfaces": 0,
		"skip_reasons": {}}
	if is_instance_valid(root):
		_collect(root)
	if was_enabled:
		set_enabled(true)


func set_enabled(enabled: bool) -> void:
	if _enabled == enabled:
		return
	_enabled = enabled
	for binding: Dictionary in _bindings:
		var instance := (binding["node"] as WeakRef).get_ref() as MeshInstance3D
		if not is_instance_valid(instance) or instance.mesh != binding["mesh"]:
			continue
		var surface: int = binding["surface"]
		var original := binding["original"] as Material
		var replacement := binding["replacement"] as ShaderMaterial
		var current: Material = instance.material_override if surface < 0 \
			else instance.get_surface_override_material(surface)
		# Preserve a manual material edit made after configure(), even on disable.
		var expected: Material = original if enabled else replacement
		if current != expected:
			continue
		var target: Material = replacement if enabled else original
		if surface < 0:
			instance.material_override = target
		else:
			instance.set_surface_override_material(surface, target)


func set_stepped(enabled: bool) -> void:
	_stepped = enabled
	for material: ShaderMaterial in _materials.values():
		material.set_shader_parameter("stepped_light", enabled)


func set_orthographic(enabled: bool) -> void:
	_orthographic = enabled
	for material: ShaderMaterial in _materials.values():
		material.set_shader_parameter("orthographic_view", enabled)

func set_specular_controls(nonmetal: float, metal: float, cutoff: float) -> void:
	_specular_nonmetal = clampf(nonmetal, 0.0, 1.0)
	_specular_metal = clampf(metal, 0.0, 1.0)
	_specular_cutoff = clampf(cutoff, 0.35, 0.98)
	for material: ShaderMaterial in _materials.values():
		material.set_shader_parameter("specular_nonmetal", _specular_nonmetal)
		material.set_shader_parameter("specular_metal", _specular_metal)
		material.set_shader_parameter("specular_cutoff", _specular_cutoff)

func get_stats() -> Dictionary:
	var result := _stats.duplicate(true)
	result["enabled"] = _enabled
	result["stepped"] = _stepped
	result["unique_materials"] = _materials.size()
	result["specular"] = {"nonmetal": _specular_nonmetal, "metal": _specular_metal, "cutoff": _specular_cutoff}
	return result


func _collect(node: Node) -> void:
	if node is Viewport:
		return
	var instance := node as MeshInstance3D
	if instance != null and instance.mesh != null:
		_stats["mesh_instances"] += 1
		var surface_count := instance.mesh.get_surface_count()
		# A geometry override supersedes every surface; never replace hidden slots.
		if instance.material_override != null:
			_add_binding(instance, -1, instance.material_override, surface_count)
		else:
			for surface in surface_count:
				_add_binding(instance, surface, instance.get_active_material(surface), 1)
	for child in node.get_children():
		_collect(child)


func _add_binding(instance: MeshInstance3D, surface: int, source: Material, count: int) -> void:
	var reason := _unsupported_reason(source)
	if not reason.is_empty():
		_stats["skipped_surfaces"] += count
		var reasons: Dictionary = _stats["skip_reasons"]
		reasons[reason] = int(reasons.get(reason, 0)) + count
		return
	var original: Material = instance.material_override if surface < 0 \
		else instance.get_surface_override_material(surface)
	_bindings.append({"node": weakref(instance), "mesh": instance.mesh, "surface": surface,
		"original": original, "replacement": _convert(source as BaseMaterial3D)})
	_stats["converted_surfaces"] += count


func _unsupported_reason(source: Material) -> String:
	if source == null:
		return "missing_material"
	if _skip_cache.has(source):
		return _skip_cache[source]
	var reason := _inspect_material(source)
	_skip_cache[source] = reason
	return reason


func _inspect_material(source: Material) -> String:
	if not source is BaseMaterial3D:
		return "shader_or_custom_material"
	if source is ORMMaterial3D:
		return "orm_material"
	var base := source as BaseMaterial3D
	if base.transparency != BaseMaterial3D.TRANSPARENCY_DISABLED:
		return "transparent_material"
	if base.shading_mode != BaseMaterial3D.SHADING_MODE_PER_PIXEL:
		return "unshaded_or_vertex_lit"
	if source.next_pass != null:
		return "next_pass"
	if base.blend_mode != BaseMaterial3D.BLEND_MODE_MIX \
		or base.depth_draw_mode != BaseMaterial3D.DEPTH_DRAW_OPAQUE_ONLY:
		return "custom_blend_or_depth"
	if base.billboard_mode != BaseMaterial3D.BILLBOARD_DISABLED \
		or base.distance_fade_mode != BaseMaterial3D.DISTANCE_FADE_DISABLED:
		return "billboard_or_distance_fade"
	if base.emission_enabled and ProjectSettings.get_setting(
		"rendering/lights_and_shadows/use_physical_light_units", false):
		return "physical_emission"
	# Checking exposed properties also tolerates engine-specific feature additions.
	for property: Dictionary in base.get_property_list():
		var property_name := StringName(property["name"])
		if property_name in UNSUPPORTED_FLAGS and bool(base.get(property_name)):
			return String(property_name)
	return ""


func _convert(source: BaseMaterial3D) -> ShaderMaterial:
	if _materials.has(source):
		return _materials[source]
	var material := ShaderMaterial.new()
	material.resource_name = source.resource_name + " | tutorial lighting"
	material.render_priority = source.render_priority
	material.shader = _shader_for(source)
	material.set_meta(&"arcana_edge_cull_mode", source.cull_mode)
	var parameters := {
		"surface_color": source.albedo_color,
		"surface_texture": source.albedo_texture,
		"use_surface_texture": source.albedo_texture != null,
		"use_vertex_color": source.vertex_color_use_as_albedo,
		"vertex_color_is_srgb": source.vertex_color_is_srgb,
		"uv1_scale": Vector2(source.uv1_scale.x, source.uv1_scale.y),
		"uv1_offset": Vector2(source.uv1_offset.x, source.uv1_offset.y),
		"uv2_scale": Vector2(source.uv2_scale.x, source.uv2_scale.y),
		"uv2_offset": Vector2(source.uv2_offset.x, source.uv2_offset.y),
		"surface_roughness": source.roughness,
		"roughness_texture": source.roughness_texture,
		"use_roughness_texture": source.roughness_texture != null,
		"roughness_channel": _channel_mask(source.roughness_texture_channel),
		"surface_metallic": source.metallic,
		"metallic_texture": source.metallic_texture,
		"use_metallic_texture": source.metallic_texture != null,
		"metallic_channel": _channel_mask(source.metallic_texture_channel),
		"surface_specular": source.metallic_specular,
		"use_specular": source.specular_mode != BaseMaterial3D.SPECULAR_DISABLED,
		"emission_enabled": source.emission_enabled,
		"emission_color": source.emission,
		"emission_energy": source.emission_energy_multiplier,
		"emission_texture": source.emission_texture,
		"use_emission_texture": source.emission_texture != null,
		"emission_multiply": source.emission_operator == BaseMaterial3D.EMISSION_OP_MULTIPLY,
		"emission_on_uv2": source.emission_on_uv2,
		"stepped_light": _stepped,
		"orthographic_view": _orthographic,
		"specular_nonmetal": _specular_nonmetal,
		"specular_metal": _specular_metal,
		"specular_cutoff": _specular_cutoff,
	}
	for parameter: String in parameters:
		material.set_shader_parameter(parameter, parameters[parameter])
	_materials[source] = material
	return material


func _shader_for(source: BaseMaterial3D) -> Shader:
	var key := Vector3i(source.cull_mode, source.texture_filter, int(source.texture_repeat))
	if _shaders.has(key):
		return _shaders[key]
	var culling: Array[String] = ["cull_back", "cull_front", "cull_disabled"]
	var filters: Array[String] = ["filter_nearest", "filter_linear",
		"filter_nearest_mipmap", "filter_linear_mipmap",
		"filter_nearest_mipmap_anisotropic", "filter_linear_mipmap_anisotropic"]
	var shader := Shader.new()
	var code := SURFACE_SHADER.code.replace("cull_back", culling[source.cull_mode])
	code = code.replace("filter_linear_mipmap", filters[source.texture_filter])
	if not source.texture_repeat:
		code = code.replace("repeat_enable", "repeat_disable")
	shader.code = code
	_shaders[key] = shader
	return shader


func _channel_mask(channel: int) -> Vector4:
	match channel:
		BaseMaterial3D.TEXTURE_CHANNEL_GREEN:
			return Vector4(0.0, 1.0, 0.0, 0.0)
		BaseMaterial3D.TEXTURE_CHANNEL_BLUE:
			return Vector4(0.0, 0.0, 1.0, 0.0)
		BaseMaterial3D.TEXTURE_CHANNEL_ALPHA:
			return Vector4(0.0, 0.0, 0.0, 1.0)
		BaseMaterial3D.TEXTURE_CHANNEL_GRAYSCALE:
			return Vector4(1.0 / 3.0, 1.0 / 3.0, 1.0 / 3.0, 0.0)
		_:
			return Vector4(1.0, 0.0, 0.0, 0.0)
