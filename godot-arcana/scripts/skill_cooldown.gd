extends Range
## A shrinking outer arc keeps the skill glyph readable. No countdown numerals.
var accent = Color("476cbe")

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	value_changed.connect(func(_value): queue_redraw())
	resized.connect(queue_redraw)

func _draw() -> void:
	var fraction = clampf(value/maxf(1,max_value),0,1)
	if fraction<=0: return
	var radius = minf(size.x,size.y)*.5-1
	draw_arc(size*.5,radius,0,TAU,64,Color(1,1,1,.85),4.4,true)
	draw_arc(size*.5,radius,-PI/2,-PI/2+TAU*fraction,64,accent,3.0,true)
