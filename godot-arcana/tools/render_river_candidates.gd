extends SceneTree
## Five candidate materials rendered by the real game display. No saved scene writes.
const STUDY := "res://../art-studies/regions/arcana-city-center/source/river-ingame-options-v4/"
var audit: Array = []
func _initialize() -> void: call_deferred("run")
func author(job: Dictionary) -> Image:
    var file: String = ProjectSettings.globalize_path(STUDY+"pixelpen/%02d.pxpen"%int(job.number))
    var project: PixelPenProject
    var reused := FileAccess.file_exists(file)
    var corrections := 0
    if reused: project = ProjectPacker.load_project(file)
    else:
        var input := Image.load_from_file(str(job.input))
        if input == null: return null
        project = PixelPenProject.new()
        project.initialized(input.get_size(),"Arcana in-game river candidate "+str(job.number))
        PixelPen.state.current_project = project
        var uid := project.import_image(input,"Candidate water pixel clusters")
        var layer: IndexedColorImage = project.get_index_image(uid)
        # Quiet the big crests in3; keep the clear shallows in4 from glowing white.
        var colors: PackedColorArray = project.palette.color_index
        if int(job.number) == 3:
            var low := 1.0
            var high := 0.0
            for c in colors:
                if c.a < .5: continue
                var l: float = c.r*.2126+c.g*.7152+c.b*.0722
                low = minf(low,l)
                high = maxf(high,l)
            for i in colors.size():
                var c: Color = colors[i]
                if c.a < .5: continue
                var l: float = c.r*.2126+c.g*.7152+c.b*.0722
                colors[i] = Color("236b82").lerp(Color("4b8f9f"),clampf((l-low)/maxf(.001,high-low),0.0,1.0))
        if int(job.number) == 4:
            for i in colors.size():
                var c: Color = colors[i]
                if c.a > .5 and c.r*.2126+c.g*.7152+c.b*.0722 > .76:
                    colors[i] = c.lerp(Color("8abfb5"),.45)
        project.palette.color_index = colors
        for y in range(1,447):
            for x in range(1,447):
                var c: int = layer.get_index_on_color_map(x,y)
                var n: int = layer.get_index_on_color_map(x-1,y)
                if c == n: continue
                if n == layer.get_index_on_color_map(x+1,y) and n == layer.get_index_on_color_map(x,y-1) and n == layer.get_index_on_color_map(x,y+1):
                    var a: Color = colors[c]
                    var b: Color = colors[n]
                    if absf(a.r-b.r)+absf(a.g-b.g)+absf(a.b-b.b) < .14:
                        layer.set_index_on_color_map(x,y,n)
                        corrections += 1
        project.file_path = file
        if ProjectPacker.save(project,file) != OK: return null
        project = ProjectPacker.load_project(file)
    if project == null: return null
    PixelPen.state.current_project = project
    var image: Image = project.get_image(project.animation_timeline[0].frame)
    image.convert(Image.FORMAT_RGBA8)
    if image.save_png(STUDY+"materials/%02d.png"%int(job.number)) != OK: return null
    audit.append({"number":job.number,"native":file,"savedReopenedExported":true,"nativePixelCorrections":corrections,"reusedMaster":reused,"size":[448,448]})
    PixelPen.state.current_project = null
    return image
func make_tiles(image: Image) -> TileSet:
    var tiles := TileSet.new()
    tiles.tile_size = Vector2i(64,64)
    var atlas := TileSetAtlasSource.new()
    atlas.texture = ImageTexture.create_from_image(image)
    atlas.texture_region_size = Vector2i(64,64)
    atlas.use_texture_padding = false
    for y in 7:
        for x in 7: atlas.create_tile(Vector2i(x,y))
    tiles.add_source(atlas,0)
    return tiles
func run() -> void:
    for sub in ["pixelpen","materials","render"]:
        DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(STUDY+sub))
    var plan: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(STUDY+"plan.json"))
    var images: Array[Image] = []
    for job in plan.jobs:
        var image := author(job)
        if image == null: push_error("Candidate native author failed"); quit(1); return
        images.append(image)
    # Render the actual served game package. Source edits may await PNG import.
    var pack: String = ProjectSettings.globalize_path("res://../godot-web/index.pck")
    if not ProjectSettings.load_resource_pack(pack):
        push_error("Cannot mount the local game package"); quit(1); return
    root.position = Vector2i(-32000,-32000)
    var viewport := SubViewport.new()
    viewport.size = Vector2i(1600,1100)
    viewport.disable_3d = true
    viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
    viewport.canvas_item_default_texture_filter = Viewport.DEFAULT_CANVAS_ITEM_TEXTURE_FILTER_NEAREST
    root.add_child(viewport)
    var main: Node = load("res://main.tscn").instantiate()
    var authored: Node2D = main.get_node("Plaza")
    main.remove_child(authored)
    main.free()
    var logic: Node2D = load("res://scripts/world.gd").new()
    logic.layout = authored
    viewport.add_child(logic)
    logic.hide()
    logic.set_process(false)
    logic.set_physics_process(false)
    logic.enabled = false
    logic.effects_enabled = true
    logic.camera.enabled = false
    logic.time = 7.0
    logic.player_position = Vector2(576,620)
    logic.set_art_state(false,true)
    var renderer: Node2D = load("res://scripts/native_2d_world.gd").new()
    renderer.world = logic
    viewport.add_child(renderer)
    renderer.set_display_size(Vector2(1600,1100))
    renderer.set_render_pixel_scale(1.0)
    var river: Node2D = authored.get_node("Placements/RiverQuarter")
    var water := river.get_node("Water") as TileMapLayer
    var cells: Array[Vector2i] = water.get_used_cells()
    # Static image comparison: generated material already contains its own ripples.
    # Hide only the separate moving overlay in this isolated, unsaved render.
    (river.get_node("RippleDots") as TileMapLayer).modulate.a = 0.0
    (river.get_node("LanternReflections") as Node2D).modulate.a = 0.0
    for index in images.size():
        water.tile_set = make_tiles(images[index])
        for cell in cells: water.set_cell(cell,0,Vector2i(posmod(cell.x,7),posmod(cell.y,7)))
        for frame in 4: await process_frame
        await RenderingServer.frame_post_draw
        var picture: Image = viewport.get_texture().get_image()
        if picture.save_png(STUDY+"render/candidate-%02d.png"%(index+1)) != OK: quit(1); return
        print("RIVER_CANDIDATE_RENDER ",index+1)
    var file := FileAccess.open(STUDY+"audit.json",FileAccess.WRITE)
    file.store_string(JSON.stringify({"materials":audit,"renderer":"main.tscn native_2d_world.gd","resourcePack":pack,"viewport":[1600,1100],"cameraPoint":[576,620],"waterTileSize":[64,64],"sceneWrites":false,"webPublished":false,"playTestsRun":false},"  "))
    file.close()
    viewport.queue_free()
    await process_frame
    await process_frame
    if PixelPen.state != null:
        PixelPen.state.current_project = null
        PixelPen.state.free()
        PixelPen.state = null
    quit()
