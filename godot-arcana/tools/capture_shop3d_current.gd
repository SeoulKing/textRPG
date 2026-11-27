extends SceneTree
## Capture the active shop renderer and its actual screen pixel shader offline.
## This does not invoke main.gd's account/server boot or touch saved state.
const World = preload("res://scripts/world.gd")
const Renderer = preload("res://scripts/native_2d_world.gd")

var output: SubViewport
var world_view: SubViewport
var presenter: TextureRect
var logic: Node2D
var renderer: Node2D

func _initialize() -> void:
	call_deferred("_capture")

func _capture() -> void:
	root.position = Vector2i(-32000, -32000)
	var target := OS.get_environment("ARCANA_SHOP_CHECK_DIR")
	if target.is_empty():
		push_error("ARCANA_SHOP_CHECK_DIR is required")
		quit(1)
		return
	DirAccess.make_dir_recursive_absolute(target)

	output = SubViewport.new()
	output.size = Vector2i(1280, 800)
	output.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	output.disable_3d = true
	root.add_child(output)

	world_view = SubViewport.new()
	world_view.size = Renderer.shop_raster_size(output.size)
	world_view.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	world_view.canvas_item_default_texture_filter = Viewport.DEFAULT_CANVAS_ITEM_TEXTURE_FILTER_NEAREST
	output.add_child(world_view)

	presenter = TextureRect.new()
	presenter.texture = world_view.get_texture()
	presenter.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	presenter.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	presenter.size = Vector2(output.size)
	output.add_child(presenter)

	var main: Node = load("res://main.tscn").instantiate()
	var layout: Node = main.get_node("Plaza")
	main.remove_child(layout)
	main.free()
	logic = World.new()
	logic.layout = layout
	world_view.add_child(logic)
	logic.hide()
	logic.enabled = false
	logic.set_process(false)
	logic.set_physics_process(false)
	logic.camera.enabled = false

	renderer = Renderer.new()
	renderer.world = logic
	world_view.add_child(renderer)
	renderer.set_display_size(Vector2(output.size))
	logic.change_interior("arcana_shop")
	if not logic.shop_layout.get("valid", false):
		push_error("Cannot capture: shop layout invalid")
		quit(1)
		return

	for frame in range(12):
		await process_frame
	if not is_instance_valid(renderer.shop3d):
		push_error("Cannot capture: active shop renderer was not created")
		quit(1)
		return
	await RenderingServer.frame_post_draw
	var overview := output.get_texture().get_image()
	var code := overview.save_png(target.path_join("godot-shop-overview.png"))
	print("SHOP_OVERVIEW saved=", code == OK, " size=", overview.get_size(),
		" raster=", world_view.size)
	var screen_edges: MeshInstance3D = renderer.shop3d.camera.get_node("ScreenEdges")
	renderer.set_process(false)
	screen_edges.hide()
	await process_frame
	await RenderingServer.frame_post_draw
	output.get_texture().get_image().save_png(target.path_join("godot-shop-edges-off.png"))
	screen_edges.show()
	renderer.set_process(true)
	print("SHOP_BLENDER_ACTIVE ", renderer.shop3d.geometry.authored_scene_active)
	var room: Node = renderer.shop3d.geometry.split_room
	var furniture := room.find_child("Furniture", true, false)
	var floor_model := room.find_child("OakPlankFloor", true, false) as MeshInstance3D
	if not renderer.shop3d.geometry.authored_scene_active or furniture == null or floor_model == null:
		push_error("Shop capture could not find the room models")
		quit(1)
		return
	print("SHOP_FURNITURE ", furniture.get_children().map(func(node: Node): return node.name))
	print("FLOOR_SURFACES ", floor_model.mesh.get_surface_count())
	for candidate in room.find_children("*", "OmniLight3D", true, false):
		var stand_light := candidate as OmniLight3D
		if not stand_light.get_meta("extras", {}).has("godot_glow_radius"):
			continue
		print("SHOP_FLOOR_STAND position=", stand_light.get_parent().global_position,
			" visible=", stand_light.is_visible_in_tree(), " energy=", stand_light.light_energy)
		stand_light.hide()
		for frame in range(4):
			await process_frame
		await RenderingServer.frame_post_draw
		output.get_texture().get_image().save_png(target.path_join("godot-shop-stand-light-off.png"))
		stand_light.show()
		break
	var old_props: Array[Vector2] = [
		Vector2(272, 120.25), Vector2(100, 156), Vector2(284, 156), Vector2(280, 188),
		Vector2(116, 180), Vector2(92, 188), Vector2(292, 140),
	]
	var shop_layout_data := preload("res://scripts/shop_layout_2d.gd")
	for point in old_props:
		if not shop_layout_data.can_stand(logic.shop_layout, point):
			push_error("Removed shop prop still blocks movement at " + str(point))
			quit(1)
			return
	print("SHOP_CLEARED_PROP_CELLS ", old_props.size())
	var overhead: OmniLight3D = renderer.shop3d.get_node("Lighting/OverheadFill")
	overhead.visible = false
	for frame in range(4):
		await process_frame
	await RenderingServer.frame_post_draw
	output.get_texture().get_image().save_png(target.path_join("godot-shop-overhead-off.png"))
	overhead.visible = true
	var sun: DirectionalLight3D = renderer.shop3d.get_node("Lighting/KeyLight")
	sun.visible = false
	for frame in range(4):
		await process_frame
	await RenderingServer.frame_post_draw
	output.get_texture().get_image().save_png(target.path_join("godot-shop-sun-off.png"))
	sun.visible = true
	renderer.set_zoom_ratio(0.78)
	for frame in range(5):
		await process_frame
	await RenderingServer.frame_post_draw
	output.get_texture().get_image().save_png(target.path_join("godot-shop-zoom-out.png"))

	# Keep the same floor focus across the comparison. The game limits max zoom to fit its window.
	renderer.set_process(false)
	for percent: int in [65, 92, 100, 124, 195, 267, 343, 390]:
		var zoom := percent / 100.0
		renderer.shop3d._frame(Vector2(8.2 * 16.0, 8.2 * 16.0), zoom, true)
		for frame in range(3):
			await process_frame
		await RenderingServer.frame_post_draw
		code = output.get_texture().get_image().save_png(target.path_join("godot-shop-%d.png" % percent))
		if code != OK:
			quit(1)
			return
		print("SHOP_ZOOM ", percent)
	var camera: Camera3D = renderer.shop3d.camera
	camera.size = 5.3
	camera.look_at_from_position(Vector3(13.1, 6.1, 14.6), Vector3(5.25, 1.47, 7.75))
	for frame in range(3):
		await process_frame
	await RenderingServer.frame_post_draw
	output.get_texture().get_image().save_png(target.path_join("godot-shop-west-window.png"))
	quit(0 if code == OK else 1)
