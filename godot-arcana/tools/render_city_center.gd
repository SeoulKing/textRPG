extends SceneTree
## Dedicated school art evidence, real main-scene layout, no API/save calls.
const World = preload("res://scripts/world.gd")
const Renderer = preload("res://scripts/pixel3d_world.gd")
const DIR = "res://art/reference/city-center/"
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
    scene.hero.hide()
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
    print("City ground native texture: ",scene.reference_ground_mat.get_shader_parameter("city_ground_paint").get_size()," / ",scene.reference_ground_mat.get_shader_parameter("city_ground_paint_right").get_size()," bounds ",scene.reference_ground_mat.get_shader_parameter("city_ground_paint_bounds"))
    scene.hero.last_yaw = 0.0
    scene.hero.hide()
    scene.marker.hide()
    scene.target_marker.hide()
    await capture("district-overview",Vector2i(1536,1000),Vector2(36,29),.66,-2.0)
    await capture("southern-street",Vector2i(1280,1024),Vector2(36,43),1.2,3)
    await capture("shop-street",Vector2i(1280,1024),Vector2(20,27),1.4,3)
    await capture("ground-detail",Vector2i(1280,1024),Vector2(41.5,36.2),2.5,2.5)
    await capture("bench-clearance",Vector2i(1280,1024),Vector2(43,34),2.5,1.8)
    quit()