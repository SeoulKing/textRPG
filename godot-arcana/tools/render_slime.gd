extends SceneTree
## Offline art production only: existing game layout and renderer, no API/save writes.
const World = preload("res://scripts/world.gd")
const Renderer = preload("res://scripts/pixel3d_world.gd")
func _initialize() -> void:
	call_deferred("capture")
func capture() -> void:
	root.position = Vector2i(-32000,-32000)
	var output = SubViewport.new()
	output.size = Vector2i(640,480)
	output.disable_3d = true
	output.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	root.add_child(output)
	var small = SubViewport.new()
	small.size = Vector2i(320,240)
	small.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	output.add_child(small)
	var present = TextureRect.new()
	present.texture = small.get_texture()
	present.size = Vector2(640,480)
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
	var plaza_preview = "--plaza" in OS.get_cmdline_user_args()
	logic.player_position = logic.spawn_position if plaza_preview else Vector2(626,1060)
	logic.time = 0
	var scene = Renderer.new()
	scene.world = logic
	small.add_child(scene)
	scene.set_process(false)
	scene.display_height = 480
	scene.camera_center = scene.map_point(logic.player_position)
	scene._process(0)
	var tile = MeshInstance3D.new()
	var plane = PlaneMesh.new()
	plane.size = Vector2.ONE
	tile.mesh = plane
	tile.position = scene.slime.position+Vector3(0,.04,0)
	tile.visible = not plaza_preview
	var material = ShaderMaterial.new()
	material.shader = load("res://art/resources/tile_reference.gdshader")
	tile.material_override = material
	scene.outside.add_child(tile)
	for i in range(4): await process_frame
	await RenderingServer.frame_post_draw
	var filename = "plaza-preview.png" if plaza_preview else "one-tile-in-game.png"
	output.get_texture().get_image().save_png("res://art/reference/slime/"+filename)
	print("Rendered slime + one-tile guide + current heroine in actual world renderer.")
	quit()
