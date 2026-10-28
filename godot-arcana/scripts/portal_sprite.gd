@tool
extends "res://scripts/illustrated_prop.gd"

const FRAME_COUNT = 8
const FPS = 8.0
var preview_clock = 0.0
var current_frame = -1

func _init() -> void:
    asset = preload("res://art/export/reference/portal-atlas.png")
    pixel_size = Vector2i(192,192)
    foot = Vector2(96,190)
    shadow_size = Vector2(2.2,.8)
    fade_for_player = true

func _ready() -> void:
    super._ready()
    # The silhouette is identical across frames; hit sampling uses one frame.
    occlusion_mask = preload("res://art/export/reference/portal-2d.png").get_image()
    for mat in [sprite_material,fade_material]:
        if mat != null: mat.set_shader_parameter("sheet_grid",Vector2(4,2))
    add_to_group("arcana_portal_animation")
    sync_portal(0.0,true)

func _process(delta: float) -> void:
    super._process(delta)
    if Engine.is_editor_hint():
        preview_clock += delta
        sync_portal(preview_clock,true)

func sync_portal(time: float, animated: bool) -> void:
    var next = int(maxf(0.0,time)*FPS)%FRAME_COUNT if animated else 0
    if next == current_frame: return
    current_frame = next
    var cell = Vector2(next%4,floori(float(next)/4.0))
    for mat in [sprite_material,fade_material]:
        if mat != null: mat.set_shader_parameter("frame_cell",cell)
