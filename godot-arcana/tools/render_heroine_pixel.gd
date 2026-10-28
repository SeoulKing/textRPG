extends SceneTree
## Offline visual/adapter checks only: no API, saves or browser interaction.
const World = preload("res://scripts/world.gd")
const Painted = preload("res://scripts/pixel3d_world.gd")
const Sprite = preload("res://scripts/heroine_sprite.gd")
const Legacy = preload("res://scripts/blender_hero.gd")
const DIR = "res://art/reference/heroine-pixel/"
var viewport: SubViewport
var output: SubViewport
var scene: Node3D
var logic: Node2D
var failures: Array[String] = []

func _initialize() -> void:
    call_deferred("_render")

func _check(condition: bool, message: String) -> void:
    if not condition:
        failures.append(message)
        push_error(message)

func _settle() -> Image:
    for i in range(3): await process_frame
    await RenderingServer.frame_post_draw
    return output.get_texture().get_image()

func _capture(name: String) -> Image:
    var image = await _settle()
    image.save_png(DIR+name+".png")
    return image

func _stats(actor: Node3D) -> Dictionary:
    var surfaces = 0
    var triangles = 0
    for node in actor.find_children("*","MeshInstance3D",true,false):
        if node.mesh == null or node.cast_shadow == GeometryInstance3D.SHADOW_CASTING_SETTING_SHADOWS_ONLY: continue
        surfaces += node.mesh.get_surface_count()
        for surface in range(node.mesh.get_surface_count()):
            var arrays = node.mesh.surface_get_arrays(surface)
            var count = arrays[Mesh.ARRAY_INDEX].size() if arrays[Mesh.ARRAY_INDEX] != null else arrays[Mesh.ARRAY_VERTEX].size()
            if not node.mesh is ArrayMesh or node.mesh.surface_get_primitive_type(surface) == Mesh.PRIMITIVE_TRIANGLES: triangles += count/3
    return {"visible_mesh_surfaces":surfaces,"visible_mesh_triangles":triangles,
        "skeletons":actor.find_children("*","Skeleton3D",true,false).size(),
        "viewport_draw_calls":viewport.get_render_info(Viewport.RENDER_INFO_TYPE_VISIBLE,Viewport.RENDER_INFO_DRAW_CALLS_IN_FRAME),
        "viewport_primitives":viewport.get_render_info(Viewport.RENDER_INFO_TYPE_VISIBLE,Viewport.RENDER_INFO_PRIMITIVES_IN_FRAME)}

func _swap(script: Script) -> void:
    var previous = scene.hero
    scene.remove_child(previous)
    previous.queue_free()
    scene.hero = script.new()
    scene.add_child(scene.hero)
    scene.hero.last_yaw = 0.0

func _render() -> void:
    DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(DIR))
    root.position = Vector2i(-32000,-32000)
    output = SubViewport.new()
    output.size = Vector2i(384,824)
    output.disable_3d = true
    output.render_target_update_mode = SubViewport.UPDATE_ALWAYS
    root.add_child(output)
    viewport = SubViewport.new()
    viewport.size = Vector2i(192,412)
    viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
    output.add_child(viewport)
    var presentation = TextureRect.new()
    presentation.texture = viewport.get_texture()
    presentation.size = Vector2(384,824)
    presentation.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
    presentation.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
    var palette = ShaderMaterial.new()
    palette.shader = preload("res://art/resources/pixel3d_palette.gdshader")
    palette.set_shader_parameter("palette_lut",preload("res://art/export/arcana-palette-lut.png"))
    presentation.material = palette
    output.add_child(presentation)
    var entry = load("res://main.tscn").instantiate()
    var layout = entry.get_node("Plaza")
    entry.remove_child(layout)
    entry.free()
    logic = World.new()
    logic.layout = layout
    viewport.add_child(logic)
    logic.hide()
    logic.set_process(false)
    logic.set_physics_process(false)
    logic.enabled = false
    logic.effects_enabled = false
    logic.camera.enabled = false
    logic.player_position = logic.spawn_position
    logic.traveler_position = logic.traveler_home
    scene = Painted.new()
    scene.world = logic
    viewport.add_child(scene)
    _check(not scene.quarter_view,"Default camera must be front view.")
    _swap(Legacy)
    scene.camera_zoom = 1.35
    scene.set_quarter_view(true)
    await _capture("before-original")
    scene.set_quarter_view(false)
    scene.camera_zoom = Painted.CAMERA_ZOOM
    var before = await _capture("before-matched")
    var before_stats = _stats(scene.hero)
    _swap(Sprite)
    var after = await _capture("after")
    var after_stats = _stats(scene.hero)
    var comparison = Image.create(768,824,false,Image.FORMAT_RGBA8)
    comparison.blit_rect(before,Rect2i(0,0,384,824),Vector2i.ZERO)
    comparison.blit_rect(after,Rect2i(0,0,384,824),Vector2i(384,0))
    comparison.save_png(DIR+"before-after.png")
    var feet = Vector2i(scene.camera.unproject_position(scene.hero.global_position)*2.0)
    var detail = after.get_region(Rect2i(feet-Vector2i(48,128),Vector2i(96,144)))
    detail.resize(384,576,Image.INTERPOLATE_NEAREST)
    detail.save_png(DIR+"after-detail.png")
    # Exercise the exact production adapter, including no reset on camera changes.
    for camera_index in range(2):
        var yaw = camera_index*PI/4.0
        scene.set_quarter_view(camera_index==1)
        for direction in range(8):
            scene.hero.last_yaw = direction*TAU/8.0
            await _settle()
            var expected = posmod(direction-camera_index,8)
            _check(scene.hero.facing==expected,"Camera-relative direction %d/%d" % [camera_index,direction])
        var frame_actor = scene.hero
        frame_actor.pose(0,0,true,Vector2.ZERO,true,true)
        var walk_start = frame_actor.current_frame
        frame_actor.pose(0,Sprite.SPEC.GAIT_CYCLE,true,Vector2.ZERO,true,true)
        _check(frame_actor.current_frame==walk_start,"Walking must complete one cycle at the baked stride distance.")
        frame_actor.pose(0,Sprite.SPEC.GAIT_CYCLE*.5,true,Vector2.ZERO,true,true)
        _check(frame_actor.current_frame!=walk_start,"Walking must advance with traveled distance.")
        frame_actor.pose(1.0,0,false,Vector2.ZERO,true,true)
        var idle_cell = frame_actor.current_frame
        frame_actor.pose(1.0,0,false,Vector2.ZERO,true,true)
        _check(frame_actor.current_frame==idle_cell,"Paused idle must retain the same frame.")
        frame_actor.pose(9,0,false,Vector2.ZERO,true,false)
        _check(frame_actor.current_frame==Vector2i((frame_actor.facing*12)%16,(frame_actor.facing*12)/16),"Reduced motion must select idle frame zero.")
    # Original-size poses in both camera modes, 8 headings x idle/walk samples.
    for camera_index in range(2):
        scene.set_quarter_view(camera_index==1)
        var poses = Image.create(96*4,144*8,false,Image.FORMAT_RGBA8)
        for direction in range(8):
            scene.hero.last_yaw = direction*TAU/8.0
            for column in range(4):
                logic.walking = column>0
                logic.player_gait = float(column)*Sprite.SPEC.GAIT_CYCLE/4.0
                var frame_image = await _settle()
                var at = Vector2i(scene.camera.unproject_position(scene.hero.global_position)*2.0)
                poses.blit_rect(frame_image,Rect2i(at-Vector2i(48,128),Vector2i(96,144)),Vector2i(column*96,direction*144))
        poses.save_png(DIR+("poses-front.png" if camera_index==0 else "poses-quarter.png"))
    logic.walking = false
    logic.player_gait = 0.0
    scene.hero.last_yaw = 0.0
    var home = logic.spawn_position
    # Read authored placement transforms rather than rebuilding the user's city.
    var anchors: Dictionary = {}
    for placement in logic.layout.placements():
        if placement.model_kind in ["shop","oak"] and not anchors.has(placement.model_kind):
            anchors[placement.model_kind] = placement.layout_transform(logic.layout).origin
    for camera_index in range(2):
        scene.set_quarter_view(camera_index==1)
        for kind in anchors:
            for side in [-1,1]:
                var p: Vector3 = anchors[kind]+Vector3(0,0,side*(2.0 if kind=="shop" else .6))
                logic.player_position = Vector2(p.x,p.z)*16.0
                scene.camera_center = scene.map_point(logic.player_position)
                await _capture("%s-%s-%s" % ["front" if camera_index==0 else "quarter",kind,"behind" if side<0 else "ahead"])
    scene.set_quarter_view(false)
    logic.player_position = home
    scene.camera_center = scene.map_point(home)
    logic.dusk = true
    await _capture("dusk")
    logic.dusk = false
    logic.change_interior("arcana_shop")
    logic.player_position = Vector2(192,200)
    await _capture("interior")
    var report = {"before":before_stats,"after":after_stats,
        "source_height":56,"display_height_target":112,"atlas_rgba_bytes":1024*480*4,
        "gait_cycle":Sprite.SPEC.GAIT_CYCLE,"frame_count":96,"camera_zoom":Painted.CAMERA_ZOOM,"direction_checks":16,
        "failures":failures,"evidence":"offline Godot Compatibility GPU; actual main.tscn placements; not browser/mobile gameplay"}
    FileAccess.open(DIR+"verification.json",FileAccess.WRITE).store_string(JSON.stringify(report,"  "))
    print("HEROINE_VISUAL_QA "+JSON.stringify(report))
    quit(0 if failures.is_empty() else 1)

