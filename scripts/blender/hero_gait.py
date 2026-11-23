"""Bake distance-driven gait poses onto the v12 rig in armature space."""

from math import atan2, cos, hypot, radians, sqrt

import bpy
from mathutils import Matrix, Quaternion, Vector

from hero_foot_rig import BALL_Y, BALL_Z, HEEL_Y, SOLE_Z, TOE_CONTACT_Y, TOE_TIP_Y

RIGHT = Vector((1, 0, 0))
FORWARD = Vector((0, -1, 0))
UP = Vector((0, 0, 1))


def ease(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def rolled_ankle(rest, backward, clearance, tilt, toe_bend=0.0):
    rotation = Quaternion(RIGHT, radians(tilt))
    toe_rotation = Quaternion(RIGHT, radians(tilt - toe_bend))
    ankle = rest + Vector((0, backward, clearance))
    if tilt <= 0:
        heel = Vector((0, HEEL_Y - rest.y, SOLE_Z - rest.z))
        ankle += heel - rotation @ heel
    else:
        # Hold the sole against the floor as the heel rises about the ball.
        ankle_to_ball = Vector((0, BALL_Y - rest.y, BALL_Z - rest.z))
        ball_to_sole = Vector((0, TOE_CONTACT_Y - BALL_Y, SOLE_Z - BALL_Z))
        ankle += ankle_to_ball - rotation @ ankle_to_ball + ball_to_sole - toe_rotation @ ball_to_sole
    return ankle, rotation, toe_rotation


def swinging_ankle(rest, backward, swing, push, toe_at_release, landing):
    # Connect the last toe contact to the next heel contact. In between, carry
    # the ankle through space independently of the boot's changing orientation.
    lift, push_rotation, toe_rotation = rolled_ankle(rest, 0, 0, push, push - toe_at_release)
    strike, heel_rotation, _ = rolled_ankle(rest, 0, 0, landing)
    ankle = rest + Vector((0, backward, 0))
    ankle += (lift - rest) * (1 - ease(swing / 0.42))
    ankle += (strike - rest) * ease((swing - 0.66) / 0.34)
    # Lift before the toes unfold. Even at its steepest pitch the front edge
    # of the v12 outsole must be able to pass beneath the ankle in free swing.
    sole_radius = hypot(rest.y - TOE_TIP_Y, rest.z - SOLE_Z)
    lift_weight = ease(swing / 0.19) * (1 - ease((swing - 0.43) / 0.37))
    ankle.z += (SOLE_Z + sole_radius + 0.012 - ankle.z) * lift_weight
    heel_weight = ease((swing - 0.58) / 0.32)
    return ankle, push_rotation.slerp(heel_rotation, heel_weight), toe_rotation.slerp(heel_rotation, heel_weight)


def vertical_leg_span(bones, side, hip, ankle, knee_degrees):
    thigh, shin = bones["Thigh." + side].length, bones["Shin." + side].length
    reach_sq = thigh * thigh + shin * shin + 2 * thigh * shin * cos(radians(knee_degrees))
    return sqrt(max(0.0, reach_sq - (hip.x - ankle.x) ** 2 - (hip.y - ankle.y) ** 2))


def pose_leg(bones, side, ankle, foot_rotation, toe_rotation, base, turn, swing=0.0, knee_direction=FORWARD):
    thigh, shin, foot = (part + "." + side for part in ("Thigh", "Shin", "Foot"))
    hip = base(thigh).translation
    axis = (ankle - hip).normalized()
    a, b = bones[thigh].length, bones[shin].length
    distance = min((ankle - hip).length, a + b - 0.00001)
    along = (a * a - b * b + distance * distance) / (2 * distance)
    pole = (knee_direction - axis * knee_direction.dot(axis)).normalized()
    if pole.dot(FORWARD) < 0.35:
        pole = (FORWARD - axis * FORWARD.dot(axis)).normalized()
    knee = hip + axis * along + pole * sqrt(max(0, a * a - along * along))
    end_ankle = hip + axis * distance
    for name, start, end in ((thigh, hip, knee), (shin, knee, end_ankle)):
        rest_axis = (bones[name].tail_local - bones[name].head_local).normalized()
        turn(name, rest_axis.rotation_difference((end - start).normalized()))
    if swing > 0:
        # Once unloaded, let the sole turn with the lower leg. Relax the
        # push-off plantarflexion as the knee extends, then prepare the heel.
        shank = end_ankle - knee
        plantarflexion = radians(12) * (1 - ease((swing - 0.12) / 0.40))
        carried = Quaternion(RIGHT, atan2(shank.y, -shank.z) + plantarflexion)
        follow = ease(swing / 0.23) * (1 - ease((swing - 0.62) / 0.28))
        foot_rotation = foot_rotation.slerp(carried, follow)
        toe_rotation = toe_rotation.slerp(carried, follow)
    turn(foot, foot_rotation)
    turn("Toe." + side, toe_rotation)


def bake_cycle(rig, name, intervals, pose_frame):
    animation = rig.animation_data
    original = animation.action
    original_poses = {bone.name: bone.matrix_basis.copy() for bone in rig.pose.bones}
    # Re-key the authored channels in Walk, preserving its arm swing and hair tracks.
    action = bpy.data.actions.get(name) or bpy.data.actions.new(name)
    action.use_fake_user = True
    animation.action = action
    for bone in rig.pose.bones:
        bone.matrix_basis = Matrix.Identity(4)

    bones = rig.data.bones
    previous = {}
    for frame in range(intervals + 1):
        world = {"Root": bones["Root"].matrix_local.copy()}

        def base(name):
            bone = bones[name]
            return world[bone.parent.name] @ bone.parent.matrix_local.inverted() @ bone.matrix_local

        def turn(name, rotation, offset=None):
            parent = base(name)
            local = parent.to_quaternion().inverted() @ rotation @ bones[name].matrix_local.to_quaternion()
            bone = rig.pose.bones[name]
            if bone.rotation_mode == "QUATERNION":
                if name in previous:
                    local.make_compatible(previous[name])
                bone.rotation_quaternion = local
                rotation_path = "rotation_quaternion"
                previous[name] = local.copy()
            else:
                euler = local.to_euler(bone.rotation_mode, previous[name]) if name in previous else local.to_euler(bone.rotation_mode)
                bone.rotation_euler = euler
                rotation_path = "rotation_euler"
                previous[name] = euler.copy()
            bone.keyframe_insert(data_path=rotation_path, frame=frame + 1, group=name)
            if offset is not None:
                bone.location = parent.to_3x3().inverted() @ offset
                bone.keyframe_insert(data_path="location", frame=frame + 1, group=name)
            world[name] = parent @ bone.matrix_basis

        pose_frame(frame / intervals, base, turn)

    animation.action = original
    for bone in rig.pose.bones:
        bone.matrix_basis = original_poses[bone.name]
    bpy.context.scene.frame_set(1)
