extends SceneTree
const Rig=preload("res://scripts/heroine_skeleton.gd")
func _initialize() -> void:call_deferred("inspect_rigs")
func inspect_rigs() -> void:
    var report={"skeletons":[],"pose_count":0,"foot_positions":{},"foot_angles":{},"fixed_leg_lengths":[15,12],"max_length_error":0.0}
    for d in range(8):
        var rig=load(Rig.SOURCE+"scenes/rig-"+Rig.DIRS[d]+".tscn").instantiate()
        root.add_child(rig);rig.adopt_scene(d)
        await process_frame
        assert(rig.skeleton.get_bone_count()==17)
        var polygons=0
        for layer in rig.surfaces:
            for poly in rig.surfaces[layer]:
                polygons+=1
                assert(poly.get_bone_count()==17)
                for v in range(poly.polygon.size()):
                    var total=0.0
                    for b in range(poly.get_bone_count()):total+=poly.get_bone_weights(b)[v]
                    assert(absf(total-1.0)<.0001)
        for f in range(44):
            var clip="idle" if f<4 else "walk" if f<28 else "stop_left" if f<32 else "stop_right" if f<36 else "turn_left" if f<40 else "turn_right"
            var cf=f if f<4 else f-4 if f<28 else f%4
            rig.seek_pose(clip,cf)
            report.pose_count+=1
            for side in ["L","R"]:
                var thigh=rig.get_node("Skeleton2D/Hip/Thigh"+side)
                var knee=thigh.get_node("Knee"+side)
                var ankle=knee.get_node("Ankle"+side)
                var error=maxf(absf(thigh.global_position.distance_to(knee.global_position)-15.0),absf(knee.global_position.distance_to(ankle.global_position)-12.0))
                report.max_length_error=maxf(report.max_length_error,error)
                assert(error<.0001,"Variable leg length")
                assert(thigh.scale.is_equal_approx(Vector2.ONE) and knee.scale.is_equal_approx(Vector2.ONE) and ankle.scale.is_equal_approx(Vector2.ONE))
            var joints=rig.arm_points()
            for side in ["L","R"]:
                var shoulder=rig.skeleton.find_child("Shoulder"+side,true,false)
                var elbow=shoulder.get_node("Elbow"+side)
                var wrist=elbow.get_node("Wrist"+side)
                var a=Vector2(joints[side][0][0],joints[side][0][1])
                var b=Vector2(joints[side][1][0],joints[side][1][1])
                var c=Vector2(joints[side][2][0],joints[side][2][1])
                assert(absf(shoulder.global_position.distance_to(elbow.global_position)-a.distance_to(b))<.0001)
                assert(absf(elbow.global_position.distance_to(wrist.global_position)-b.distance_to(c))<.0001)
            assert(rig.surfaces["arms-front"].size()+rig.surfaces["arms-back"].size()==8)
            for layer in ["arms-front","arms-back","arms-bare"]:
                for poly in rig.surfaces[layer]:
                    assert(poly.has_meta("arm_part"))
                    var active=0
                    for b in range(poly.get_bone_count()):
                        if poly.get_bone_weights(b)[0]>0:active+=1
                    assert(active==1,"Arm cutout must be rigidly bound to one joint")
            for variant in ["boots-taupe","boots-navy"]:
                assert(rig.surfaces[variant].size()==2)
                for index in range(2):
                    var poly=rig.surfaces[variant][index]
                    var owners=[]
                    for b in range(poly.get_bone_count()):
                        var total=0.0
                        for weight in poly.get_bone_weights(b):total+=weight
                        if total>0:owners.append(str(poly.get_bone_path(b)))
                    assert(owners.size()==1 and owners[0].ends_with("Ankle"+("L" if index==0 else "R")))
            if clip=="walk":
                var left=rig.get_node("Skeleton2D/Hip/ThighL/KneeL/AnkleL").global_position-Rig.REST.AnkleL
                var right=rig.get_node("Skeleton2D/Hip/ThighR/KneeR/AnkleR").global_position-Rig.REST.AnkleR
                report.foot_positions[str(d)+"/"+str(cf)]=[[left.x,left.y],[right.x,right.y]]
                report.foot_angles[str(d)+"/"+str(cf)]=[rig.get_node("Skeleton2D/Hip/ThighL/KneeL/AnkleL").global_rotation,rig.get_node("Skeleton2D/Hip/ThighR/KneeR/AnkleR").global_rotation]
        report.skeletons.append({"direction":Rig.DIRS[d],"bones":rig.skeleton.get_bone_count(),"weighted_polygons":polygons,"normalized_weights":true})
        rig.free()
    var file=FileAccess.open("res://art/reference/natural-walk/native-rig-audit.json",FileAccess.WRITE)
    file.store_string(JSON.stringify(report,"  "));file.close()
    print("Native rig audit: "+str(report.pose_count)+" poses / 8 skeletons / normalized weights")
    quit()
