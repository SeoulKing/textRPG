extends Node2D
## Isolated 2:1 kitchen study. The footprint grid uses the art study's ground units.

const HeroActor = preload("res://scripts/native_2d_hero.gd")
const ROOM_ORIGIN := Vector2(176, 130)
const ROOM_SIZE := 320.0
const START := Vector2(176, 288)
const FOOT_RADIUS := 9.0
const WALK_SPEED := 144.0
const UNITS_PER_GAMEPLAY_PIXEL := 4.0

@onready var _hero: HeroActor = $DepthSort/Hero

var _ground := START
var _time := 0.0
var _fixtures: Array[Node2D] = []
var _blockers: Array[Rect2] = []


func _ready() -> void:
	for child in $DepthSort.get_children():
		if child.has_meta("footprint"):
			_fixtures.append(child)
			var footprint: Rect2 = child.get_meta("footprint")
			_blockers.append(footprint.grow(FOOT_RADIUS))
	_update_depth()


func _process(delta: float) -> void:
	_time += delta
	var screen_input := Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down")
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
	var limit := ROOM_SIZE - FOOT_RADIUS
	if point.x < FOOT_RADIUS or point.y < FOOT_RADIUS or point.x > limit or point.y > limit:
		return false
	for footprint in _blockers:
		if footprint.has_point(point):
			return false
	return true


func _to_screen(point: Vector2) -> Vector2:
	return ROOM_ORIGIN + Vector2((point.x - point.y) / 2.0, (point.x + point.y) / 4.0)


func _update_depth() -> void:
	_hero.position = _to_screen(_ground).round()
	for fixture in _fixtures:
		var footprint: Rect2 = fixture.get_meta("footprint")
		# Intersect a camera ray at the hero's screen X with the nearest footprint edge.
		# Slide only the sort origin. The art stays on its original pixels.
		var diagonal := clampf(_ground.x - _ground.y,
			footprint.position.x - footprint.end.y, footprint.end.x - footprint.position.y)
		var front_v := minf(footprint.end.y, footprint.end.x - diagonal)
		var front := Vector2(front_v + diagonal, front_v)
		fixture.position.y = _to_screen(front).y
		var art: Sprite2D = fixture.get_node("Art")
		art.position.y = -fixture.position.y
