@tool
extends "res://scripts/pixel3d_actor.gd"
## Approved B proportions as real articulated geometry, with a shared foot origin.
const HIP_HEIGHT = .80
const THIGH_LENGTH = .36
const SHIN_LENGTH = .32
const FOOT_HEIGHT = .12

func _ready() -> void:
	_build_hero()

func _joint_named(parent: Node3D, label: String, at: Vector3) -> Node3D:
	var joint = _joint(parent,at)
	joint.name = label
	return joint

# Eight-sided elliptical rings give clothing a fitted silhouette without a box torso.
func _tailored(parent: Node3D, rings: Array, color: String) -> MeshInstance3D:
	var surface = SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	var count = 8
	for row in range(rings.size()-1):
		for side in range(count):
			var points: Array[Vector3] = []
			for entry in [[row,side],[row,(side+1)%count],[row+1,(side+1)%count],[row+1,side]]:
				var ring = rings[entry[0]]
				var angle = float(entry[1])*TAU/count+PI/8.0
				points.append(Vector3(sin(angle)*ring.y,ring.x,cos(angle)*ring.z))
			for index in [0,2,1,0,3,2]: surface.add_vertex(points[index])
	# Close the top and bottom so light and shadow see solid clothing.
	for row in [0,rings.size()-1]:
		var ring = rings[row]
		for side in range(count):
			var a = float(side)*TAU/count+PI/8.0
			var b = float(side+1)*TAU/count+PI/8.0
			var first = Vector3(sin(a)*ring.y,ring.x,cos(a)*ring.z)
			var second = Vector3(sin(b)*ring.y,ring.x,cos(b)*ring.z)
			surface.add_vertex(Vector3(0,ring.x,0))
			surface.add_vertex(first if row == 0 else second)
			surface.add_vertex(second if row == 0 else first)
	surface.generate_normals()
	return Models.part(parent,surface.commit(),Vector3.ZERO,color)

func _build_hero() -> void:
	rig = _joint_named(self,"Rig",Vector3.ZERO)
	var coat = "24616c"
	var coat_light = "347a80"
	var coat_shadow = "1e4856"
	var trim = "bc965f"
	var shirt = "eee0c8"
	var hair = "72543c"
	var hair_light = "a57e50"
	torso = _joint_named(rig,"Torso",Vector3(0,1.10,0))
	_tailored(torso,[Vector3(-.29,.20,.13),Vector3(-.11,.22,.145),Vector3(.16,.275,.17),Vector3(.30,.235,.15)],coat)
	# Shirt opening and two lapels remain readable from the game camera.
	Models.box(torso,Vector3(.18,.38,.07),Vector3(0,.09,.155),shirt)
	for side in [-1,1]:
		Models.box(torso,Vector3(.075,.37,.055),Vector3(side*.11,.10,.19),coat_light,Vector3(0,0,side*-.17))
		Models.box(torso,Vector3(.045,.16,.07),Vector3(side*.065,.28,.18),shirt,Vector3(0,0,side*-.30))
		Models.box(torso,Vector3(.025,.36,.025),Vector3(side*.15,.08,.19),trim,Vector3(0,0,side*-.12))
	Models.cylinder(torso,.235,.065,Vector3(0,-.23,0),"574735",.235,8)
	Models.box(torso,Vector3(.105,.085,.035),Vector3(0,-.23,.225),"d3b176")
	Models.box(torso,Vector3(.061,.043,.04),Vector3(0,-.23,.245),"72543c")
	# Split coat skirts leave the knees free to move, with a contrasting hem.
	for side in [-1,1]:
		var tail = _joint_named(torso,"CoatTailLeft" if side < 0 else "CoatTailRight",Vector3(side*.17,-.24,-.045))
		tail.rotation.z = side*.12
		Models.box(tail,Vector3(.20,.43,.19),Vector3(0,-.23,0),coat)
		Models.box(tail,Vector3(.21,.035,.20),Vector3(0,-.44,.005),trim)
		Models.box(tail,Vector3(.025,.40,.025),Vector3(-side*.09,-.22,.11),trim)
		Models.box(tail,Vector3(.13,.15,.025),Vector3(0,-.16,.11),coat_shadow)
	# Short shoulder cape, flared over the sleeves, open at the shirt.
	cape = _joint_named(torso,"ShoulderCape",Vector3(0,.28,-.015))
	_tailored(cape,[Vector3(-.22,.365,.225),Vector3(-.16,.35,.22),Vector3(.045,.19,.14)],coat)
	_tailored(cape,[Vector3(-.235,.368,.228),Vector3(-.205,.363,.225)],trim)
	# Cut the front visually with the shirt and raised collar/lapel panels.
	Models.box(cape,Vector3(.20,.24,.055),Vector3(0,-.07,.225),shirt)
	for side in [-1,1]:
		Models.box(cape,Vector3(.085,.20,.055),Vector3(side*.13,-.065,.245),coat_light,Vector3(0,0,side*.25))
		Models.box(cape,Vector3(.027,.22,.035),Vector3(side*.09,-.07,.28),trim,Vector3(0,0,side*.25))
	# Strap front and back connect to an actual satchel on the right hip.
	Models.box(torso,Vector3(.055,.62,.035),Vector3(.015,.02,.255),"8b6846",Vector3(0,0,.52))
	Models.box(torso,Vector3(.055,.58,.035),Vector3(.015,.04,-.21),"8b6846",Vector3(0,0,-.52))
	var bag = _joint_named(torso,"Satchel",Vector3(.30,-.24,.04))
	Models.box(bag,Vector3(.235,.255,.19),Vector3.ZERO,"8b6846")
	Models.box(bag,Vector3(.25,.075,.205),Vector3(0,.09,.015),"bc965f",Vector3(.10,0,0))
	for x in [-.064,.064]:
		Models.box(bag,Vector3(.028,.16,.025),Vector3(x,.005,.108),"574735")
		Models.box(bag,Vector3(.044,.043,.03),Vector3(x,.025,.125),"d3b176")
	# A sculpted head, with cheeks, tapered jaw and discrete locks of brown hair.
	Models.cylinder(rig,.075,.15,Vector3(0,1.47,0),"e3ad82",.075,8)
	head = _joint_named(rig,"Head",Vector3(0,1.65,0))
	_tailored(head,[Vector3(-.19,.105,.115),Vector3(-.12,.175,.155),Vector3(.045,.205,.17),Vector3(.16,.18,.15),Vector3(.205,.10,.08)],"f4cd9b")
	for side in [-1,1]:
		Models.sphere(head,Vector3(.075,.115,.08),Vector3(side*.19,-.035,-.005),"e3ad82")
		Models.box(head,Vector3(.068,.018,.03),Vector3(side*.078,.035,.166),"574735",Vector3(0,0,side*-.07))
		Models.box(head,Vector3(.058,.05,.027),Vector3(side*.077,.002,.177),"eee0c8")
		Models.box(head,Vector3(.028,.048,.03),Vector3(side*.071,.0,.195),"72543c")
		Models.box(head,Vector3(.014,.035,.032),Vector3(side*.071,-.005,.207),"344b4b")
		Models.box(head,Vector3(.012,.012,.034),Vector3(side*.078,.015,.214),"f6e9ce")
	Models.sphere(head,Vector3(.055,.08,.065),Vector3(0,-.055,.176),"e3ad82")
	Models.box(head,Vector3(.065,.014,.022),Vector3(0,-.12,.141),"a46a57")
	var crown = _tailored(head,[Vector3(-.005,.20,.16),Vector3(.11,.225,.185),Vector3(.22,.15,.13),Vector3(.25,.025,.025)],hair)
	crown.position.z = -.025
	Models.sphere(head,Vector3(.35,.25,.16),Vector3(0,.005,-.145),"574735")
	# Tapered, swept hair locks, rather than round primitive clumps.
	for lock in [Vector3(-.155,.15,.142),Vector3(-.085,.19,.158),Vector3(-.01,.21,.158),Vector3(.073,.22,.143),Vector3(.15,.17,.13)]:
		var strand = _tailored(head,[Vector3(-.16,.005,.006),Vector3(-.065,.045,.028),Vector3(.045,.075,.048),Vector3(.09,.048,.035)],hair_light if lock.x < -.06 else hair)
		strand.position = lock
		strand.rotation.z = -.52
	for side in [-1,1]:
		Models.box(head,Vector3(.055,.14,.11),Vector3(side*.182,.0,-.015),hair,Vector3(0,0,side*.12))
		for i in range(3):
			var tuft = _tailored(head,[Vector3(-.15,.004,.005),Vector3(-.06,.045,.05),Vector3(.035,.065,.07)],hair)
			tuft.position = Vector3(side*.195,.13-i*.063,-.055)
			tuft.rotation.z = side*(.65-i*.15)
			tuft.scale = Vector3(.8,.8,.8)
	var forelock = _tailored(head,[Vector3(-.16,.004,.006),Vector3(-.05,.035,.025),Vector3(.025,.05,.03)],hair_light)
	forelock.position = Vector3(.025,.235,-.055)
	forelock.rotation.z = 2.6
	forelock.scale = Vector3(.65,.65,.7)
	# Articulated thighs, knees, forearms and elbows use the same movement clock.
	left_leg = _joint_named(rig,"LeftHip",Vector3(-.125,HIP_HEIGHT,0))
	right_leg = _joint_named(rig,"RightHip",Vector3(.125,HIP_HEIGHT,0))
	var knees: Array[Node3D] = []
	for leg in [left_leg,right_leg]:
		Models.cylinder(leg,.10,THIGH_LENGTH,Vector3(0,-THIGH_LENGTH/2,0),"485671",.115,8)
		var knee = _joint_named(leg,"Knee",Vector3(0,-THIGH_LENGTH,0))
		Models.cylinder(knee,.085,SHIN_LENGTH,Vector3(0,-SHIN_LENGTH/2,0),"72543c",.095,8)
		Models.cylinder(knee,.105,.065,Vector3(0,-.035,0),"bc965f",.105,8)
		Models.box(knee,Vector3(.18,.11,.285),Vector3(0,-SHIN_LENGTH-.06,.05),"72543c")
		Models.box(knee,Vector3(.19,.035,.30),Vector3(0,-SHIN_LENGTH-.105,.05),"574735")
		Models.box(knee,Vector3(.15,.035,.11),Vector3(0,-SHIN_LENGTH-.015,.14),"bc965f")
		for y in [-.15,-.23]: Models.box(knee,Vector3(.10,.018,.025),Vector3(0,y,.086),"bc965f")
		knees.append(knee)
	left_knee = knees[0]
	right_knee = knees[1]
	left_arm = _joint_named(rig,"LeftShoulder",Vector3(-.285,1.32,0))
	right_arm = _joint_named(rig,"RightShoulder",Vector3(.285,1.32,0))
	var elbows: Array[Node3D] = []
	for arm in [left_arm,right_arm]:
		Models.cylinder(arm,.10,.29,Vector3(0,-.145,0),coat,.115,8)
		var elbow = _joint_named(arm,"Elbow",Vector3(0,-.29,0))
		Models.cylinder(elbow,.075,.23,Vector3(0,-.115,0),coat,.095,8)
		Models.cylinder(elbow,.085,.055,Vector3(0,-.205,0),trim,.085,8)
		Models.cylinder(elbow,.073,.05,Vector3(0,-.245,0),shirt,.075,8)
		Models.sphere(elbow,Vector3(.135,.16,.115),Vector3(0,-.32,.01),"f4cd9b")
		elbows.append(elbow)
	left_elbow = elbows[0]
	right_elbow = elbows[1]
	_merge_parts(rig)
	var copies: Dictionary = {}
	var ink = Models.figure_ink().duplicate()
	ink.set_shader_parameter("entity_anchor_enabled",true)
	actor_materials.append(ink)
	_bind_materials(rig,copies,ink)
	pose(0,0,false,Vector2.ZERO,true,false)
	if Engine.is_editor_hint(): _editor_preview(rig,{})

func _merge_parts(node: Node3D) -> void:
	for child in node.get_children():
		if child is Node3D and not child is MeshInstance3D: _merge_parts(child)
	Models._merge(node,false)

func _editor_preview(node: Node3D, materials: Dictionary) -> void:
	if node is MultiMeshInstance3D: node.hide()
	if node is MeshInstance3D and node.material_override is ShaderMaterial:
		var source = node.material_override
		if not materials.has(source):
			var mat = StandardMaterial3D.new()
			mat.albedo_color = source.get_shader_parameter("base_color")
			mat.roughness = 1.0
			materials[source] = mat
		node.material_override = materials[source]
	for child in node.get_children():
		if child is Node3D: _editor_preview(child,materials)

func pose(time: float, gait: float, walking: bool, motion: Vector2, pixelated: bool, effects: bool) -> void:
	if motion.length_squared() > .00001:
		last_yaw = atan2(motion.x,motion.y)
		if pixelated: last_yaw = snappedf(last_yaw,PI/4)
	rotation.y = last_yaw
	for mat in actor_materials: mat.set_shader_parameter("entity_anchor",global_position)
	pose_updates += 1
	var phase = gait*TAU/8.0
	var swing = sin(phase)*.48 if walking else 0.0
	left_leg.rotation.x = swing
	right_leg.rotation.x = -swing
	left_knee.rotation.x = maxf(0,-sin(phase))*.62 if walking else .025
	right_knee.rotation.x = maxf(0,sin(phase))*.62 if walking else .025
	left_arm.rotation.x = -swing*.75-.10
	right_arm.rotation.x = swing*.75-.10
	left_elbow.rotation.x = -.12+maxf(0,swing)*.25
	right_elbow.rotation.x = -.12+maxf(0,-swing)*.25
	var foot_left = HIP_HEIGHT-cos(left_leg.rotation.x)*THIGH_LENGTH-cos(left_leg.rotation.x+left_knee.rotation.x)*SHIN_LENGTH-FOOT_HEIGHT
	var foot_right = HIP_HEIGHT-cos(right_leg.rotation.x)*THIGH_LENGTH-cos(right_leg.rotation.x+right_knee.rotation.x)*SHIN_LENGTH-FOOT_HEIGHT
	rig.position.y = snappedf(-minf(foot_left,foot_right),1.0/64) if pixelated else -minf(foot_left,foot_right)
	var breath = sin(time*2.0)*.008 if effects and not walking else 0.0
	torso.position.y = 1.10+breath
	cape.rotation.x = -.025+(sin(phase-.6)*.08 if walking else sin(time*1.6)*.018 if effects else 0.0)
	head.rotation.y = sin(time*1.5)*.025 if not walking and effects else 0.0
