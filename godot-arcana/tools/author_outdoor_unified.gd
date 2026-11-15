extends SceneTree
## Author/reopen/export through real PixelPen. Existing hand edits always win.
const PLAN = "res://../art-studies/outdoor-unified-v1/pixelpen-plan.json"
func _initialize() -> void: call_deferred("run")
func fail(message: String) -> void:
    push_error(message)
    quit(1)
func hex_at(colors: PackedColorArray, index: int) -> String:
    return colors[index].to_html(false)
func run() -> void:
    var plan_path = ProjectSettings.globalize_path("res://").path_join("../art-studies/outdoor-unified-v1/pixelpen-plan.json")
    var plan = JSON.parse_string(FileAccess.get_file_as_string(plan_path))
    if not plan is Dictionary:
        fail("Missing outdoor PixelPen plan"); return
    var audits: Array = []
    for job in plan.jobs:
        var source: String = job.source
        var reused = FileAccess.file_exists(source)
        var project: PixelPenProject
        var applied = 0
        if reused:
            project = ProjectPacker.load_project(source)
            if project == null:
                fail("Could not reopen " + source); return
        else:
            var input = Image.load_from_file(job.input)
            if input == null or input.is_empty():
                fail("Could not load preparation for " + str(job.id)); return
            project = PixelPenProject.new()
            project.initialized(input.get_size(), "Arcana outdoors - " + str(job.id))
            PixelPen.state.current_project = project
            var uid = project.import_image(input, str(job.id) + "-reference.png")
            var layer = project.get_index_image(uid)
            layer.label = "Artwork - contour, material ramps and pixel corrections"
            var colors = project.palette.color_index
            var by_hex: Dictionary = {}
            for i in range(colors.size()): by_hex[hex_at(colors, i)] = i
            # Reviewable sparse edits, preserving alpha silhouettes and high-contrast features.
            for edit in job.edits:
                var x = int(edit.x)
                var y = int(edit.y)
                var previous = layer.get_index_on_color_map(x,y)
                if hex_at(colors,previous) != str(edit.expected) or not by_hex.has(str(edit.color)):
                    fail("Source differs from reviewed pixel at " + str(job.id)); return
                layer.set_index_on_color_map(x,y,int(by_hex[str(edit.color)]))
                applied += 1
            project.file_path = source
            if ProjectPacker.save(project, source) != OK:
                fail("Native save failed " + source); return
            project = ProjectPacker.load_project(source)
            if project == null:
                fail("Native reload failed " + source); return
        PixelPen.state.current_project = project
        var image = project.get_image(project.animation_timeline[0].frame)
        image.convert(Image.FORMAT_RGBA8)
        if image.get_size() != Vector2i(int(job.size[0]),int(job.size[1])):
            fail("Registered canvas changed " + source); return
        if image.save_png(str(job.output)) != OK:
            fail("PNG export failed " + str(job.id)); return
        audits.append({"id":job.id,"source":source,"export":job.output,"nativeEdits":applied,"reusedExistingMaster":reused,"savedReopenedExported":true,"size":job.size})
        print("PIXELPEN_OUTDOOR ",job.id," edits=",applied," reused=",reused)
        PixelPen.state.current_project = null
        project = null
    var audit_path = plan_path.get_base_dir().path_join("pixelpen-audit.json")
    var file = FileAccess.open(audit_path,FileAccess.WRITE)
    file.store_string(JSON.stringify({"nativePixelPen":true,"assets":audits},"  "));file.close()
    PixelPen.state.current_project = null
    PixelPen.state.free();PixelPen.state = null
    quit()
