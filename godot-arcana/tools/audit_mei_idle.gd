extends SceneTree
## Read the saved PixelPen project through its native loader and compositor.
const BASE = "res://art/source/plaza-guide/idle-v2"
const OUT = BASE + "/frame-audit"
func _initialize() -> void:
    call_deferred("run")
func run() -> void:
    var project = ProjectPacker.load_project(BASE+"/mei-idle.pxpen")
    if project == null:
        push_error("Cannot open saved Mei PixelPen project")
        quit(1)
        return
    DirAccess.make_dir_recursive_absolute(OUT)
    var poses: Array[Dictionary] = []
    var timeline: Array[Dictionary] = []
    var errors: Array[String] = []
    var expected = JSON.parse_string(FileAccess.get_file_as_string(BASE+"/animation.json"))
    for index in range(project.pool_frames.size()):
        var frame = project.pool_frames[index]
        var image: Image = project.get_image(frame)
        image.convert(Image.FORMAT_RGBA8)
        var opaque = 0
        var partial = 0
        for y in range(image.get_height()):
            for x in range(image.get_width()):
                var alpha = image.get_pixel(x,y).a8
                if alpha == 255: opaque += 1
                elif alpha != 0: partial += 1
        var layers: Array[Dictionary] = []
        for layer in frame.layers:
            layers.append({"label":layer.label,"visible":layer.visible,"size":str(layer.size)})
        var previous = Image.load_from_file(ProjectSettings.globalize_path(BASE+"/native-frames/pose-%02d.png"%index))
        previous.convert(Image.FORMAT_RGBA8)
        var entry = {"pose":index,"opaquePixels":opaque,"partialAlphaPixels":partial,"bounds":str(image.get_used_rect()),"layers":layers,"matchesPreviousExport":image.get_data()==previous.get_data()}
        poses.append(entry)
        if opaque == 0: errors.append("Empty pose %d"%index)
        if image.get_size()!=Vector2i(96,136): errors.append("Wrong size pose %d"%index)
        if partial != 0: errors.append("Partial alpha pose %d"%index)
        image.save_png(OUT+"/pose-%02d.png"%index)
    if project.animation_timeline.size() != expected.sequence.size():
        errors.append("Timeline length differs from packaged sequence")
    for tick in range(project.animation_timeline.size()):
        var cell = project.animation_timeline[tick]
        var pose = project.pool_frames.find(cell.frame)
        if pose < 0:
            errors.append("Missing frame at tick %d"%tick)
        elif tick >= expected.sequence.size() or pose != int(expected.sequence[tick]):
            errors.append("Timeline/export mismatch at tick %d"%tick)
        timeline.append({"tick":tick,"pose":pose})
    var report = {"native":"mei-idle.pxpen","nativeSHA256":FileAccess.get_sha256(BASE+"/mei-idle.pxpen"),"api":"ProjectPacker.load_project + PixelPenProject.get_image","fps":project.animation_fps,"loop":project.animation_loop,"poses":poses,"timeline":timeline,"errors":errors}
    var file = FileAccess.open(OUT+"/audit.json",FileAccess.WRITE)
    file.store_string(JSON.stringify(report,"  "))
    file.close()
    print("PIXELPEN_AUDIT: ",poses.size()," poses; ",timeline.size()," cells; errors=",errors)
    for pose in poses: print("POSE ",pose.pose," opaque=",pose.opaquePixels," bounds=",pose.bounds," previous_match=",pose.matchesPreviousExport," layers=",pose.layers)
    project = null
    PixelPen.state.free()
    PixelPen.state = null
    quit(0 if errors.is_empty() else 1)
