"""Fit ACCAD's captured walk and run to the in-place v12 gameplay rig."""

from math import atan2, degrees, pi, radians, sin
from pathlib import Path
from statistics import mean

import bpy
from mathutils import Quaternion, Vector

from hero_foot_rig import BALL_Y, BALL_Z, HEEL_Y, SOLE_Z, TOE_TIP_Y, stance_ankle_x
from hero_gait import FORWARD, RIGHT, UP, bake_cycle, ease, pose_leg, rolled_ankle, vertical_leg_span


SOURCE = Path(__file__).resolve().parents[2] / "art-studies/characters/arcana-hero-pixel3d/mocap"
SIDES = ("L", "R")
LIMB_JOINTS = {
    "Shoulder": "Arm", "Elbow": "ForeArm", "Wrist": "Hand", "Hip": "UpLeg",
    "Knee": "Leg", "Ankle": "Foot", "Ball": "ToeBase", "Tip": "ToeBase",
}


def read_cycle(filename, contacts, intervals):
    scene = bpy.context.scene
    bpy.ops.import_anim.bvh(filepath=str(SOURCE / filename), global_scale=0.01,
                            axis_forward="-Z", axis_up="Y")
    source_rig = bpy.context.object
    action = source_rig.animation_data.action
    joints = source_rig.pose.bones
    first, opposite, last = contacts

    def set_frame(frame):
        scene.frame_set(int(frame), subframe=frame % 1)

    set_frame(first)
    origin = joints["Hips"].head.copy()
    set_frame(last)
    travel = joints["Hips"].head - origin
    travel.z = 0
    stride = travel.length
    forward = travel.normalized()
    lateral = forward.cross(UP)
    if (joints["RightUpLeg"].head - joints["LeftUpLeg"].head).dot(lateral) < 0:
        lateral.negate()
    body = ("Hips", "Spine1", "Neck", "Head")
    labels = {name: (name, False) for name in body}
    for side, prefix in zip(SIDES, ("Left", "Right")):
        for name, source in LIMB_JOINTS.items():
            labels[name + side] = (prefix + source, name == "Tip")

    samples = []
    half = intervals // 2
    for index in range(intervals):
        frame = first + (opposite - first) * index / half if index < half else (
            opposite + (last - opposite) * (index - half) / half
        )
        set_frame(frame)
        hip = joints["Hips"].head
        points = {}
        for name, (bone, use_tail) in labels.items():
            point = joints[bone].tail if use_tail else joints[bone].head
            delta = point - hip
            points[name] = Vector((delta.dot(lateral), -delta.dot(forward), point.z))
        samples.append(points)

    bpy.data.objects.remove(source_rig, do_unlink=True)
    bpy.data.actions.remove(action)

    # Pair corresponding steps and average the left/right takes. This aligns
    # both contacts across the two clips and prevents a gait seam or heading drift.
    mirrored = {}
    for name in labels:
        mirrored[name] = name[:-1] + ("R" if name[-1] == "L" else "L") if name not in body else name
    balanced = []
    mirror = Vector((-1, 1, 1))
    for index, sample in enumerate(samples):
        other = samples[(index + half) % intervals]
        balanced.append({name: (point + mirror * other[mirrored[name]]) / 2 for name, point in sample.items()})
    return [
        {name: sample[name] * 0.76 + (balanced[index - 1][name] + balanced[(index + 1) % intervals][name]) * 0.12
         for name in labels}
        for index, sample in enumerate(balanced)
    ], stride


def shaft_pitch(vector):
    return degrees(atan2(-vector.z, -vector.y))


def aim_bone(bones, turn, name, direction):
    axis = bones[name].tail_local - bones[name].head_local
    turn(name, axis.normalized().rotation_difference(direction.normalized()))


def outsole_floor(rest, foot_rotation, toe_rotation):
    heel = Vector((0, HEEL_Y - rest.y, SOLE_Z - rest.z))
    ball = Vector((0, BALL_Y - rest.y, BALL_Z - rest.z))
    toe = Vector((0, TOE_TIP_Y - BALL_Y, SOLE_Z - BALL_Z))
    rotated_ball = foot_rotation @ ball
    return SOLE_Z - min((foot_rotation @ heel).z, rotated_ball.z + (toe_rotation @ toe).z,
                        rotated_ball.z + SOLE_Z - BALL_Z)


def bake_capture(rig, name, filename, contacts, intervals, support_keys, stride):
    samples, captured_stride = read_cycle(filename, contacts, intervals)
    bones = rig.data.bones
    running = name == "Run"
    support = support_keys / intervals
    stride_scale = stride / captured_stride
    flat_start, flat_end = (1, 4) if running else (6, 15)
    flat_samples = samples[flat_start:flat_end]
    flat_z = mean(p["AnkleL"].z for p in flat_samples)
    flat_x = mean(p["AnkleL"].x for p in flat_samples)
    flat_pitch = mean(shaft_pitch(p["BallL"] - p["AnkleL"]) for p in flat_samples)
    mean_hip = mean(p["Hips"].z for p in samples)
    hip_rest = bones["Hips"].head_local

    def foot_pitch(points, side, phase):
        raw_pitch = shaft_pitch(points["Ball" + side] - points["Ankle" + side])
        pitch = min(102 if running else 67, max(-16, raw_pitch - flat_pitch))
        if running:
            # The athlete lands on the midfoot. Ease through the small marker
            # jump near impact before letting the captured ankle roll freely.
            pitch *= ease(min(phase, 1 - phase) / 0.09)
        return pitch

    release_toe_pitch = 12 if running else 8
    release_bend = max(0.0, foot_pitch(samples[support_keys], "L", support) - release_toe_pitch)

    def foot_angles(points, side, phase):
        pitch = foot_pitch(points, side, phase)
        if phase <= support:
            toe_pitch = release_toe_pitch * ease((phase - support + 0.12) / 0.12)
            return pitch, max(0.0, pitch - toe_pitch)
        swing = (phase - support) / (1 - support)
        raw_pitch = shaft_pitch(points["Ball" + side] - points["Ankle" + side])
        raw_toe = shaft_pitch(points["Tip" + side] - points["Ball" + side])
        bend = min(28, max(0, raw_pitch - raw_toe - 10))
        bend = release_bend + (bend - release_bend) * ease(swing / 0.22)
        return pitch, bend * (1 - ease((swing - 0.80) / 0.20))

    def plant(rest, phase, pitch, bend, center):
        ankle, foot, toes = rolled_ankle(rest, center + stride * phase, 0, pitch, bend)
        ankle.z = max(ankle.z, outsole_floor(rest, foot, toes))
        return ankle, foot, toes

    def in_air(rest, point, side):
        x = point.x if side == "L" else -point.x
        # Allow weight transfer during swing without tracing an outward arc.
        x_offset = max(-0.010, min(0.010, (x - flat_x) * 0.22))
        # Shorter v12 legs need less vertical heel travel from the sprint capture.
        return rest + Vector((x_offset if side == "L" else -x_offset, point.y * stride_scale,
                              (point.z - flat_z) * (0.53 if running else 0.73)))

    def foot_pose(points, side, phase):
        rest = bones["Foot." + side].head_local.copy()
        rest.x = stance_ankle_x(bones, side)
        heel = samples[0 if side == "L" else intervals // 2]
        release = samples[(support_keys + (intervals // 2 if side == "R" else 0)) % intervals]
        heel_pitch, heel_bend = foot_angles(heel, side, 0)
        heel_offset, _, _ = plant(rest, 0, heel_pitch, heel_bend, 0)
        center = heel["Ankle" + side].y * stride_scale - (heel_offset.y - rest.y)
        pitch, bend = foot_angles(points, side, phase)
        if phase <= support:
            return plant(rest, phase, pitch, bend, center)
        swing = (phase - support) / (1 - support)
        push_pitch, push_bend = foot_angles(release, side, support)
        push, _, _ = plant(rest, support, push_pitch, push_bend, center)
        strike, _, _ = plant(rest, 0, heel_pitch, heel_bend, center)
        ankle = in_air(rest, points["Ankle" + side], side)
        ankle += (push - in_air(rest, release["Ankle" + side], side)) * (1 - ease(swing / 0.30))
        ankle += (strike - in_air(rest, heel["Ankle" + side], side)) * ease((swing - 0.73) / 0.27)
        rotation = Quaternion(RIGHT, radians(pitch))
        toes = Quaternion(RIGHT, radians(pitch - bend))
        ankle.z = max(ankle.z, outsole_floor(rest, rotation, toes) + 0.008 * sin(pi * swing))
        return ankle, rotation, toes

    def pose_frame(phase, base, turn):
        points = samples[round(phase * intervals) % intervals]
        hips_across = points["HipR"] - points["HipL"]
        pelvis = Quaternion(UP, 0.68 * atan2(hips_across.y, hips_across.x)) @ Quaternion(
            FORWARD, 0.56 * atan2(hips_across.z, hips_across.x))
        offset = Vector(((points["AnkleL"].x + points["AnkleR"].x) * -0.18, 0,
                         (points["Hips"].z - mean_hip) * 0.70 - (0.040 if running else 0.015)))
        feet = []
        for side, foot_phase in zip(SIDES, (phase % 1, (phase + 0.5) % 1)):
            foot = foot_pose(points, side, foot_phase)
            feet.append(foot)
            hip = hip_rest + pelvis @ (bones["Thigh." + side].head_local - hip_rest) + offset
            # Keep the in-place model within reach of both planted boots.
            ankle = foot[0]
            knee = points["Knee" + side]
            flex = (knee - points["Hip" + side]).angle(points["Ankle" + side] - knee)
            minimum_flex = max(5, degrees(flex) * 0.62) if foot_phase <= support else 4
            height = ankle.z + vertical_leg_span(bones, side, hip, ankle, minimum_flex)
            offset.z += min(0.0, height - hip.z)

        turn("Hips", pelvis, offset)
        shoulders = points["ShoulderR"] - points["ShoulderL"]
        spine = points["Neck"] - points["Spine1"]
        turn("Chest", Quaternion(UP, atan2(shoulders.y, shoulders.x) * 0.78) @ Quaternion(
            RIGHT, atan2(-spine.y, spine.z) * 0.82))
        neck = points["Head"] - points["Neck"]
        turn("Neck", Quaternion(RIGHT, atan2(-neck.y, neck.z) * 0.38))
        turn("Head", Quaternion(RIGHT, atan2(-neck.y, neck.z) * 0.16))
        for side, (ankle, foot, toe) in zip(SIDES, feet):
            # The capture and this shorter rig have different femur lengths.
            # Bend toward the toe along the v12 hip-to-ankle plane.
            pose_leg(bones, side, ankle, foot, toe, base, turn)
            upper_arm = points["Elbow" + side] - points["Shoulder" + side]
            forearm = points["Wrist" + side] - points["Elbow" + side]
            aim_bone(bones, turn, "Upper arm." + side, upper_arm)
            aim_bone(bones, turn, "Forearm." + side, forearm)
            aim_bone(bones, turn, "Hand." + side, forearm)

    bake_cycle(rig, name, intervals, pose_frame)


def bake_locomotion(rig):
    # Frames are the measured left, right and next left contacts at 30 fps.
    # Strides match the logical map distances in native_2d_hero.gd.
    # A 1.03 m cycle fits the 0.60 m legs without the deeper pelvis drop of 19-21 px.
    bake_capture(rig, "Walk", "Female1_B03_Walk1.bvh", (92, 112, 130), 32, 20, 18 * 4 / 70)
    bake_capture(rig, "Run", "Female1_C03_Run.bvh", (8, 19, 30), 24, 7, 30 * 4 / 70)
