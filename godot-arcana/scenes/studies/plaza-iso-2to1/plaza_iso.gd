extends Node2D
## Standalone plaza study with a 2:1 ground projection.

const HeroActor = preload("res://scripts/native_2d_hero.gd")
const FOOT_RADIUS := 9.0
const WALK_SPEED := 144.0
const UNITS_PER_GAMEPLAY_PIXEL := 4.0

@export var room_origin := Vector2(512, 96)
@export var room_size := Vector2(1024, 1024)
@export var start := Vector2(700, 700)
@export var follow_camera := false

@onready var _hero: HeroActor = $DepthSort/Hero
@onready var _camera := get_node_or_null("Camera2D") as Camera2D

var _ground: Vector2
var _time := 0.0
var _fixtures: Array[Node2D] = []
var _blockers: Array[Rect2] = []
var _paint_origins: Dictionary[Node2D, Vector2] = {}


func _ready() -> void:
	_ground = start
	for child in $DepthSort.get_children():
		var fixture := child as Node2D
		if fixture == null or not fixture.has_meta("footprint"):
			continue
		var footprint: Rect2 = fixture.get_meta("footprint")
		_blockers.append(footprint.grow(FOOT_RADIUS))
		var art := fixture.get_node_or_null("Art") as Sprite2D
		if art != null:
			_fixtures.append(fixture)
			_paint_origins[fixture] = fixture.get_meta("paint_origin", fixture.position + art.position)
	_update_depth()


func _process(delta: float) -> void:
	_time += delta
	var screen_input := Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down")
	if screen_input.is_zero_approx():
		screen_input = Vector2(
			float(Input.is_physical_key_pressed(KEY_D)) - float(Input.is_physical_key_pressed(KEY_A)),
			float(Input.is_physical_key_pressed(KEY_S)) - float(Input.is_physical_key_pressed(KEY_W))
		)
	var ground_direction := Vector2(
		screen_input.x + 2.0 * screen_input.y,
		-screen_input.x + 2.0 * screen_input.y
	).normalized()
	var step := ground_direction * WALK_SPEED * minf(delta, 0.05)
	var previous := _ground

	var across := _ground + Vector2(step.x, 0)
	if _floor_is_free(across):
		_ground = across
	var along := _ground + Vector2(0, step.y)
	if _floor_is_free(along):
		_ground = along

	var travel := _ground - previous
	var walking := not travel.is_zero_approx()
	var facing := (_to_screen(_ground) - _to_screen(previous)).normalized()
	if walking:
		_update_depth()
	_hero.pose(
		_time, 0.0, walking, facing * travel.length() / UNITS_PER_GAMEPLAY_PIXEL,
		true, false, false, facing
	)


func _floor_is_free(point: Vector2) -> bool:
	var limit := room_size - Vector2.ONE * FOOT_RADIUS
	if point.x < FOOT_RADIUS or point.y < FOOT_RADIUS or point.x > limit.x or point.y > limit.y:
		return false
	for footprint in _blockers:
		if footprint.has_point(point):
			return false
	return true


func _to_screen(point: Vector2) -> Vector2:
	return room_origin + Vector2((point.x - point.y) / 2.0, (point.x + point.y) / 4.0)


func _update_depth() -> void:
	_hero.position = _to_screen(_ground).round()
	if follow_camera and _camera != null:
		_camera.position = _hero.position

	for fixture in _fixtures:
		var footprint: Rect2 = fixture.get_meta("footprint")
		# Match the fixture's front edge to the hero's screen X while keeping its art stationary.
		var diagonal := clampf(
			_ground.x - _ground.y,
			footprint.position.x - footprint.end.y,
			footprint.end.x - footprint.position.y
		)
		var front_v := minf(footprint.end.y, footprint.end.x - diagonal)
		var front := Vector2(front_v + diagonal, front_v)
		fixture.position.y = _to_screen(front).y
		var art: Sprite2D = fixture.get_node("Art")
		art.position = _paint_origins[fixture] - fixture.position
