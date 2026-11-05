@tool
extends TileMapLayer
## Saved cells are the authoring source. Runtime sprites participate in the
## world's existing per-object depth sorting and player-occlusion fading.
var _runtime_prepared: bool = false

func prepare_runtime_visuals() -> void:
    if Engine.is_editor_hint() or _runtime_prepared:
        return
    _runtime_prepared = true
    if tile_set != null:
        for cell in get_used_cells():
            var atlas: TileSetAtlasSource = tile_set.get_source(get_cell_source_id(cell)) as TileSetAtlasSource
            var data: TileData = get_cell_tile_data(cell)
            if atlas == null or data == null:
                continue
            var texture_region: Rect2i = atlas.get_tile_texture_region(get_cell_atlas_coords(cell))
            var texture: AtlasTexture = AtlasTexture.new()
            texture.atlas = atlas.texture
            texture.region = Rect2(texture_region)
            var sprite: Sprite2D = Sprite2D.new()
            sprite.name = "Wall_%d_%d" % [cell.x, cell.y]
            sprite.texture = texture
            sprite.centered = false
            sprite.position = map_to_local(cell)
            sprite.offset = -Vector2(texture_region.size) * 0.5 - Vector2(data.texture_origin)
            sprite.flip_h = data.flip_h
            sprite.flip_v = data.flip_v
            sprite.modulate = data.modulate
            sprite.material = data.material
            sprite.set_meta("native_wall", true)
            sprite.set_meta("native_wall_sort_origin", data.y_sort_origin + y_sort_origin)
            add_child(sprite)
    # Disabling the TileMapLayer removes its native draw/physics, not its Node2D
    # children. Never save this runtime state back over the editor's painted map.
    enabled = false

func map_collision_rects(layout: Node2D) -> Array[Rect2]:
    var relative: Transform2D = transform
    var ancestor: Node = get_parent()
    while ancestor != null and ancestor != layout:
        if ancestor is Node2D:
            relative = ancestor.transform * relative
        ancestor = ancestor.get_parent()
    return collect_collision_rects(self, relative)

static func collect_collision_rects(layer: TileMapLayer, relative: Transform2D) -> Array[Rect2]:
    var rectangles: Array[Rect2] = []
    if layer.tile_set == null or layer.tile_set.get_physics_layers_count() == 0:
        return rectangles
    for cell in layer.get_used_cells():
        var data: TileData = layer.get_cell_tile_data(cell)
        if data == null:
            continue
        var center: Vector2 = layer.map_to_local(cell)
        for polygon_index in range(data.get_collision_polygons_count(0)):
            var points: PackedVector2Array = data.get_collision_polygon_points(0, polygon_index)
            if points.is_empty():
                continue
            var first: Vector2 = relative * (center + points[0]) / 4.0
            var rectangle: Rect2 = Rect2(first, Vector2.ZERO)
            for point in points:
                rectangle = rectangle.expand(relative * (center + point) / 4.0)
            if rectangle.has_area():
                rectangles.append(rectangle)
    return rectangles

static func saved_collision_rects(state: SceneState) -> Dictionary:
    # Export just TileMapLayer resources/cells, without constructing the plaza,
    # running its tool scripts, or booting the game via the root's _ready().
    var rectangles: Array[Rect2] = []
    var transforms: Dictionary = {}
    var found: bool = false
    for index in range(state.get_node_count()):
        var values: Dictionary = {}
        for property_index in range(state.get_node_property_count(index)):
            values[str(state.get_node_property_name(index, property_index))] = state.get_node_property_value(index, property_index)
        var local: Transform2D = values.get("transform", Transform2D(float(values.get("rotation", 0.0)), values.get("scale", Vector2.ONE), float(values.get("skew", 0.0)), values.get("position", Vector2.ZERO)))
        var relative: Transform2D = Transform2D.IDENTITY if index == 0 else transforms.get(state.get_node_path(index, true), Transform2D.IDENTITY) * local
        transforms[state.get_node_path(index)] = relative
        if state.get_node_type(index) != &"TileMapLayer" or state.get_node_name(index) != &"Walls":
            continue
        found = true
        var layer: TileMapLayer = TileMapLayer.new()
        layer.tile_set = values.get("tile_set")
        layer.tile_map_data = values.get("tile_map_data", PackedByteArray())
        rectangles.append_array(collect_collision_rects(layer, relative))
        layer.free()
    return {"found": found, "rectangles": rectangles}
