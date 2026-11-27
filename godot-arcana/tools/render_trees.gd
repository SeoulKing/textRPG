extends SceneTree
# Offline model study, using the game's light, palette and 2x pixel presentation.
const Models = preload("res://scripts/pixel3d_models.gd")
const Hero = preload("res://scripts/hero_actor.gd")
func _initialize() -> void:
	call_deferred("_render")
func _render() -> void:
	root.position = Vector2i(-32000,-32000)
	var viewport = SubViewport.new()
	viewport.size = Vector2i(480,300)
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	var output = SubViewport.new()
	output.size = Vector2i(960,600)
	output.disable_3d = true
	output.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	root.add_child(output)
	output.add_child(viewport)
	var presentation = TextureRect.new()
	presentation.texture = viewport.get_texture()
	presentation.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	presentation.size = Vector2(960,600)
	presentation.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	var palette = ShaderMaterial.new()
	palette.shader = preload("res://art/resources/pixel3d_palette.gdshader")
	palette.set_shader_parameter("palette_lut",preload("res://art/export/arcana-palette-lut.png"))
	presentation.material = palette
	output.add_child(presentation)
	var stage = Node3D.new()
	viewport.add_child(stage)
	var environment = WorldEnvironment.new()
	environment.environment = Environment.new()
	environment.environment.background_mode = Environment.BG_COLOR
	environment.environment.background_color = Color("cdbeb0")
	environment.environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.environment.ambient_light_color = Color("afc5cf")
	environment.environment.ambient_light_energy = .18
	stage.add_child(environment)
	var sun = DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-48,-32,0)
	sun.light_color = Color("fff0db")
	sun.light_energy = .48
	sun.shadow_enabled = true
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL
	stage.add_child(sun)
	var camera = Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 10.8
	camera.far = 250
	stage.add_child(camera)
	camera.position = Vector3(0,13.9,13.0)
	camera.look_at(Vector3(0,2.5,0))
	camera.current = true
	for i in range(3):
		var tree = Models.model(["oak","birch","spruce"][i])
		tree.position = Vector3(-5.5+i*5.5,0,0)
		stage.add_child(tree)
		var hero = Hero.new()
		hero.position = tree.position+Vector3(1.95,0,1.0)
		stage.add_child(hero)
		hero.pose(0,0,false,Vector2.ZERO,false,false)
	for i in range(12): await process_frame
	await RenderingServer.frame_post_draw
	var error = output.get_texture().get_image().save_png("res://art/reference/trees-3d-study.png")
	print("Tree model study saved: ",error)
	output.queue_free()
	await process_frame
	quit(0 if error==OK else 1)