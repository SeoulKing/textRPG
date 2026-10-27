@tool
extends Node3D
## Real Blender skin, painted UVs and armature clips; same interface as the game actor.
const MODEL = preload("res://art/models/hero/hero.blender.glb")
const PAINT = preload("res://art/resources/hero_painted.gdshader")
const INK = preload("res://art/resources/hero_skinned_ink.gdshader")
var model: Node3D
var animator: AnimationPlayer
var actor_materials: Array[ShaderMaterial] = []
var pose_updates = 0
var last_yaw = 0.0
var idle_clip = ""
var walk_clip = ""
var active_clip = ""

func _ready() -> void:
	model = MODEL.instantiate()
	model.name = "PaintedHero"
	model.scale = Vector3.ONE * (1.95 / 2.04)
	add_child(model)
	_prepare_materials(model,{})
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
		for surface in range(node.mesh.get_surface_count()):
			var original = node.get_active_material(surface)
			if original is StandardMaterial3D:
				if not shared.has(original):
					var material = ShaderMaterial.new()
					material.shader = PAINT
					material.set_shader_parameter("base_color",original.albedo_color)
					material.set_shader_parameter("has_texture",original.albedo_texture != null)
					if original.albedo_texture != null: material.set_shader_parameter("albedo_texture",original.albedo_texture)
					material.set_shader_parameter("editor_preview",Engine.is_editor_hint())
					shared[original] = material
					actor_materials.append(material)
				node.set_surface_override_material(surface,shared[original])
		var border = MeshInstance3D.new()
		border.name = "SkinnedSilhouette"
		border.mesh = node.mesh
		border.skin = node.skin
		border.skeleton = node.skeleton
		border.transform = node.transform
		border.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		var ink = ShaderMaterial.new()
		ink.shader = INK
		ink.set_shader_parameter("editor_preview",Engine.is_editor_hint())
		border.material_override = ink
		actor_materials.append(ink)
		node.get_parent().add_child(border)
	for child in children: _prepare_materials(child,shared)

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
