extends Control
## Predict only the local control bar between authoritative 10 Hz packets.
const TOOLS := preload("res://art/export/fishing-v3-mystic/tools.res")
const FISH_BODY := Rect2(38, 49, 13, 14)
const FISH_TAIL := Rect2(33, 49, 5, 14)
const FRAME := Color("#183341")
const BRASS := Color("#dcbd82")
const AIM := Color("#ffedb2")

var state: Dictionary = {}
var held: bool = false
var bar: float = .35
var velocity: float = 0.0
var fish: float = .45
var _pond_style := false
var _reduced_motion := false
var _crank_angle := -0.7
var _tail_phase := 0.0
var _grip := 0.0
var _fish_lean := 0.0
var _target_lean := 0.0

func set_pond_style(enabled: bool, reduced_motion: bool) -> void:
	_pond_style = enabled
	_reduced_motion = reduced_motion
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST if enabled else CanvasItem.TEXTURE_FILTER_PARENT_NODE
	queue_redraw()

func accept(value: Dictionary) -> void:
	if _pond_style and value.get("phase") == "reeling":
		var next_fish := float(value.get("fish", .45))
		if state.get("phase") != "reeling" or value.get("id") != state.get("id"):
			fish = next_fish
			_crank_angle = -0.7
			_tail_phase = 0.0
			_fish_lean = 0.0
			_target_lean = 0.0
			_grip = float(absf(next_fish - float(value.get("bar", .35))) <= float(value.get("width", .26)) * .5)
		else:
			var travel := next_fish - float(state.get("fish", next_fish))
			if not is_zero_approx(travel): _target_lean = clampf(-travel * 6.0, -.22, .22)
	state = value.duplicate(true)
	bar = float(state.get("bar",.35))
	velocity = float(state.get("velocity",0))

func _process(delta: float) -> void:
	if not is_visible_in_tree(): return
	fish = move_toward(fish,float(state.get("fish",.45)),delta*2.0)
	if state.get("phase","") == "reeling":
		var dt: float = minf(delta,.05)
		velocity = clampf(velocity+(1.5 if held else -1.2)*dt,-.65,.65)
		var half: float = float(state.get("width",.26))/2
		bar = clampf(bar+velocity*dt,half,1-half)
		if bar <= half or bar >= 1-half: velocity = 0
		if _pond_style:
			var inside := absf(fish - bar) <= half
			_grip = move_toward(_grip, 1.0 if inside else 0.0, delta * 7.0)
			if not _reduced_motion:
				_crank_angle = fmod(_crank_angle + dt * (5.6 if held else velocity * 7.0), TAU)
				_tail_phase = fmod(_tail_phase + dt * (11.0 if inside else 18.0), TAU)
				_fish_lean = move_toward(_fish_lean, _target_lean, dt * 1.8)
	queue_redraw()

func _draw() -> void:
	if _pond_style:
		_draw_pond_meter()
		return
	var h: float = size.y-12
	var x: float = size.x/2-42
	var track := Rect2(x,6,66,h)
	draw_rect(track,Color("263d53"))
	draw_rect(track,Color("92aab8"),false,2)
	var width: float = float(state.get("width",.26))
	var top: float = 6+(1-bar-width/2)*h
	var inside: bool = absf(fish-bar)<=width/2
	draw_rect(Rect2(x+3,top,60,h*width),Color("71cfa2") if inside else Color("6f9b91"))
	var fy: float = 6+(1-fish)*h
	draw_line(Vector2(x+10,fy),Vector2(x+56,fy),Color("fff0aa"),5,true)
	draw_circle(Vector2(x+33,fy),6,Color("fff0aa"),true,-1,true)
	draw_rect(Rect2(x+77,6,12,h),Color("d4d9d6"))
	var progress: float = float(state.get("progress",.3))
	draw_rect(Rect2(x+77,6+(1-progress)*h,12,h*progress),Color("409e72"))

func _draw_pond_meter() -> void:
	var left := roundf(size.x * .5) - 46.0
	var lane := Rect2(left + 8.0, 9.0, 58.0, maxf(1.0, size.y - 43.0))
	var bottom := lane.end.y
	var well := Color("#102e41")
	# Stepped metal housing around the depth scale and the narrower catch gauge.
	draw_rect(Rect2(left + 3, 2, 86, size.y - 4), FRAME)
	draw_rect(Rect2(left, 5, 92, size.y - 10), FRAME)
	draw_line(Vector2(left + 4, 4), Vector2(left + 87, 4), BRASS, 2)
	draw_rect(lane.grow(2), Color("#507583"))
	draw_rect(lane, well)
	draw_rect(Rect2(lane.position, Vector2(3, lane.size.y)), Color("#21495a"))
	for i in range(1, 8):
		var tick_y := roundf(lerpf(lane.position.y, bottom, i / 8.0))
		var tick_width := 7 if i % 2 == 0 else 4
		draw_rect(Rect2(lane.position.x, tick_y, tick_width, 1), Color("#62818a"))

	var width := float(state.get("width", .26))
	var top := roundf(bottom - (bar + width * .5) * lane.size.y)
	var band := Rect2(lane.position.x + 1, top, lane.size.x - 2, lane.size.y * width)
	var caught := absf(fish - bar) <= width * .5
	var mix_amount := float(caught) if _reduced_motion else _grip
	var rim := Color("#86bba9").lerp(Color("#c6ffe0"), mix_amount)
	draw_rect(band, Color("#375f5e").lerp(Color("#327f70"), mix_amount))
	for edge: float in [band.position.y, band.end.y - 2]:
		draw_rect(Rect2(band.position.x, edge, band.size.x, 2), rim)
	for side: float in [band.position.x, band.end.x - 3]:
		draw_rect(Rect2(side, band.position.y, 3, 6), rim)
		draw_rect(Rect2(side, band.end.y - 6, 3, 6), rim)

	var marker := Vector2(lane.get_center().x, bottom - fish * lane.size.y).round()
	_draw_fish_marker(marker, 2.0 if lane.size.y >= 105.0 else 1.0)
	# Both pointers mark the exact judged depth even as the fish turns.
	for side in [-1, 1]:
		var tip := marker + Vector2(side * 17, 0)
		draw_colored_polygon(PackedVector2Array([tip, tip + Vector2(side * 5, -3), tip + Vector2(side * 5, 3)]), AIM)

	var gauge := Rect2(lane.end.x + 9, lane.position.y, 10, lane.size.y)
	var progress := clampf(float(state.get("progress", .3)), 0.0, 1.0)
	var fill_height := roundf(progress * gauge.size.y)
	draw_rect(gauge.grow(2), Color("#59737b"))
	draw_rect(gauge, well)
	var fill := Rect2(gauge.position.x, gauge.end.y - fill_height, gauge.size.x, fill_height)
	draw_rect(fill, Color("#6eaca4").lerp(Color("#8af3b6"), mix_amount))
	if fill_height >= 2: draw_rect(Rect2(fill.position, Vector2(fill.size.x, 2)), AIM)
	for quarter in range(1, 4):
		draw_rect(Rect2(gauge.end.x + 2, roundf(bottom - gauge.size.y * quarter / 4.0), 3, 1), BRASS)
	_draw_reel(Vector2(marker.x, bottom + 18).round())

func _draw_fish_marker(center: Vector2, scale_factor: float) -> void:
	var tilt := 0.0 if _reduced_motion else _fish_lean
	var tail_lift := 0.0 if _reduced_motion else roundf(sin(_tail_phase))
	draw_set_transform(center, tilt, Vector2.ONE * scale_factor)
	var tail := Rect2(-9, -7 + tail_lift, 5, 14)
	var body := Rect2(-4, -7, 13, 14)
	var shadow := Color("#162e40")
	draw_texture_rect_region(TOOLS, Rect2(tail.position + Vector2.DOWN, tail.size), FISH_TAIL, shadow)
	draw_texture_rect_region(TOOLS, Rect2(body.position + Vector2.DOWN, body.size), FISH_BODY, shadow)
	draw_texture_rect_region(TOOLS, tail, FISH_TAIL)
	draw_texture_rect_region(TOOLS, body, FISH_BODY)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)

func _draw_reel(center: Vector2) -> void:
	var angle := -0.7 if _reduced_motion else _crank_angle
	draw_circle(center, 12, BRASS)
	draw_circle(center, 10, FRAME)
	for i in range(3):
		var spoke := Vector2.from_angle(angle + TAU * i / 3.0)
		draw_line(center, (center + spoke * 8.0).round(), Color("#7fa2a1"), 2)
	draw_circle(center, 3, BRASS)
	var knob := (center + Vector2.from_angle(angle) * 12.0).round()
	draw_line(center, knob, BRASS, 3)
	draw_circle(knob, 4, FRAME)
	draw_circle(knob, 3, AIM if held else Color("#bfa477"))
