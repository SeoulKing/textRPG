@tool
extends Node2D
## Native authoring rig. All surfaces share one Skeleton2D and AnimationPlayer.
const DIRS = ["s","se","e","ne","n","nw","w","sw"]
const LAYERS = ["body","boots-taupe","boots-navy","skirt","dress","blouse","shawl","hair","body-upper","arms-back","arms-front","arms-bare"]
const SOURCE = "res://art/source/heroine/skeletal/"
const REST = {
 "Hip":Vector2(48,74),"Spine":Vector2(48,54),"Neck":Vector2(48,43),"Head":Vector2(48,28),
 "ShoulderL":Vector2(32,53),"ElbowL":Vector2(27,65),"WristL":Vector2(24,77),
 "ShoulderR":Vector2(64,53),"ElbowR":Vector2(69,65),"WristR":Vector2(72,77),
 "ThighL":Vector2(44,75),"KneeL":Vector2(44,90),"AnkleL":Vector2(44,102),
 "ThighR":Vector2(53,75),"KneeR":Vector2(53,90),"AnkleR":Vector2(53,102),"Cloth":Vector2(48,80)}
const PARENTS = {"Hip":"","Spine":"Hip","Neck":"Spine","Head":"Neck","ShoulderL":"Spine","ElbowL":"ShoulderL","WristL":"ElbowL","ShoulderR":"Spine","ElbowR":"ShoulderR","WristR":"ElbowR","ThighL":"Hip","KneeL":"ThighL","AnkleL":"KneeL","ThighR":"Hip","KneeR":"ThighR","AnkleR":"KneeR","Cloth":"Hip"}
var skeleton: Skeleton2D
var player: AnimationPlayer
var bones: Dictionary = {}
var surfaces: Dictionary = {}
var upgraded = false
var arm_joint_cache: Dictionary = {}
var paths: Dictionary = {}
@export_range(0,7) var direction = 0
func build(d: int) -> void:
    direction=d
    skeleton=Skeleton2D.new();skeleton.name="Skeleton2D";add_child(skeleton)
    for key in REST:
        var bone=Bone2D.new();bone.name=key
        bone.set_autocalculate_length_and_angle(false);bone.length=8
        var parent=bones[PARENTS[key]] if PARENTS[key]!="" else skeleton
        parent.add_child(bone)
        bone.position=REST[key]-(REST[PARENTS[key]] if PARENTS[key]!="" else Vector2.ZERO)
        bone.rest=bone.transform
        bone.set_autocalculate_length_and_angle(false);bone.length=8
        bones[key]=bone;paths[key]=skeleton.get_path_to(bone)
    for layer in LAYERS:
        surfaces[layer]=[]
        if layer.begins_with("arms"):
            for side in ["left","right"]:
                if layer=="arms-bare" or arm_layer(side)==layer:add_arm_parts(layer,side)
        elif layer.begins_with("boots"):
            for side in ["left","right"]:
                add_surface(layer,"res://art/source/heroine/parts/"+layer+"-"+DIRS[d]+"-"+side+".png",side)
        elif layer in ["body","body-upper"]:
            add_surface(layer,SOURCE+layer+"-"+DIRS[d]+".png","")
            for side in ["left","right"]:add_surface(layer,SOURCE+"leg-"+DIRS[d]+"-"+side+".png",side)
        else: add_surface(layer,SOURCE+layer+"-"+DIRS[d]+".png","")
    player=AnimationPlayer.new();player.name="AnimationPlayer";add_child(player)
    var library=AnimationLibrary.new()
    for clip in ["idle","walk","stop_left","stop_right","turn_left","turn_right"]:
        library.add_animation(clip,make_animation(clip))
    player.add_animation_library("",library)
    add_joint_rotations()
    install_fixed_legs()
    install_arms()
    set_layer("original")
    for node in find_children("*","",true,false): node.owner=self
func weights(point: Vector2, layer: String, side: String) -> Dictionary:
    if layer.begins_with("arms"):
        var suffix="L" if side=="left" else "R"
        var joints=arm_points()[suffix];var elbow=float(joints[1][1]);var wrist=float(joints[2][1])
        if point.y<elbow-1:return {"Shoulder"+suffix:1.0}
        if point.y<elbow+1:
            var t=(point.y-elbow+1)/2.0;return {"Shoulder"+suffix:1-t,"Elbow"+suffix:t}
        if point.y<wrist:return {"Elbow"+suffix:1.0}
        return {"Wrist"+suffix:1.0}
    if layer=="hair":return {"Head":1.0}
    if layer.begins_with("boots"):return {"AnkleL" if side=="left" else "AnkleR":1.0}
    var x=point.x;var y=point.y
    if side!="" and layer in ["body","body-upper"]:
        var suffix="L" if side=="left" else "R"
        if y<88:return {"Thigh"+suffix:1.0}
        if y<92:
            var t=(y-88)/4.0;return {"Thigh"+suffix:1-t,"Knee"+suffix:t}
        if y<99:return {"Knee"+suffix:1.0}
        var t=clampf((y-99)/3.0,0,1);return {"Knee"+suffix:1-t,"Ankle"+suffix:t}
    if y<40:return {"Head":1.0}
    if y<48:
        var t=clampf((y-40)/8.0,0,1);return {"Head":1-t,"Neck":t}
    if layer in ["dress","skirt"] and y>65:
        var t=clampf((y-65)/14.0,0,1);return {"Spine":1-t,"Cloth":t}
    if y<78 and absf(x-48)>[15,12,8,10,15,10,8,12][direction]:
        var suffix="L" if x<48 else "R"
        var t=clampf((y-53)/12.0,0,1)
        if y<65:return {"Shoulder"+suffix:1-t,"Elbow"+suffix:t}
        t=clampf((y-65)/12.0,0,1);return {"Elbow"+suffix:1-t,"Wrist"+suffix:t}
    if y<75:
        var t=clampf((y-54)/21.0,0,1);return {"Spine":1-t,"Hip":t}
    var suffix="L" if x<49 else "R"
    if y<90:
        var t=clampf((y-75)/15.0,0,1);return {"Thigh"+suffix:1-t,"Knee"+suffix:t}
    var t=clampf((y-90)/8.0,0,1);return {"Knee"+suffix:1-t,"Ankle"+suffix:t}
func add_arm_parts(layer: String, side: String) -> void:
    for part in ["upper","fore","cuff","hand"]:
        add_surface(layer,SOURCE+("bare-arm-" if layer=="arms-bare" else "arm-")+part+"-"+DIRS[direction]+"-"+side+".png",side,part)

func add_surface(layer: String, file: String, side: String, part: String = "") -> void:
    var poly=Polygon2D.new();poly.name=layer.replace("-","_")+part+side
    if part!="":poly.set_meta("arm_part",part);poly.set_meta("arm_weight_revision",3)
    var source_file=SOURCE+"body-"+DIRS[direction]+".png" if layer=="body-upper" and side=="" else file
    var source_image=Image.load_from_file(ProjectSettings.globalize_path(source_file))
    if layer in ["body","body-upper"] and side=="":source_image.fill_rect(Rect2i(0,80,96,56),Color.TRANSPARENT)
    if layer=="body-upper":source_image.fill_rect(Rect2i(0,101,96,35),Color.TRANSPARENT)
    trim_old_arms(source_image,layer,side)
    poly.texture=ImageTexture.create_from_image(source_image)
    poly.texture_filter=CanvasItem.TEXTURE_FILTER_NEAREST
    var points=PackedVector2Array();var triangles:Array[PackedInt32Array]=[]
    if part!="":
        # Each painted cutout is rigid at its joint: no sleeve stretching.
        var rect=source_image.get_used_rect().grow(1)
        points=PackedVector2Array([Vector2(rect.position),Vector2(rect.end.x,rect.position.y),Vector2(rect.end),Vector2(rect.position.x,rect.end.y)])
        triangles=[PackedInt32Array([0,1,2]),PackedInt32Array([0,2,3])]
    else:
        for y in range(35):
            for x in range(25):points.append(Vector2(x*4,y*4))
        for y in range(34):
            for x in range(24):
                var i=y*25+x;triangles.append(PackedInt32Array([i,i+1,i+26]));triangles.append(PackedInt32Array([i,i+26,i+25]))
    poly.polygon=points;poly.uv=points;poly.polygons=triangles
    add_child(poly);poly.skeleton=poly.get_path_to(skeleton)
    for key in REST:
        var values=PackedFloat32Array()
        for point in points:
            if part!="":values.append(1.0 if key==("Shoulder" if part=="upper" else "Elbow" if part=="fore" else "Wrist")+("L" if side=="left" else "R") else 0.0)
            else:values.append(weights(point,layer,side).get(key,0.0))
        poly.add_bone(paths[key],values)
    normalize_mesh(poly)
    surfaces[layer].append(poly)
func foot(phase: float) -> Vector2:
    var u=fposmod(phase,1.0);var travel=0.0;var lift=0.0
    if u<.6:travel=24.0*(1.0-2.0*u/.6)
    else:
        var t=(u-.6)/.4
        travel=lerpf(-24.0,24.0,smoothstep(0.0,1.0,t));lift=5*sin(PI*t)
    var theta=direction*TAU/8.0
    return Vector2(sin(theta)*travel,cos(theta)*sqrt(.5)*travel-lift)
func offsets(phase: float, amount: float) -> Dictionary:
    var a=phase*TAU;var hip=Vector2(sin(a)*.6,-sin(a*2)*sin(a*2)*.7)*amount
    var result={}
    for key in REST:result[key]=hip
    result.Head=Vector2(sin(a-.2)*.2,hip.y*.25)
    result.Neck=hip*.5;result.Spine=Vector2(-hip.x*.45,hip.y*.7)
    result.Cloth=hip+Vector2(sin(a-.5)*1.1,0)*amount
    for side in ["L","R"]:
        var phase_offset=.5 if side=="L" else 0.0
        var f=foot(phase+phase_offset)*amount
        result["Thigh"+side]=hip
        result["Knee"+side]=hip.lerp(f,.48)+Vector2(0,-maxf(0.0,-f.y)*.10)
        result["Ankle"+side]=f
        var swing=-sin(a+phase_offset*TAU)*amount
        var axis=Vector2(sin(direction*TAU/8),cos(direction*TAU/8)*sqrt(.5))
        result["Shoulder"+side]=result.Spine
        result["Elbow"+side]=result.Spine+axis*swing*.8
        result["Wrist"+side]=result.Spine+axis*swing*1.6
    return result
func make_animation(clip: String) -> Animation:
    var anim=Animation.new()
    var count=24 if clip=="walk" else 4
    anim.length=20.0/24.0 if clip=="walk" else 2.0 if clip=="idle" else .16
    anim.loop_mode=Animation.LOOP_LINEAR if clip in ["walk","idle"] else Animation.LOOP_NONE
    for key in REST:
        var track=anim.add_track(Animation.TYPE_VALUE)
        anim.track_set_path(track,NodePath("Skeleton2D/"+str(paths[key])+":position"))
        anim.value_track_set_update_mode(track,Animation.UPDATE_CONTINUOUS)
        for f in range(count+1):
            var t=float(f)/count
            var phase=t if clip=="walk" else .3 if clip=="stop_left" else .8 if clip=="stop_right" else t
            var amount=1.0 if clip=="walk" else 1.0-smoothstep(0.0,1.0,t) if clip.begins_with("stop") else 0.0
            var delta=offsets(phase,amount)
            if clip.begins_with("turn"):
                var sign_value=1.0 if clip=="turn_right" else -1.0
                delta.Head=Vector2(sign_value*sin(PI*t)*1.0,0)
                delta.Spine=Vector2(sign_value*sin(PI*t)*.5,0)
                delta.Neck=delta.Head*.5
            var parent_key=PARENTS[key]
            var rest=REST[key]-(REST[parent_key] if parent_key!="" else Vector2.ZERO)
            var position=rest+delta[key]-(delta[parent_key] if parent_key!="" else Vector2.ZERO)
            anim.track_insert_key(track,t*anim.length,position)
    return anim
func seek_pose(clip: String, frame: int) -> void:
    player.play(clip)
    var count=24 if clip=="walk" else 4
    var anim=player.get_animation(clip)
    player.seek(float(frame)/float(count if clip in ["idle","walk"] else count-1)*anim.length,true)
    player.pause()
func set_layer(layer: String) -> void:
    for key in surfaces:
        for poly in surfaces[key]:poly.visible=key==layer or (layer=="original" and key in ["body","boots-taupe","dress","shawl","hair","arms-front","arms-back"])

func adopt_scene(d: int) -> void:
    direction=d;skeleton=get_node("Skeleton2D");player=get_node("AnimationPlayer")
    if get_meta("arm_art_revision",0)!=3:
        # Replace only generated arm surfaces; keep authored body and clips.
        for child in get_children():
            if child is Polygon2D and str(child.name).begins_with("arms_"):
                remove_child(child);child.free()
        set_meta("arm_art_revision",3);upgraded=true
    if not has_meta("arm_trim_revision"):
        set_meta("arm_trim_revision",1);upgraded=true
    for key in REST:
        var bone=skeleton.find_child(key,true,false);bones[key]=bone;paths[key]=skeleton.get_path_to(bone)
    for layer in ["arms-back","arms-front","arms-bare"]:
        if not get_node_or_null(layer.replace("-","_")+"upperleft") and not get_node_or_null(layer.replace("-","_")+"upperright"):
            surfaces[layer]=[]
            for side in ["left","right"]:
                if layer=="arms-bare" or arm_layer(side)==layer:add_arm_parts(layer,side)
            upgraded=true
    for node in find_children("*","",true,false):node.owner=self
    for layer in LAYERS:
        surfaces[layer]=[]
        for child in get_children():
            if child is Polygon2D and str(child.name).begins_with(layer.replace("-","_")):
                if layer=="body" and str(child.name).begins_with("body_upper"):continue
                normalize_mesh(child)
                surfaces[layer].append(child)
                var side="left" if str(child.name).ends_with("left") else "right" if str(child.name).ends_with("right") else ""
                if not child.has_meta("arm_weight_revision") or (side!="" and layer in ["body","body-upper"] and not child.has_meta("fixed_leg_weights")):
                    var b=0
                    for key in REST:
                        var values=PackedFloat32Array()
                        for point in child.polygon:values.append(weights(point,layer,side).get(key,0.0))
                        child.set_bone_weights(b,values);b+=1
                    child.set_meta("arm_weight_revision",1);child.set_meta("fixed_leg_weights",1);upgraded=true
                var file=SOURCE+layer+"-"+DIRS[d]+".png"
                if side!="":
                    file=SOURCE+"leg-"+DIRS[d]+"-"+side+".png" if layer in ["body","body-upper"] else "res://art/source/heroine/parts/"+layer+"-"+DIRS[d]+"-"+side+".png"
                if layer.begins_with("arms"):file=SOURCE+("bare-arm-" if layer=="arms-bare" else "arm-")+str(child.get_meta("arm_part","upper"))+"-"+DIRS[d]+"-"+side+".png"
                if layer=="body-upper" and side=="":file=SOURCE+"body-"+DIRS[d]+".png"
                var image=Image.load_from_file(ProjectSettings.globalize_path(file))
                if layer in ["body","body-upper"] and side=="":image.fill_rect(Rect2i(0,80,96,56),Color.TRANSPARENT)
                if layer=="body-upper":image.fill_rect(Rect2i(0,101,96,35),Color.TRANSPARENT)
                trim_old_arms(image,layer,side)
                child.texture=ImageTexture.create_from_image(image)
    add_joint_rotations()
    install_fixed_legs()
    install_arms()
    set_layer("original")

func add_joint_rotations() -> void:
    for clip in ["idle","walk","stop_left","stop_right","turn_left","turn_right"]:
        var anim=player.get_animation(clip)
        if anim.has_meta("joint_rotation_revision"):continue
        var count=24 if clip=="walk" else 4
        for key in ["Head","AnkleL","AnkleR"]:
            var path="Skeleton2D/Hip/Spine/Neck/Head" if key=="Head" else "Skeleton2D/Hip/ThighL/KneeL/AnkleL" if key=="AnkleL" else "Skeleton2D/Hip/ThighR/KneeR/AnkleR"
            var track=anim.add_track(Animation.TYPE_VALUE)
            anim.track_set_path(track,NodePath(path+":rotation"))
            for f in range(count+1):
                var t=float(f)/count
                var phase=t if clip=="walk" else .3 if clip=="stop_left" else .8
                var amount=1.0 if clip=="walk" else 1.0-smoothstep(0.0,1.0,t) if clip.begins_with("stop") else 0.0
                var angle=0.0
                if key=="Head":angle=sin(phase*TAU-.3)*.012*amount
                else:
                    var u=fposmod(phase+(.5 if key=="AnkleL" else 0.0),1.0)
                    var toe=maxf(0.0,(u-.4)/.2)*.055 if u<.6 else -sin((u-.6)/.4*PI)*.055
                    angle=toe*amount*(1.0 if direction in [1,2,3] else -1.0 if direction in [5,6,7] else .35)
                anim.track_insert_key(track,t*anim.length,angle)
        anim.set_meta("joint_rotation_revision",1)
        upgraded=true

func normalize_mesh(poly: Polygon2D) -> void:
    if poly.internal_vertex_count>0 or poly.polygon.size()!=875:return
    var order=PackedInt32Array()
    for x in range(25):order.append(x)
    for y in range(1,35):order.append(y*25+24)
    for x in range(23,-1,-1):order.append(34*25+x)
    for y in range(33,0,-1):order.append(y*25)
    for y in range(1,34):
        for x in range(1,24):order.append(y*25+x)
    var remap={};var points=PackedVector2Array();var uv=PackedVector2Array()
    for i in range(order.size()):
        remap[order[i]]=i;points.append(poly.polygon[order[i]]);uv.append(poly.uv[order[i]])
    var triangles:Array[PackedInt32Array]=[]
    for triangle in poly.polygons:
        var mapped=PackedInt32Array()
        for index in triangle:mapped.append(remap[index])
        triangles.append(mapped)
    for b in range(poly.get_bone_count()):
        var original=poly.get_bone_weights(b);var values=PackedFloat32Array()
        for index in order:values.append(original[index])
        poly.set_bone_weights(b,values)
    poly.polygon=points;poly.uv=uv;poly.polygons=triangles;poly.internal_vertex_count=759

func install_fixed_legs() -> void:
    for side in ["L","R"]:
        var thigh=get_node("Skeleton2D/Hip/Thigh"+side)
        var knee=thigh.get_node("Knee"+side)
        thigh.length=15;knee.length=12
    for clip in player.get_animation_list():
        var anim=player.get_animation(clip)
        if anim.has_meta("fixed_leg_revision"):continue
        var count=24 if clip=="walk" else 4
        for side in ["L","R"]:
            var prefix="Skeleton2D/Hip/Thigh"+side
            var knee_path=prefix+"/Knee"+side
            var ankle_path=knee_path+"/Ankle"+side
            for path in [prefix,knee_path,ankle_path]:
                for property in ["position","rotation","scale"]:
                    var track=anim.find_track(NodePath(path+":"+property),Animation.TYPE_VALUE)
                    if track>=0:anim.remove_track(track)
            for key in ["Thigh","Knee","Ankle"]:
                var path=prefix if key=="Thigh" else knee_path if key=="Knee" else ankle_path
                var pos_track=anim.add_track(Animation.TYPE_VALUE);anim.track_set_path(pos_track,NodePath(path+":position"))
                var local_position=Vector2(-4 if side=="L" else 5,1) if key=="Thigh" else Vector2(0,15 if key=="Knee" else 12)
                anim.track_insert_key(pos_track,0.0,local_position)
                var scale_track=anim.add_track(Animation.TYPE_VALUE);anim.track_set_path(scale_track,NodePath(path+":scale"));anim.track_insert_key(scale_track,0.0,Vector2.ONE)
                var angle_track=anim.add_track(Animation.TYPE_VALUE);anim.track_set_path(angle_track,NodePath(path+":rotation"))
                for f in range(count+1):
                    var t=float(f)/count
                    var phase=t if clip=="walk" else .3 if clip=="stop_left" else .8
                    var amount=1.0 if clip=="walk" else 1.0-smoothstep(0.0,1.0,t) if str(clip).begins_with("stop") else 0.0
                    var angles=leg_angles(phase,amount,side)
                    var angle=angles[0] if key=="Thigh" else angles[1] if key=="Knee" else -angles[0]-angles[1]
                    anim.track_insert_key(angle_track,t*anim.length,angle)
        anim.set_meta("fixed_leg_revision",1);upgraded=true
func leg_angles(phase: float, amount: float, side: String) -> Vector2:
    if amount<=.00001:return Vector2.ZERO
    var p=phase+(.5 if side=="L" else 0.0)
    var hip=REST["Thigh"+side]+offsets(phase,amount).Hip
    var f=foot(p)*Vector2(.55,.30)*amount
    var target=REST["Ankle"+side]+f
    var vector=target-hip
    var distance=clampf(vector.length(),3.02,26.98)
    target=hip+vector.normalized()*distance
    var bend=1.0 if direction in [1,2,3] else -1.0 if direction in [5,6,7] else -1.0 if side=="L" else 1.0
    var alpha=vector.angle()-PI*.5-bend*acos(clampf((distance*distance+225.0-144.0)/(30.0*distance),-1,1))
    var knee=hip+Vector2.DOWN.rotated(alpha)*15.0
    var beta=(target-knee).angle()-PI*.5-alpha
    return Vector2(alpha,beta)

func arm_points() -> Dictionary:
    if arm_joint_cache.is_empty():arm_joint_cache=JSON.parse_string(FileAccess.get_file_as_string(SOURCE+"arm-joints.json"))[DIRS[direction]]
    return arm_joint_cache
func arm_layer(side: String) -> String:
    if direction in [1,2,3]:return "arms-front" if side=="left" else "arms-back"
    if direction in [5,6,7]:return "arms-front" if side=="right" else "arms-back"
    return "arms-front"
func install_arms() -> void:
    var joints=arm_points()
    for side in ["L","R"]:
        var parent_point=REST.Spine
        for i in range(3):
            var key=["Shoulder","Elbow","Wrist"][i]+side
            var bone=skeleton.find_child(key,true,false)
            var point=Vector2(joints[side][i][0],joints[side][i][1])
            bone.rest=Transform2D(0,point-parent_point);bone.position=point-parent_point;bone.rotation=0;parent_point=point
    for clip in player.get_animation_list():
        var anim=player.get_animation(clip)
        if anim.get_meta("visible_arm_revision",0)==3:continue
        var count=24 if clip=="walk" else 4
        for side in ["L","R"]:
            var path="Skeleton2D/Hip/Spine"
            var parent_point=REST.Spine
            for i in range(3):
                path+="/"+["Shoulder","Elbow","Wrist"][i]+side
                for property in ["position","rotation","scale"]:
                    var old=anim.find_track(NodePath(path+":"+property),Animation.TYPE_VALUE)
                    if old>=0:anim.remove_track(old)
                var point=Vector2(joints[side][i][0],joints[side][i][1])
                var track=anim.add_track(Animation.TYPE_VALUE);anim.track_set_path(track,NodePath(path+":position"));anim.track_insert_key(track,0.0,point-parent_point);parent_point=point
                track=anim.add_track(Animation.TYPE_VALUE);anim.track_set_path(track,NodePath(path+":scale"));anim.track_insert_key(track,0.0,Vector2.ONE)
                track=anim.add_track(Animation.TYPE_VALUE);anim.track_set_path(track,NodePath(path+":rotation"))
                for f in range(count+1):
                    var t=float(f)/count;var phase=t if clip=="walk" else .3 if clip=="stop_left" else .8
                    var amount=1.0 if clip=="walk" else 1.0-smoothstep(0.0,1.0,t) if str(clip).begins_with("stop") else 0.0
                    var swing=sin(phase*TAU+(PI if side=="L" else 0.0))*amount
                    anim.track_insert_key(track,t*anim.length,swing*(.20 if direction in [1,2,3,5,6,7] else .045) if i==0 else -.035-absf(swing)*.065 if i==1 else swing*.025)
        anim.set_meta("visible_arm_revision",3);upgraded=true
    for layer in surfaces:
        var priority=-1 if layer=="arms-back" else 3 if layer=="arms-front" else 4 if layer=="shawl" else 5 if layer=="hair" else 2 if layer in ["dress","skirt","blouse"] else 0
        for poly in surfaces[layer]:poly.z_index=priority

func trim_old_arms(image: Image, layer: String, side: String) -> void:
    if layer not in ["body","body-upper","dress","blouse"] or side!="":return
    var bounds=Vector2i(37,60)
    if direction==2:bounds=Vector2i(44,58)
    elif direction==6:bounds=Vector2i(38,52)
    elif direction in [1,3,5,7]:bounds=Vector2i(38,59)
    var bottom=80 if layer in ["body","body-upper"] else 69
    image.fill_rect(Rect2i(0,53,bounds.x,bottom-53),Color.TRANSPARENT)
    image.fill_rect(Rect2i(bounds.y,53,96-bounds.y,bottom-53),Color.TRANSPARENT)

    if layer=="dress":
        # Keep the A-line skirt, remove the old sleeve/hand wings beside the waist.
        for y in range(69,80):
            var half_width=10.0+(y-64)*.7
            var left=int(48-half_width);var right=int(48+half_width)
            image.fill_rect(Rect2i(0,y,left,1),Color.TRANSPARENT)
            image.fill_rect(Rect2i(right,y,96-right,1),Color.TRANSPARENT)
    elif layer=="blouse":
        image.fill_rect(Rect2i(0,69,bounds.x,11),Color.TRANSPARENT)
        image.fill_rect(Rect2i(bounds.y,69,96-bounds.y,11),Color.TRANSPARENT)
