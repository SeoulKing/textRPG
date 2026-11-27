extends SceneTree
## Preserve existing PixelPen masters. Save, reopen and export every new asset.
func _initialize() -> void:
    call_deferred("author")

func fail(message: String) -> void:
    push_error(message)
    quit(1)

func author() -> void:
    var plan_path := ProjectSettings.globalize_path("res://../art-studies/regions/arcana-city-center/source/plaza-mood-v1/pixelpen-plan.json")
    var plan = JSON.parse_string(FileAccess.get_file_as_string(plan_path))
    if not plan is Dictionary:
        fail("Missing plaza PixelPen plan")
        return
    var audit: Array = []
    for job in plan.jobs:
        var target: String = job.source
        var reused := FileAccess.file_exists(target)
        var project: PixelPenProject
        var applied := 0
        if reused:
            project = ProjectPacker.load_project(target)
        else:
            var input := Image.load_from_file(str(job.input))
            if input == null or input.is_empty():
                fail("Missing preparation " + str(job.id))
                return
            project = PixelPenProject.new()
            project.initialized(input.get_size(), "Arcana plaza - " + str(job.id))
            PixelPen.state.current_project = project
            var uid = project.import_image(input, str(job.id))
            var layer = project.get_index_image(uid)
            layer.label = "Approved plaza art - material clusters and contour"
            var palette: PackedColorArray = project.palette.color_index
            var indices: Dictionary = {}
            for i in palette.size():
                indices[palette[i].to_html(false)] = i
            for edit in job.edits:
                var previous: int = layer.get_index_on_color_map(int(edit.x), int(edit.y))
                if palette[previous].to_html(false) != str(edit.expected) or not indices.has(str(edit.color)):
                    fail("Pixel correction source changed: " + str(job.id))
                    return
                layer.set_index_on_color_map(int(edit.x), int(edit.y), int(indices[str(edit.color)]))
                applied += 1
            project.file_path = target
            if ProjectPacker.save(project, target) != OK:
                fail("Native save failed " + target)
                return
            project = ProjectPacker.load_project(target)
        if project == null:
            fail("Native reopen failed " + target)
            return
        PixelPen.state.current_project = project
        var image: Image = project.get_image(project.animation_timeline[0].frame)
        image.convert(Image.FORMAT_RGBA8)
        if image.get_size() != Vector2i(int(job.size[0]), int(job.size[1])):
            fail("Canvas changed " + target)
            return
        if image.save_png(str(job.output)) != OK:
            fail("PNG export failed " + target)
            return
        # A direct texture resource makes this editor-authored scene usable before import.
        var texture := ImageTexture.create_from_image(image)
        var resource_path := str(job.output).trim_suffix(".png") + ".res"
        if ResourceSaver.save(texture, resource_path, ResourceSaver.FLAG_COMPRESS) != OK:
            fail("Native texture resource export failed " + resource_path)
            return
        audit.append({"id":job.id, "native":target, "output":job.output,
            "resource":resource_path, "nativeEdits":applied, "reusedMaster":reused,
            "savedReopenedExported":true, "size":job.size})
        print("PLAZA_PIXELPEN ", job.id, " edits=", applied, " reused=", reused)
        PixelPen.state.current_project = null
        project = null
    var audit_file := FileAccess.open(plan_path.get_base_dir().path_join("pixelpen-audit.json"), FileAccess.WRITE)
    audit_file.store_string(JSON.stringify({"assets":audit}, "  "))
    audit_file.close()
    if PixelPen.state != null:
        PixelPen.state.current_project = null
        PixelPen.state.free()
        PixelPen.state = null
    quit()
