extends RefCounted

const NORMAL_SHADER := preload("res://art/resources/tutorial_surface_normals.gdshader")
const RESOLVE_SHADER := preload("res://art/resources/tutorial_highlight_cache.gdshader")
const SKIP_SURFACE := -1
const EDGE_CULL_MODE := &"arcana_edge_cull_mode"
const EDGE_PROXY_MATERIAL := &"arcana_edge_proxy_material"
const STATIC_EDGE_GRID := &"arcana_static_edge_grid"
const SKIP_CACHED_EDGES := &"local_mesh_highlights"
# Cache a complete room when possible. Larger regions use overlapping full-resolution windows.
const CACHE_SIDE := 1536
const CACHE_MARGIN := 2

class MeshPair:
	var source: Node3D
	var proxy: MeshInstance3D

var _viewport: SubViewport
var _camera: Camera3D
var _meshes: Array[MeshPair] = []
var _geometry_sources: Dictionary = {}
var _materials: Dictionary = {}
var _surface_count := 0
var _skipped_surface_count := 0
var _skipped_skinned_mesh_count := 0
var _enabled := true
var _dirty := true
var _composite: ShaderMaterial
var _projected_bounds := AABB()
var _cache_region := Rect2i()
var _texel_size := 0.0
var _capture_count := 0
var _last_uv_scale := Vector2.ZERO
var _last_uv_offset := Vector2.ZERO
var _last_depth_map := Vector2.ZERO


func create(parent: Node, source_root: Node3D, composite: ShaderMaterial) -> void:
	if is_instance_valid(_viewport):
		_viewport.render_target_update_mode = SubViewport.UPDATE_DISABLED
		_viewport.queue_free()
	_meshes.clear()
	_geometry_sources.clear()
	_surface_count = 0
	_skipped_surface_count = 0
	_skipped_skinned_mesh_count = 0
	_dirty = true

	_composite = composite
	_last_uv_scale = Vector2.ZERO
	_last_uv_offset = Vector2.ZERO
	_last_depth_map = Vector2.ZERO
	_cache_region = Rect2i()
	_texel_size = 0.0
	_capture_count = 0
	_viewport = SubViewport.new()
	_viewport.name = "GeometryHighlightCache"
	_viewport.world_3d = World3D.new()
	_viewport.own_world_3d = true
	_viewport.transparent_bg = true
	_viewport.gui_disable_input = true
	_viewport.msaa_3d = Viewport.MSAA_DISABLED
	_viewport.screen_space_aa = Viewport.SCREEN_SPACE_AA_DISABLED
	_viewport.use_taa = false
	_viewport.use_debanding = false
	_viewport.positional_shadow_atlas_size = 0
	_viewport.render_target_update_mode = SubViewport.UPDATE_DISABLED
	parent.add_child(_viewport)

	_camera = Camera3D.new()
	# Data colors must not inherit fog, glow or exposure from the game environment.
	_camera.environment = Environment.new()
	_camera.environment.background_mode = Environment.BG_COLOR
	_camera.environment.background_color = Color.BLACK
	_viewport.add_child(_camera)
	_camera.make_current()
	_collect_geometry(source_root)
	var quad := MeshInstance3D.new()
	var screen := QuadMesh.new()
	screen.size = Vector2(2, 2)
	quad.mesh = screen
	var resolve := ShaderMaterial.new()
	resolve.shader = RESOLVE_SHADER
	quad.material_override = resolve
	quad.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	quad.layers = (1 << 20) - 1
	quad.extra_cull_margin = 1000.0
	_camera.add_child(quad)
	quad.position.z = -1.0


func include_geometry(root: Node3D) -> void:
	var previous_count := _meshes.size()
	_collect_geometry(root)
	if _meshes.size() != previous_count:
		_dirty = true


func set_enabled(enabled: bool) -> void:
	if _enabled == enabled:
		return
	_enabled = enabled
	_dirty = true
	if not enabled and is_instance_valid(_viewport):
		_viewport.render_target_update_mode = SubViewport.UPDATE_DISABLED
		_composite.set_shader_parameter("cache_ready", false)


func get_texture() -> ViewportTexture:
	return _viewport.get_texture() if is_instance_valid(_viewport) else null


func get_stats() -> Dictionary:
	return {
		"mesh_count": _meshes.size(),
		"cache_size": _viewport.size,
		"scheduled_captures": _capture_count,
		"surface_count": _surface_count,
		"skipped_surface_count": _skipped_surface_count,
		"skipped_skinned_mesh_count": _skipped_skinned_mesh_count,
	}


func sync(camera: Camera3D, size: Vector2i) -> void:
	if not _enabled or not is_instance_valid(_viewport):
		return
	var raster_size := size.max(Vector2i(2, 2))
	for pair in _meshes:
		if _sync_mesh(pair):
			_dirty = true
	if _camera.cull_mask != camera.cull_mask or _viewport.mesh_lod_threshold != camera.get_viewport().mesh_lod_threshold:
		_camera.cull_mask = camera.cull_mask
		_viewport.mesh_lod_threshold = camera.get_viewport().mesh_lod_threshold
		_dirty = true
	if camera.projection == Camera3D.PROJECTION_ORTHOGONAL:
		_sync_world_frame(camera, raster_size)
	else:
		# Perspective rays change with translation. Match the source projection in that case.
		_cache_region = Rect2i()
		if _viewport.size != raster_size:
			_viewport.size = raster_size
			_dirty = true
		if _sync_camera(camera):
			_dirty = true
		_set_mapping(Vector2.ONE, Vector2.ZERO, Vector2(1, 0))
	if _dirty:
		# This child viewport renders its opaque normals and resolves them before its parent samples it.
		_viewport.render_target_update_mode = SubViewport.UPDATE_ONCE
		_composite.set_shader_parameter("cache_ready", true)
		_capture_count += 1
		_dirty = false


func _sync_world_frame(source: Camera3D, raster_size: Vector2i) -> void:
	var pose := source.get_camera_transform()
	var basis := pose.basis
	var axis_size := raster_size.x if source.keep_aspect == Camera3D.KEEP_WIDTH else raster_size.y
	var texel := source.size / float(axis_size)
	if _camera.projection != Camera3D.PROJECTION_ORTHOGONAL or not _camera.global_basis.is_equal_approx(basis):
		_dirty = true
	if _dirty:
		_projected_bounds = _geometry_bounds(basis)
	if not is_equal_approx(texel, _texel_size) or _cache_region.size == Vector2i.ZERO:
		_texel_size = texel
		_dirty = true
	# These coordinates measure texels from the world origin, with +Y up.
	var lo := Vector2(_projected_bounds.position.x, _projected_bounds.position.y) / _texel_size
	var hi := Vector2(_projected_bounds.end.x, _projected_bounds.end.y) / _texel_size
	var full := Rect2i(Vector2i(lo.floor()), Vector2i(hi.ceil()) - Vector2i(lo.floor())).grow(CACHE_MARGIN)
	var view_center := basis.inverse() * pose.origin
	var center_px := Vector2(view_center.x, view_center.y) / _texel_size
	var view_min := center_px - Vector2(raster_size) * 0.5
	var visible_region := Rect2i(Vector2i(view_min.floor()), raster_size + Vector2i.ONE).grow(CACHE_MARGIN)
	var capacity := Vector2i(CACHE_SIDE, CACHE_SIDE).max(raster_size + Vector2i.ONE * 2 * (CACHE_MARGIN + 1))
	var cache_size := full.size.min(capacity)
	var wanted := full.intersection(visible_region)
	if _dirty or _cache_region.size != cache_size or (wanted.has_area() and not _cache_region.encloses(wanted)):
		var origin := Vector2i((center_px - Vector2(cache_size) * 0.5).floor())
		_cache_region = Rect2i(origin.clamp(full.position, full.end - cache_size), cache_size)
		_viewport.size = cache_size
		var center := (Vector2(_cache_region.position) + Vector2(cache_size) * 0.5) * _texel_size
		var cache_position := Vector3(center.x, center.y, _projected_bounds.end.z + 1.0)
		_camera.h_offset = 0.0
		_camera.v_offset = 0.0
		_camera.keep_aspect = Camera3D.KEEP_HEIGHT
		_camera.set_orthogonal(_texel_size * cache_size.y, 0.05, _projected_bounds.size.z + 2.0)
		_camera.global_transform = Transform3D(basis, basis * cache_position)
		_dirty = true
	var cache_span := _camera.far - _camera.near
	var delta := basis.inverse() * (pose.origin - _camera.global_position)
	var cache_extent := Vector2(_viewport.size) * _texel_size
	var uv_scale := Vector2(raster_size) * texel / cache_extent
	var uv_offset := (Vector2.ONE - uv_scale) * 0.5 + Vector2(delta.x, -delta.y) / cache_extent
	# Reversed orthographic depth is affine along the common view axis.
	var depth_map := Vector2(source.far - source.near, _camera.far - source.far + delta.z) / cache_span
	_set_mapping(uv_scale, uv_offset, depth_map)


func _geometry_bounds(basis: Basis) -> AABB:
	var to_view := Transform3D(basis.inverse(), Vector3.ZERO)
	var bounds := AABB()
	var first := true
	for pair in _meshes:
		if pair.proxy.visible and (pair.proxy.layers & _camera.cull_mask) != 0:
			var box := (to_view * pair.proxy.global_transform) * pair.proxy.get_aabb()
			bounds = box if first else bounds.merge(box)
			first = false
	return bounds


func _set_mapping(uv_scale: Vector2, uv_offset: Vector2, depth_map: Vector2) -> void:
	if uv_scale != _last_uv_scale:
		_composite.set_shader_parameter("cache_uv_scale", uv_scale)
		_last_uv_scale = uv_scale
	if uv_offset != _last_uv_offset:
		_composite.set_shader_parameter("cache_uv_offset", uv_offset)
		_last_uv_offset = uv_offset
	if depth_map != _last_depth_map:
		_composite.set_shader_parameter("cache_depth_scale_offset", depth_map)
		_last_depth_map = depth_map


func _collect_geometry(node: Node) -> void:
	if node is Viewport or node.get_meta(SKIP_CACHED_EDGES, false):
		return
	if node is MeshInstance3D or (node is GridMap and node.get_meta(STATIC_EDGE_GRID, false)):
		var source_id := node.get_instance_id()
		if not _geometry_sources.has(source_id):
			_geometry_sources[source_id] = true
			if node is MeshInstance3D:
				_add_mesh(node)
			else:
				_add_grid(node as GridMap)
	for child in node.get_children():
		_collect_geometry(child)


func _add_mesh(source: MeshInstance3D) -> void:
	if source.mesh == null or source.cast_shadow == GeometryInstance3D.SHADOW_CASTING_SETTING_SHADOWS_ONLY:
		return
	if source.skin != null or source.get_node_or_null(source.skeleton) is Skeleton3D:
		_skipped_skinned_mesh_count += 1
		return

	var materials: Array[ShaderMaterial] = []
	var supported_surfaces := 0
	for surface in source.mesh.get_surface_count():
		var material := _normal_surface_material(source.get_active_material(surface))
		materials.append(material)
		if material != null:
			supported_surfaces += 1
	_surface_count += supported_surfaces
	_skipped_surface_count += materials.size() - supported_surfaces
	if supported_surfaces == 0:
		return

	var proxy := MeshInstance3D.new()
	proxy.mesh = source.mesh
	proxy.lod_bias = source.lod_bias
	for surface in materials.size():
		var material := materials[surface]
		if material == null:
			material = _normal_material(SKIP_SURFACE)
		proxy.set_surface_override_material(surface, material)
	_register_proxy(source, proxy)


func _add_grid(source: GridMap) -> void:
	# The finished grid is static. Bake its local cell transforms into one proxy mesh.
	var cell_meshes: Array = source.get_meshes()
	var batches: Dictionary = {}
	for i in range(0, cell_meshes.size(), 2):
		var cell_transform: Transform3D = cell_meshes[i]
		var cell_mesh: Mesh = cell_meshes[i + 1]
		for surface in cell_mesh.get_surface_count():
			var material := _normal_surface_material(cell_mesh.surface_get_material(surface))
			if material == null:
				_skipped_surface_count += 1
				continue
			_surface_count += 1
			var batch: SurfaceTool = batches.get(material)
			if batch == null:
				batch = SurfaceTool.new()
				batch.begin(Mesh.PRIMITIVE_TRIANGLES)
				batches[material] = batch
			batch.append_from(cell_mesh, surface, cell_transform)
	if batches.is_empty():
		return
	var mesh := ArrayMesh.new()
	for material: ShaderMaterial in batches:
		var batch: SurfaceTool = batches[material]
		batch.set_material(material)
		batch.commit(mesh)
	var proxy := MeshInstance3D.new()
	proxy.mesh = mesh
	_register_proxy(source, proxy)


func _register_proxy(source: Node3D, proxy: MeshInstance3D) -> void:
	proxy.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	proxy.hide()
	_viewport.add_child(proxy)

	var pair := MeshPair.new()
	pair.source = source
	pair.proxy = proxy
	_meshes.append(pair)


func _normal_surface_material(material: Material) -> ShaderMaterial:
	if material is BaseMaterial3D:
		var base := material as BaseMaterial3D
		if base.transparency == BaseMaterial3D.TRANSPARENCY_DISABLED:
			return _normal_material(base.cull_mode)
	elif material is ShaderMaterial:
		if material.has_meta(EDGE_PROXY_MATERIAL):
			var proxy := material.get_meta(EDGE_PROXY_MATERIAL) as ShaderMaterial
			if proxy != null:
				return proxy
		var cull_mode: int = int(material.get_meta(EDGE_CULL_MODE, SKIP_SURFACE))
		if cull_mode >= BaseMaterial3D.CULL_BACK and cull_mode <= BaseMaterial3D.CULL_DISABLED:
			return _normal_material(cull_mode)
	return null


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
	var visible := is_instance_valid(source) and source.is_visible_in_tree()
	var layers := 1
	if visible and source is GeometryInstance3D:
		var geometry := source as GeometryInstance3D
		visible = is_zero_approx(geometry.transparency)
		layers = geometry.layers
	var changed := proxy.visible != visible
	if changed:
		proxy.visible = visible
	if visible and (proxy.global_transform != source.global_transform or proxy.layers != layers):
		proxy.global_transform = source.global_transform
		proxy.layers = layers
		changed = true
	return changed
