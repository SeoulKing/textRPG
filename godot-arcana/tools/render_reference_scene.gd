extends SceneTree
## Actual main-scene placements, offline GPU art capture. No API or save writes.
const World = preload("res://scripts/world.gd")
const Renderer = preload("res://scripts/pixel3d_world.gd")
var DIR = "res://art/reference/reference-scene/"
var output: SubViewport
var small: SubViewport
var scene: Node3D
var logic: Node2D
var present: TextureRect
var stage = "after"
func _initialize() -> void:
    for arg in OS.get_cmdline_user_args():
        if arg.begins_with("--stage="): stage = arg.trim_prefix("--stage=")
        if arg == "--natural-walk": DIR = "res://art/reference/natural-walk/"
        if arg == "--character-quality": DIR = "res://art/reference/character-tree-quality/"
    call_deferred("capture_all")
func capture(name: String, size: Vector2i) -> Image:
    output.size = size
    small.size = Vector2i(size/2)
    present.size = Vector2(size)
    scene.display_height = size.y
    scene.camera_center = scene.map_point(logic.player_position)
    scene._process(0)
    for i in range(3): await process_frame
    await RenderingServer.frame_post_draw
    var image = output.get_texture().get_image()
    image.save_png(DIR+stage+"-"+name+".png")
    return image
func capture_all() -> void:
    DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(DIR))
    root.position = Vector2i(-32000,-32000)
    output = SubViewport.new()
    output.size = Vector2i(654,410)
    output.disable_3d = true
    output.render_target_update_mode = SubViewport.UPDATE_ALWAYS
    root.add_child(output)
    small = SubViewport.new()
    small.size = Vector2i(327,205)
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
    logic.player_position = logic.spawn_position
    logic.traveler_position = logic.traveler_home
    scene = Renderer.new()
    scene.world = logic
    small.add_child(scene)
    scene.set_process(false)
    scene.hero.last_yaw = 0.0
    await capture("wide",Vector2i(654,410))
    await capture("mobile",Vector2i(384,824))
    scene.set_quarter_view(true)
    scene.camera_zoom = 4.0
    scene.hero.last_yaw = 0.0
    await capture("matched-wide",Vector2i(654,410))
    # Same camera, light, water time, placement and resolution before/after.
    logic.player_position = Vector2(scene.fountain_anchor.x,scene.fountain_anchor.z)*16.0+Vector2(0,30)
    scene.hero.hide()
    scene.resident.hide()
    scene.center_on_character = false
    scene.camera_zoom = 2.02317130195288
    await capture("fountain",Vector2i(654,410))
    scene.center_on_character = true
    scene.set_quarter_view(false) # Development captures use the front view.
    scene.hero.show()
    logic.player_position = logic.spawn_position
    scene.camera_zoom = Renderer.CAMERA_ZOOM
    scene.previous_player = logic.player_position
    if stage == "after":
        logic.player_position = Vector2(36,40.25)*16.0
        scene.previous_player = logic.player_position
        scene.hero.last_yaw = 0.0
        await capture("path-wide",Vector2i(654,410))
        await capture("path-mobile",Vector2i(384,824))
        logic.player_position = Vector2(31.5,35.25)*16.0
        scene.previous_player = logic.player_position
        scene.hero.last_yaw = 0.0
        await capture("planter-wide",Vector2i(654,410))
        scene.hero.set_outfit(PackedStringArray(["blouse","skirt","shawl","boots-navy"]))
        await capture("outfit-separates",Vector2i(654,410))
        scene.hero.set_outfit(PackedStringArray(["dress","boots-taupe"]))
        await capture("outfit-no-shawl",Vector2i(654,410))
        scene.hero.set_outfit(PackedStringArray(["dress","shawl","boots-taupe"]))
        logic.player_position = logic.spawn_position
        scene.previous_player = logic.player_position
        # Same 64 texels/unit beside the user's approved tree, without changing any asset.
        for placement in logic.layout.placements():
            if placement.model_kind == "birch":
                var anchor = placement.layout_transform(logic.layout).origin
                logic.player_position = Vector2(anchor.x+1.15,anchor.z+.5)*16.0
                scene.previous_player = logic.player_position
                scene.hero.last_yaw = scene.view_yaw()
                await capture("tree-quality-pair",Vector2i(654,1000))
                break
        # Use the clear south path: the user's separate height-reference box can
        # occlude the spawn point; never hide/remove their scene reference.
        logic.player_position = Vector2(36,40.25)*16.0
        scene.previous_player = logic.player_position
        var poses = Image.create(654*4,410*2,false,Image.FORMAT_RGBA8)
        for d in range(8):
            scene.hero.last_yaw = scene.view_yaw()+TAU*float(d)/8.0
            logic.walking = true
            scene.hero.set_preview_pose(d,"walk",6)
            var shot = await capture("pose-"+str(d),Vector2i(654,410))
            poses.blit_rect(shot,Rect2i(0,0,654,410),Vector2i((d%4)*654,(d/4)*410))
        poses.save_png(DIR+"after-directions.png")
        scene.hero.clear_preview_pose()
        var walk = Image.create(192*6,288*4,false,Image.FORMAT_RGBA8)
        # Start the clock with a resting pose; production logic drives the actual frames.
        logic.player_position = Vector2(36,40.25)*16.0
        logic.walking = false
        scene.hero.pose(logic.time,0,false,Vector2.ZERO,true,false)
        logic.walking = true
        scene.hero.last_yaw = scene.view_yaw()
        var frames = scene.hero.SPEC.WALK_FRAMES
        var walk_origin = logic.player_position
        for f in range(frames):
            logic.player_position = walk_origin+Vector2(sin(scene.view_yaw()),cos(scene.view_yaw()))*16.0*float(f)/frames
            scene.previous_player = logic.player_position
            scene.hero.set_preview_pose(0,"walk",f)
            var shot = await capture("walk-"+str(f),Vector2i(654,410))
            var at = Vector2i(scene.camera.unproject_position(scene.hero.global_position)*2.0)
            var crop = shot.get_region(Rect2i(at-Vector2i(96,236),Vector2i(192,288)))
            crop.save_png(DIR+stage+"-walk-detail-"+str(f)+".png")
            walk.blit_rect(crop,Rect2i(0,0,192,288),Vector2i((f%6)*192,(f/6)*288))
        walk.save_png(DIR+"after-walk.png")
        scene.hero.clear_preview_pose()
        if DIR.ends_with("natural-walk/"):
            await capture_natural_walk()
    print("Reference-scene GPU captures complete: "+stage)
    quit()

func capture_natural_walk() -> void:
    logic.effects_enabled = true
    scene.hero.previous_pose_time = -1.0
    var origin = Vector2(36,40.25)*16.0
    # Feed the production pose contract real displacement; no gameplay, API or input.
    for speed in [16.0,48.0]:
        var label = "slow" if speed<48.0 else "full"
        logic.player_position = origin
        scene.previous_player = origin
        logic.walking = false
        logic.time += .05
        await capture(label+"-rest",Vector2i(654,410))
        scene.hero.last_yaw = 0.0
        for f in range(40):
            logic.walking = f<32
            if logic.walking: logic.player_position += Vector2(0,speed/30.0)
            logic.time += 1.0/30.0
            var shot = await capture(label+"-motion-"+str(f),Vector2i(654,410))
            var at = Vector2i(scene.camera.unproject_position(scene.hero.global_position)*2.0)
            shot.get_region(Rect2i(at-Vector2i(130,236),Vector2i(260,288))).save_png(DIR+label+"-detail-"+str(f)+".png")

    logic.player_position = origin
    scene.previous_player = origin
    for f in range(72):
        var direction = [0,1,2,4,6,0][int(f/12)]
        var angle = float(direction)*TAU/8.0
        logic.walking = true
        logic.player_position += Vector2(sin(angle),cos(angle))*.8
        logic.time += 1.0/30.0
        var shot = await capture("turn-"+str(f),Vector2i(654,410))
        var at = Vector2i(scene.camera.unproject_position(scene.hero.global_position)*2.0)
        shot.get_region(Rect2i(at-Vector2i(130,236),Vector2i(260,288))).save_png(DIR+"turn-detail-"+str(f)+".png")

    logic.walking = false
    logic.player_position = origin
    scene.previous_player = origin
    for d in range(8):
        for f in range(4):
            scene.hero.set_preview_pose(d,"turn_left",f)
            var shot=await capture("standing-turn-"+str(d)+"-"+str(f),Vector2i(654,410))
            var at=Vector2i(scene.camera.unproject_position(scene.hero.global_position)*2.0)
            shot.get_region(Rect2i(at-Vector2i(130,236),Vector2i(260,288))).save_png(DIR+"standing-turn-detail-"+str(d)+"-"+str(f)+".png")
    var variants=[PackedStringArray(["dress","shawl","boots-taupe"]),PackedStringArray(["blouse","skirt","shawl","boots-navy"]),PackedStringArray(["dress","boots-taupe"])]
    for v in range(variants.size()):
        scene.hero.set_outfit(variants[v])
        for f in [0,6,12,18]:
            scene.hero.set_preview_pose(0,"walk",f)
            await capture("wardrobe-walk-"+str(v)+"-"+str(f),Vector2i(654,410))
    scene.hero.clear_preview_pose()
