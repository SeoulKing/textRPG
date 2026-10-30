extends SceneTree
const Actor=preload("res://scripts/heroine_blender.gd")
func _initialize() -> void:call_deferred("inspect")
func inspect() -> void:
    var actor=Actor.new();root.add_child(actor);await process_frame
    var skeleton: Skeleton3D=actor.model.find_children("*","Skeleton3D",true,false)[0]
    var names=[]
    for i in range(skeleton.get_bone_count()):names.append(skeleton.get_bone_name(i))
    var report={"bone_names":names,"items":actor.item_meshes.keys(),"animations":actor.animation_names.keys(),"max_leg_length_error":0.0,"pose_count":0,"ankle_samples":[]}
    for clip in ["walk","run"]:
        for d in range(8):
            for f in range(24):
                actor.set_preview_pose(d,clip,f);actor.pose(float(f)/24,0,true,Vector2.ZERO,true,false);skeleton.force_update_all_bone_transforms()
                for suffix in ["L","R"]:
                    var chain=[]
                    for stem in ["thigh","shin","foot"]:
                        for i in range(skeleton.get_bone_count()):
                            var name=skeleton.get_bone_name(i)
                            if str(name).begins_with(stem) and str(name).ends_with(suffix):chain.append(i);break
                    assert(chain.size()==3,"Imported humanoid limb missing")
                    var a=skeleton.get_bone_global_pose(chain[0]).origin;var b=skeleton.get_bone_global_pose(chain[1]).origin;var c=skeleton.get_bone_global_pose(chain[2]).origin
                    var err=maxf(absf(a.distance_to(b)-skeleton.get_bone_rest(chain[1]).origin.length()),absf(b.distance_to(c)-skeleton.get_bone_rest(chain[2]).origin.length()))
                    if d==0 and suffix=="L":report.ankle_samples.append([c.x,c.y,c.z])
                    report.max_leg_length_error=maxf(report.max_leg_length_error,err)
                    assert(err<.0001,"Imported animation changes leg length")
                report.pose_count+=1
    var extent=0.0
    var first=Vector3(report.ankle_samples[0][0],report.ankle_samples[0][1],report.ankle_samples[0][2])
    for sample in report.ankle_samples:extent=maxf(extent,first.distance_to(Vector3(sample[0],sample[1],sample[2])))
    assert(extent>.4,"Imported walk animation is not advancing")
    report.ankle_motion_extent=extent
    assert(actor.item_meshes.size()==8)
    for items in [PackedStringArray(["dress","shawl","boots-taupe"]),PackedStringArray(["dress","boots-navy"]),PackedStringArray(["blouse","skirt","shawl","boots-navy"])]:assert(actor.set_outfit(items))
    assert(not actor.set_outfit(PackedStringArray(["dress","blouse"])))
    var file=FileAccess.open("res://art/reference/heroine-v3-native-audit.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"  "));file.close()
    print("V3 native import audit: ",report.pose_count," poses / ",names.size()," bones / 8 item meshes; max length error ",report.max_leg_length_error)
    quit()
