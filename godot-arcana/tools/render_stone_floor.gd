extends SceneTree
## Offline art capture only. Does not instantiate the game or contact the API.
var viewport: SubViewport
func _initialize() -> void: call_deferred("capture")
func capture() -> void:
    root.position = Vector2i(-32000, -32000)
    var stage := "before"
    for argument in OS.get_cmdline_user_args():
        if argument.begins_with("--stage="): stage = argument.trim_prefix("--stage=")
    var directory := "res://../art-studies/stone-floor-detail-v1/render/"
    DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(directory))
    viewport = SubViewport.new()
    viewport.size = Vector2i(1400, 1000)
    viewport.disable_3d = true
    viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
    viewport.canvas_item_default_texture_filter = Viewport.DEFAULT_CANVAS_ITEM_TEXTURE_FILTER_NEAREST
    root.add_child(viewport)
    var scene: Node2D = load("res://scenes/native_2d/plaza.tscn").instantiate()
    viewport.add_child(scene)
    viewport.canvas_transform = Transform2D(0, Vector2(700,500)-Vector2(2304,1851))
    for frame in range(4): await process_frame
    await RenderingServer.frame_post_draw
    if viewport.get_texture().get_image().save_png(directory+stage+"-plaza.png") != OK: quit(1); return
    print("STONE_FLOOR_ART_CAPTURE ",stage)
    viewport.queue_free()
    await process_frame
    quit()
