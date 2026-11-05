extends Control
var origin = Vector2.ZERO
var pointer = Vector2.ZERO
var cancel_center = Vector2.ZERO
var cancelled = false
var font = preload("res://fonts/NotoSansKR-SemiBold.tres")

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

func _draw() -> void:
	draw_circle(cancel_center,36,Color(.20,.16,.22,.80),true,-1,true)
	draw_arc(cancel_center,36,0,TAU,48,Color("df596c") if cancelled else Color("fffaf0"),2,true)
	draw_line(cancel_center-Vector2(7,7),cancel_center+Vector2(7,7),Color("fffaf0"),2,true)
	draw_line(cancel_center+Vector2(-7,7),cancel_center+Vector2(7,-7),Color("fffaf0"),2,true)
	draw_string(font,cancel_center+Vector2(-12,24),"취소",HORIZONTAL_ALIGNMENT_LEFT,-1,12,Color("fffaf0"))
	draw_arc(origin,38,0,TAU,48,Color(.9,.95,1,.65),1,true)
	var offset = (pointer-origin).limit_length(58)
	draw_line(origin,origin+offset,Color("f9c67a"),2,true)
	draw_circle(origin+offset,10,Color("fffaf0"),true,-1,true)
