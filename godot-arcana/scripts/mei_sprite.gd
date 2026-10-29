@tool
extends "res://scripts/illustrated_prop.gd"
## Keep one imported atlas bound; animation changes only the sampled cell.
const FRAMES = preload("res://art/export/plaza-guide/mei-idle.tres")
var preview_clock = 0.0
var current_cell = Vector2(-1,-1)

func _init() -> void:
    var first = FRAMES.get_frame_texture("idle",0) as AtlasTexture
    asset = first.atlas
    pixel_size = Vector2i(96,136)
    foot = Vector2(48,116)
    shadow_size = Vector2(.60,.36)
    fade_for_player = false

func _ready() -> void:
    super._ready()
    sprite_material.set_shader_parameter("sheet_grid",asset.get_size()/Vector2(pixel_size))
    # _ready can run again in an editor preview; initialize the new material too.
    current_cell = Vector2(-1,-1)
    sync_idle(0.0,true)
    add_to_group("arcana_npc_idle")

func _process(delta: float) -> void:
    super._process(delta)
    if Engine.is_editor_hint():
        preview_clock += delta
        sync_idle(preview_clock,true)

func sync_idle(time: float, animated: bool) -> void:
    var frame = int(maxf(0.0,time)*FRAMES.get_animation_speed("idle"))%FRAMES.get_frame_count("idle") if animated else 0
    var texture = FRAMES.get_frame_texture("idle",frame) as AtlasTexture
    var cell = texture.region.position/Vector2(pixel_size)
    if cell == current_cell: return
    current_cell = cell
    sprite_material.set_shader_parameter("frame_cell",cell)
