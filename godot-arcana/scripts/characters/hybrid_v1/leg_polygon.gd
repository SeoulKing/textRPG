@tool
extends Node2D
## One uncut source leg on one native Polygon2D. UVs retain full-resolution
## image coordinates; only mesh geometry uses the character's logical pixels.
const JOINTS: Array[String] = ["hip", "knee", "ankle"]
const BONE_ORDER: Array[String] = ["thigh", "shin"]
const SEGMENTS := {"thigh":["hip","knee"], "shin":["knee","ankle"]}

@export_enum("s", "se", "e", "ne", "n", "nw", "w", "sw") var direction_name := "s"
@export_file("*.png") var texture_path := ""
@export var bind_joints: Dictionary = {}
@export var texture_rect := Rect2(16,4,16,40)
@export_range(1,8,1) var grid_step := 2
@export_range(0.5,6.0,0.25) var knee_blend_width := 2.0
@export var show_mesh := false:
	set(value):
		show_mesh=value
		queue_redraw()
@export var rebuild_requested := false:
	set(value):
		rebuild_requested=false
		if value and is_node_ready():configure(direction_name,texture_path,bind_joints,texture_rect)
@export var refresh_texture_requested := false:
	set(value):
		refresh_texture_requested=false
		if value and is_node_ready():reload_texture()

var polygon: Polygon2D
var skeleton: Skeleton2D
var bones: Dictionary = {}
var base_vertices := PackedVector2Array()
var triangle_indices: Array[PackedInt32Array] = []
var last_error := ""
var _reference: Dictionary = {}

func _ready() -> void:
	texture_filter=CanvasItem.TEXTURE_FILTER_NEAREST
	# Artist-authored UVs, rests and weights are already in a saved scene.
	# Opening or refreshing its image must never regenerate these native edits.
	if has_node("Skeleton2D") and has_node("Leg"):
		_restore_handles()
		reload_texture()
	elif not texture_path.is_empty() and not bind_joints.is_empty():
		configure(direction_name,texture_path,bind_joints,texture_rect)

func configure(direction: String,path: String,joints: Dictionary,logical_rect: Rect2=Rect2(16,4,16,40)) -> bool:
	last_error=""
	var converted := _read_points(joints)
	if converted.is_empty():return false
	if not _valid_rect(logical_rect):return _fail("Leg texture_rect must have positive finite dimensions")
	var current := _load_texture(path)
	if current==null:return _fail("Missing full-resolution leg texture: "+path)
	for existing: String in ["Leg","Skeleton2D"]:
		var node := get_node_or_null(existing)
		if node!=null:
			remove_child(node)
			node.queue_free()
	direction_name=direction
	texture_path=path
	bind_joints=joints.duplicate(true)
	texture_rect=logical_rect
	_reference=converted
	bones.clear()
	skeleton=Skeleton2D.new()
	skeleton.name="Skeleton2D"
	add_child(skeleton)
	skeleton.owner=self
	var rest_globals := {}
	for key: String in BONE_ORDER:
		var segment: Array=SEGMENTS[key]
		var a: Vector2=_reference[segment[0]]
		var b: Vector2=_reference[segment[1]]
		var pose := Transform2D((b-a).angle(),a)
		var bone := Bone2D.new()
		bone.name="Thigh" if key=="thigh" else "Shin"
		bone.set_autocalculate_length_and_angle(false)
		bone.set_length(a.distance_to(b))
		bone.set_bone_angle(0.0)
		var parent: Node=skeleton if key=="thigh" else bones.thigh
		parent.add_child(bone)
		bone.owner=self
		var local_pose: Transform2D=pose if key=="thigh" else (rest_globals.thigh as Transform2D).affine_inverse()*pose
		bone.rest=local_pose
		bone.transform=local_pose
		bones[key]=bone
		rest_globals[key]=pose
	polygon=Polygon2D.new()
	polygon.name="Leg"
	polygon.texture=current
	polygon.texture_filter=CanvasItem.TEXTURE_FILTER_NEAREST
	polygon.antialiased=false
	add_child(polygon)
	polygon.owner=self
	polygon.skeleton=polygon.get_path_to(skeleton)
	_build_grid(current.get_size())
	_bind_weights()
	queue_redraw()
	return true

func reload_texture() -> bool:
	if not is_instance_valid(polygon):return _fail("Missing Leg Polygon2D")
	var current := _load_texture(texture_path)
	if current==null:return _fail("Missing leg texture: "+texture_path)
	# UV coordinates remain in the original image's pixel space. Replacing a
	# texture with a different pixel size requires explicit UV editing/rebuild.
	if polygon.texture!=null and current.get_size()!=polygon.texture.get_size():
		return _fail("Leg source dimensions changed; preserve/edit UVs before replacing it")
	polygon.texture=current
	return true

func _load_texture(path: String) -> Texture2D:
	if not Engine.is_editor_hint() and ResourceLoader.exists(path):
		var imported := load(path) as Texture2D
		if imported!=null:return imported
	var image := Image.load_from_file(ProjectSettings.globalize_path(path))
	if image==null or image.is_empty():return null
	return ImageTexture.create_from_image(image)

func apply_pose(points: Dictionary) -> bool:
	return apply_projected_pose(points)

func apply_projected_pose(points: Dictionary) -> bool:
	if not is_instance_valid(polygon) or bones.is_empty():return _fail("Configure the whole leg before posing it")
	var pose_points := _read_points(points)
	if pose_points.is_empty():return false
	var globals := {}
	for key: String in BONE_ORDER:
		var segment: Array=SEGMENTS[key]
		var a: Vector2=pose_points[segment[0]]
		var b: Vector2=pose_points[segment[1]]
		var axis := b-a
		var reference_axis: Vector2=(_reference[segment[1]] as Vector2)-(_reference[segment[0]] as Vector2)
		var desired := Transform2D(axis.angle(),Vector2(clampf(axis.length()/reference_axis.length(),0.08,2.0),1.0),0.0,a)
		var local_pose: Transform2D=desired if key=="thigh" else (globals.thigh as Transform2D).affine_inverse()*desired
		(bones[key] as Bone2D).transform=local_pose
		globals[key]=desired
	queue_redraw()
	return true

func reset_pose() -> void:
	for key: String in BONE_ORDER:
		if bones.has(key):(bones[key] as Bone2D).apply_rest()
	queue_redraw()

func deformed_vertices() -> PackedVector2Array:
	# Only the optional wireframe is calculated on CPU. The leg picture is
	# deformed by Godot's native Polygon2D + Skeleton2D renderer.
	if not is_instance_valid(polygon):return PackedVector2Array()
	var vertices := polygon.polygon
	var result := PackedVector2Array()
	result.resize(vertices.size())
	var rests := {}
	var poses := {}
	var weights := {}
	for key: String in BONE_ORDER:
		var bone: Bone2D=bones[key]
		rests[key]=bone.rest if key=="thigh" else (rests.thigh as Transform2D)*bone.rest
		poses[key]=bone.transform if key=="thigh" else (poses.thigh as Transform2D)*bone.transform
		weights[key]=polygon.get_bone_weights(BONE_ORDER.find(key))
	for i in vertices.size():
		var total := Vector2.ZERO
		var weight_sum := 0.0
		for key: String in BONE_ORDER:
			var influence: PackedFloat32Array=weights[key]
			if i>=influence.size() or influence[i]<=0.0:continue
			var skin: Transform2D=(poses[key] as Transform2D)*(rests[key] as Transform2D).affine_inverse()
			total+=(skin*vertices[i])*influence[i]
			weight_sum+=influence[i]
		result[i]=total/weight_sum if weight_sum>0.0001 else vertices[i]
	return result

func _build_grid(texture_size: Vector2) -> void:
	var rect := texture_rect
	var xs: Array[float]=[rect.position.x,rect.end.x]
	var ys: Array[float]=[rect.position.y,rect.end.y]
	var x := rect.position.x+float(maxi(1,grid_step))
	while x<rect.end.x-0.0001:
		xs.append(x);x+=float(maxi(1,grid_step))
	var y := rect.position.y+float(maxi(1,grid_step))
	while y<rect.end.y-0.0001:
		ys.append(y);y+=float(maxi(1,grid_step))
	# Extra knee rows give the artist local controls instead of one long quad
	# spanning the entire bend. No row or texture cut is a separate body part.
	var knee_y: float=(_reference.knee as Vector2).y
	for offset: float in [-2.0,-1.0,0.0,1.0,2.0]:
		var at := knee_y+offset
		if at>rect.position.y+0.0001 and at<rect.end.y-0.0001 and not ys.has(at):ys.append(at)
	xs.sort();ys.sort()
	base_vertices=PackedVector2Array([rect.position,Vector2(rect.end.x,rect.position.y),rect.end,Vector2(rect.position.x,rect.end.y)])
	var indices := {Vector2(rect.position.x,rect.position.y):0,Vector2(rect.end.x,rect.position.y):1,rect.end:2,Vector2(rect.position.x,rect.end.y):3}
	for py: float in ys:
		for px: float in xs:
			var at := Vector2(px,py)
			if not indices.has(at):indices[at]=base_vertices.size();base_vertices.append(at)
	triangle_indices.clear()
	for yi in range(ys.size()-1):
		for xi in range(xs.size()-1):
			var a: int=indices[Vector2(xs[xi],ys[yi])]
			var b: int=indices[Vector2(xs[xi+1],ys[yi])]
			var c: int=indices[Vector2(xs[xi+1],ys[yi+1])]
			var d: int=indices[Vector2(xs[xi],ys[yi+1])]
			triangle_indices.append(PackedInt32Array([a,b,c]))
			triangle_indices.append(PackedInt32Array([a,c,d]))
	var uv := PackedVector2Array()
	for p: Vector2 in base_vertices:uv.append((p-rect.position)/rect.size*texture_size)
	polygon.polygon=base_vertices
	polygon.uv=uv
	polygon.internal_vertex_count=base_vertices.size()-4
	polygon.polygons=triangle_indices

func _bind_weights() -> void:
	var thigh := PackedFloat32Array();thigh.resize(base_vertices.size())
	var shin := PackedFloat32Array();shin.resize(base_vertices.size())
	var upper_axis: Vector2=((_reference.knee as Vector2)-(_reference.hip as Vector2)).normalized()
	var lower_axis: Vector2=((_reference.ankle as Vector2)-(_reference.knee as Vector2)).normalized()
	var axis := (upper_axis+lower_axis).normalized()
	if axis.length_squared()<0.001:axis=upper_axis
	for i in base_vertices.size():
		var along: float=(base_vertices[i]-(_reference.knee as Vector2)).dot(axis)
		var blend := smoothstep(-maxf(0.5,knee_blend_width),maxf(0.5,knee_blend_width),along)
		thigh[i]=1.0-blend
		shin[i]=blend
	polygon.clear_bones()
	polygon.add_bone(skeleton.get_path_to(bones.thigh),thigh)
	polygon.add_bone(skeleton.get_path_to(bones.shin),shin)

func _read_points(input: Dictionary) -> Dictionary:
	var result := {}
	for key: String in JOINTS:
		var value: Variant=input.get(key)
		var point := Vector2.ZERO
		if value is Vector2:point=value
		elif value is Vector2i:point=Vector2(value)
		elif value is Array and value.size()==2:point=Vector2(float(value[0]),float(value[1]))
		else:_fail("Missing logical leg joint: "+key);return {}
		if not is_finite(point.x) or not is_finite(point.y):_fail("Invalid leg joint: "+key);return {}
		result[key]=point
	if (result.knee as Vector2).distance_to(result.hip)<0.05 or (result.ankle as Vector2).distance_to(result.knee)<0.05:
		_fail("Leg bones must have nonzero logical lengths");return {}
	return result

func _valid_rect(rect: Rect2) -> bool:
	return is_finite(rect.position.x) and is_finite(rect.position.y) and is_finite(rect.size.x) and is_finite(rect.size.y) and rect.size.x>0.0 and rect.size.y>0.0

func _restore_handles() -> void:
	skeleton=get_node("Skeleton2D") as Skeleton2D
	polygon=get_node("Leg") as Polygon2D
	bones={"thigh":skeleton.get_node("Thigh"),"shin":skeleton.get_node("Thigh/Shin")}
	base_vertices=polygon.polygon
	triangle_indices.clear()
	for triangle: PackedInt32Array in polygon.polygons:triangle_indices.append(triangle)
	_reference=_read_points(bind_joints)

func _draw() -> void:
	if not show_mesh or not is_instance_valid(polygon):return
	var vertices := deformed_vertices()
	for triangle: PackedInt32Array in triangle_indices:
		if triangle.size()!=3:continue
		for edge in 3:draw_line(vertices[triangle[edge]],vertices[triangle[(edge+1)%3]],Color(0.2,0.9,0.8,0.35),0.25,false)

func _fail(message: String) -> bool:
	last_error=message
	return false
