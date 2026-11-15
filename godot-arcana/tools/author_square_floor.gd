extends SceneTree
## Native PixelPen finishing and saved resource authoring. Existing masters win.
const STUDY := "res://../art-studies/regions/arcana-city-center/source/square-floor-v2/"
const OUT := "res://art/export/square-floor-v2/"
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
            if input == null: fail("Missing prepared stone art"); return
            project = PixelPenProject.new()
            project.initialized(input.get_size(), "Arcana approved detailed stone - "+str(job.id))
            PixelPen.state.current_project = project
            var uid := project.import_image(input, str(job.id))
            var layer: IndexedColorImage = project.get_index_image(uid)
            layer.label = "Drawn stone detail, continuous joints, native cluster cleanup"
            var palette: PackedColorArray = project.palette.color_index
            var indices: Dictionary = {}
            for i in palette.size(): indices[palette[i].to_rgba32()] = i
            # Periodic-neighbor cleanup preserves seams and stone cracks. Only
            # isolated low-contrast grains surrounded by one color are removed.
            for y in range(input.get_height()):
                for x in range(input.get_width()):
                    var c := input.get_pixel(x,y)
                    if c.a < .5: continue
                    var counts: Dictionary = {}
                    var neighbors_opaque := true
                    for dy in range(-1,2):
                        for dx in range(-1,2):
                            if dx == 0 and dy == 0: continue
                            var n := input.get_pixel(posmod(x+dx,input.get_width()),posmod(y+dy,input.get_height()))
                            if n.a < .5: neighbors_opaque = false; continue
                            var key := n.to_rgba32()
                            counts[key] = int(counts.get(key,0))+1
                    if not neighbors_opaque or counts.has(c.to_rgba32()): continue
                    for key in counts:
                        if counts[key] < 6: continue
                        var n: Color = palette[int(indices[key])]
                        var distance := absf(c.r-n.r)+absf(c.g-n.g)+absf(c.b-n.b)
                        if distance > .025 and distance < .16:
                            layer.set_index_on_color_map(x,y,int(indices[key]))
                            corrections += 1
            project.file_path = str(job.source)
            if ProjectPacker.save(project,str(job.source)) != OK: fail("PixelPen save failed"); return
            project = ProjectPacker.load_project(str(job.source))
        if project == null: fail("PixelPen reopen failed"); return
        PixelPen.state.current_project = project
        var output: Image = project.get_image(project.animation_timeline[0].frame)
        output.convert(Image.FORMAT_RGBA8)
        if output.save_png(str(job.output)) != OK: fail("PixelPen PNG export failed"); return
        var texture := ImageTexture.create_from_image(output)
        if ResourceSaver.save(texture,str(job.output).trim_suffix(".png")+".res",ResourceSaver.FLAG_COMPRESS) != OK:
            fail("Texture resource save failed"); return
        audit.append({"id":job.id,"native":job.source,"output":job.output,"size":[output.get_width(),output.get_height()],"nativePixelCorrections":corrections,"reusedMaster":reused,"savedReopenedExported":true})
        print("STONE_PIXELPEN ",job.id," corrections=",corrections," reused=",reused)
        PixelPen.state.current_project = null
        project = null
    var file := FileAccess.open(STUDY+"pixelpen-audit.json",FileAccess.WRITE)
    file.store_string(JSON.stringify({"approvedChoice":2,"assets":audit,"pixelsPerWorldUnit":64,"texturePeriod":[320,320]},"  "))
    file.close()
    if PixelPen.state != null:
        PixelPen.state.current_project = null
        PixelPen.state.free()
        PixelPen.state = null
    print("SQUARE_FLOOR_PIXELPEN_READY")
    quit()
