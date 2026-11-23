extends RefCounted

const NORMAL_SHADER := preload("res://art/resources/tutorial_surface_normals.gdshader")
const SKIP_SURFACE := -1

class MeshPair:
	var source: MeshInstance3D
	var proxy: MeshInstance3D

var _viewport: SubViewport
var _camera: Camera3D
var _meshes: Array[MeshPair] = []
var _materials: Dictionary = {}
var _surface_count := 0
var _skipped_surface_count := 0
var _skipped_skinned_mesh_count := 0
var _enabled := true
var _dirty := true


func create(parent: Node, source_root: Node3D) -> void:
	if is_instance_valid(_viewport):
		_viewport.render_target_update_mode = SubViewport.UPDATE_DISABLED
		_viewport.queue_free()
	_meshes.clear()
	_surface_count = 0
	_skipped_surface_count = 0
	_skipped_skinned_mesh_count = 0
	_dirty = true

	_viewport = SubViewport.new()
	_viewport.name = "TutorialNormals"
	_viewport.world_3d = World3D.new()
	_viewport.own_world_3d = true
	_viewport.transparent_bg = true
	_viewport.gui_disable_input = true
	_viewport.positional_shadow_atlas_size = 0
	_viewport.render_target_update_mode = SubViewport.UPDATE_DISABLED
	parent.add_child(_viewport)

	_camera = Camera3D.new()
	_viewport.add_child(_camera)
	_camera.make_current()
	_collect_geometry(source_root)


func set_enabled(enabled: bool) -> void:
	if _enabled == enabled:
		return
	_enabled = enabled
	_dirty = true
	if not enabled and is_instance_valid(_viewport):
		_viewport.render_target_update_mode = SubViewport.UPDATE_DISABLED


func get_texture() -> ViewportTexture:
	return _viewport.get_texture() if is_instance_valid(_viewport) else null


func get_stats() -> Dictionary:
	return {
		"mesh_count": _meshes.size(),
		"surface_count": _surface_count,
		"skipped_surface_count": _skipped_surface_count,
		"skipped_skinned_mesh_count": _skipped_skinned_mesh_count,
	}


func sync(camera: Camera3D, size: Vector2i) -> void:
	if not _enabled or not is_instance_valid(_viewport):
		return
	var raster_size := size.max(Vector2i(2, 2))
	if _viewport.size != raster_size:
		_viewport.size = raster_size
		_dirty = true
	if _sync_camera(camera):
		_dirty = true
	for pair in _meshes:
		if _sync_mesh(pair):
			_dirty = true
	if _dirty:
		_viewport.render_target_update_mode = SubViewport.UPDATE_ONCE
		_dirty = false


func _collect_geometry(node: Node) -> void:
	if node is Viewport:
		return
	if node is MeshInstance3D:
		_add_mesh(node)
	for child in node.get_children():
		_collect_geometry(child)


func _add_mesh(source: MeshInstance3D) -> void:
	if source.mesh == null or source.cast_shadow == GeometryInstance3D.SHADOW_CASTING_SETTING_SHADOWS_ONLY:
		return
	if source.skin != null or source.get_node_or_null(source.skeleton) is Skeleton3D:
		_skipped_skinned_mesh_count += 1
		return

	var modes := PackedInt32Array()
	var supported_surfaces := 0
	for surface in source.mesh.get_surface_count():
		var material := source.get_active_material(surface) as BaseMaterial3D
		if material != null and material.transparency == BaseMaterial3D.TRANSPARENCY_DISABLED:
			modes.append(material.cull_mode)
			supported_surfaces += 1
		else:
			modes.append(SKIP_SURFACE)
	_surface_count += supported_surfaces
	_skipped_surface_count += modes.size() - supported_surfaces
	if supported_surfaces == 0:
		return

	var proxy := MeshInstance3D.new()
	proxy.mesh = source.mesh
	proxy.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	proxy.lod_bias = source.lod_bias
	proxy.hide()
	for surface in modes.size():
		proxy.set_surface_override_material(surface, _normal_material(modes[surface]))
	_viewport.add_child(proxy)

	var pair := MeshPair.new()
	pair.source = source
	pair.proxy = proxy
	_meshes.append(pair)


func _normal_material(cull_mode: int) -> ShaderMaterial:
	if not _materials.has(cull_mode):
		var material := ShaderMaterial.new()
		material.shader = NORMAL_SHADER
		material.set_shader_parameter("cull_mode", cull_mode)
		_materials[cull_mode] = material
	return _materials[cull_mode]


func _sync_camera(source: Camera3D) -> bool:
	if _camera.global_transform == source.global_transform \
			and _camera.projection == source.projection \
			and _camera.keep_aspect == source.keep_aspect \
			and _camera.cull_mask == source.cull_mask \
			and _camera.fov == source.fov and _camera.size == source.size \
			and _camera.near == source.near and _camera.far == source.far \
			and _camera.frustum_offset == source.frustum_offset \
			and _camera.h_offset == source.h_offset and _camera.v_offset == source.v_offset:
		return false
	_camera.global_transform = source.global_transform
	_camera.projection = source.projection
	_camera.keep_aspect = source.keep_aspect
	_camera.cull_mask = source.cull_mask
	_camera.fov = source.fov
	_camera.size = source.size
	_camera.near = source.near
	_camera.far = source.far
	_camera.frustum_offset = source.frustum_offset
	_camera.h_offset = source.h_offset
	_camera.v_offset = source.v_offset
	return true


func _sync_mesh(pair: MeshPair) -> bool:
	var source := pair.source
	var proxy := pair.proxy
	var visible := is_instance_valid(source) and source.is_visible_in_tree() and is_zero_approx(source.transparency)
	var changed := proxy.visible != visible
	proxy.visible = visible
	if visible and (proxy.global_transform != source.global_transform or proxy.layers != source.layers):
		proxy.global_transform = source.global_transform
		proxy.layers = source.layers
		changed = true
	return changed
