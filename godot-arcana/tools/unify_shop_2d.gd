extends SceneTree
const Authoring = preload("res://scripts/shop_scene_authoring.gd")
func _initialize() -> void: call_deferred("build")
func build() -> void:
	Authoring.rebuild()
	quit()