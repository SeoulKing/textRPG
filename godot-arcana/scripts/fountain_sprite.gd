@tool
extends "res://scripts/illustrated_prop.gd"
## Approved 2D celestial fountain. Shared 64px/unit and the original ground origin.
const GROUND_REGISTRATION = preload("res://art/resources/fountain_ground.generated.gd")
const FRAME_SIZE = Vector2i(296,359)
const GRID = Vector2(4,4)
const FPS = 12.0
const FRAME_COUNT = 16
var preview_clock = 0.0
var water_frame = -1

func _init() -> void:
    asset = preload("res://art/export/reference/fountain-water-atlas.png")
    pixel_size = FRAME_SIZE
    # Register the measured ground-contact ellipse, not a hypothetical 45-degree rim.
    foot = GROUND_REGISTRATION.FOOT
    shadow_size = Vector2(4.5,4.5)
    fade_for_player = true

func _ready() -> void:
    super._ready()
    for mat in [sprite_material,fade_material]:
        if mat != null: mat.set_shader_parameter("sheet_grid",GRID)
    add_to_group("arcana_fountain_water")
    sync_water(0.0,true)

func _process(delta: float) -> void:
    super._process(delta)
    if Engine.is_editor_hint():
        preview_clock += delta
        sync_water(preview_clock,true)

func sync_water(time: float, animated: bool) -> void:
    var next = int(maxf(0.0,time)*FPS)%FRAME_COUNT if animated else 0
    if next == water_frame: return
    water_frame = next
    var cell = Vector2(next%4,floori(float(next)/4.0))
    for mat in [sprite_material,fade_material]:
        if mat != null: mat.set_shader_parameter("frame_cell",cell)
