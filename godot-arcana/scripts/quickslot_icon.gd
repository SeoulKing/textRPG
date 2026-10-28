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
		"dev_speed":
			_stroke([Vector2(3,5),Vector2(10,12),Vector2(3,19)],Color("3b9b8b"))
			_stroke([Vector2(11,5),Vector2(18,12),Vector2(11,19)],Color("3b9b8b"))
			draw_line(Vector2(21,5),Vector2(21,19),Color("345578"),1.6,true)
		"fireball":
			var flame = PackedVector2Array([Vector2(13,1),Vector2(14,7),Vector2(18,4),Vector2(18,10),Vector2(21,14),Vector2(21,18),Vector2(17,22),Vector2(9,23),Vector2(4,19),Vector2(3,15),Vector2(7,8),Vector2(8,13),Vector2(11,9),Vector2(13,1)])
			draw_colored_polygon(flame,Color("e4773e"))
			draw_polyline(flame,Color("b84c28"),.8,true)
			draw_colored_polygon(PackedVector2Array([Vector2(13,11),Vector2(12,16),Vector2(9,17),Vector2(9,20),Vector2(13,22),Vector2(17,20),Vector2(17,17)]),Color("ffdb7a"))
		"dodge":
			draw_colored_polygon(PackedVector2Array([Vector2(10,3),Vector2(22,12),Vector2(10,21),Vector2(13,12)]),Color("347c9c"))
			draw_polyline(PackedVector2Array([Vector2(4,6),Vector2(10,12),Vector2(4,18)]),Color("478daa"),1.6,true)
			draw_line(Vector2(1,10),Vector2(5,10),Color("478daa"),1,true)
			draw_line(Vector2(0,14),Vector2(4,14),Color("478daa"),1,true)
		"potion":
			draw_colored_polygon(PackedVector2Array([Vector2(6,15),Vector2(10,14),Vector2(15,16),Vector2(18,15),Vector2(18,20),Vector2(15,22),Vector2(9,22),Vector2(6,20)]),Color("7197e2"))
			draw_polyline(PackedVector2Array([Vector2(9,5),Vector2(9,10),Vector2(5,15),Vector2(5,20),Vector2(8,23),Vector2(16,23),Vector2(19,20),Vector2(19,15),Vector2(15,10),Vector2(15,5)]),Color("405982"),1.3,true)
			draw_line(Vector2(8,4),Vector2(16,4),Color("9d743a"),2.3,true)
			draw_line(Vector2(8,16),Vector2(8,19),Color("ffffff"),1,true)
		"interact":
			var hand = PackedVector2Array([Vector2(9,14),Vector2(9,4),Vector2(10,2),Vector2(12,3),Vector2(12,11),Vector2(14,8),Vector2(16,9),Vector2(17,11),Vector2(19,10),Vector2(21,13),Vector2(20,18),Vector2(16,22),Vector2(10,22),Vector2(5,17),Vector2(4,14),Vector2(6,13),Vector2(9,16)])
			draw_colored_polygon(hand,Color(.28,.49,.72,.12))
			draw_polyline(hand,Color("345578"),1.25,true)
			draw_line(Vector2(9,23),Vector2(17,23),Color("477db6"),1.4,true)
			draw_line(Vector2(2,4),Vector2(6,4),Color("477db6"),1,true)
			draw_line(Vector2(4,2),Vector2(4,6),Color("477db6"),1,true)
		"map":
			_stroke([Vector2(2,5),Vector2(8,3),Vector2(16,5),Vector2(22,3),Vector2(22,19),Vector2(16,21),Vector2(8,19),Vector2(2,21),Vector2(2,5)])
			_stroke([Vector2(8,3),Vector2(8,19)])
			_stroke([Vector2(16,5),Vector2(16,21)])
		"inventory":
			draw_style_box(_outline(),Rect2(4,7,16,15))
			_stroke([Vector2(8,7),Vector2(8,3),Vector2(16,3),Vector2(16,7)])
			_stroke([Vector2(4,12),Vector2(20,12)])
			draw_line(Vector2(12,10),Vector2(12,15),Color("856129"),2,true)
		"quests":
			_stroke([Vector2(6,3),Vector2(19,3),Vector2(19,21),Vector2(5,21),Vector2(5,3)])
			_stroke([Vector2(9,11),Vector2(12,14),Vector2(17,8)],Color("347c9c"))
			_stroke([Vector2(9,17),Vector2(15,17)])
		"journal":
			_stroke([Vector2(12,5),Vector2(8,3),Vector2(2,3),Vector2(2,19),Vector2(8,19),Vector2(12,21),Vector2(16,19),Vector2(22,19),Vector2(22,3),Vector2(16,3),Vector2(12,5),Vector2(12,21)])
		"menu":
			for y in [6,12,18]:
				_stroke([Vector2(4,y),Vector2(20,y)])
				draw_circle(Vector2(9 if y==12 else 15,y),2.4,Color("fffaf0"),true,-1,true)
				draw_circle(Vector2(9 if y==12 else 15,y),2.4,Color("345578"),false,1.4,true)
		_:
			draw_polyline(PackedVector2Array([Vector2(12,3),Vector2(21,12),Vector2(12,21),Vector2(3,12),Vector2(12,3)]),Color(.37,.45,.56,.55),.9,true)
			draw_line(Vector2(12,8),Vector2(12,16),Color("6b7f96"),1,true)
			draw_line(Vector2(8,12),Vector2(16,12),Color("6b7f96"),1,true)

func _stroke(points: Array, color: Color = Color("345578")) -> void:
	draw_polyline(PackedVector2Array(points),color,1.6,true)

func _outline() -> StyleBoxFlat:
	var skin = StyleBoxFlat.new()
	skin.bg_color = Color.TRANSPARENT
	skin.border_color = Color("345578")
	skin.set_border_width_all(2)
	skin.set_corner_radius_all(3)
	return skin
