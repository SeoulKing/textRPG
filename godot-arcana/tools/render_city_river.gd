extends SceneTree
## Offline art capture only. No player API, input, or save changes.
func _initialize() -> void: call_deferred("capture")
func capture() -> void:
    root.position = Vector2i(-32000,-32000)
    for argument in OS.get_cmdline_user_args():
        if argument.begins_with("--pack="):
            if not ProjectSettings.load_resource_pack(argument.trim_prefix("--pack=")):
                push_error("Cannot mount river package"); quit(1); return
    var output := "res://../art-studies/regions/arcana-city-center/source/river-v1/render"
    # Output stays in the workspace even when rendering an isolated staged project.
    var override: String = OS.get_environment("ARCANA_RIVER_RENDER_OUT")
    if not override.is_empty(): output = override
    DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output))
    var viewport := SubViewport.new()
    viewport.size = Vector2i(1600,1100)
    viewport.disable_3d = true
    viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
    viewport.canvas_item_default_texture_filter = Viewport.DEFAULT_CANVAS_ITEM_TEXTURE_FILTER_NEAREST
    root.add_child(viewport)
    var main: Node = load("res://main.tscn").instantiate()
    var authored: Node2D = main.get_node("Plaza")
    main.remove_child(authored)
    main.free()
    var logic: Node2D = load("res://scripts/world.gd").new()
    logic.layout = authored
    viewport.add_child(logic)
    logic.hide()
    logic.set_process(false)
    logic.set_physics_process(false)
    logic.enabled = false
    logic.effects_enabled = true
    logic.camera.enabled = false
    logic.time = 7.0
    var renderer: Node2D = load("res://scripts/native_2d_world.gd").new()
    renderer.world = logic
    viewport.add_child(renderer)
    renderer.set_display_size(Vector2(1600,1100))
    renderer.set_render_pixel_scale(1.0)
    var views: Array[Dictionary] = [
        {"name":"bridge-day","at":Vector2(576,620),"dusk":false},
        {"name":"bridge-evening","at":Vector2(576,620),"dusk":true},
        {"name":"west-bank","at":Vector2(364,620),"dusk":false},
        {"name":"east-bank","at":Vector2(824,620),"dusk":false}
    ]
    for view in views:
        logic.player_position = view.at
        renderer.hero.modulate.a = 1.0 if view.name.begins_with("bridge-") else 0.0
        logic.set_art_state(view.dusk,true)
        for frame in range(4): await process_frame
        await RenderingServer.frame_post_draw
        var picture: Image = viewport.get_texture().get_image()
        if picture.save_png(output.path_join(view.name+".png")) != OK: quit(1); return
        print("RIVER_RENDER ",view.name)
    if OS.get_environment("ARCANA_RIVER_MOTION_CAPTURE") == "1":
        var motion_dir: String = output.path_join("motion")
        DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(motion_dir))
        logic.player_position = Vector2(576,620)
        logic.set_art_state(false,true)
        renderer.hero.modulate.a = 1.0
        var motion_fps: float = renderer.river.visual_fps() if renderer.river.has_method("visual_fps") else renderer.river.ripple_fps
        var motion_count: int = renderer.river.visual_frame_count() if renderer.river.has_method("visual_frame_count") else 24
        for index in motion_count:
            logic.time = 7.0+float(index)/motion_fps
            for frame in 2: await process_frame
            await RenderingServer.frame_post_draw
            var frame_image: Image = viewport.get_texture().get_image()
            # A native-pixel crop of the actual game renderer, without scaling.
            var water_view: Image = frame_image.get_region(Rect2i(200,440,1200,490))
            if water_view.save_png(motion_dir.path_join("frame-%02d.png"%index)) != OK: quit(1); return
        print("RIVER_RENDER motion",motion_count)
    viewport.queue_free()
    await process_frame
    quit()
