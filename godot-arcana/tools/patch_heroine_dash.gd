extends SceneTree
## Apply frame-specific indexed edits through installed PixelPen 1.1.4 classes.
func _initialize() -> void:call_deferred("run")
func abort(message: String) -> void:
    push_error(message)
    quit(1)
func run() -> void:
    var path=""
    for arg in OS.get_cmdline_user_args():
        if arg.begins_with("--plan="):path=arg.trim_prefix("--plan=")
    var batch=JSON.parse_string(FileAccess.get_file_as_string(path))
    if not batch is Dictionary or not batch.has("plans"):abort("Expected native plan batch");return
    var frames=0
    var changed=0
    for plan_path in batch.plans:
        var plan=JSON.parse_string(FileAccess.get_file_as_string(str(plan_path)))
        var project=ProjectPacker.load_project(str(plan.source))
        if project==null:abort("PixelPen source load failed: "+str(plan.source));return
        for edit in plan.edits:
            var frame_index=int(edit.frame)
            if frame_index<0 or frame_index>=project.animation_timeline.size():abort("Frame outside timeline");return
            var layer=project.animation_timeline[frame_index].frame.layers[0]
            if not layer.coor_inside_canvas(int(edit.x),int(edit.y)):abort("Pixel outside canvas");return
            if layer.get_index_on_color_map(int(edit.x),int(edit.y))!=int(edit.expected):abort("Native source changed; revise this frame");return
        if plan.has("palette"):
            if plan.palette.size()!=32:abort("Keep the shared32-colour budget");return
            var colors=PackedColorArray([Color(0,0,0,0)])
            for hex in plan.palette:colors.append(Color(str(hex)))
            project.palette.color_index=colors
        for edit in plan.edits:
            project.animation_timeline[int(edit.frame)].frame.layers[0].set_index_on_color_map(int(edit.x),int(edit.y),int(edit.index))
        if plan.has("frame_count"):
            project.animation_timeline=project.animation_timeline.slice(0,int(plan.frame_count))
            project.animation_fps=24
            project.animation_loop=false
        var output=str(plan.output)
        if output==str(plan.source):abort("Preserve original source");return
        project.file_path=output
        if ProjectPacker.save(project,output)!=OK:abort("PixelPen save failed");return
        project=ProjectPacker.load_project(output)
        if project==null:abort("PixelPen reload failed");return
        if plan.has("palette"):
            for i in range(plan.palette.size()):
                if project.palette.color_index[i+1].to_html(false)!=Color(str(plan.palette[i])).to_html(false):abort("Saved palette mismatch");return
        for edit in plan.edits:
            if project.animation_timeline[int(edit.frame)].frame.layers[0].get_index_on_color_map(int(edit.x),int(edit.y))!=int(edit.index):abort("Saved pixel mismatch");return
        var directory=str(plan.export_dir)
        DirAccess.make_dir_recursive_absolute(directory)
        for i in range(project.animation_timeline.size()):
            var image=project.get_image(project.animation_timeline[i].frame)
            image.convert(Image.FORMAT_RGBA8)
            if image.save_png(directory.path_join("frame-%02d.png"%i))!=OK:abort("PixelPen export failed");return
        frames+=project.animation_timeline.size()
        changed+=plan.edits.size()
        print("NATIVE_PIXELPEN_SAVED ",output," / ",project.animation_timeline.size()," frames / ",plan.edits.size()," pixel edits")
        project=null
    var report={"native_pixelpen":true,"frames":frames,"indexed_edits":changed,"saved_and_reloaded":true,"status":"first full-body pass; visual review required"}
    var file=FileAccess.open(path.get_base_dir().path_join("native-result.json"),FileAccess.WRITE)
    file.store_string(JSON.stringify(report,"  "));file.close()
    print(JSON.stringify(report))
    PixelPen.state.free();PixelPen.state=null
    quit()
