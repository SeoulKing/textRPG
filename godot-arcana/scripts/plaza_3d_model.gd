@tool
extends Node3D

const Models = preload("res://scripts/pixel3d_models.gd")

@export_enum("fountain", "restaurant") var model_kind: String = "fountain":
	set(value):
		model_kind = value
		if is_node_ready():
			_rebuild_model()

var _model: Node3D


func _ready() -> void:
	_rebuild_model()


func _rebuild_model() -> void:
	if is_instance_valid(_model):
		_model.free()
	_model = Models.model(model_kind)
	for mesh in _model.get_children():
		if mesh is not MeshInstance3D:
			continue
		var source := mesh.material_override as ShaderMaterial
		if source == null:
			continue
		if source.shader == Models.OUTLINE:
			mesh.hide()
		elif source.shader == Models.SURFACE:
			# Preserve normal 3D depth when orbiting the scene or previewing its camera.
			var material := source.duplicate() as ShaderMaterial
			material.set_shader_parameter("editor_preview", true)
			mesh.material_override = material
	add_child(_model, false, Node.INTERNAL_MODE_BACK)
