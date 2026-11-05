extends Control
## Predict only the local control bar between authoritative 10 Hz packets.
var state: Dictionary = {}
var held: bool = false
var bar: float = .35
var velocity: float = 0.0
var fish: float = .45

func accept(value: Dictionary) -> void:
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
	queue_redraw()

func _draw() -> void:
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
