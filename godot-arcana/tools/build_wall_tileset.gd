extends SceneTree
## Explicit asset build only. Never overwrites an existing painted map.
const OUT = "res://art/resources/wall_tileset.tres"
func _initialize() -> void:
	var tiles = TileSet.new()
	tiles.tile_size = Vector2i(192,136)
	tiles.add_terrain_set()
	tiles.set_terrain_set_mode(0,TileSet.TERRAIN_MODE_MATCH_SIDES)
	tiles.add_terrain(0)
	tiles.set_terrain_name(0,0,"성벽")
	tiles.set_terrain_color(0,0,Color("d5a44f"))
	var atlas = TileSetAtlasSource.new()
	atlas.texture = load("res://art/export/walls/wall-terrain.png")
	atlas.texture_region_size = Vector2i(192,512)
	tiles.add_source(atlas,0)
	var sides = [TileSet.CELL_NEIGHBOR_RIGHT_SIDE,TileSet.CELL_NEIGHBOR_BOTTOM_SIDE,TileSet.CELL_NEIGHBOR_LEFT_SIDE,TileSet.CELL_NEIGHBOR_TOP_SIDE]
	for phase in range(4):
		for mask in range(16):
			var coords = Vector2i(mask,phase)
			atlas.create_tile(coords)
			var data = atlas.get_tile_data(coords,0)
			data.texture_origin = Vector2i(0,224)
			data.terrain_set = 0
			data.terrain = 0
			for bit in range(4):
				data.set_terrain_peering_bit(sides[bit],0 if mask & (1<<bit) else -1)
	var tower = TileSetAtlasSource.new()
	tower.texture = load("res://art/export/walls/gate-tower.png")
	tower.texture_region_size = Vector2i(192,512)
	tiles.add_source(tower,1)
	tower.create_tile(Vector2i.ZERO)
	tower.get_tile_data(Vector2i.ZERO,0).texture_origin = Vector2i(0,224)
	var result = ResourceSaver.save(tiles,OUT)
	if result != OK:
		push_error("Could not save wall tileset: "+str(result))
		quit(1)
		return
	print("Saved reusable native wall Terrain TileSet: ",OUT)
	quit()
