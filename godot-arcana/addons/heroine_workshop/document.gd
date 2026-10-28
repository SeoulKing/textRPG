@tool
extends RefCounted
const SOURCE = "res://art/source/heroine/workshop.json"
const SPEC = preload("res://art/resources/heroine_reference_spec.gd")
const DIRECTIONS = ["s","se","e","ne","n","nw","w","sw"]
const LAYERS = ["body","hair","dress","shawl","boots-taupe","blouse","skirt","boots-navy","dress-mask","top-mask","bottom-mask","feet-mask","arms-front","arms-back","arms-bare"]
const CLIPS = ["idle","walk","stop_left","stop_right","turn_left","turn_right"]
static var atlases: Dictionary = {}
static func clear_cache() -> void:
    atlases.clear()
static func source_image(path: String) -> Image:
    var stamp = FileAccess.get_modified_time(path)
    if not atlases.has(path) or atlases[path].stamp!=stamp:
        atlases[path] = {"stamp":stamp,"image":Image.load_from_file(path)}
    return atlases[path].image
static func read_source() -> Dictionary:
    var value = JSON.parse_string(FileAccess.get_file_as_string(SOURCE))
    return value if value is Dictionary else {}
static func count(clip: String) -> int:
    return SPEC.IDLE_FRAMES if clip=="idle" else SPEC.WALK_FRAMES if clip=="walk" else SPEC.STOP_FRAMES
static func offset(clip: String) -> int:
    return 0 if clip=="idle" else SPEC.IDLE_FRAMES if clip=="walk" else SPEC.IDLE_FRAMES+SPEC.WALK_FRAMES+(SPEC.STOP_FRAMES if clip=="stop_right" else 0)
static func key(layer: String, direction: String, clip: String, frame: int) -> String:
    return layer+"/"+direction+"/"+clip+"/"+str(frame)
static func frame_image(data: Dictionary, layer: String, direction: String, clip: String, frame: int) -> Image:
    var atlas = source_image("res://art/export/reference/hero-"+layer+".png")
    var index = DIRECTIONS.find(direction)*SPEC.FRAMES_PER_DIRECTION+offset(clip)+frame
    if clip.begins_with("turn"):index=288+DIRECTIONS.find(direction)*8+(4 if clip=="turn_right" else 0)+frame
    var result = atlas.get_region(Rect2i(Vector2i(index%SPEC.ATLAS_GRID.x,int(index/SPEC.ATLAS_GRID.x))*SPEC.FRAME_SIZE,SPEC.FRAME_SIZE))
    var changes: Dictionary = data.patches.get(key(layer,direction,clip,frame),{})
    for point in changes:
        var xy = str(point).split(",")
        result.set_pixel(int(xy[0]),int(xy[1]),Color.TRANSPARENT if changes[point]=="." else Color(changes[point]))
    return result
static func composed(data: Dictionary, direction: String, clip: String, frame: int) -> Image:
    var result = frame_image(data,"arms-back",direction,clip,frame)
    result.blend_rect(frame_image(data,"body",direction,clip,frame),Rect2i(Vector2i.ZERO,SPEC.FRAME_SIZE),Vector2i.ZERO)
    var dress_mask = frame_image(data,"dress-mask",direction,clip,frame)
    var feet_mask = frame_image(data,"feet-mask",direction,clip,frame)
    for y in range(SPEC.FRAME_SIZE.y):
        for x in range(SPEC.FRAME_SIZE.x):
            if dress_mask.get_pixel(x,y).a>.5 or feet_mask.get_pixel(x,y).a>.5: result.set_pixel(x,y,Color.TRANSPARENT)
    for layer in ["boots-taupe","dress","arms-front","shawl","hair"]:
        var image = frame_image(data,layer,direction,clip,frame)
        result.blend_rect(image,Rect2i(Vector2i.ZERO,SPEC.FRAME_SIZE),Vector2i.ZERO)
    return result
