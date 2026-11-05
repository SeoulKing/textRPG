extends RefCounted
## Assembly-only constraints for the single painted upper-body mesh.
## Art, UVs, saved native weights and the shared Skeleton3D motion are untouched.
## Ordinary arm swing passes through; only collapsed/stretching projected sleeves
## and tight elbow folds are eased before the existing Polygon2D receives them.

const MIN_PROJECTED_LENGTH_RATIO := 0.65
const LOWER_SOFT_KNEE := 0.80
const UPPER_SOFT_KNEE := 1.04
const MAX_PROJECTED_LENGTH_RATIO := 1.10
const ELBOW_SOFT_KNEE := deg_to_rad(45.0)
const MAX_ELBOW_FLEXION := deg_to_rad(65.0)
const NEUTRAL_EPSILON_SQUARED := 0.00000025

static func polish(pose: Dictionary,reference: Dictionary,strength: float=1.0) -> Dictionary:
	var amount := clampf(strength,0.0,1.0)
	var result := pose.duplicate()
	if amount==0.0 or not _has_point(pose,"spine") or not _has_point(pose,"neck") or not _has_point(reference,"spine") or not _has_point(reference,"neck"):
		return result
	var source_spine := _point(reference.spine)
	var source_torso := _point(reference.neck)-source_spine
	var moved_spine := _point(pose.spine)
	var moved_torso := _point(pose.neck)-moved_spine
	if source_torso.length_squared()<0.0001 or moved_torso.length_squared()<0.0001:return result
	# Match the assembler's directional art registration. This makes the length
	# reference follow body lean/scale rather than damping the whole running pose.
	var fit := Transform2D(moved_torso.angle()-source_torso.angle(),Vector2(1.0,moved_torso.length()/source_torso.length()),0.0,Vector2.ZERO)
	fit.origin=moved_spine-fit*source_spine
	for side: String in ["l","r"]:
		var shoulder_key := "shoulder_"+side
		var elbow_key := "elbow_"+side
		var wrist_key := "wrist_"+side
		if not _has_arm(pose,side) or not _has_arm(reference,side):continue
		var shoulder := _point(pose[shoulder_key])
		var elbow := _point(pose[elbow_key])
		var wrist := _point(pose[wrist_key])
		var base_shoulder := fit*_point(reference[shoulder_key])
		var base_elbow := fit*_point(reference[elbow_key])
		var base_wrist := fit*_point(reference[wrist_key])
		# An approved neutral pose is an exact no-op, including the original
		# Vector2 values. Subpixel rest transforms must not alter its silhouette.
		if shoulder.distance_squared_to(base_shoulder)<=NEUTRAL_EPSILON_SQUARED and elbow.distance_squared_to(base_elbow)<=NEUTRAL_EPSILON_SQUARED and wrist.distance_squared_to(base_wrist)<=NEUTRAL_EPSILON_SQUARED:
			continue
		var rest_upper := base_elbow-base_shoulder
		var rest_fore := base_wrist-base_elbow
		if rest_upper.length_squared()<0.0001 or rest_fore.length_squared()<0.0001:continue
		var upper := elbow-shoulder
		var fore := wrist-elbow
		var upper_angle := upper.angle() if upper.length_squared()>0.0001 else rest_upper.angle()
		var fore_angle := fore.angle() if fore.length_squared()>0.0001 else rest_fore.angle()
		var upper_ratio := _soft_length_ratio(upper.length()/rest_upper.length())
		var fore_ratio := _soft_length_ratio(fore.length()/rest_fore.length())
		var proposed_upper := Vector2.from_angle(upper_angle)*rest_upper.length()*upper_ratio
		var stable_upper := upper.lerp(proposed_upper,amount)
		var stable_elbow := shoulder+stable_upper
		var bend := wrapf(fore_angle-upper_angle,-PI,PI)
		var rest_bend := absf(wrapf(rest_fore.angle()-rest_upper.angle(),-PI,PI))
		# Painted standing arms are already slightly bent. A deliberately larger
		# authored bend remains valid instead of being forced below its own rest.
		var ceiling := maxf(MAX_ELBOW_FLEXION,rest_bend)
		var knee := maxf(ELBOW_SOFT_KNEE,rest_bend)
		var stable_bend := _soft_signed_limit(bend,knee,ceiling)
		var proposed_fore := Vector2.from_angle(stable_upper.angle()+stable_bend)*rest_fore.length()*fore_ratio
		result[elbow_key]=stable_elbow
		result[wrist_key]=stable_elbow+fore.lerp(proposed_fore,amount)
	return result

static func settings() -> Dictionary:
	return {"projected_length_ratio":[MIN_PROJECTED_LENGTH_RATIO,MAX_PROJECTED_LENGTH_RATIO],"length_soft_knees":[LOWER_SOFT_KNEE,UPPER_SOFT_KNEE],"elbow_soft_knee_degrees":rad_to_deg(ELBOW_SOFT_KNEE),"maximum_elbow_flexion_degrees":rad_to_deg(MAX_ELBOW_FLEXION),"neutral_exact_no_op":true,"source_art_and_weights_changed":false}

static func _soft_length_ratio(value: float) -> float:
	if value<LOWER_SOFT_KNEE:
		var span := LOWER_SOFT_KNEE-MIN_PROJECTED_LENGTH_RATIO
		return MIN_PROJECTED_LENGTH_RATIO+span*exp((value-LOWER_SOFT_KNEE)/span)
	if value>UPPER_SOFT_KNEE:
		var span := MAX_PROJECTED_LENGTH_RATIO-UPPER_SOFT_KNEE
		return UPPER_SOFT_KNEE+span*(1.0-exp(-(value-UPPER_SOFT_KNEE)/span))
	return value

static func _soft_signed_limit(value: float,knee: float,ceiling: float) -> float:
	var magnitude := absf(value)
	if magnitude<=knee:return value
	var span := ceiling-knee
	if span<0.0001:return signf(value)*ceiling
	return signf(value)*(knee+span*(1.0-exp(-(magnitude-knee)/span)))

static func _has_arm(points: Dictionary,side: String) -> bool:
	return _has_point(points,"shoulder_"+side) and _has_point(points,"elbow_"+side) and _has_point(points,"wrist_"+side)

static func _has_point(points: Dictionary,key: String) -> bool:
	if not points.has(key):return false
	var value: Variant=points[key]
	return value is Vector2 or (value is Array and value.size()==2)

static func _point(value: Variant) -> Vector2:
	return value if value is Vector2 else Vector2(float(value[0]),float(value[1]))
