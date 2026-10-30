extends SceneTree
## First authoring uses the approved sprite as a PixelPen reference layer.
## Later runs only export the saved native project; --create never overwrites it.
const BASE = "res://art/source/plaza-guide/idle-v2"
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

func breathe(layer: IndexedColorImage, source: Image, stage: int) -> void:
    # Local native pixel redraws. Face, neck, brooch, hands/map and boots stay exact.
    var patches = []
    if stage == 1:
        patches = [[40,66,42,67],[60,64,62,65]]
    elif stage == 2:
        patches = [[39,65,44,68],[59,63,64,66],[45,69,47,70],[52,68,54,69]]
    elif stage == 3:
        patches = [[38,69,42,71],[61,68,65,70]]
    for patch in patches:
        for y in range(int(patch[1]),int(patch[3])+1):
            for x in range(int(patch[0]),int(patch[2])+1):
                var value = source.get_pixel(x,y+1).r8
                # Never erase the sprite or paint into its transparent exterior.
                if value>0 and source.get_pixel(x,y).r8>0: dot(layer,x,y,value)

func blink(layer: IndexedColorImage, colors: PackedColorArray, phase: int) -> void:
    var skin = colors.find(Color8(244,205,155))
    var lid = colors.find(Color8(91,66,64))
    var original = layer.colormap.duplicate()
    # Individual visible columns follow the original curved eyes, including the hair overlap.
    var columns = [[38,46,48],[39,46,50],[40,45,50],[41,44,50],[42,44,50],[43,44,50],[44,45,50],[45,46,50],
        [53,44,48],[54,43,49],[55,43,49],[56,42,49],[57,42,48],[58,43,48],[59,43,48],[60,44,45]]
    for column in columns:
        var x = int(column[0])
        var top = int(column[1])
        var bottom = int(column[2])
        for y in range(top,bottom+1): dot(layer,x,y,skin)
        if phase == 3: continue
        # Close each eye column along its own contour, preserving the iris and lid colors.
        var removed = 1 if phase==1 else 3
        var start = mini(bottom,top+removed)
        for y in range(start,bottom+1):
            var sy = top+roundi(float(y-start)*float(bottom-top)/maxi(1,bottom-start))
            dot(layer,x,y,original.get_pixel(x,sy).r8)
    if phase==3:
        for point in [[39,48],[40,49],[41,49],[42,50],[43,49],[44,49],[45,48],
            [53,46],[54,47],[55,47],[56,48],[57,47],[58,47],[59,46]]:
            dot(layer,int(point[0]),int(point[1]),lid)

func create_project() -> void:
    var reference = Image.load_from_file(REFERENCE)
    var project = ProjectPacker.load_project("res://art/source/plaza-guide/idle-v1/mei-idle.pxpen")
    project.project_name = "메이 · 정면 대기 보정 v2"
    project.pool_frames.clear()
    project.animation_timeline.clear()
    project.animation_fps = 12.0
    project.animation_loop = true
    project.show_timeline = true
    project.onion_skinning = true
    var sequence: Array[int] = []
    var variants: Dictionary = {}
    for tick in range(96):
        var breathing_tick = tick%48
        var stage = 0
        if breathing_tick>=10 and breathing_tick<17: stage=1
        elif breathing_tick>=17 and breathing_tick<27: stage=2
        elif breathing_tick>=27 and breathing_tick<33: stage=3
        elif breathing_tick>=33 and breathing_tick<39: stage=1
        var eye = 0
        # Blinks are brief and do not coincide with the breath turnarounds.
        if tick in [22,75]: eye=1
        elif tick in [23,77]: eye=2
        elif tick in [24,25,76]: eye=3
        var key = str(stage)+"/"+str(eye)
        if not variants.has(key):
            var frame = Frame.create(project.get_uid())
            var layer = layer_from_image(project,reference,"호흡%d · 눈%d"%[stage,eye],true)
            frame.layers.append(layer)
            frame.layers.append(layer_from_image(project,reference,"REFERENCE · 승인 메이 · 표시 전용",false))
            frame.layer_active_uid = layer.layer_uid
            var original = layer.colormap.duplicate()
            breathe(layer,original,stage)
            if eye>0: blink(layer,project.palette.color_index,eye)
            variants[key]=project.pool_frames.size()
            project.pool_frames.append(frame)
        var pose = int(variants[key])
        sequence.append(pose)
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
    var atlas = Image.create(96*project.pool_frames.size(),136,false,Image.FORMAT_RGBA8)
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
