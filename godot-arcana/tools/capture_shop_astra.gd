extends SceneTree
## Render the authored shop and its material passes without loading the game.

const Renderer = preload("res://scripts/native_2d_world.gd")
const Layout = preload("res://scripts/shop_layout_2d.gd")
const AstraLook = preload("res://scripts/shop_astra_look.gd")
const AstraSurface = preload("res://art/resources/shop_astra_surface.gdshader")
const DEFAULT_SCENE := "res://scenes/shop_astra_reference.tscn"
const LEGACY_SCENE := "res://scenes/shop_3d.tscn"
const OUTPUT_SIZE := Vector2i(1280, 800)
const PIXEL_SIZE := 2

var output: SubViewport


func _initialize() -> void:
	call_deferred("_capture")


func _capture() -> void:
	root.position = Vector2i(-32000, -32000)
	var target := OS.get_environment("ARCANA_ASTRA_CAPTURE_DIR")
	if target.is_empty():
		push_error("ARCANA_ASTRA_CAPTURE_DIR is required")
		quit(1)
		return
	if not target.is_absolute_path():
		target = ProjectSettings.globalize_path("res://" + target)
	var directory_error := DirAccess.make_dir_recursive_absolute(target)
	if directory_error != OK:
		push_error("Cannot create capture directory %s (error %d)" % [target, directory_error])
		quit(1)
		return
	var scene_path := OS.get_environment("ARCANA_ASTRA_CAPTURE_SCENE")
	if scene_path.is_empty():
		scene_path = DEFAULT_SCENE
	var is_legacy := scene_path == LEGACY_SCENE
	var packed_scene := load(scene_path) as PackedScene
	if packed_scene == null:
		push_error("Cannot load Astra capture scene: " + scene_path)
		quit(1)
		return

	output = SubViewport.new()
	output.size = OUTPUT_SIZE
	output.disable_3d = true
	output.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	root.add_child(output)
	var world_view := SubViewport.new()
	world_view.size = Renderer.shop_raster_size(OUTPUT_SIZE, PIXEL_SIZE)
	world_view.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	world_view.canvas_item_default_texture_filter = Viewport.DEFAULT_CANVAS_ITEM_TEXTURE_FILTER_NEAREST
	output.add_child(world_view)
	var presenter := TextureRect.new()
	presenter.texture = world_view.get_texture()
	presenter.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	presenter.stretch_mode = TextureRect.STRETCH_SCALE
	presenter.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	presenter.size = Vector2(Renderer.shop_presentation_size(world_view.size, PIXEL_SIZE))
	output.add_child(presenter)

	var shop: Node = packed_scene.instantiate()
	world_view.add_child(shop)
	var geometry: Node = shop.get_node_or_null("Geometry")
	if geometry == null or not geometry.get("authored_scene_active"):
		push_error("Authored shop geometry is unavailable in " + scene_path)
		quit(1)
		return
	if not is_legacy and (not geometry.get("astra_active") or not geometry.has_method("set_astra_debug_mode")):
		push_error("Astra authored geometry is unavailable in " + scene_path)
		quit(1)
		return

	# Use the preview's native character source and its normal Sprite3D anchor.
	shop.enable_walkable_preview(true)
	shop.set_physics_process(false)
	var hero: Node2D = shop.preview_hero
	hero.pose(0.0, 0.0, false, Vector2.ZERO, true, true, false, Vector2.UP)
	var player_point := Vector2(12.9, 9.6) * Layout.UNIT
	var focus: Vector2 = shop.preview_point
	shop._frame(focus, 1.0, true)
	shop._sync_actor(shop.avatar, hero, player_point)
	if is_legacy:
		var legacy_saved := await _save_capture(target.path_join("legacy-overview.png"))
		quit(0 if legacy_saved else 1)
		return

	var materials := _count_astra_materials(geometry)
	print("ASTRA scene=", scene_path, " active=", geometry.astra_active,
		" authored=", geometry.authored_scene_active, " materials=", materials,
		" floor_bounds=", geometry.floor_bounds, " output=", output.size, " raster=", world_view.size)
	if materials == 0:
		push_error("The authored room has no Astra surface materials")
		quit(1)
		return

	var passes := {
		AstraLook.DebugMode.BEAUTY: "astra-overview.png",
		AstraLook.DebugMode.ALBEDO: "astra-albedo.png",
		AstraLook.DebugMode.DIRECT: "astra-direct.png",
		AstraLook.DebugMode.EDGES: "astra-edges.png",
		AstraLook.DebugMode.AO: "astra-ao.png",
	}
	for mode: int in passes:
		geometry.set_astra_debug_mode(mode)
		if not await _save_capture(target.path_join(passes[mode])):
			geometry.set_astra_debug_mode(AstraLook.DebugMode.BEAUTY)
			quit(1)
			return
	geometry.set_astra_debug_mode(AstraLook.DebugMode.BEAUTY)
	shop._frame(focus, 0.78, true)
	shop._sync_actor(shop.avatar, hero, player_point)
	var saved := await _save_capture(target.path_join("astra-zoom-78.png"))
	shop._frame(focus, 1.0, true)
	quit(0 if saved else 1)


func _count_astra_materials(geometry: Node) -> int:
	var materials := {}
	for candidate in geometry.find_children("*", "MeshInstance3D", true, false):
		var instance := candidate as MeshInstance3D
		if instance.mesh == null:
			continue
		for index in instance.mesh.get_surface_count():
			var material := instance.get_active_material(index) as ShaderMaterial
			if material != null and material.shader == AstraSurface:
				materials[material] = true
	return materials.size()


func _save_capture(path: String) -> bool:
	# Allow the hero, room and compositing viewports to draw in dependency order.
	for frame in range(4):
		await process_frame
	await RenderingServer.frame_post_draw
	var image := output.get_texture().get_image()
	if image == null or image.is_empty() or image.get_size() != OUTPUT_SIZE:
		push_error("No complete rendered frame for " + path)
		return false
	var result := image.save_png(path)
	if result != OK:
		push_error("Cannot save %s (error %d)" % [path, result])
		return false
	print("ASTRA_SAVED ", path)
	return true
