extends SceneTree

const DEFAULT_WORK := ".runtime/arcana-kitchen-layout-v3"
const DEFAULT_NAME := "kitchen-5x5-layout"

func _initialize() -> void:
    call_deferred("export_layout")

func fail(message: String) -> void:
    printerr(message)
    quit(1)

func export_layout() -> void:
    var root_dir := ProjectSettings.globalize_path("res://").path_join("..").simplify_path()
    var work := root_dir.path_join(DEFAULT_WORK)
    var name := DEFAULT_NAME
    var title := "아르카나 · 5×5 주방 배치"
    for arg in OS.get_cmdline_user_args():
        if arg.begins_with("--work="):
            work = root_dir.path_join(arg.trim_prefix("--work="))
        elif arg.begins_with("--name="):
            name = arg.trim_prefix("--name=").get_file()
        elif arg.begins_with("--title="):
            title = arg.trim_prefix("--title=")
    var output := root_dir.path_join("art-studies/regions/arcana-kitchen-iso-v1")
    var project_file := output.path_join(name + ".pxpen")
    var png_file := output.path_join(name + ".png")
    var data: Variant = JSON.parse_string(FileAccess.get_file_as_string(work.path_join("kitchen-layers.json")))
    var rgb := FileAccess.get_file_as_bytes(work.path_join("kitchen-palette.bin"))
    if not data is Array or data.is_empty() or rgb.is_empty() or rgb.size() > 1024 or rgb.size() % 4 != 0:
        fail("Could not load the kitchen layout layers. Run build-kitchen-layout.py first.")
        return

    var intended := Image.load_from_file(work.path_join("review-native.png"))
    if intended == null or intended.is_empty():
        fail("Unable to find the reviewed native kitchen image")
        return
    intended.convert(Image.FORMAT_RGBA8)
    var size := intended.get_size()

    var project := PixelPenProject.new()
    PixelPen.state.current_project = project
    project.initialized(size,title,project_file,false)
    var palette := PackedColorArray()
    for i in range(0,rgb.size(),4):
        palette.append(Color8(rgb[i],rgb[i+1],rgb[i+2],rgb[i+3]))
    project.palette.color_index = palette
    project.palette.grid_sync_to_palette()

    for entry in data:
        var pixels := FileAccess.get_file_as_bytes(work.path_join(entry.data))
        if pixels.size() != size.x * size.y:
            fail("Unexpected pixel grid on " + entry.name)
            return
        var id := project.add_layer(entry.name)
        var layer := project.get_index_image(id)
        layer.colormap.set_data(size.x,size.y,false,Image.FORMAT_R8,pixels)
        layer.visible = entry.visible
        if entry.name.begins_with("화덕 위 주전자"):
            project.active_layer_uid = id
    project.last_export_file_path = png_file
    var assembled := project.get_image()
    assembled.convert(Image.FORMAT_RGBA8)
    if assembled.get_data() != intended.get_data():
        fail("The native composite differs from the reviewed layout")
        return
    if ProjectPacker.save(project,project_file) != OK:
        fail("Unable to save the layered PixelPen layout")
        return

    var reopened := ProjectPacker.load_project(project_file)
    if reopened == null or reopened.canvas_size != size or reopened.active_frame.layers.size() != data.size():
        fail("Unable to reopen the layout")
        return
    if reopened.active_frame.layers.back().visible or reopened.active_layer_uid == Vector3i.ZERO:
        fail("The saved tile guide or kettle layer has the wrong state")
        return
    PixelPen.state.current_project = reopened
    var image := reopened.get_image()
    image.convert(Image.FORMAT_RGBA8)
    if image.get_data() != intended.get_data():
        fail("Reopened PixelPen project did not match the reviewed artwork")
        return
    if reopened.export_png_image(png_file) != OK or Image.load_from_file(png_file).get_data() != image.get_data():
        fail("The exported kitchen PNG did not round-trip")
        return

    var preview := Image.create(size.x,size.y,false,Image.FORMAT_RGBA8)
    preview.fill(Color.html("3f3535"))
    preview.blend_rect(image,Rect2i(Vector2i.ZERO,size),Vector2i.ZERO)
    preview.resize(size.x*2,size.y*2,Image.INTERPOLATE_NEAREST)
    preview.save_png(work.path_join("kitchen-layout-2x.png"))
    print("PIXELPEN: saved and reopened ",size,"; ",data.size()," layers; hidden tile grid; PNG matches")
    PixelPen.state.current_project = null
    PixelPen.state.free()
    PixelPen.state = null
    quit()
