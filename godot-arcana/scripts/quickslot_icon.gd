extends Control

var kind = "":
	set(value):
		kind = value
		queue_redraw()

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE

func _draw() -> void:
	match kind:
		"fireball":
			draw_colored_polygon(PackedVector2Array([Vector2(13,0),Vector2(11,8),Vector2(6,5),Vector2(2,15),Vector2(5,23),Vector2(17,24),Vector2(23,17),Vector2(20,8),Vector2(17,13)]), Color("d0a17c"))
			draw_colored_polygon(PackedVector2Array([Vector2(12,12),Vector2(7,20),Vector2(12,24),Vector2(17,20)]), Color("eed4a0"))
		"dodge":
			for x in [2, 12]:
				draw_polyline(PackedVector2Array([Vector2(x,4),Vector2(x+9,12),Vector2(x,20)]), Color("b6cfae"), 3, true)
		"potion":
			draw_colored_polygon(PackedVector2Array([Vector2(7,11),Vector2(17,11),Vector2(20,21),Vector2(17,24),Vector2(7,24),Vector2(4,21)]), Color("85b8bd"))
			draw_polyline(PackedVector2Array([Vector2(9,5),Vector2(9,9),Vector2(4,16),Vector2(4,21),Vector2(7,24),Vector2(17,24),Vector2(20,21),Vector2(20,16),Vector2(15,9),Vector2(15,5)]), Color("e3e5d3"), 1.5, true)
			draw_line(Vector2(8,3),Vector2(16,3),Color("dec99c"),4,true)
		_:
			draw_line(Vector2(12,5),Vector2(12,19),Color("a4b7ab"),1.5,true)
			draw_line(Vector2(5,12),Vector2(19,12),Color("a4b7ab"),1.5,true)
