extends SceneTree
## Keep manual PixelPen masters; author, reopen and export native edited pixels.
const STUDY := "res://../art-studies/regions/arcana-city-center/source/river-v1/"
func _initialize() -> void: call_deferred("author")
func fail(message: String) -> void:
    push_error(message)
    quit(1)
func author() -> void:
    var plan: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(STUDY+"pixelpen-plan.json"))
    var audit: Array = []
    for job in plan.jobs:
        var project: PixelPenProject
        var reused: bool = FileAccess.file_exists(str(job.source))
        var corrections := 0
        if reused:
            project = ProjectPacker.load_project(str(job.source))
        else:
            var input := Image.load_from_file(str(job.input))
            if input == null: fail("Missing prepared river art"); return
            project = PixelPenProject.new()
            project.initialized(input.get_size(), "Arcana approved riverside - "+str(job.id))
            PixelPen.state.current_project = project
            var uid := project.import_image(input, str(job.id))
            var layer: IndexedColorImage = project.get_index_image(uid)
            layer.label = "Stone contours, single pixel cleanup and seamless joints"
            var palette: PackedColorArray = project.palette.color_index
            var indices: Dictionary = {}
            for i in palette.size(): indices[palette[i].to_rgba32()] = i
            for y in range(1,input.get_height()-1):
                for x in range(1,input.get_width()-1):
                    var c := input.get_pixel(x,y)
                    if c.a < .5: continue
                    var counts: Dictionary = {}
                    var opaque := true
                    for dy in range(-1,2):
                        for dx in range(-1,2):
                            if dx == 0 and dy == 0: continue
                            var n := input.get_pixel(x+dx,y+dy)
                            if n.a < .5: opaque = false; continue
                            var key := n.to_rgba32()
                            counts[key] = int(counts.get(key,0))+1
                    if not opaque or counts.has(c.to_rgba32()): continue
                    for key in counts:
                        if counts[key] < 6: continue
                        var n: Color = palette[int(indices[key])]
                        var distance := absf(c.r-n.r)+absf(c.g-n.g)+absf(c.b-n.b)
                        if distance > .025 and distance < .20:
                            layer.set_index_on_color_map(x,y,int(indices[key]))
                            corrections += 1
            if bool(job.seam):
                # Match both endpoints in the native master, including cutout gaps.
                for y in input.get_height():
                    var index: int = layer.get_index_on_color_map(0,y)
                    layer.set_index_on_color_map(input.get_width()-1,y,index)
                    corrections += 1
            project.file_path = str(job.source)
            if ProjectPacker.save(project,str(job.source)) != OK: fail("PixelPen save failed"); return
            project = ProjectPacker.load_project(str(job.source))
        if project == null: fail("PixelPen reopen failed"); return
        PixelPen.state.current_project = project
        var output: Image = project.get_image(project.animation_timeline[0].frame)
        output.convert(Image.FORMAT_RGBA8)
        if output.save_png(str(job.output)) != OK: fail("PixelPen PNG export failed"); return
        if ResourceSaver.save(ImageTexture.create_from_image(output),str(job.output).trim_suffix(".png")+".res",ResourceSaver.FLAG_COMPRESS) != OK: fail("Resource export failed"); return
        audit.append({"id":job.id,"native":job.source,"output":job.output,"size":[output.get_width(),output.get_height()],"nativePixelCorrections":corrections,"reusedMaster":reused,"savedReopenedExported":true})
        print("RIVER_PIXELPEN ",job.id," corrections=",corrections," reused=",reused)
        PixelPen.state.current_project = null
        project = null
    var file := FileAccess.open(STUDY+"pixelpen-audit.json",FileAccess.WRITE)
    file.store_string(JSON.stringify({"assets":audit,"pixelsPerWorldUnit":64},"  "))
    file.close()
    if PixelPen.state != null:
        PixelPen.state.current_project = null
        PixelPen.state.free()
        PixelPen.state = null
    quit()
