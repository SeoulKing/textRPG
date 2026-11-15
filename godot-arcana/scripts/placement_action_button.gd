extends "res://scripts/mobile_action_button.gd"
## Reuse action-button chrome; draw symbols so the controls do not depend on font glyphs.
var kind: String = "move"

func _draw() -> void:
	super._draw()
	var center: Vector2 = size*.5
	var ink: Color = accent if not disabled else Color("929ca5")
	if kind=="cancel":
		draw_line(center+Vector2(-7,-7),center+Vector2(7,7),ink,2.8,true)
		draw_line(center+Vector2(7,-7),center+Vector2(-7,7),ink,2.8,true)
	elif kind=="confirm":
		draw_polyline(PackedVector2Array([center+Vector2(-9,0),center+Vector2(-2,7),center+Vector2(10,-8)]),ink,3.0,true)
	else:
		draw_line(center+Vector2(-11,0),center+Vector2(11,0),ink,2.0,true)
		draw_line(center+Vector2(0,-11),center+Vector2(0,11),ink,2.0,true)
		for direction in [Vector2.LEFT,Vector2.RIGHT,Vector2.UP,Vector2.DOWN]:
			var tip: Vector2 = center+direction*12
			var side: Vector2 = direction.orthogonal()*4
			draw_polyline(PackedVector2Array([tip-direction*4+side,tip,tip-direction*4-side]),ink,2.0,true)
		draw_circle(center,2.5,ink,true,-1,true)