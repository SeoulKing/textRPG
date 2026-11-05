extends SceneTree
## Offline art production only: existing game layout and renderer, no API/save writes.
const World = preload("res://scripts/world.gd")
const Renderer = preload("res://scripts/pixel3d_world.gd")
func _initialize() -> void:
	call_deferred("capture")
func capture() -> void:
	root.position = Vector2i(-32000,-32000)
	var output = SubViewport.new()
	output.size = Vector2i(640,640)
	output.disable_3d = true
	output.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	root.add_child(output)
	var small = SubViewport.new()
	small.size = Vector2i(320,320)
	small.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	output.add_child(small)
	var present = TextureRect.new()
	present.texture = small.get_texture()
	present.size = Vector2(640,640)
	present.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	var palette = ShaderMaterial.new()
	palette.shader = load("res://art/resources/pixel3d_palette.gdshader")
	palette.set_shader_parameter("palette_lut",load("res://art/export/arcana-palette-lut.png"))
	present.material = palette
	output.add_child(present)
	var entry = load("res://main.tscn").instantiate()
	var layout = entry.get_node("Plaza")
	entry.remove_child(layout)
	entry.free()
	var logic = World.new()
	logic.layout = layout
	small.add_child(logic)
	logic.hide()
	logic.set_process(false)
	logic.set_physics_process(false)
	logic.enabled = false
	logic.camera.enabled = false


	logic.player_position = Vector2(37.5,33.25)*16.0
	var scene = Renderer.new()
	scene.world = logic
	small.add_child(scene)
	scene.set_process(false)
	scene.set_quarter_view(false)
	scene.camera_zoom = 4.0
	scene.display_height = 640
	var slime = layout.get_node("슬라임_미리보기_01")
	slime.preview_playing = false
	slime.preview_animation = "idle"
	slime.local_clock = 0
	slime.show_pose("idle",0)
	var directory = "res://art/reference/slime-occlusion/"
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(directory))
	scene.camera_center = scene.map_point(logic.player_position)
	scene._process(0)
	await shot(output,directory+"before.png")
	scene._process(.25)
	await shot(output,directory+"alpha-faded.png")
	logic.player_position = Vector2(37.5,34.5)*16.0
	scene.camera_center = scene.map_point(logic.player_position)
	scene._process(.4)
	await shot(output,directory+"front-restored.png")
	print("Rendered slime image opacity and front-of-slime recovery in the actual plaza.")
	quit()

func shot(output: SubViewport, path: String) -> void:
	for i in range(3): await process_frame
	await RenderingServer.frame_post_draw
	output.get_texture().get_image().save_png(path)
