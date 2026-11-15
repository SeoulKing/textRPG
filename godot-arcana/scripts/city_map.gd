extends RefCounted
## City footprint in world tiles. The southern field is outside these 64 rows.
const CITY_CELLS = Vector2i(64, 64)
const OUTDOOR_CELLS = Vector2i(64, 90)
const WALK_BOUNDS = Rect2(32, 48, 960, 1352)
const GATE = Vector2(576, 990)
const GATE_OUTBOUND_Y = 1020.0
const GATE_RETURN_Y = 1008.0
const GATE_INSIDE_Y = 1004.0
const GATE_OUTSIDE_Y = 1027.0
const FIELD_ENTRY = Vector2(576, 1060)
const CITY_RETURN = Vector2(576, 1040)
const HUNTING_HOME = Vector2(600, 1182)
const HUNTING_ENTRY = Vector2(576, 1117)
