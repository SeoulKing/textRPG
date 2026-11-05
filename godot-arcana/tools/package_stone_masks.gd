extends SceneTree
func _initialize() -> void: call_deferred("pack")
func pack() -> void:
    for side in ["left","right"]:
        var base: String = "res://art/export/stone-floor-v1/ornament-mask-"+str(side)
        var image := Image.load_from_file(base+".png")
        if image == null: quit(1); return
        if ResourceSaver.save(ImageTexture.create_from_image(image),base+".res",ResourceSaver.FLAG_COMPRESS) != OK: quit(1); return
    print("STONE_ORNAMENT_MASKS_PACKED")
    quit()
