extends SceneTree
## Generate initial indexed pixels only once. Saved manual masters always win.
const STUDY := "res://../art-studies/regions/arcana-city-center/source/river-navy-v2/"
const SOURCE := "res://art/source/river-navy-v2/"
const OUT := "res://art/export/river-navy-v2/"
const COUNT := 12
var audit: Array = []
func _initialize() -> void: call_deferred("author")
func save_texture(image: Image, name: String) -> bool:
    return image.save_png(OUT+name+".png") == OK and ResourceSaver.save(ImageTexture.create_from_image(image),OUT+name+".res",ResourceSaver.FLAG_COMPRESS) == OK
func save_reopen(project: PixelPenProject, file: String) -> PixelPenProject:
    project.file_path = file
    if ProjectPacker.save(project,file) != OK: return null
    return ProjectPacker.load_project(file)
func base_art() -> Texture2D:
    var file := SOURCE+"base.pxpen"
    var project: PixelPenProject
    var reused := FileAccess.file_exists(file)
    var edits := 0
    if reused: project = ProjectPacker.load_project(file)
    else:
        var input := Image.load_from_file(STUDY+"base-prepared.png")
        if input == null: return null
        project = PixelPenProject.new()
        project.initialized(input.get_size(),"Approved option2 quiet navy water")
        PixelPen.state.current_project = project
        var uid := project.import_image(input,"Fixed navy reflection clusters")
        var layer: IndexedColorImage = project.get_index_image(uid)
        var palette: PackedColorArray = project.palette.color_index
        for y in range(1,511):
            for x in range(1,511):
                var c: int = layer.get_index_on_color_map(x,y)
                var n: int = layer.get_index_on_color_map(x-1,y)
                if c == n: continue
                if n == layer.get_index_on_color_map(x+1,y) and n == layer.get_index_on_color_map(x,y-1) and n == layer.get_index_on_color_map(x,y+1):
                    var a: Color = palette[c]
                    var b: Color = palette[n]
                    if absf(a.r-b.r)+absf(a.g-b.g)+absf(a.b-b.b) < .16:
                        layer.set_index_on_color_map(x,y,n)
                        edits += 1
        project = save_reopen(project,file)
    if project == null: return null
    PixelPen.state.current_project = project
    var image: Image = project.get_image(project.animation_timeline[0].frame)
    image.convert(Image.FORMAT_RGBA8)
    if not save_texture(image,"base"): return null
    audit.append({"id":"base","native":file,"size":[512,512],"pixelEdits":edits,"reused":reused,"savedReopenedExported":true})
    PixelPen.state.current_project = null
    return load(OUT+"base.res") as Texture2D
func animation(kind: String) -> Texture2D:
    var file := SOURCE+kind+".pxpen"
    var reused := FileAccess.file_exists(file)
    var size := Vector2i(64,512) if kind == "ripples" else Vector2i(64,128)
    var project: PixelPenProject
    if reused: project = ProjectPacker.load_project(file)
    else:
        project = PixelPenProject.new()
        project.initialized(size,"Navy river "+kind+" discrete pixel motion")
        PixelPen.state.current_project = project
        project.palette.color_index = PackedColorArray([Color(0,0,0,0),Color("225e85"),Color("3e7c9f"),Color("639db7"),Color("95b8c7"),Color("c2d5d8")]) if kind == "ripples" else PackedColorArray([Color(0,0,0,0),Color("4e4a38"),Color("796443"),Color("aa864a"),Color("d1aa60"),Color("f0cf86")])
        project.pool_frames.clear()
        project.animation_timeline.clear()
        project.animation_fps = 6.0
        project.animation_loop = true
        project.show_timeline = true
        project.onion_skinning = true
        for f in COUNT:
            var frame = Frame.create(project.get_uid())
            var layer := IndexedColorImage.new()
            layer.layer_uid = project.get_uid()
            layer.label = "Short clusters, staggered life, one pixel flow steps"
            layer.size = size
            layer.visible = true
            if kind == "ripples":
                for variant in 8:
                    for stroke in 3:
                        var phase: int = (f+variant*3+stroke*4)%COUNT
                        if phase < 2 or phase > 9: continue
                        var x: int = 5+(variant*17+stroke*13)%34+phase
                        var y: int = variant*64+5+(variant*19+stroke*23)%50
                        var length: int = 2+mini(phase-2,9-phase)*2
                        var color: int = 4 if phase in [5,6] and stroke == 0 else 3
                        for dx in length: layer.set_index_on_color_map(x+dx,y,color)
                        layer.set_index_on_color_map(x-1,y+1,2)
                        if phase >= 5: layer.set_index_on_color_map(x+length-2,y-1,2)
                        if phase in [5,6] and variant%3 == 0: layer.set_index_on_color_map(x+1,y,5)
            else:
                for stripe in 18:
                    var y: int = 4+stripe*6
                    var phase: int = (f+stripe*3)%COUNT
                    if phase in [0,1,10,11]: continue
                    var sway: int = [-2,-1,0,1,2,1,0,-1,-2,-1,0,1][phase]
                    var half: int = 2+int(stripe/5)+phase%3
                    var color: int = maxi(1,5-int(stripe/5))
                    for dx in range(-half,half+1):
                        if (dx+stripe+phase)%5 == 0: continue
                        layer.set_index_on_color_map(32+sway+dx,y,color)
                    if stripe%3 == 0: layer.set_index_on_color_map(32+sway-half+1,y+1,maxi(1,color-1))
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
    if kind == "ripples" and OS.get_environment("ARCANA_RIVER_REFINE_DOTS") == "1":
        project.palette.color_index = PackedColorArray([Color(0,0,0,0),Color("225e85"),Color("3e7c9f"),Color("639db7"),Color("95b8c7"),Color("c2d5d8")])
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
    if not save_texture(atlas,kind): return null
    audit.append({"id":kind,"native":file,"canvas":[size.x,size.y],"frames":COUNT,"fps":6,"reused":reused,"indexedFrameDrawing":true,"savedReopenedExported":true})
    PixelPen.state.current_project = null
    return load(OUT+kind+".res") as Texture2D
func make_tiles(texture: Texture2D, columns: int, rows: int, file: String) -> TileSet:
    var tiles := TileSet.new()
    tiles.tile_size = Vector2i(64,64)
    var atlas := TileSetAtlasSource.new()
    atlas.texture = texture
    atlas.texture_region_size = Vector2i(64,64)
    atlas.use_texture_padding = false
    for y in rows:
        for x in columns: atlas.create_tile(Vector2i(x,y))
    tiles.add_source(atlas,0)
    if ResourceSaver.save(tiles,file) != OK: return null
    return tiles
func connect_scene(base: TileSet, ripples: TileSet, reflection: Texture2D) -> bool:
    var packed := load("res://scenes/native_2d/city_river_quarter.tscn") as PackedScene
    var scene := packed.instantiate()
    var old := scene.get_node("Water") as Node2D
    # Do not regenerate a user's painted water layer on re-export.
    if old is TileMapLayer:
        scene.free()
        return true
    var origin: Vector2 = old.position
    scene.remove_child(old)
    old.free()
    var water := TileMapLayer.new()
    water.name = "Water"
    water.position = origin
    water.z_index = -30
    water.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
    water.tile_set = base
    water.set_meta("casts_sun_shadow",false)
    scene.add_child(water)
    water.owner = scene
    var dots := TileMapLayer.new()
    dots.name = "RippleDots"
    dots.position = origin
    dots.z_index = -29
    dots.tile_set = ripples
    dots.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
    dots.set_meta("casts_sun_shadow",false)
    scene.add_child(dots)
    dots.owner = scene
    for y in 5:
        for x in 64:
            water.set_cell(Vector2i(x,y),0,Vector2i(x%8,y%8))
            if (x*13+y*7)%7 < 3: dots.set_cell(Vector2i(x,y),0,Vector2i((x*7+y*11)%12,(x*3+y)%8))
    var lights := Node2D.new()
    lights.name = "LanternReflections"
    lights.position = origin
    lights.set_meta("casts_sun_shadow",false)
    scene.add_child(lights)
    lights.owner = scene
    for x in [576,1216,1856,2168,2440,3136,3776]:
        var sprite := Sprite2D.new()
        sprite.name = "Reflection"+str(x)
        sprite.position = Vector2(float(x)-32,4)
        sprite.texture = reflection
        sprite.hframes = COUNT
        sprite.centered = false
        sprite.z_index = -28
        sprite.modulate.a = .24
        sprite.set_meta("casts_sun_shadow",false)
        lights.add_child(sprite)
        sprite.owner = scene
    scene.set_meta("water_approved_option",2)
    var output := PackedScene.new()
    if output.pack(scene) != OK:
        scene.free()
        return false
    var error := ResourceSaver.save(output,"res://scenes/native_2d/city_river_quarter.tscn")
    scene.free()
    return error == OK
func author() -> void:
    DirAccess.make_dir_recursive_absolute(SOURCE)
    DirAccess.make_dir_recursive_absolute(OUT)
    var base := base_art()
    var dots := animation("ripples")
    var light := animation("reflections")
    if base == null or dots == null or light == null:
        push_error("Navy PixelPen author/export failed"); quit(1); return
    var base_tiles := make_tiles(base,8,8,OUT+"base-tiles.tres")
    var dot_tiles := make_tiles(dots,12,8,OUT+"ripple-tiles.tres")
    if base_tiles == null or dot_tiles == null or not connect_scene(base_tiles,dot_tiles,light):
        push_error("Navy TileMap export failed"); quit(1); return
    var file := FileAccess.open(STUDY+"pixelpen-audit.json",FileAccess.WRITE)
    file.store_string(JSON.stringify({"assets":audit,"tileSize":[64,64],"waterCells":320,"frameCount":12,"fps":6,"wholeTextureScroll":false,"uvWarp":false},"  "))
    file.close()
    if PixelPen.state != null:
        PixelPen.state.current_project = null
        PixelPen.state.free()
        PixelPen.state = null
    print("RIVER_NAVY_AUTHORED native12frames tile64 noUVwarp")
    quit()
