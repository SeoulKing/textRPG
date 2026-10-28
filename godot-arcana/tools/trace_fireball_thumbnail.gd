extends SceneTree
## Reference-guided indexed transcription, editable one pixel at a time in PixelPen.
const BASE="res://art/source/spells/fireball-thumbnail-v3/"
const HEX=["#650000","#870000","#a60000","#c51b00","#e83200","#ff4800","#ff6500","#ff8500","#ffa500","#ffc500","#ffdf00","#fff000","#ffff40","#ffff80","#ffffbf","#ffffff"]
func _initialize() -> void:call_deferred("run")
func closest(c:Color,colors:PackedColorArray) -> int:
    var best=1
    var distance=INF
    for i in range(1,colors.size()):
        var p=colors[i]
        var d=2.0*pow(c.r-p.r,2)+3.0*pow(c.g-p.g,2)+pow(c.b-p.b,2)
        if d<distance:distance=d;best=i
    return best
func run() -> void:
    var ref=Image.load_from_file(BASE+"reference.png")
    var bounds=Rect2i(ref.get_width(),ref.get_height(),0,0)
    var lo=Vector2i(ref.get_width(),ref.get_height())
    var hi=Vector2i.ZERO
    for y in range(ref.get_height()):
        for x in range(ref.get_width()):
            if ref.get_pixel(x,y).a>=0.6:
                lo=lo.min(Vector2i(x,y));hi=hi.max(Vector2i(x,y))
    bounds=Rect2i(lo,hi-lo+Vector2i.ONE)
    var scale_factor=48.0/float(maxi(bounds.size.x,bounds.size.y))
    var size=Vector2i(roundi(bounds.size.x*scale_factor),roundi(bounds.size.y*scale_factor))
    var origin=Vector2i((Vector2i(64,64)-size)/2)
    var project=PixelPenProject.new()
    project.initialized(Vector2i(64,64),"Fireball - reference tracing v3")
    PixelPen.state.current_project=project
    var colors=PackedColorArray([Color.TRANSPARENT])
    for h in HEX:colors.append(Color(h))
    project.palette.color_index=colors
    var layer=project.active_frame.layers[0]
    layer.label="Reference contour and flame color clusters"
    var pixel_count=0
    var rows=[]
    for y in range(64):
        var row=[]
        for x in range(64):
            var index=0
            var cell=Vector2i(x,y)-origin
            if cell.x>=0 and cell.y>=0 and cell.x<size.x and cell.y<size.y:
                var votes={}
                var opaque=0
                for sy in range(5):
                    for sx in range(5):
                        var point=Vector2(bounds.position)+Vector2((cell.x+(sx+0.5)/5.0)*bounds.size.x/size.x,(cell.y+(sy+0.5)/5.0)*bounds.size.y/size.y)
                        var c=ref.get_pixel(clampi(int(point.x),0,ref.get_width()-1),clampi(int(point.y),0,ref.get_height()-1))
                        if c.a>=0.55:
                            opaque+=1
                            var v=closest(c,colors)
                            votes[v]=int(votes.get(v,0))+1
                if opaque>=12:
                    var count=0
                    for v in votes:
                        if votes[v]>count:count=votes[v];index=int(v)
            row.append(index)
            if index>0:
                layer.set_index_on_color_map(x,y,index)
                pixel_count+=1
        rows.append(row)
    var path=BASE+"fireball.pxpen"
    project.file_path=path
    if ProjectPacker.save(project,path)!=OK:quit(1);return
    project=ProjectPacker.load_project(path)
    if project==null:quit(2);return
    var image=project.get_image(project.animation_timeline[0].frame)
    image.convert(Image.FORMAT_RGBA8)
    image.save_png(BASE+"fireball.png")
    image.resize(512,512,Image.INTERPOLATE_NEAREST)
    image.save_png(BASE+"fireball-preview.png")
    var f=FileAccess.open(BASE+"pixels.json",FileAccess.WRITE)
    f.store_string(JSON.stringify({"canvas":[64,64],"palette":HEX,"rows":rows,"reference":"reference.png","method":"reference-guided cell color transcription; native PixelPen indexed save and export"}));f.close()
    print("PIXELPEN_REFERENCE_TRANSCRIPTION: saved/reopened 64x64, 16 colors, ",pixel_count," colored pixels")
    project=null
    PixelPen.state.current_project=null
    PixelPen.state.free();PixelPen.state=null
    quit()
