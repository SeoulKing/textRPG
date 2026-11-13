extends Node

const MASK_SHADER = preload("res://art/resources/shop_asset_mask.gdshader")
const FURNITURE_OUTLINE = preload("res://art/resources/shop_furniture_outline.gdshader")
const MASK_LAYER = 20
const MAX_ASSET_ID = 10

var _viewport: SubViewport
var _camera: Camera3D
var _source_camera: Camera3D
var _edge_material: ShaderMaterial
var _proxies: Node3D
var _active := true
var _light_world := Vector4.ZERO
var _highlight_direction_world := Vector3.ZERO
var _materials: Array[ShaderMaterial] = []
var _moving_proxies: Array[Dictionary] = []


func setup(geometry: Node3D, camera: Camera3D, edge_material: ShaderMaterial,
		outlined_assets: Array[StringName] = []) -> void:
	var assets: Array[Node] = []
	var asset_root: Node3D = geometry.split_room if geometry.authored_scene_active and is_instance_valid(geometry.split_room) else geometry.get_node("Structure")
	var furniture := asset_root.find_child("Furniture", true, false)
	if furniture != null:
		assets.append_array(furniture.get_children())
	var lamp := asset_root.get_node_or_null("FloorLamp")
	if lamp == null:
		lamp = asset_root.find_child("Floor Lamp - move this", true, false)
	if lamp != null:
		assets.append(lamp)
	var crate := geometry.get_node_or_null("WoodenCrate_Test") as Node3D
	if crate != null:
		assets.append(crate)
	setup_assets(assets, camera, edge_material, outlined_assets)


func setup_assets(assets: Array[Node], camera: Camera3D, edge_material: ShaderMaterial,
		outlined_assets: Array[StringName] = [], highlight_direction_world := Vector3.ZERO,
		moving_asset: Node3D = null) -> void:
	_source_camera = camera
	_edge_material = edge_material
	_highlight_direction_world = highlight_direction_world.normalized()
	if _viewport == null:
		_create_viewport()
	_materials.clear()
	_moving_proxies.clear()
	for child in _proxies.get_children():
		_proxies.remove_child(child)
		child.queue_free()

	var outlined_groups := 0
	for index in mini(assets.size(), MAX_ASSET_ID):
		var asset := assets[index]
		_add_asset(asset, index + 1, asset == moving_asset)
		if outlined_assets.has(asset.name):
			outlined_groups |= 1 << index
	_edge_material.set_shader_parameter("asset_outline_groups", outlined_groups)
	_edge_material.set_shader_parameter("asset_mask_texture", _viewport.get_texture())
	sync()


func set_light(world_position: Vector3, radius: float) -> void:
	var light := Vector4(world_position.x, world_position.y, world_position.z, radius)
	if _light_world == light:
		return
	_light_world = light
	for material in _materials:
		material.set_shader_parameter("light_world", _light_world)


func set_active(enabled: bool) -> void:
	if _active == enabled:
		return
	_active = enabled
	sync()


func sync() -> void:
	if _viewport == null:
		return
	var enabled := _active and _source_camera.is_visible_in_tree()
	_edge_material.set_shader_parameter("asset_mask_enabled", enabled)
	_viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS if enabled else SubViewport.UPDATE_DISABLED
	if not enabled:
		return

	var size := Vector2i(_source_camera.get_viewport().get_visible_rect().size).max(Vector2i(2, 2))
	if _viewport.size != size:
		_viewport.size = size
	_camera.global_transform = _source_camera.global_transform
	_camera.keep_aspect = _source_camera.keep_aspect
	_camera.projection = _source_camera.projection
	_camera.size = _source_camera.size
	_camera.near = _source_camera.near
	_camera.far = _source_camera.far
	_camera.h_offset = _source_camera.h_offset
	_camera.v_offset = _source_camera.v_offset
	for pair in _moving_proxies:
		var source := pair.source as MeshInstance3D
		var proxy := pair.proxy as MeshInstance3D
		proxy.global_transform = source.global_transform
		proxy.visible = source.is_visible_in_tree()


func _create_viewport() -> void:
	_viewport = SubViewport.new()
	_viewport.name = "AssetMaskViewport"
	_viewport.world_3d = _source_camera.get_viewport().find_world_3d()
	_viewport.positional_shadow_atlas_size = 0
	_viewport.render_target_update_mode = SubViewport.UPDATE_DISABLED
	add_child(_viewport)

	var mask_environment := Environment.new()
	mask_environment.background_mode = Environment.BG_COLOR
	mask_environment.background_color = Color.BLACK
	_camera = Camera3D.new()
	_camera.environment = mask_environment
	_camera.cull_mask = 0
	_camera.set_cull_mask_value(MASK_LAYER, true)
	_source_camera.set_cull_mask_value(MASK_LAYER, false)
	_viewport.add_child(_camera)
	_camera.make_current()

	_proxies = Node3D.new()
	_proxies.name = "AssetMaskMeshes"
	_viewport.add_child(_proxies)


func _add_asset(node: Node, asset_id: int, moves: bool) -> void:
	# The display bottles move with their cabinet and keep their transparent rendering.
	if node.name == &"DisplayPotions":
		return
	if node is Node3D and not node.visible:
		return
	if node is MeshInstance3D and node.mesh != null \
			and node.cast_shadow != GeometryInstance3D.SHADOW_CASTING_SETTING_SHADOWS_ONLY:
		if node.name != &"LampGlow" and node.name != &"LampLightVolume":
			var proxy := MeshInstance3D.new()
			proxy.mesh = node.mesh
			proxy.layers = 0
			proxy.set_layer_mask_value(MASK_LAYER, true)
			proxy.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			var solid := ShaderMaterial.new()
			solid.shader = MASK_SHADER
			solid.set_shader_parameter("asset_id", float(asset_id))
			solid.set_shader_parameter("light_world", _light_world)
			solid.set_shader_parameter("highlight_direction_world", _highlight_direction_world)
			_materials.append(solid)
			for surface in node.mesh.get_surface_count():
				proxy.set_surface_override_material(surface, _surface_mask(node.get_active_material(surface), solid))
			_proxies.add_child(proxy)
			proxy.global_transform = node.global_transform
			if moves:
				_moving_proxies.append({"source": node, "proxy": proxy})
	for child in node.get_children():
		_add_asset(child, asset_id, moves)


func _surface_mask(source: Material, solid: ShaderMaterial) -> ShaderMaterial:
	var cutout: Texture2D
	var threshold := 0.5
	if source is ShaderMaterial and source.shader == FURNITURE_OUTLINE:
		cutout = source.get_shader_parameter("face_art") as Texture2D
	elif source is BaseMaterial3D and source.transparency == BaseMaterial3D.TRANSPARENCY_ALPHA_SCISSOR:
		cutout = source.albedo_texture
		threshold = source.alpha_scissor_threshold
	if cutout == null:
		return solid
	var material := solid.duplicate() as ShaderMaterial
	material.set_shader_parameter("cutout_texture", cutout)
	material.set_shader_parameter("alpha_cutout", true)
	material.set_shader_parameter("alpha_threshold", threshold)
	_materials.append(material)
	return material
