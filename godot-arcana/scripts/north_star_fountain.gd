@tool
extends Node3D

const STONE_SHADER: Shader = preload("res://art/resources/north_star_fountain_stone.gdshader")
const POOL_MATERIAL: ShaderMaterial = preload("res://art/resources/north_star_fountain_water.tres")
const FLOW_ANIMATION: StringName = &"WaterLoop"


func _ready() -> void:
	var stone_materials: Dictionary[Material, ShaderMaterial] = {}
	for model: MeshInstance3D in $Model.find_children("*", "MeshInstance3D", true, false):
		if model.mesh == null:
			continue
		for surface in model.mesh.get_surface_count():
			var source := model.get_active_material(surface) as BaseMaterial3D
			if source == null:
				continue
			var material_name := source.resource_name
			if material_name == "FountainPool":
				model.set_surface_override_material(surface, POOL_MATERIAL)
			elif material_name.begins_with("FountainStone"):
				if not stone_materials.has(source):
					var stone := ShaderMaterial.new()
					stone.shader = STONE_SHADER
					stone.set_shader_parameter(&"base_color", source.albedo_color)
					stone_materials[source] = stone
				model.set_surface_override_material(surface, stone_materials[source])
		if model.name != &"FountainBody":
			model.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			if model.name != &"FountainWater":
				# Spray and wavelets animate outside the static body and water meshes.
				model.set_meta(&"local_mesh_highlights", true)

	var player := $Model.get_node_or_null("AnimationPlayer") as AnimationPlayer
	if player != null and player.has_animation(FLOW_ANIMATION):
		player.get_animation(FLOW_ANIMATION).loop_mode = Animation.LOOP_LINEAR
		if not Engine.is_editor_hint():
			player.play(FLOW_ANIMATION)
