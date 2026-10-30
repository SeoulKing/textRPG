extends SceneTree
## Optional reusable arrangement, kept separate from the user's empty city map.
func _initialize() -> void:
	var path = "res://scenes/walls/wall_examples.tscn"
	if FileAccess.file_exists(path):
		quit()
		return
	var scene = Node2D.new()
	scene.name = "WallExamples"
	var walls = TileMapLayer.new()
	walls.name = "Walls"
	walls.tile_set = load("res://art/resources/wall_tileset.tres")
	walls.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	walls.y_sort_enabled = true
	scene.add_child(walls)
	walls.owner = scene
	var cells: Array[Vector2i] = []
	for x in range(9):
		cells.append(Vector2i(x,0))
		if x not in [4,5]: cells.append(Vector2i(x,5))
	for y in range(1,5):
		cells.append(Vector2i(0,y))
		cells.append(Vector2i(8,y))
	for y in range(-2,3): cells.append(Vector2i(4,y))
	walls.set_cells_terrain_connect(cells,0,0,false)
	var towers = TileMapLayer.new()
	towers.name = "Towers"
	towers.tile_set = walls.tile_set
	towers.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	towers.y_sort_enabled = true
	scene.add_child(towers)
	towers.owner = scene
	for cell in [Vector2i(3,5),Vector2i(6,5)]: towers.set_cell(cell,1,Vector2i.ZERO)
	var packed = PackedScene.new()
	packed.pack(scene)
	ResourceSaver.save(packed,path)
	scene.free()
	print("Created optional wall examples; city map remains empty")
	quit()
