extends SceneTree
## Offline art output only: no server, save, browser, or player input.
var viewport: SubViewport
var logic: Node2D
var renderer: Node2D

func _initialize() -> void:
    call_deferred("capture")

func capture() -> void:
    root.position = Vector2i(-32000, -32000)
    var stage := "before"
    for argument in OS.get_cmdline_user_args():
        if argument.begins_with("--pack="):
            if not ProjectSettings.load_resource_pack(argument.trim_prefix("--pack=")):
                push_error("Cannot mount plaza art package")
                quit(1)
                return
    for argument in OS.get_cmdline_user_args():
        if argument.begins_with("--stage="):
            stage = argument.trim_prefix("--stage=")
    var directory := "res://../art-studies/regions/arcana-city-center/source/plaza-mood-v1/render/"
    for argument in OS.get_cmdline_user_args():
        if argument.begins_with("--out="):
            directory = argument.trim_prefix("--out=").path_join("") + "/"
    DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(directory))
    viewport = SubViewport.new()
    viewport.size = Vector2i(1600, 1100)
    viewport.disable_3d = true
    viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
    viewport.canvas_item_default_texture_filter = Viewport.DEFAULT_CANVAS_ITEM_TEXTURE_FILTER_NEAREST
    root.add_child(viewport)
    var main: Node = load("res://main.tscn").instantiate()
    var authored: Node2D = main.get_node("Plaza")
    main.remove_child(authored)
    main.free()
    logic = load("res://scripts/world.gd").new()
    logic.layout = authored
    viewport.add_child(logic)
    logic.hide()
    logic.set_process(false)
    logic.set_physics_process(false)
    logic.enabled = false
    logic.effects_enabled = true
    logic.camera.enabled = false
    logic.player_position = Vector2(576, 525)
    renderer = load("res://scripts/native_2d_world.gd").new()
    renderer.world = logic
    viewport.add_child(renderer)
    renderer.set_display_size(Vector2(1600, 1100))
    renderer.set_render_pixel_scale(0.85)
    for frame in range(5):
        await process_frame
    await RenderingServer.frame_post_draw
    var image := viewport.get_texture().get_image()
    if image.save_png(directory + stage + "-plaza.png") != OK:
        quit(1)
        return
    print("PLAZA_ART_RENDER ", stage, " ", image.get_size())
    print("PLAZA_ART_COMBAT_JSON_SHA ", FileAccess.get_file_as_string("res://art/export/combat-layout.json").sha256_text())
    if stage == "before":
        var inventory: Array = []
        for placement in authored.placements():
            var visual := placement.get_node_or_null("Visual") as Sprite2D
            if visual != null and visual.texture != null:
                inventory.append({"name": placement.name, "kind": placement.model_kind,
                    "position": [placement.position.x, placement.position.y],
                    "size": [visual.texture.get_width(), visual.texture.get_height()],
                    "offset": [visual.offset.x, visual.offset.y],
                    "region": str(visual.region_rect), "foot": str(visual.get_meta("foot", Vector2.ZERO)),
                    "collision": str(placement.collision_parts)})
        var file := FileAccess.open(directory + "placement-inventory.json", FileAccess.WRITE)
        file.store_string(JSON.stringify(inventory, "  "))
    viewport.queue_free()
    await process_frame
    quit()
