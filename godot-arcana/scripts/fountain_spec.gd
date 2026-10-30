@tool
extends RefCounted
## One local ground origin for the basin mesh, paving, editor and navigation.
const CENTER = Vector3.ZERO
const RADIUS = 2.25

static func map_shape(placement: Transform3D) -> Dictionary:
	var center = placement*CENTER
	var ground = Transform2D(
		Vector2(placement.basis.x.x,placement.basis.x.z)*16.0,
		Vector2(placement.basis.z.x,placement.basis.z.z)*16.0,
		Vector2(center.x,center.z)*16.0)
	if absf(ground.determinant())<.000001: return {}
	return {"inverse":ground.affine_inverse(),"radius":RADIUS}

static func contains_map_point(shape: Dictionary, point: Vector2, foot_radius: float = 3.0) -> bool:
	var inverse: Transform2D = shape.inverse
	var local = inverse*point
	# Match the player's existing three-pixel foot clearance, including scaling.
	var padding = foot_radius*maxf(inverse.x.length(),inverse.y.length())
	return local.length_squared() < pow(float(shape.radius)+padding,2)
