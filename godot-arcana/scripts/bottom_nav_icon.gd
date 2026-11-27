extends Control
## Smooth vector navigation, independent of world pixel rendering.
const INK = Color("26364d")
const BRASS = Color("946c36")
const STROKE := 1.7

var kind: String = "":
	set(value):
		kind = value
		queue_redraw()

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR

func line(points: Array, color: Color = INK) -> void:
	draw_polyline(PackedVector2Array(points), color, STROKE, true)

func _draw() -> void:
	var icon_size := minf(size.x, size.y)
	draw_set_transform((size - Vector2.ONE * icon_size) * 0.5, 0.0, Vector2.ONE * icon_size / 24.0)
	match kind:
		"skills":
			line([Vector2(14,2),Vector2(5,13),Vector2(11,13),Vector2(9,22),Vector2(20,10),Vector2(13,10),Vector2(14,2)])
		"map":
			line([Vector2(3,5),Vector2(9,3),Vector2(15,5),Vector2(21,3),Vector2(21,19),Vector2(15,21),Vector2(9,19),Vector2(3,21),Vector2(3,5)])
			line([Vector2(9,3),Vector2(9,19)])
			line([Vector2(15,5),Vector2(15,21)], BRASS)
		"inventory":
			line([Vector2(4,8),Vector2(20,8),Vector2(20,21),Vector2(4,21),Vector2(4,8)])
			line([Vector2(8,8),Vector2(8,4),Vector2(16,4),Vector2(16,8)])
			line([Vector2(4,13),Vector2(20,13)])
			line([Vector2(12,12),Vector2(12,16)], BRASS)
		"quests":
			line([Vector2(8,4),Vector2(5,4),Vector2(5,21),Vector2(19,21),Vector2(19,4),Vector2(16,4)])
			line([Vector2(8,6),Vector2(8,3),Vector2(16,3),Vector2(16,6),Vector2(8,6)])
			line([Vector2(8,13),Vector2(11,16),Vector2(16,10)], BRASS)
		"journal":
			line([Vector2(12,5),Vector2(8,3),Vector2(3,3),Vector2(3,19),Vector2(8,19),Vector2(12,21),Vector2(16,19),Vector2(21,19),Vector2(21,3),Vector2(16,3),Vector2(12,5),Vector2(12,21)])
		"menu":
			for y in [6,12,18]:
				var x = 9.0 if y==12 else 15.0
				line([Vector2(3,y),Vector2(x-3,y)])
				line([Vector2(x+3,y),Vector2(21,y)])
				draw_circle(Vector2(x,y), 2.4, BRASS if y == 12 else INK, false, STROKE, true)
		"save":
			line([Vector2(4,3), Vector2(16,3), Vector2(20,7), Vector2(20,21), Vector2(4,21), Vector2(4,3)])
			line([Vector2(8,3), Vector2(8,9), Vector2(15,9), Vector2(15,3)], BRASS)
			line([Vector2(8,21), Vector2(8,14), Vector2(16,14), Vector2(16,21)])
		"display":
			line([Vector2(3,4), Vector2(21,4), Vector2(21,16), Vector2(3,16), Vector2(3,4)])
			line([Vector2(12,16), Vector2(12,20)])
			line([Vector2(7,20), Vector2(17,20)], BRASS)
		"controls":
			line([Vector2(2,16), Vector2(4,8), Vector2(7,6), Vector2(17,6), Vector2(20,8), Vector2(22,16), Vector2(21,19), Vector2(18,19), Vector2(15,15), Vector2(9,15), Vector2(6,19), Vector2(3,19), Vector2(2,16)])
			line([Vector2(5.5,10.5), Vector2(10.5,10.5)])
			line([Vector2(8,8), Vector2(8,13)])
			draw_circle(Vector2(15,11.5), 1.15, BRASS, true, -1, true)
			draw_circle(Vector2(18,9.5), 1.15, BRASS, true, -1, true)
		"help":
			draw_circle(Vector2(12,12), 9, INK, false, STROKE, true)
			draw_arc(Vector2(12,9.5), 2.7, PI, TAU + PI / 2, 16, BRASS, STROKE, true)
			line([Vector2(12,12), Vector2(12,14)], BRASS)
			draw_circle(Vector2(12,17), 1.0, BRASS, true, -1, true)
		"account":
			draw_circle(Vector2(12,7.5), 3.7, BRASS, false, STROKE, true)
			line([Vector2(4,20), Vector2(4.8,16.5), Vector2(8,14), Vector2(16,14), Vector2(19.2,16.5), Vector2(20,20), Vector2(4,20)])
		"home":
			line([Vector2(2,11), Vector2(12,3), Vector2(22,11)])
			line([Vector2(5,9), Vector2(5,20), Vector2(19,20), Vector2(19,9)])
			line([Vector2(10,20), Vector2(10,13), Vector2(14,13), Vector2(14,20)], BRASS)
