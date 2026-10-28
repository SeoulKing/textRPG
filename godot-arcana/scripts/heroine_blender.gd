@tool
extends Node3D
## Editable Blender skin; gameplay controls position, continuous yaw and gait distance.
const SPEC=preload("res://art/resources/heroine_reference_spec.gd")
const MODEL=preload("res://art/models/heroine-v3/heroine-v3.glb")
const TOON=preload("res://art/resources/heroine_blender.gdshader")
const DISPLAY=preload("res://art/resources/heroine_blender_display.gdshader")
const INK=preload("res://art/resources/heroine_blender_outline.gdshader")
const SHADOW=preload("res://art/resources/heroine_shadow.gdshader")
const ITEM_SLOTS={"dress":["top","bottom"],"blouse":["top"],"skirt":["bottom"],"shawl":["shoulders"],"boots-taupe":["feet"],"boots-navy":["feet"]}
const CYCLE_MAP_UNITS=16.64
const RENDER_FRAME=Vector2i(96,144) # Eight transparent bottom pixels; nominal foot registration unchanged.
@export var render_as_sprite=true
var avatar_viewport: SubViewport
var body_coverage_materials: Array[ShaderMaterial]=[]
var toon_materials: Array[ShaderMaterial]=[]
var ink_material: ShaderMaterial
var material: ShaderMaterial
var shadow_material: ShaderMaterial
var model: Node3D
var skeleton: Skeleton3D
var head_bone=-1
var spine_bone=-1
var animator: AnimationPlayer
var tree: AnimationTree
var item_meshes: Dictionary={}
var outfit=PackedStringArray(["dress","shawl","boots-taupe"])
var camera_yaw=0.0
var last_yaw=0.0
var displayed_yaw=0.0
var walk_phase=0.0
var walk_blend=0.0
var run_blend=0.0
var was_walking=false
var stop_clock=-1.0
var stop_from=0.0
var stop_to=0.0
var stop_run=0.0
var previous_pose_time=-1.0
var previous_gait=0.0
var preview_clip=""
var preview_direction=0
var preview_frame=0
var pose_updates=0
var animation_names: Dictionary={}
func _ready() -> void:
    model=MODEL.instantiate();model.name="BlenderHeroine"
    if render_as_sprite:
        avatar_viewport=SubViewport.new();avatar_viewport.name="Live3DPixelSource";avatar_viewport.size=RENDER_FRAME
        avatar_viewport.own_world_3d=true;avatar_viewport.transparent_bg=true
        avatar_viewport.render_target_update_mode=SubViewport.UPDATE_ALWAYS
        avatar_viewport.msaa_3d=Viewport.MSAA_DISABLED;avatar_viewport.screen_space_aa=Viewport.SCREEN_SPACE_AA_DISABLED
        add_child(avatar_viewport);avatar_viewport.add_child(model)
        var view_camera=Camera3D.new();avatar_viewport.add_child(view_camera)
        view_camera.projection=Camera3D.PROJECTION_ORTHOGONAL;view_camera.size=144.0/64.0
        view_camera.position=Vector3(0,6,6);view_camera.look_at(Vector3.ZERO);view_camera.position+=view_camera.basis.y*.6875;view_camera.current=true
        var display=MeshInstance3D.new();display.name="Live3DDotDisplay";var quad=QuadMesh.new();quad.size=Vector2(RENDER_FRAME)/64.0;display.mesh=quad;display.custom_aabb=AABB(Vector3(-1,0,-1),Vector3(2,2.8,2))
        material=ShaderMaterial.new();material.shader=DISPLAY;material.set_shader_parameter("frame_size",Vector2(RENDER_FRAME));material.set_shader_parameter("foot_offset",.6875);material.set_shader_parameter("avatar_texture",avatar_viewport.get_texture());material.set_shader_parameter("editor_preview",Engine.is_editor_hint())
        display.material_override=material;display.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF;add_child(display)
    else:add_child(model)
    skeleton=model.find_children("*","Skeleton3D",true,false)[0]
    head_bone=skeleton.find_bone("head");spine_bone=skeleton.find_bone("spine")
    animator=model.find_child("AnimationPlayer",true,false)
    for name in animator.get_animation_list():
        animation_names[str(name).get_file()]=name
        if str(name).get_file() in ["Idle","Walk","Run"]:animator.get_animation(name).loop_mode=Animation.LOOP_LINEAR
    ink_material=ShaderMaterial.new();ink_material.shader=INK
    ink_material.set_shader_parameter("editor_preview",Engine.is_editor_hint())
    for child in model.find_children("*","MeshInstance3D",true,false):
        var key=str(child.name).trim_prefix("Heroine_").replace("_","-")
        item_meshes[key]=child
        child.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
        for i in range(child.mesh.get_surface_count()):
            var original=child.mesh.surface_get_material(i)
            var mat=ShaderMaterial.new();mat.shader=TOON
            if original is BaseMaterial3D:
                mat.set_shader_parameter("base_color",original.albedo_color)
                if original.albedo_texture!=null:
                    mat.set_shader_parameter("albedo_texture",original.albedo_texture)
                    mat.set_shader_parameter("has_albedo_texture",true)
                if str(original.resource_name).begins_with("Stockings_covered"):body_coverage_materials.append(mat)
                mat.set_shader_parameter("skin_surface",str(original.resource_name).contains("skin"))
                mat.set_shader_parameter("hair_surface",str(original.resource_name).contains("hair") or str(original.resource_name).begins_with("Bob_"))
            if not render_as_sprite:mat.next_pass=ink_material
            mat.set_shader_parameter("sprite_render",render_as_sprite)
            mat.set_shader_parameter("editor_preview",Engine.is_editor_hint() or render_as_sprite)
            toon_materials.append(mat)
            child.set_surface_override_material(i,mat)
            if material==null:material=mat
    _make_animation_tree()
    var shadow=MeshInstance3D.new();shadow.name="ContactShadow"
    var plane=PlaneMesh.new();plane.size=Vector2(.60,.36);shadow.mesh=plane;shadow.position.y=.015
    shadow.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
    shadow_material=ShaderMaterial.new();shadow_material.shader=SHADOW
    shadow_material.set_shader_parameter("editor_preview",Engine.is_editor_hint());shadow.material_override=shadow_material;add_child(shadow)
    set_outfit(outfit);pose(0,0,false,Vector2.ZERO,true,false)
func _make_animation_tree() -> void:
    tree=AnimationTree.new();tree.name="Locomotion";add_child(tree)
    tree.anim_player=tree.get_path_to(animator)
    tree.root_node=tree.get_path_to(model)
    var graph=AnimationNodeBlendTree.new()
    var idle=AnimationNodeAnimation.new();idle.animation=animation_names.get("Idle","")
    var walk=AnimationNodeAnimation.new();walk.animation=animation_names.get("Walk","")
    var run=AnimationNodeAnimation.new();run.animation=animation_names.get("Run","")
    graph.add_node("Idle",idle,Vector2(0,0));graph.add_node("Walk",walk,Vector2(0,160))
    graph.add_node("WalkPhase",AnimationNodeTimeSeek.new(),Vector2(180,160))
    graph.add_node("Run",run,Vector2(0,320));graph.add_node("RunPhase",AnimationNodeTimeSeek.new(),Vector2(180,320))
    graph.add_node("SpeedBlend",AnimationNodeBlend2.new(),Vector2(360,160))
    graph.add_node("Blend",AnimationNodeBlend2.new(),Vector2(360,0))
    graph.connect_node("WalkPhase",0,"Walk");graph.connect_node("RunPhase",0,"Run")
    graph.connect_node("SpeedBlend",0,"WalkPhase");graph.connect_node("SpeedBlend",1,"RunPhase")
    graph.connect_node("Blend",0,"Idle");graph.connect_node("Blend",1,"SpeedBlend");graph.connect_node("output",0,"Blend")
    tree.tree_root=graph;tree.callback_mode_process=AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL;tree.active=true
static func direction_for_yaw(world_yaw: float, view_yaw: float) -> int:
    return posmod(int(floor((world_yaw-view_yaw)/TAU*8.0+.5)),8)
func set_camera_yaw(value: float) -> void:camera_yaw=value
func set_preview_pose(direction: int, animation: String, frame: int) -> void:
    preview_direction=posmod(direction,8);preview_clip=animation;preview_frame=frame
func clear_preview_pose() -> void:preview_clip=""
func pose(time: float, gait: float, walking: bool, motion: Vector2, _pixelated: bool, effects: bool) -> void:
    if model==null:return
    pose_updates+=1
    for mat in toon_materials:
        mat.set_shader_parameter("entity_anchor",global_position)
        mat.set_shader_parameter("camera_yaw",camera_yaw)
    ink_material.set_shader_parameter("entity_anchor",global_position)
    var dt=clampf(time-previous_pose_time,0,.05) if previous_pose_time>=0 else 0.0;previous_pose_time=time
    if motion.length_squared()>.00001:last_yaw=atan2(motion.x,motion.y)
    displayed_yaw=lerp_angle(displayed_yaw,last_yaw,minf(1,dt*18.0)) if effects else last_yaw
    model.rotation.y=displayed_yaw-(camera_yaw if render_as_sprite else 0.0)
    var speed=motion.length()/maxf(dt,.001)/16.0
    var distance=motion.length()
    if distance<.000001 and gait>previous_gait:distance=(gait-previous_gait)/.20
    if walking:
        if not was_walking and stop_clock<0:walk_phase=.30
        stop_clock=-1.0
        var target_run=clampf((speed-1.3)/1.7,0,1)
        run_blend=move_toward(run_blend,target_run,dt/.15) if effects else target_run
        if distance<CYCLE_MAP_UNITS*3:walk_phase=fposmod(walk_phase+distance/lerpf(CYCLE_MAP_UNITS,25.6,run_blend),1)
        walk_blend=move_toward(walk_blend,1.0,dt/.12) if effects else 1.0
    else:
        if was_walking and effects:
            stop_clock=0.0;stop_from=walk_phase;stop_run=run_blend
            var neutral=lerpf(.30,.21,run_blend)
            stop_to=walk_phase+minf(fposmod(neutral-walk_phase,1.0),fposmod(neutral+.5-walk_phase,1.0))
        if stop_clock>=0 and effects:
            stop_clock+=dt;run_blend=stop_run
            walk_phase=fposmod(lerpf(stop_from,stop_to,smoothstep(0,.12,stop_clock)),1)
            walk_blend=1.0-smoothstep(.03,.18,stop_clock)
            if stop_clock>=.18:stop_clock=-1.0;walk_blend=0.0;run_blend=0.0
        else:walk_blend=0.0;run_blend=0.0
    previous_gait=gait;was_walking=walking
    if not preview_clip.is_empty():
        model.rotation.y=(0.0 if render_as_sprite else camera_yaw)+float(preview_direction)*TAU/8
        walk_blend=1.0 if preview_clip in ["walk","run"] else 0.0
        run_blend=1.0 if preview_clip=="run" else 0.0
        walk_phase=float(preview_frame)/24.0
    tree.set("parameters/Blend/blend_amount",walk_blend)
    tree.set("parameters/SpeedBlend/blend_amount",run_blend)
    tree.set("parameters/RunPhase/seek_request",walk_phase*animator.get_animation(animation_names["Run"]).length)
    var length=animator.get_animation(animation_names["Walk"]).length
    tree.set("parameters/WalkPhase/seek_request",walk_phase*length)
    tree.advance(dt if effects else 0)
    # Add coherent 3D anticipation after the shared locomotion pose is evaluated.
    var turn=wrapf(last_yaw-displayed_yaw,-PI,PI)
    if not preview_clip.is_empty():
        turn=(1.0 if preview_clip=="turn_right" else -1.0)*sin(PI*float(preview_frame)/3.0)*.28 if preview_clip.begins_with("turn") else 0.0
    if head_bone>=0:skeleton.set_bone_pose_rotation(head_bone,Quaternion(Vector3.UP,clampf(turn*.65,-.32,.32))*skeleton.get_bone_pose_rotation(head_bone))
    if spine_bone>=0:skeleton.set_bone_pose_rotation(spine_bone,Quaternion(Vector3.UP,clampf(turn*.24,-.12,.12))*skeleton.get_bone_pose_rotation(spine_bone))
    if shadow_material!=null:shadow_material.set_shader_parameter("entity_anchor",global_position)
func set_outfit(items: PackedStringArray) -> bool:
    var occupied={}
    for item in items:
        if not ITEM_SLOTS.has(item):return false
        for slot in ITEM_SLOTS[item]:
            if occupied.has(slot):return false
            occupied[slot]=item
    outfit=items.duplicate()
    for mat in body_coverage_materials:mat.set_shader_parameter("covered_by_garment","dress" in outfit or "skirt" in outfit)
    for key in item_meshes:item_meshes[key].visible=key in ["body","hair"] or key in outfit
    return true
