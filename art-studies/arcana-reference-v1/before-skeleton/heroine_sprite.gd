@tool
extends Node3D
## Reference-drawn layered 96x136 heroine; shared pose() / foot-depth contract.
const SPEC = preload("res://art/resources/heroine_reference_spec.gd")
const SHADER = preload("res://art/resources/heroine_layered.gdshader")
const FRAMES = preload("res://art/resources/heroine_frames.tres")
const DIRECTIONS = ["s","se","e","ne","n","nw","w","sw"]
const SHADOW = preload("res://art/resources/heroine_shadow.gdshader")

const LAYERS = {
 "body":preload("res://art/export/reference/hero-body.png"),
 "hair":preload("res://art/export/reference/hero-hair.png"),
 "dress":preload("res://art/export/reference/hero-dress.png"),
 "shawl":preload("res://art/export/reference/hero-shawl.png"),
 "boots":preload("res://art/export/reference/hero-boots-taupe.png"),
 "top":preload("res://art/export/reference/hero-blouse.png"),
 "bottom":preload("res://art/export/reference/hero-skirt.png"),
 "occlusion":preload("res://art/export/reference/hero-occlusion.png")
}
const NAVY_BOOTS = preload("res://art/export/reference/hero-boots-navy.png")
const ITEM_SLOTS = {"dress":["top","bottom"],"blouse":["top"],"skirt":["bottom"],"shawl":["shoulders"],"boots-taupe":["feet"],"boots-navy":["feet"]}
var outfit = PackedStringArray(["dress","shawl","boots-taupe"])

# Preview speed is authoring metadata; gameplay phase follows actual travel.
const STEP_SECONDS = SPEC.STEP_SECONDS
const WALK_CYCLE_SECONDS = STEP_SECONDS * 2.0
var walk_phase = SPEC.PASSING_PHASE
var previous_pose_time = -1.0
var previous_gait = 0.0
var was_walking = false
var stop_clock = -1.0
var stop_from = 0.0
var stop_anchor = 0.0
var preview_clip = ""
var preview_direction = 0
var preview_frame = 0
var pose_updates = 0
var last_yaw = 0.0
var camera_yaw = 0.0
var visual_yaw = 0.0
var turn_target = 0.0
var turn_start = 0.0
var turn_clock = 1.0
var turn_duration = .12
var head_facing = 0
var torso_facing = 0
var facing = 0
var current_frame = Vector2i(-1,-1)
var art: MeshInstance3D
var material: ShaderMaterial
var shadow_material: ShaderMaterial

func _ready() -> void:
    art = MeshInstance3D.new()
    art.name = "BakedHeroine"
    var quad = QuadMesh.new()
    quad.size = Vector2(SPEC.FRAME_SIZE)/SPEC.PIXELS_PER_UNIT
    art.mesh = quad
    art.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
    # The shader anchors at the feet; conservative bounds prevent edge culling.
    art.custom_aabb = AABB(Vector3(-1,0,-1),Vector3(2,2.8,2))
    material = ShaderMaterial.new()
    material.shader = SHADER
    material.set_shader_parameter("sheet_grid",Vector2(SPEC.ATLAS_GRID))
    material.set_shader_parameter("foot_offset",(SPEC.FOOT.y-SPEC.FRAME_SIZE.y*.5)/SPEC.PIXELS_PER_UNIT)
    material.set_shader_parameter("editor_preview",Engine.is_editor_hint())
    for key in LAYERS:
        material.set_shader_parameter(str(key)+"_sheet",LAYERS[key])
    art.material_override = material
    set_outfit(outfit)
    add_child(art)
    var shadow = MeshInstance3D.new()
    shadow.name = "ContactShadow"
    var plane = PlaneMesh.new()
    plane.size = Vector2(.60,.36)
    shadow.mesh = plane
    shadow.position.y = .015
    shadow.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
    shadow_material = ShaderMaterial.new()
    shadow_material.shader = SHADOW
    shadow_material.set_shader_parameter("editor_preview",Engine.is_editor_hint())
    shadow.material_override = shadow_material
    add_child(shadow)
    pose(0,0,false,Vector2.ZERO,true,false)

static func direction_for_yaw(world_yaw: float, view_yaw: float) -> int:
    # S,SE,E,NE,N,NW,W,SW; camera yaw is subtracted, not added.
    return posmod(int(floor((world_yaw-view_yaw)/TAU*8.0+.5)),8)

func set_camera_yaw(value: float) -> void:
    camera_yaw = value

func set_preview_pose(direction: int, animation: String, frame: int) -> void:
    preview_direction = posmod(direction,8)
    preview_clip = animation
    preview_frame = frame

func clear_preview_pose() -> void:
    preview_clip = ""

func _frame_for_phase(name: StringName, phase: float) -> int:
    var total = 0.0
    for f in range(FRAMES.get_frame_count(name)): total += FRAMES.get_frame_duration(name,f)
    var cursor = clampf(phase,0.0,.999999)*total
    for f in range(FRAMES.get_frame_count(name)):
        cursor -= FRAMES.get_frame_duration(name,f)
        if cursor < 0.0: return f
    return 0

func _select_frame(animation: String, phase: float, forced: int = -1) -> void:
    var name = StringName(animation+"_"+DIRECTIONS[facing])
    if not FRAMES.has_animation(name): return
    var f = clampi(forced,0,FRAMES.get_frame_count(name)-1) if forced>=0 else _frame_for_phase(name,phase)
    var texture = FRAMES.get_frame_texture(name,f)
    if not texture is AtlasTexture: return
    var cell = Vector2i(Vector2(texture.region.position)/Vector2(SPEC.FRAME_SIZE))
    if material != null and cell != current_frame:
        material.set_shader_parameter("frame_cell",Vector2(cell))
        current_frame = cell

func _part_cell(direction: int, animation: String, phase: float, forced: int) -> Vector2i:
    var name = StringName(animation+"_"+DIRECTIONS[direction])
    var index = clampi(forced,0,FRAMES.get_frame_count(name)-1) if forced>=0 else _frame_for_phase(name,phase)
    var texture = FRAMES.get_frame_texture(name,index) as AtlasTexture
    return Vector2i(texture.region.position/Vector2(SPEC.FRAME_SIZE))

func pose(time: float, gait: float, walking: bool, motion: Vector2, _pixelated: bool, effects: bool) -> void:
    pose_updates += 1
    var elapsed = clampf(time-previous_pose_time,0.0,.05) if previous_pose_time>=0.0 else 0.0
    previous_pose_time = time
    if motion.length_squared()>.00001: last_yaw = atan2(motion.x,motion.y)
    var requested = wrapf(last_yaw-camera_yaw,-PI,PI)
    if absf(wrapf(requested-turn_target,-PI,PI))>.045:
        turn_start = visual_yaw
        turn_target = requested
        turn_clock = 0.0
        turn_duration = clampf(absf(wrapf(turn_target-turn_start,-PI,PI))/(PI*.25)*.12,.12,.24)
    turn_clock = minf(turn_clock+elapsed,turn_duration)
    var progress = clampf(turn_clock/turn_duration,0.0,1.0)
    visual_yaw = lerp_angle(turn_start,turn_target,smoothstep(0.0,1.0,progress))
    head_facing = direction_for_yaw(lerp_angle(turn_start,turn_target,minf(1.0,progress*2.0)),0.0)
    torso_facing = direction_for_yaw(visual_yaw,0.0)
    facing = direction_for_yaw(lerp_angle(turn_start,turn_target,smoothstep(0.0,1.0,maxf(0.0,progress-.15)/.85)),0.0)
    var animation = "idle"
    var phase = fposmod(time*2.0/float(SPEC.IDLE_FRAMES),1.0) if effects else 0.0
    var forced = -1
    if walking:
        if not was_walking and stop_clock<0.0: walk_phase = SPEC.PASSING_PHASE
        var traveled = motion.length()
        if traveled<.000001 and gait>previous_gait: traveled = (gait-previous_gait)/.20
        if traveled<SPEC.WALK_DISTANCE_MAP_UNITS*3.0:
            walk_phase = fposmod(walk_phase+traveled/SPEC.WALK_DISTANCE_MAP_UNITS,1.0)
        stop_clock = -1.0
        animation = "walk"
        phase = walk_phase
    else:
        if was_walking:
            stop_clock = 0.0
            stop_from = walk_phase
            var left = SPEC.PASSING_PHASE
            var right = fposmod(left+.5,1.0)
            stop_anchor = left if absf(wrapf(left-walk_phase,-.5,.5))<=absf(wrapf(right-walk_phase,-.5,.5)) else right
        if stop_clock>=0.0 and effects:
            stop_clock += elapsed
            var half = SPEC.SETTLE_SECONDS*.5
            if stop_clock<half:
                walk_phase = fposmod(stop_from+wrapf(stop_anchor-stop_from,-.5,.5)*smoothstep(0.0,1.0,stop_clock/half),1.0)
                animation = "walk"
                phase = walk_phase
            elif stop_clock<SPEC.SETTLE_SECONDS:
                animation = "stop_left" if is_equal_approx(stop_anchor,SPEC.PASSING_PHASE) else "stop_right"
                forced = mini(SPEC.STOP_FRAMES-1,int((stop_clock-half)/half*SPEC.STOP_FRAMES))
            else: stop_clock = -1.0
        elif not effects: stop_clock = -1.0
    previous_gait = gait
    was_walking = walking
    if not preview_clip.is_empty():
        facing = preview_direction
        head_facing = facing
        torso_facing = facing
        animation = preview_clip
        forced = preview_frame
    _select_frame(animation,phase,forced)
    if material != null:
        material.set_shader_parameter("head_cell",Vector2(_part_cell(head_facing,animation,phase,forced)))
        material.set_shader_parameter("torso_cell",Vector2(_part_cell(torso_facing,animation,phase,forced)))
    if shadow_material != null: shadow_material.set_shader_parameter("entity_anchor",global_position)


## Atomic cosmetic-only change; no equipment/stat/save writes.
func set_outfit(items: PackedStringArray) -> bool:
    var occupied: Dictionary = {}
    for item in items:
        if not ITEM_SLOTS.has(item): return false
        for slot in ITEM_SLOTS[item]:
            if occupied.has(slot): return false
            occupied[slot] = item
    outfit = items.duplicate()
    if material != null:
        material.set_shader_parameter("dress_enabled","dress" in outfit)
        material.set_shader_parameter("top_enabled","blouse" in outfit)
        material.set_shader_parameter("bottom_enabled","skirt" in outfit)
        material.set_shader_parameter("shawl_enabled","shawl" in outfit)
        material.set_shader_parameter("boots_enabled",occupied.has("feet"))
        material.set_shader_parameter("boots_sheet",NAVY_BOOTS if "boots-navy" in outfit else LAYERS["boots"])
    return true
