extends SceneTree
## Native PixelPen headless bridge. JSON edits use palette indices and expected old values.
## --script res://tools/patch_pixelpen.gd -- --plan=<absolute JSON path>
func _initialize() -> void:
    call_deferred("run")

func fail(message: String) -> void:
    push_error(message)
    quit(1)

func run() -> void:
    var plan_path = ""
    for arg in OS.get_cmdline_user_args():
        if arg.begins_with("--plan="): plan_path = arg.trim_prefix("--plan=")
    var plan = JSON.parse_string(FileAccess.get_file_as_string(plan_path))
    if not plan is Dictionary:
        fail("Expected a JSON plan"); return
    var project = ProjectPacker.load_project(plan["source"])
    if project == null:
        fail("PixelPen could not load source"); return
    var edits = plan.get("edits", [])
    # Validate the complete patch before changing the in-memory project.
    for edit in edits:
        var frame_index = int(edit["frame"])
        if frame_index < 0 or frame_index >= project.animation_timeline.size():
            fail("Frame outside timeline"); return
        var layers = project.animation_timeline[frame_index].frame.layers
        var layer_index = int(edit.get("layer", 0))
        if layer_index < 0 or layer_index >= layers.size():
            fail("Layer outside frame"); return
        var layer = layers[layer_index]
        var x = int(edit["x"])
        var y = int(edit["y"])
        var color_index = int(edit["index"])
        if not layer.coor_inside_canvas(x, y) or color_index < 0 or color_index >= project.palette.color_index.size():
            fail("Pixel or palette index outside project"); return
        if layer.get_index_on_color_map(x, y) != int(edit["expected"]):
            fail("Source pixel changed; review patch before applying"); return
    for edit in edits:
        var layer = project.animation_timeline[int(edit["frame"])].frame.layers[int(edit.get("layer", 0))]
        layer.set_index_on_color_map(int(edit["x"]), int(edit["y"]), int(edit["index"]))
    var output: String = plan.get("output", "")
    if not output.is_empty():
        if output == plan["source"]:
            fail("Save to a review copy before replacing the source"); return
        project.file_path = output
        if ProjectPacker.save(project, output) != OK:
            fail("PixelPen save failed"); return
        project = ProjectPacker.load_project(output)
        if project == null:
            fail("Saved PixelPen project failed to reload"); return
        for edit in edits:
            var layer = project.animation_timeline[int(edit["frame"])].frame.layers[int(edit.get("layer", 0))]
            if layer.get_index_on_color_map(int(edit["x"]), int(edit["y"])) != int(edit["index"]):
                fail("Saved pixel differs from patch"); return
    var export_dir: String = plan.get("export_dir", "")
    if not export_dir.is_empty():
        DirAccess.make_dir_recursive_absolute(export_dir)
        for i in range(project.animation_timeline.size()):
            var image = project.get_image(project.animation_timeline[i].frame)
            image.convert(Image.FORMAT_RGBA8)
            if image.save_png(export_dir.path_join("frame-%02d.png" % i)) != OK:
                fail("PixelPen PNG export failed"); return
    print(JSON.stringify({"native_pixelpen": true, "frames": project.animation_timeline.size(), "edits": edits.size(), "output": output}))
    project = null
    PixelPen.state.free()
    quit()
