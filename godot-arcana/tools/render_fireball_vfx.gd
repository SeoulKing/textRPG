extends SceneTree
const Flame = preload("res://scripts/fireball_vfx.gd")
func _initialize() -> void:
	render.call_deferred()
func render() -> void:
	var viewport = SubViewport.new()
	viewport.size = Vector2i(1024,512)
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	root.add_child(viewport)
	var environment = WorldEnvironment.new()
	environment.environment = Environment.new()
	environment.environment.background_mode = Environment.BG_COLOR
	environment.environment.background_color = Color("cbbd9d")
	viewport.add_child(environment)
	var camera = Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 2.4
	camera.position = Vector3(0,0,6)
	viewport.add_child(camera)
	camera.make_current()
	for row in range(2):
		for col in range(4):
			var flame = Flame.new()
			flame.burst = row==1
			viewport.add_child(flame)
			flame.position = Vector3(-1.65+col*1.15,.55 if row==0 else -.55,0)
			flame.elapsed = col/16.0 if row==0 else col*.08+.01
			flame.update_pose(camera,0,false,false)
	await RenderingServer.frame_post_draw
	await RenderingServer.frame_post_draw
	var directory = "D:/BANG/project/textRPG/godot-arcana/art/reference/fireball-v1"
	DirAccess.make_dir_recursive_absolute(directory)
	viewport.get_texture().get_image().save_png(directory+"/preview.png")
	print("Rendered fireball flight and impact: ",directory)
	quit()
