extends SceneTree
## Approved concept traced into native indexed layers, then pixel-finished and reopened.
const BASE = "res://art/source/props/bed-single-v3/"
const OUT = "res://art/export/bed-single-v3/"
const SIZE = Vector2i(112,192)
const HEX = ["241c29","302332","47313a","39271e","54351f","704325","88532b","a36a34","bf8648","dca760","ebbc77","674413","93611b","b77f22","d99b2b","f1bb44","ffda71","fff0ae","0f183e","172352","1c2d6b","203984","2448a4","2b57bc","386acb","527fd5","161b35","2b2c47","51475b","7b6a75","a18b90","b7a9ac","d1c4ba","e1d3b9","efdfbd","f8e9c8","fff3d5","fff9e3","cab58f","b49a72","867055","604b3b"]
var project: PixelPenProject
var paint: IndexedColorImage
var detail: IndexedColorImage
var palette := PackedColorArray([Color.TRANSPARENT])
var corrections := 0
func _initialize() -> void:
    call_deferred("run")
func fail(message: String) -> void:
    push_error(message)
    quit(1)
func nearest(color: Color) -> int:
    var best := 1
    var distance := INF
    for i in range(1,palette.size()):
        var p := palette[i]
        var d := 0.30*pow(color.r-p.r,2)+0.45*pow(color.g-p.g,2)+0.25*pow(color.b-p.b,2)
        if d < distance:
            distance = d
            best = i
    return best
func dot(x: int,y: int,index: int) -> void:
    if x>=0 and y>=0 and x<SIZE.x and y<SIZE.y:
        detail.set_index_on_color_map(x,y,index)
        corrections += 1
func star(x: int,y: int,radius: int) -> void:
    # Asymmetric highlight and shaded lower/right facets, no antialiasing.
    for dy in range(-radius,radius+1):
        for dx in range(-radius,radius+1):
            if abs(dx)+abs(dy) <= radius and (abs(dx)<=1 or abs(dy)<=1):
                dot(x+dx,y+dy,15 if dx+dy>0 else 17)
    dot(x,y,18)
    dot(x,y-1,18)
func run() -> void:
    if FileAccess.file_exists(BASE+"bed.pxpen"):
        fail("Existing PixelPen master is protected. Use a new version to regenerate."); return
    for value in HEX:
        palette.append(Color(value))
    var tracing := Image.load_from_file(BASE+"tracing-reference.png")
    if tracing == null or tracing.get_size()!=SIZE:
        fail("Missing 112x192 tracing reference"); return
    project = PixelPenProject.new()
    project.initialized(SIZE,"Arcana - approved lapis bed - 1x3 tiles")
    PixelPen.state.current_project = project
    project.palette.color_index = palette
    paint = project.active_frame.layers[0]
    paint.label = "Walnut frame, ivory linen, lapis quilt - indexed clusters"
    # Repaint each reference sample in material ramps at native resolution.
    var painted := 0
    for y in range(SIZE.y):
        for x in range(SIZE.x):
            var color := tracing.get_pixel(x,y)
            if color.a < 0.75: continue
            paint.set_index_on_color_map(x,y,nearest(color))
            painted += 1
    # Remove isolated interior texture pixels, retaining specular gold and silhouettes.
    var edits: Array = []
    for y in range(1,SIZE.y-1):
        for x in range(1,SIZE.x-1):
            var center := paint.get_index_on_color_map(x,y)
            if center==0: continue
            var counts: Dictionary = {}
            var same := 0
            var all_solid := true
            for delta in [Vector2i.LEFT,Vector2i.RIGHT,Vector2i.UP,Vector2i.DOWN]:
                var index := paint.get_index_on_color_map(x+delta.x,y+delta.y)
                if index==0: all_solid=false
                if index==center: same+=1
                counts[index]=int(counts.get(index,0))+1
            if same>0 or not all_solid or (center>=13 and center<=18): continue
            for index in counts:
                if int(counts[index])>=3 and palette[center].is_equal_approx(palette[index])==false:
                    var a := palette[center]
                    var b := palette[index]
                    if absf(a.r-b.r)+absf(a.g-b.g)+absf(a.b-b.b)<0.55:
                        edits.append([x,y,index])
                    break
    for edit in edits:
        paint.set_index_on_color_map(edit[0],edit[1],edit[2])
    corrections += edits.size()
    var uid := project.add_layer("Finish - embroidery, pillow folds and timber grain",project.active_layer_uid)
    detail = project.get_index_image(uid)
    # New concept ornaments only: a single headboard star and one quilt star.
    star(56,22,3)
    star(56,119,4)
    # Short broad pillow folds, retaining the new naturally horizontal pillow.
    for x in range(41,51): dot(x,51,35)
    for x in range(43,50): dot(x,52,36)
    # Restore subtle upper-left post highlights with full square source pixels.
    for y in range(29,42):
        if paint.get_index_on_color_map(26,y)!=0: dot(26,y,9)
    for y in range(155,165):
        if paint.get_index_on_color_map(26,y)!=0: dot(26,y,8)
    project.file_path = BASE+"bed.pxpen"
    if ProjectPacker.save(project,project.file_path)!=OK:
        fail("PixelPen native save failed"); return
    project = ProjectPacker.load_project(BASE+"bed.pxpen")
    if project==null:
        fail("PixelPen reopen failed"); return
    PixelPen.state.current_project = project
    var result := project.get_image(project.animation_timeline[0].frame)
    result.convert(Image.FORMAT_RGBA8)
    if result.save_png(OUT+"bed.png")!=OK or result.save_png(BASE+"bed.png")!=OK:
        fail("PixelPen PNG export failed"); return
    result.resize(SIZE.x*4,SIZE.y*4,Image.INTERPOLATE_NEAREST)
    result.save_png(BASE+"preview-4x.png")
    var audit := {"tool":"Godot 4.5.1 / PixelPen 1.1.4 native indexed API","savedReopenedExported":true,"guiBrushSession":false,"canvas":[112,192],"paletteColors":HEX.size(),"tracedIndexedPixels":painted,"nativeFinishEdits":corrections,"layers":2,"footprintTiles":[1,3],"footPixel":[56,174]}
    var file := FileAccess.open(BASE+"pixelpen-audit.json",FileAccess.WRITE)
    file.store_string(JSON.stringify(audit,"  "))
    file.close()
    print("PIXELPEN_BED ",JSON.stringify(audit))
    paint=null
    detail=null
    project=null
    PixelPen.state.current_project=null
    PixelPen.state.free()
    PixelPen.state=null
    quit()
