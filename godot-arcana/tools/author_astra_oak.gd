extends SceneTree
const SOURCE = "res://art/source/shop-astra/pixelpen/"
const OUTPUT = "res://art/export/shop-astra/"
const SIZE = Vector2i(64, 16)
const COLORS = ["c0a886", "bca482", "c5ae8d", "b9a17f", "c8b292"]
var expected := PackedByteArray()
func _initialize() -> void:
    call_deferred("run")
func fail(message: String) -> void:
    push_error(message)
    quit(1)
func run() -> void:
    var path = SOURCE + "oak-grain.pxpen"
    if not FileAccess.file_exists(path):
        fail("Existing PixelPen master is missing: " + path); return
    DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(SOURCE))
    DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(OUTPUT))
    var project = ProjectPacker.load_project(path)
    if project == null:
        fail("PixelPen reopen failed before editing"); return
    PixelPen.state.current_project = project
    var palette = PackedColorArray([Color.TRANSPARENT])
    for color in COLORS: palette.append(Color(color))
    project.palette.color_index = palette
    var layer = project.active_frame.layers[0]
    layer.label = "Oak grain - indexed warm clusters"
    expected.resize(SIZE.x * SIZE.y)
    for y in range(SIZE.y):
        for x in range(SIZE.x):
            layer.set_index_on_color_map(x, y, 1)
            expected[y * SIZE.x + x] = 1
    # Deliberately restrained contiguous marks; outer rows and columns stay base color.
    var strokes = [[2,5,18,2],[2,21,29,3],[4,36,54,3],[5,39,48,2],[6,3,15,3],[7,8,21,2],[8,28,43,2],[8,46,59,3],[10,7,22,3],[11,12,26,2],[12,37,56,2],[13,42,52,3]]
    for s in strokes:
        for x in range(s[1], s[2] + 1):
            layer.set_index_on_color_map(x, s[0], s[3])
            expected[s[0] * SIZE.x + x] = s[3]
    project.file_path = path
    if ProjectPacker.save(project, path) != OK:
        fail("PixelPen save failed"); return
    project = ProjectPacker.load_project(path)
    if project == null:
        fail("PixelPen reopen failed"); return
    PixelPen.state.current_project = project
    var image = project.get_image(project.animation_timeline[0].frame)
    image.convert(Image.FORMAT_RGBA8)
    for y in range(SIZE.y):
        for x in range(SIZE.x):
            if image.get_pixel(x, y) != palette[expected[y * SIZE.x + x]]:
                fail("Reopened pixel differs at %d,%d" % [x,y]); return
    var out = OUTPUT + "oak-grain.png"
    if image.save_png(out) != OK:
        fail("PNG export failed"); return
    var exported = Image.load_from_file(out)
    if exported == null or exported.get_size() != SIZE:
        fail("PNG reopen failed"); return
    exported.convert(Image.FORMAT_RGBA8)
    if image.get_data() != exported.get_data():
        fail("PNG pixel or alpha mismatch"); return
    var audit = {"nativePixelPen":true,"savedReopenedExported":true,"size":[64,16],"opaqueColors":COLORS,"fullyOpaque":true,"matchingOppositeEdges":true}
    var file = FileAccess.open(SOURCE + "oak-grain-audit.json", FileAccess.WRITE)
    file.store_string(JSON.stringify(audit, "  "))
    file.close()
    print("ASTRA_OAK ", JSON.stringify(audit))
    layer = null
    project = null
    PixelPen.state.current_project = null
    PixelPen.state.free()
    PixelPen.state = null
    quit()
