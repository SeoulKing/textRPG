extends Node3D

## Shared toon lighting, live depth outlines and cached geometry highlights.
const Profile := preload("res://scripts/rendering/camera_pixel_profile.gd")
const SurfaceLighting := preload("res://scripts/rendering/tutorial_surface_lighting.gd")
const NormalPass := preload("res://scripts/rendering/tutorial_normal_pass.gd")
const EDGE_SHADER := preload("res://art/resources/tutorial_pixel_edges.gdshader")

var _lighting := SurfaceLighting.new()
var _normals := NormalPass.new()
var _camera: Camera3D
var _quad: MeshInstance3D
var _material := ShaderMaterial.new()
var _enabled := true
var _highlights_enabled := true


func configure(root: Node3D, camera: Camera3D) -> void:
	name = "TutorialPixelEffect"
	_camera = camera
	# Inspect the source materials before installing the toon overrides.
	_lighting.set_orthographic(camera.projection == Camera3D.PROJECTION_ORTHOGONAL)
	_lighting.configure(root)
	_normals.create(self, root, _material)
	_material.shader = EDGE_SHADER
	# This overlay samples opaque scenery. Draw it before transparent sprites and effects.
	_material.render_priority = Material.RENDER_PRIORITY_MIN
	_material.set_shader_parameter("highlight_cache", _normals.get_texture())

	var mesh := QuadMesh.new()
	mesh.size = Vector2(2.0, 2.0)
	_quad = MeshInstance3D.new()
	_quad.name = "TutorialPixelEdges"
	_quad.mesh = mesh
	_quad.material_override = _material
	_quad.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_quad.position.z = -1.0
	_quad.extra_cull_margin = 1000.0
	add_child(_quad)
	set_effect_enabled(_enabled)


func apply_profile(profile: Profile) -> void:
	_material.set_shader_parameter("outline_width", clampi(profile.outline_width, 0, 3))
	_material.set_shader_parameter("outline_strength", clampf(profile.outline_strength / 100.0, 0.0, 1.0))
	_lighting.set_stepped(profile.shade_bands)


func include_geometry(root: Node3D) -> void:
	_normals.include_geometry(root)


func set_highlights_enabled(enabled: bool) -> void:
	_highlights_enabled = enabled
	_material.set_shader_parameter("highlights_enabled", enabled)
	_normals.set_enabled(_enabled and enabled)
	sync()


func set_highlight_strength(value: float) -> void:
	_material.set_shader_parameter("highlight_strength", clampf(value, 0.0, 1.0))


func set_specular_controls(nonmetal: float, metal: float, cutoff: float) -> void:
	_lighting.set_specular_controls(nonmetal, metal, cutoff)


func set_effect_enabled(enabled: bool) -> void:
	_enabled = enabled
	_lighting.set_enabled(enabled)
	_quad.visible = enabled
	_normals.set_enabled(enabled and _highlights_enabled)


func sync() -> void:
	if _enabled and _highlights_enabled:
		_normals.sync(_camera, Vector2i(_camera.get_viewport().get_visible_rect().size))


func get_stats() -> Dictionary:
	return {"effect_enabled": _enabled, "lighting": _lighting.get_stats(), "normals": _normals.get_stats()}
