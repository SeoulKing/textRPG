extends RefCounted
## Unit X/Z tile coordinates for the inn. The online protocol still uses logical pixels.

const LOGICAL_ORIGIN := Vector2(52, 64)
const LOGICAL_PER_TILE := 20.0
const LAYOUT_ID := "inn_tiles_v1"
const GRID_SIZE := Vector2i(14, 10)
# Feet stay three logical pixels inside the floor and two-cell entrance threshold.
const WALK_BOUNDS := Rect2(55, 67, 274, 214)
const COUNTER_SLOT := Rect2i(10, 3, 3, 1)
const FURNITURE := [
	["01_Limestone_hearth", "벽난로", Rect2i(1, 0, 3, 1), "wall", ["Lighting/HearthLight"]],
	["02_Oak_bookcase", "책장", Rect2i(4, 0, 2, 1), "wall", []],
	["Back_wall_storage_bench", "벤치", Rect2i(6, 1, 3, 1), "floor", []],
	["Plant_bench_end", "화분", Rect2i(9, 1, 1, 1), "pot", []],
	["Plant_hearth_end", "화분", Rect2i(0, 1, 1, 1), "pot", []],
	["Reception_counter", "접수대", COUNTER_SLOT, "counter", []],
	["Lamp_table_sofa_arm", "등탁", Rect2i(5, 3, 1, 1), "floor", ["Lighting/LoungeLight"]],
	["Lounge_L_shaped_settee", "긴 소파", Rect2i(1, 4, 4, 2), "floor", []],
	["Travel_luggage", "짐 상자", Rect2i(12, 5, 2, 1), "floor", []],
	["Lamp_table_lounge_edge", "등탁", Rect2i(0, 6, 1, 1), "floor", []],
	["Lounge_Armchair", "의자", Rect2i(6, 6, 1, 1), "floor", []],
	["Lamp_table_luggage_nook", "등탁", Rect2i(12, 6, 1, 1), "floor", []],
	["Plant_lounge_end", "화분", Rect2i(0, 7, 1, 1), "pot", []],
	["Lounge_Tea_table", "차 탁자", Rect2i(2, 7, 3, 1), "floor", []],
	["Entry_side_storage_bench", "벤치", Rect2i(10, 8, 3, 1), "floor", []],
	["Plant_front_corner", "화분", Rect2i(13, 9, 1, 1), "pot", []],
]
const RUGS := {
	"Rug_hearth_lounge": Rect2i(1, 4, 6, 4),
	"Rug_back_bench": Rect2i(6, 2, 3, 1),
	"Rug_reception": Rect2i(10, 4, 3, 1),
	"Rug_entry": Rect2i(6, 9, 2, 1),
}
const CUTAWAY_WALLS := [Rect2i(-1, 10, 7, 1), Rect2i(8, 10, 6, 1)]
const INTERACTION_TILES := {
	"innkeeper": Vector2(11.5, 4.5),
	"inn_quest_board": Vector2(8.5, 2.5),
	"inn_window_bench": Vector2(7.5, 2.5),
	"inn_entrance_bench": Vector2(11.5, 9.5),
	"inn_sofa": Vector2(3.5, 6.5),
	"inn_armchair": Vector2(6.5, 7.5),
}
const SEAT_TILES := {
	"inn_window_bench": Vector2(7.5, 1.5),
	"inn_entrance_bench": Vector2(11.5, 8.5),
	"inn_sofa": Vector2(3.5, 5.18),
	"inn_armchair": Vector2(6.5, 6.53),
}


static func logical_to_tile(point: Vector2) -> Vector2:
	return (point - LOGICAL_ORIGIN) / LOGICAL_PER_TILE


static func tile_to_logical(point: Vector2) -> Vector2:
	return LOGICAL_ORIGIN + point * LOGICAL_PER_TILE


static func apply(layout: Dictionary) -> Dictionary:
	if not layout.get("valid", false):
		return layout
	var rectangles: Array[Rect2] = []
	for entry: Array in FURNITURE:
		var slot: Rect2i = entry[2]
		rectangles.append(_logical_rect(slot))
	for slot: Rect2i in CUTAWAY_WALLS:
		rectangles.append(_logical_rect(slot))
	layout.rectangles = rectangles
	for entity: Dictionary in layout.entities:
		var id: String = entity.id
		if INTERACTION_TILES.has(id):
			entity.pos = tile_to_logical(INTERACTION_TILES[id])
		if SEAT_TILES.has(id):
			entity.seat_visual = tile_to_logical(SEAT_TILES[id])
	return layout


static func _logical_rect(slot: Rect2i) -> Rect2:
	return Rect2(tile_to_logical(Vector2(slot.position)), Vector2(slot.size) * LOGICAL_PER_TILE)
