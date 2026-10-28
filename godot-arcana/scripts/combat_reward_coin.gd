extends Control
## Small, antialiased UI pickup icon; never blocks game input.
func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	size = Vector2(12,12)
func _draw() -> void:
	draw_circle(Vector2(6,7),5,Color("8d5a22"),true,-1,true)
	draw_circle(Vector2(6,5),5,Color("f5c957"),true,-1,true)
	draw_circle(Vector2(6,5),3.2,Color("ffeaa4"),false,1.0,true)
	draw_line(Vector2(6,3),Vector2(6,7),Color("ad742a"),1.4,true)
