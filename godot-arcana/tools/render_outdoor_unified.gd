extends SceneTree
## Offline art capture of saved main/Plaza; no account, API or save mutation.
const World = preload("res://scripts/world.gd")
const Renderer = preload("res://scripts/pixel3d_world.gd")
var small: SubViewport
var output: SubViewport
var presentation: TextureRect
var logic: Node2D
var scene: Node3D
var destination: String
var stage = "before"
func _initialize() -> void:
    for arg in OS.get_cmdline_user_args():
        if arg.begins_with("--out="): destination = arg.trim_prefix("--out=")
        if arg.begins_with("--stage="): stage = arg.trim_prefix("--stage=")
    call_deferred("run")
func capture(label: String, size: Vector2i, point: Vector2, zoom: float) -> void:
    output.size = size
    small.size = Vector2i(size / 2)
    presentation.size = Vector2(size)
    logic.player_position = point * 16.0
    scene.camera_center = scene.map_point(logic.player_position)
    scene.camera_zoom = zoom
    scene.display_height = size.y
    scene._process(0)
    for i in range(4): await process_frame
    await RenderingServer.frame_post_draw
    var image = output.get_texture().get_image()
    image.save_png(destination.path_join(stage + "-" + label + ".png"))
    print("OUTDOOR_CAPTURE ", label, " yaw=", scene.view_yaw(), " pitch=", rad_to_deg(asin(abs(scene.camera.global_basis.z.y))), " ppu=", scene.pixels_per_unit)
func run() -> void:
    if destination.is_empty(): push_error("--out is required");quit(1);return
    DirAccess.make_dir_recursive_absolute(destination)
    root.position = Vector2i(-32000,-32000)
    output = SubViewport.new()
    output.disable_3d = true
    output.render_target_update_mode = SubViewport.UPDATE_ALWAYS
    root.add_child(output)
    small = SubViewport.new()
    small.render_target_update_mode = SubViewport.UPDATE_ALWAYS
    output.add_child(small)
    presentation = TextureRect.new()
    presentation.texture = small.get_texture()
    presentation.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
    presentation.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
    var palette = ShaderMaterial.new()
    palette.shader = load("res://art/resources/pixel3d_palette.gdshader")
    palette.set_shader_parameter("palette_lut",load("res://art/export/arcana-palette-lut.png"))
    presentation.material = palette
    output.add_child(presentation)
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
    logic.effects_enabled = false
    logic.camera.enabled = false
    logic.player_position = logic.spawn_position
    logic.traveler_position = logic.traveler_home
    scene = Renderer.new()
    scene.world = logic
    small.add_child(scene)
    scene.set_process(false)
    scene.set_quarter_view(false)
    scene.center_on_character = false
    await capture("fountain",Vector2i(1280,960),Vector2(36,26.2),4.0)
    await capture("shop",Vector2i(1920,1280),Vector2(18,17.25),4.0)
    await capture("garden",Vector2i(1280,960),Vector2(27,30),4.0)
    await capture("overview",Vector2i(1440,1080),Vector2(36,18),0.8)
    quit()
