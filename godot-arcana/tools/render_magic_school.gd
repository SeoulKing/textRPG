extends SceneTree
## Dedicated school art evidence, real main-scene layout, no API/save calls.
const World = preload("res://scripts/world.gd")
const Renderer = preload("res://scripts/pixel3d_world.gd")
const DIR = "res://art/reference/magic-school/"
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
    scene.hero.last_yaw = 0.0
    await capture("school-overview-front",Vector2i(1280,1280),Vector2(12,10.5),1.6,6.8)
    await capture("school-entrance-front",Vector2i(1024,768),Vector2(12,10.5),4.0)
    await capture("school-door-contact",Vector2i(1024,768),Vector2(12,8.25),4.0)
    await capture("school-behind-front",Vector2i(1024,768),Vector2(12,5.0),4.0)
    scene.set_quarter_view(true)
    await capture("school-default-camera",Vector2i(1024,768),Vector2(12,10.5),4.0)
    scene.set_quarter_view(false)
    await capture("original-3d-school",Vector2i(768,824),Vector2(49.5,14.5),2.0,1.5)
    var evidence = {
      "source":"main.tscn / Plaza", "placement":[12,0,9.5],
      "character_height":Renderer.Hero.SPEC.SOURCE_HEIGHT,
      "front_walkable":logic._can_stand(Vector2(12,10.5)*16.0),
      "body_solid":not logic._can_stand(Vector2(12,7)*16.0),
      "stairs_walkable":logic._can_stand(Vector2(12,8.25)*16.0),
      "stairs_side_solid":not logic._can_stand(Vector2(14,8.25)*16.0),
      "entrances":logic.entrances.size(),
      "door_enabled":logic.entrances[0].enabled if not logic.entrances.is_empty() else null,
      "behind_walkable":logic._can_stand(Vector2(12,5)*16.0),
      "approach_path_cells":logic.grid.get_id_path(Vector2i(logic.spawn_position/16.0),Vector2i(12,10)).size(),
      "original_academy_count":layout.placements().filter(func(n): return n.model_kind=="academy").size(),
      "new_academy_count":layout.placements().filter(func(n): return n.model_kind=="academy-2d").size(),
      "browser_tested":false, "camera_default_changed":false
    }
    var file = FileAccess.open(DIR+"inspection.json",FileAccess.WRITE)
    file.store_string(JSON.stringify(evidence,"\t"))
    file.close()
    print(JSON.stringify(evidence))
    quit()
