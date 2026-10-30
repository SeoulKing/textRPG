extends Node3D
## Approved 2D flame atlas; one quad/cell equals 64 source dots per world unit.
const ATLAS = preload("res://art/export/effects/fireball-v1.png")
const HEAD_ANCHORS = [Vector2(.807367,.471197),Vector2(.809930,.471440),Vector2(.804091,.472682),Vector2(.795913,.472696)]
const SHADER = preload("res://art/resources/fireball_vfx.gdshader")
var material: ShaderMaterial
var elapsed = 0.0
var burst = false
var dissipate = false
var direction = Vector3.RIGHT
var flight_distance = 0.0
var flight_started = false
var fire_light: OmniLight3D
var light_enabled = true
var fire_strength = 0.0
const FIRE_RANGE = 2.0
const FIRE_COLOR = Color("ffac48")

func light_source() -> Dictionary:
	if not light_enabled or not is_visible_in_tree() or fire_strength<.01: return {}
	return {"point":global_position,"range":FIRE_RANGE,"strength":fire_strength,"color":FIRE_COLOR.srgb_to_linear(),"transient":true}


func advance_flight(reported_distance: float, speed: float, reach: float, delta: float, paused: bool) -> float:
	if not flight_started:
		flight_started = true
		flight_distance = clampf(reported_distance,0,reach)
	elif not paused:
		# An acknowledgement may describe an older position. Never rewind/replay a shot.
		flight_distance = minf(reach,maxf(flight_distance+speed*delta,reported_distance))
	return flight_distance


func _ready() -> void:
	var art = MeshInstance3D.new()
	var quad = QuadMesh.new()
	quad.size = Vector2.ONE
	art.mesh = quad
	art.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	art.custom_aabb = AABB(Vector3(-1,-1,-1),Vector3(2,2,2))
	material = ShaderMaterial.new()
	material.shader = SHADER
	material.set_shader_parameter("atlas",ATLAS)
	material.set_shader_parameter("anchor_offset",0.0 if burst else -.31)
	art.material_override = material
	add_child(art)
	add_to_group("arcana_flame_lights")
	fire_light = OmniLight3D.new()
	fire_light.light_color = FIRE_COLOR
	fire_light.omni_range = FIRE_RANGE
	fire_light.omni_attenuation = 1.5
	fire_light.shadow_enabled = false
	add_child(fire_light)

func update_pose(camera: Camera3D, delta: float, paused: bool, reduced: bool) -> void:
	if not paused: elapsed += delta
	var flicker = 1.0 if reduced else 1.0+.055*sin(elapsed*17.0)+.035*sin(elapsed*29.0)
	var envelope = maxf(0,1-elapsed/(.16 if dissipate else .32)) if burst else 1.0
	fire_strength = (1.8 if burst else 1.5)*envelope*flicker
	fire_light.visible = light_enabled and is_visible_in_tree() and fire_strength>.01
	fire_light.light_energy = fire_strength*.65
	var cell = Vector2.ZERO
	if burst:
		cell = Vector2(mini(3,2+int(elapsed/.16*2)) if dissipate else mini(3,int(elapsed/.32*4)),1)
	else:
		cell.x = 1 if reduced else posmod(int(elapsed*16),4)
	var angle = 0.0
	if not burst:
		var from = camera.unproject_position(global_position)
		var to = camera.unproject_position(global_position+direction)
		var screen = to-from
		angle = atan2(-screen.y,screen.x)
	var anchor: Vector2 = Vector2(.5,.5) if burst else HEAD_ANCHORS[int(cell.x)]
	material.set_shader_parameter("anchor_offset",.5-anchor.x)
	material.set_shader_parameter("vertical_offset",anchor.y-.5)
	material.set_shader_parameter("cell",cell)
	material.set_shader_parameter("heading",angle)

func finished() -> bool:
	return burst and elapsed >= (.16 if dissipate else .32)
