@tool
extends Node2D

var grip := Vector2.ZERO
var tip := Vector2.ZERO

func show_rod(from: Vector2, to: Vector2) -> void:
	grip = from
	tip = to
	show()
	queue_redraw()

func _draw() -> void:
	draw_rod(self, grip, tip)

static func draw_rod(canvas: CanvasItem, from: Vector2, to: Vector2, bend: Vector2 = Vector2.ZERO) -> void:
	var axis := (to - from).normalized()
	if axis.is_zero_approx():
		return
	var points := PackedVector2Array()
	for index in range(13):
		var progress := float(index) / 12.0
		points.append((from.lerp(to, progress) + bend * sin(progress * PI)).round())
	canvas.draw_polyline(points, Color("272d47"), 5.0)
	for index in range(12):
		canvas.draw_line(points[index], points[index + 1], Color("58434a"), 3.0 if index < 7 else 2.0)
		canvas.draw_line(points[index] + Vector2.UP, points[index + 1] + Vector2.UP, Color("8b7469"))
	var across := Vector2(-axis.y, axis.x)
	canvas.draw_line(from - axis * 8.0, from + axis * 13.0, Color("263c62"), 5.0)
	for index in range(5):
		var ring := from + axis * (float(index) * 4.0 - 6.0)
		canvas.draw_line(ring - across * 2.0, ring + across * 2.0, Color("91a7bb"))
	for index in [4, 7, 10, 12]:
		canvas.draw_line(points[index] - across * 2.0, points[index] + across * 2.0, Color("b6c8d0"))
	var gem := from + axis * 20.0
	canvas.draw_circle(gem, 4.0, Color("b6c8d0"))
	canvas.draw_circle(gem, 3.0, Color("3a506c"))
	canvas.draw_circle(gem, 2.0, Color("518dbb"))
	canvas.draw_rect(Rect2(gem - Vector2.ONE, Vector2.ONE * 2.0), Color("bfe3ed"))
