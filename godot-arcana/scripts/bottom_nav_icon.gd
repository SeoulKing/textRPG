extends Control
## Smooth vector navigation, independent of world pixel rendering.
var kind = ""
const INK = Color("26364d")
func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
func line(points: Array) -> void:
	draw_polyline(PackedVector2Array(points),INK,1.7,true)
func _draw() -> void:
	draw_set_transform(Vector2.ZERO,0,size/24.0)
	match kind:
		"skills":
			line([Vector2(14,2),Vector2(5,13),Vector2(11,13),Vector2(9,22),Vector2(20,10),Vector2(13,10),Vector2(14,2)])
		"map":
			line([Vector2(3,5),Vector2(9,3),Vector2(15,5),Vector2(21,3),Vector2(21,19),Vector2(15,21),Vector2(9,19),Vector2(3,21),Vector2(3,5)])
			line([Vector2(9,3),Vector2(9,19)])
			line([Vector2(15,5),Vector2(15,21)])
		"inventory":
			line([Vector2(4,8),Vector2(20,8),Vector2(20,21),Vector2(4,21),Vector2(4,8)])
			line([Vector2(8,8),Vector2(8,4),Vector2(16,4),Vector2(16,8)])
			line([Vector2(4,13),Vector2(20,13)])
			line([Vector2(12,12),Vector2(12,16)])
		"quests":
			line([Vector2(8,4),Vector2(5,4),Vector2(5,21),Vector2(19,21),Vector2(19,4),Vector2(16,4)])
			line([Vector2(8,6),Vector2(8,3),Vector2(16,3),Vector2(16,6),Vector2(8,6)])
			line([Vector2(8,13),Vector2(11,16),Vector2(16,10)])
		"journal":
			line([Vector2(12,5),Vector2(8,3),Vector2(3,3),Vector2(3,19),Vector2(8,19),Vector2(12,21),Vector2(16,19),Vector2(21,19),Vector2(21,3),Vector2(16,3),Vector2(12,5),Vector2(12,21)])
		"menu":
			for y in [6,12,18]:
				var x = 9.0 if y==12 else 15.0
				line([Vector2(3,y),Vector2(x-3,y)])
				line([Vector2(x+3,y),Vector2(21,y)])
				draw_circle(Vector2(x,y),2.4,INK,false,1.7,true)
