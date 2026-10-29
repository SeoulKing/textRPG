extends SceneTree
## Approved candidate 2 -> indexed pixel transcription -> native PixelPen save/reopen/export.
const BASE = "res://art/source/spells/dash-thumbnail-v2/"
const HEX = ["#092b51", "#94e4f5", "#00bdec"]
func _initialize() -> void: call_deferred("run")
func classify(c: Color) -> int:
    if c.b <= c.r * 1.18 or c.r > 0.85: return 0
    if c.b < 0.57: return 1
    if c.r > 0.23: return 2
    return 3
func run() -> void:
    var ref: Image = Image.load_from_file(BASE + "approved-candidates.png").get_region(Rect2i(724, 125, 570, 330))
    var lo := Vector2i(ref.get_width(), ref.get_height())
    var hi := Vector2i.ZERO
    for y in range(ref.get_height()):
        for x in range(ref.get_width()):
            if classify(ref.get_pixel(x,y)) > 0:
                lo = lo.min(Vector2i(x,y)); hi = hi.max(Vector2i(x,y))
    var bounds := Rect2i(lo, hi-lo+Vector2i.ONE)
    var factor := 48.0 / float(maxi(bounds.size.x, bounds.size.y))
    var extent := Vector2i(roundi(bounds.size.x*factor),roundi(bounds.size.y*factor))
    var origin := Vector2i((Vector2i(64,64)-extent)/2)
    var project := PixelPenProject.new()
    project.initialized(Vector2i(64,64),"Dash - approved afterimage candidate 2")
    PixelPen.state.current_project = project
    var colors := PackedColorArray([Color.TRANSPARENT])
    for h in HEX: colors.append(Color(h))
    project.palette.color_index = colors
    var layer = project.active_frame.layers[0]
    layer.label = "Approved silhouette, offset ghost and two speed trails"
    var rows := []
    var counts := [0,0,0,0]
    for y in range(64):
        var row := []
        for x in range(64):
            var index := 0
            var cell := Vector2i(x,y)-origin
            if cell.x>=0 and cell.y>=0 and cell.x<extent.x and cell.y<extent.y:
                var votes := [0,0,0,0]
                for sy in range(5):
                    for sx in range(5):
                        var point := Vector2(bounds.position) + Vector2((cell.x+(sx+0.5)/5.0)*bounds.size.x/extent.x,(cell.y+(sy+0.5)/5.0)*bounds.size.y/extent.y)
                        votes[classify(ref.get_pixel(int(point.x),int(point.y)))] += 1
                if 25-votes[0]>=12:
                    index=1
                    for v in range(2,4):
                        if votes[v]>votes[index]: index=v
            row.append(index)
            counts[index]+=1
            if index>0: layer.set_index_on_color_map(x,y,index)
        rows.append(row)
    var path := BASE+"dash.pxpen"
    project.file_path=path
    if ProjectPacker.save(project,path)!=OK: quit(1); return
    project=ProjectPacker.load_project(path)
    if project==null: quit(2); return
    var img: Image=project.get_image(project.animation_timeline[0].frame)
    img.convert(Image.FORMAT_RGBA8)
    img.save_png(BASE+"dash.png")
    img.save_png("res://art/export/spells/dash.png")
    img.resize(384,384,Image.INTERPOLATE_NEAREST)
    var preview := Image.create(384,384,false,Image.FORMAT_RGBA8)
    preview.fill(Color("#fffaf0"))
    preview.blend_rect(img,Rect2i(0,0,384,384),Vector2i.ZERO)
    preview.save_png(BASE+"dash-preview.png")
    var file := FileAccess.open(BASE+"pixels.json",FileAccess.WRITE)
    file.store_string(JSON.stringify({"canvas":[64,64],"palette":HEX,"rows":rows,"counts":counts,"approved_candidate":2,"reference_crop":[724,125,570,330],"method":"5x5 cell votes from approved contours; native PixelPen indexed save, reopen and PNG export","native_reopened":true},"  "))
    file.close()
    print("PIXELPEN_DASH: saved/reopened/exported 64x64; palette counts ",counts)
    project=null
    PixelPen.state.current_project=null
    PixelPen.state.free(); PixelPen.state=null
    quit()