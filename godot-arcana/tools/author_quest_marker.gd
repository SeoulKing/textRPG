extends SceneTree
## Author individual indexed pixels through native PixelPen, then export the saved project.
const BASE = "res://art/source/ui/quest-marker-v1/"
const ROWS = [
 "...######....",
 ".##########..",
 "############.",
 "####....#####",
 "###......####",
 ".........####",
 ".........####",
 "........#####",
 ".......#####.",
 "......#####..",
 ".....#####...",
 ".....####....",
 ".....####....",
 ".....####....",
 ".............",
 ".............",
 ".....####....",
 ".....####....",
 ".....####....",
 ".....####....",
]
func _initialize() -> void: call_deferred("run")
func run() -> void:
    var project = PixelPenProject.new()
    project.initialized(Vector2i(20,26),"Arcana golden quest question mark")
    PixelPen.state.current_project = project
    project.palette.color_index = PackedColorArray([Color.TRANSPARENT,Color("382018"),Color("bd771d"),Color("ffcd36"),Color("fff17a")])
    var layer = project.active_frame.layers[0]
    layer.label = "Hand-pixelled gold question mark"
    # One source-pixel dark outline, drawn before the gold face.
    for y in range(ROWS.size()):
        for x in range(ROWS[y].length()):
            if ROWS[y][x] != "#": continue
            for dy in range(-1,2):
                for dx in range(-1,2): layer.set_index_on_color_map(x+3+dx,y+3+dy,1)
    for y in range(ROWS.size()):
        for x in range(ROWS[y].length()):
            if ROWS[y][x] != "#": continue
            var shade = 4 if y < 3 or (x < 3 and y < 6) else 2 if y in [13,19] or x > 10 else 3
            layer.set_index_on_color_map(x+3,y+3,shade)
    var path = BASE+"quest-question.pxpen"
    project.file_path = path
    if ProjectPacker.save(project,path) != OK: quit(1); return
    project = ProjectPacker.load_project(path)
    if project == null: quit(1); return
    var image = project.get_image(project.animation_timeline[0].frame)
    image.convert(Image.FORMAT_RGBA8)
    if image.save_png("res://art/export/ui/quest-question.png") != OK: quit(1); return
    image.resize(240,312,Image.INTERPOLATE_NEAREST)
    image.save_png(BASE+"preview.png")
    print("PixelPen quest marker: indexed pixels saved, reloaded, exported 20x26 PNG")
    project = null
    PixelPen.state.current_project = null
    PixelPen.state.free()
    PixelPen.state = null
    quit()
