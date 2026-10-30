extends SceneTree
var project: PixelPenProject
var layer: IndexedColorImage
var palette = ["#181340", "#30309a", "#5144c9", "#3175e8", "#25b8ef", "#57e4f2", "#adf8f4", "#f5fff7"]
func _initialize(): call_deferred("run")
func dot(x:int,y:int,c:int):
    if x>=8 and x<56 and y>=8 and y<56: layer.set_index_on_color_map(x,y,c)
func poly(points:Array,c:int):
    var p=PackedVector2Array()
    for v in points:p.append(Vector2(v[0],v[1]))
    for y in range(8,56):
        for x in range(8,56):
            if Geometry2D.is_point_in_polygon(Vector2(x+0.5,y+0.5),p):dot(x,y,c)
func rect(x:int,y:int,w:int,h:int,c:int):
    for yy in range(y,y+h):
        for xx in range(x,x+w):dot(xx,yy,c)
func run():
    project=PixelPenProject.new()
    project.initialized(Vector2i(64,64),"Blink thumbnail 03 - hand pixel")
    PixelPen.state.current_project=project
    var colors=PackedColorArray([Color.TRANSPARENT])
    for hex in palette:colors.append(Color(hex))
    project.palette.color_index=colors
    layer=project.active_frame.layers[0]
    layer.label="Hand-pixelled flash and vanishing figure"
    # Four nested stepped flashes, drawn directly as indexed pixels.
    poly([[31,8],[34,8],[35,23],[41,27],[55,30],[55,33],[42,35],[36,41],[34,55],[31,55],[28,42],[23,36],[8,34],[8,31],[23,28],[28,23]],3)
    poly([[32,9],[34,24],[39,29],[54,31],[54,33],[40,34],[34,40],[33,54],[31,41],[26,35],[10,33],[25,30],[30,24]],5)
    poly([[32,15],[34,27],[39,31],[49,32],[38,34],[34,39],[32,49],[30,39],[26,34],[15,32],[28,30],[30,26]],6)
    poly([[32,21],[34,29],[37,31],[43,32],[36,34],[33,39],[32,44],[30,37],[27,34],[21,32],[29,30]],7)
    poly([[32,25],[34,30],[38,32],[34,35],[32,40],[30,35],[26,32],[30,30]],8)
    # Broken orbit arcs, each with a bright inner edge.
    poly([[17,18],[24,15],[22,18],[18,20],[15,25],[13,25],[14,21]],3)
    poly([[17,19],[22,17],[18,21],[16,25],[14,25],[15,21]],6)
    poly([[42,16],[48,21],[51,27],[48,26],[46,22],[41,19]],3)
    poly([[44,19],[48,23],[49,26],[47,25],[44,21]],6)
    poly([[48,39],[51,39],[49,45],[43,49],[39,49],[42,46],[46,44]],3)
    poly([[49,40],[48,44],[43,47],[41,47],[46,43],[47,40]],6)
    poly([[14,39],[17,42],[22,46],[25,49],[20,48],[15,45],[12,41]],3)
    poly([[14,40],[17,43],[22,47],[19,46],[15,43]],6)
    # Dark readable disappearing human, no copied image samples.
    rect(30,25,4,1,1);rect(29,26,6,4,1);rect(30,30,4,2,1)
    poly([[29,31],[34,31],[36,34],[34,37],[34,40],[37,45],[35,47],[31,41],[29,44],[27,44],[28,39],[29,36],[26,38],[24,37],[27,33]],1)
    rect(30,26,2,1,2);rect(29,33,1,4,2)
    # Pixel fragments of the dissolving right side.
    rect(35,29,2,2,1);rect(38,31,2,2,2);rect(36,34,2,2,1)
    rect(40,35,2,2,3);rect(35,38,2,2,1);rect(39,40,2,2,2)
    rect(37,43,1,2,3);rect(43,30,1,1,3)
    for p in [[22,21],[40,12],[52,36],[18,49],[10,28],[45,51]]:
        rect(p[0],p[1],2,2,3);dot(p[0],p[1],5)
    var base="res://art/source/spells/blink-thumbnail-v1/"
    var path=base+"blink-03.pxpen"
    project.file_path=path
    if ProjectPacker.save(project,path)!=OK:quit(1);return
    project=ProjectPacker.load_project(path)
    var image=project.get_image(project.animation_timeline[0].frame)
    image.convert(Image.FORMAT_RGBA8)
    image.save_png(base+"blink-03.png")
    image.resize(512,512,Image.INTERPOLATE_NEAREST)
    image.save_png(base+"blink-03-preview.png")
    print("PIXELPEN saved, reloaded, exported 64x64; 8px margins; 8 colors")
    project=null
    PixelPen.state.current_project=null
    PixelPen.state.free()
    PixelPen.state=null
    quit()
