extends Node2D
## The approved inn's bulb/flame colors, registered to its native sprite pixels.
## Native lights illuminate the floor, furniture and moving actors in one canvas.
const AMBIENT = Color(0.78, 0.75, 0.70, 1.0)
var lights: Array[PointLight2D] = []

func _ready() -> void:
    for node in find_children("WarmLight", "PointLight2D", true, false):
        var light: PointLight2D = node
        light.set_meta("base_energy", light.energy)
        lights.append(light)

func sync_lighting(time: float, effects: bool, reduced_motion: bool) -> void:
    # Keep the old 12 Hz, subtle hearth pulse; reduced motion holds it steady.
    var phase: float = fmod(floorf(maxf(0.0, time) * 12.0), 12.0) * TAU / 12.0
    var flicker: float = 1.0
    if effects and not reduced_motion:
        flicker += 0.065 * sin(phase) + 0.025 * sin(phase * 3.0 + 0.4)
    for light in lights:
        light.enabled = effects
        light.energy = float(light.get_meta("base_energy")) * (flicker if light.get_meta("fireplace", false) else 1.0)
