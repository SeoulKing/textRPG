@tool
extends Node3D
# Articulated native mesh character: one rig works for all eight directions.
const Models = preload("res://scripts/pixel3d_models.gd")
var traveler = false
var rig: Node3D
var torso: Node3D
var head: Node3D
var cape: Node3D
var left_leg: Node3D
var right_leg: Node3D
var left_knee: Node3D
var right_knee: Node3D
var left_arm: Node3D
var right_arm: Node3D
var left_elbow: Node3D
var right_elbow: Node3D
var actor_materials: Array[ShaderMaterial] = []
var pose_updates = 0
var last_yaw = 0.0

func _joint(parent: Node3D, at: Vector3) -> Node3D:
	var joint = Node3D.new()
	joint.position = at
	parent.add_child(joint)
	return joint

func _ready() -> void:
	rig = _joint(self,Vector3.ZERO)
	var coat = "789663" if traveler else "326e76"
	var trim = "a2b980" if traveler else "579da0"
	var hair = "cbbd9d" if traveler else "72543c"
	torso = _joint(rig,Vector3(0,1.02,0))
	Models.cylinder(torso,.24,.57,Vector3.ZERO,coat,.20,8)
	Models.box(torso,Vector3(.22,.44,.08),Vector3(0,.02,.19),"e9dbb9")
	Models.cylinder(torso,.25,.07,Vector3(0,-.18,0),"574735",.25,8)
	Models.box(torso,Vector3(.09,.085,.06),Vector3(0,-.18,.24),"d3b176")
	for side in [-1,1]:
		Models.box(torso,Vector3(.08,.44,.08),Vector3(side*.17,.02,.18),trim,Vector3(0,0,side*.12))
		Models.box(torso,Vector3(.18,.12,.23),Vector3(side*.17,-.37,0),coat,Vector3(0,0,side*.15))
	Models.box(torso,Vector3(.07,.55,.05),Vector3(.04,.02,.235),"a57e50",Vector3(0,0,.52))
	Models.box(torso,Vector3(.23,.24,.20),Vector3(.28,-.24,.02),"8b6846")
	Models.box(torso,Vector3(.24,.06,.21),Vector3(.28,-.12,.03),"bc965f")
	cape = _joint(torso,Vector3(0,.24,-.19))
	Models.box(cape,Vector3(.45,.66,.055),Vector3(0,-.33,-.05),coat,Vector3(-.08,0,0))
	head = _joint(rig,Vector3(0,1.55,0))
	Models.sphere(head,Vector3(.40,.43,.34),Vector3.ZERO,"f4cd9b")
	Models.sphere(head,Vector3(.44,.24,.39),Vector3(0,.15,-.015),hair)
	Models.sphere(head,Vector3(.35,.25,.15),Vector3(0,.01,-.14),hair)
	for side in [-1,1]:
		Models.box(head,Vector3(.075,.20,.18),Vector3(side*.16,.04,-.01),hair)
		Models.box(head,Vector3(.045,.055,.035),Vector3(side*.075,.005,.165),"344b4b")
		Models.box(head,Vector3(.017,.02,.025),Vector3(side*.08,.02,.184),"f6e9ce")
	Models.box(head,Vector3(.045,.10,.07),Vector3(0,-.025,.17),"e3ad82")
	Models.box(head,Vector3(.07,.018,.03),Vector3(0,-.105,.15),"a46a57")
	for i in range(4): Models.box(head,Vector3(.095,.10,.12),Vector3(-.13+i*.085,.10,.14),hair,Vector3(0,0,.12*(i-1)))
	left_leg = _joint(rig,Vector3(-.12,.74,0))
	right_leg = _joint(rig,Vector3(.12,.74,0))
	var knees: Array[Node3D] = []
	for leg in [left_leg,right_leg]:
		Models.cylinder(leg,.09,.35,Vector3(0,-.175,0),"485671",.095,8)
		var knee = _joint(leg,Vector3(0,-.35,0))
		Models.cylinder(knee,.075,.29,Vector3(0,-.145,0),"485671",.085,8)
		Models.box(knee,Vector3(.17,.18,.28),Vector3(0,-.30,.04),"72543c")
		Models.box(knee,Vector3(.18,.045,.29),Vector3(0,-.38,.04),"574735")
		Models.box(knee,Vector3(.18,.045,.18),Vector3(0,-.23,0),"bc965f")
		knees.append(knee)
	left_knee = knees[0]
	right_knee = knees[1]
	left_arm = _joint(rig,Vector3(-.29,1.24,0))
	right_arm = _joint(rig,Vector3(.29,1.24,0))
	var elbows: Array[Node3D] = []
	for arm in [left_arm,right_arm]:
		Models.cylinder(arm,.095,.29,Vector3(0,-.145,0),coat,.11,8)
		var elbow = _joint(arm,Vector3(0,-.29,0))
		Models.cylinder(elbow,.075,.25,Vector3(0,-.125,0),coat,.09,8)
		Models.cylinder(elbow,.08,.06,Vector3(0,-.23,0),trim,.08,8)
		Models.sphere(elbow,Vector3(.13,.16,.13),Vector3(0,-.30,.01),"e3ad82")
		elbows.append(elbow)
	left_elbow = elbows[0]
	right_elbow = elbows[1]
	# Each articulated mesh shares the character's sort anchor, not its limb origin.
	var copies: Dictionary = {}
	var ink = Models.figure_ink().duplicate()
	ink.set_shader_parameter("entity_anchor_enabled",true)
	actor_materials.append(ink)
	_bind_materials(rig,copies,ink)

func _bind_materials(node: Node3D, copies: Dictionary, ink: ShaderMaterial) -> void:
	for child in node.get_children():
		if child is MeshInstance3D:
			var original = child.material_override
			if not copies.has(original):
				var copy = original.duplicate()
				copy.set_shader_parameter("entity_anchor_enabled",true)
				var color = original.get_shader_parameter("base_color")
				if color != null:
					var skin = color == Color("f4cd9b") or color == Color("e3ad82") or color == Color("a46a57")
					var hair_color = color == Color("72543c") or color == Color("cbbd9d")
					copy.set_shader_parameter("surface_style",0 if skin else 6 if hair_color else 5)
				copies[original] = copy
				actor_materials.append(copy)
			child.material_override = copies[original]
			child.add_child(Models.figure_border(child.mesh,ink))
		else: _bind_materials(child,copies,ink)

func pose(time: float, gait: float, walking: bool, motion: Vector2, pixelated: bool, effects: bool) -> void:
	if motion.length_squared() > .00001:
		last_yaw = atan2(motion.x,motion.y)
		if pixelated: last_yaw = snappedf(last_yaw,PI/4)
	rotation.y = last_yaw
	for mat in actor_materials: mat.set_shader_parameter("entity_anchor",global_position)
	# Pixelated rendering controls resolution, not animation cadence.
	pose_updates += 1
	var phase = gait*TAU/8.0
	var swing = sin(phase)*.48 if walking else 0.0
	left_leg.rotation.x = swing
	right_leg.rotation.x = -swing
	left_knee.rotation.x = maxf(0,-sin(phase))*.66 if walking else .03
	right_knee.rotation.x = maxf(0,sin(phase))*.66 if walking else .03
	left_arm.rotation.x = -swing*.8-.10
	right_arm.rotation.x = swing*.8-.10
	left_elbow.rotation.x = -.12+maxf(0,swing)*.3
	right_elbow.rotation.x = -.12+maxf(0,-swing)*.3
	# Plant the lower foot instead of scaling the body or dragging both boots.
	var foot_l = .74-cos(left_leg.rotation.x)*.35-cos(left_leg.rotation.x+left_knee.rotation.x)*.35-.04
	var foot_r = .74-cos(right_leg.rotation.x)*.35-cos(right_leg.rotation.x+right_knee.rotation.x)*.35-.04
	rig.position.y = snappedf(-minf(foot_l,foot_r),1.0/32) if pixelated else -minf(foot_l,foot_r)
	var breath = sin(time*2.0)*.012 if effects and not walking else 0.0
	torso.position.y = 1.02+breath
	cape.rotation.x = -.03+(sin(phase-.6)*.12 if walking else sin(time*1.6)*.025 if effects else 0.0)
	head.rotation.y = sin(time*.65)*.045 if not walking and effects else 0.0
