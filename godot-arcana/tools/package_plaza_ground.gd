extends SceneTree
func _initialize() -> void:
    call_deferred("pack")
func pack() -> void:
    var source: String = ProjectSettings.globalize_path("res://").path_join("../art-studies/regions/arcana-city-center/source/plaza-mood-v1/ground/")
    for side in ["left", "right"]:
        for kind in ["ground", "ornament"]:
            var input: String = source + kind + "-" + side + ".png"
            var image := Image.load_from_file(input)
            if image == null or image.is_empty():
                push_error("Missing composed floor input " + input)
                quit(1)
                return
            var output: String = "res://art/export/regions/arcana-city-center/plaza-composed/" + kind + "-" + side + ".res"
            if ResourceSaver.save(ImageTexture.create_from_image(image), output, ResourceSaver.FLAG_COMPRESS) != OK:
                quit(1)
                return
    print("PLAZA_ART_GROUND_PACKED")
    quit()
