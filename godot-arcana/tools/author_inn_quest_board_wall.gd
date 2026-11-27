extends SceneTree
## Native PixelPen indexed-pixel authoring. No concept-image downsampling.
const BASE = "res://art/source/props/inn-quest-board-wall-v2/"
var project: PixelPenProject
var layer: IndexedColorImage
var colors = ["281b20","44302b","633c28","87512d","ac733c","d4a15b","946020","cf922b","f4ca55","ffdf80","a58055","cfb080","efdaa4","fff0c4","443251","66457e","9365a0","40532b","6a8737","a0b84f"]
func _initialize() -> void: call_deferred("run")
func dot(x: int, y: int, c: int) -> void:
    if x >= 0 and x < 128 and y >= 0 and y < 160: layer.set_index_on_color_map(x,y,c)
func rect(x: int,y: int,w: int,h: int,c: int) -> void:
    for yy in range(y,y+h):
        for xx in range(x,x+w): dot(xx,yy,c)
func poly(points: Array,c: int) -> void:
    var shape = PackedVector2Array()
    for point in points: shape.append(Vector2(point[0],point[1]))
    for y in range(160):
        for x in range(128):
            if Geometry2D.is_point_in_polygon(Vector2(x+.5,y+.5),shape): dot(x,y,c)
func paper(x: int,y: int,w: int,h: int) -> void:
    rect(x,y,w,h,1);rect(x+1,y+1,w-2,h-2,11)
    rect(x+2,y+2,w-4,h-5,13);rect(x+2,y+2,w-4,2,14)
    rect(x+3,y+2,3,3,7);rect(x+3,y+2,2,1,10)
    rect(x+w-6,y+2,3,3,7);rect(x+w-6,y+2,2,1,10)
func run() -> void:
    project = PixelPenProject.new()
    project.initialized(Vector2i(128,160),"Inn wall quest board - no legs")
    PixelPen.state.current_project = project
    var palette = PackedColorArray([Color.TRANSPARENT])
    for hex in colors: palette.append(Color(hex))
    project.palette.color_index = palette
    layer = project.active_frame.layers[0]
    layer.label = "Walnut board, parchment and slime notice"
    # Dark stepped silhouette, raised crown, and broad planks.
    rect(8,24,112,100,1);rect(14,28,100,88,3)
    poly([[24,26],[35,17],[47,17],[53,11],[76,11],[83,17],[95,17],[105,26]],1)
    poly([[29,25],[37,19],[49,19],[55,13],[74,13],[81,19],[94,19],[101,25]],5)
    rect(18,27,92,3,6)
    for y in [33,49,65,81,97]:
        rect(18,y,92,14,4);rect(18,y,92,2,5);rect(18,y+13,92,1,2)
    for x in [8,108]:
        rect(x,23,12,101,1);rect(x+2,25,8,99,4);rect(x+2,25,2,99,6)
        for y in [24,112]:
            rect(x-2,y,16,10,1);rect(x-1,y+1,14,8,8);rect(x,y+1,12,2,10)
            rect(x+4,y+4,3,3,7);dot(x+4,y+4,10)
    rect(21,110,86,6,1);rect(21,110,86,2,6);rect(21,112,86,3,4)
    # Gold crescent, solid clusters instead of noise.
    poly([[63,15],[70,15],[66,18],[64,22],[66,26],[71,28],[76,27],[73,31],[65,31],[59,27],[57,23],[59,18]],7)
    poly([[63,15],[69,15],[63,19],[62,24],[65,28],[61,26],[59,22],[60,18]],10)
    # Purple cloth hangs over the upper right frame.
    poly([[92,20],[107,20],[110,23],[110,48],[102,53],[94,48]],1)
    poly([[94,22],[106,22],[108,24],[108,47],[102,51],[96,47]],16)
    rect(95,22,2,24,17);rect(106,24,2,23,8)
    rect(100,34,3,7,9);rect(98,36,7,3,9)
    # Only three legible notices.
    paper(24,39,22,34);paper(48,45,40,59);paper(91,57,15,34)
    # Crossed sword icon, no tiny pseudo-text.
    for i in range(9):
        rect(29+i,48+i,2,2,12);rect(37-i,48+i,2,2,12)
    rect(28,63,13,2,11)
    # Green slime with consistent two-pixel facial marks.
    poly([[55,70],[58,64],[62,62],[64,58],[72,58],[75,62],[79,66],[82,72],[80,79],[56,79]],18)
    poly([[57,69],[61,64],[65,60],[71,60],[75,65],[79,69],[80,76],[58,76]],19)
    rect(63,63,6,2,20);rect(62,69,2,4,18);rect(73,69,2,4,18)
    for start in [54,71]:
        for i in range(4): rect(start+i*3,85,1,8,3)
        for i in range(12): dot(start+i,91-int(i/3),3)
    # Coin reward seal.
    poly([[79,94],[84,94],[87,97],[87,102],[84,105],[79,105],[76,102],[76,97]],7)
    rect(79,96,5,7,9);rect(80,97,3,5,8);dot(79,96,10)
    # Paw icon on secondary notice.
    rect(96,70,5,5,12);rect(94,67,2,3,12);rect(98,65,2,3,12);rect(102,68,2,3,12)
    rect(94,82,9,2,11)
    rect(0,122,128,38,0) # Flat lower frame: no post ends or floor supports.
    var path = BASE+"inn-quest-board.pxpen"
    project.file_path = path
    if ProjectPacker.save(project,path) != OK: quit(1); return
    project = ProjectPacker.load_project(path)
    if project == null: quit(1); return
    var image = project.get_image(project.animation_timeline[0].frame)
    image.convert(Image.FORMAT_RGBA8)
    if image.save_png("res://art/export/inn-quest-board/inn-quest-board.png") != OK: quit(1); return
    image.resize(512,640,Image.INTERPOLATE_NEAREST)
    image.save_png(BASE+"preview.png")
    print("Native PixelPen quest board saved/reloaded/exported: 128x160; wall mount, no floor footprint")
    project = null
    PixelPen.state.current_project = null
    PixelPen.state.free()
    PixelPen.state = null
    quit()
