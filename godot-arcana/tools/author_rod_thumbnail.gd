extends SceneTree
## Dedicated 64px item art for approved candidate 3; native PixelPen is the editable master.
const BASE := "res://art/source/items/fishing-rod-mystic-v1/"
const OUT := "res://art/export/items/fishing-rod.png"
var layer: IndexedColorImage
func _initialize() -> void: call_deferred("author")
func dot(p: Vector2,index: int,radius: int=0) -> void:
    var q:=Vector2i(p.round())
    for y in range(-radius,radius+1):
        for x in range(-radius,radius+1):
            var at:=q+Vector2i(x,y)
            if x*x+y*y<=radius*radius+radius/2.0 and at.x>=8 and at.y>=8 and at.x<56 and at.y<56:
                layer.set_index_on_color_map(at.x,at.y,index)
func line(a: Vector2,b: Vector2,index: int,radius: int=0) -> void:
    var steps:=maxi(1,ceili(a.distance_to(b)*2))
    for i in range(steps+1):dot(a.lerp(b,float(i)/steps),index,radius)
func author() -> void:
    DirAccess.make_dir_recursive_absolute(BASE)
    var path:=BASE+"fishing-rod.pxpen"
    var project: PixelPenProject
    if FileAccess.file_exists(path):project=ProjectPacker.load_project(path)
    else:
        project=PixelPenProject.new();project.initialized(Vector2i(64,64),"Mystic fishing rod - inventory thumbnail")
        PixelPen.state.current_project=project
        var colors:=PackedColorArray([Color.TRANSPARENT,Color("#24283e"),Color("#42363e"),Color("#6f5454"),Color("#9a8071"),Color("#263c62"),Color("#5276a1"),Color("#91a7bb"),Color("#c6d3d6"),Color("#3a506c"),Color("#518dbb"),Color("#bfe3ed"),Color("#f1eee2")])
        project.palette.color_index=colors
        layer=project.active_frame.layers[0]
        layer.label="Walnut taper, lapis grip, silver guides and blue float"
        var a:=Vector2(12,52)
        var tip:=Vector2(49,15)
        var axis: Vector2=(tip-a).normalized()
        var side:=Vector2(-axis.y,axis.x)
        line(a,tip,1,1)
        line(a+axis*10,tip,2,1)
        line(a+axis*12+Vector2(0,-1),tip,4)
        line(a,a+axis*15,5,2)
        line(a+Vector2(0,-1),a+axis*14+Vector2(0,-1),6)
        for t in [1,5,9,13]:
            var p: Vector2=a+axis*float(t)
            line(p-side*2,p+side*2,7)
        line(a-side*2,a+side*2,8)
        for t in [.42,.63,.82,.98]:
            var p: Vector2=a.lerp(tip,t)
            line(p-side*2,p+side*2,8)
            dot(p+side*2,7)
        var gem:=Vector2(24,40)
        dot(gem,1,4);dot(gem,8,3);dot(gem,9,2);dot(gem,10,1);dot(gem+Vector2(-1,-1),11)
        var reel:=Vector2(23,49)
        for i in range(25):
            var angle:=float(i)*TAU/24
            dot(reel+Vector2(cos(angle),sin(angle))*3,7)
        dot(reel+Vector2(-2,-1),8)
        var bobber:=Vector2(51,26)
        line(tip,bobber,7)
        dot(bobber,1,4);dot(bobber,10,3)
        line(bobber+Vector2(-2,1),bobber+Vector2(2,1),12)
        dot(bobber+Vector2(0,2),12,1)
        dot(bobber+Vector2(-1,-2),11)
        project.file_path=path;project.animation_fps=1;project.animation_loop=false
        if ProjectPacker.save(project,path)!=OK:push_error("Rod icon save failed");quit(1);return
        project=ProjectPacker.load_project(path)
    if project==null:push_error("Rod icon reopen failed");quit(1);return
    PixelPen.state.current_project=project
    var image: Image=project.get_image(project.animation_timeline[0].frame)
    image.convert(Image.FORMAT_RGBA8)
    if image.save_png(OUT)!=OK:push_error("Rod icon PNG export failed");quit(1);return
    var rows: Array=[]
    var palette: Array=[]
    for c in project.palette.color_index:palette.append(c.to_html(true))
    for y in range(64):
        var row: Array=[]
        for x in range(64):row.append(project.palette.color_index.find(image.get_pixel(x,y)))
        rows.append(row)
    var file:=FileAccess.open(BASE+"fishing-rod.json",FileAccess.WRITE)
    file.store_string(JSON.stringify({"id":"fishingRod","size":[64,64],"transparentPadding":8,"design":"candidate-3-mystic","palette":palette,"rows":rows,"savedReopenedExported":true},"  "));file.close()
    var preview:=Image.create(256,128,false,Image.FORMAT_RGBA8)
    preview.fill(Color("#fffaf0"))
    for y in range(128):
        for x in range(128,256):preview.set_pixel(x,y,Color("#26364d"))
    var enlarged:=image.duplicate();enlarged.resize(128,128,Image.INTERPOLATE_NEAREST)
    preview.blend_rect(enlarged,Rect2i(0,0,128,128),Vector2i.ZERO)
    preview.blend_rect(enlarged,Rect2i(0,0,128,128),Vector2i(128,0))
    preview.save_png(BASE+"preview.png")
    print("PIXELPEN_ITEM_EXPORTED fishingRod 64x64 native-master=",path)
    PixelPen.state.current_project=null;PixelPen.state.free();PixelPen.state=null
    quit()
