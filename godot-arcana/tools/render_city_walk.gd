extends SceneTree
## Offline art capture from the actual main scene. No API, saves or input.
func _initialize() -> void:
    call_deferred("capture")

func capture() -> void:
    root.position = Vector2i(-32000, -32000)
    var output: String = "res://../art-studies/regions/arcana-city-center/source/city-walk-v1/render"
    for argument in OS.get_cmdline_user_args():
        if argument.begins_with("--out="): output = argument.trim_prefix("--out=")
        if argument.begins_with("--pack="):
            if not ProjectSettings.load_resource_pack(argument.trim_prefix("--pack=")):
                push_error("Cannot mount city package")
                quit(1)
                return
    DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output))
    var viewport: SubViewport = SubViewport.new()
    viewport.size = Vector2i(1600, 1100)
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
    renderer.set_display_size(Vector2(1600, 1100))
    renderer.set_render_pixel_scale(1.0)
    var views: Array[Dictionary] = [
        {"name":"fountain-day", "at":Vector2(560, 520), "dusk":false},
        {"name":"market-lane", "at":Vector2(400, 547), "dusk":false},
        {"name":"school-garden", "at":Vector2(850, 515), "dusk":false},
        {"name":"inn-evening", "at":Vector2(420, 692), "dusk":true}
    ]
    for view in views:
        logic.player_position = view.at
        logic.set_art_state(view.dusk, true)
        for frame in range(4): await process_frame
        await RenderingServer.frame_post_draw
        var picture: Image = viewport.get_texture().get_image()
        if picture.save_png(output.path_join(view.name + ".png")) != OK:
            quit(1)
            return
        print("CITY_WALK_RENDER ", view.name)
    viewport.queue_free()
    await process_frame
    quit()