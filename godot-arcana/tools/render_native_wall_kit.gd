extends SceneTree
## Asset-authoring stills only: no main.gd, API/session or gameplay-input loop.
## Run after the shared native wall TileSet and perimeter example are authored.
const OUTPUT = "res://art/source/walls/native-v4/renders/"
const WALL_TILESET = "res://art/resources/native_wall_tileset.tres"
const DEFAULT_PERIMETER = "res://scenes/native_2d/wall_perimeter_demo.tscn"
const HERO = preload("res://scripts/native_2d_hero.gd")
var viewport: SubViewport
var stage: Node2D
var camera: Camera2D

func _initialize() -> void:
    call_deferred("capture_all")

func setup(size: Vector2i) -> void:
    viewport = SubViewport.new()
    viewport.size = size
    viewport.disable_3d = true
    viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
    viewport.canvas_item_default_texture_filter = Viewport.DEFAULT_CANVAS_ITEM_TEXTURE_FILTER_NEAREST
    root.add_child(viewport)
    stage = Node2D.new()
    stage.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
    viewport.add_child(stage)
    camera = Camera2D.new()
    stage.add_child(camera)
    camera.position = Vector2(size) * 0.5
    camera.make_current()

func clear_stage() -> void:
    if is_instance_valid(viewport):
        viewport.queue_free()
        await process_frame

func floor_polygon(rect: Rect2, color: Color, parent: Node2D = null) -> void:
    var floor_node: Polygon2D = Polygon2D.new()
    floor_node.polygon = PackedVector2Array([rect.position, Vector2(rect.end.x,rect.position.y),rect.end,Vector2(rect.position.x,rect.end.y)])
    floor_node.color = color
    floor_node.z_index = -100
    (stage if parent == null else parent).add_child(floor_node)

func save_still(name: String) -> bool:
    for frame in range(5):
        await process_frame
    await RenderingServer.frame_post_draw
    var image: Image = viewport.get_texture().get_image()
    if image == null or image.is_empty():
        push_error("Empty wall asset render: "+name)
        return false
    var error: Error = image.save_png(OUTPUT+name+".png")
    if error != OK:
        push_error("Cannot write wall asset render: "+error_string(error))
        return false
    print("NATIVE_WALL_STILL ",name," ",image.get_size())
    return true

func wall_layer() -> TileMapLayer:
    var walls: TileMapLayer = TileMapLayer.new()
    walls.tile_set = load(WALL_TILESET) as TileSet
    walls.y_sort_enabled = true
    walls.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
    stage.add_child(walls)
    return walls

func wall_building_comparison() -> bool:
    setup(Vector2i(1024,768))
    floor_polygon(Rect2(0,0,1024,768),Color("#4d6145"))
    floor_polygon(Rect2(64,520,896,168),Color("#978a70"))
    var plaza: Node2D = load("res://scenes/native_2d/plaza.tscn").instantiate() as Node2D
    var townhouse: Node = plaza.find_child("townhouse_01",true,false)
    if townhouse == null or not townhouse.has_node("Visual"):
        push_error("Missing active townhouse reference");plaza.free();return false
    var source: Sprite2D = townhouse.get_node("Visual") as Sprite2D
    var building: Sprite2D = source.duplicate() as Sprite2D
    building.position = Vector2(72,80)
    building.offset = Vector2.ZERO
    building.z_index = 10
    stage.add_child(building)
    var size: Vector2 = source.region_rect.size if source.region_enabled else Vector2(source.texture.get_size())
    print("NATIVE_WALL_REFERENCE townhouse native pixels=",size," scale=",building.scale)
    plaza.free()
    var walls: TileMapLayer = wall_layer()
    walls.z_index = 5
    var cells: Array[Vector2i] = []
    for x in range(7,15):
        cells.append(Vector2i(x,7))
    for y in range(8,11):
        cells.append(Vector2i(14,y))
    walls.set_cells_terrain_connect(cells,0,0,false)
    var hero: Node2D = HERO.new()
    hero.position = Vector2(700,620)
    hero.z_index = 20
    stage.add_child(hero)
    hero.pose(0.0,0.0,false,Vector2.ZERO,true,false)
    var result: bool = await save_still("wall-building-native-scale")
    await clear_stage()
    return result

func actual_gate() -> bool:
    setup(Vector2i(1024,768))
    # This is the established native presentation path; logic is hidden and
    # processing is disabled before any process/physics tick can run.
    var logic: Node2D = load("res://scripts/world.gd").new()
    logic.layout = load("res://scenes/native_2d/plaza.tscn").instantiate()
    stage.add_child(logic)
    logic.hide()
    logic.enabled = false
    logic.set_process(false)
    logic.set_physics_process(false)
    logic.camera.enabled = false
    logic.player_position = Vector2(524,780)
    logic.effects_enabled = false
    var renderer: Node2D = load("res://scripts/native_2d_world.gd").new()
    renderer.world = logic
    stage.add_child(renderer)
    renderer.set_process(false)
    renderer.set_display_size(Vector2(1024,768))
    renderer.set_render_pixel_scale(1.0)
    renderer.previous_player = logic.player_position
    renderer._process(0.0)
    renderer.camera.position = renderer.map_point(logic.player_position)-Vector2(0,96)
    renderer.camera.zoom = Vector2.ONE
    renderer.camera.force_update_scroll()
    var result: bool = await save_still("actual-plaza-south-wall")
    await clear_stage()
    return result

func perimeter_overview(path: String) -> bool:
    if not ResourceLoader.exists(path):
        push_error("Missing authored perimeter example: "+path)
        return false
    setup(Vector2i(1200,900))
    var layout: Node2D = load(path).instantiate() as Node2D
    stage.add_child(layout)
    for child in layout.find_children("*","Camera2D",true,false):
        child.enabled = false
    var bounds: Rect2 = Rect2()
    var found: bool = false
    for layer in layout.find_children("*","TileMapLayer",true,false):
        if layer.tile_set == null or layer.get_used_cells().is_empty():
            continue
        var used: Rect2i = layer.get_used_rect()
        var size: Vector2 = Vector2(layer.tile_set.tile_size)
        var local_bounds: Rect2 = Rect2(Vector2(used.position)*size,Vector2(used.size)*size)
        # Wall art rises above its ground cell. Reserve generous unclipped headroom.
        local_bounds.position.y -= 256
        local_bounds.size.y += 256
        var converted: Rect2 = Rect2(stage.to_local(layer.to_global(local_bounds.position)),local_bounds.size*layer.scale)
        bounds = bounds.merge(converted) if found else converted
        found = true
    if not found:
        push_error("Perimeter example has no saved tile cells")
        return false
    floor_polygon(bounds.grow(64),Color("#4d6145"))
    camera.position = bounds.get_center()
    var ratio: float = minf(1100.0/bounds.size.x,800.0/bounds.size.y)
    camera.zoom = Vector2.ONE*ratio
    camera.make_current()
    camera.force_update_scroll()
    print("NATIVE_WALL_PERIMETER ",path," bounds=",bounds," zoom=",ratio)
    var result: bool = await save_still("perimeter-overview")
    await clear_stage()
    return result

func capture_all() -> void:
    root.position = Vector2i(-32000,-32000)
    if DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(OUTPUT)) != OK:
        push_error("Cannot create wall still output directory");quit(1);return
    if not await wall_building_comparison(): quit(1);return
    if not await actual_gate(): quit(1);return
    var perimeter_path: String = DEFAULT_PERIMETER
    for argument in OS.get_cmdline_user_args():
        if argument.begins_with("res://"):
            perimeter_path = argument
    if not await perimeter_overview(perimeter_path): quit(1);return
    print("NATIVE_WALL_STILLS_COMPLETE")
    quit()

