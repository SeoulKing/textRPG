extends Node2D
## Presentation only. Catches and training are never awarded by animation callbacks.
const TOOLS = preload("res://art/export/fishing-v3-mystic/tools.res")
var carry_mode: bool = false
var main: Node
var state: Dictionary = {}
var session_id: String = ""
var phase: String = ""
var session_age: float = 0.0
var phase_age: float = 0.0
var heading := Vector2.DOWN
var hand := Vector2.ZERO
var tip := Vector2.ZERO
var bobber := Vector2.ZERO
var fish_position := Vector2.ZERO
var drawing: bool = false
var cast_phase: float = 1.0
var active: bool = false
var reduced: bool = false

func _apply_carry(hero: Node2D, direction: int, _frame: int, walking: bool, show_gear: bool = true) -> Dictionary:
	var clip: String = "carry_run" if walking else "carry_idle"
	var seconds: float = hero.walk_phase*float(hero.skeleton_runtime.clip_duration(clip,direction)) if walking else hero.idle_age
	return hero.present_life_pose(clip,direction,-1.0,seconds,show_gear)
func _process(delta: float) -> void:
	var renderer = main.world_renderer
	var hero = renderer.hero
	renderer.fishing_view = main.fishing.visible
	var equipped: bool = str(main._state().get("flags",{}).get("arcana_life_tool","")) == "fishingRod"
	state = main.fishing.state if main.fishing.visible else {}
	active = not state.is_empty() and state.get("bobber") is Dictionary and main.world.indoor.is_empty()
	var can_carry: bool = equipped and not main._online_fighting() and main.world.bench_state.is_empty() and hero.cast_age<0 and hero.dash_age<0 and main.world.teleport_age<0 and hero.aim_facing.length_squared()<.001
	drawing = active or can_carry
	carry_mode = false
	visible = drawing
	if not drawing:
		queue_redraw()
		return
	if not active:
		var d: int = hero.display_direction
		var walking: bool = main.world.walking and hero.was_walking
		var frame: int = int(floor(hero.walk_phase*8)) if walking else renderer.Hero.idle_frame(hero.idle_age)
		_apply_carry(hero,d,frame,walking)
		carry_mode = true
		queue_redraw()
		return
	var next_id: String = str(state.get("id",""))
	if next_id != session_id:
		session_id = next_id
		session_age = 0.0
		phase = ""
	session_age += delta
	var next_phase: String = str(state.get("phase",""))
	if next_phase != phase:
		phase = next_phase
		phase_age = 0.0
	else: phase_age += delta
	reduced = main.world.reduced_motion or not main.world.effects_enabled
	var direction: Dictionary = state.get("direction",{})
	heading = Vector2(float(direction.get("x",main.world.last_move_direction.x)),float(direction.get("y",main.world.last_move_direction.y))).normalized()
	if heading.length_squared()<.001: heading = Vector2.DOWN
	var d: int = renderer.Hero.direction_for_yaw(atan2(heading.x,heading.y),0)
	var rest: Dictionary = hero.present_life_pose("carry_idle",d,-1.0,session_age,false)
	if rest.is_empty():return
	var rest_hand: Array=rest.hand
	var rest_vector: Array=rest.rodVector
	var shoulder_hand := Vector2(float(rest_hand[0]),float(rest_hand[1]))
	var shoulder_vector := Vector2(float(rest_vector[0]),float(rest_vector[1]))
	var returning: float = clampf((phase_age-(1.2 if phase=="success" else .25))/.3,0,1) if phase in ["success","escaped"] else 0.0
	if returning>=1:
		_apply_carry(hero,d,renderer.Hero.idle_frame(hero.idle_age),false)
		carry_mode = true
		queue_redraw()
		return
	cast_phase = clampf(session_age/.7,0,1)
	var grip: Array = rest.hand
	hero.face_attack(heading)
	var live_contact: Dictionary = {}
	if hero.is_skeleton_active():
		var source_position: float = clampf(session_age/.35,0.0,2.0)
		if phase=="success": source_position=lerpf(2.0,3.0,clampf(phase_age/.35,0.0,1.0))
		elif phase=="escaped": source_position=lerpf(2.0,0.0,clampf(phase_age/.3,0.0,1.0))
		if returning>0: source_position=lerpf(source_position,0.0,returning)
		live_contact=hero.present_life_pose("fishing",d,source_position,session_age,false)
	if live_contact.get("hand") is Array:grip=live_contact.hand
	position = hero.position
	z_index = hero.z_index+1
	hand = Vector2(float(grip[0]),float(grip[1]))
	var resting: Vector2 = Vector2(heading.x*85,heading.y*30-95)
	var lifted: Vector2 = Vector2(heading.x*38,-136)
	var rod_vector: Vector2 = shoulder_vector.lerp(resting,smoothstep(0,1,cast_phase))
	if live_contact.is_empty(): hand = shoulder_hand.lerp(hand,smoothstep(0,.3,cast_phase))
	if phase=="success": rod_vector = resting.lerp(lifted,clampf(phase_age/.35,0,1))
	if returning>0:
		rod_vector = rod_vector.lerp(shoulder_vector,returning)
		hand = hand.lerp(shoulder_hand,returning)
	if not live_contact.is_empty():
		# Runtime contact follows the actual posed wrist, including transitions.
		hand = Vector2(float(grip[0]),float(grip[1]))
		var vector: Variant = live_contact.get("rodVector")
		if vector is Array and vector.size()==2: rod_vector=Vector2(float(vector[0]),float(vector[1]))
	tip = hand+rod_vector
	var target: Dictionary = state.bobber
	var landing: Vector2 = renderer.map_point(Vector2(float(target.x),float(target.y)))-position
	bobber = landing
	if cast_phase<1: bobber = hand.lerp(landing,cast_phase)+Vector2(0,-sin(cast_phase*PI)*100)
	elif phase=="bite" and not reduced: bobber += Vector2(sin(phase_age*32)*3,3+absf(sin(phase_age*17))*5)
	elif phase=="reeling" and not reduced: bobber += Vector2(sin(phase_age*13)*3,sin(phase_age*8)*2)
	elif not reduced: bobber.y += sin(session_age*3)*1.5
	var lift: float = clampf(phase_age/1.1,0,1)
	fish_position = landing.lerp(hand+Vector2(heading.x*24,-35),lift)+Vector2(0,-sin(lift*PI)*95)
	queue_redraw()

func _draw() -> void:
	if not drawing or carry_mode: return
	var bend: float = 0.0
	if phase=="reeling": bend = 12+(0 if reduced else sin(phase_age*10)*4)
	if phase=="success": bend = 18*(1-clampf(phase_age,0,1))
	var points := PackedVector2Array()
	for i in range(13):
		var t: float = float(i)/12
		points.append((hand.lerp(tip,t)+heading*bend*sin(t*PI)).round())
	# Same selected materials as the native shoulder sprites; taper toward the tip.
	draw_polyline(points,Color("272d47"),5,false)
	for i in range(12):
		draw_line(points[i],points[i+1],Color("58434a"),3 if i<7 else 2,false)
		draw_line(points[i]+Vector2(0,-1),points[i+1]+Vector2(0,-1),Color("8b7469"),1,false)
	var axis: Vector2 = (tip-hand).normalized()
	var across := Vector2(-axis.y,axis.x)
	draw_line(hand-axis*8,hand+axis*13,Color("263c62"),5,false)
	for i in range(5):
		var p: Vector2 = hand+axis*(float(i)*4-6)
		draw_line(p-across*2,p+across*2,Color("91a7bb"),1,false)
	for i in [4,7,10,12]:
		draw_line(points[i]-across*2,points[i]+across*2,Color("b6c8d0"),1,false)
	var gem: Vector2 = hand+axis*20
	draw_circle(gem,4,Color("b6c8d0"))
	draw_circle(gem,3,Color("3a506c"))
	draw_circle(gem,2,Color("518dbb"))
	draw_rect(Rect2(gem-Vector2(1,1),Vector2.ONE),Color("bfe3ed"))
	if not active: return
	if phase=="success":
		if phase_age<1.15:
			draw_line(tip,fish_position,Color("fff4d9"),1,false)
			draw_texture_rect_region(TOOLS,Rect2(fish_position-Vector2(18,14),Vector2(36,28)),Rect2(33,49,18,14))
			if not reduced:
				for i in range(5):draw_circle(fish_position+Vector2(sin(float(i)*2.1)*12,float(i)*9+8),1.5,Color("b9e8ed"))
		return
	if phase=="escaped": return
	draw_line(tip,bobber,Color("fff4d9"),1,false)
	draw_texture_rect_region(TOOLS,Rect2(bobber-Vector2(5,5),Vector2(10,10)),Rect2(50,41,10,10))
	if cast_phase>.9:
		for ring in range(2):
			var radius: float = 8+float(ring)*7+(0 if reduced else fmod(session_age*9,7))
			var ripple := PackedVector2Array()
			for i in range(25):ripple.append(bobber+Vector2(cos(float(i)*TAU/24)*radius,sin(float(i)*TAU/24)*radius*.5+4))
			draw_polyline(ripple,Color(.8,.95,1,.65-float(ring)*.2),1,false)
	if phase=="bite":
		draw_rect(Rect2(bobber+Vector2(-2,-32),Vector2(4,14)),Color("ffe29a"))
		draw_rect(Rect2(bobber+Vector2(-2,-14),Vector2(4,4)),Color("ffe29a"))
