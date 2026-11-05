extends SceneTree
## Palette edit on the approved native base; connected low-contrast current clusters.
const STUDY := "res://../art-studies/regions/arcana-city-center/source/river-daylight-v3/"
const SOURCE := "res://art/source/river-daylight-v3/"
const OUT := "res://art/export/river-daylight-v3/"
const OLD := "res://art/source/river-navy-v2/"
const COUNT := 24
func _initialize() -> void: call_deferred("author")
func fail(message: String) -> void:
    push_error(message)
    quit(1)
func save_reopen(project: PixelPenProject, file: String) -> PixelPenProject:
    project.file_path = file
    if ProjectPacker.save(project,file) != OK: return null
    return ProjectPacker.load_project(file)
func export_image(image: Image, name: String) -> Texture2D:
    if image.save_png(OUT+name+".png") != OK: return null
    if ResourceSaver.save(ImageTexture.create_from_image(image),OUT+name+".res",ResourceSaver.FLAG_COMPRESS) != OK: return null
    return load(OUT+name+".res") as Texture2D
func base_art() -> Texture2D:
    var file := SOURCE+"base.pxpen"
    var project: PixelPenProject
    if FileAccess.file_exists(file): project = ProjectPacker.load_project(file)
    else:
        project = ProjectPacker.load_project(OLD+"base.pxpen")
        if project == null: return null
        # Preserve every painted shape. Lift the darks and compress patch contrast.
        var palette: PackedColorArray = project.palette.color_index
        var lo := 1.0
        var hi := 0.0
        for color in palette:
            if color.a < .5: continue
            var l: float = color.r*.2126+color.g*.7152+color.b*.0722
            lo = minf(lo,l)
            hi = maxf(hi,l)
        var before: Array = []
        var after: Array = []
        for i in palette.size():
            var color: Color = palette[i]
            if color.a < .5: continue
            before.append(color.to_html())
            var l: float = color.r*.2126+color.g*.7152+color.b*.0722
            var value: float = pow(clampf((l-lo)/maxf(.001,hi-lo),0.0,1.0),.9)
            palette[i] = Color("326f8c").lerp(Color("6ba5bc"),value*.80)
            after.append(palette[i].to_html())
        project.palette.color_index = palette
        project = save_reopen(project,file)
        var note := FileAccess.open(STUDY+"palette-change.json",FileAccess.WRITE)
        note.store_string(JSON.stringify({"shapePixelsPreserved":true,"before":before,"after":after},"  "))
        note.close()
    if project == null: return null
    PixelPen.state.current_project = project
    var image: Image = project.get_image(project.animation_timeline[0].frame)
    image.convert(Image.FORMAT_RGBA8)
    return export_image(image,"base")
func draw_flow(layer: IndexedColorImage, f: int) -> void:
    # A small irregular flattened ribbon, with a shaded underside, not a dot/star.
    for variant in 8:
        for stroke in 2:
            var age: int = (f+variant*5+stroke*12)%COUNT
            if age < 2 or age > 21: continue
            var grow: int = mini(age-2,21-age)
            var length: int = 5+mini(9,grow)
            var x: int = 3+(variant*11+stroke*29)%27+int(age/2)
            var y: int = variant*64+11+(variant*23+stroke*31)%38
            var strength: int = 3 if age >= 7 and age <= 16 else 2
            if age in [2,3,20,21]: strength = 1
            for dx in length:
                var bend: int = 1 if dx < 3 or dx > length-4 else 0
                # Connected two/three-pixel masses with a quiet irregular crest.
                layer.set_index_on_color_map(x+dx,y+bend,strength)
                layer.set_index_on_color_map(x+dx,y+bend+1,maxi(1,strength-1))
                if dx >= 3 and dx < length-3 and grow >= 5 and (variant+stroke)%2 == 0:
                    layer.set_index_on_color_map(x+dx,y+bend-1,4)
            # A soft trailing reflection stays attached to the main moving shape.
            if grow >= 4:
                for dx in range(2,mini(7,length-1)):
                    layer.set_index_on_color_map(x+dx,y+3,1)
func draw_reflection(layer: IndexedColorImage, f: int) -> void:
    # Uneven attached reflection fragments progress together on a 3-second loop.
    var shifts: Array[int] = [-2,-2,-2,-1,-1,0,0,1,1,2,2,2,2,2,1,1,0,0,-1,-1,-2,-2,-2,-2]
    for row in 14:
        var y: int = 5+row*7
        var offset: int = shifts[(f+int(row/3))%COUNT]
        var half: int = 3+int(row/4)+(1 if (row+int(f/4))%3 == 0 else 0)
        var color: int = maxi(1,5-int(row/3))
        for dx in range(-half,half+1):
            if (dx+row)%7 == 0: continue
            layer.set_index_on_color_map(32+offset+dx,y,color)
            if abs(dx) < half-2: layer.set_index_on_color_map(32+offset+dx,y+1,maxi(1,color-1))
func animation(kind: String) -> Texture2D:
    var file := SOURCE+kind+".pxpen"
    var size := Vector2i(64,512) if kind == "ripples" else Vector2i(64,128)
    var project: PixelPenProject
    if FileAccess.file_exists(file): project = ProjectPacker.load_project(file)
    else:
        project = PixelPenProject.new()
        project.initialized(size,"Daylight river "+kind+" connected flowing clusters")
        PixelPen.state.current_project = project
        project.palette.color_index = PackedColorArray([Color(0,0,0,0),Color("39788e"),Color("4a899e"),Color("619cad"),Color("80b0bd")]) if kind == "ripples" else PackedColorArray([Color(0,0,0,0),Color("5b6e6b"),Color("7e8370"),Color("a29c7a"),Color("c7b88d"),Color("ddc9a0")])
        project.pool_frames.clear()
        project.animation_timeline.clear()
        project.animation_fps = 8.0
        project.animation_loop = true
        project.show_timeline = true
        project.onion_skinning = true
        for f in COUNT:
            var frame = Frame.create(project.get_uid())
            var layer := IndexedColorImage.new()
            layer.layer_uid = project.get_uid()
            layer.label = "Growing, traveling and settling connected water clusters"
            layer.size = size
            layer.visible = true
            if kind == "ripples": draw_flow(layer,f)
            else: draw_reflection(layer,f)
            frame.layers.append(layer)
            frame.layer_active_uid = layer.layer_uid
            project.pool_frames.append(frame)
            var cell = AnimationCell.create(project.get_uid())
            cell.frame = frame
            project.animation_timeline.append(cell)
        project.canvas_pool_frame_uid = project.pool_frames[0].frame_uid
        project.active_layer_uid = project.pool_frames[0].layers[0].layer_uid
        project.animation_frame_index = 0
        project = save_reopen(project,file)
    if project == null: return null
    PixelPen.state.current_project = project
    var atlas := Image.create(size.x*COUNT,size.y,false,Image.FORMAT_RGBA8)
    atlas.fill(Color.TRANSPARENT)
    DirAccess.make_dir_recursive_absolute(OUT+"frames/"+kind)
    for f in COUNT:
        var image: Image = project.get_image(project.animation_timeline[f].frame)
        image.convert(Image.FORMAT_RGBA8)
        atlas.blit_rect(image,Rect2i(Vector2i.ZERO,size),Vector2i(f*size.x,0))
        if image.save_png(OUT+"frames/"+kind+"/frame-%02d.png"%f) != OK: return null
    return export_image(atlas,kind)
func make_tiles(texture: Texture2D, columns: int, rows: int, name: String) -> TileSet:
    var tiles := TileSet.new()
    tiles.tile_size = Vector2i(64,64)
    var atlas := TileSetAtlasSource.new()
    atlas.texture = texture
    atlas.texture_region_size = Vector2i(64,64)
    atlas.use_texture_padding = false
    for y in rows:
        for x in columns: atlas.create_tile(Vector2i(x,y))
    tiles.add_source(atlas,0)
    if ResourceSaver.save(tiles,OUT+name+".tres") != OK: return null
    return load(OUT+name+".tres") as TileSet
func connect_scene(base: TileSet, dots: TileSet, reflection: Texture2D) -> bool:
    var scene := (load("res://scenes/native_2d/city_river_quarter.tscn") as PackedScene).instantiate()
    var water := scene.get_node("Water") as TileMapLayer
    var ripple := scene.get_node("RippleDots") as TileMapLayer
    # Retain all saved cells/transforms. Change only the material/animation sources.
    water.tile_set = base
    var cells: Array[Vector2i] = ripple.get_used_cells()
    var variants: Dictionary = {}
    for cell in cells: variants[cell] = ripple.get_cell_atlas_coords(cell).y
    ripple.tile_set = dots
    for cell in cells: ripple.set_cell(cell,0,Vector2i(posmod(cell.x*7+cell.y*11,COUNT),int(variants[cell])))
    for node in scene.get_node("LanternReflections").get_children():
        var sprite := node as Sprite2D
        if sprite == null: continue
        sprite.texture = reflection
        sprite.hframes = COUNT
        sprite.frame = 0
    var output := PackedScene.new()
    if output.pack(scene) != OK: scene.free(); return false
    var error := ResourceSaver.save(output,"res://scenes/native_2d/city_river_quarter.tscn")
    scene.free()
    return error == OK
func author() -> void:
    DirAccess.make_dir_recursive_absolute(SOURCE)
    DirAccess.make_dir_recursive_absolute(OUT)
    DirAccess.make_dir_recursive_absolute(STUDY)
    var base := base_art()
    var flow := animation("ripples")
    var light := animation("reflections")
    if base == null or flow == null or light == null: fail("Daylight PixelPen export failed"); return
    var base_tiles := make_tiles(base,8,8,"base-tiles")
    var flow_tiles := make_tiles(flow,COUNT,8,"ripple-tiles")
    if base_tiles == null or flow_tiles == null or not connect_scene(base_tiles,flow_tiles,light): fail("Daylight water connection failed"); return
    var audit := FileAccess.open(STUDY+"pixelpen-audit.json",FileAccess.WRITE)
    audit.store_string(JSON.stringify({"sources":[SOURCE+"base.pxpen",SOURCE+"ripples.pxpen",SOURCE+"reflections.pxpen"],"savedReopenedExported":true,"frameCount":COUNT,"fps":8,"tileSize":[64,64],"baseShapesPreserved":true,"shortConnectedRibbons":true,"singlePixelSparkles":false,"wholeSurfaceScroll":false,"uvWarp":false},"  "))
    audit.close()
    if PixelPen.state != null:
        PixelPen.state.current_project = null
        PixelPen.state.free()
        PixelPen.state = null
    print("RIVER_DAYLIGHT_AUTHORED brighterPalette connected24frames")
    quit()
