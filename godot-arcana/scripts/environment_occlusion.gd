extends RefCounted
## Common runtime fade for 3D scenery, furniture, actors and billboard monsters.
## Source materials are retained untouched; only occluding instances use a fade copy.
const OPACITY = .45
const SURFACES = ["pixel3d.gdshader","pixel3d_outline.gdshader","pixel3d_figure_outline.gdshader","slime_sprite.gdshader"]
var groups: Array[Dictionary] = []
var variants: Dictionary = {}
var depth_variants: Dictionary = {}
var faces: Dictionary = {}
var images: Dictionary = {}
var query_clock = 1.0
var defaults: Dictionary = {}

func rebuild(roots: Array) -> void:
	for group in groups:
		for entry in group.entries:
			var node = entry.node.get_ref()
			if is_instance_valid(node): node.material_override = entry.original
	groups.clear()
	faces.clear()
	images.clear()
	for root in roots:
		for child in root.get_children(true):
			if child is Node3D: _collect(child,{})
	query_clock = 1.0

func _collect(node: Node3D, group: Dictionary) -> void:
	# Illustrated props already have exact alpha-mask detection and their own fade.
	if node.has_method("update_player_occlusion"): return
	if node.has_method("placements"):
		for child in node.get_children(true):
			if child is Node3D: _collect(child,{})
		return
	if group.is_empty():
		group = {"root":weakref(node),"entries":[],"opacity":1.0,"hold":0.0,"blocked":false}
		groups.append(group)
	if node is MeshInstance3D or node is MultiMeshInstance3D:
		var material = node.material_override
		if material is ShaderMaterial and material.shader != null and material.shader.resource_path.get_file() in SURFACES:
			var uniforms: Array[StringName] = []
			for uniform in material.shader.get_shader_uniform_list(): uniforms.append(StringName(uniform.name))
			var is_ground = "ground" in uniforms and _parameter(material,"ground") == true
			var mesh = node.mesh if node is MeshInstance3D else node.multimesh.mesh
			if not is_ground and mesh != null:
				var outline = "outline" in material.shader.resource_path
				group.entries.append({"node":weakref(node),"mesh":mesh,"original":material,"uniforms":uniforms,"fade":null,"depth":null,"outline":outline,"sprite":material.shader.resource_path.ends_with("slime_sprite.gdshader")})
	for child in node.get_children(true):
		if child is Node3D: _collect(child,group)

func update(camera: Camera3D, player: Vector3, body_size: Vector2, delta: float, immediate: bool = false) -> void:
	query_clock += maxf(0,delta)
	var query = query_clock>=.05 or immediate
	if query: query_clock = 0.0
	var ppu = float(camera.get_viewport().size.y)/camera.size
	var foot = camera.unproject_position(player)
	var rect = Rect2(foot-Vector2(body_size.x*.5,body_size.y)*ppu,body_size*ppu)
	var probes: Array[Vector2] = []
	for height in [.15,.4,.65,.9]:
		for side in [-.35,0.0,.35]: probes.append(foot+Vector2(float(side)*body_size.x,-float(height)*body_size.y)*ppu)
	var camera_inverse = camera.global_transform.affine_inverse()
	var axis = Vector2(camera.global_basis.z.x,camera.global_basis.z.z).normalized()
	var player_depth = -150.0+Vector2(player.x,player.z).dot(axis)*.18-.0002
	for group in groups:
		var root = group.root.get_ref()
		if not is_instance_valid(root): continue
		if query:
			group.blocked = false
			if root.is_visible_in_tree():
				for entry in group.entries:
					var node = entry.node.get_ref()
					if not is_instance_valid(node) or not node.is_visible_in_tree() or entry.outline: continue
					if _covers(entry,node,camera,camera_inverse,axis,player_depth,rect,probes,ppu):
						group.blocked = true
						break
		if group.blocked: group.hold = .12
		else: group.hold = maxf(0,float(group.hold)-maxf(0,delta))
		var target = OPACITY if group.blocked or float(group.hold)>0 else 1.0
		var next = target if immediate else move_toward(float(group.opacity),target,maxf(0,delta)*(4.0 if target<float(group.opacity) else 3.0))
		if is_equal_approx(next,1.0) and is_equal_approx(float(group.opacity),1.0): continue
		group.opacity = next
		for entry in group.entries:
			var node = entry.node.get_ref()
			if not is_instance_valid(node): continue
			if next>=.999:
				node.material_override = entry.original
				continue
			if entry.fade == null: entry.fade = _fade_copy(entry.original,entry.uniforms)
			if not entry.sprite and entry.depth == null:
				entry.depth = _depth_copy(entry.original,entry.uniforms)
				entry.depth.next_pass = entry.fade
			# Both passes must use the same live animation and object anchor.
			for uniform in ["motion_time","entity_anchor_enabled","entity_anchor","frame_cell"]:
				if uniform in entry.uniforms:
					var value = _parameter(entry.original,uniform)
					entry.fade.set_shader_parameter(uniform,value)
					if entry.depth != null: entry.depth.set_shader_parameter(uniform,value)
			entry.fade.set_shader_parameter("occlusion_opacity",next)
			node.material_override = entry.fade if entry.sprite else entry.depth

func _fade_copy(original: ShaderMaterial, uniforms: Array[StringName]) -> ShaderMaterial:
	var source = original.shader
	if not variants.has(source):
		var shader = Shader.new()
		var code = source.code.replace("shader_type spatial;","shader_type spatial;\nuniform float occlusion_opacity = 1.0;")
		var end = code.find(";",code.find("render_mode "))
		code = code.insert(end,", depth_draw_never")
		code = code.replace("void fragment() {","void fragment() {\n    ALPHA = occlusion_opacity;")
		shader.code = code
		variants[source] = shader
	var material: ShaderMaterial = original.duplicate()
	material.shader = variants[source]
	material.next_pass = null
	material.render_priority = 0
	for uniform in uniforms: material.set_shader_parameter(uniform,_parameter(original,uniform))
	return material

func _depth_copy(original: ShaderMaterial, uniforms: Array[StringName]) -> ShaderMaterial:
	var source = original.shader
	if not depth_variants.has(source):
		var shader = Shader.new()
		var code: String = source.code
		var end = code.find(";",code.find("render_mode "))
		code = code.insert(end,", depth_draw_always")
		# Alpha zero keeps the already-rendered character/background color intact.
		# This early transparent pass only finds the nearest surface of the object.
		var start = code.find("{",code.find("void fragment()"))
		var finish = start+1
		var braces = 1
		while braces>0:
			if code[finish] == "{": braces += 1
			elif code[finish] == "}": braces -= 1
			finish += 1
		code = code.substr(0,start)+"{\n    ALBEDO = vec3(0.0);\n    ALPHA = 0.0;\n}"+code.substr(finish)
		shader.code = code
		depth_variants[source] = shader
	var material: ShaderMaterial = original.duplicate()
	material.shader = depth_variants[source]
	material.next_pass = null
	material.render_priority = Material.RENDER_PRIORITY_MIN
	for uniform in uniforms: material.set_shader_parameter(uniform,_parameter(original,uniform))
	return material

func _covers(entry: Dictionary, node: Node3D, camera: Camera3D, inverse: Transform3D, axis: Vector2, player_depth: float, player_rect: Rect2, probes: Array[Vector2], ppu: float) -> bool:
	var material: ShaderMaterial = entry.original
	var anchor = node.global_position
	if "entity_anchor_enabled" in entry.uniforms and _parameter(material,"entity_anchor_enabled"):
		anchor = _parameter(material,"entity_anchor")
	var anchor_depth = -150.0+Vector2(anchor.x,anchor.z).dot(axis)*.18
	if entry.sprite:
		if anchor_depth-.0002<=player_depth: return false
		var scale_xy = Vector2(node.global_basis.x.length(),node.global_basis.y.length())
		var size: Vector2 = entry.mesh.size*scale_xy*ppu
		var offset = float(_parameter(material,"foot_offset"))*scale_xy.y*ppu
		var rect = Rect2(camera.unproject_position(anchor)-Vector2(size.x*.5,size.y*.5+offset),size)
		if not rect.intersects(player_rect): return false
		var texture: Texture2D = _parameter(material,"sprite_sheet")
		if not images.has(texture): images[texture] = texture.get_image()
		var image: Image = images[texture]
		var grid: Vector2 = _parameter(material,"sheet_grid")
		var cell: Vector2 = _parameter(material,"frame_cell")
		for point in probes:
			if rect.has_point(point):
				var uv = (cell+(point-rect.position)/rect.size)/grid
				if image.get_pixel(int(uv.x*image.get_width()),int(uv.y*image.get_height())).a>=.5: return true
		return false
	# Broad phase in projected mesh bounds, then actual triangles, not a building's empty bounding box.
	var box: AABB = entry.mesh.get_aabb()
	var rect = Rect2()
	for i in range(8):
		var point = camera.unproject_position(node.global_transform*box.get_endpoint(i))
		rect = Rect2(point,Vector2.ZERO) if i==0 else rect.expand(point)
	if not rect.intersects(player_rect): return false
	if not faces.has(entry.mesh): faces[entry.mesh] = entry.mesh.get_faces()
	var triangles: PackedVector3Array = faces[entry.mesh]
	var local_inverse = node.global_transform.affine_inverse()
	var anchor_z = (inverse*anchor).z
	for point in probes:
		if not rect.has_point(point): continue
		var origin = camera.project_ray_origin(point)
		var start = local_inverse*origin
		var end = local_inverse*(origin+camera.project_ray_normal(point)*camera.far)
		for i in range(0,triangles.size(),3):
			var hit = Geometry3D.segment_intersects_triangle(start,end,triangles[i],triangles[i+1],triangles[i+2])
			if hit != null:
				var depth = anchor_depth+((inverse*(node.global_transform*hit)).z-anchor_z)*.002
				if depth>player_depth+.00001: return true
	return false


func _parameter(material: ShaderMaterial, uniform: StringName) -> Variant:
	var value = material.get_shader_parameter(uniform)
	if value != null: return value
	# Unset material overrides can be null even when the shader has a default.
	if not defaults.has(material.shader): defaults[material.shader] = {}
	if not defaults[material.shader].has(uniform):
		defaults[material.shader][uniform] = RenderingServer.shader_get_parameter_default(material.shader.get_rid(),uniform)
	return defaults[material.shader][uniform]
