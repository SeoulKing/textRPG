extends SceneTree
# Four actual mesh rotations for visual art review. No game/server state.
const Hero = preload("res://scripts/hero_actor.gd")
const Models = preload("res://scripts/pixel3d_models.gd")
func _initialize() -> void:
	call_deferred("_render")
func _render() -> void:
	root.position = Vector2i(-32000,-32000)
	var view = SubViewport.new()
	view.size = Vector2i(192,256)
	view.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	root.add_child(view)
	var settings = WorldEnvironment.new()
	var environment = Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("d7cfbc")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("bed0c6")
	environment.ambient_light_energy = .5
	settings.environment = environment
	view.add_child(settings)
	var light = DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-48,-32,0)
	light.light_color = Color("fff0ce")
	light.light_energy = .7
	view.add_child(light)
	var camera = Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 2.55
	camera.far = 250
	camera.position = Vector3(0,2.6,4)
	view.add_child(camera)
	camera.look_at(Vector3(0,.95,0))
	camera.make_current()
	var hero = Hero.new()
	view.add_child(hero)
	var sheet = Image.create(192*4,256,false,Image.FORMAT_RGBA8)
	var angles = [0.0,PI/4,PI/2,PI]
	for i in range(angles.size()):
		hero.last_yaw = angles[i]
		hero.pose(0,0,false,Vector2.ZERO,false,false)
		await process_frame
		await process_frame
		await RenderingServer.frame_post_draw
		sheet.blit_rect(view.get_texture().get_image(),Rect2i(0,0,192,256),Vector2i(i*192,0))
	var result = sheet.save_png("res://art/reference/hero-3d-turntable.png")
	view.queue_free()
	await process_frame
	Models.clear_templates()
	quit(0 if result == OK else 1)
