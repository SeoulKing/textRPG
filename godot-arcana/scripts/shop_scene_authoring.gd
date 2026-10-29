extends RefCounted
const Data = preload("res://scripts/shop_layout_2d.gd")
const FloorArt = preload("res://scripts/shop_authored_floor.gd")
static func rebuild() -> void:
	var root = load("res://scenes/shop_2d.tscn").instantiate()
	var tiles = root.get_node("Floor").tile_set as TileSet
	var specs = Data.definitions()
	var ids: Dictionary = {}
	DirAccess.make_dir_recursive_absolute("res://scenes/shop/walls")
	var collection = TileSetScenesCollectionSource.new()
	for id in specs:
		var spec: Dictionary = specs[id]
		if not spec.kind in ["wall","door"]: continue
		var tile = Node2D.new()
		tile.name = str(id).replace("-","_").to_pascal_case()
		tile.set_script(load("res://scripts/shop_wall_tile.gd"))
		tile.asset_id = id
		var sprite = Sprite2D.new()
		sprite.name = "Visual"
		sprite.texture = load(spec.file)
		sprite.centered = false
		sprite.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		sprite.offset = -Vector2(spec.foot[0],spec.foot[1])
		sprite.scale.y = 1.0/Data.PITCH
		sprite.position = Vector2(-16,-16)
		if spec.has("offset"): sprite.position += Vector2(spec.offset[0],spec.offset[1])*64
		sprite.z_index = -8 if str(id).begins_with("wall-back") else (8 if spec.kind == "wall" else 0)
		tile.add_child(sprite)
		sprite.owner = tile
		var packed = PackedScene.new()
		packed.pack(tile)
		packed.set_meta("shop_asset",id)
		var path = "res://scenes/shop/walls/"+str(id)+".tscn"
		ResourceSaver.save(packed,path)
		ids[id] = collection.create_scene_tile(load(path))
		collection.set_scene_tile_display_placeholder(ids[id],false)
		tile.free()
	var painted: Dictionary = {}
	for layer in root.get_children():
		if not layer is TileMapLayer or layer.name == "Floor": continue
		painted[layer.name] = []
		for cell in layer.get_used_cells():
			var tile = layer.get_cell_tile_data(cell)
			var id: String
			if tile != null: id = tile.get_custom_data("asset")
			else:
				var old = tiles.get_source(layer.get_cell_source_id(cell)) as TileSetScenesCollectionSource
				id = Data.scene_asset(old.get_scene_tile_scene(layer.get_cell_alternative_tile(cell)))
			painted[layer.name].append({"cell":cell,"id":id})
	var remove: Array[int] = []
	for n in tiles.get_source_count():
		var id = tiles.get_source_id(n)
		var atlas = tiles.get_source(id) as TileSetAtlasSource
		if atlas != null:
			var asset: String = atlas.get_tile_data(Vector2i.ZERO,0).get_custom_data("asset")
			if specs.get(asset,{}).get("kind","") in ["wall","door"]: remove.append(id)
	if tiles.has_source(200): remove.append(200)
	for id in remove: tiles.remove_source(id)
	tiles.add_source(collection,200)
	ResourceSaver.save(tiles,"res://art/resources/shop_2d_tileset.tres")
	for layer in root.get_children():
		if not layer is TileMapLayer: continue
		FloorArt.register(layer)
		layer.visible = true
		layer.z_index = -20 if layer.name == "Floor" else 0
		if layer.name == "Floor": continue
		layer.clear()
		for entry in painted[layer.name]: layer.set_cell(entry.cell,200,Vector2i.ZERO,ids[entry.id])
	var actors = root.get_node_or_null("Actors")
	if actors == null:
		actors = Node2D.new()
		actors.name = "Actors"
		actors.y_sort_enabled = true
		root.add_child(actors)
		actors.owner = root
		var merchant = Sprite2D.new()
		merchant.name = "Merchant"
		merchant.texture = load("res://art/export/shop-2d/merchant.png")
		merchant.centered = false
		merchant.offset = Vector2(-48,-116)
		merchant.position = Data.canvas(Data.collect(root).markers.actor)
		actors.add_child(merchant)
		merchant.owner = root
	root.get_node("Furniture").visible = true
	var result = PackedScene.new()
	result.pack(root)
	ResourceSaver.save(result,"res://scenes/shop_2d.tscn")
	print("SHOP unified native layers, furniture and Actors saved; no separate preview")
	root.free()