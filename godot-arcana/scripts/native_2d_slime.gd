@tool
extends Node2D
## One logical tile = one world unit = 64 source dots. No 3D body deformation.
const FRAMES = preload("res://art/export/monsters/slime.tres")
const LIT_ATLAS = preload("res://art/export/monsters/slime-lit.res")
const SURFACE_ATLAS = preload("res://art/export/monsters/slime-surface.res")
const SHADER = preload("res://art/resources/slime_sprite.gdshader")
const COMBAT_LAYOUT = preload("res://art/export/combat-layout.json")
const LANDING_SECONDS: float = 0.24
const SHADOW = preload("res://art/resources/heroine_shadow.gdshader")
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
var jump_clock: float = 0.0
var landing_at: float = -100.0

var sprite: Sprite2D
func _ready() -> void:
    sprite=Sprite2D.new()
    var canvas=Image.create(64,80,false,Image.FORMAT_RGBA8);canvas.fill(Color.WHITE)
    sprite.texture=ImageTexture.create_from_image(canvas)
    sprite.centered=false;sprite.offset=Vector2(-32,-70)
    material=ShaderMaterial.new();material.shader=preload("res://art/resources/native_actor.gdshader")
    material.set_shader_parameter("avatar_texture",LIT_ATLAS)
    material.set_shader_parameter("sheet_grid",Vector2(LIT_ATLAS.get_size())/Vector2(64,80))
    sprite.material=material;add_child(sprite)
    shadow=Node2D.new();add_child(shadow)
    show_pose("idle",0)
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
    pass
    shadow.visible = animation != "death" or f<FRAMES.get_frame_count(animation)-1

# Retiming existing pixel frames preserves the hand-edited art and lighting atlas.
func show_spatial_pose(behavior: String, attack_in: float, effects: bool) -> bool:
    if behavior == "attack":
        var progress = clampf(jump_clock/float(COMBAT_LAYOUT.data.tuning.jumpDuration),0,1)
        # Frames 3..16 cover lift-off to the last airborne pose; 17 is ground contact.
        show_frame("attack",mini(16,3+int(progress*14)) if effects else 0)
        var lift = sin(progress*PI)*.22 if effects else 0.0
        material.set_shader_parameter("sprite_lift",lift)
        shadow.scale = Vector2.ONE*(1.0-lift*.9)
        return true
    if behavior in ["chase","prepare"] and local_clock-landing_at < LANDING_SECONDS:
        var recovery = clampf((local_clock-landing_at)/LANDING_SECONDS,0,1)
        show_frame("attack",17+int(recovery*7) if effects else 23)
        return true
    if behavior == "prepare":
        # Compress once, then hold the loaded pose instead of looping by world time.
        if attack_in > 1.0:
            show_frame("prepare",int(clampf((3.0-attack_in)/2.0,0,1)*8) if effects else 0)
        elif attack_in > .14:
            show_frame("attack",0)
        else:
            show_frame("attack",int(clampf((.14-attack_in)/.14,0,1)*2) if effects else 0)
        return true
    return false

func play_hit() -> void:
    queued_hit = true

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
    material.set_shader_parameter("hit_flash",maxf(0,1.0-(local_clock-hit_at)/.12) if effects else 0.0)
    if phase == "victory" and not impact_pending and death_at < 0: death_at = local_clock
    var attack_in = float(battle.get("attackIn",6))
    if phase == "battle" and not battle.has("spatial") and not battle.get("paused",true):
        if attack_in<=.72: attack_at = local_clock-(.72-attack_in)
        elif attack_in>previous_attack_in+1 and previous_attack_in<=.72: attack_at = local_clock-.72
    previous_attack_in = attack_in
    var behavior = str(battle.get("spatial",{}).get("behavior","")) if phase == "battle" else ""
    if behavior == "attack":
        var reported = float(battle.spatial.get("jumpElapsed",0))
        # Continue between snapshots without replaying frames when a packet arrives.
        jump_clock = maxf(reported,jump_clock+(0.0 if battle.get("paused",true) else delta)) if spatial_behavior == "attack" else reported
        jump_clock = minf(jump_clock,float(COMBAT_LAYOUT.data.tuning.jumpDuration))
    elif spatial_behavior == "attack" and behavior in ["chase","prepare"]:
        landing_at = local_clock
    spatial_behavior = behavior
    material.set_shader_parameter("sprite_lift",0.0)
    shadow.scale = Vector2.ONE
    visible = phase != "defeat"
    if phase == "victory" and not impact_pending:
        var age = local_clock-death_at
        show_pose("death",age,not effects)
        visible = effects and age < .9
    elif show_spatial_pose(behavior,attack_in,effects):
        pass
    elif local_clock-hit_at < hit_duration:
        show_pose("hit",local_clock-hit_at,not effects)
    elif phase == "battle" and not battle.has("spatial") and local_clock-attack_at < 1:
        show_pose("attack",local_clock-attack_at,not effects)
    elif phase == "battle" and attack_in<=3 and battle.get("spatial",{}).get("behavior","") != "attack":
        show_pose("prepare",local_clock,not effects)
    elif battle.get("spatial",{}).get("behavior","") in ["chase","return"]:
        show_pose("hop",local_clock,not effects)
    else:
        var hop_duration = float(FRAMES.get_frame_count("hop"))/FRAMES.get_animation_speed("hop")
        # Two complete idle loops, then one complete hop: never cut a jump midair.
        var cycle = fmod(local_clock,3.0+hop_duration)
        show_pose("hop" if cycle>=3 else "idle",cycle-3 if cycle>=3 else cycle,not effects)
