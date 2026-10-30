extends SceneTree
const Document = preload("res://addons/pixel_workshop/pixel_document.gd")
func _initialize() -> void:
	var error = Document.bake_lighting(Document.read_source())
	if error != OK:
		push_error("Slime lighting bake failed: "+error_string(error))
		quit(1)
		return
	print("Baked slime lighting color and surface atlases.")
	quit()
