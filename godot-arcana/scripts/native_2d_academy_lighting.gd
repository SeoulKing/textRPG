extends Node2D
## Steady study lighting; placement and energy remain authored in the floor scenes.
const AMBIENT = Color(0.96, 0.955, 0.945, 1.0)
var lights: Array[PointLight2D] = []

func _ready() -> void:
    for node in find_children("*", "PointLight2D", true, false):
        var light: PointLight2D = node
        if light.get_meta("academy_study_light", false):
            lights.append(light)

func sync_lighting(_time: float, effects: bool, _reduced_motion: bool) -> void:
    # No flicker or moving light, including when reduced motion is enabled.
    for light in lights:
        light.enabled = effects
