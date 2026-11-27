extends RefCounted
## Reuse the authored room floor without repainting or flattening placement cells.
const SOURCE = 100
static func install(tiles: TileSet) -> void:
	if tiles.has_source(SOURCE): tiles.remove_source(SOURCE)
	var atlas = TileSetAtlasSource.new()
	atlas.texture = load("res://art/export/shop-interior/floor-room-v2.png")
	atlas.texture_region_size = Vector2i(32,32)
	tiles.add_source(atlas,SOURCE)
	for y in range(18):
		for x in range(28):
			var cell = Vector2i(x,y)
			atlas.create_tile(cell)
			atlas.get_tile_data(cell,0).set_custom_data("asset","floor-0-0")
static func register(layer: TileMapLayer) -> void:
	layer.position = Vector2.ZERO
	layer.scale = Vector2.ONE
	layer.z_index = -20
static func paint(layer: TileMapLayer) -> void:
	register(layer)
	for cell in layer.get_used_cells():
		layer.set_cell(cell,SOURCE,Vector2i(posmod(cell.x,28),posmod(cell.y,18)),0)