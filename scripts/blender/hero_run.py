"""Bake a running cycle with a loaded stance, flight and a folded recovery leg."""

from math import cos, pi, radians, sin, tau

from mathutils import Quaternion, Vector

from hero_gait import FORWARD, RIGHT, UP, bake_cycle, ease, pose_leg, rolled_ankle, swinging_ankle, vertical_leg_span


STRIDE = 30 * 4 / 70  # Map pixels per cycle, converted to model units.
SUPPORT = 0.32
PUSH = 47.0
TOE_AT_RELEASE = 12.0
LANDING = -6.0


def ankle_path(rest, phase):
    backward = STRIDE * (phase - 0.39 * SUPPORT)
    if phase > SUPPORT:
        swing = (phase - SUPPORT) / (1 - SUPPORT)
        backward -= STRIDE * ease(swing)
        return swinging_ankle(rest, backward, swing, PUSH, TOE_AT_RELEASE, LANDING)
    heel_roll = PUSH * ease((phase - 0.125) / (SUPPORT - 0.125))
    tilt = LANDING * (1 - ease(phase / 0.07)) + heel_roll
    toe_bend = heel_roll - TOE_AT_RELEASE * ease((phase - 0.27) / (SUPPORT - 0.27))
    return rolled_ankle(rest, backward, 0, tilt, toe_bend)


def bake_run(rig):
    bones = rig.data.bones

    def pose_frame(phase, base, turn):
        wave = sin(tau * phase)
        reach = cos(tau * phase)
        bounce = cos(2 * tau * (phase - 0.41))
        pelvis = Quaternion(UP, radians(5 * reach)) @ Quaternion(FORWARD, radians(-3 * wave))
        # Load the stance knee once per step. During flight both heels are free
        # to recover under the centre of mass, which traces one uninterrupted arc.
        step_phase = phase % 0.5
        flight = max(0.0, (step_phase - SUPPORT) / (0.5 - SUPPORT))
        height = -0.042 + 0.015 * bounce + 0.013 * sin(pi * flight) ** 2
        shift = Vector((-0.015 * wave, -0.012, height))
        turn("Hips", pelvis, shift)
        chest = Quaternion(UP, radians(-9 * reach)) @ Quaternion(RIGHT, radians(13 - 2 * bounce))
        turn("Chest", chest)
        turn("Neck", Quaternion(RIGHT, radians(5)))
        turn("Head", Quaternion(UP, radians(-1.5 * reach)) @ Quaternion(RIGHT, radians(2 - bounce)))

        for side, foot_phase in (("L", phase % 1), ("R", (phase + 0.5) % 1)):
            ankle, rotation, toe_rotation = ankle_path(bones["Foot." + side].head_local, foot_phase)
            swing = max(0.0, (foot_phase - SUPPORT) / (1 - SUPPORT))
            if swing > 0:
                # Cue heel recovery from knee flexion. Extend the shin as the thigh swings forward.
                knee = 18 + 88 * ease(swing / 0.46) - 90 * ease((swing - 0.46) / 0.49)
                hip = base("Thigh." + side).translation
                recovery_z = hip.z - vertical_leg_span(bones, side, hip, ankle, knee)
                ankle.z = max(ankle.z, recovery_z)
            pose_leg(bones, side, ankle, rotation, toe_rotation, base, turn, swing)

            shoulder = 35 * cos(tau * (foot_phase - 0.015)) - 3
            elbow = 70 - 11 * cos(tau * (foot_phase - 0.075))
            turn("Upper arm." + side, Quaternion(RIGHT, radians(shoulder)))
            turn("Forearm." + side, Quaternion(RIGHT, radians(shoulder - elbow)))
            turn("Hand." + side, Quaternion(RIGHT, radians(shoulder - elbow + 4)))

    bake_cycle(rig, "Run", 24, pose_frame)
