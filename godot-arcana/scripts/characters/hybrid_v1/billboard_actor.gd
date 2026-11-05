@tool
extends Node3D
## Compatibility presentation for 3D maps; shares the exact native hybrid rig.
const NativeActor = preload("res://scripts/characters/hybrid_v1/native_actor.gd")
const SPEC = preload("res://art/resources/heroine_reference_spec.gd")
const CAST_GATHER := NativeActor.CAST_GATHER
const DEFAULT_OUTFIT := NativeActor.DEFAULT_OUTFIT
var actor: Node2D
var art: MeshInstance3D
var material: ShaderMaterial
var sprite_material: ShaderMaterial
var shadow_material: ShaderMaterial
var camera_yaw := 0.0
var last_yaw := 0.0
var pose_updates := 0
var outfit := PackedStringArray(DEFAULT_OUTFIT)
var cast_age := -1.0
var cast_yaw := 0.0
var dash_age := -1.0
var dash_yaw := 0.0
var aim_facing := Vector2.ZERO

func _ready() -> void:
	actor = NativeActor.new()
	actor.name = "SharedHybridV1"
	# Its proxy lives offscreen; its independent SubViewport still renders the rig.
	actor.position = Vector2(-100000, -100000)
	add_child(actor)
	art = MeshInstance3D.new()
	art.name = "HybridV1Billboard"
	var quad := QuadMesh.new()
	quad.size = Vector2(NativeActor.VIEW_SIZE) / SPEC.PIXELS_PER_UNIT
	art.mesh = quad
	art.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	art.custom_aabb = AABB(Vector3(-2.5, -0.5, -0.5), Vector3(5, 3.5, 1))
	material = ShaderMaterial.new()
	material.shader = preload("res://scripts/characters/hybrid_v1/billboard.gdshader")
	material.set_shader_parameter("avatar_texture", actor.get_live_texture())
	material.set_shader_parameter("capture_anchor", actor.capture_anchor())
	material.set_shader_parameter("editor_preview", Engine.is_editor_hint())
	art.material_override = material
	sprite_material = material
	add_child(art)
	pose(0, 0, false, Vector2.ZERO, true, false)

static func direction_for_yaw(world_yaw: float, view_yaw: float) -> int:
	return NativeActor.direction_for_yaw(world_yaw, view_yaw)

func set_camera_yaw(value: float) -> void:
	camera_yaw = value
	if is_instance_valid(actor): actor.set_camera_yaw(value)

func pose(time: float, gait: float, walking: bool, motion: Vector2, pixelated: bool, effects: bool) -> void:
	if not is_instance_valid(actor): return
	actor.last_yaw = last_yaw
	actor.cast_age = cast_age
	actor.cast_yaw = cast_yaw
	actor.dash_age = dash_age
	actor.dash_yaw = dash_yaw
	actor.aim_facing = aim_facing
	actor.pose(time, gait, walking, motion, pixelated, effects)
	last_yaw = actor.last_yaw
	pose_updates = actor.pose_updates
	material.set_shader_parameter("hurt_flash", maxf(0, 1.0 - actor.hurt_age / .30) if actor.hurt_age >= 0 and effects else 0.0)

func face_attack(direction: Vector2) -> void:
	if direction.length_squared() > .00001: last_yaw = atan2(direction.x, direction.y)
func begin_cast(direction: Vector2) -> void:
	face_attack(direction)
	cast_yaw = last_yaw
	cast_age = 0.0
func cancel_cast() -> void: cast_age = -1.0
func advance_cast(delta: float, paused: bool) -> void:
	if cast_age >= 0 and not paused:
		cast_age += delta
		if cast_age >= NativeActor.CAST_DURATION: cast_age = -1.0
func play_hurt(direction: Vector2) -> void:
	if is_instance_valid(actor): actor.play_hurt(direction)
func supports_bench_pose() -> bool: return is_instance_valid(actor) and actor.supports_bench_pose()
func set_bench_pose(state: String, age: float, reduced: bool) -> void:
	if is_instance_valid(actor): actor.set_bench_pose(state, age, reduced)
func apply_bench_pose() -> void:
	if is_instance_valid(actor): actor.apply_bench_pose()
func set_outfit(items: PackedStringArray) -> bool:
	if not is_instance_valid(actor): return false
	if not actor.set_outfit(items): return false
	outfit = actor.outfit
	return true
func set_preview_pose(direction: int, animation: String, frame: int) -> void:
	if is_instance_valid(actor): actor.set_preview_pose(direction, animation, frame)
func clear_preview_pose() -> void:
	if is_instance_valid(actor): actor.clear_preview_pose()
