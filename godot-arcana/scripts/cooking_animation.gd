extends Control
## A serving follows the server clock, while the fire flickers independently.
const FOOD_SHEETS := {
	"grilledFish": preload("res://art/export/cooking/grilled-fish.png"),
	"grilledMushroom": preload("res://art/export/cooking/grilled-mushroom.png"),
	"roastedPotato": preload("res://art/export/cooking/roasted-potato.png"),
	"meatSkewer": preload("res://art/export/cooking/meat-skewer.png"),
}
const HEARTH := preload("res://art/export/cooking/kitchen-hearth.png")
const GROUND := preload("res://art/export/cooking/campfire-ground.png")
const FIRE := preload("res://art/export/effects/arcana-campfire.png")
const FOOD_SIDE := 64
const FIRE_SIDE := 128
const COLUMNS := 4
const FRAME_COUNT := 12
const FIRE_FPS := 12.0
# The central 152 pixels contain the full rack. Only scenery may be cropped.
const ACTION_WIDTH := 152
# The existing fire atlas has a large transparent margin around each drawing.
const VISIBLE_FIRE := Rect2(40, 76, 48, 42)
const FIRE_POSITION := Vector2(72, 57)
const FOOD_POSITION := Vector2(64, 8)

var _setting: Texture2D
var _food: Texture2D
var _food_frame := 0
var _fire_frame := 0
var _zoom := 1

static func sheet_for(recipe_id: String) -> Texture2D:
	return FOOD_SHEETS.get(recipe_id)

static func frame_for(fraction: float, still: bool) -> int:
	if still:
		# Use resting poses, so reduced motion still shows the change in doneness.
		return 2 if fraction < 0.75 else 10
	return clampi(floori(fraction * FRAME_COUNT), 0, FRAME_COUNT - 1)

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	clip_contents = true
	resized.connect(_fit_height)
	get_viewport().size_changed.connect(_fit_height)
	_fit_height()

func setup(recipe_id: String, home_kitchen: bool) -> void:
	_food = sheet_for(recipe_id)
	_setting = HEARTH if home_kitchen else GROUND
	queue_redraw()

func _fit_height() -> void:
	var available_height := get_viewport_rect().size.y / maxf(0.01, get_global_transform().get_scale().y)
	var next_zoom := 2 if available_height >= 600.0 and size.x >= ACTION_WIDTH * 2 else 1
	if _zoom == next_zoom and custom_minimum_size.y == HEARTH.get_height() * next_zoom: return
	_zoom = next_zoom
	custom_minimum_size.y = HEARTH.get_height() * _zoom
	queue_redraw()

func present(fraction: float, elapsed_seconds: float, still: bool) -> void:
	var food_frame := frame_for(fraction, still)
	var fire_frame := 0 if still else floori(elapsed_seconds * FIRE_FPS) % FRAME_COUNT
	if food_frame == _food_frame and fire_frame == _fire_frame: return
	_food_frame = food_frame
	_fire_frame = fire_frame
	queue_redraw()

func _draw() -> void:
	if _setting == null: return
	var origin := ((size - _setting.get_size() * _zoom) * 0.5).floor()
	draw_set_transform(origin, 0.0, Vector2.ONE * _zoom)
	draw_texture(_setting, Vector2.ZERO)
	var fire_cell := _frame_origin(_fire_frame, FIRE_SIDE)
	draw_texture_rect_region(FIRE, Rect2(FIRE_POSITION, VISIBLE_FIRE.size),
			Rect2(fire_cell + VISIBLE_FIRE.position, VISIBLE_FIRE.size))
	if _food != null:
		var food_size := Vector2(FOOD_SIDE, FOOD_SIDE)
		draw_texture_rect_region(_food, Rect2(FOOD_POSITION, food_size),
				Rect2(_frame_origin(_food_frame, FOOD_SIDE), food_size))

static func _frame_origin(frame: int, side: int) -> Vector2:
	return Vector2(frame % COLUMNS, floori(float(frame) / COLUMNS)) * side
