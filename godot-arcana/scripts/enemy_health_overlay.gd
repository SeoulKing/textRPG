extends Control
## Screen-space combat HUD: never enters world lighting, depth or palette passes.
var hp_ratio = 1.0
var trail_ratio = 1.0
func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	z_index = 200
	hide()
func update_meter(anchor: Vector2, width: float, hp: float, trail: float, shown: bool) -> void:
	visible = shown
	if not shown: return
	size = Vector2(maxf(8,roundf(width)),7)
	global_position = (anchor-Vector2(size.x*.5,0)).round()
	hp_ratio = clampf(hp,0,1)
	trail_ratio = clampf(trail,hp_ratio,1)
	queue_redraw()
func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO,size),Color("301b21"))
	var width = size.x-2
	var current = width*hp_ratio
	var trailing = width*trail_ratio
	if trailing>current:
		draw_rect(Rect2(Vector2(1+current,1),Vector2(trailing-current,5)),Color("ff9e35"))
	if current>0:
		draw_rect(Rect2(Vector2(1,1),Vector2(current,5)),Color.RED)
