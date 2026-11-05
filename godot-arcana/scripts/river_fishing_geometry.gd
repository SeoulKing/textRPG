@tool
extends Node2D
static func _box(node: Node2D, rect: Rect2) -> Dictionary:
    var a: Vector2 = node.to_global(rect.position)/4.0
    var b: Vector2 = node.to_global(rect.end)/4.0
    var box := Rect2(a,b-a).abs()
    return {"x":box.position.x,"y":box.position.y,"w":box.size.x,"h":box.size.y}
func fishing_geometry() -> Dictionary:
    var water := get_node("Water") as TileMapLayer
    var tile: Vector2 = Vector2(water.tile_set.tile_size)
    var deck := get_node("Bridge/Deck") as Sprite2D
    var rows: Dictionary = {}
    var regions: Array = []
    for cell in water.get_used_cells():
        if not rows.has(cell.y): rows[cell.y] = []
        rows[cell.y].append(cell.x)
    for y in rows:
        var row: Array = rows[y]
        row.sort()
        var first: int = int(row[0])
        var last: int = first
        for i in range(1,row.size()+1):
            if i<row.size() and int(row[i])==last+1:
                last=int(row[i])
                continue
            regions.append(_box(water,Rect2(Vector2(first,int(y))*tile,Vector2(last-first+1,1)*tile)))
            if i<row.size(): first=int(row[i]);last=first
    return {"water":regions,"excluded":[_box(deck,deck.get_rect())]}
func water_at(point: Vector2) -> bool:
    var water := get_node("Water") as TileMapLayer
    var deck := get_node("Bridge/Deck") as Sprite2D
    if deck.get_rect().has_point(deck.to_local(point*4.0)): return false
    return water.get_cell_source_id(water.local_to_map(water.to_local(point*4.0))) >= 0
func cast_target(point: Vector2, heading: Vector2) -> Dictionary:
    if heading.length_squared()<.001 or water_at(point): return {}
    var direction: Vector2 = heading.normalized()
    for distance in range(16,65,2):
        var target: Vector2 = point+direction*float(distance)
        if water_at(target) and water_at(target+direction*6.0):
            return {"x":target.x,"y":target.y}
    return {}
