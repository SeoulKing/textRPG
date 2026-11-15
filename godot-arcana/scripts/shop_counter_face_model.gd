@tool
extends Node3D
## Six painted faces and the three chamfers along the front and ends of the top.

const PIXELS_PER_UNIT := 64.0
const HALF_WIDTH := 2.0
const HALF_DEPTH := 0.5
const HEIGHT := 1.0
const CHAMFER_PIXELS := 3.0
const CHAMFER := CHAMFER_PIXELS / PIXELS_PER_UNIT
const ATLAS_SIZE := Vector2(640, 200)
const OUTLINE_SHADER = preload("res://art/resources/shop_furniture_outline.gdshader")

@export var atlas: Texture2D
var shop_outline := false

@onready var _surface: MeshInstance3D = $Surface


func _ready() -> void:
	if atlas == null:
		return
	if atlas.get_size() != ATLAS_SIZE:
		push_error("The shop counter face atlas must be 640 × 200 pixels.")
		return

	var material: Material
	if shop_outline:
		var outline := ShaderMaterial.new()
		outline.shader = OUTLINE_SHADER
		outline.set_shader_parameter("face_art", atlas)
		var pitch_sine := sqrt(0.5)
		outline.set_shader_parameter("counter_silhouette", Vector4(HALF_WIDTH,
			-HALF_DEPTH * pitch_sine, (HEIGHT + HALF_DEPTH) * pitch_sine, CHAMFER * pitch_sine))
		material = outline
	else:
		var plain := StandardMaterial3D.new()
		plain.albedo_texture = atlas
		plain.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
		plain.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		material = plain
	_surface.mesh = _build_mesh(material)


static func _build_mesh(material: Material) -> ArrayMesh:
	var builder := SurfaceTool.new()
	builder.begin(Mesh.PRIMITIVE_TRIANGLES)
	builder.set_material(material)

	var left := -HALF_WIDTH
	var right := HALF_WIDTH
	var rear := -HALF_DEPTH
	var front := HALF_DEPTH
	var shoulder := HEIGHT - CHAMFER
	var top_left := left + CHAMFER
	var top_right := right - CHAMFER
	var top_front := front - CHAMFER

	_add_face(builder, [
		Vector3(top_left, HEIGHT, rear), Vector3(top_right, HEIGHT, rear),
		Vector3(top_right, HEIGHT, top_front), Vector3(top_left, HEIGHT, top_front),
	], Vector3.UP, Rect2(64, 0, 256, 64),
		Vector3(left, HEIGHT, rear), Vector3.RIGHT, Vector3.BACK)
	_add_face(builder, [
		Vector3(left, shoulder, front), Vector3(right, shoulder, front),
		Vector3(right, 0, front), Vector3(left, 0, front),
	], Vector3.BACK, Rect2(64, 64, 256, 64),
		Vector3(left, HEIGHT, front), Vector3.RIGHT, Vector3.DOWN)
	_add_face(builder, [
		Vector3(left, shoulder, rear), Vector3(left, shoulder, front),
		Vector3(left, 0, front), Vector3(left, 0, rear),
	], Vector3.LEFT, Rect2(0, 64, 64, 64),
		Vector3(left, HEIGHT, rear), Vector3.BACK, Vector3.DOWN)
	_add_face(builder, [
		Vector3(right, shoulder, front), Vector3(right, shoulder, rear),
		Vector3(right, 0, rear), Vector3(right, 0, front),
	], Vector3.RIGHT, Rect2(320, 64, 64, 64),
		Vector3(right, HEIGHT, front), Vector3.FORWARD, Vector3.DOWN)
	_add_face(builder, [
		Vector3(right, shoulder, rear), Vector3(top_right, HEIGHT, rear),
		Vector3(top_left, HEIGHT, rear), Vector3(left, shoulder, rear),
		Vector3(left, 0, rear), Vector3(right, 0, rear),
	], Vector3.FORWARD, Rect2(384, 64, 256, 64),
		Vector3(right, HEIGHT, rear), Vector3.LEFT, Vector3.DOWN)
	_add_face(builder, [
		Vector3(left, 0, front), Vector3(right, 0, front),
		Vector3(right, 0, rear), Vector3(left, 0, rear),
	], Vector3.DOWN, Rect2(64, 128, 256, 64),
		Vector3(left, 0, front), Vector3.RIGHT, Vector3.FORWARD)

	# The sloping faces share both corner edges, from the full outline to the inset top.
	# Their four painted rows run from the top edge to the shoulder.
	var bevel_v := Vector3.DOWN * (4.0 / CHAMFER_PIXELS)
	_add_face(builder, [
		Vector3(top_left, HEIGHT, top_front), Vector3(top_right, HEIGHT, top_front),
		Vector3(right, shoulder, front), Vector3(left, shoulder, front),
	], Vector3(0, 1, 1).normalized(), Rect2(0, 192, 256, 4),
		Vector3(left, HEIGHT, top_front), Vector3.RIGHT, bevel_v)
	_add_face(builder, [
		Vector3(top_left, HEIGHT, rear), Vector3(top_left, HEIGHT, top_front),
		Vector3(left, shoulder, front), Vector3(left, shoulder, rear),
	], Vector3(-1, 1, 0).normalized(), Rect2(256, 192, 64, 4),
		Vector3(top_left, HEIGHT, rear), Vector3.BACK, bevel_v)
	_add_face(builder, [
		Vector3(top_right, HEIGHT, top_front), Vector3(top_right, HEIGHT, rear),
		Vector3(right, shoulder, rear), Vector3(right, shoulder, front),
	], Vector3(1, 1, 0).normalized(), Rect2(320, 192, 64, 4),
		Vector3(top_right, HEIGHT, front), Vector3.FORWARD, bevel_v)
	return builder.commit()


static func _add_face(builder: SurfaceTool, points: Array[Vector3], normal: Vector3,
		region: Rect2, uv_origin: Vector3, u_axis: Vector3, v_axis: Vector3) -> void:
	var first_texel := Vector2(0.5, 0.5)
	var last_texel := region.size - first_texel
	for index in range(1, points.size() - 1):
		for point: Vector3 in [points[0], points[index], points[index + 1]]:
			var delta := point - uv_origin
			var texel := Vector2(delta.dot(u_axis), delta.dot(v_axis)) * PIXELS_PER_UNIT
			builder.set_uv((region.position + texel.clamp(first_texel, last_texel)) / ATLAS_SIZE)
			builder.set_normal(normal)
			builder.add_vertex(point)
