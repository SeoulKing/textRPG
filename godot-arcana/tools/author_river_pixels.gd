extends SceneTree
## Native indexed-pixel redraw from the approved color/shape reference.
## No bitmap import into the new masters, no resized final image, no UV animation.
const SOURCE := "res://art/source/river-pixel-v5/"
const OUT := "res://art/export/river-pixel-v5/"
const STUDY := "res://../art-studies/regions/arcana-city-center/source/river-pixel-v5/"
const SIZE := 448
const FRAMES := 16
const PALETTE: Array[String] = ["00000000","177dc7","1a81cc","1b85d2","1c88d7","208ddb","2593e0","2c9ae3","329fe6","38a4e9","3eaaed","46b1f0","4fb9f4","5cc4f8","71d6fb","85e5fd","99f0fd"]
var palette := PackedColorArray()
var guide: Image
var field := PackedInt32Array()
var waves: Array[Dictionary] = []
var native_edits: int = 0
func _initialize() -> void: call_deferred("author")
func fail(message: String) -> void:
    push_error(message)
    quit(1)
func nearest(color: Color) -> int:
    var best := 1
    var distance := INF
    for i in range(1,palette.size()):
        var c: Color = palette[i]
        var d: float = absf(color.r-c.r)+absf(color.g-c.g)+absf(color.b-c.b)
        if d < distance: distance = d; best = i
    return best
func make_layer(project: PixelPenProject, name: String) -> IndexedColorImage:
    var layer := IndexedColorImage.new()
    layer.layer_uid = project.get_uid()
    layer.label = name
    layer.size = Vector2i(SIZE,SIZE)
    layer.visible = true
    return layer
func dot(layer: IndexedColorImage, x: int, y: int, color: int) -> void:
    layer.set_index_on_color_map(posmod(x,SIZE),posmod(y,SIZE),color)
    native_edits += 1
func blank_project(label: String) -> PixelPenProject:
    var project := PixelPenProject.new()
    project.initialized(Vector2i(SIZE,SIZE),label)
    PixelPen.state.current_project = project
    project.palette.color_index = palette
    project.pool_frames.clear()
    project.animation_timeline.clear()
    project.animation_fps = 8.0
    project.animation_loop = true
    project.show_timeline = true
    project.onion_skinning = true
    return project
func add_frame(project: PixelPenProject, layers: Array[IndexedColorImage]) -> void:
    var frame = Frame.create(project.get_uid())
    for layer in layers: frame.layers.append(layer)
    frame.layer_active_uid = layers[-1].layer_uid
    project.pool_frames.append(frame)
    var cell = AnimationCell.create(project.get_uid())
    cell.frame = frame
    project.animation_timeline.append(cell)
func finish(project: PixelPenProject, file: String) -> PixelPenProject:
    project.canvas_pool_frame_uid = project.pool_frames[0].frame_uid
    project.active_layer_uid = project.pool_frames[0].layers[-1].layer_uid
    project.animation_frame_index = 0
    project.file_path = file
    if ProjectPacker.save(project,file) != OK: return null
    return ProjectPacker.load_project(file)
func texture(image: Image, name: String) -> Texture2D:
    if image.save_png(OUT+name+".png") != OK: return null
    if ResourceSaver.save(ImageTexture.create_from_image(image),OUT+name+".res",ResourceSaver.FLAG_COMPRESS) != OK: return null
    return load(OUT+name+".res") as Texture2D
func prepare_reference() -> bool:
    var original := ProjectPacker.load_project("res://art/source/river-clear-v4/base.pxpen")
    if original == null: return false
    PixelPen.state.current_project = original
    guide = original.get_image(original.animation_timeline[0].frame)
    guide.convert(Image.FORMAT_RGBA8)
    field.resize(SIZE*SIZE)
    # Twice as many reference contours in the same world area. Every new pixel
    # is assigned an explicit palette index; the color hierarchy stays approved.
    for y in SIZE:
        for x in SIZE:
            field[y*SIZE+x] = nearest(guide.get_pixel(posmod(x*2,SIZE),posmod(y*2,SIZE)))
    # Trace bright runs as drawing guides, then redraw them as narrow pixel crests.
    for y in range(1,SIZE,4):
        var x := 0
        while x < SIZE:
            if field[y*SIZE+x] < 12: x += 1; continue
            var begin := x
            while x < SIZE and field[y*SIZE+x] >= 12: x += 1
            var length := x-begin
            if length >= 2:
                waves.append({"x":begin,"y":y,"length":clampi(length,4,15),"phase":posmod(begin*7+y*11,FRAMES),"bend":posmod(begin+y,3)})
    return true
func base_art() -> Texture2D:
    var file := SOURCE+"base.pxpen"
    var project: PixelPenProject
    if FileAccess.file_exists(file): project = ProjectPacker.load_project(file)
    else:
        project = blank_project("Approved clear river - native contour and detail redraw")
        var depth := make_layer(project,"Native depth clusters - fixed blue body")
        var detail := make_layer(project,"One-pixel current edges and fine connected rivulets")
        for y in SIZE:
            for x in SIZE:
                var c: int = mini(11,field[y*SIZE+x])
                dot(depth,x,y,c)
                var below: int = mini(11,field[posmod(y+1,SIZE)*SIZE+x])
                if c >= 6 and c-below >= 3 and posmod(x+y,5) != 0:
                    dot(detail,x,y,mini(12,c+1))
        for ty in 7:
            for tx in 7:
                for stroke in 5:
                    var x: int = tx*64+posmod(tx*19+ty*31+stroke*13,61)
                    var y: int = ty*64+posmod(tx*11+ty*23+stroke*17,61)
                    var length: int = 4+posmod(tx*7+ty*3+stroke*5,7)
                    var c: int = mini(11,field[y*SIZE+x])
                    for dx in length:
                        var bend: int = 1 if dx < 2 or dx > length-3 else 0
                        dot(detail,x+dx,y+bend,mini(12,c+1))
                        if dx > 1 and dx < length-2:
                            dot(detail,x+dx,y+bend+1,maxi(1,c-1))
        add_frame(project,[depth,detail])
        project = finish(project,file)
    if project == null: return null
    PixelPen.state.current_project = project
    var image: Image = project.get_image(project.animation_timeline[0].frame)
    image.convert(Image.FORMAT_RGBA8)
    return texture(image,"base")
func highlights() -> Texture2D:
    var file := SOURCE+"highlights.pxpen"
    var project: PixelPenProject
    if FileAccess.file_exists(file): project = ProjectPacker.load_project(file)
    else:
        project = blank_project("Crest-aligned highlight flow - 16 native pixel frames")
        for f in FRAMES:
            var shoulder := make_layer(project,"Cyan shoulder attached to the crest")
            var crest := make_layer(project,"Moving one-pixel bright water crest")
            for wave in waves:
                var age: int = (f+int(wave.phase))%FRAMES
                var envelope: int = [0,0,1,1,2,2,3,3,3,3,2,2,1,1,0,0][age]
                if envelope == 0: continue
                var x: int = int(wave.x)+int(age/2)-3
                var y: int = int(wave.y)+(1 if age in [6,7,8,9] and int(wave.bend) == 1 else 0)
                var length: int = maxi(3,int(wave.length)-2+(1 if envelope >= 2 else 0))
                var c: int = 12 if envelope == 1 else (14 if envelope == 2 else 15)
                for dx in length:
                    var bend: int = 1 if (dx < 2 or dx > length-3) and int(wave.bend) != 2 else 0
                    dot(crest,x+dx,y+bend,c)
                    dot(shoulder,x+dx,y+bend+1,maxi(11,c-2))
                    if envelope == 3 and length >= 7 and dx >= 2 and dx <= 4:
                        dot(crest,x+dx,y+bend,16)
            add_frame(project,[shoulder,crest])
        project = finish(project,file)
    if project == null: return null
    PixelPen.state.current_project = project
    var atlas := Image.create(SIZE*4,SIZE*4,false,Image.FORMAT_RGBA8)
    atlas.fill(Color.TRANSPARENT)
    DirAccess.make_dir_recursive_absolute(OUT+"frames")
    for f in FRAMES:
        var image: Image = project.get_image(project.animation_timeline[f].frame)
        image.convert(Image.FORMAT_RGBA8)
        atlas.blit_rect(image,Rect2i(0,0,SIZE,SIZE),Vector2i(f%4*SIZE,int(f/4)*SIZE))
        if image.save_png(OUT+"frames/highlight-%02d.png"%f) != OK: return null
    return texture(atlas,"highlights")
func make_tiles(image: Texture2D, columns: int, rows: int, name: String) -> TileSet:
    var tiles := TileSet.new()
    tiles.tile_size = Vector2i(64,64)
    var source := TileSetAtlasSource.new()
    source.texture = image
    source.texture_region_size = Vector2i(64,64)
    source.use_texture_padding = false
    for y in rows:
        for x in columns: source.create_tile(Vector2i(x,y))
    tiles.add_source(source,0)
    if ResourceSaver.save(tiles,OUT+name+".tres") != OK: return null
    return load(OUT+name+".tres") as TileSet
func connect_scene(base: TileSet, glints: TileSet) -> bool:
    var scene := (load("res://scenes/native_2d/city_river_quarter.tscn") as PackedScene).instantiate()
    var water := scene.get_node("Water") as TileMapLayer
    water.tile_set = base
    var overlay := scene.get_node_or_null("HighlightFlow") as TileMapLayer
    var created := overlay == null
    if created:
        overlay = TileMapLayer.new()
        overlay.name = "HighlightFlow"
        overlay.position = water.position
        overlay.z_index = -29
        overlay.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
        overlay.set_meta("casts_sun_shadow",false)
        scene.add_child(overlay)
        overlay.owner = scene
    overlay.tile_set = glints
    if created:
        for cell in water.get_used_cells():
            var tile: Vector2i = water.get_cell_atlas_coords(cell)
            overlay.set_cell(cell,0,Vector2i(posmod(tile.x,7),posmod(tile.y,7)))
    (scene.get_node("RippleDots") as TileMapLayer).visible = false
    scene.set_meta("water_pixel_redraw","river-pixel-v5")
    var output := PackedScene.new()
    if output.pack(scene) != OK: scene.free(); return false
    var error := ResourceSaver.save(output,"res://scenes/native_2d/city_river_quarter.tscn")
    scene.free()
    return error == OK
func author() -> void:
    for c in PALETTE: palette.append(Color(c))
    DirAccess.make_dir_recursive_absolute(SOURCE)
    DirAccess.make_dir_recursive_absolute(OUT)
    DirAccess.make_dir_recursive_absolute(STUDY)
    if not prepare_reference(): fail("Missing approved native reference"); return
    var base := base_art()
    var overlay := highlights()
    if base == null or overlay == null: fail("Native pixel river export failed"); return
    var base_tiles := make_tiles(base,7,7,"base-tiles")
    var glow_tiles := make_tiles(overlay,28,28,"highlight-tiles")
    if base_tiles == null or glow_tiles == null or not connect_scene(base_tiles,glow_tiles):
        fail("Native pixel river scene connection failed"); return
    var plan := FileAccess.open(STUDY+"highlight-plan.json",FileAccess.WRITE)
    plan.store_string(JSON.stringify({"reference":"river-clear-v4/base.pxpen","referenceDetailFrequency":2,"waves":waves},"  "))
    plan.close()
    var file := FileAccess.open(STUDY+"pixelpen-audit.json",FileAccess.WRITE)
    file.store_string(JSON.stringify({"nativeIndexedAssignments":native_edits,"bitmapImported":false,"palette":PALETTE,"size":[SIZE,SIZE],"baseLayers":2,"highlightLayersPerFrame":2,"highlightFrames":FRAMES,"highlightFps":8,"highlightPaths":waves.size(),"textureAtlas":[1792,1792],"savedReopenedExported":true,"worldPixelsPerUnit":64,"wholeSurfaceScroll":false,"uvWarp":false},"  "))
    file.close()
    if PixelPen.state != null:
        PixelPen.state.current_project = null
        PixelPen.state.free()
        PixelPen.state = null
    print("RIVER_PIXEL_AUTHORED indexed=",native_edits," tracedCreasts=",waves.size()," frames=16")
    quit()
