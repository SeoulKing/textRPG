extends SceneTree
## Builds shared tile resources from the v4 geometry specification. Existing
## plaza cells and manually edited examples remain the placement authority.
const TILESET_PATH = "res://art/resources/native_wall_tileset.tres"
const TEXTURE_PATH = "res://art/export/walls/native-wall-atlas.res"
const SOURCE_DIR = "res://art/source/walls/native-v4/"
const LAYER_SCRIPT = "res://scripts/native_2d_wall_layer.gd"
const PLAZA_PATH = "res://scenes/native_2d/plaza.tscn"
const DIRECTIONS = [Vector2i.RIGHT, Vector2i.DOWN, Vector2i.LEFT, Vector2i.UP]
const SIDES = [TileSet.CELL_NEIGHBOR_RIGHT_SIDE, TileSet.CELL_NEIGHBOR_BOTTOM_SIDE, TileSet.CELL_NEIGHBOR_LEFT_SIDE, TileSet.CELL_NEIGHBOR_TOP_SIDE]
var spec: Dictionary = {}
var cell_size: int = 64
var wall_height: int = 192
var core_size: int = 12
var half_core: float = 6.0
var texture_origin: Vector2i = Vector2i(0,96)
func _initialize() -> void: call_deferred("author")
func fail(message: String) -> bool:
    push_error(message)
    quit(1)
    return false
func check_error(code: Error, context: String) -> bool:
    return true if code==OK else fail(context+": "+error_string(code))
func properties(state: SceneState,index: int) -> Dictionary:
    var values: Dictionary = {}
    for property_index in range(state.get_node_property_count(index)):
        values[str(state.get_node_property_name(index,property_index))]=state.get_node_property_value(index,property_index)
    return values
func polygon(rect: Rect2) -> PackedVector2Array:
    return PackedVector2Array([rect.position,Vector2(rect.end.x,rect.position.y),rect.end,Vector2(rect.position.x,rect.end.y)])
func load_spec() -> bool:
    var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(SOURCE_DIR+"geometry.json"))
    if not parsed is Dictionary: return fail("Missing v4 wall geometry specification")
    spec=parsed
    cell_size=int(spec.get("cell",64))
    wall_height=int(spec.get("height",192))
    core_size=int(spec.get("core",12))
    half_core=core_size*0.5
    var origin: Array = spec.get("textureOrigin",[0,96])
    texture_origin=Vector2i(int(origin[0]),int(origin[1]))
    if cell_size!=64 or wall_height!=192 or core_size!=12 or texture_origin!=Vector2i(0,96):
        return fail("Unexpected v4 geometry; authoring must retain the native grid and origin")
    return true
func create_tileset() -> TileSet:
    var image: Image=Image.load_from_file(SOURCE_DIR+"wall-atlas.png")
    if image==null or image.get_size()!=Vector2i(256,1024):
        fail("Expected 4x4 v4 atlas, each tile 64x256")
        return null
    if image.get_pixel(0,0).a > 0.0:
        fail("Wall atlas lost transparent padding; export the PixelPen layer as RGBA8")
        return null
    var texture: ImageTexture=ImageTexture.create_from_image(image)
    if not check_error(ResourceSaver.save(texture,TEXTURE_PATH),"Save wall texture"): return null
    var tiles: TileSet=TileSet.new()
    tiles.tile_size=Vector2i(cell_size,cell_size)
    tiles.add_terrain_set()
    tiles.set_terrain_set_mode(0,TileSet.TERRAIN_MODE_MATCH_SIDES)
    tiles.add_terrain(0)
    tiles.set_terrain_name(0,0,"성벽 · 연결")
    tiles.set_terrain_color(0,0,Color("#d6b77c"))
    tiles.add_physics_layer()
    tiles.set_physics_layer_collision_layer(0,1)
    tiles.add_custom_data_layer()
    tiles.set_custom_data_layer_name(0,"connections")
    tiles.set_custom_data_layer_type(0,TYPE_INT)
    tiles.add_custom_data_layer()
    tiles.set_custom_data_layer_name(1,"element")
    tiles.set_custom_data_layer_type(1,TYPE_STRING)
    var atlas: TileSetAtlasSource=TileSetAtlasSource.new()
    atlas.texture=load(TEXTURE_PATH)
    atlas.texture_region_size=Vector2i(cell_size,wall_height+cell_size)
    tiles.add_source(atlas,0)
    var labels: Array[String]=["독립","동 연결 끝","남 연결 끝","동남 모서리","서 연결 끝","가로 직선","서남 모서리","남 T자","북 연결 끝","동북 모서리","세로 직선","동 T자","서북 모서리","북 T자","서 T자","십자"]
    var radius: float=cell_size*0.5
    for mask in range(16):
        var at: Vector2i=Vector2i(mask%4,mask/4)
        atlas.create_tile(at)
        var data: TileData=atlas.get_tile_data(at,0)
        data.texture_origin=texture_origin
        data.y_sort_origin=int(half_core)
        data.terrain_set=0
        data.terrain=0
        data.set_custom_data("connections",mask)
        data.set_custom_data("element",labels[mask])
        for side in range(4):
            data.set_terrain_peering_bit(SIDES[side],0 if mask&(1<<side) else -1)
        var parts: Array[Rect2]=[Rect2(-half_core,-half_core,core_size,core_size)]
        if mask&1: parts.append(Rect2(half_core,-half_core,radius-half_core,core_size))
        if mask&2: parts.append(Rect2(-half_core,half_core,core_size,radius-half_core))
        if mask&4: parts.append(Rect2(-radius,-half_core,radius-half_core,core_size))
        if mask&8: parts.append(Rect2(-half_core,-radius,core_size,radius-half_core))
        data.set_collision_polygons_count(0,parts.size())
        for part in range(parts.size()):
            data.set_collision_polygon_points(0,part,polygon(parts[part]))
    return tiles
func paint(layer: TileMapLayer,cells: Array[Vector2i]) -> bool:
    layer.set_cells_terrain_connect(cells,0,0,false)
    var occupied: Dictionary={}
    for cell in cells: occupied[cell]=true
    for cell in cells:
        var expected: int=0
        for side in range(4):
            if occupied.has(cell+DIRECTIONS[side]): expected|=1<<side
        var data: TileData=layer.get_cell_tile_data(cell)
        if data==null or int(data.get_custom_data("connections"))!=expected:
            return fail("Terrain connection mismatch at "+str(cell))
    return true
func validate_resource(tiles: TileSet) -> bool:
    var layer: TileMapLayer=TileMapLayer.new()
    layer.tile_set=tiles
    for mask in range(16):
        layer.clear()
        var cells: Array[Vector2i]=[Vector2i.ZERO]
        for side in range(4):
            if mask&(1<<side): cells.append(DIRECTIONS[side])
        if not paint(layer,cells): layer.free();return false
        if int(layer.get_cell_tile_data(Vector2i.ZERO).get_custom_data("connections"))!=mask:
            layer.free();return fail("Native Terrain could not paint connection state "+str(mask))
    # Generate a line and erase its centre through the native terrain API. The
    # resulting two end tiles and all-empty layer exercise actual erasure states.
    layer.clear()
    var line: Array[Vector2i]=[Vector2i(-1,0),Vector2i.ZERO,Vector2i(1,0)]
    if not paint(layer,line): layer.free();return false
    layer.set_cells_terrain_connect([Vector2i.ZERO],0,-1,false)
    if layer.get_cell_source_id(Vector2i.ZERO)!=-1:
        layer.free();return fail("Terrain erasure retained the middle wall")
    for cell in [Vector2i(-1,0),Vector2i(1,0)]:
        var data: TileData=layer.get_cell_tile_data(cell)
        if data==null or int(data.get_custom_data("connections"))!=0:
            layer.free();return fail("Terrain erasure retained a dangling connection")
    layer.set_cells_terrain_connect([Vector2i(-1,0),Vector2i(1,0)],0,-1,false)
    var helper: GDScript=load(LAYER_SCRIPT)
    var remaining: Array[Rect2]=helper.collect_collision_rects(layer,Transform2D.IDENTITY)
    if not layer.get_used_cells().is_empty() or not remaining.is_empty():
        layer.free();return fail("Empty layer retained saved wall cells or collision")
    layer.free()
    return true
func pack_scene(scene: Node2D,path: String) -> bool:
    var packed: PackedScene=PackedScene.new()
    if not check_error(packed.pack(scene),"Pack "+path): return false
    return check_error(ResourceSaver.save(packed,path),"Save "+path)
func make_layer(scene: Node2D,tiles: TileSet,position: Vector2) -> TileMapLayer:
    var walls: TileMapLayer=TileMapLayer.new()
    walls.name="Walls"
    walls.position=position
    walls.texture_filter=CanvasItem.TEXTURE_FILTER_NEAREST
    walls.y_sort_enabled=true
    walls.tile_set=tiles
    scene.add_child(walls);walls.owner=scene
    return walls
func add_camera(scene: Node2D,position: Vector2,zoom: float) -> void:
    var camera: Camera2D=Camera2D.new()
    camera.name="Camera2D"
    camera.position=position
    camera.zoom=Vector2(zoom,zoom)
    scene.add_child(camera);camera.owner=scene
func save_demo(tiles: TileSet) -> bool:
    var scene: Node2D=Node2D.new()
    scene.name="WallTilesDemo"
    var walls: TileMapLayer=make_layer(scene,tiles,Vector2(64,256))
    var cells: Array[Vector2i]=[]
    for x in range(8):
        cells.append(Vector2i(x,0))
        if x!=3 and x!=4: cells.append(Vector2i(x,4))
    for y in range(1,4):
        cells.append(Vector2i(0,y));cells.append(Vector2i(7,y))
    if not paint(walls,cells): scene.free();return false
    add_camera(scene,Vector2(320,320),0.5)
    var ok: bool=pack_scene(scene,"res://scenes/native_2d/wall_tiles_demo.tscn")
    scene.free()
    return ok
func add_reference_building(scene: Node2D,state: SceneState,needle: String,at: Vector2) -> void:
    for index in range(state.get_node_count()):
        if state.get_node_type(index)!=&"Sprite2D": continue
        var node_path: String=str(state.get_node_path(index))
        if not node_path.ends_with("/"+needle+"/Visual"): continue
        var values: Dictionary=properties(state,index)
        var texture: Texture2D=values.get("texture")
        if texture==null: return
        var sprite: Sprite2D=Sprite2D.new()
        sprite.name=needle
        sprite.texture=texture
        sprite.centered=false
        sprite.position=at
        sprite.texture_filter=CanvasItem.TEXTURE_FILTER_NEAREST
        # Copy the actual active image extent; do not scale source buildings.
        sprite.region_enabled=values.get("region_enabled",false)
        sprite.region_rect=values.get("region_rect",Rect2())
        scene.add_child(sprite);sprite.owner=scene
        return
func line_cells(cells: Dictionary,a: Vector2i,b: Vector2i) -> void:
    var direction: Vector2i=Vector2i(signi(b.x-a.x),signi(b.y-a.y))
    var point: Vector2i=a
    cells[point]=true
    while point!=b:
        point+=direction
        cells[point]=true
func save_perimeter_demo(tiles: TileSet,state: SceneState) -> bool:
    var scene: Node2D=Node2D.new()
    scene.name="WallPerimeterDemo"
    var ground: Polygon2D=Polygon2D.new()
    ground.name="Ground"
    ground.color=Color("#657155")
    ground.polygon=PackedVector2Array([Vector2(-64,-256),Vector2(2112,-256),Vector2(2112,1600),Vector2(-64,1600)])
    ground.z_index=-10
    scene.add_child(ground);ground.owner=scene
    var walls: TileMapLayer=make_layer(scene,tiles,Vector2.ZERO)
    var points: Array[Vector2i]=[Vector2i(0,0),Vector2i(31,0),Vector2i(31,7),Vector2i(28,7),Vector2i(28,10),Vector2i(31,10),Vector2i(31,23),Vector2i(0,23),Vector2i(0,0)]
    var occupied: Dictionary={}
    for index in range(points.size()-1): line_cells(occupied,points[index],points[index+1])
    for x in range(14,17): occupied.erase(Vector2i(x,23))
    for x in range(22,24): occupied.erase(Vector2i(x,0))
    var cells: Array[Vector2i]=[]
    for point in occupied: cells.append(point)
    if not paint(walls,cells): scene.free();return false
    add_reference_building(scene,state,"townhouse_01",Vector2(240,360))
    add_reference_building(scene,state,"여관_01",Vector2(1030,330))
    add_camera(scene,Vector2(1024,672),0.16)
    var ok: bool=pack_scene(scene,"res://scenes/native_2d/wall_perimeter_demo.tscn")
    scene.free()
    return ok
func update_plaza(tiles: TileSet) -> bool:
    var text: String=FileAccess.get_file_as_string(PLAZA_PATH)
    var regex: RegEx=RegEx.new()
    if not check_error(regex.compile('(?s)\n\\[node name="Walls"[^\n]*parent="\\."\\].*?(?=\n\\[node [^\n]*parent="\\."\\])'),"Compile plaza wall selector"): return false
    var found: RegExMatch=regex.search(text)
    if found==null: return fail("Expected saved plaza Walls block")
    # This migration branch is only for an old Sprite2D wall scene. Existing
    # native tilemap data is retained byte-for-byte after users paint it.
    if not found.get_string().contains('type="TileMapLayer"'):
        var walls: TileMapLayer=TileMapLayer.new()
        walls.tile_set=tiles
        var cells: Array[Vector2i]=[]
        for x in range(3,34): cells.append(Vector2i(x,46))
        for x in range(38,69): cells.append(Vector2i(x,46))
        if not paint(walls,cells): walls.free();return false
        var replacement: String='\n[node name="Walls" type="TileMapLayer" parent="."]\nposition = Vector2(0, 32)\ntexture_filter = 1\ny_sort_enabled = true\ntile_map_data = '+var_to_str(walls.tile_map_data)+'\ntile_set = ExtResource("native_wall_tiles")\nscript = ExtResource("native_wall_layer")\n'
        text=text.substr(0,found.get_start())+replacement+text.substr(found.get_end())
        walls.free()
    if not text.contains('id="native_wall_tiles"'):
        var insert: int=text.find("\n[sub_resource")
        if insert<0: return fail("Expected plaza resource insertion point")
        text=text.insert(insert,'\n[ext_resource type="TileSet" path="'+TILESET_PATH+'" id="native_wall_tiles"]\n[ext_resource type="Script" path="'+LAYER_SCRIPT+'" id="native_wall_layer"]\n')
    var clean: PackedStringArray=PackedStringArray()
    var load_steps: int=1
    for line in text.split("\n"):
        if line.begins_with("wall_rectangles = "): continue
        if line.contains('id="38_ewu0y"'): continue
        if line.begins_with("[ext_resource ") or line.begins_with("[sub_resource "): load_steps+=1
        clean.append(line)
    clean[0]="[gd_scene load_steps=%d format=4]"%load_steps
    var final_text: String="\n".join(clean)
    if final_text!=text:
        var file: FileAccess=FileAccess.open(PLAZA_PATH,FileAccess.WRITE)
        if file==null: return fail("Cannot write saved plaza")
        file.store_string(final_text);file.close()
    return true
func author() -> void:
    if not load_spec(): return
    var tiles: TileSet=create_tileset()
    if tiles==null: return
    if not validate_resource(tiles): return
    if not check_error(ResourceSaver.save(tiles,TILESET_PATH),"Save wall TileSet"): return
    tiles=ResourceLoader.load(TILESET_PATH,"TileSet",ResourceLoader.CACHE_MODE_REPLACE) as TileSet
    if tiles==null: fail("Cannot reload saved wall TileSet");return
    if not update_plaza(tiles): return
    var packed: PackedScene=ResourceLoader.load(PLAZA_PATH,"PackedScene",ResourceLoader.CACHE_MODE_REPLACE)
    if packed==null: fail("Cannot reload saved plaza");return
    var state: SceneState=packed.get_state()
    var helper: GDScript=load(LAYER_SCRIPT)
    var saved: Dictionary=helper.saved_collision_rects(state)
    if not saved.found: fail("Saved plaza is missing its editable wall layer");return
    if not FileAccess.file_exists("res://scenes/native_2d/wall_tiles_demo.tscn") or "--reset-demo" in OS.get_cmdline_user_args():
        if not save_demo(tiles): return
    if not FileAccess.file_exists("res://scenes/native_2d/wall_perimeter_demo.tscn") or "--reset-perimeter-demo" in OS.get_cmdline_user_args():
        if not save_perimeter_demo(tiles,state): return
    print("NATIVE_WALL_V4_AUTHORED: 64px grid / 12px core / 192px height; native Terrain states 16/16 + erase + empty collision; saved plaza parts=",saved.rectangles.size())
    quit()

