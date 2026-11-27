extends Node2D
## The approved inn's bulb/flame colors, registered to its native sprite pixels.
## Native lights illuminate the floor, furniture and moving actors in one canvas.
const AMBIENT = Color(0.78, 0.75, 0.70, 1.0)
var lights: Array[PointLight2D] = []
var fireplace_material: ShaderMaterial
var fire_frame: int = -1
var fire_animated: bool = false
@onready var pixelfx_flame: Sprite2D = $Fireplaces/Inn_fireplace9/PixelfxFlame

func _ready() -> void:
    fireplace_material = $Fireplaces/Inn_fireplace9.material as ShaderMaterial
    for node in find_children("WarmLight", "PointLight2D", true, false):
        var light: PointLight2D = node
        light.set_meta("base_energy", light.energy)
        lights.append(light)

func sync_lighting(time: float, effects: bool, reduced_motion: bool) -> void:
    var animated: bool = effects and not reduced_motion
    var frame: int = int(floorf(maxf(0.0, time) * 12.0)) % 12 if animated else 0
    if fireplace_material != null and (frame != fire_frame or animated != fire_animated):
        fireplace_material.set_shader_parameter("inn_fire_enabled", false)
        fireplace_material.set_shader_parameter("inn_fire_frame", frame)
        fire_frame = frame
        fire_animated = animated
    # The original painted fire remains as a fallback with effects disabled.
    pixelfx_flame.visible = effects
    var pixelfx_frame: int = int(floorf(maxf(0.0, time) * 12.0)) % 36 if animated else 0
    pixelfx_flame.region_rect = Rect2((pixelfx_frame % 6)*92, int(pixelfx_frame/6)*54, 92, 54)
    # Use the same game-clock poses for the flame, sparks and warm light.
    var phase: float = fmod(floorf(maxf(0.0, time) * 12.0), 12.0) * TAU / 12.0
    var flicker: float = 1.0
    if effects and not reduced_motion:
        flicker += 0.065 * sin(phase) + 0.025 * sin(phase * 3.0 + 0.4)
    for light in lights:
        light.enabled = effects
        light.energy = float(light.get_meta("base_energy")) * (flicker if light.get_meta("fireplace", false) else 1.0)
