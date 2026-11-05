extends SceneTree
## Exact construction reference: same pitch constant and orthographic density.
var scene: Node3D
func _initialize() -> void:
	call_deferred("draw_reference")
func paint(color: String) -> StandardMaterial3D:
	var mat = StandardMaterial3D.new()
	mat.albedo_color = Color(color)
	mat.roughness = 1.0
	return mat
func part(mesh: Mesh, pos: Vector3, color: String) -> void:
	var node = MeshInstance3D.new()
	node.mesh = mesh
	node.position = pos
	node.material_override = paint(color)
	scene.add_child(node)
func box(size: Vector3, pos: Vector3, color: String) -> void:
	var mesh = BoxMesh.new()
	mesh.size = size
	part(mesh,pos,color)
func cylinder(radius: float, height: float, pos: Vector3, color: String, cone: bool = false) -> void:
	var mesh = CylinderMesh.new()
	mesh.bottom_radius = radius
	mesh.top_radius = 0 if cone else radius
	mesh.height = height
	mesh.radial_segments = 8
	part(mesh,pos,color)
func roof(x: float, width: float, front: float, back: float, eave: float, ridge: float) -> void:
	var a = Vector3(x-width/2,eave,front)
	var b = Vector3(x+width/2,eave,front)
	var c = Vector3(x-width/2,eave,back)
	var d = Vector3(x+width/2,eave,back)
	var e = Vector3(x-width/2,ridge,(front+back)/2)
	var f = Vector3(x+width/2,ridge,(front+back)/2)
	var tool = SurfaceTool.new()
	tool.begin(Mesh.PRIMITIVE_TRIANGLES)
	for tri in [[a,b,f],[a,f,e],[c,e,f],[c,f,d],[a,e,c],[b,d,f]]:
		var normal = (tri[1]-tri[0]).cross(tri[2]-tri[0]).normalized()
		for p in tri:
			tool.set_normal(normal)
			tool.add_vertex(p)
	var mat = paint("365fc2")
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	var node = MeshInstance3D.new()
	node.mesh = tool.commit()
	node.material_override = mat
	scene.add_child(node)
func draw_reference() -> void:
	var pitch_degrees = load("res://scripts/plaza_layout.gd").get_script_constant_map()["CAMERA_PITCH_DEGREES"]
	root.position = Vector2i(-32000,-32000)
	var viewport = SubViewport.new()
	viewport.size = Vector2i(1280,1152)
	viewport.transparent_bg = true
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	root.add_child(viewport)
	scene = Node3D.new()
	viewport.add_child(scene)
	var env = WorldEnvironment.new()
	env.environment = Environment.new()
	env.environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.environment.ambient_light_color = Color.WHITE
	env.environment.ambient_light_energy = .65
	scene.add_child(env)
	var light = DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-45,-30,0)
	light.light_energy = .65
	scene.add_child(light)
	# Main wings: 17-unit footprint, 4-unit depth, three floors.
	box(Vector3(17,5.4,4),Vector3(0,2.7,-2),"eadab4")
	roof(0,17.4,.15,-4.15,5.4,7.2)
	for x in [-3.3,3.3]:
		cylinder(1.25,8.8,Vector3(x,4.4,-1.2),"eee0c8")
		for y in [2.7,5.4,8.8]: cylinder(1.33,.16,Vector3(x,y,-1.2),"cbbd9d")
		cylinder(1.4,4.0,Vector3(x,10.9,-1.2),"365fc2",true)
		cylinder(.09,.6,Vector3(x,13.2,-1.2),"d5a44f",true)
	# Central porch and shallow treads stay attached to the front plane.
	box(Vector3(3.7,5.5,1.0),Vector3(0,2.75,-.4),"eee0c8")
	roof(0,4.1,.2,-1.1,5.5,7.5)
	box(Vector3(1.1,1.9,.03),Vector3(0,1.3,.12),"8b6846")
	for i in range(4):
		box(Vector3(3.2,.12,.22),Vector3(0,.06+float(i)*.12,-float(i)*.22),"cbbd9d")
	# Observatory, actual curved surfaces under the same camera.
	cylinder(1.8,2.0,Vector3(6,6.1,-2),"eee0c8")
	var dome = SphereMesh.new()
	dome.radius = 1.95
	dome.height = 3.9
	dome.is_hemisphere = true
	part(dome,Vector3(6,7.1,-2),"365fc2")
	for x in [-7.5,7.5]:
		cylinder(.62,5.5,Vector3(x,2.75,-.4),"eee0c8")
		cylinder(.8,2.0,Vector3(x,6.5,-.4),"365fc2",true)
	var camera = Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 18.0 # 1152 / 18 = 64 source pixels per projected unit.
	scene.add_child(camera)
	var target = Vector3(0,9.3,-2)
	var distance = 24.0 / tan(deg_to_rad(pitch_degrees))
	camera.position = target+Vector3(0,24,distance)
	camera.look_at(target)
	camera.make_current()
	for i in range(4): await process_frame
	await RenderingServer.frame_post_draw
	viewport.get_texture().get_image().save_png("res://../art-studies/magic-school/assets-v3/projection-guide.png")
	print("School projection: yaw=0 pitch=",pitch_degrees," orthographic 64px/unit")
	quit()
