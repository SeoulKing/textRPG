@tool
extends Node3D
# Approved B / 4.5-head character art, animated inside the existing 3D world.
const TEXTURE = preload("res://art/export/hero-b45.png")
const SHADER = preload("res://art/resources/hero_sprite.gdshader")
const SHADOW = preload("res://art/resources/hero_contact_shadow.gdshader")
const FRAME_SIZE = Vector2(96,128)
const PIXEL_SIZE = 1.0 / 64.0
const BASELINE = 121.0
var pose_updates = 0
var last_yaw = 0.0
var facing = 0
var current_frame = Vector2(-1,-1)
var art: MeshInstance3D
var material: ShaderMaterial

func _ready() -> void:
	art = MeshInstance3D.new()
	art.name = "HeroArt"
	var quad = QuadMesh.new()
	quad.size = FRAME_SIZE * PIXEL_SIZE
	art.mesh = quad
	art.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	material = ShaderMaterial.new()
	material.shader = SHADER
	material.set_shader_parameter("sprite_sheet", TEXTURE)
	material.set_shader_parameter("foot_offset", (BASELINE - FRAME_SIZE.y / 2.0) * PIXEL_SIZE)
	material.set_shader_parameter("editor_preview", Engine.is_editor_hint())
	art.material_override = material
	add_child(art)
	var shadow = MeshInstance3D.new()
	shadow.name = "ContactShadow"
	var disk = PlaneMesh.new()
	disk.size = Vector2(.68,.32)
	shadow.mesh = disk
	shadow.position.y = .015
	shadow.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var shadow_material = ShaderMaterial.new()
	shadow_material.shader = SHADOW
	shadow_material.set_shader_parameter("editor_preview",Engine.is_editor_hint())
	shadow.material_override = shadow_material
	add_child(shadow)
	pose(0.0,0.0,false,Vector2.ZERO,true,false)

func pose(time: float, gait: float, walking: bool, motion: Vector2, _pixelated: bool, effects: bool) -> void:
	pose_updates += 1
	if motion.length_squared() > .00001:
		last_yaw = atan2(motion.x,motion.y)
	# Retain authored facing when idle; four directions share actual map axes.
	var forward = Vector2(sin(last_yaw),cos(last_yaw))
	if absf(forward.x) > absf(forward.y): facing = 2 if forward.x > 0 else 3
	else: facing = 0 if forward.y >= 0 else 1
	var column = 2 + int(floor(gait * .75)) % 6 if walking else (int(time * .5) % 2 if effects else 0)
	var cell = Vector2(column,facing)
	if cell != current_frame and material != null:
		material.set_shader_parameter("frame_cell",cell)
		current_frame = cell
