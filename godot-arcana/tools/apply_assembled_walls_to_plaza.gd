extends SceneTree
const MANIFEST="res://art/source/walls/assembled-v1/manifest.json"
const TILESET="res://art/resources/assembled_wall_tileset.tres"
const PLAZA="res://scenes/native_2d/plaza.tscn"
func _initialize() -> void: call_deferred("apply")
func apply() -> void:
    var data: Dictionary=JSON.parse_string(FileAccess.get_file_as_string(MANIFEST))
    var parts: Dictionary={}
    for part in data.parts: parts[str(part.id)]=part
    var layer: TileMapLayer=TileMapLayer.new()
    layer.tile_set=load(TILESET)
    var items: Array=[]
    items.append(["sw",192,2768])
    for index in range(14): items.append(["front_repeat_left",288+index*128,2800])
    items.append(["gate_left",2080,2768])
    items.append(["gate_right",2432,2768])
    for index in range(14): items.append(["front_repeat_right",2528+index*128,2800])
    items.append(["se",4320,2768])
    for item in items:
        var part: Dictionary=parts[item[0]]
        layer.set_cell(Vector2i(item[1]/16,item[2]/16),0,Vector2i(part.atlas[0],part.atlas[1]),0)
    var text: String=FileAccess.get_file_as_string(PLAZA)
    var regex: RegEx=RegEx.new()
    regex.compile('(?s)\n\\[node name="Walls"[^\n]*parent="\\."\\].*?(?=\n\\[node [^\n]*parent="\\."\\])')
    var found: RegExMatch=regex.search(text)
    if found==null: push_error("Missing saved Walls layer");layer.free();quit(1);return
    var backup: String="res://art/source/walls/assembled-v1/previous-plaza-walls.txt"
    if not FileAccess.file_exists(backup):
        var previous: FileAccess=FileAccess.open(backup,FileAccess.WRITE)
        previous.store_string(found.get_string());previous.close()
    var replacement: String='\n[node name="Walls" type="TileMapLayer" parent="."]\nposition = Vector2(0, 8)\ntexture_filter = 1\ntile_map_data = '+var_to_str(layer.tile_map_data)+'\ntile_set = ExtResource("native_wall_tiles")\nscript = ExtResource("native_wall_layer")\n'
    text=text.substr(0,found.get_start())+replacement+text.substr(found.get_end())
    text=text.replace('path="res://art/resources/native_wall_tileset.tres" id="native_wall_tiles"','path="'+TILESET+'" id="native_wall_tiles"')
    var file: FileAccess=FileAccess.open(PLAZA,FileAccess.WRITE)
    if file==null: push_error("Cannot write plaza");layer.free();quit(1);return
    file.store_string(text);file.close();layer.free()
    var packed: PackedScene=ResourceLoader.load(PLAZA,"PackedScene",ResourceLoader.CACHE_MODE_REPLACE)
    if packed==null: push_error("Cannot load updated plaza");quit(1);return
    var result: Dictionary=preload("res://scripts/native_2d_wall_layer.gd").saved_collision_rects(packed.get_state())
    if not result.found or result.rectangles.is_empty(): push_error("Missing assembled collision");quit(1);return
    print("APPROVED_WALLS_APPLIED: 32 approved pieces; saved collision parts=",result.rectangles.size())
    quit()

