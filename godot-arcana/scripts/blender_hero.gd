@tool
extends Node3D
## Real Blender skin, painted UVs and armature clips; same interface as the game actor.
const MODEL = preload("res://art/models/heroine/heroine.glb")
const PAINT = preload("res://art/resources/hero_painted.gdshader")
const INK = preload("res://art/resources/hero_skinned_ink.gdshader")
var model: Node3D
var animator: AnimationPlayer
var actor_materials: Array[ShaderMaterial] = []
var silhouette_materials: Array[ShaderMaterial] = []
var pose_updates = 0
var last_yaw = 0.0
var idle_clip = ""
var walk_clip = ""
var active_clip = ""

func _ready() -> void:
	model = MODEL.instantiate()
	model.name = "WhiteBobHeroine"
	model.scale = Vector3.ONE # Preserve the heroine's readable 2.08-unit silhouette.
	add_child(model)
	# Share four screen-space silhouette materials across the skinned meshes.
	# Keep MeshInstance3D (not MultiMesh) so each copy follows the armature.
	for offset in [Vector2.LEFT,Vector2.RIGHT,Vector2.UP,Vector2.DOWN]:
		var ink = ShaderMaterial.new()
		ink.shader = INK
		ink.set_shader_parameter("ink_color",Color("39435a"))
		ink.set_shader_parameter("offset_pixels",offset)
		ink.set_shader_parameter("editor_preview",Engine.is_editor_hint())
		silhouette_materials.append(ink)
		actor_materials.append(ink)
	_prepare_materials(model,{})
	_add_head_shadow()
	var players = model.find_children("*","AnimationPlayer",true,false)
	if not players.is_empty():
		animator = players[0]
		animator.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
		for key in animator.get_animation_list():
			if "idle" in key.to_lower(): idle_clip = key
			if "walk" in key.to_lower(): walk_clip = key
	pose(0,0,false,Vector2.ZERO,true,false)

func _prepare_materials(node: Node, shared: Dictionary) -> void:
	# Snapshot children before adding skinned outline siblings.
	var children = node.get_children()
	if node is MeshInstance3D and node.mesh != null:
		var shadow_mesh = ArrayMesh.new()
		for surface in range(node.mesh.get_surface_count()):
			var original = node.get_active_material(surface)
			# Hair locks are readable on the model, but make branch-like ground
			# shadows at this resolution. Replace only their casting geometry.
			var material_name = original.resource_name if original != null else ""
			if material_name not in ["Chestnut_hair","Hair_highlight"]:
				shadow_mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES,node.mesh.surface_get_arrays(surface))
			if original is StandardMaterial3D:
				if not shared.has(original):
					var material = ShaderMaterial.new()
					material.shader = PAINT
					material.set_shader_parameter("base_color",original.albedo_color)
					var name = original.resource_name.to_lower()
					var fill = .40
					if "catchlight" in name: fill = 1.0
					elif "hair" in name: fill = .85
					elif "skin" in name: fill = .60
					elif "dress" in name or "ivory" in name: fill = .62
					material.set_shader_parameter("readability_fill",fill)
					material.set_shader_parameter("has_texture",original.albedo_texture != null)
					if original.albedo_texture != null: material.set_shader_parameter("albedo_texture",original.albedo_texture)
					material.set_shader_parameter("editor_preview",Engine.is_editor_hint())
					shared[original] = material
					actor_materials.append(material)
				node.set_surface_override_material(surface,shared[original])
		node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		if shadow_mesh.get_surface_count() > 0:
			var caster = MeshInstance3D.new()
			caster.name = "BodyShadowCaster"
			caster.mesh = shadow_mesh
			caster.skin = node.skin
			caster.skeleton = node.skeleton
			caster.transform = node.transform
			caster.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_SHADOWS_ONLY
			# The shadow pass uses real geometry and the standard shadow bias.
			caster.material_override = StandardMaterial3D.new()
			node.get_parent().add_child(caster)
		for i in range(silhouette_materials.size()):
			var border = MeshInstance3D.new()
			border.name = "SkinnedSilhouette%d" % i
			border.mesh = node.mesh
			border.skin = node.skin
			border.skeleton = node.skeleton
			border.transform = node.transform
			border.lod_bias = node.lod_bias
			border.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			border.material_override = silhouette_materials[i]
			node.get_parent().add_child(border)
	for child in children: _prepare_materials(child,shared)

func _add_head_shadow() -> void:
	var skeletons = model.find_children("*","Skeleton3D",true,false)
	if skeletons.is_empty(): return
	var skeleton: Skeleton3D = skeletons[0]
	if skeleton.find_bone("head") < 0: return
	var attachment = BoneAttachment3D.new()
	attachment.name = "HeadShadowAttachment"
	attachment.bone_name = "head"
	skeleton.add_child(attachment)
	var caster = MeshInstance3D.new()
	caster.name = "HeadShadowCaster"
	var cap = SphereMesh.new()
	cap.radius = .24
	cap.height = .50
	cap.radial_segments = 16
	cap.rings = 8
	caster.mesh = cap
	# Head bone starts at 1.43; the smooth cap covers the hair's main volume.
	caster.position = Vector3(0,.34,.02)
	caster.scale.z = .85
	caster.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_SHADOWS_ONLY
	caster.material_override = StandardMaterial3D.new()
	attachment.add_child(caster)

func pose(time: float, gait: float, walking: bool, motion: Vector2, pixelated: bool, effects: bool) -> void:
	if motion.length_squared() > .00001:
		last_yaw = atan2(motion.x,motion.y)
		if pixelated: last_yaw = snappedf(last_yaw,PI/4)
	rotation.y = last_yaw
	for material in actor_materials: material.set_shader_parameter("entity_anchor",global_position)
	pose_updates += 1
	if animator == null: return
	var key = walk_clip if walking and not walk_clip.is_empty() else idle_clip
	if key.is_empty(): return
	if key != active_clip:
		animator.play(key)
		active_clip = key
	var duration = animator.get_animation(key).length
	var clock = gait / 8.0 * duration if walking else time if effects else 0.0
	animator.seek(fposmod(clock,maxf(.001,duration)),true)
	animator.pause()
