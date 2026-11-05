extends SceneTree
const BASE = "res://art/source/walls/native-v1/"
func _initialize() -> void: call_deferred("author")
func author() -> void:
    var master_path: String = BASE+("wall-coping-v3.pxpen" if FileAccess.file_exists(BASE+"wall-coping-v3.pxpen") else "wall-relief-v2.pxpen")
    if FileAccess.file_exists(master_path):
        var retained: PixelPenProject = ProjectPacker.load_project(master_path)
        if retained == null: quit(1);return
        var master: Image = retained.get_image(retained.animation_timeline[0].frame)
        if master.save_png(BASE+"wall-atlas.png") != OK: quit(1);return
        print("WALL_RELIEF_PIXELPEN: exported existing editable master; manual edits preserved")
        quit();return
    var image: Image = Image.load_from_file(BASE+"wall-atlas.png")
    var project: PixelPenProject = PixelPenProject.new()
    project.initialized(image.get_size(),"Wall stone relief v2 - shared joins")
    PixelPen.state.current_project = project
    var colors: PackedColorArray = PackedColorArray([Color.TRANSPARENT])
    var indices: Dictionary = {0:0}
    for y in range(image.get_height()):
        for x in range(image.get_width()):
            var c: Color = image.get_pixel(x,y)
            if c.a<0.5: continue
            var key: int = c.to_rgba32()
            if not indices.has(key):
                indices[key] = colors.size()
                colors.append(c)
    project.palette.color_index = colors
    var layer: IndexedColorImage = project.active_frame.layers[0]
    layer.label = "Golden sandstone relief, blue gold frieze"
    for y in range(image.get_height()):
        for x in range(image.get_width()):
            var c: Color = image.get_pixel(x,y)
            layer.set_index_on_color_map(x,y,0 if c.a<0.5 else indices[c.to_rgba32()])
    # Correct isolated interior speckles; leave every registered join edge untouched.
    var corrections: int = 0
    for y in range(1,image.get_height()-1):
        for x in range(1,image.get_width()-1):
            if x%64<4 or x%64>59 or y%256<64 or y%256>248: continue
            var c: Color = image.get_pixel(x,y)
            var n: Color = image.get_pixel(x-1,y)
            if c.a<0.5 or n.a<0.5 or c==n: continue
            if image.get_pixel(x+1,y)!=n or image.get_pixel(x,y-1)!=n or image.get_pixel(x,y+1)!=n: continue
            var distance: float = absf(c.r-n.r)+absf(c.g-n.g)+absf(c.b-n.b)
            if distance<0.20:
                layer.set_index_on_color_map(x,y,indices[n.to_rgba32()])
                corrections+=1
    var path: String = BASE+"wall-relief-v2.pxpen"
    project.file_path=path
    if ProjectPacker.save(project,path)!=OK: quit(1);return
    project=ProjectPacker.load_project(path)
    if project==null: quit(1);return
    var output: Image = project.get_image(project.animation_timeline[0].frame)
    if output.save_png(BASE+"wall-atlas.png")!=OK: quit(1);return
    print("WALL_RELIEF_PIXELPEN: saved/reopened/exported; colors=",colors.size(),"; corrected interior pixels=",corrections)
    project=null
    PixelPen.state.current_project=null
    PixelPen.state.free();PixelPen.state=null
    quit()

