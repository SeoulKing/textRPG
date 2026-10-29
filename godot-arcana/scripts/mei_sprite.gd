@tool
extends "res://scripts/illustrated_prop.gd"
## Imported full-frame textures: no GPU readback or texture creation during playback.
const FRAMES = preload("res://art/export/plaza-guide/mei-idle.tres")
var preview_clock = 0.0
var current_texture: Texture2D

func _init() -> void:
    asset = FRAMES.get_frame_texture("idle",0)
    pixel_size = Vector2i(96,136)
    foot = Vector2(48,116)
    shadow_size = Vector2(.60,.36)
    fade_for_player = false

func _ready() -> void:
    super._ready()
    add_to_group("arcana_npc_idle")
    sync_idle(0.0,true)

func _process(delta: float) -> void:
    super._process(delta)
    if Engine.is_editor_hint():
        preview_clock += delta
        sync_idle(preview_clock,true)

func sync_idle(time: float, animated: bool) -> void:
    var cell = int(maxf(0.0,time)*FRAMES.get_animation_speed("idle"))%FRAMES.get_frame_count("idle") if animated else 0
    var texture: Texture2D = FRAMES.get_frame_texture("idle",cell)
    if texture == current_texture: return
    current_texture = texture
    sprite_material.set_shader_parameter("sprite_sheet",texture)
