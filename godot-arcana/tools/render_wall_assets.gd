extends SceneTree
## Offline art capture of the actual 3D bridge and saved native Terrain example.
func _initialize() -> void:
	call_deferred("capture")
func capture() -> void:
	root.position = Vector2i(-32000,-32000)
	var view = SubViewport.new()
	view.size = Vector2i(768,512)
	view.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	view.own_world_3d = true
	root.add_child(view)
	var scene = Node3D.new()
	view.add_child(scene)
	var bridge = load("res://scripts/wall_tilemap.gd").new()
	bridge.map_scene = load("res://scenes/walls/wall_examples.tscn")
	bridge.grid_origin = Vector2(-4.5,-2.5)
	scene.add_child(bridge)
	var camera = Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 10
	camera.near = .1
	camera.far = 250
	scene.add_child(camera)
	camera.position = Vector3(0,20,20)
	camera.look_at(Vector3.ZERO)
	camera.current = true
	var env = WorldEnvironment.new()
	env.environment = Environment.new()
	env.environment.background_mode = Environment.BG_COLOR
	env.environment.background_color = Color("78ad72")
	scene.add_child(env)
	for i in range(3): await process_frame
	await RenderingServer.frame_post_draw
	var image = view.get_texture().get_image()
	image.resize(1536,1024,Image.INTERPOLATE_NEAREST)
	DirAccess.make_dir_recursive_absolute("res://art/reference/walls")
	image.save_png("res://art/reference/walls/wall-examples.png")
	print("Captured native Terrain example via game 2D-in-3D bridge")
	quit()
