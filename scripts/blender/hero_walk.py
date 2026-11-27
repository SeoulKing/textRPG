"""Bake the v12 walking cycle, from heel contact through toe-off and recovery."""

from math import cos, pi, radians, sin, tau

from mathutils import Quaternion, Vector

from hero_gait import FORWARD, UP, bake_cycle, ease, pose_leg, rolled_ankle, swinging_ankle, vertical_leg_span


STRIDE = 12 * 4 / 70  # Map pixels per cycle, converted to model units.
SUPPORT = 0.60
PUSH = 36.0
TOE_AT_RELEASE = 8.0
LANDING = -12.0


def walk_ankle(rest, phase):
    backward = STRIDE * (phase - 0.22)
    if phase > SUPPORT:
        swing = (phase - SUPPORT) / (1 - SUPPORT)
        backward -= STRIDE * ease(swing)
        return swinging_ankle(rest, backward, swing, PUSH, TOE_AT_RELEASE, LANDING)
    heel_roll = PUSH * ease((phase - 0.38) / (SUPPORT - 0.38))
    tilt = LANDING * (1 - ease(phase / 0.09)) + heel_roll
    toe_bend = heel_roll - TOE_AT_RELEASE * ease((phase - 0.54) / (SUPPORT - 0.54))
    return rolled_ankle(rest, backward, 0, tilt, toe_bend)


def bake_walk(rig):
    bones = rig.data.bones
    hips = bones["Hips"].head_local

    def pose_frame(phase, base, turn):
        transfer = sin(tau * (phase - 0.015))
        pelvis = Quaternion(UP, radians(4 * cos(tau * phase))) @ Quaternion(FORWARD, radians(-2 * transfer))
        shift = Vector((-0.016 * transfer, 0, 0))
        feet = {}
        heights = []
        for side, foot_phase in (("L", phase % 1), ("R", (phase + 0.5) % 1)):
            foot = walk_ankle(bones["Foot." + side].head_local, foot_phase)
            feet[side] = (foot_phase, *foot)
            hip = hips + pelvis @ (bones["Thigh." + side].head_local - hips) + shift
            # A softly extended knee receives the load, flexes, then supports a high pelvis.
            load = sin(pi * min(foot_phase / 0.24, 1.0)) ** 2
            knee = 6.5 + 12 * load
            heights.append(foot[0].z + vertical_leg_span(bones, side, hip, foot[0], knee) - hip.z)
        shift.z = min(heights)
        turn("Hips", pelvis, shift)

        # Keep the original shoulders, opposite arm swing and hair follow-through.
        for side, (foot_phase, ankle, rotation, toe_rotation) in feet.items():
            swing = max(0.0, (foot_phase - SUPPORT) / (1 - SUPPORT))
            if swing > 0:
                knee = 40 + 22 * ease(swing / 0.32) - 55 * ease((swing - 0.32) / 0.62)
                hip = base("Thigh." + side).translation
                recovery_z = hip.z - vertical_leg_span(bones, side, hip, ankle, knee)
                ankle.z += max(0, recovery_z - ankle.z) * ease(swing / 0.16) * (1 - ease((swing - 0.88) / 0.12))
            pose_leg(bones, side, ankle, rotation, toe_rotation, base, turn, swing)

    bake_cycle(rig, "Walk", 32, pose_frame)
