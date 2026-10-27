extends SceneTree
# Offline art output only: no server, accounts, gameplay commands or saved progress.
const World = preload("res://scripts/world.gd")
const Painted = preload("res://scripts/pixel3d_world.gd")
var viewport: SubViewport
var output: SubViewport
var presentation: TextureRect
func _initialize() -> void:
	call_deferred("_render")
func _render() -> void:
	root.position = Vector2i(-32000,-32000)
	viewport = SubViewport.new()
	viewport.size = Vector2i(192,412)
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	output = SubViewport.new()
	output.size = Vector2i(384,824)
	output.disable_3d = true
	output.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	root.add_child(output)
	output.add_child(viewport)
	presentation = TextureRect.new()
	presentation.texture = viewport.get_texture()
	presentation.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	presentation.size = Vector2(384,824)
	presentation.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	var palette = ShaderMaterial.new()
	palette.shader = preload("res://art/resources/pixel3d_palette.gdshader")
	palette.set_shader_parameter("palette_lut",preload("res://art/export/arcana-palette-lut.png"))
	presentation.material = palette
	output.add_child(presentation)
	var logic = World.new()
	viewport.add_child(logic)
	logic.hide()
	logic.set_process(false)
	logic.set_physics_process(false)
	logic.player_position = logic.spawn_position
	logic.traveler_position = logic.traveler_home
	logic.enabled = false
	logic.camera.enabled = false
	var scene = Painted.new()
	scene.world = logic
	viewport.add_child(scene)
	for i in range(12): await process_frame
	await RenderingServer.frame_post_draw
	var image = output.get_texture().get_image()
	image.resize(384,824,Image.INTERPOLATE_NEAREST)
	var output_path = "res://art/reference/pixel3d-plaza.png"
	var args = OS.get_cmdline_user_args()
	if not args.is_empty(): output_path = args[0]
	var error = image.save_png(output_path)
	# A nearest-neighbor detail for reviewing ink; not a new character asset.
	var feet = Vector2i(scene.camera.unproject_position(scene.hero.global_position)*Vector2(output.size)/Vector2(viewport.size))
	var detail = image.get_region(Rect2i(feet-Vector2i(40,104),Vector2i(80,112)))
	detail.resize(320,448,Image.INTERPOLATE_NEAREST)
	detail.save_png("res://art/reference/pixel3d-character-detail.png")
	var fountain_feet = Vector2i(scene.camera.unproject_position(scene.fountain_anchor)*Vector2(output.size)/Vector2(viewport.size))
	# Include the full base and raised ornament at the current camera zoom.
	var fountain_detail = image.get_region(Rect2i(fountain_feet-Vector2i(104,154),Vector2i(208,224)))
	fountain_detail.resize(416,448,Image.INTERPOLATE_NEAREST)
	fountain_detail.save_png("res://art/reference/pixel3d-fountain.png")
	print("3D art preview: ",output_path," (",error,")")
	# Art QA only: real mesh headings and walk phases at game resolution.
	var poses = Image.create(80*8,112*4,false,Image.FORMAT_RGBA8)
	var headings = [0.0,PI,PI/2.0,-PI/2.0]
	for row in range(4):
		scene.hero.last_yaw = headings[row]
		for column in range(8):
			logic.walking = column >= 2
			logic.player_gait = float(maxi(0,column-2)) / .75
			logic.time = 2.0 if column == 1 else 0.0
			await process_frame
			await RenderingServer.frame_post_draw
			var frame_image = output.get_texture().get_image()
			var at = Vector2i(scene.camera.unproject_position(scene.hero.global_position)*Vector2(output.size)/Vector2(viewport.size))
			poses.blit_rect(frame_image,Rect2i(at-Vector2i(40,104),Vector2i(80,112)),Vector2i(column*80,row*112))
	poses.save_png("res://art/reference/hero-3d-rendered-poses.png")
	logic.walking = false
	logic.player_gait = 0.0
	logic.time = 0.0
	scene.hero.last_yaw = 0.0
	# Also output the exact same geometry at native resolution for comparison.
	scene.pixelated = false
	presentation.material.set_shader_parameter("palette_enabled",false)
	viewport.size = Vector2i(384,824)
	for i in range(4): await process_frame
	await RenderingServer.frame_post_draw
	var raw = output.get_texture().get_image()
	raw.save_png("res://art/reference/pixel3d-plaza-native.png")
	# A wider camera for inspecting the city set, not a gameplay camera change.
	scene.display_height = 1408.0*Painted.CAMERA_ZOOM
	scene.pixelated = true
	presentation.material.set_shader_parameter("palette_enabled",true)
	viewport.size = Vector2i(384,412)
	for i in range(6): await process_frame
	await RenderingServer.frame_post_draw
	var overview = output.get_texture().get_image()
	overview.resize(768,824,Image.INTERPOLATE_NEAREST)
	overview.save_png("res://art/reference/pixel3d-city-overview.png")
	scene.display_height = 824.0
	# A garden view keeps the revised tree silhouettes beside the same-size hero.
	logic.player_position = Vector2(607,630)
	scene.pixelated = true
	presentation.material.set_shader_parameter("palette_enabled",true)
	viewport.size = Vector2i(192,412)
	for i in range(6): await process_frame
	await RenderingServer.frame_post_draw
	var garden = output.get_texture().get_image()
	garden.resize(384,824,Image.INTERPOLATE_NEAREST)
	garden.save_png("res://art/reference/pixel3d-garden.png")
	# Offline interior art: no API calls, purchases, travel commands or save writes.
	logic.change_interior("arcana_shop")
	logic.player_position = Vector2(192,200)
	scene.pixelated = true
	presentation.material.set_shader_parameter("palette_enabled",true)
	viewport.size = Vector2i(192,412)
	for i in range(6): await process_frame
	await RenderingServer.frame_post_draw
	var interior = output.get_texture().get_image()
	interior.resize(384,824,Image.INTERPOLATE_NEAREST)
	interior.save_png("res://art/reference/pixel3d-interior.png")
	output.queue_free()
	await process_frame
	await process_frame
	quit(0 if error == OK else 1)
