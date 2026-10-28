extends Button
## Crisp, texture-free action chrome; the world palette never processes HUD ink.
var primary = false
var utility = false
var accent = Color("477db6")
var key_hint = ""

func _ready() -> void:
	focus_mode = Control.FOCUS_NONE
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	for state in ["normal","hover","pressed","disabled","focus"]:
		add_theme_stylebox_override(state,StyleBoxEmpty.new())
	for state in ["font_color","font_hover_color","font_pressed_color","font_disabled_color","font_focus_color"]:
		add_theme_color_override(state,Color.TRANSPARENT)
	add_theme_font_size_override("font_size",11)
	mouse_entered.connect(queue_redraw)
	mouse_exited.connect(queue_redraw)
	button_down.connect(queue_redraw)
	button_up.connect(queue_redraw)
	resized.connect(queue_redraw)

func _draw() -> void:
	var center = size*.5
	var radius = minf(size.x,size.y)*.5-(9.0 if utility else 3.0)
	var down = is_pressed() and not disabled
	var bright = (is_hovered() or down) and not disabled
	var rim = Color("94b4d8") if primary else Color("b9c4d2")
	var surface = Color("e7f2ff") if primary else Color("fffaf0")
	if down: surface = surface.lerp(accent,.20)
	elif bright: surface = Color("ffffff")
	elif disabled: surface = Color("ebece8")
	draw_circle(center+Vector2(0,3),radius+1,Color(.10,.17,.28,.22),true,-1,true)
	draw_circle(center,radius,Color(surface,.97 if primary else .94),true,-1,true)
	draw_circle(center-Vector2(0,radius*.16),radius*.72,Color(1,1,1,.18),true,-1,true)
	draw_arc(center,radius,0,TAU,80,Color("ffffff"),2.0,true)
	draw_arc(center,radius-2.5,0,TAU,80,accent if bright else rim,1.0,true)
	var edge = accent
	edge.a = .35 if disabled else .90
	draw_arc(center,radius-1,PI*.24,PI*.76,28,edge,2.6 if primary else 1.8,true)
	if primary:
		for side in [-1,1]:
			var at = center+Vector2(side*(radius+1.5),0)
			draw_colored_polygon(PackedVector2Array([at+Vector2(0,-3),at+Vector2(3,0),at+Vector2(0,3),at-Vector2(3,0)]),accent)
	if not key_hint.is_empty() and not DisplayServer.is_touchscreen_available():
		var font = get_theme_font("font")
		var at = center+Vector2(radius*.70,radius*.72)
		draw_circle(at,8,Color("344b67"),true,-1,true)
		draw_arc(at,8,0,TAU,28,Color("ffffff"),1,true)
		var text_width = font.get_string_size(key_hint,HORIZONTAL_ALIGNMENT_LEFT,-1,11).x
		draw_string(font,at+Vector2(-text_width*.5,4),key_hint,HORIZONTAL_ALIGNMENT_LEFT,-1,11,Color("ffffff"))
