extends SceneTree
# Offline art output only: no server, accounts, gameplay commands or saved progress.
const World = preload("res://scripts/world.gd")
const Painted = preload("res://scripts/pixel3d_world.gd")
const Fountain = preload("res://scripts/fountain_spec.gd")
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
	# Read the real entry scene, including instance overrides. Do not start main's
	# network/game boot; World uses the same coordinate-frame setup as gameplay.
	var entry_scene = load("res://main.tscn").instantiate()
	var authored_layout = entry_scene.get_node("Plaza")
	entry_scene.remove_child(authored_layout)
	entry_scene.free()
	logic.layout = authored_layout
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
	var detail = image.get_region(Rect2i(feet-Vector2i(48,128),Vector2i(96,144)))
	detail.resize(384,576,Image.INTERPOLATE_NEAREST)
	detail.save_png("res://art/reference/pixel3d-character-detail.png")
	var fountain_feet = Vector2i(scene.camera.unproject_position(scene.fountain_anchor)*Vector2(output.size)/Vector2(viewport.size))
	# Include the full base and raised ornament at the current camera zoom.
	var fountain_detail = image.get_region(Rect2i(fountain_feet-Vector2i(104,154),Vector2i(208,224)))
	fountain_detail.resize(416,448,Image.INTERPOLATE_NEAREST)
	fountain_detail.save_png("res://art/reference/pixel3d-fountain.png")
	print("3D art preview: ",output_path," (",error,")")
	# Diagnostic only: actual circular footprint and common origin over the same
	# live renderer. This overlay is never attached to the playable world.
	var footprint = PackedVector2Array()
	var output_scale = Vector2(output.size)/Vector2(viewport.size)
	# Read the collider actually installed in world.gd, not a second debug shape.
	var collider: Dictionary = logic.round_obstacles[0]
	var local_to_map: Transform2D = collider.inverse.affine_inverse()
	for i in range(65):
		var angle = i*TAU/64.0
		var map_point = local_to_map*(Vector2(cos(angle),sin(angle))*float(collider.radius))
		var ground = scene.map_point(map_point,.04)
		footprint.append(scene.camera.unproject_position(ground)*output_scale)
	var center_pixel = scene.camera.unproject_position(scene.map_point(local_to_map.origin))*output_scale
	var diagnostic = Node2D.new()
	output.add_child(diagnostic)
	diagnostic.draw.connect(func():
		diagnostic.draw_polyline(footprint,Color("f06449"),2)
		diagnostic.draw_line(center_pixel-Vector2(7,0),center_pixel+Vector2(7,0),Color("f06449"),2)
		diagnostic.draw_line(center_pixel-Vector2(0,7),center_pixel+Vector2(0,7),Color("f06449"),2)
	)
	diagnostic.queue_redraw()
	await process_frame
	await RenderingServer.frame_post_draw
	output.get_texture().get_image().save_png("res://art/reference/pixel3d-fountain-collision.png")
	diagnostic.queue_free()
	await process_frame
	# Art QA only: real mesh headings and walk phases at game resolution.
	var poses = Image.create(96*8,144*4,false,Image.FORMAT_RGBA8)
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
			poses.blit_rect(frame_image,Rect2i(at-Vector2i(48,128),Vector2i(96,144)),Vector2i(column*96,row*144))
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
