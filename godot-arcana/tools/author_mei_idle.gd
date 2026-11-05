extends SceneTree
## First authoring uses the approved sprite as a PixelPen reference layer.
## Later runs only export the saved native project; --create never overwrites it.
const BASE = "res://art/source/plaza-guide/idle-v1"
const NATIVE = BASE + "/mei-idle.pxpen"
const REFERENCE = "res://art/export/plaza-guide/plaza-guide.png"
const OUT = "res://art/export/plaza-guide/mei-idle.png"
var edits: Array[Dictionary] = []

func _initialize() -> void:
    call_deferred("run")

func layer_from_image(project: PixelPenProject, image: Image, label: String, shown: bool) -> IndexedColorImage:
    var layer = IndexedColorImage.new()
    layer.layer_uid = project.get_uid()
    layer.label = label
    layer.size = Vector2i(96,136)
    layer.visible = shown
    for y in range(136):
        for x in range(96):
            layer.set_index_on_color_map(x,y,project.palette.color_index.find(image.get_pixel(x,y)))
    return layer

func dot(layer: IndexedColorImage, x: int, y: int, color: int) -> void:
    var before = layer.get_index_on_color_map(x,y)
    if before == color: return
    edits.append({"layer":layer.label,"x":x,"y":y,"before":before,"after":color})
    layer.set_index_on_color_map(x,y,color)

func blink(layer: IndexedColorImage, colors: PackedColorArray, closed: bool) -> void:
    var skin = colors.find(Color8(244,205,155))
    var lid = colors.find(Color8(91,66,64))
    # Per-eye visible outlines preserve the asymmetric hair overlap and eye height.
    var rows = [[44,41,43],[45,40,44],[46,38,45],[47,38,45],[48,38,45],[49,39,45],[50,40,45],
        [42,56,57],[43,54,59],[44,53,60],[45,53,60],[46,53,59],[47,53,59],[48,53,58],[49,54,56]]
    for row in rows:
        var cutoff = 51 if int(row[1])<50 else 50
        if not closed: cutoff = 48 if int(row[1])<50 else 46
        if int(row[0])>=cutoff: continue
        for x in range(int(row[1]),int(row[2])+1): dot(layer,x,int(row[0])-1,skin)
    var left = [[39,48],[40,49],[41,49],[42,49],[43,49],[44,49],[45,48]] if closed else [[39,47],[40,47],[41,47],[42,47],[43,47],[44,47],[45,47]]
    var right = [[53,46],[54,47],[55,47],[56,47],[57,47],[58,47],[59,46]] if closed else [[53,45],[54,45],[55,45],[56,45],[57,45],[58,45],[59,45]]
    for point in left+right: dot(layer,int(point[0]),int(point[1])-1,lid)

func create_project() -> void:
    var reference = Image.load_from_file(REFERENCE)
    var project = PixelPenProject.new()
    project.initialized(Vector2i(96,136),"메이 · 정면 대기",NATIVE,false)
    project.pool_frames.clear()
    project.animation_timeline.clear()
    project.palette.color_index = PackedColorArray([Color.TRANSPARENT])
    for y in range(136):
        for x in range(96):
            var color = reference.get_pixel(x,y)
            if not project.palette.color_index.has(color): project.palette.color_index.append(color)
    project.sync_gui_palette()
    project.animation_fps = 10.0
    project.animation_loop = true
    project.show_timeline = true
    project.onion_skinning = true
    for pose in range(4):
        var frame = Frame.create(project.get_uid())
        var layer = layer_from_image(project,reference,["중립","들숨","반쯤 감기","눈 감기"][pose],true)
        frame.layers.append(layer)
        # The approved native pixels remain in every frame as an independent reference.
        frame.layers.append(layer_from_image(project,reference,"REFERENCE · 승인 메이 · 표시 전용",false))
        frame.layer_active_uid = layer.layer_uid
        if pose>0:
            # One-pixel lift keeps head/neck/shoulders/map together. Boots and hem stay planted.
            var original = layer.colormap.duplicate()
            for y in range(16,90):
                for x in range(96): dot(layer,x,y,original.get_pixel(x,y+1).r8)
            if pose>=2: blink(layer,project.palette.color_index,pose==3)
        project.pool_frames.append(frame)
    var sequence: Array[int] = []
    for segment in [[0,12],[1,8],[2,1],[3,1],[2,1],[1,5],[0,12]]:
        for i in range(int(segment[1])): sequence.append(int(segment[0]))
    for pose in sequence:
        var cell = AnimationCell.create(project.get_uid())
        cell.frame = project.pool_frames[pose]
        project.animation_timeline.append(cell)
    project.canvas_pool_frame_uid = project.pool_frames[0].frame_uid
    project.active_layer_uid = project.pool_frames[0].layers[0].layer_uid
    project.animation_frame_index = 0
    project.file_path = NATIVE
    if ProjectPacker.save(project,NATIVE)!=OK:
        push_error("Native PixelPen save failed");quit(1);return
    var audit = FileAccess.open(BASE+"/pixelpen-edits.json",FileAccess.WRITE)
    audit.store_string(JSON.stringify({"reference":REFERENCE,"native_api":"IndexedColorImage.set_index_on_color_map","edits":edits},"  "))
    audit.close()

func run() -> void:
    DirAccess.make_dir_recursive_absolute(BASE+"/native-frames")
    if OS.get_cmdline_user_args().has("--create"):
        if FileAccess.file_exists(NATIVE):
            push_error("Preserve the saved PixelPen project; run without --create to export edits")
            quit(1);return
        create_project()
    var project = ProjectPacker.load_project(NATIVE)
    if project==null:
        push_error("Cannot reload saved PixelPen project");quit(1);return
    var atlas = Image.create(96*4,136,false,Image.FORMAT_RGBA8)
    for pose in range(project.pool_frames.size()):
        var image = project.get_image(project.pool_frames[pose])
        image.convert(Image.FORMAT_RGBA8)
        image.save_png(BASE+"/native-frames/pose-%02d.png"%pose)
        atlas.blit_rect(image,Rect2i(0,0,96,136),Vector2i(pose*96,0))
    atlas.save_png(OUT)
    var sequence: Array[int] = []
    for cell in project.animation_timeline: sequence.append(project.pool_frames.find(cell.frame))
    var manifest = {"name":"메이","frame":[96,136],"foot":[48,116],"pixelsPerUnit":64,
        "fps":project.animation_fps,"loop":project.animation_loop,"sequence":sequence,
        "poses":project.pool_frames.size(),"reference":REFERENCE,"native":NATIVE,
        "nativeSavedAndReloaded":true,"referenceLayer":true,"feetFixed":true}
    var file = FileAccess.open(BASE+"/animation.json",FileAccess.WRITE)
    file.store_string(JSON.stringify(manifest,"  "));file.close()
    print("PIXELPEN_MEI_IDLE: saved/reloaded; ",project.pool_frames.size()," poses; ",sequence.size()," timeline cells")
    project=null
    PixelPen.state.free();PixelPen.state=null
    quit()
