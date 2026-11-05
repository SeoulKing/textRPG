@tool
extends Node2D
## Editor handles are independent rotation channels, positioned on the artwork.
@export var handle_label := ""
@export var handle_color := Color("79cfff")
@export var draw_handle := true

func _draw() -> void:
	if not draw_handle or not Engine.is_editor_hint(): return
	draw_circle(Vector2.ZERO, 2.7, Color(handle_color, 0.65))
	draw_arc(Vector2.ZERO, 3.7, 0.0, TAU, 18, handle_color, 0.65, true)

func _process(_delta: float) -> void:
	if Engine.is_editor_hint(): queue_redraw()
