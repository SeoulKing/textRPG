extends SceneTree
## Narrow 1x3 version: retain post thickness; shorten the inner cross-pieces.
const BASE = "res://art/source/props/bed-stardew-v2/"
const OUT = "res://art/export/bed-stardew-v2/"
const SIZE = Vector2i(112,272)
func _initialize() -> void: call_deferred("run")
func source_x(x: int) -> int:
    if x<40: return x
    if x>=72: return x+64
    return 40+int((float(x-40)+0.5)*3.0)
func run() -> void:
    if FileAccess.file_exists(BASE+"bed.pxpen"):
        push_error("Existing v2 master is protected"); quit(1); return
    var original := ProjectPacker.load_project("res://art/source/props/bed-stardew-v1/bed.pxpen")
    if original==null: push_error("Missing approved original"); quit(1); return
    var project := PixelPenProject.new()
    project.initialized(SIZE,"Arcana lapis single bed - 1x3 tiles")
    PixelPen.state.current_project=project
    project.palette.color_index=original.palette.color_index.duplicate()
    var count := 0
    for i in range(original.active_frame.layers.size()):
        var source: IndexedColorImage=original.active_frame.layers[i]
        var target: IndexedColorImage
        if i==0: target=project.active_frame.layers[0]
        else: target=project.get_index_image(project.add_layer(source.label,project.active_layer_uid))
        target.label=source.label+" - narrow single bed"
        for y in range(SIZE.y):
            for x in range(SIZE.x):
                var index := source.get_index_on_color_map(source_x(x),y)
                if index!=0:
                    target.set_index_on_color_map(x,y,index)
                    count+=1
    var finish := project.get_index_image(project.add_layer("Repainted square-pixel stars and narrow pillow folds",project.active_layer_uid))
    var edits := 0
    # Restore equal horizontal/vertical pixel sizes in the ornaments after reflow.
    for cy in [37,137,163,191,222]:
        var radius := 3
        for dy in range(-radius,radius+1):
            for dx in range(-radius,radius+1):
                if abs(dx)+abs(dy)<=radius and (abs(dx)<=1 or abs(dy)<=1):
                    finish.set_index_on_color_map(56+dx,cy+dy,15 if dx+dy>0 else 17)
                    edits+=1
        finish.set_index_on_color_map(56,cy,18)
    # Keep the narrow pillow folds readable at native size.
    for x in range(46,54):
        finish.set_index_on_color_map(x,78,35)
        edits+=1
    project.file_path=BASE+"bed.pxpen"
    if ProjectPacker.save(project,project.file_path)!=OK: quit(1); return
    project=ProjectPacker.load_project(BASE+"bed.pxpen")
    if project==null: quit(1); return
    PixelPen.state.current_project=project
    var image := project.get_image(project.animation_timeline[0].frame)
    image.convert(Image.FORMAT_RGBA8)
    if image.save_png(OUT+"bed.png")!=OK or image.save_png(BASE+"bed.png")!=OK: quit(1); return
    image.resize(SIZE.x*4,SIZE.y*4,Image.INTERPOLATE_NEAREST)
    image.save_png(BASE+"preview-4x.png")
    var audit := {"tool":"Godot / PixelPen native indexed API","savedReopenedExported":true,"guiBrushSession":false,"canvas":[112,272],"footPixel":[56,250],"footprintTiles":[1,3],"preservedOriginal":"bed-stardew-v1/bed.pxpen","method":"Retain 40px outer bands; reflow 96px center to 32px; repaint embroidery","indexedPixels":count,"finishEdits":edits,"layers":3}
    var file := FileAccess.open(BASE+"pixelpen-audit.json",FileAccess.WRITE)
    file.store_string(JSON.stringify(audit,"  ")); file.close()
    print("PIXELPEN_BED ",JSON.stringify(audit))
    original=null
    project=null
    PixelPen.state.current_project=null
    PixelPen.state.free(); PixelPen.state=null
    quit()
