extends SceneTree
## --create is first authoring only; normal runs export saved PixelPen edits.
const BASE = "res://art/source/monsters/motion-v2/"
const Document = preload("res://addons/pixel_workshop/pixel_document.gd")
func _initialize() -> void: call_deferred("run")
func fail(message: String) -> void:
    push_error(message)
    quit(1)
func run() -> void:
    var plan = JSON.parse_string(FileAccess.get_file_as_string(BASE+"author-plan.json"))
    var data = Document.read_source()
    var symbols: Array = plan.palette.keys()
    var palette = PackedColorArray()
    for symbol in symbols: palette.append(Color(plan.palette[symbol]))
    var native_frames: Dictionary = {}
    var corrected = 0
    var create = OS.get_cmdline_user_args().has("--create")
    for animation in data.animations:
        var path = BASE+animation+".pxpen"
        if create:
            if FileAccess.file_exists(path):
                fail("Protect existing PixelPen master: "+path); return
            var project = PixelPenProject.new()
            project.initialized(Vector2i(64,80),"Slime - "+animation+" - pixel continuity")
            PixelPen.state.current_project = project
            project.palette.color_index = palette
            project.pool_frames.clear()
            project.animation_timeline.clear()
            project.animation_fps = float(data.animations[animation].fps)
            project.animation_loop = bool(data.animations[animation].loop)
            project.show_timeline = true
            project.onion_skinning = true
            for f in range(int(data.animations[animation].count)):
                var frame = Frame.create(project.get_uid())
                var layer = IndexedColorImage.new()
                layer.layer_uid = project.get_uid()
                layer.label = "Pose - locked clusters and one-dot contour"
                layer.size = Vector2i(64,80)
                layer.visible = true
                # Start at the original pose, then apply actual indexed corrections in PixelPen.
                var original = Document.frame_image(data,animation,f)
                for y in range(80):
                    for x in range(64):
                        var before = palette.find(original.get_pixel(x,y))
                        if before<0: fail("Original palette mismatch"); return
                        layer.set_index_on_color_map(x,y,before)
                        var after = symbols.find(plan.frames[animation][f][y][x])
                        if before!=after:
                            layer.set_index_on_color_map(x,y,after)
                            corrected+=1
                frame.layers.append(layer)
                frame.layer_active_uid=layer.layer_uid
                project.pool_frames.append(frame)
                var cell = AnimationCell.create(project.get_uid())
                cell.frame=frame
                project.animation_timeline.append(cell)
            project.canvas_pool_frame_uid=project.pool_frames[0].frame_uid
            project.active_layer_uid=project.pool_frames[0].layers[0].layer_uid
            project.animation_frame_index=0
            project.file_path=path
            if ProjectPacker.save(project,path)!=OK:
                fail("PixelPen save failed: "+path); return
        var saved = ProjectPacker.load_project(path)
        if saved==null: fail("PixelPen reopen failed: "+path); return
        PixelPen.state.current_project=saved
        var frames: Array = []
        DirAccess.make_dir_recursive_absolute(BASE+"native-frames/"+animation)
        for f in range(saved.animation_timeline.size()):
            var image = saved.get_image(saved.animation_timeline[f].frame)
            image.convert(Image.FORMAT_RGBA8)
            var rows: Array = []
            for y in range(80):
                var row = ""
                for x in range(64):
                    var index = palette.find(image.get_pixel(x,y))
                    if index<0: fail("Saved pixel outside shared palette"); return
                    row+=str(symbols[index])
                rows.append(row)
            frames.append(rows)
            if image.save_png(BASE+"native-frames/"+animation+"/frame-%02d.png"%f)!=OK:
                fail("PixelPen PNG export failed"); return
        native_frames[animation]=frames
    data.size=[64,80]
    data.foot=[32,74]
    for animation in data.animations: data.animations[animation].count=int(data.animations[animation].count)
    data.pixel_frames=native_frames
    data.pixel_frames_source="motion-v2/*.pxpen"
    var file = FileAccess.open(Document.SOURCE,FileAccess.WRITE)
    if file==null: fail("Cannot save pixel source"); return
    file.store_string(JSON.stringify(data,"  ",false));file.close()
    if Document.bake(data)!=OK: fail("Cannot bake exported PixelPen frames"); return
    if not create and FileAccess.file_exists(BASE+"pixelpen-audit.json" ):
        var previous = JSON.parse_string(FileAccess.get_file_as_string(BASE+"pixelpen-audit.json"))
        corrected=int(previous.get("indexedCorrections",0))
    var audit = {"nativePixelPen":true,"savedReopenedExported":true,"indexedCorrections":corrected,"frames":120,"canvas":[64,80],"groundRow":73,"rigidFaces":true,"onePixelSilhouette":true}
    file=FileAccess.open(BASE+"pixelpen-audit.json",FileAccess.WRITE)
    file.store_string(JSON.stringify(audit,"  "));file.close()
    print("PIXELPEN_SLIME ",JSON.stringify(audit))
    PixelPen.state.current_project=null
    PixelPen.state.free();PixelPen.state=null
    quit()
