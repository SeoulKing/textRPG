extends SceneTree
## Explicit one-shot authoring of approved paving; normal builds preserve this map.
func _initialize() -> void:
    var arguments = OS.get_cmdline_user_args()
    if arguments.is_empty():
        push_error("Pass the approved layout.json path after --")
        quit(1)
        return
    var plan: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(arguments[0]))
    var map = load("res://scenes/ground/city_ground.tscn").instantiate()
    var grass: TileMapLayer = map.get_node("Grass")
    var soil: TileMapLayer = map.get_node("Soil")
    var paving: TileMapLayer = map.get_node("Paving")
    grass.clear()
    soil.clear()
    paving.clear()
    var spec: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://art/export/ground/tiles.json"))
    var indices: Dictionary = {}
    var full: Array[Vector2i] = []
    var soil_tile = Vector2i.ZERO
    for i in range(spec.tiles.size()):
        var entry: Dictionary = spec.tiles[i]
        var coordinate = Vector2i(i % 8, i / 8)
        if entry.kind == "paving":
            var mask = int(entry.mask)
            if not indices.has(mask): indices[mask] = coordinate
            if mask == 255: full.append(coordinate)
        elif entry.kind == "soil": soil_tile = coordinate
    var occupied: Dictionary = {}
    var center = Vector2(plan.fountain[0],plan.fountain[1])
    var radii = Vector2(plan.plazaRadii[0],plan.plazaRadii[1])
    for y in range(90):
        for x in range(72):
            var cell = Vector2i(x,y)
            var p = Vector2(cell) + Vector2(.5,.5)
            grass.set_cell(cell,0,Vector2i(posmod(x*7+y*11,4),0))
            var stone = ((p-center)/radii).length() < 1.0
            for area in plan.roads:
                if Rect2(area[0],area[1],area[2],area[3]).has_point(p): stone = true
            var approach: Array = plan.southStoneRoad
            if Rect2(approach[0],approach[1],approach[2],approach[3]).has_point(p): stone = true
            for area in plan.gardens:
                if Rect2(area[0],area[1],area[2],area[3]).has_point(p): stone = false
            if stone:
                occupied[cell] = true
            else:
                var outside: Array = plan.southSoilRoad
                if Rect2(outside[0],outside[1],outside[2],outside[3]).has_point(p):
                    soil.set_cell(cell,0,soil_tile)
    var offsets = [Vector2i(1,0),Vector2i(1,1),Vector2i(0,1),Vector2i(-1,1),Vector2i(-1,0),Vector2i(-1,-1),Vector2i(0,-1),Vector2i(1,-1)]
    for cell in occupied:
        var mask = 0
        for b in [0,2,4,6]:
            if occupied.has(cell+offsets[b]): mask |= 1 << b
        for b in [1,3,5,7]:
            if mask & (1 << ((b+7)%8)) and mask & (1 << ((b+1)%8)) and occupied.has(cell+offsets[b]): mask |= 1 << b
        var atlas: Vector2i = indices[mask]
        if mask == 255: atlas = full[posmod(cell.x*7+cell.y*11,full.size())]
        paving.set_cell(cell,0,atlas)
    map.set_meta("approved_design","arcana-city-center/concept-v1")
    var packed = PackedScene.new()
    if packed.pack(map) != OK or ResourceSaver.save(packed,"res://scenes/ground/city_ground.tscn") != OK:
        quit(1)
        return
    print("Authored approved city paving: ",occupied.size()," stone cells; southern gate road connected.")
    map.free()
    quit()