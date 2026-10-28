extends SceneTree
const Document = preload("res://addons/pixel_workshop/pixel_document.gd")
func _initialize() -> void:
	var data = Document.read_source()
	var error = Document.bake(data)
	if error != OK:
		push_error("Slime bake failed: "+error_string(error))
		quit(1)
		return
	var frame = Document.frame_image(data,"idle",0)
	frame.resize(256,320,Image.INTERPOLATE_NEAREST)
	frame.save_png("res://art/reference/slime/idle-large.png")
	print("Baked slime atlas + SpriteFrames from editable pixel document.")
	quit()
