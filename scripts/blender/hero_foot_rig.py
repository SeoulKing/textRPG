"""Fit the game rig to the v12 boots before baking the movement clips."""

import bmesh
import bpy

ANKLE_HEIGHT = 0.100
BALL_Y = -0.090
BALL_Z = 0.034
SOLE_Z = 0.004
HEEL_Y = 0.051
TOE_CONTACT_Y = -0.132
TOE_TIP_Y = -0.168  # Front of the shaped outsole, in armature space.


def smooth_range(value, low, high):
    t = max(0.0, min(1.0, (value - low) / (high - low)))
    return t * t * (3.0 - 2.0 * t)


def prepare_feet(rig):
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    for side in ("L", "R"):
        foot = rig.data.edit_bones["Foot." + side]
        ankle = foot.head.copy()
        ankle.z = ANKLE_HEIGHT
        foot.parent.tail = ankle
        foot.head = ankle
        foot.tail = (ankle.x, BALL_Y, BALL_Z)
        toe = rig.data.edit_bones.new("Toe." + side)
        toe.parent = foot
        toe.use_connect = True
        toe.head = foot.tail
        toe.tail = (ankle.x, -0.162, BALL_Z)
    bpy.ops.object.mode_set(mode="OBJECT")

    for side in ("L", "R"):
        foot = "Foot." + side
        shin = "Shin." + side
        toe = "Toe." + side
        for part in ("Boot", "Boot sole"):
            obj = bpy.data.objects[f"{part} · {side}"]
            skin_boot(obj, rig, shin, foot, toe)
        for part in ("Cream boot cuff", "Trouser leg"):
            obj = bpy.data.objects[f"{part} · {side}"]
            # Only the cuff and lowest trouser rings were bound to the foot.
            old = obj.vertex_groups[foot]
            lower_leg = obj.vertex_groups.get(shin) or obj.vertex_groups.new(name=shin)
            indices = [v.index for v in obj.data.vertices if any(g.group == old.index for g in v.groups)]
            for i in indices:
                lower_leg.add([i], old.weight(i), "ADD")
            obj.vertex_groups.remove(old)


def skin_boot(obj, rig, shin, foot, toe):
    # The authored outsole has single full-length cap faces. Cut continuous
    # bands through the leather and sole so the bottom can flex at the ball.
    mesh = obj.data
    to_rig = rig.matrix_world.inverted() @ obj.matrix_world
    to_mesh = to_rig.inverted()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.transform(to_rig)
    for y in (BALL_Y - 0.016, BALL_Y, BALL_Y + 0.016):
        bmesh.ops.bisect_plane(bm, geom=[*bm.verts, *bm.edges, *bm.faces],
                               plane_co=(0, y, 0), plane_no=(0, 1, 0), dist=0.00001)
    bm.transform(to_mesh)
    bm.to_mesh(mesh)
    bm.free()

    shank_group = obj.vertex_groups.new(name=shin)
    toe_group = obj.vertex_groups.new(name=toe)
    foot_group = obj.vertex_groups[foot]
    for v in mesh.vertices:
        point = to_rig @ v.co
        # Give the toe box a shallow taper and a slight upward curve at its tip.
        # Shape both touching pieces together in their shared rest space.
        toe_box = smooth_range(-point.y, -BALL_Y, 0.143)
        point.y -= 0.024 * toe_box
        point.z += toe_box * (0.007 - 0.23 * (point.z - SOLE_Z))
        shaft_height = point.z - 0.85 * max(0.0, -point.y - 0.035)
        shank_weight = smooth_range(shaft_height, 0.076, 0.168)
        toe_weight = (1 - shank_weight) * smooth_range(-point.y, -BALL_Y - 0.016, -BALL_Y + 0.016)
        foot_weight = 1 - shank_weight - toe_weight
        v.co = to_mesh @ point
        foot_group.add([v.index], foot_weight, "REPLACE")
        if shank_weight:
            shank_group.add([v.index], shank_weight, "REPLACE")
        if toe_weight:
            toe_group.add([v.index], toe_weight, "REPLACE")
    mesh.update()

def stance_ankle_x(bones, side):
    hip = bones["Thigh." + side].head_local.x
    ankle = bones["Foot." + side].head_local.x
    return hip + (ankle - hip) * 0.25


def narrow_idle_stance(rig):
    """Narrow the standing legs without changing breathing or boot contact."""
    from mathutils import Quaternion
    from hero_gait import FORWARD, pose_leg

    animation = rig.animation_data
    original = animation.action
    original_frame = bpy.context.scene.frame_current
    action = bpy.data.actions.get("Idle")
    if action is None:
        return
    animation.action = action
    bones = rig.data.bones
    frames = range(int(action.frame_range[0]), int(action.frame_range[1]) + 1)
    # Sample the authored motion before writing any keys into its action.
    samples = []
    for frame in frames:
        bpy.context.scene.frame_set(frame)
        samples.append({bone.name: (bone.matrix.copy(), bone.matrix_basis.copy())
                        for bone in rig.pose.bones})
    previous = {}
    for frame, sample in zip(frames, samples):
        bpy.context.scene.frame_set(frame)
        for bone in rig.pose.bones:
            bone.matrix_basis = sample[bone.name][1]
        world = {name: matrices[0].copy() for name, matrices in sample.items()}

        def base(name):
            bone = bones[name]
            return world[bone.parent.name] @ bone.parent.matrix_local.inverted() @ bone.matrix_local

        def turn(name, rotation):
            parent = base(name)
            local = parent.to_quaternion().inverted() @ rotation @ bones[name].matrix_local.to_quaternion()
            if name in previous:
                local.make_compatible(previous[name])
            pose = rig.pose.bones[name]
            assert pose.rotation_mode == "QUATERNION", name
            pose.rotation_quaternion = local
            pose.keyframe_insert(data_path="rotation_quaternion", frame=frame, group=name)
            previous[name] = local.copy()
            world[name] = parent @ pose.matrix_basis

        for side in ("L", "R"):
            foot, toe = (name + "." + side for name in ("Foot", "Toe"))
            ankle = sample[foot][0].translation.copy()
            ankle.x += stance_ankle_x(bones, side) - bones[foot].head_local.x
            foot_rotation = sample[foot][0].to_quaternion() @ bones[foot].matrix_local.to_quaternion().inverted()
            toe_rotation = sample[toe][0].to_quaternion() @ bones[toe].matrix_local.to_quaternion().inverted()
            pose_leg(bones, side, ankle, foot_rotation, toe_rotation, base, turn, knee_direction=FORWARD)
    animation.action = original
    bpy.context.scene.frame_set(original_frame)
