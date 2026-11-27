@tool
extends Node3D

@export var water_material: ShaderMaterial


func _ready() -> void:
	var surface := $Model/RiverWater as MeshInstance3D
	surface.material_override = water_material


func set_ripples_enabled(enabled: bool) -> void:
	water_material.set_shader_parameter("animate_ripples", enabled)
