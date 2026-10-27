extends Control

var kind = "":
	set(value):
		kind = value
		queue_redraw()

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE

func _draw() -> void:
	draw_set_transform(Vector2.ZERO,0,size/24.0)
	match kind:
		"fireball":
			var flame = PackedVector2Array([Vector2(13,1),Vector2(14,7),Vector2(18,4),Vector2(18,10),Vector2(21,14),Vector2(21,18),Vector2(17,22),Vector2(9,23),Vector2(4,19),Vector2(3,15),Vector2(7,8),Vector2(8,13),Vector2(11,9),Vector2(13,1)])
			draw_colored_polygon(flame,Color("e7bb8a"))
			draw_polyline(flame,Color("ffe6bb"),.8,true)
			draw_colored_polygon(PackedVector2Array([Vector2(13,11),Vector2(12,16),Vector2(9,17),Vector2(9,20),Vector2(13,22),Vector2(17,20),Vector2(17,17)]),Color("fff0d0"))
		"dodge":
			draw_colored_polygon(PackedVector2Array([Vector2(10,3),Vector2(22,12),Vector2(10,21),Vector2(13,12)]),Color("e6f1e7"))
			draw_polyline(PackedVector2Array([Vector2(4,6),Vector2(10,12),Vector2(4,18)]),Color("b1d8d2"),1.6,true)
			draw_line(Vector2(1,10),Vector2(5,10),Color("b1d8d2"),1,true)
			draw_line(Vector2(0,14),Vector2(4,14),Color("b1d8d2"),1,true)
		"potion":
			draw_colored_polygon(PackedVector2Array([Vector2(6,15),Vector2(10,14),Vector2(15,16),Vector2(18,15),Vector2(18,20),Vector2(15,22),Vector2(9,22),Vector2(6,20)]),Color("9ccbd7"))
			draw_polyline(PackedVector2Array([Vector2(9,5),Vector2(9,10),Vector2(5,15),Vector2(5,20),Vector2(8,23),Vector2(16,23),Vector2(19,20),Vector2(19,15),Vector2(15,10),Vector2(15,5)]),Color("e8f0e4"),1.3,true)
			draw_line(Vector2(8,4),Vector2(16,4),Color("e5d3ab"),2.3,true)
			draw_line(Vector2(8,16),Vector2(8,19),Color("effaf0"),1,true)
		"interact":
			var hand = PackedVector2Array([Vector2(9,14),Vector2(9,4),Vector2(10,2),Vector2(12,3),Vector2(12,11),Vector2(14,8),Vector2(16,9),Vector2(17,11),Vector2(19,10),Vector2(21,13),Vector2(20,18),Vector2(16,22),Vector2(10,22),Vector2(5,17),Vector2(4,14),Vector2(6,13),Vector2(9,16)])
			draw_colored_polygon(hand,Color(.90,.84,.68,.16))
			draw_polyline(hand,Color("f2e7cc"),1.25,true)
			draw_line(Vector2(9,23),Vector2(17,23),Color("e2c88d"),1.4,true)
			draw_line(Vector2(2,4),Vector2(6,4),Color("e2c88d"),1,true)
			draw_line(Vector2(4,2),Vector2(4,6),Color("e2c88d"),1,true)
		_:
			draw_polyline(PackedVector2Array([Vector2(12,3),Vector2(21,12),Vector2(12,21),Vector2(3,12),Vector2(12,3)]),Color(.76,.83,.77,.40),.9,true)
			draw_line(Vector2(12,8),Vector2(12,16),Color("b3c7bd"),1,true)
			draw_line(Vector2(8,12),Vector2(16,12),Color("b3c7bd"),1,true)
