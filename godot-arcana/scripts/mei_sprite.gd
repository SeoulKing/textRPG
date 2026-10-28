@tool
extends "res://scripts/illustrated_prop.gd"
## Native PixelPen timeline. Keep frame registration identical to approved Mei.
const FRAMES = preload("res://art/export/plaza-guide/mei-idle.tres")
var preview_clock = 0.0
var current_pose = -1
var pose_textures: Dictionary = {}

func _init() -> void:
    var first = FRAMES.get_frame_texture("idle",0) as AtlasTexture
    asset = first.atlas
    pixel_size = Vector2i(96,136)
    foot = Vector2(48,116)
    shadow_size = Vector2(.60,.36)
    fade_for_player = false

func _ready() -> void:
    super._ready()
    # Use complete frame textures so animation never samples outside its cell.
    add_to_group("arcana_npc_idle")
    sync_idle(0.0,true)

func _process(delta: float) -> void:
    super._process(delta)
    if Engine.is_editor_hint():
        preview_clock += delta
        sync_idle(preview_clock,true)

func sync_idle(time: float, animated: bool) -> void:
    var cell = int(maxf(0.0,time)*FRAMES.get_animation_speed("idle"))%FRAMES.get_frame_count("idle") if animated else 0
    var texture = FRAMES.get_frame_texture("idle",cell) as AtlasTexture
    var pose = int(texture.region.position.x/96.0)
    if pose == current_pose: return
    current_pose = pose
    if not pose_textures.has(pose):
        pose_textures[pose] = ImageTexture.create_from_image(texture.get_image())
    sprite_material.set_shader_parameter("sprite_sheet",pose_textures[pose])
    sprite_material.set_shader_parameter("sheet_grid",Vector2.ONE)
    sprite_material.set_shader_parameter("frame_cell",Vector2.ZERO)
