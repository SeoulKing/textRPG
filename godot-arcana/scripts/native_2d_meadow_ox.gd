extends Node2D

const DISPLAY_NAME := "진흙코 뿔소"
const LABEL_FONT := preload("res://fonts/NotoSansKR-SemiBold.tres")
const SHEET := preload("res://art/export/monsters/meadow-ox.png")
const Coordinates := preload("res://scripts/native_2d_coordinates.gd")

const FRAME_SIZE := Vector2(64, 64)
const FOOT_PIVOT := Vector2(32, 56)
const HORN_COLOR := Color("f3db9c")
const INK_COLOR := Color("392522")

static var _frames: Array[AtlasTexture] = []
var _target_outlined := false
var _sprite: Sprite2D
var _hit_flash: Tween

static func pose_texture(pose: StringName = &"idle") -> Texture2D:
    if _frames.is_empty():
        for column in range(3):
            var texture := AtlasTexture.new()
            texture.atlas = SHEET
            texture.region = Rect2(Vector2(column * FRAME_SIZE.x, 0), FRAME_SIZE)
            texture.filter_clip = true
            _frames.append(texture)
    match pose:
        &"prepare": return _frames[1]
        &"charge", &"attack": return _frames[2]
        _: return _frames[0]

func _ready() -> void:
    texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
    _sprite = Sprite2D.new()
    _sprite.texture = pose_texture()
    _sprite.offset = FRAME_SIZE * 0.5 - FOOT_PIVOT
    add_child(_sprite)
    var caption := Label.new()
    caption.text = DISPLAY_NAME
    caption.add_theme_font_override("font", LABEL_FONT)
    caption.add_theme_font_size_override("font_size", 18)
    caption.add_theme_color_override("font_color", Color("fff1cd"))
    caption.add_theme_color_override("font_outline_color", INK_COLOR)
    caption.add_theme_constant_override("outline_size", 4)
    caption.position = Vector2(-72, -108)
    caption.size = Vector2(144, 24)
    caption.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
    caption.mouse_filter = Control.MOUSE_FILTER_IGNORE
    add_child(caption)

func sync_combat_pose(spatial: Dictionary) -> void:
    var pose: StringName = &"idle"
    if spatial.get("slimeAction", "") == "charge":
        match spatial.get("behavior", ""):
            "prepare": pose = &"prepare"
            "attack": pose = &"charge"
        if pose != &"idle" and spatial.has("jumpFrom") and spatial.has("jumpTo"):
            var horizontal := float(spatial.jumpTo.x) - float(spatial.jumpFrom.x)
            if absf(horizontal) > 1.0:
                _sprite.flip_h = horizontal > 0.0
    var texture := pose_texture(pose)
    if texture != _sprite.texture:
        _sprite.texture = texture

func snap_to_pixels() -> void:
    var to_raster := get_viewport().get_stretch_transform() * get_global_transform_with_canvas()
    _sprite.position = Coordinates.screen_snap(Vector2.ZERO, to_raster)

func set_target_outline(enabled: bool) -> void:
    if _target_outlined == enabled: return
    _target_outlined = enabled
    queue_redraw()

func play_hit() -> void:
    if not is_instance_valid(_sprite): return
    if _hit_flash != null: _hit_flash.kill()
    _sprite.modulate = Color("ffd2a8")
    _hit_flash = create_tween()
    _hit_flash.tween_property(_sprite, "modulate", Color.WHITE, 0.18)

func _draw() -> void:
    draw_set_transform(Vector2(0, 2), 0.0, Vector2(1, 0.32))
    draw_circle(Vector2.ZERO, 26, Color(0.15, 0.14, 0.09, 0.34))
    if _target_outlined:
        draw_arc(Vector2.ZERO, 31, 0, TAU, 24, HORN_COLOR, 3)
