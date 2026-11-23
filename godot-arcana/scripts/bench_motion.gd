extends RefCounted

const SIT_DURATION := 0.52
const STAND_DURATION := 0.42


static func has_pose(state: String) -> bool:
	return state in ["sit", "seated", "stand"]


# Drive both the skeleton pose and the offset from the walkable point to the seat.
static func seated_weight(state: String, age: float, reduced_motion: bool) -> float:
	match state:
		"sit":
			return 1.0 if reduced_motion else smoothstep(0.0, SIT_DURATION, age)
		"seated":
			return 1.0
		"stand":
			return 0.0 if reduced_motion else 1.0 - smoothstep(0.0, STAND_DURATION, age)
	return 0.0
