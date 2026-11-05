extends SceneTree
## Production author for pieces cut from the approved complete enclosure.
## Atlas regions can span many source cells; each piece is one selectable
## TileMapLayer anchor. Existing manually edited demo scenes are preserved.
const BASE = "res://art/source/walls/assembled-v1/"
const TILESET_PATH = "res://art/resources/assembled_wall_tileset.tres"
const TEXTURE_PATH = "res://art/export/walls/assembled-wall-atlas.res"
const LAYER_SCRIPT = preload("res://scripts/native_2d_wall_layer.gd")
const SCENE_PATHS = {
    "original": "res://scenes/native_2d/wall_assembled_demo.tscn",
    "expanded": "res://scenes/native_2d/wall_assembled_expanded_demo.tscn"
}
var manifest: Dictionary = {}
var parts: Dictionary = {}
var grid_size: Vector2i = Vector2i(16,16)
var atlas_cell: Vector2i = Vector2i(16,16)
func _initialize() -> void:
    call_deferred("author")
func fail(message: String) -> bool:
    push_error(message)
    quit(1)
    return false
func check_error(code: Error, context: String) -> bool:
    return true if code == OK else fail(context+": "+error_string(code))
func point(value: Variant, fallback: Vector2i = Vector2i.ZERO) -> Vector2i:
    if value is Array and value.size() == 2:
        return Vector2i(int(value[0]),int(value[1]))
    return fallback
func float_point(value: Variant, fallback: Vector2 = Vector2.ZERO) -> Vector2:
    if value is Array and value.size() == 2:
        return Vector2(float(value[0]),float(value[1]))
    return fallback
func polygon(rect: Rect2) -> PackedVector2Array:
    return PackedVector2Array([rect.position,Vector2(rect.end.x,rect.position.y),rect.end,Vector2(rect.position.x,rect.end.y)])
func load_manifest() -> bool:
    var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(BASE+"manifest.json"))
    if not parsed is Dictionary:
        return fail("Missing assembled wall manifest.json")
    manifest = parsed
    grid_size = point(manifest.get("grid"),Vector2i(16,16))
    atlas_cell = point(manifest.get("atlasCell"),Vector2i(16,16))
    if grid_size.x <= 0 or grid_size.y <= 0 or atlas_cell.x <= 0 or atlas_cell.y <= 0:
        return fail("Wall grid and atlas cells must be positive")
    var entries: Variant = manifest.get("parts")
    if not entries is Array or entries.is_empty():
        return fail("Approved wall manifest contains no extracted pieces")
    for value in entries:
        if not value is Dictionary:
            return fail("Wall piece definition must be an object")
        var id: String = str(value.get("id",""))
        if id.is_empty() or parts.has(id):
            return fail("Missing or duplicate wall piece id: "+id)
        if not value.has("atlas") or not value.has("atlasSize") or not value.has("origin"):
            return fail("Wall piece is missing atlas coordinates/size/origin: "+id)
        parts[id] = value
    return true
func create_tileset() -> TileSet:
    var image: Image = Image.load_from_file(BASE+"atlas.png")
    if image == null or image.is_empty():
        fail("Missing approved wall atlas.png");return null
    image.convert(Image.FORMAT_RGBA8)
    var image_size: Vector2i = image.get_size()
    if image_size.x % atlas_cell.x != 0 or image_size.y % atlas_cell.y != 0:
        fail("Atlas image dimensions must align to atlasCell");return null
    var occupied: Dictionary = {}
    for id in parts:
        var part: Dictionary = parts[id]
        var at: Vector2i = point(part.atlas)
        var size: Vector2i = point(part.atlasSize)
        if at.x < 0 or at.y < 0 or size.x <= 0 or size.y <= 0:
            fail("Invalid atlas rectangle for "+id);return null
        if (at.x+size.x)*atlas_cell.x > image_size.x or (at.y+size.y)*atlas_cell.y > image_size.y:
            fail("Atlas piece exceeds image bounds: "+id);return null
        for y in range(at.y,at.y+size.y):
            for x in range(at.x,at.x+size.x):
                var cell: Vector2i = Vector2i(x,y)
                if occupied.has(cell):
                    fail("Atlas rectangles overlap: "+id+" and "+str(occupied[cell]));return null
                occupied[cell] = id
    var texture: ImageTexture = ImageTexture.create_from_image(image)
    if not check_error(ResourceSaver.save(texture,TEXTURE_PATH),"Save approved wall texture"):
        return null
    var tiles: TileSet = TileSet.new()
    tiles.tile_size = grid_size
    tiles.add_physics_layer()
    tiles.set_physics_layer_collision_layer(0,1)
    tiles.add_custom_data_layer()
    tiles.set_custom_data_layer_name(0,"element")
    tiles.set_custom_data_layer_type(0,TYPE_STRING)
    tiles.add_custom_data_layer()
    tiles.set_custom_data_layer_name(1,"part_id")
    tiles.set_custom_data_layer_type(1,TYPE_STRING)
    var atlas: TileSetAtlasSource = TileSetAtlasSource.new()
    atlas.resource_name = "성벽 · 승인된 완성본 조각"
    atlas.texture = ResourceLoader.load(TEXTURE_PATH,"Texture2D",ResourceLoader.CACHE_MODE_REPLACE) as Texture2D
    atlas.texture_region_size = atlas_cell
    tiles.add_source(atlas,0)
    for id in parts:
        var part: Dictionary = parts[id]
        var at: Vector2i = point(part.atlas)
        atlas.create_tile(at,point(part.atlasSize))
        var data: TileData = atlas.get_tile_data(at,0)
        if data == null:
            fail("Cannot create approved wall tile: "+id);return null
        data.texture_origin = point(part.origin)
        data.y_sort_origin = int(part.get("sortOrigin",0))
        data.set_custom_data("element",str(part.get("label",id)))
        data.set_custom_data("part_id",str(id))
        var collision: Variant = part.get("collision",[])
        if not collision is Array:
            fail("Collision must be an array of rectangles: "+id);return null
        data.set_collision_polygons_count(0,collision.size())
        for index in range(collision.size()):
            var entry: Variant = collision[index]
            if not entry is Array or entry.size() != 4:
                fail("Invalid collision rectangle in "+id);return null
            var rect: Rect2 = Rect2(float(entry[0]),float(entry[1]),float(entry[2]),float(entry[3]))
            if not rect.has_area():
                fail("Collision rectangle must have positive area: "+id);return null
            data.set_collision_polygon_points(0,index,polygon(rect))
    return tiles
func placement_list(arrangement: Variant) -> Array:
    if arrangement is Array:
        return arrangement
    if arrangement is Dictionary and arrangement.get("placements") is Array:
        return arrangement.placements
    return []
func arrangement_position(arrangement: Variant) -> Vector2:
    if arrangement is Dictionary:
        return float_point(arrangement.get("position"))
    return Vector2.ZERO
func make_layer(scene: Node2D,tiles: TileSet,at: Vector2) -> TileMapLayer:
    var walls: TileMapLayer = TileMapLayer.new()
    walls.name = "Walls"
    walls.position = at
    walls.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
    walls.y_sort_enabled = true
    walls.tile_set = tiles
    walls.set_script(LAYER_SCRIPT)
    scene.add_child(walls);walls.owner = scene
    return walls
func populate_layer(walls: TileMapLayer,placements: Array) -> bool:
    var used: Dictionary = {}
    for value in placements:
        if not value is Dictionary:
            return fail("Wall placement must be an object")
        var id: String = str(value.get("part",""))
        if not parts.has(id):
            return fail("Unknown wall piece in arrangement: "+id)
        var cell: Vector2i = point(value.get("cell"))
        if used.has(cell):
            return fail("Two wall pieces share a TileMap anchor "+str(cell))
        used[cell] = true
        walls.set_cell(cell,0,point(parts[id].atlas),0)
    return true
func graphic_bounds(walls: TileMapLayer) -> Rect2:
    var bounds: Rect2 = Rect2()
    var first: bool = true
    for cell in walls.get_used_cells():
        var data: TileData = walls.get_cell_tile_data(cell)
        var atlas: TileSetAtlasSource = walls.tile_set.get_source(walls.get_cell_source_id(cell)) as TileSetAtlasSource
        var region: Rect2i = atlas.get_tile_texture_region(walls.get_cell_atlas_coords(cell))
        var size: Vector2 = Vector2(region.size)
        var top_left: Vector2 = walls.position+walls.map_to_local(cell)-size*0.5-Vector2(data.texture_origin)
        var rect: Rect2 = Rect2(top_left,size)
        bounds = rect if first else bounds.merge(rect)
        first = false
    return bounds
func register_patterns(tiles: TileSet,arrangements: Dictionary) -> bool:
    # Godot calls these TileMapPattern resources. Named shelf entries expose
    # the approved pieces without asking users to identify packed atlas regions.
    for id in parts:
        var part: Dictionary = parts[id]
        var pattern: TileMapPattern = TileMapPattern.new()
        pattern.resource_name = str(part.get("label",id))
        pattern.set_meta("part_id",str(id))
        pattern.set_cell(Vector2i.ZERO,0,point(part.atlas),0)
        tiles.add_pattern(pattern)
    for key in SCENE_PATHS:
        if not arrangements.has(key):
            return fail("Missing wall arrangement for pattern: "+str(key))
        var placements: Array = placement_list(arrangements[key])
        if placements.is_empty():
            return fail("Empty wall arrangement pattern: "+str(key))
        var minimum: Vector2i = point(placements[0].get("cell"))
        for value in placements:
            if not value is Dictionary or not parts.has(str(value.get("part",""))):
                return fail("Invalid piece in whole-wall pattern: "+str(key))
            var cell: Vector2i = point(value.get("cell"))
            minimum = Vector2i(mini(minimum.x,cell.x),mini(minimum.y,cell.y))
        var pattern: TileMapPattern = TileMapPattern.new()
        pattern.resource_name = "완성 성곽 · 원형" if key == "original" else "완성 성곽 · 확장형"
        pattern.set_meta("arrangement",str(key))
        var anchors: Dictionary = {}
        for value in placements:
            var cell: Vector2i = point(value.get("cell"))-minimum
            if anchors.has(cell):
                return fail("Two pieces share whole-wall pattern anchor "+str(cell))
            anchors[cell] = true
            pattern.set_cell(cell,0,point(parts[str(value.part)].atlas),0)
        tiles.add_pattern(pattern)
    return true
func pack_scene(scene: Node2D,path: String) -> bool:
    var packed: PackedScene = PackedScene.new()
    if not check_error(packed.pack(scene),"Pack "+path):
        return false
    return check_error(ResourceSaver.save(packed,path),"Save "+path)
func save_arrangement(key: String,arrangement: Variant,tiles: TileSet) -> bool:
    var path: String = str(SCENE_PATHS[key])
    if FileAccess.file_exists(path) and "--reset-demo" not in OS.get_cmdline_user_args():
        print("ASSEMBLED_WALL_PRESERVED ",path)
        return true
    var placements: Array = placement_list(arrangement)
    if placements.is_empty():
        return fail("Empty assembled wall arrangement: "+key)
    var scene: Node2D = Node2D.new()
    scene.name = "WallAssembledDemo" if key == "original" else "WallAssembledExpandedDemo"
    scene.set_meta("source_art","Approved enclosure master, extracted modular pieces")
    scene.set_meta("arrangement",key)
    scene.set_meta("edit_instruction","Walls → TileMap → Tiles: 조각 선택 후 칠하기, 오른쪽 버튼으로 지우기")
    var walls: TileMapLayer = make_layer(scene,tiles,arrangement_position(arrangement))
    if not populate_layer(walls,placements):
        scene.free();return false
    var bounds: Rect2 = graphic_bounds(walls)
    var ground: Polygon2D = Polygon2D.new()
    ground.name = "Ground"
    ground.z_index = -100
    ground.color = Color("#536249")
    var floor_rect: Rect2 = bounds.grow(48)
    ground.polygon = PackedVector2Array([floor_rect.position,Vector2(floor_rect.end.x,floor_rect.position.y),floor_rect.end,Vector2(floor_rect.position.x,floor_rect.end.y)])
    scene.add_child(ground);ground.owner = scene
    var camera: Camera2D = Camera2D.new()
    camera.name = "Camera2D"
    camera.position = bounds.get_center()
    var zoom: float = minf(350.0/maxf(1.0,bounds.size.x),750.0/maxf(1.0,bounds.size.y))
    camera.zoom = Vector2.ONE*zoom
    scene.add_child(camera);camera.owner = scene
    var ok: bool = pack_scene(scene,path)
    scene.free()
    return ok
func author() -> void:
    if not load_manifest():
        return
    var tiles: TileSet = create_tileset()
    if tiles == null:
        return
    var arrangements: Variant = manifest.get("arrangements")
    if not arrangements is Dictionary:
        fail("Missing original/expanded wall arrangements");return
    if not register_patterns(tiles,arrangements):
        return
    if not check_error(ResourceSaver.save(tiles,TILESET_PATH),"Save approved wall TileSet"):
        return
    tiles = ResourceLoader.load(TILESET_PATH,"TileSet",ResourceLoader.CACHE_MODE_REPLACE) as TileSet
    if tiles == null:
        fail("Cannot reload approved wall TileSet");return
    for key in SCENE_PATHS:
        if not arrangements.has(key):
            fail("Missing wall arrangement: "+str(key));return
        if not save_arrangement(str(key),arrangements[key],tiles):
            return
    print("ASSEMBLED_WALL_TILESET_AUTHORED: ",parts.size()," extracted pieces; grid=",grid_size,"; original + expanded saved; named patterns=",tiles.get_patterns_count())
    quit()

