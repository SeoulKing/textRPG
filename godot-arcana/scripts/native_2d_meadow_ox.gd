extends Node2D

const DISPLAY_NAME := "진흙코 뿔소"
const LABEL_FONT := preload("res://fonts/NotoSansKR-SemiBold.tres")
const SHEET := preload("res://art/export/monsters/meadow-ox.png")
const Coordinates := preload("res://scripts/native_2d_coordinates.gd")

const FRAME_SIZE := Vector2(64, 64)
const FOOT_PIVOT := Vector2(32, 56)
const HORN_COLOR := Color("f3db9c")
const INK_COLOR := Color("392522")
const HIT_SECONDS := 0.18
const OX_HIT_TINT := Color("ffd2a8")

static var _frames: Array[AtlasTexture] = []
var _target_outlined := false
var _sprite: Sprite2D
var _phase: StringName = &""
var _phase_elapsed := 0.0
var _hit_age := HIT_SECONDS
var _pose_offset := Vector2.ZERO

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

func sync_combat_pose(spatial: Dictionary, attack_in: float = 0.0, delta: float = 0.0,
        animate: bool = true, paused: bool = false) -> void:
    var phase := StringName(spatial.get("behavior", "")) if spatial.get("slimeAction", "") == "charge" else &""
    var elapsed := 0.0
    var duration := 1.0
    match phase:
        &"prepare":
            duration = maxf(0.001, float(spatial.get("windupDuration", 1.6)))
            elapsed = duration - attack_in
        &"attack":
            duration = maxf(0.001, float(spatial.get("actionDuration", 0.55)))
            elapsed = float(spatial.get("jumpElapsed", 0.0))
        &"recover":
            duration = maxf(0.001, float(spatial.get("recoveryDuration", 1.2)))
            elapsed = float(spatial.get("recoveryElapsed", 0.0))
    var step := 0.0 if paused else delta
    if phase == _phase and not spatial.get("sampled_motion", false):
        elapsed = maxf(elapsed, _phase_elapsed + step)
    _phase = phase
    _phase_elapsed = clampf(elapsed, 0.0, duration)
    var progress := _phase_elapsed / duration

    if phase in [&"prepare", &"attack"] and spatial.has("jumpFrom") and spatial.has("jumpTo"):
        var horizontal := float(spatial.jumpTo.x) - float(spatial.jumpFrom.x)
        if absf(horizontal) > 1.0:
            _sprite.flip_h = horizontal > 0.0
    var travel_sign := 1.0 if _sprite.flip_h else -1.0
    var pose: StringName = &"idle"
    var squash := Vector2.ONE
    var shift := 0.0
    match phase:
        &"prepare":
            pose = &"prepare"
            var brace := smoothstep(0.0, 0.48, progress)
            squash = Vector2.ONE.lerp(Vector2(1.06, 0.92), brace)
            shift = -3.0 * brace
        &"attack":
            pose = &"charge"
            var drive := smoothstep(0.0, 0.22, progress)
            var brake := smoothstep(0.76, 1.0, progress)
            squash = Vector2(1.06, 0.92).lerp(Vector2(1.14, 0.96), drive).lerp(Vector2(1.08, 0.88), brake)
            shift = lerpf(-3.0, 2.0, drive) * (1.0 - brake)
        &"recover":
            # Hooves stay at the ground pivot as the horns rise after the stop.
            pose = &"prepare" if progress < 0.35 else &"idle"
            squash = Vector2(1.08, 0.88).lerp(Vector2.ONE, smoothstep(0.05, 0.68, progress))
    var texture := pose_texture(pose)
    if texture != _sprite.texture:
        _sprite.texture = texture
    if spatial.get("behavior", "neutral") == "neutral":
        _hit_age = HIT_SECONDS
    else:
        _hit_age = minf(HIT_SECONDS, _hit_age + step)
    var hit := 1.0 - smoothstep(0.0, HIT_SECONDS, _hit_age) if animate else 0.0
    _sprite.modulate = Color.WHITE.lerp(OX_HIT_TINT, hit)
    _sprite.scale = squash.lerp(Vector2(1.03, 0.92), hit * 0.4) if animate else Vector2.ONE
    _pose_offset.x = roundf((shift - 2.0 * hit) * travel_sign) if animate else 0.0

func snap_to_pixels() -> void:
    var to_raster := get_viewport().get_stretch_transform() * get_global_transform_with_canvas()
    _sprite.position = Coordinates.screen_snap(_pose_offset, to_raster)

func set_target_outline(enabled: bool) -> void:
    if _target_outlined == enabled: return
    _target_outlined = enabled
    queue_redraw()

func play_hit() -> void:
    _hit_age = 0.0

func _draw() -> void:
    draw_set_transform(Vector2(0, 2), 0.0, Vector2(1, 0.32))
    draw_circle(Vector2.ZERO, 26, Color(0.15, 0.14, 0.09, 0.34))
    if _target_outlined:
        draw_arc(Vector2.ZERO, 31, 0, TAU, 24, HORN_COLOR, 3)
