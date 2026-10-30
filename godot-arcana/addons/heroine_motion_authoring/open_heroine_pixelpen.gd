extends SceneTree
## Open the installed PixelPen UI directly, without loading gameplay or save state.
func _initialize() -> void:call_deferred("open_editor")
func open_editor() -> void:
    root.set_script(load("res://addons/net.yarvis.pixel_pen/editor/editor_window/editor_window.gd"))
    root.window_running=true;root.title="Pixel Pen · Heroine motion";root.size=Vector2i(1400,920)
    root.add_child(load("res://addons/net.yarvis.pixel_pen/editor/editor_main_ui.tscn").instantiate())
    for i in range(3):await process_frame
    var file="res://art/source/heroine/run-v1/pixelpen/run-s.pxpen"
    for arg in OS.get_cmdline_user_args():
        if arg.begins_with("--file="):file=arg.trim_prefix("--file=")
    print("PixelPen project load: ",PixelPen.state.load_project(file))
