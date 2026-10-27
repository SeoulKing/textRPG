@tool
extends RefCounted
# Native editable 3D models. Static pieces are merged by material and cached.
const SURFACE = preload("res://art/resources/pixel3d.gdshader")
const OUTLINE = preload("res://art/resources/pixel3d_outline.gdshader")
const FIGURE_OUTLINE = preload("res://art/resources/pixel3d_figure_outline.gdshader")
static var materials: Dictionary = {}
static var templates: Dictionary = {}
static var outline_material: ShaderMaterial
static var figure_outline_material: ShaderMaterial

static func figure_ink() -> ShaderMaterial:
	if figure_outline_material == null:
		figure_outline_material = ShaderMaterial.new()
		figure_outline_material.shader = FIGURE_OUTLINE
	return figure_outline_material

static func figure_border(mesh: Mesh, ink: ShaderMaterial = null) -> MultiMeshInstance3D:
	var copies = MultiMesh.new()
	copies.transform_format = MultiMesh.TRANSFORM_3D
	copies.use_custom_data = true
	copies.mesh = mesh
	copies.instance_count = 4
	var offsets = [Color(1,.5,0,0),Color(0,.5,0,0),Color(.5,1,0,0),Color(.5,0,0,0)]
	for i in range(4):
		copies.set_instance_transform(i,Transform3D.IDENTITY)
		copies.set_instance_custom_data(i,offsets[i])
	var border = MultiMeshInstance3D.new()
	border.multimesh = copies
	border.material_override = figure_ink() if ink == null else ink
	border.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	border.extra_cull_margin = .15
	return border

static func material(color: String, wind: float = 0.0, glow: float = 0.0) -> ShaderMaterial:
	var key = color+str(wind)+str(glow)
	if not materials.has(key):
		var mat = ShaderMaterial.new()
		mat.shader = SURFACE
		mat.set_shader_parameter("base_color",Color(color))
		mat.set_shader_parameter("wind",wind)
		mat.set_shader_parameter("glow",glow)
		var style = 1 if wind>0 else 0
		if color in ["4f788b","617491","3d6579","90a69e","8faaa7","273d78","304f9c","3d62bd","5077d1"]: style = 2
		elif color in ["816850","8b6846","a57e50","bc965f","9c7953","b18e67"]: style = 3
		elif color in ["d8c69b","cbbd9d","dccdad","b6ab8e","a4977e","e9dbb9","eadab4","a8a98f","e0d1b9","eee0c8","cdbeb0","b6aaa6"]: style = 4
		mat.set_shader_parameter("surface_style",style)
		var pattern = 1 if wind > 0 else (2 if color in ["816850","8b6846","a57e50","bc965f","72543c","574735"] else 0)
		mat.set_shader_parameter("surface_pattern",pattern)
		materials[key] = mat
	return materials[key]

static func outline() -> ShaderMaterial:
	if outline_material == null:
		outline_material = ShaderMaterial.new()
		outline_material.shader = OUTLINE
	return outline_material

static func box(root: Node3D, size: Vector3, at: Vector3, color: String, rotation: Vector3 = Vector3.ZERO) -> MeshInstance3D:
	var mesh = BoxMesh.new()
	mesh.size = size
	return part(root,mesh,at,color,rotation)

static func cylinder(root: Node3D, radius: float, height: float, at: Vector3, color: String, top: float = -1, sides: int = 12) -> MeshInstance3D:
	var mesh = CylinderMesh.new()
	mesh.bottom_radius = radius
	mesh.top_radius = radius if top < 0 else top
	mesh.height = height
	mesh.radial_segments = sides
	mesh.rings = 1
	return part(root,mesh,at,color)

static func sphere(root: Node3D, size: Vector3, at: Vector3, color: String) -> MeshInstance3D:
	var mesh = SphereMesh.new()
	mesh.radius = .5
	mesh.height = 1
	mesh.radial_segments = 10
	mesh.rings = 4
	var node = part(root,mesh,at,color)
	node.scale = size
	return node

static func part(root: Node3D, mesh: Mesh, at: Vector3, color: String, rotation: Vector3 = Vector3.ZERO) -> MeshInstance3D:
	var node = MeshInstance3D.new()
	node.mesh = mesh
	node.material_override = material(color)
	node.position = at
	node.rotation = rotation
	root.add_child(node)
	return node

static func _merge(root: Node3D, edge: bool = true, figure: bool = false) -> void:
	var batches: Dictionary = {}
	var silhouette = SurfaceTool.new()
	silhouette.begin(Mesh.PRIMITIVE_TRIANGLES)
	for child in root.get_children():
		if not child is MeshInstance3D: continue
		var mat = child.material_override
		if not batches.has(mat):
			var tool = SurfaceTool.new()
			tool.begin(Mesh.PRIMITIVE_TRIANGLES)
			batches[mat] = tool
		batches[mat].append_from(child.mesh,0,child.transform)
		silhouette.append_from(child.mesh,0,child.transform)
		root.remove_child(child)
		child.free()
	for mat in batches:
		var node = MeshInstance3D.new()
		node.mesh = batches[mat].commit()
		node.material_override = mat
		root.add_child(node)
	if edge:
		if figure:
			root.add_child(figure_border(silhouette.commit()))
			return
		var edge_mesh = MeshInstance3D.new()
		edge_mesh.mesh = silhouette.commit()
		edge_mesh.material_override = outline()
		edge_mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		root.add_child(edge_mesh)

static func clear_templates() -> void:
	templates.clear()
	materials.clear()
	outline_material = null
	figure_outline_material = null

static func model(kind: String) -> Node3D:
	if not templates.has(kind):
		var root = Node3D.new()
		root.name = kind if not kind.is_empty() else "Decoration"
		match kind:
			"shop","inn","restaurant","academy": _house(root,kind)
			"oak","birch","spruce": _tree(root,kind)
			"fountain": _fountain(root)
			"portal": _portal(root)
			"bench": _bench(root)
			"flowerbed","flowers","shrub","flowerpot": _garden(root,kind)
			"lamp-post","lantern": _lamp(root)
			"canopy","pennant": _canopy(root)
			"workbench","handcart": _workbench(root)
			"sign": _sign(root)
			"shelf": _shelf(root)
			_: _crate(root,kind)
		_merge(root,kind not in ["flowers","shrub","oak","birch","spruce"])
		# Resource-owned templates also release cleanly when an editor tool reloads.
		for child in root.get_children(): child.owner = root
		var scene = PackedScene.new()
		scene.pack(root)
		root.free()
		templates[kind] = scene
	return templates[kind].instantiate()

# The illustrated city is the design source: ivory masonry, cobalt roofs,
# gold metalwork, violet fabric and blue magical glass. All anchors stay local.
static func _arch_face(root: Node3D, at: Vector3, width: float, height: float, color: String) -> MeshInstance3D:
	var r = width*.5
	var points: Array[Vector2] = [Vector2(-r,0),Vector2(r,0)]
	for i in range(13):
		var a = i*PI/12.0
		points.append(Vector2(cos(a)*r,height-r+sin(a)*r))
	var tool = SurfaceTool.new()
	tool.begin(Mesh.PRIMITIVE_TRIANGLES)
	for i in range(points.size()):
		for p in [Vector2(0,height*.45),points[(i+1)%points.size()],points[i]]:
			tool.set_normal(Vector3.FORWARD*-1)
			tool.add_vertex(Vector3(p.x,p.y,0))
	return part(root,tool.commit(),at,color)

static func _beam(root: Node3D, a: Vector3, b: Vector3, width: float, color: String) -> MeshInstance3D:
	var node = box(root,Vector3(width,a.distance_to(b),width),(a+b)*.5,color)
	var direction = (b-a).normalized()
	var right = Vector3.FORWARD.cross(direction).normalized()
	if right.length_squared()<.01: right = Vector3.RIGHT
	node.basis = Basis(right,direction,right.cross(direction).normalized())
	return node

static func _gold_ring(root: Node3D, at: Vector3, radius: float, rotation: Vector3, color: String = "d5a44f", width: float = .045) -> MeshInstance3D:
	var mesh = TorusMesh.new()
	mesh.inner_radius = radius-width
	mesh.outer_radius = radius+width
	mesh.rings = 32
	mesh.ring_segments = 6
	return part(root,mesh,at,color,rotation)

static func _gem(root: Node3D, at: Vector3, size: float = .24) -> void:
	cylinder(root,size*.48,size*.72,at+Vector3(0,size*.14,0),"6abdc1",0,4).material_override = material("6abdc1",0,.32)
	cylinder(root,0,size*.5,at-Vector3(0,size*.47,0),"46a1ab",size*.48,4).material_override = material("46a1ab",0,.26)
	_gold_ring(root,at-Vector3(0,size*.23,0),size*.58,Vector3.ZERO,"d5a44f",.027)

static func _window(root: Node3D, at: Vector3, width: float = .68, height: float = 1.13) -> void:
	_arch_face(root,at-Vector3(0,.08,.025),width+.20,height+.18,"cdbeb0")
	_arch_face(root,at,width+.075,height+.06,"d5a44f")
	var glass = _arch_face(root,at+Vector3(0,.055,.018),width-.09,height-.09,"f2cf79")
	glass.material_override = material("f2cf79",0,.24)
	box(root,Vector3(.045,height-.18,.035),at+Vector3(0,height*.48,.05),"a57e50")
	box(root,Vector3(width-.1,.045,.035),at+Vector3(0,height*.44,.05),"a57e50")
	box(root,Vector3(width+.24,.10,.26),at+Vector3(0,-.035,.025),"eee0c8")

static func _spire(root: Node3D, at: Vector3, radius: float, height: float) -> void:
	cylinder(root,radius*.73,height*.68,at+Vector3(0,height*.34,0),"e0d1b9",radius*.73,8)
	for y in [height*.12,height*.60,height*.68]:
		cylinder(root,radius*.86,.12,at+Vector3(0,y,0),"d5a44f",radius*.86,8)
	cylinder(root,radius,height*.37,at+Vector3(0,height*.865,0),"304f9c",0,8)
	for i in range(4):
		var angle = PI/4+i*PI*.5
		_beam(root,at+Vector3(cos(angle)*radius,height*.68,sin(angle)*radius),at+Vector3(0,height*1.05,0),.045,"d5a44f")
	cylinder(root,.025,.36,at+Vector3(0,height*1.05+.13,0),"f2cf79",.012,6)
	_gem(root,at+Vector3(0,height*1.05+.32,0),.16)
	_window(root,at+Vector3(0,height*.30,radius*.74+.012),radius*.66,height*.24)

static func _dormer(root: Node3D, at: Vector3) -> void:
	box(root,Vector3(.84,.76,.55),at,"e0d1b9")
	_window(root,at+Vector3(0,-.28,.285),.45,.65)
	for side in [-1,1]:
		box(root,Vector3(.65,.10,.83),at+Vector3(side*.23,.59,.02),"304f9c",Vector3(0,0,side*.85))
		_beam(root,at+Vector3(side*.49,.35,.45),at+Vector3(0,.94,.45),.065,"d5a44f")
	_gem(root,at+Vector3(0,.96,.45),.13)

static func _house(root: Node3D, kind: String) -> void:
	var center = -.9 if kind in ["shop","restaurant"] else 0.0
	box(root,Vector3(5.3,.20,2.3),Vector3(center,.10,-1.05),"b6aaa6")
	box(root,Vector3(5.0,2.95,2),Vector3(center,1.65,-1.1),"e0d1b9")
	# Light, narrow stone piers replace the heavy dark half-timber grid.
	for x in [center-2.40,center+2.40]:
		box(root,Vector3(.22,3.0,.18),Vector3(x,1.70,-.015),"eee0c8")
		for y in [.35,2.96]: box(root,Vector3(.35,.15,.24),Vector3(x,y,.015),"d5a44f")
	for y in [.38,2.05,3.05]:
		box(root,Vector3(5.1,.12,.15),Vector3(center,y,-.01),"eee0c8")
	box(root,Vector3(5.22,.06,.22),Vector3(center,3.14,.01),"d5a44f")
	# Steeper cobalt tiled roof, a gold ridge and gabled dormer windows.
	for side in [-1,1]:
		box(root,Vector3(5.8,.16,1.72),Vector3(center,3.74,-1.1+side*.66),"304f9c",Vector3(side*.70,0,0))
		box(root,Vector3(5.85,.10,.11),Vector3(center,3.18,-1.1+side*1.30),"d5a44f")
		for row in range(5):
			var reach = .14+row*.255
			var zz = -1.1+side*reach
			var yy = 4.38-reach*.842
			box(root,Vector3(5.75,.025,.045),Vector3(center,yy,zz),"5077d1")
			for col in range(11):
				box(root,Vector3(.024,.025,.25),Vector3(center-2.55+col*.48+(row%2)*.20,yy-.02,zz),"273d78",Vector3(side*.70,0,0))
	box(root,Vector3(5.9,.14,.16),Vector3(center,4.39,-1.1),"d5a44f")
	for x in [center-2.82,center+2.82]:
		cylinder(root,.035,.40,Vector3(x,4.53,-1.1),"f2cf79",0,6)
	for x in [center-1.48,center+1.48]: _dormer(root,Vector3(x,3.72,-.22))
	# The doorway remains at the original local interaction anchor (0,0,0).
	_arch_face(root,Vector3(0,.20,.015),1.12,1.90,"eee0c8")
	_arch_face(root,Vector3(0,.23,.04),.93,1.76,"d5a44f")
	_arch_face(root,Vector3(0,.25,.07),.76,1.64,"72543c")
	_arch_face(root,Vector3(0,1.19,.085),.54,.54,"f2cf79").material_override = material("f2cf79",0,.16)
	box(root,Vector3(.045,.93,.05),Vector3(0,.72,.10),"d3b176")
	sphere(root,Vector3(.075,.075,.075),Vector3(.22,.86,.14),"f2cf79")
	for x in [center-1.68,center+1.64]:
		_window(root,Vector3(x,.70,.01),.76,1.22)
		box(root,Vector3(.97,.18,.32),Vector3(x,.56,.04),"eee0c8")
		for i in range(7):
			var pos = Vector3(x-.42+i*.14,.72+(i%2)*.07,.16)
			sphere(root,Vector3(.22,.19,.24),pos,"55925d")
			sphere(root,Vector3(.13,.10,.13),pos+Vector3(0,.11,.07),["9675c9","d9c1ea","f9e7a6"][i%3])
	if kind in ["shop","restaurant"]:
		var fabric = "7657a6" if kind=="shop" else "304f9c"
		for i in range(10):
			var color = fabric if kind=="shop" or i%2 else "f6e9ce"
			var xx = center-2.16+i*.48
			box(root,Vector3(.48,.08,.94),Vector3(xx,2.17,.35),color,Vector3(.18,0,0))
			cylinder(root,.13,.45,Vector3(xx,2.02,.81),color,.13,8).rotation.z = PI/2
		box(root,Vector3(4.82,.05,.045),Vector3(center,1.91,.94),"d5a44f")
	# Hanging blue/violet signs and gold pictograms, no miniature text.
	var sign_x = center+2.02
	box(root,Vector3(.055,.72,.055),Vector3(sign_x,2.70,.32),"d5a44f")
	box(root,Vector3(.73,.83,.10),Vector3(sign_x,2.27,.35),"d5a44f")
	box(root,Vector3(.61,.72,.12),Vector3(sign_x,2.27,.36),"594285" if kind in ["inn","shop"] else "273d78")
	if kind=="shop":
		cylinder(root,.14,.28,Vector3(sign_x,2.24,.46),"c7a0ab",.07,8)
		box(root,Vector3(.08,.10,.08),Vector3(sign_x,2.44,.46),"f2cf79")
	elif kind=="restaurant":
		sphere(root,Vector3(.43,.22,.12),Vector3(sign_x,2.27,.46),"e3c88d")
	elif kind=="inn":
		cylinder(root,.22,.035,Vector3(sign_x,2.27,.45),"f2cf79",.22,16).rotation.x = PI/2
		cylinder(root,.18,.04,Vector3(sign_x+.09,2.33,.48),"594285",.18,16).rotation.x = PI/2
	# Each building has a distinct skyline while retaining its ground footprint.
	if kind=="inn":
		_spire(root,Vector3(center-2.04,0,-1.22),.56,4.5)
	elif kind=="academy":
		for x in [center-2.10,center+2.10]: _spire(root,Vector3(x,0,-1.16),.68,5.8)
		cylinder(root,.77,.38,Vector3(center,4.42,-1.1),"d5a44f",.77,16)
		sphere(root,Vector3(1.5,1.34,1.5),Vector3(center,4.55,-1.1),"3d62bd")
		_gold_ring(root,Vector3(center,4.58,-1.1),.76,Vector3.ZERO)
		_beam(root,Vector3(center,4.96,-.85),Vector3(center+.90,5.47,-.85),.20,"d5a44f")
		_gem(root,Vector3(center,5.39,-1.1),.30)
	else:
		_spire(root,Vector3(center-2.12,2.3,-1.25),.43,2.4)
	# A small violet banner and pale diamond tie every facade to the city crest.
	box(root,Vector3(.39,.91,.06),Vector3(center-.66,2.57,.15),"7657a6")
	box(root,Vector3(.13,.13,.035),Vector3(center-.66,2.62,.20),"f2cf79",Vector3(0,0,PI/4))

# Tapered wood follows the branch direction instead of hanging straight sticks.
static func _tree_limb(root: Node3D, a: Vector3, b: Vector3, radius: float, tip: float, color: String) -> void:
	var limb = cylinder(root,radius,a.distance_to(b),(a+b)*.5,color,tip,7)
	var direction = (b-a).normalized()
	var right = Vector3.FORWARD.cross(direction).normalized()
	if right.length_squared()<.01: right = Vector3.RIGHT
	limb.basis = Basis(right,direction,right.cross(direction).normalized())

# Closed, angular foliage fans with a broken rim, a shallow crown and a dark
# underside. The perimeter is geometry, so its leaf tips survive every view.
static func _leaf_fan(root: Node3D, at: Vector3, size: Vector3, seed: int, colors: Array) -> void:
	var upper = SurfaceTool.new()
	var lower = SurfaceTool.new()
	upper.begin(Mesh.PRIMITIVE_TRIANGLES)
	lower.begin(Mesh.PRIMITIVE_TRIANGLES)
	var shoulder: Array[Vector3] = []
	var rim: Array[Vector3] = []
	var count = 18
	for i in range(count):
		var angle = i*TAU/count+seed*.47
		var reach = .88+sin(i*2.17+seed*1.31)*.10
		# Paired projecting tips and deep notches break the inflated oval outline.
		if i%3 == 0: reach += .16
		if i%3 == 1: reach -= .13
		shoulder.append(Vector3(cos(angle)*size.x*.30,size.y*(.20+sin(i*1.9+seed)*.05),sin(angle)*size.z*.30))
		rim.append(Vector3(cos(angle)*size.x*.52*reach,size.y*(-.12+sin(i*2.4+seed)*.07),sin(angle)*size.z*.52*reach))
	var peak = Vector3(-size.x*.09,size.y*.43,-size.z*.04)
	var base = Vector3(size.x*.04,-size.y*.33,0)
	for i in range(count):
		var j = (i+1)%count
		_tree_face(upper,peak,shoulder[i],shoulder[j],Vector3.UP)
		_tree_face(upper,shoulder[i],rim[i],rim[j],(shoulder[i]+rim[i]+rim[j])*.333)
		_tree_face(upper,shoulder[i],rim[j],shoulder[j],(shoulder[i]+rim[j]+shoulder[j])*.333)
		_tree_face(lower,base,rim[j],rim[i],Vector3.DOWN)
	var crown = part(root,upper.commit(),at,colors[0])
	crown.material_override = material(colors[0],.65)
	var underside = part(root,lower.commit(),at,colors[1])
	underside.material_override = material(colors[1],.65)

static func _tree_face(surface: SurfaceTool, a: Vector3, b: Vector3, c: Vector3, outward: Vector3) -> void:
	var normal = (b-a).cross(c-a).normalized()
	# Godot front faces use clockwise winding; provide the outward flat normal.
	if normal.dot(outward)<0: normal = -normal
	surface.set_normal(normal)
	if (b-a).cross(c-a).dot(normal)>0:
		for point in [a,c,b]: surface.add_vertex(point)
	else:
		for point in [a,b,c]: surface.add_vertex(point)

static func _tree(root: Node3D, kind: String) -> void:
	var bark = "cdbeb0" if kind=="birch" else "8b6846"
	# Slightly bent, tapered trunk with a flared foot and visible root buttresses.
	var bend = -.09 if kind=="birch" else .12
	_tree_limb(root,Vector3.ZERO,Vector3(bend,1.22,.02),.19,.12,bark)
	_tree_limb(root,Vector3(bend,1.22,.02),Vector3(-.05,2.68,-.06),.12,.035,bark)
	for i in range(5):
		var angle = i*TAU/5+.23
		_tree_limb(root,Vector3(cos(angle)*.39,.025,sin(angle)*.34),Vector3(bend*.2,.39,0),.025,.12,bark)
	if kind=="spruce":
		# Needle boughs radiate from the trunk, sag outwards and taper upwards.
		# Each layer interlocks; pointed fans replace the old flattened spheres.
		for tier in range(6):
			var reach = 1.12-tier*.16
			var height = 1.12+tier*.45
			for i in range(5):
				var angle = i*TAU/5+tier*.73
				var direction = Vector3(cos(angle),0,sin(angle))
				var end = direction*reach*.77+Vector3(0,height-.16,0)
				_tree_limb(root,Vector3(0,height+.16,0),end,.044,.009,"72543c")
				var at = direction*reach*.48+Vector3(0,height,0)
				_leaf_fan(root,at,Vector3(reach*1.12,.62,reach*1.02),tier*7+i,["326e76","21444d"])
		_leaf_fan(root,Vector3(.025,3.65,-.02),Vector3(.48,1.02,.46),31,["326e76","21444d"])
	else:
		var birch = kind=="birch"
		# Oak spreads from low forks; birch keeps a taller, airier central leader.
		var crowns = [Vector3(-.83,2.00,.08),Vector3(.78,2.14,-.12),Vector3(-.44,2.55,-.40),Vector3(.39,2.67,-.23),Vector3(-.10,2.88,.12),Vector3(-.55,2.16,.63),Vector3(.54,2.26,.57)]
		for i in range(crowns.size()):
			var at: Vector3 = crowns[i]
			if birch: at = at*Vector3(.72,1.07,.77)
			var fork = Vector3(bend,1.12+i*.095,0)
			var elbow = fork.lerp(at,.53)-Vector3(0,.10,0)
			_tree_limb(root,fork,elbow,.075,.040,bark)
			_tree_limb(root,elbow,at,.040,.012,bark)
			var size = Vector3(1.66,1.10,1.48) if not birch else Vector3(1.13,1.13,1.04)
			var color = "55925d" if i in [2,4] else "3e7650"
			_leaf_fan(root,at,size,i+3,[color,"2e5745"])
			# Smaller leafy offshoots interrupt each broad rim without separate balls.
			for side in [-1,1]:
				var tip = at+Vector3(side*size.x*.38,-.14+(i%2)*.13,size.z*.23)
				_leaf_fan(root,tip,Vector3(size.x*.49,.39,size.z*.56),i*3+side+40,[color,"2e5745"])
		if birch:
			# Short, staggered bark scars belong only to the pale birch trunk.
			for i in range(8):
				box(root,Vector3(.10+(i%3)*.025,.035,.035),Vector3(bend*.5+(i%2)*.055,.32+i*.24,.12),"574735",Vector3(0,0,(i%3-1)*.12))
	# Preserve the established tree envelope and the shared ground anchor.
	var growth = Transform3D(Basis.from_scale(Vector3(1.15,1.55,1.15)),Vector3.ZERO)
	for branch in root.get_children(): branch.transform = growth*branch.transform
static func _fountain(root: Node3D) -> void:
	# Original illustrated Arcana landmark: gold armillary around a blue orb.
	# Preserve the editable fountain center, -0.7 local Z and 2.25-unit basin.
	var plinth = _fountain_profile(root,[Vector2(2.25,.04),Vector2(2.25,.16),Vector2(2.15,.24),Vector2(1.96,.24),Vector2(1.96,.04)],"958a91")
	plinth.material_override = _fountain_stone("958a91")
	var wall = _fountain_profile(root,[Vector2(2.13,.19),Vector2(2.16,.56),Vector2(2.09,.65),Vector2(1.91,.65),Vector2(1.87,.34),Vector2(1.87,.19)],"cdbeb0")
	wall.material_override = _fountain_stone("cdbeb0")
	# A narrow ledge shadow separates the bright coping from the basin wall.
	_fountain_profile(root,[Vector2(2.16,.44),Vector2(2.18,.52),Vector2(2.16,.57),Vector2(2.10,.49)],"918b9e")
	for i in range(20):
		var angle = i*TAU/20.0
		var color = ["e0d1b9","cdbeb0","eee0c8","e0d1b9"][i%4]
		var stone = _fountain_profile(root,[Vector2(2.16,.52),Vector2(2.21,.62),Vector2(2.17,.74),Vector2(1.91,.74),Vector2(1.86,.65),Vector2(1.91,.52)],color,angle+.008,TAU/20.0-.016,2)
		stone.material_override = _fountain_stone(color)
	_gold_ring(root,Vector3(0,.57,-.7),2.16,Vector3.ZERO,"d5a44f",.035)
	var pool = cylinder(root,1.90,.025,Vector3(0,.585,-.7),"327d8a",1.90,32)
	pool.material_override = _fountain_water(false)
	pool.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_fountain_profile(root,[Vector2(.51,.59),Vector2(.53,.72),Vector2(.34,.83),Vector2(.27,1.18),Vector2(.43,1.37),Vector2(.72,1.46),Vector2(.72,1.55),Vector2(.30,1.55),Vector2(.18,.72)],"eee0c8",0,TAU,16)
	cylinder(root,1.06,.12,Vector3(0,1.55,-.7),"d5a44f",1.10,16)
	var upper = cylinder(root,1.03,.025,Vector3(0,1.62,-.7),"46a1ab",1.03,24)
	upper.material_override = _fountain_water(false)
	var orb_at = Vector3(0,2.60,-.7)
	var orb = sphere(root,Vector3(.96,.96,.96),orb_at,"5077d1")
	orb.material_override = material("5077d1",0,.45)
	_gold_ring(root,orb_at,.94,Vector3(PI/2,0,.48),"d5a44f",.065)
	_gold_ring(root,orb_at,.95,Vector3(.63,0,-.65),"f2cf79",.052)
	_gold_ring(root,orb_at,.92,Vector3(.12,.5,.2),"d5a44f",.045)
	for side in [-1,1]:
		_beam(root,Vector3(side*.43,1.64,-.7),Vector3(side*.74,2.31,-.7),.085,"d5a44f")
		_beam(root,Vector3(side*.74,2.31,-.7),Vector3(side*.47,3.43,-.7),.060,"f2cf79")
	# Pale orbital meridians and diamond glints remain readable at 2x.
	_gold_ring(root,orb_at+Vector3(0,0,.03),.47,Vector3(PI/2,.5,.2),"d6eee1",.022)
	_gem(root,Vector3(0,3.64,-.7),.26)
	for i in range(4):
		var angle = i*TAU/4.0
		_fountain_stream(root,angle)
		var at = Vector3(cos(angle)*2.15,.40,-.7+sin(angle)*2.15)
		box(root,Vector3(.18,.23,.06),at,"d5a44f",Vector3(0,PI/2-angle,0))
		box(root,Vector3(.09,.09,.07),at+Vector3(cos(angle)*.025,0,sin(angle)*.025),"5077d1",Vector3(0,PI/2-angle,PI/4))

static func _fountain_stone(color: String) -> ShaderMaterial:
	# Local to the basin: keep other buildings and the world palette unchanged.
	var key = "fountain-stone-"+color
	if not materials.has(key):
		var mat = material(color).duplicate()
		mat.set_shader_parameter("surface_style",7)
		materials[key] = mat
	return materials[key]

static func _fountain_water(stream: bool) -> ShaderMaterial:
	var key = "fountain-stream" if stream else "fountain-pool"
	if not materials.has(key):
		var mat = material("9cdbd3" if stream else "43858b",0,.10).duplicate()
		mat.set_shader_parameter("surface_style",0)
		mat.set_shader_parameter("surface_pattern",4 if stream else 3)
		materials[key] = mat
	return materials[key]

static func _fountain_profile(root: Node3D, profile: Array[Vector2], color: String, start: float = 0.0, sweep: float = TAU, segments: int = 24) -> MeshInstance3D:
	var tool = SurfaceTool.new()
	tool.begin(Mesh.PRIMITIVE_TRIANGLES)
	for ring in range(profile.size()):
		var next = (ring+1)%profile.size()
		var delta = profile[next]-profile[ring]
		for i in range(segments):
			var a = start+sweep*i/segments
			var b = start+sweep*(i+1)/segments
			var points = [profile[ring],profile[ring],profile[next],profile[next]]
			var angles = [a,b,b,a]
			for index in [0,1,2,0,2,3]:
				var p = points[index]
				var theta = angles[index]
				tool.set_normal(Vector3(delta.y*cos(theta),-delta.x,delta.y*sin(theta)).normalized())
				tool.add_vertex(Vector3(p.x*cos(theta),p.y,p.x*sin(theta)))
	# Close the exposed ends of each stone wedge.
	if sweep < TAU-.001:
		var center = Vector2.ZERO
		for p in profile: center += p
		center /= profile.size()
		for end in range(2):
			var angle = start+sweep*end
			var normal = Vector3(sin(angle),0,-cos(angle))*(1 if end==0 else -1)
			for i in range(profile.size()):
				var triangle = [center,profile[i],profile[(i+1)%profile.size()]] if end==0 else [center,profile[(i+1)%profile.size()],profile[i]]
				for p in triangle:
					tool.set_normal(normal)
					tool.add_vertex(Vector3(p.x*cos(angle),p.y,p.x*sin(angle)))
	return part(root,tool.commit(),Vector3(0,0,-.7),color)

static func _fountain_stream(root: Node3D, angle: float) -> void:
	var tool = SurfaceTool.new()
	tool.begin(Mesh.PRIMITIVE_TRIANGLES)
	var radial = Vector3(cos(angle),0,sin(angle))
	var tangent = Vector3(-sin(angle),0,cos(angle))
	# Two crossed, opaque ribbons keep the small stream visible from every side.
	for axis in [tangent,radial]:
		for i in range(10):
			var t0 = i/10.0
			var t1 = (i+1)/10.0
			var p0 = radial*(1.04+.28*t0)+Vector3(0,1.63-1.02*t0*t0,-.7)
			var p1 = radial*(1.04+.28*t1)+Vector3(0,1.63-1.02*t1*t1,-.7)
			var corners = [p0-axis*.038,p0+axis*.038,p1+axis*.045,p1-axis*.045]
			for index in [0,1,2,0,2,3,2,1,0,3,2,0]:
				tool.set_normal(radial)
				tool.add_vertex(corners[index])
	var node = part(root,tool.commit(),Vector3.ZERO,"9cdbd3")
	node.material_override = _fountain_water(true)
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF

static func _portal(root: Node3D) -> void:
	box(root,Vector3(2.7,.16,1.0),Vector3(0,.08,-.4),"e0d1b9")
	_arch_face(root,Vector3(0,.15,-.39),2.4,3.65,"eee0c8")
	_arch_face(root,Vector3(0,.23,-.36),2.15,3.41,"d5a44f")
	_arch_face(root,Vector3(0,.30,-.33),1.93,3.16,"7657a6")
	_arch_face(root,Vector3(0,.38,-.30),1.65,2.91,"6c92df").material_override = material("6c92df",0,.34)
	_arch_face(root,Vector3(0,.59,-.27),1.34,2.43,"6abdc1").material_override = material("6abdc1",0,.42)
	for side in [-1,1]:
		box(root,Vector3(.30,2.8,.43),Vector3(side*1.08,1.50,-.40),"e0d1b9")
		for y in [.28,2.8]: box(root,Vector3(.41,.15,.52),Vector3(side*1.08,y,-.40),"d5a44f")
		_gem(root,Vector3(side*1.08,3.03,-.40),.30)
		_beam(root,Vector3(side*1.10,2.93,-.35),Vector3(0,4.02,-.35),.13,"d5a44f")
	_gem(root,Vector3(0,4.10,-.35),.40)
	for i in range(5):
		var yy = .85+i*.44
		box(root,Vector3(.06,.06,.035),Vector3(sin(i*2.4)*.48,yy,-.23),"d6eee1",Vector3(0,0,PI/4))

static func _bench(root: Node3D) -> void:
	for x in [-.65,.65]:
		box(root,Vector3(.12,.8,.6),Vector3(x,.4,0),"465b55")
	for z in [-.24,0,.24]: box(root,Vector3(1.8,.12,.19),Vector3(0,.76,z),"bc965f")
	for y in [1.03,1.29]: box(root,Vector3(1.8,.18,.12),Vector3(0,y,-.25),"bc965f")

static func _garden(root: Node3D, kind: String) -> void:
	var width = 1.6 if kind=="flowerbed" else .8
	if kind in ["flowerbed","flowerpot"]:
		box(root,Vector3(width,.35,.65),Vector3(0,.18,-.15),"e0d1b9")
		box(root,Vector3(width+.06,.075,.71),Vector3(0,.36,-.15),"eee0c8")
		box(root,Vector3(width-.12,.04,.51),Vector3(0,.39,-.15),"574735")
		box(root,Vector3(width,.035,.04),Vector3(0,.23,.19),"d5a44f")
	for i in range(13):
		var pos = Vector3((i%5-2)*width*.17,.44+(i%3)*.085,-.15+(i%3-1)*.17)
		var leaf = sphere(root,Vector3(.40,.34,.42),pos,"55925d" if i%2 else "3e7650")
		leaf.material_override = material("55925d" if i%2 else "3e7650",.4)
		if kind!="shrub":
			var flower_color = ["9675c9","d9c1ea","f6e9ce","c78a68"][i%4]
			sphere(root,Vector3(.17,.10,.17),pos+Vector3(0,.19,.04),flower_color)
			sphere(root,Vector3(.065,.055,.065),pos+Vector3(0,.24,.04),"f2cf79")

static func _lamp(root: Node3D) -> void:
	cylinder(root,.085,2.3,Vector3(0,1.15,0),"283452",.055,8)
	cylinder(root,.24,.13,Vector3(0,.07,0),"b6aaa6",.19,8)
	for y in [.22,1.95]: cylinder(root,.13,.09,Vector3(0,y,0),"d5a44f",.13,8)
	box(root,Vector3(.34,.50,.34),Vector3(0,2.34,0),"f2cf79").material_override = material("f2cf79",0,.45)
	for x in [-.19,.19]: box(root,Vector3(.035,.54,.38),Vector3(x,2.34,0),"d5a44f")
	cylinder(root,.33,.28,Vector3(0,2.72,0),"d5a44f",0,4)
	_gem(root,Vector3(0,2.94,0),.18)
	# Blue and gold civic pennant attached above head height.
	box(root,Vector3(.55,.045,.045),Vector3(.27,2.07,0),"d5a44f")
	box(root,Vector3(.37,.60,.045),Vector3(.35,1.75,0),"304f9c")
	box(root,Vector3(.12,.12,.055),Vector3(.35,1.81,.015),"f2cf79",Vector3(0,0,PI/4))

static func _canopy(root: Node3D) -> void:
	for x in [-1.1,1.1]: cylinder(root,.055,2.0,Vector3(x,1,0),"d5a44f",.055,6)
	for i in range(8): box(root,Vector3(.30,.08,1.4),Vector3(-1.05+i*.30,2.05,0),"f6e9ce" if i%2 else "7657a6",Vector3(.1,0,0))
	box(root,Vector3(2.4,.045,.05),Vector3(0,1.98,.70),"d5a44f")

static func _workbench(root: Node3D) -> void:
	for x in [-.7,.7]: box(root,Vector3(.14,.9,.55),Vector3(x,.45,0),"8b6846")
	box(root,Vector3(2,.16,.85),Vector3(0,.95,0),"bc965f")
	cylinder(root,.22,.42,Vector3(.4,1.23,0),"9cdbd3",0,4)
	box(root,Vector3(.52,.10,.35),Vector3(-.4,1.09,0),"617491")

static func _sign(root: Node3D) -> void:
	box(root,Vector3(.10,1.5,.10),Vector3(0,.75,0),"8b6846")
	box(root,Vector3(.9,.50,.14),Vector3(0,1.4,0),"bc965f")
	cylinder(root,.14,.27,Vector3(0,1.4,.10),"75b5b2",.08,8)

static func _crate(root: Node3D, kind: String) -> void:
	if kind in ["barrels","basket"]:
		cylinder(root,.4,.75,Vector3(0,.38,0),"a57e50",.33,10)
		for y in [.15,.6]: cylinder(root,.41,.07,Vector3(0,y,0),"728071",.41,10)
	else:
		box(root,Vector3(.8,.7,.75),Vector3(0,.35,0),"a57e50")
		for x in [-.34,.34]: box(root,Vector3(.09,.7,.80),Vector3(x,.35,0),"d3b176")
		box(root,Vector3(.82,.09,.79),Vector3(0,.35,0),"d3b176",Vector3(0,0,.6))

static func _shelf(root: Node3D) -> void:
	box(root,Vector3(1.6,1.8,.35),Vector3(0,.9,0),"574735")
	for x in [-.78,.78]: box(root,Vector3(.12,1.9,.5),Vector3(x,.95,0),"8b6846")
	for level in range(3):
		var y = .16+level*.60
		box(root,Vector3(1.7,.09,.52),Vector3(0,y,.02),"bc965f")
		for i in range(5):
			var color = ["579da0","735b74","bc965f","789663","a46a57"][(i+level)%5]
			cylinder(root,.085,.28,Vector3(-.59+i*.29,y+.2,.13),color,.055,7)
			cylinder(root,.04,.11,Vector3(-.59+i*.29,y+.39,.13),"cbbd9d",.04,6)

static func terrain_texture(material_id: int) -> Texture2D:
	var atlas = preload("res://art/export/terrain.png").get_image()
	var image = Image.create(128,128,false,Image.FORMAT_RGBA8)
	for variant in range(16):
		var x = 15*32 if material_id == 2 else 0
		var row = 1+variant*2+(1 if material_id > 0 else 0)
		image.blit_rect(atlas,Rect2i(x,row*32,32,32),Vector2i(variant%4*32,variant/4*32))
	return ImageTexture.create_from_image(image)

