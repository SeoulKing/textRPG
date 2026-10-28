@tool
extends Control
signal stroke_started
signal pixel_painted(point: Vector2i, erase: bool)
signal stroke_finished
var texture: ImageTexture
var onion: ImageTexture
var dimensions = Vector2i(64,80)
var foot = Vector2(32,74)
var display_scale = 4
var grid = true
var drawing = false
var erasing = false
var previous = Vector2i(-1,-1)
func _ready() -> void:
    custom_minimum_size = Vector2(dimensions)*display_scale
    texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
    mouse_default_cursor_shape = Control.CURSOR_CROSS
func show_image(image: Image, ghost: Image = null) -> void:
    if texture==null or texture.get_size()!=Vector2(image.get_size()): texture = ImageTexture.create_from_image(image)
    else: texture.update(image)
    onion = ImageTexture.create_from_image(ghost) if ghost!=null else null
    queue_redraw()
func _area() -> Rect2:
    var scale = maxf(1,floorf(minf(size.x/dimensions.x,size.y/dimensions.y)))
    var extent = Vector2(dimensions)*scale
    return Rect2((size-extent)*.5,extent)
func _draw() -> void:
    var area = _area()
    var step = area.size/Vector2(dimensions)
    for y in range(0,dimensions.y,8):
        for x in range(0,dimensions.x,8):
            draw_rect(Rect2(area.position+Vector2(x,y)*step,Vector2(mini(8,dimensions.x-x),mini(8,dimensions.y-y))*step),Color("303944") if (x/8+y/8)%2==0 else Color("3b4551"))
    if onion!=null: draw_texture_rect(onion,area,false,Color(1,.6,.6,.28))
    if texture!=null: draw_texture_rect(texture,area,false)
    if grid:
        for x in range(dimensions.x+1): draw_line(area.position+Vector2(x*step.x,0),area.position+Vector2(x*step.x,area.size.y),Color(0,0,0,.20))
        for y in range(dimensions.y+1): draw_line(area.position+Vector2(0,y*step.y),area.position+Vector2(area.size.x,y*step.y),Color(0,0,0,.20))
    var anchor = area.position+foot*step
    draw_line(anchor-Vector2(7,0),anchor+Vector2(7,0),Color("f9e7a6"),2)
    draw_line(anchor-Vector2(0,7),anchor+Vector2(0,7),Color("f9e7a6"),2)
func _gui_input(event: InputEvent) -> void:
    if event is InputEventMouseButton and event.button_index in [MOUSE_BUTTON_LEFT,MOUSE_BUTTON_RIGHT]:
        if event.pressed:
            if not _area().has_point(event.position): return
            drawing = true
            erasing = event.button_index==MOUSE_BUTTON_RIGHT
            previous = Vector2i(-1,-1)
            stroke_started.emit()
            _paint(event.position)
        elif drawing:
            drawing = false
            stroke_finished.emit()
        accept_event()
    elif event is InputEventMouseMotion and drawing:
        _paint(event.position)
        accept_event()
func _paint(at: Vector2) -> void:
    var area = _area()
    var point = Vector2i(((at-area.position)/area.size*Vector2(dimensions)).floor())
    if point.x<0 or point.y<0 or point.x>=dimensions.x or point.y>=dimensions.y: return
    if point==previous: return
    var start = point if previous.x<0 else previous
    var count = maxi(absi(point.x-start.x),absi(point.y-start.y))
    for i in range(count+1): pixel_painted.emit(Vector2i(Vector2(start).lerp(Vector2(point),float(i)/maxi(1,count)).round()),erasing)
    previous = point
