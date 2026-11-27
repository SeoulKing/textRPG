@tool
extends Node2D
## One logical tile = one world unit = 64 source dots. No 3D body deformation.
const FRAMES = preload("res://art/export/monsters/slime.tres")
const LIT_ATLAS = preload("res://art/export/monsters/slime-lit.res")
const SURFACE_ATLAS = preload("res://art/export/monsters/slime-surface.res")
const TileStyle := preload("res://scripts/rendering/tile_world_style.gd")
const SHADER = preload("res://art/resources/slime_sprite.gdshader")
const COMBAT_LAYOUT = preload("res://art/export/combat-layout.json")
const LANDING_SECONDS: float = 0.24
const HIT_FLASH_SECONDS: float = 0.16
const SPATIAL_HIT_SECONDS: float = 0.20
const SHADOW = preload("res://art/resources/contact_shadow.gdshader")
@export_enum("idle","hop","prepare","attack","hit","death") var preview_animation = "idle"
@export var preview_playing = true
@export var standalone_preview = false
@export var ambient_preview = false
var shadow_material: ShaderMaterial
var shadow: Node2D
var current_animation = ""
var current_frame = -1
var local_clock = 0.0
var previous_time = -1.0
var battle_id = "__boot__"
var previous_hp = 30.0
var previous_attack_in = 6.0
var hit_at = -100.0
var queued_hit = false
var death_at = -100.0
var attack_at = -100.0
var spatial_behavior: String = ""
var spatial_action: String = ""
var jump_clock: float = 0.0
var landing_at: float = -100.0
var _target_outlined := false

var sprite: Sprite2D
func _ready() -> void:
    add_to_group("native_slime_pixels")
    sprite=Sprite2D.new()
    var canvas=Image.create(64,80,false,Image.FORMAT_RGBA8);canvas.fill(Color.WHITE)
    sprite.texture=ImageTexture.create_from_image(canvas)
    sprite.centered=false;sprite.offset=Vector2(-32,-70)
    material=ShaderMaterial.new();material.shader=preload("res://art/resources/native_actor.gdshader")
    material.set_shader_parameter("avatar_texture",LIT_ATLAS)
    material.set_shader_parameter("sheet_grid",Vector2(LIT_ATLAS.get_size())/Vector2(64,80))
    material.set_shader_parameter("model_ink",Color.WHITE)
    if not Engine.is_editor_hint():
        material.set_shader_parameter("highlight_strength", TileStyle.HIGHLIGHT_STRENGTH)
    sprite.material=material;add_child(sprite)
    shadow=Node2D.new();add_child(shadow)
    show_pose("idle",0)

func set_target_outline(enabled: bool) -> void:
    if _target_outlined != enabled:
        _target_outlined = enabled
        material.set_shader_parameter("model_outline",enabled)

func show_pose(animation: String, elapsed: float, reduced: bool = false) -> void:
    if material == null: return
    var count = FRAMES.get_frame_count(animation)
    var f = int(maxf(0,elapsed)*FRAMES.get_animation_speed(animation))
    f = f%count if FRAMES.get_animation_loop(animation) else mini(f,count-1)
    if reduced: f = count-1 if animation == "death" else 0
    show_frame(animation,f)

func show_frame(animation: String, frame: int) -> void:
    var f = clampi(frame,0,FRAMES.get_frame_count(animation)-1)
    if current_animation != animation or current_frame != f:
        var texture: AtlasTexture = FRAMES.get_frame_texture(animation,f)
        material.set_shader_parameter("frame_cell",texture.region.position/Vector2(64,80))
        current_animation = animation
        current_frame = f
    shadow.visible = animation != "death" or f<FRAMES.get_frame_count(animation)-1

# Retiming existing pixel frames preserves the hand-edited art and lighting atlas.
func show_spatial_pose(behavior: String, attack_in: float, spatial: Dictionary, effects: bool) -> bool:
    var action := str(spatial.get("slimeAction", "leap"))
    var progress := spatial_action_progress(spatial)
    if action in ["hop", "flee"] and behavior == "attack":
        show_frame("hop", int(progress * FRAMES.get_frame_count("hop")) if effects else 0)
        return true
    if behavior == "attack":
        # Frames 3..16 cover lift-off to the last airborne pose; 17 is ground contact.
        show_frame("attack",roundi(lerpf(3.0, 16.0, progress)) if effects else 10)
        var lift = roundf(4.0 * progress * (1.0 - progress) * 14.0)/64.0 if effects else 0.0
        material.set_shader_parameter("sprite_lift",lift)
        shadow.scale = Vector2.ONE*(1.0-lift*.9)
        return true
    if behavior in ["recover", "chase", "prepare"] and local_clock-landing_at < LANDING_SECONDS:
        var recovery = clampf((local_clock-landing_at)/LANDING_SECONDS,0,1)
        show_frame("attack",roundi(lerpf(17.0, 23.0, smoothstep(0.15, 1.0, recovery))) if effects else 17)
        return true
    if behavior == "recover":
        show_frame("idle", 0)
        return true
    if behavior == "prepare":
        var windup := maxf(0.001, float(spatial.get("windupDuration", 3.0)))
        var remaining := clampf(attack_in / windup, 0.0, 1.0)
        # The early lean reads as a tell; the held pose marks the committed target.
        if remaining > 0.34:
            show_frame("prepare",roundi(8.0 * (1.0 - smoothstep(0.34, 1.0, remaining))) if effects else 8)
        elif remaining > 0.05 or not effects:
            show_frame("attack",0)
        else:
            show_frame("attack",roundi(2.0 * (1.0 - remaining / 0.05)))
        return true
    return false

func _action_duration(spatial: Dictionary) -> float:
    return maxf(0.001, float(spatial.get("actionDuration", COMBAT_LAYOUT.data.tuning.jumpDuration)))

func spatial_action_progress(spatial: Dictionary) -> float:
    return clampf(jump_clock / _action_duration(spatial), 0.0, 1.0)

# Camera calls this after its own pixel alignment, including secondary enemies.
func snap_to_pixels() -> void:
    if sprite == null or not is_inside_tree(): return
    var screen = get_viewport().get_stretch_transform()*get_global_transform_with_canvas()
    sprite.position = screen.affine_inverse()*(screen*Vector2.ZERO).round()

func play_hit() -> void:
    queued_hit = true

func hit_reaction() -> float:
    return 1.0 - smoothstep(0.0, HIT_FLASH_SECONDS, local_clock - hit_at)

func sync(time: float, battle: Dictionary, visual_hp: float, impact_pending: bool, effects: bool) -> void:
    var delta = maxf(0,time-previous_time) if previous_time>=0 else 0.0
    previous_time = time
    var phase = str(battle.get("phase",""))
    if phase != "battle" or not battle.get("paused",true): local_clock += delta
    var id = str(battle.get("id",""))
    if id != battle_id:
        battle_id = id
        previous_hp = visual_hp
        previous_attack_in = float(battle.get("attackIn",6))
        # A cast acknowledgement must not cancel a locally presented hit pose.
        if local_clock-hit_at >= float(FRAMES.get_frame_count("hit"))/FRAMES.get_animation_speed("hit"): hit_at = -100
        death_at = -100
        attack_at = -100
        spatial_behavior = ""
        spatial_action = ""
        jump_clock = 0
        landing_at = -100
        if phase == "victory" and not impact_pending: death_at = local_clock-2
    if visual_hp<previous_hp and not impact_pending:
        if visual_hp<=0: death_at = local_clock
        else: hit_at = local_clock
    previous_hp = visual_hp
    if queued_hit:
        hit_at = local_clock
        queued_hit = false
    var hit_duration = float(FRAMES.get_frame_count("hit"))/FRAMES.get_animation_speed("hit")
    material.set_shader_parameter("hit_flash",hit_reaction() if effects else 0.0)
    if phase == "victory" and not impact_pending and death_at < 0: death_at = local_clock
    var attack_in = float(battle.get("attackIn",6))
    if phase == "battle" and not battle.has("spatial") and not battle.get("paused",true):
        if attack_in<=.72: attack_at = local_clock-(.72-attack_in)
        elif attack_in>previous_attack_in+1 and previous_attack_in<=.72: attack_at = local_clock-.72
    previous_attack_in = attack_in
    var spatial: Dictionary = battle.get("spatial", {})
    var behavior = str(spatial.get("behavior","")) if phase == "battle" else ""
    if behavior == "attack":
        var reported = float(spatial.get("jumpElapsed",0))
        # Continue between snapshots without replaying frames when a packet arrives.
        jump_clock = maxf(reported,jump_clock+(0.0 if battle.get("paused",true) else delta)) if spatial_behavior == "attack" and not spatial.get("sampled_motion", false) else reported
        jump_clock = minf(jump_clock,_action_duration(spatial))
        spatial_action = str(spatial.get("slimeAction", "leap"))
    elif spatial_behavior == "attack" and spatial_action == "leap" and behavior in ["recover", "chase", "prepare"]:
        landing_at = local_clock
    elif spatial_behavior != "recover" and behavior == "recover" and spatial.get("slimeAction", "leap") == "leap":
        landing_at = local_clock - float(spatial.get("recoveryElapsed", 0.0))
    spatial_behavior = behavior
    material.set_shader_parameter("sprite_lift",0.0)
    shadow.scale = Vector2.ONE
    visible = phase != "defeat"
    if phase == "victory" and not impact_pending:
        var age = local_clock-death_at
        show_pose("death",age,not effects)
        visible = effects and age < .9
    elif not spatial.is_empty() and behavior not in ["attack", "prepare"] and local_clock-hit_at < SPATIAL_HIT_SECONDS and local_clock-landing_at >= 0.07:
        # Keep airborne and committed poses legible; the flash still acknowledges those hits.
        show_pose("hit",local_clock-hit_at,not effects)
    elif show_spatial_pose(behavior,attack_in,spatial,effects):
        pass
    elif spatial.is_empty() and local_clock-hit_at < hit_duration:
        show_pose("hit",local_clock-hit_at,not effects)
    elif phase == "battle" and not battle.has("spatial") and local_clock-attack_at < 1:
        show_pose("attack",local_clock-attack_at,not effects)
    elif phase == "battle" and spatial.is_empty() and attack_in<=3:
        show_pose("prepare",local_clock,not effects)
    elif battle.get("spatial",{}).get("behavior","") in ["chase","return"]:
        show_pose("hop",local_clock,not effects)
    else:
        var hop_duration = float(FRAMES.get_frame_count("hop"))/FRAMES.get_animation_speed("hop")
        # Two complete idle loops, then one complete hop: never cut a jump midair.
        var cycle = fmod(local_clock,3.0+hop_duration)
        show_pose("hop" if cycle>=3 else "idle",cycle-3 if cycle>=3 else cycle,not effects)
