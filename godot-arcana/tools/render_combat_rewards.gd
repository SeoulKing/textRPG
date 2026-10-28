extends SceneTree
## Bench camera projection evidence, real main-scene layout, no API/save calls.
const World = preload("res://scripts/world.gd")
const Renderer = preload("res://scripts/pixel3d_world.gd")
const DIR = "res://art/reference/combat-rewards/"
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
    scene._process(0)
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
    logic.effects_enabled = false
    logic.camera.enabled = false
    scene = Renderer.new()
    scene.world = logic
    small.add_child(scene)
    scene.set_process(false)
    scene.set_quarter_view(false)
    await capture("context",Vector2i(768,640),Vector2(36,40.25),4.0)
    var ui = load("res://scripts/game_ui.gd").new()
    output.add_child(ui)
    var controller = load("res://scripts/main.gd").new()
    controller.ui = ui
    controller.world = logic
    controller.world_renderer = scene
    controller.viewport = small
    controller.viewport_host = present
    controller.snapshot = {"state":{"money":6530,"arcanaCombat":{"level":1,"xp":10,"hp":100,"mp":30}}}
    controller.spatial_combat = load("res://scripts/arcana_spatial.gd").new()
    controller.spatial_combat.main = controller
    var rewards = load("res://scripts/combat_rewards.gd").new()
    rewards.main = controller
    controller.spatial_combat.reward_effects = rewards
    root.add_child(rewards)
    rewards.set_process(false)
    rewards.show_reward("preview-only",Vector2(36.8,39.8),10,30)
    rewards._process(.15)
    for i in range(3): await process_frame
    await RenderingServer.frame_post_draw
    output.get_texture().get_image().save_png(DIR+"xp-and-drop.png")
    rewards._process(1.1)
    for i in range(3): await process_frame
    await RenderingServer.frame_post_draw
    output.get_texture().get_image().save_png(DIR+"auto-pickup.png")
    rewards.free()
    controller.spatial_combat.free()
    controller.free()
    quit()
