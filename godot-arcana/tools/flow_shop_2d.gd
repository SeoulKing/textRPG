extends SceneTree
const Data = preload("res://scripts/shop_layout_2d.gd")
var checks: Array[String] = []
func require(value: bool, label: String) -> void:
	if not value: push_error("SHOP_2D_FLOW "+label); quit(1); assert(value,label)
	checks.append(label)
func _initialize() -> void: call_deferred("run")
func run() -> void:
	root.position = Vector2i(-32000,-32000)
	var viewport = SubViewport.new()
	viewport.size = Vector2i(960,720)
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	root.add_child(viewport)
	var entry = load("res://main.tscn").instantiate()
	var plaza = entry.get_node("Plaza")
	entry.remove_child(plaza)
	entry.free()
	var world = load("res://scripts/world.gd").new()
	world.layout = plaza
	viewport.add_child(world)
	world.hide()
	world.set_process(false)
	world.camera.enabled = false
	var renderer = load("res://scripts/pixel3d_world.gd").new()
	renderer.world = world
	viewport.add_child(renderer)
	renderer.set_process(false)
	for n in range(3): await process_frame
	await RenderingServer.frame_post_draw
	world.change_interior("arcana_shop")
	renderer._process(.016)
	for n in range(3): await process_frame
	renderer._process(.016)
	require(viewport.disable_3d,"shop viewport disables 3D drawing")
	require(is_instance_valid(renderer.shop2d) and renderer.shop2d.visible,"native 2D shop is active")
	require(renderer.shop2d.find_children("*","Node3D",true,false).is_empty(),"active shop subtree contains no 3D nodes")
	var saved_point = world.player_position
	world.player_position = Vector2(5.6,5.0)*16.0
	for n in range(4):
		renderer._process(.1)
		await process_frame
	var faded = false
	for sprite in renderer.shop2d.occluders:
		if str(sprite.get_meta("shop_asset","")).begins_with("wall-") and sprite.modulate.a<.99: faded=true
	require(faded,"foreground wall fades uniformly over player")
	await RenderingServer.frame_post_draw
	viewport.get_texture().get_image().save_png(OS.get_environment("ARCANA_SHOP_EVIDENCE").path_join("shop-2d-wall-edge.png"))
	world.player_position = saved_point
	renderer._process(.1)
	var point: Vector2 = world.shop_layout.markers.merchant
	var screen: Vector2 = renderer.screen_point(point)
	require(renderer.pick(screen).distance_to(point)<.01,"2D picking round trip")
	var click = renderer.shop2d.screen_point(point-Vector2(0,15))
	require(renderer.pick_interaction(click).get("id","")=="merchant","counter click selects existing merchant entity")
	var corrected: Vector2 = world.nearest_walkable(Vector2(192,120))
	require(world._can_stand(corrected),"blocked saved position corrects to walkable point")
	var original = world.player_position
	world._move_player(Vector2(0,-5))
	require(world._can_stand(world.player_position),"existing movement uses the new layout")
	world.player_position = original
	var probes: Array = []
	for y in range(60,213,4):
		for x in range(76,309,4):
			var p = Vector2(x,y)
			probes.append({"x":p.x,"y":p.y,"valid":Data.can_stand(world.shop_layout,p)})
	for rect in world.shop_layout.rectangles:
		for corner in [rect.position,rect.end]:
			for offset in [Vector2(-3.25,0),Vector2(-3,0),Vector2(3,0),Vector2(3.25,0),Vector2(0,-3.25),Vector2(0,3.25)]:
				var p = corner+offset
				probes.append({"x":p.x,"y":p.y,"valid":Data.can_stand(world.shop_layout,p)})
	var file = FileAccess.open(OS.get_environment("ARCANA_SHOP_EVIDENCE").path_join("server-probes.json"),FileAccess.WRITE)
	file.store_string(JSON.stringify(probes));file.close()
	world.change_interior("")
	renderer._process(.016)
	require(not viewport.disable_3d and not renderer.shop2d.visible,"exit restores outdoor renderer")
	require(not renderer.shop2d.follow_camera.enabled,"exit releases 2D camera")
	world.change_interior("arcana_shop")
	renderer._process(.016)
	require(viewport.disable_3d and renderer.shop2d.follow_camera.enabled,"shop can be entered again")
	file = FileAccess.open(OS.get_environment("ARCANA_SHOP_EVIDENCE").path_join("flow-check.json"),FileAccess.WRITE)
	file.store_string(JSON.stringify({"passed":true,"checks":checks,"serverProbeCount":probes.size(),"scope":"offline actual World/Renderer integration; no API/save or browser actions"},"  "));file.close()
	viewport.queue_free()
	await process_frame
	print("SHOP_2D_FLOW passed ",checks.size()," entry, picking, movement, restore and exit checks")
	quit()
