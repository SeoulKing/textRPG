extends SceneTree
const Authoring = preload("res://scripts/shop_scene_authoring.gd")
func _initialize() -> void: call_deferred("build")
func build() -> void:
	if not "--rebuild-library" in OS.get_cmdline_user_args():
		print("SHOP_2D native painted scene, furniture instances and manual TileSet edits preserved")
		quit()
		return
	# Refresh scene tiles from existing art; retain every painted cell and furniture instance.
	Authoring.rebuild()
	quit()