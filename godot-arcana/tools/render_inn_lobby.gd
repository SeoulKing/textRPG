extends SceneTree
## Approved inn art evidence, real main-scene layout, no API/save calls.
const World = preload("res://scripts/world.gd")
const Renderer = preload("res://scripts/pixel3d_world.gd")
const DIR = "res://art/reference/inn-lobby/"
var output: SubViewport
var small: SubViewport
var scene: Node3D
var logic: Node2D
var present: TextureRect
func _initialize() -> void:
    call_deferred("capture_all")
func capture(name: String, size: Vector2i, player: Vector2, zoom: float, elevation: float = 0.0) -> void:
    output.size = size
    small.size = Vector2i(size/2)
    present.size = Vector2(size)
    scene.display_height = size.y
    logic.player_position = player*16.0
    scene.previous_player = logic.player_position
    scene.camera_center = scene.map_point(logic.player_position)
    scene.camera_zoom = zoom
    scene.inn_lighting.clock = 1.0
    scene._process(.25)
    scene.camera.position += scene.camera.global_basis.y*elevation
    for i in range(3): await process_frame
    await RenderingServer.frame_post_draw
    output.get_texture().get_image().save_png(DIR+name+".png")
func capture_all() -> void:
    DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(DIR))
    root.position = Vector2i(-32000,-32000)
    output = SubViewport.new()
    output.disable_3d = true
    output.render_target_update_mode = SubViewport.UPDATE_ALWAYS
    root.add_child(output)
    small = SubViewport.new()
    small.render_target_update_mode = SubViewport.UPDATE_ALWAYS
    output.add_child(small)
    present = TextureRect.new()
    present.texture = small.get_texture()
    present.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
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
    logic = World.new()
    logic.layout = layout
    small.add_child(logic)
    logic.hide()
    logic.set_process(false)
    logic.set_physics_process(false)
    logic.enabled = false
    logic.effects_enabled = true
    logic.camera.enabled = false
    scene = Renderer.new()
    scene.world = logic
    small.add_child(scene)
    scene.set_process(false)
    scene.set_quarter_view(false)
    scene.hero.last_yaw = 0.0
    logic.change_interior("arcana_inn")
    await capture("lobby-overview",Vector2i(1280,960),Vector2(12,10.2),1.5,1.3)
    await capture("sofa-corner",Vector2i(1024,824),Vector2(7,10.25),1.7,1.2)
    await capture("counter-front",Vector2i(1024,824),Vector2(16.7,9.25),2.8,1.0)
    await capture("sofa-mobile",Vector2i(384,824),Vector2(7,10.25),2.0)
    await capture("entrance-join",Vector2i(1280,640),Vector2(12,15.2),2.0,-1.5)
    # Same framing, lights disabled: evidence that normals are used at runtime.
    logic.effects_enabled = false
    await capture("lighting-disabled",Vector2i(1024,824),Vector2(16.7,9.25),2.8,1.0)
    logic.effects_enabled = true
    for i in range(12):
        logic.time = float(i)/12.0
        await capture("fire-%02d"%i,Vector2i(640,640),Vector2(5.7,7.3),2.6,1.2)
    logic.reduced_motion = true
    logic.time = .5
    await capture("fire-reduced-motion",Vector2i(640,640),Vector2(5.7,7.3),2.6,1.2)
    quit()