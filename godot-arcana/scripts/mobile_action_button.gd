extends Button
## Crisp, texture-free action chrome; the world palette never processes HUD ink.
var primary = false
var utility = false
var accent = Color("a9d9d2")
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
	var rim = Color("e7d3a6") if primary else Color("cfdfdc")
	draw_circle(center+Vector2(0,2),radius+1,Color(0.02,.06,.08,.14),true,-1,true)
	draw_circle(center,radius,Color(.04,.10,.13,.48 if primary else .36),true,-1,true)
	draw_circle(center,radius-3,Color(accent,.13 if down else .035),true,-1,true)
	rim.a = .92 if bright else .68 if primary else .28
	draw_arc(center,radius,0,TAU,80,rim,1.4 if primary else 1.0,true)
	draw_arc(center,radius-3,-PI*.84,-PI*.18,36,Color(1,1,1,.12),.7,true)
	# Small lower accents establish hierarchy without thick decorative frames.
	var edge = accent
	edge.a = .30 if disabled else .85
	draw_arc(center,radius+1.5,PI*.30,PI*.70,24,edge,1.7 if primary else 1.3,true)
	if primary:
		for side in [-1,1]:
			var at = center+Vector2(side*(radius+1.5),0)
			draw_colored_polygon(PackedVector2Array([at+Vector2(0,-2),at+Vector2(2,0),at+Vector2(0,2),at-Vector2(2,0)]),Color(rim,.75))
	if not key_hint.is_empty() and not DisplayServer.is_touchscreen_available():
		var font = get_theme_default_font()
		var at = center+Vector2(radius*.70,radius*.72)
		draw_circle(at,6.5,Color(.04,.10,.13,.76),true,-1,true)
		draw_string(font,at+Vector2(-2.8,3),key_hint,HORIZONTAL_ALIGNMENT_LEFT,-1,8,Color("dedfd1"))
