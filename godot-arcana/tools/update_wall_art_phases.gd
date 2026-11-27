extends SceneTree
func _initialize() -> void:
	var path = "res://scenes/walls/city_walls.tscn"
	var scene = load(path).instantiate()
	var walls: TileMapLayer = scene.get_node("Walls")
	var towers: TileMapLayer = scene.get_node("Towers")
	# Old 1-unit cells are migrated only when still using the former 64-pixel atlas.
	var migrate = walls.get_meta("bay_grid_version",0) != 2
	if migrate:
		var old_cells = walls.get_used_cells()
		var next_cells: Array[Vector2i] = []
		for cell in old_cells:
			var point = Vector2(float(cell.x)+.5,float(cell.y))
			var mapped = Vector2i(roundi((point.x-3.0)/3.0),roundi(point.y/3.0))
			if not next_cells.has(mapped): next_cells.append(mapped)
		walls.clear()
		walls.set_cells_terrain_connect(next_cells,0,0,false)
		var tower_cells = towers.get_used_cells()
		towers.clear()
		for cell in tower_cells:
			var mapped = Vector2i(roundi((float(cell.x)+.5-3.0)/3.0),roundi(float(cell.y)/3.0))
			towers.set_cell(mapped,1,Vector2i.ZERO)
		walls.set_meta("bay_grid_version",2)
	for cell in walls.get_used_cells():
		var coords = walls.get_cell_atlas_coords(cell)
		walls.set_cell(cell,0,Vector2i(coords.x,posmod(cell.x,4)))
	var packed = PackedScene.new()
	packed.pack(scene)
	var result = ResourceSaver.save(packed,path)
	scene.free()
	print("Registered complete 3-unit masonry bays: ",result)
	quit(0 if result==OK else 1)
