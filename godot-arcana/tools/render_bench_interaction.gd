extends SceneTree
## Approved bench interaction: offline art registration only; no API or save calls.
const World = preload("res://scripts/world.gd")
const Renderer = preload("res://scripts/pixel3d_world.gd")
const DIR = "res://art/reference/bench-interaction/"
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
    scene._process(.25)
    scene.camera.position += scene.camera.global_basis.y*elevation
    for i in range(6):
        scene._process(.2)
        await process_frame
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
    for entity in logic.entities:
        if entity.id=="park_bench_02": logic.bench_entity=entity.duplicate(true)
    logic.player_position=logic.bench_entity.pos
    var shots=[["stand","sit",0.0],["bend","sit",.16],["lower","sit",.30],["seated","seated",0.0],["breathe","seated",1.4],["blink","seated",4.05],["rise","stand",.15],["straighten","stand",.28]]
    for shot in shots:
        logic.bench_state=shot[1]
        logic.bench_age=shot[2]
        await capture(shot[0],Vector2i(768,640),logic.player_position/16.0,4.0)
    logic.change_interior("arcana_inn")
    for entity in logic.entities:
        if entity.kind=="inn_sofa": logic.bench_entity=entity.duplicate(true)
    logic.player_position=logic.bench_entity.pos
    for shot in [["sofa-seated","seated",0.0],["sofa-rise","stand",.15]]:
        logic.bench_state=shot[1]
        logic.bench_age=shot[2]
        await capture(shot[0],Vector2i(768,640),logic.player_position/16.0,4.0)
    quit()
