@tool
extends Node3D
## Approved eight-direction sheet. Gameplay still owns position and collision.
const SPEC=preload("res://art/resources/heroine_reference_spec.gd")
const LEGACY=preload("res://scripts/heroine_blender.gd")
const DISPLAY=preload("res://art/resources/heroine_run.gdshader")
const ATLAS=preload("res://art/export/heroine-run-reference-v15/heroine-run.png")
const FRAMES=preload("res://art/export/heroine-run-reference-v15/heroine-run.tres")
const CAST_ATLAS=preload("res://art/export/heroine-run-reference-v15/heroine-cast.png")
const IDLE_ATLAS=preload("res://art/export/heroine-run-reference-v15/heroine-idle.png")
const BENCH_ATLAS=preload("res://art/export/heroine-run-reference-v15/heroine-bench.png")
const DASH_ATLAS=preload("res://art/export/heroine-dash-v1/heroine-dash.png")
const DASH_GHOST=preload("res://art/resources/dash_ghost.gdshader")
const SHADOW=preload("res://art/resources/heroine_shadow.gdshader")
const DIRECTIONS=["s","se","e","ne","n","nw","w","sw"]
const DEFAULT_OUTFIT=["dress","shawl","boots-taupe"]
var outfit=PackedStringArray(DEFAULT_OUTFIT)
var material: ShaderMaterial
var shadow_material: ShaderMaterial
var sprite_material: ShaderMaterial
var art: MeshInstance3D
var fallback: Node3D
var camera_yaw=0.0
var last_yaw=0.0
var walk_phase=0.0
var idle_age=0.0
var previous_pose_time=-1.0
var previous_gait=0.0
var was_walking=false
var pose_updates=0
var preview_clip=""
var preview_direction=0
var preview_frame=0
var bench_frame=-1
var bench_restore_texture: Texture2D
var bench_restore_grid=Vector2.ONE
var dash_age=-1.0
var dash_yaw=0.0
var dash_ghosts: Array[MeshInstance3D]=[]
var cast_age=-1.0
var cast_yaw=0.0
var aim_facing=Vector2.ZERO
const HURT_DURATION: float = .30
var hurt_age: float = -1.0
var hurt_direction: Vector2 = Vector2.ZERO
const CAST_GATHER=.32
const CAST_DURATION=.68
func supports_bench_pose() -> bool:
    return art!=null and art.visible
func set_bench_pose(state: String,age: float,reduced: bool) -> void:
    # Restore the preceding normal material before the current walk/cast pose runs.
    if bench_restore_texture!=null:
        sprite_material.set_shader_parameter("avatar_texture",bench_restore_texture)
        sprite_material.set_shader_parameter("sheet_grid",bench_restore_grid)
        bench_restore_texture=null
    bench_frame=-1
    if state=="sit":bench_frame=[0,1,2,3][mini(3,int(age/.13))] if not reduced else 3
    elif state=="stand":bench_frame=[3,6,7,0][mini(3,int(age/.105))] if not reduced else 0
    elif state=="seated":
        var phase=fposmod(age,4.2)
        bench_frame=3 if reduced else (5 if phase>3.95 else (4 if fposmod(age,2.4)>1.2 else 3))
func apply_bench_pose() -> void:
    # Applied after the shared movement renderer so its atlas and phase survive.
    if bench_frame<0 or not supports_bench_pose():return
    bench_restore_texture=sprite_material.get_shader_parameter("avatar_texture")
    bench_restore_grid=sprite_material.get_shader_parameter("sheet_grid")
    sprite_material.set_shader_parameter("avatar_texture",BENCH_ATLAS)
    sprite_material.set_shader_parameter("sheet_grid",Vector2(4,2))
    sprite_material.set_shader_parameter("frame_cell",Vector2(bench_frame%4,floori(bench_frame/4.0)))
    last_yaw=camera_yaw
func face_attack(direction: Vector2) -> void:
    if direction.length_squared()<.00001:return
    last_yaw=atan2(direction.x,direction.y)
    if fallback!=null:fallback.last_yaw=last_yaw
func begin_cast(direction: Vector2) -> void:
    face_attack(direction)
    cast_yaw=last_yaw
    cast_age=0.0
func cancel_cast() -> void:
    cast_age=-1.0
# Presentation only: never displace the gameplay anchor or interrupt an input.
func play_hurt(direction: Vector2) -> void:
    hurt_age=0.0
    hurt_direction=direction.normalized()
func update_hurt(delta: float,effects: bool) -> void:
    var recoil: float = 0.0
    var flash: float = 0.0
    if hurt_age>=0:
        # Fast impact, a small settling rebound, then a complete recovery.
        var phase: float = clampf(hurt_age/HURT_DURATION,0,1)
        if phase<.18:recoil=sin(phase/.18*PI*.5)
        elif phase<.70:recoil=cos((phase-.18)/.52*PI*.5)
        else:recoil=-.16*sin((phase-.70)/.30*PI)
        flash=maxf(0,1.0-hurt_age/.14)
        hurt_age+=delta
        if hurt_age>=HURT_DURATION:hurt_age=-1.0
    var sideways: float = hurt_direction.x*cos(camera_yaw)-hurt_direction.y*sin(camera_yaw)
    var depth: float = hurt_direction.x*sin(camera_yaw)+hurt_direction.y*cos(camera_yaw)
    var offset: Vector2 = Vector2(sideways*.09,-depth*.055)*recoil if effects else Vector2.ZERO
    # Whole source pixels keep the original sprite crisp at the shared density.
    sprite_material.set_shader_parameter("hurt_offset",offset.snapped(Vector2.ONE/64.0))
    sprite_material.set_shader_parameter("hurt_angle",-sideways*.075*recoil if effects else 0.0)
    sprite_material.set_shader_parameter("hurt_flash",flash if effects else 0.0)
func make_cast_warmup_mesh() -> MeshInstance3D:
    # Draw the real cast atlas/material during loading without touching the avatar.
    var warm_mesh=MeshInstance3D.new()
    warm_mesh.mesh=art.mesh
    warm_mesh.custom_aabb=art.custom_aabb
    warm_mesh.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
    var warm_material=sprite_material.duplicate() as ShaderMaterial
    warm_material.set_shader_parameter("avatar_texture",CAST_ATLAS)
    warm_material.set_shader_parameter("sheet_grid",Vector2(6,8))
    warm_material.set_shader_parameter("frame_cell",Vector2.ZERO)
    warm_mesh.material_override=warm_material
    return warm_mesh
func advance_cast(delta: float,paused: bool) -> void:
    if cast_age<0 or paused:return
    cast_age+=delta
    if cast_age>=CAST_DURATION:cast_age=-1.0
func cast_frame() -> int:
    if cast_age<.04:return 0
    if cast_age<.12:return 1
    if cast_age<CAST_GATHER:return 2
    if cast_age<.48:return 3
    if cast_age<.60:return 4
    return 5
func _ready() -> void:
    art=MeshInstance3D.new();art.name="ApprovedRunSprite"
    var quad=QuadMesh.new();quad.size=Vector2(96,136)/64.0;art.mesh=quad
    art.custom_aabb=AABB(Vector3(-1,0,-1),Vector3(2,2.8,2))
    art.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
    sprite_material=ShaderMaterial.new();sprite_material.shader=DISPLAY
    sprite_material.set_shader_parameter("avatar_texture",ATLAS)
    sprite_material.set_shader_parameter("sheet_grid",Vector2(8,9))
    sprite_material.set_shader_parameter("editor_preview",Engine.is_editor_hint())
    art.material_override=sprite_material;material=sprite_material;add_child(art)
    var shadow=MeshInstance3D.new();shadow.name="ContactShadow"
    var plane=PlaneMesh.new();plane.size=Vector2(.60,.36);shadow.mesh=plane;shadow.position.y=.015
    shadow.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
    shadow_material=ShaderMaterial.new();shadow_material.shader=SHADOW
    shadow_material.set_shader_parameter("editor_preview",Engine.is_editor_hint());shadow.material_override=shadow_material;add_child(shadow)
    for i in range(2):
        var ghost=MeshInstance3D.new()
        ghost.mesh=art.mesh
        ghost.custom_aabb=art.custom_aabb
        ghost.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
        var ghost_material=ShaderMaterial.new()
        ghost_material.shader=DASH_GHOST
        ghost_material.set_shader_parameter("avatar_texture",DASH_ATLAS)
        ghost.material_override=ghost_material
        ghost.visible=false
        add_child(ghost)
        dash_ghosts.append(ghost)
    set_outfit(outfit);pose(0,0,false,Vector2.ZERO,true,false)
static func direction_for_yaw(world_yaw: float,view_yaw: float) -> int:
    return posmod(int(floor((world_yaw-view_yaw)/TAU*8.0+.5)),8)
func set_camera_yaw(value: float) -> void:
    camera_yaw=value
    if fallback!=null:fallback.set_camera_yaw(value)
func set_preview_pose(direction: int,animation: String,frame: int) -> void:
    preview_direction=posmod(direction,8);preview_clip=animation;preview_frame=frame
    if fallback!=null:fallback.set_preview_pose(direction,animation,frame)
func clear_preview_pose() -> void:
    preview_clip=""
    if fallback!=null:fallback.clear_preview_pose()
func set_outfit(items: PackedStringArray) -> bool:
    var occupied={}
    for item in items:
        if not LEGACY.ITEM_SLOTS.has(item):return false
        for slot in LEGACY.ITEM_SLOTS[item]:
            if occupied.has(slot):return false
            occupied[slot]=item
    outfit=items.duplicate()
    var use_sheet=items.size()==DEFAULT_OUTFIT.size()
    for item in DEFAULT_OUTFIT:use_sheet=use_sheet and item in items
    if art==null:return true
    if not use_sheet and fallback==null:
        fallback=LEGACY.new();fallback.name="AlternateOutfitRenderer";add_child(fallback)
    art.visible=use_sheet
    get_node("ContactShadow").visible=use_sheet
    if fallback!=null:
        fallback.visible=not use_sheet
        fallback.set_outfit(items);fallback.set_camera_yaw(camera_yaw)
    material=sprite_material if use_sheet else fallback.material
    return true
func pose(time: float,gait: float,walking: bool,motion: Vector2,pixelated: bool,effects: bool) -> void:
    if art==null:return
    pose_updates+=1
    var delta=clampf(time-previous_pose_time,0,.1) if previous_pose_time>=0 else 0.0
    previous_pose_time=time
    update_hurt(delta,effects)
    if dash_age>=0:last_yaw=dash_yaw
    elif cast_age>=0:last_yaw=cast_yaw
    elif aim_facing.length_squared()>.00001:last_yaw=atan2(aim_facing.x,aim_facing.y)
    elif motion.length_squared()>.00001:last_yaw=atan2(motion.x,motion.y)
    var distance=motion.length()
    if distance<.000001 and gait>previous_gait:distance=(gait-previous_gait)/.20
    previous_gait=gait
    var direction=direction_for_yaw(last_yaw,camera_yaw)
    var clip="idle"
    var frame=0
    # Restart the visible gait after cast/bench recovery, not midway through it.
    var anim_walking=walking and cast_age<0 and bench_frame<0
    if anim_walking:
        # Use the approved complete poses; do not insert reconstructed legs.
        if not was_walking:walk_phase=0.0
        if distance<60.0:walk_phase=fposmod(walk_phase+distance/20.0,1.0)
        clip="run"
        frame=int(floor(walk_phase*FRAMES.get_frame_count("run_"+DIRECTIONS[direction])))
    was_walking=anim_walking
    if clip!="idle" or cast_age>=0 or bench_frame>=0 or not effects:idle_age=0.0
    else:idle_age+=delta
    if clip=="idle":frame=idle_frame(idle_age)
    if not preview_clip.is_empty():
        direction=preview_direction
        clip="run" if preview_clip=="walk" else preview_clip
        frame=preview_frame
    var casting=cast_age>=0 or preview_clip=="cast"
    var dashing=dash_age>=0 or preview_clip=="dash"
    if dashing:
        var dash_frame=clampi(preview_frame,0,5) if preview_clip=="dash" else dash_frame_for_age(dash_age)
        sprite_material.set_shader_parameter("avatar_texture",DASH_ATLAS)
        sprite_material.set_shader_parameter("sheet_grid",Vector2(6,8))
        sprite_material.set_shader_parameter("frame_cell",Vector2(dash_frame,direction))
    elif casting:
        sprite_material.set_shader_parameter("avatar_texture",CAST_ATLAS)
        sprite_material.set_shader_parameter("sheet_grid",Vector2(6,8))
        # Existing previews address the four action poses, excluding neutral ends.
        sprite_material.set_shader_parameter("frame_cell",Vector2(clampi(preview_frame,0,3)+1 if preview_clip=="cast" else cast_frame(),direction))
    elif clip=="idle":
        sprite_material.set_shader_parameter("avatar_texture",IDLE_ATLAS)
        sprite_material.set_shader_parameter("sheet_grid",Vector2(4,8))
        sprite_material.set_shader_parameter("frame_cell",Vector2(posmod(frame,4),direction))
    else:
        var animation=clip+"_"+DIRECTIONS[direction]
        if not FRAMES.has_animation(animation):animation="idle_"+DIRECTIONS[direction]
        frame=posmod(frame,FRAMES.get_frame_count(animation))
        var texture: AtlasTexture=FRAMES.get_frame_texture(animation,frame)
        sprite_material.set_shader_parameter("avatar_texture",texture.atlas)
        sprite_material.set_shader_parameter("sheet_grid",Vector2(texture.atlas.get_size())/Vector2(96,136))
        sprite_material.set_shader_parameter("frame_cell",texture.region.position/Vector2(96,136))
    for i in range(dash_ghosts.size()):
        var ghost=dash_ghosts[i]
        ghost.visible=dashing and art.visible and effects and dash_age<.23
        if ghost.visible:
            var heading=Vector3(sin(dash_yaw),0,cos(dash_yaw))
            ghost.position=-heading*(.22+.23*i)*minf(1.0,dash_age/.045)
            ghost.material_override.set_shader_parameter("frame_cell",Vector2(dash_frame_for_age(maxf(0,dash_age-.04*(i+1))),direction))
            ghost.material_override.set_shader_parameter("opacity",(.32-.10*i)*clampf((.25-dash_age)/.1,0,1))
    if shadow_material!=null:shadow_material.set_shader_parameter("entity_anchor",global_position)
    if fallback!=null and fallback.visible:
        if casting:fallback.last_yaw=last_yaw
        fallback.pose(time,gait,walking,Vector2.ZERO if casting else motion,pixelated,effects)
static func dash_frame_for_age(age: float) -> int:
    if age<.04:return 0
    if age<.08:return 1
    if age<.12:return 2
    if age<.18:return 3
    if age<.22:return 4
    return 5
static func idle_frame(age: float) -> int:
    var phase=fposmod(age,4.13)
    if phase<1.15:return 0
    if phase<2.15:return 1
    if phase<4.0:return 2
    return 3
