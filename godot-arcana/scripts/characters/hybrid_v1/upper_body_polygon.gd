@tool
extends Node2D
## A single continuous upper-body texture. Skeleton2D deforms its mesh; arms
## are never replaced with detached sprites. All inputs use source-image pixels.
## Native bones/weights stay editable in a saved scene's Polygon2D UV editor.
const JOINTS: Array[String] = ["spine", "neck", "shoulder_l", "elbow_l", "wrist_l", "shoulder_r", "elbow_r", "wrist_r"]
const BONE_ORDER: Array[String] = ["torso", "upper_l", "fore_l", "upper_r", "fore_r"]
const SEGMENTS := {"torso":["spine","neck"], "upper_l":["shoulder_l","elbow_l"], "fore_l":["elbow_l","wrist_l"], "upper_r":["shoulder_r","elbow_r"], "fore_r":["elbow_r","wrist_r"]}
const PARENTS := {"torso":"", "upper_l":"torso", "fore_l":"upper_l", "upper_r":"torso", "fore_r":"upper_r"}
const NODE_NAMES := {"torso":"Torso", "upper_l":"UpperL", "fore_l":"ForeL", "upper_r":"UpperR", "fore_r":"ForeR"}

@export_enum("s", "se", "e", "ne", "n", "nw", "w", "sw") var direction_name := "s"
@export_file("*.png") var texture_path := ""
@export var bind_joints: Dictionary = {}
@export_range(1, 8, 1) var grid_step := 2
@export var protect_trunk_details := true
@export var show_mesh := false:
	set(value):
		show_mesh = value
		queue_redraw()
@export var rebuild_requested := false:
	set(value):
		rebuild_requested = false
		if value and is_node_ready(): configure(direction_name, texture_path, bind_joints)
@export var refresh_texture_requested := false:
	set(value):
		refresh_texture_requested = false
		if value and is_node_ready(): reload_texture()

var polygon: Polygon2D
var skeleton: Skeleton2D
var bones: Dictionary = {}
var base_vertices := PackedVector2Array()
var triangle_indices: Array[PackedInt32Array] = []
var last_error := ""
var _reference: Dictionary = {}
var _trunk_mask: Image

func _ready() -> void:
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	# A packed artist-edited scene already owns its bone rests and UV weights.
	# Merely opening it must not regenerate those native edits.
	if has_node("Skeleton2D") and has_node("UpperBody"):
		_restore_handles()
		reload_texture()
	elif not texture_path.is_empty() and not bind_joints.is_empty():
		configure(direction_name, texture_path, bind_joints)

func configure(direction: String, path: String, joints: Dictionary) -> bool:
	last_error = ""
	var converted := _read_points(joints)
	if converted.is_empty(): return false
	var texture := _load_texture(path)
	if texture == null: return _fail("Missing upper-body texture: " + path)
	# Read the saved PixelPen export directly so editor import latency cannot
	# silently substitute an older image. One instance owns its texture resource.
	for existing: String in ["UpperBody", "Skeleton2D"]:
		var node := get_node_or_null(existing)
		if node != null:
			remove_child(node)
			node.queue_free()
	direction_name = direction
	texture_path = path
	bind_joints = joints.duplicate(true)
	_reference = converted
	bones.clear()
	skeleton = Skeleton2D.new()
	skeleton.name = "Skeleton2D"
	add_child(skeleton)
	skeleton.owner = self
	var rest_globals := {}
	for key: String in BONE_ORDER:
		var segment: Array = SEGMENTS[key]
		var a: Vector2 = _reference[segment[0]]
		var b: Vector2 = _reference[segment[1]]
		var axis := b-a
		if axis.length() < 0.05: axis = Vector2.DOWN
		var pose := Transform2D(axis.angle(), a)
		var parent_key: String = PARENTS[key]
		var parent: Node = skeleton if parent_key.is_empty() else bones[parent_key]
		var bone := Bone2D.new()
		bone.name = NODE_NAMES[key]
		bone.set_autocalculate_length_and_angle(false)
		bone.set_length(maxf(0.1, a.distance_to(b)))
		bone.set_bone_angle(0.0)
		parent.add_child(bone)
		bone.owner = self
		var local_pose: Transform2D = pose if parent_key.is_empty() else (rest_globals[parent_key] as Transform2D).affine_inverse()*pose
		bone.rest = local_pose
		bone.transform = local_pose
		bones[key] = bone
		rest_globals[key] = pose
	polygon = Polygon2D.new()
	polygon.name = "UpperBody"
	polygon.texture = texture
	polygon.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	polygon.antialiased = false
	add_child(polygon)
	polygon.owner = self
	polygon.skeleton = polygon.get_path_to(skeleton)
	_build_grid(Vector2i(texture.get_size()))
	_build_trunk_mask(Vector2i(texture.get_size()))
	_bind_weights()
	queue_redraw()
	return true

func reload_texture() -> bool:
	# Update the exported art without touching artist-edited UVs or bone weights.
	if not is_instance_valid(polygon): return _fail("Missing UpperBody Polygon2D")
	var current := _load_texture(texture_path)
	if current == null: return _fail("Missing upper-body texture: " + texture_path)
	polygon.texture = current
	return true

func _load_texture(path: String) -> Texture2D:
	if not Engine.is_editor_hint() and ResourceLoader.exists(path):
		var imported := load(path) as Texture2D
		if imported != null: return imported
	var image := Image.load_from_file(ProjectSettings.globalize_path(path))
	if image == null or image.is_empty():return null
	return ImageTexture.create_from_image(image)

func apply_projected_pose(points: Dictionary) -> bool:
	if not is_instance_valid(polygon) or bones.is_empty(): return _fail("Configure the upper-body rig before posing it.")
	var pose_points := _read_points(points)
	if pose_points.is_empty(): return false
	var globals := {}
	for key: String in BONE_ORDER:
		var segment: Array = SEGMENTS[key]
		var a: Vector2 = pose_points[segment[0]]
		var b: Vector2 = pose_points[segment[1]]
		var axis := b-a
		var rest_axis: Vector2 = (_reference[segment[1]] as Vector2)-(_reference[segment[0]] as Vector2)
		var angle := axis.angle() if axis.length_squared() > 0.0001 else rest_axis.angle()
		# Foreshortening follows the projected 3D bone; thickness stays constant.
		var ratio := clampf(axis.length()/maxf(0.1,rest_axis.length()),0.08,2.0)
		var desired := Transform2D(angle, Vector2(ratio,1.0), 0.0, a)
		var parent_key: String = PARENTS[key]
		var local_pose: Transform2D = desired if parent_key.is_empty() else (globals[parent_key] as Transform2D).affine_inverse()*desired
		(bones[key] as Bone2D).transform = local_pose
		globals[key] = desired
	queue_redraw()
	return true

func reset_pose() -> void:
	for key: String in BONE_ORDER:
		if bones.has(key): (bones[key] as Bone2D).apply_rest()
	queue_redraw()

func deformed_vertices() -> PackedVector2Array:
	# CPU counterpart for an optional wireframe overlay only. The artwork itself
	# is deformed by native Polygon2D + Skeleton2D skinning on the renderer.
	if not is_instance_valid(polygon): return PackedVector2Array()
	var vertices := polygon.polygon
	var result := PackedVector2Array()
	result.resize(vertices.size())
	var weights_by_bone := {}
	var rest_globals := {}
	var current_globals := {}
	for key: String in BONE_ORDER:
		var bone: Bone2D = bones[key]
		var parent_key: String = PARENTS[key]
		rest_globals[key] = bone.rest if parent_key.is_empty() else (rest_globals[parent_key] as Transform2D)*bone.rest
		current_globals[key] = bone.transform if parent_key.is_empty() else (current_globals[parent_key] as Transform2D)*bone.transform
		weights_by_bone[key] = polygon.get_bone_weights(BONE_ORDER.find(key))
	for i in vertices.size():
		var sum := Vector2.ZERO
		var weight_sum := 0.0
		for key: String in BONE_ORDER:
			var weights: PackedFloat32Array = weights_by_bone[key]
			if i >= weights.size() or weights[i] <= 0.0: continue
			var skin: Transform2D = (current_globals[key] as Transform2D)*(rest_globals[key] as Transform2D).affine_inverse()
			sum += (skin*vertices[i])*weights[i]
			weight_sum += weights[i]
		result[i] = sum/maxf(weight_sum,0.0001) if weight_sum>0.0 else vertices[i]
	return result

func _build_grid(size: Vector2i) -> void:
	var step_value := maxi(1,grid_step)
	var xs: Array[int] = []
	var ys: Array[int] = []
	for x in range(0,size.x,step_value): xs.append(x)
	for y in range(0,size.y,step_value): ys.append(y)
	xs.append(size.x)
	ys.append(size.y)
	# First four form a valid editor boundary; all remaining points are internal.
	base_vertices = PackedVector2Array([Vector2.ZERO,Vector2(size.x,0),Vector2(size),Vector2(0,size.y)])
	var indices := {Vector2i.ZERO:0,Vector2i(size.x,0):1,size:2,Vector2i(0,size.y):3}
	for y: int in ys:
		for x: int in xs:
			var at := Vector2i(x,y)
			if not indices.has(at): indices[at]=base_vertices.size();base_vertices.append(Vector2(at))
	triangle_indices.clear()
	for yi in range(ys.size()-1):
		for xi in range(xs.size()-1):
			var a: int=indices[Vector2i(xs[xi],ys[yi])]
			var b: int=indices[Vector2i(xs[xi+1],ys[yi])]
			var c: int=indices[Vector2i(xs[xi+1],ys[yi+1])]
			var d: int=indices[Vector2i(xs[xi],ys[yi+1])]
			triangle_indices.append(PackedInt32Array([a,b,c]))
			triangle_indices.append(PackedInt32Array([a,c,d]))
	polygon.polygon = base_vertices
	polygon.uv = base_vertices.duplicate()
	polygon.internal_vertex_count = base_vertices.size()-4
	polygon.polygons = triangle_indices

func _bind_weights() -> void:
	var by_bone := {}
	for key: String in BONE_ORDER:
		var values := PackedFloat32Array();values.resize(base_vertices.size());by_bone[key]=values
	for i in base_vertices.size():
		var p := base_vertices[i]
		# The shirt continues below spine to the belt. Measuring only to the
		# short neck-spine segment would incorrectly hand its hem to the wrists.
		var body_axis: Vector2=(_reference.spine as Vector2)-(_reference.neck as Vector2)
		var body_distance := absf((p-(_reference.neck as Vector2)).cross(body_axis.normalized()))
		var arm_side := "l"
		var best_distance := INF
		for side: String in ["l","r"]:
			var distance := minf(_segment_distance(p,_reference["shoulder_"+side],_reference["elbow_"+side]),_segment_distance(p,_reference["elbow_"+side],_reference["wrist_"+side]))
			if distance<best_distance:best_distance=distance;arm_side=side
		var arm_weight := smoothstep(-1.5,3.0,body_distance-best_distance)
		arm_weight *= 1.0-_trunk_protection(p)
		var upper_distance := _segment_distance(p,_reference["shoulder_"+arm_side],_reference["elbow_"+arm_side])
		var fore_distance := _segment_distance(p,_reference["elbow_"+arm_side],_reference["wrist_"+arm_side])
		var fore_weight := smoothstep(-2.0,2.0,upper_distance-fore_distance)
		# At most three influences, matching the renderer's top-four limit.
		by_bone.torso[i] = 1.0-arm_weight
		by_bone["upper_"+arm_side][i] = arm_weight*(1.0-fore_weight)
		by_bone["fore_"+arm_side][i] = arm_weight*fore_weight
	polygon.clear_bones()
	for key: String in BONE_ORDER:
		# Godot resolves these relative to Skeleton2D, not Polygon2D.
		polygon.add_bone(skeleton.get_path_to(bones[key]),by_bone[key])

func _build_trunk_mask(size: Vector2i) -> void:
	_trunk_mask=null
	if not protect_trunk_details:return
	var mask := Image.create(size.x,size.y,false,Image.FORMAT_RGBA8)
	mask.fill(Color.TRANSPARENT)
	var found := false
	for layer_name: String in ["leather","metal","collar_trim"]:
		var path := texture_path.get_base_dir()+"/"+layer_name+".png"
		if not FileAccess.file_exists(path) and not ResourceLoader.exists(path):continue
		var layer_texture := _load_texture(path)
		if layer_texture==null:continue
		var layer := layer_texture.get_image()
		if layer==null or layer.get_size()!=size:continue
		for y in size.y:
			for x in size.x:
				if layer.get_pixel(x,y).a>0.5:mask.set_pixel(x,y,Color.WHITE);found=true
	if found:_trunk_mask=mask

func _trunk_protection(point: Vector2) -> float:
	if _trunk_mask==null:return 0.0
	var closest := INF
	var center := Vector2i(point)
	for y in range(maxi(0,center.y-3),mini(_trunk_mask.get_height(),center.y+4)):
		for x in range(maxi(0,center.x-3),mini(_trunk_mask.get_width(),center.x+4)):
			if _trunk_mask.get_pixel(x,y).a>0.5:
				closest=minf(closest,point.distance_to(Vector2(x+0.5,y+0.5)))
	# Mesh grid is two source pixels. The rigid interior covers all vertices of
	# a triangle carrying a buckle/collar texel; only nearby cloth blends out.
	return 1.0-smoothstep(1.5,3.0,closest)

func _segment_distance(p: Vector2,a: Vector2,b: Vector2) -> float:
	var axis := b-a
	var t := clampf((p-a).dot(axis)/maxf(0.001,axis.length_squared()),0.0,1.0)
	return p.distance_to(a+axis*t)

func _read_points(input: Dictionary) -> Dictionary:
	var result := {}
	for key: String in JOINTS:
		var value: Variant = input.get(key)
		var point := Vector2.ZERO
		if value is Vector2: point=value
		elif value is Vector2i: point=Vector2(value)
		elif value is Array and value.size()==2: point=Vector2(float(value[0]),float(value[1]))
		else: _fail("Missing 2D joint: "+key);return {}
		if not is_finite(point.x) or not is_finite(point.y):_fail("Nonfinite 2D joint: "+key);return {}
		result[key]=point
	return result

func _restore_handles() -> void:
	skeleton = get_node("Skeleton2D") as Skeleton2D
	polygon = get_node("UpperBody") as Polygon2D
	bones.clear()
	var paths := {"torso":"Torso","upper_l":"Torso/UpperL","fore_l":"Torso/UpperL/ForeL","upper_r":"Torso/UpperR","fore_r":"Torso/UpperR/ForeR"}
	for key: String in BONE_ORDER: bones[key]=skeleton.get_node(paths[key])
	base_vertices = polygon.polygon
	triangle_indices.clear()
	for triangle: PackedInt32Array in polygon.polygons:triangle_indices.append(triangle)
	_reference = _read_points(bind_joints)

func _draw() -> void:
	if not show_mesh or not is_instance_valid(polygon):return
	var vertices := deformed_vertices()
	for triangle: PackedInt32Array in polygon.polygons:
		if triangle.size()!=3:continue
		for edge in 3:draw_line(vertices[triangle[edge]],vertices[triangle[(edge+1)%3]],Color(0.2,0.9,0.8,0.35),0.25,false)

func _fail(message: String) -> bool:
	last_error=message
	return false
