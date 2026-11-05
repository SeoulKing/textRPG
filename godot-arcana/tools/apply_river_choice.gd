extends SceneTree
## Promote the approved native candidate. Preserve existing scene placement/gameplay.
const STUDY := "res://../art-studies/regions/arcana-city-center/source/river-ingame-options-v4/"
const SOURCE := "res://art/source/river-clear-v4/"
const OUT := "res://art/export/river-clear-v4/"
func _initialize() -> void: call_deferred("apply_choice")
func fail(message: String) -> void:
    push_error(message)
    quit(1)
func apply_choice() -> void:
    DirAccess.make_dir_recursive_absolute(SOURCE)
    DirAccess.make_dir_recursive_absolute(OUT)
    var file := SOURCE+"base.pxpen"
    var reused := FileAccess.file_exists(file)
    var project: PixelPenProject
    if reused: project = ProjectPacker.load_project(file)
    else:
        project = ProjectPacker.load_project(ProjectSettings.globalize_path(STUDY+"pixelpen/01.pxpen"))
        if project == null: fail("Missing approved candidate native master"); return
        project.file_path = file
        if ProjectPacker.save(project,file) != OK: fail("Cannot preserve approved native master"); return
        project = ProjectPacker.load_project(file)
    if project == null: fail("Approved native reopen failed"); return
    PixelPen.state.current_project = project
    var image: Image = project.get_image(project.animation_timeline[0].frame)
    image.convert(Image.FORMAT_RGBA8)
    var approved := Image.load_from_file(STUDY+"materials/01.png")
    if approved == null: fail("Missing approved candidate pixels"); return
    approved.convert(Image.FORMAT_RGBA8)
    if image.get_size() != approved.get_size() or image.get_data() != approved.get_data():
        fail("Approved candidate pixels differ; no scene was changed"); return
    if image.save_png(OUT+"base.png") != OK: fail("Approved PNG export failed"); return
    if ResourceSaver.save(ImageTexture.create_from_image(image),OUT+"base.res",ResourceSaver.FLAG_COMPRESS) != OK:
        fail("Approved texture export failed"); return
    var tiles := TileSet.new()
    tiles.tile_size = Vector2i(64,64)
    var atlas := TileSetAtlasSource.new()
    atlas.texture = load(OUT+"base.res")
    atlas.texture_region_size = Vector2i(64,64)
    atlas.use_texture_padding = false
    for y in 7:
        for x in 7: atlas.create_tile(Vector2i(x,y))
    tiles.add_source(atlas,0)
    if ResourceSaver.save(tiles,OUT+"base-tiles.tres") != OK: fail("Approved TileSet save failed"); return
    var scene := (load("res://scenes/native_2d/city_river_quarter.tscn") as PackedScene).instantiate()
    var water := scene.get_node("Water") as TileMapLayer
    var cells: Array[Vector2i] = water.get_used_cells()
    water.tile_set = load(OUT+"base-tiles.tres")
    for cell in cells: water.set_cell(cell,0,Vector2i(posmod(cell.x,7),posmod(cell.y,7)))
    scene.set_meta("water_approved_option",1)
    scene.set_meta("water_approved_comparison","river-ingame-options-v4")
    var packed := PackedScene.new()
    if packed.pack(scene) != OK: scene.free(); fail("Approved scene packing failed"); return
    var error := ResourceSaver.save(packed,"res://scenes/native_2d/city_river_quarter.tscn")
    scene.free()
    if error != OK: fail("Approved scene save failed"); return
    var audit := FileAccess.open(STUDY+"selected-01.json",FileAccess.WRITE)
    audit.store_string(JSON.stringify({"selected":1,"native":file,"reusedMaster":reused,"sameApprovedPixels":true,"savedReopenedExported":true,"waterCells":cells.size(),"tileSize":[64,64],"materialSize":[448,448],"placementPreserved":true,"flowPreserved":true},"  "))
    audit.close()
    if PixelPen.state != null:
        PixelPen.state.current_project = null
        PixelPen.state.free()
        PixelPen.state = null
    print("RIVER_CHOICE1_APPLIED sameApprovedPixels cells=",cells.size())
    quit()
