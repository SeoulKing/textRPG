extends SceneTree
func _initialize() -> void:
	var tiles = load("res://art/resources/shop_2d_tileset.tres") as TileSet
	var specs: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://art/export/shop-2d/assets.json")).assets
	while tiles.get_patterns_count() > 1: tiles.remove_pattern(tiles.get_patterns_count()-1)
	var remove: Array[int] = []
	for n in tiles.get_source_count():
		var id = tiles.get_source_id(n)
		var atlas = tiles.get_source(id) as TileSetAtlasSource
		var asset: String = atlas.get_tile_data(Vector2i.ZERO,0).get_custom_data("asset")
		if specs[asset].kind == "furniture": remove.append(id)
	for id in remove: tiles.remove_source(id)
	ResourceSaver.save(tiles,"res://art/resources/shop_2d_tileset.tres")
	print("Furniture removed from architecture tile library: ",remove.size())
	quit()