extends SceneTree
## Offline art capture only; does not connect to API or alter player saves.
const World = preload("res://scripts/world.gd")
const Renderer = preload("res://scripts/pixel3d_world.gd")
var output: SubViewport
var small: SubViewport
var logic: Node2D
var scene: Node3D
func _initialize() -> void:
	call_deferred("capture_all")
func capture_all() -> void:
	root.position = Vector2i(-32000,-32000)
	output = SubViewport.new()
	output.size = Vector2i(1400,1000)
	output.disable_3d = true
	output.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	root.add_child(output)
	small = SubViewport.new()
	small.size = Vector2i(700,500)
	small.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	output.add_child(small)
	var present = TextureRect.new()
	present.texture = small.get_texture()
	present.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	present.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	present.size = Vector2(output.size)
	var palette = ShaderMaterial.new()
	palette.shader = load("res://art/resources/pixel3d_palette.gdshader")
	palette.set_shader_parameter("palette_lut",load("res://art/export/arcana-palette-lut.png"))
	present.material = palette
	output.add_child(present)
	var entry = load("res://main.tscn").instantiate()
	var layout = entry.get_node("Plaza")
	entry.remove_child(layout)
	entry.free()
	logic = World.new()
	logic.layout = layout
	small.add_child(logic)
	logic.hide()
	logic.set_process(false)
	logic.set_physics_process(false)
	logic.enabled = false
	logic.camera.enabled = false
	logic.change_interior("arcana_academy")
	scene = Renderer.new()
	scene.world = logic
	small.add_child(scene)
	scene.set_process(false)
	scene.center_on_character = false
	scene.display_height = 1000
	scene.camera_zoom = 1.6
	scene.set_quarter_view(false)
	var dir = "res://art/reference/academy-interior/"
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(dir))
	for level in [1,2]:
		logic.change_academy_floor(level)
		logic.player_position = Vector2(192,228)
		scene.camera_center = scene.map_point(logic.player_position)
		scene._process(0)
		scene.camera.v_offset = 2.6
		for i in range(8): await process_frame
		await RenderingServer.frame_post_draw
		output.get_texture().get_image().save_png(dir+"floor-%d.png" % level)
	logic.change_interior("")
	logic.player_position = Vector2(54,30)*16.0
	scene.camera_zoom = 3.2
	for dusk in [false,true]:
		logic.dusk = dusk
		scene.camera_center = scene.map_point(logic.player_position)
		scene._process(.25)
		for i in range(8): await process_frame
		await RenderingServer.frame_post_draw
		output.get_texture().get_image().save_png(dir+("school-front-dusk.png" if dusk else "school-front-day.png"))
	quit()
