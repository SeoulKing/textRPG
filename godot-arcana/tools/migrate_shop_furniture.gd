extends SceneTree
const Data = preload("res://scripts/shop_layout_2d.gd")
func _initialize() -> void:
	call_deferred("migrate")
func migrate() -> void:
	var packed = load("res://scenes/shop_2d.tscn") as PackedScene
	var root = packed.instantiate()
	var old = root.get_node("Furniture")
	if not old is TileMapLayer:
		print("Furniture scenes already migrated")
		root.free()
		quit()
		return
	var specs = Data.definitions()
	var furniture = Node2D.new()
	furniture.name = "Furniture"
	furniture.y_sort_enabled = true
	root.remove_child(old)
	root.add_child(furniture)
	furniture.owner = root
	DirAccess.make_dir_recursive_absolute("res://scenes/props/shop/furniture")
	for cell in old.get_used_cells():
		var id: String = old.get_cell_tile_data(cell).get_custom_data("asset")
		var spec: Dictionary = specs[id]
		var path = "res://scenes/props/shop/furniture/"+id+".tscn"
		if not FileAccess.file_exists(path):
			var prop = Sprite2D.new()
			prop.name = id.replace("-","_").to_pascal_case()
			prop.set_script(load("res://scripts/shop_furniture_2d.gd"))
			prop.asset_id = id
			prop.texture = load(spec.file)
			prop.centered = false
			prop.offset = -Vector2(spec.foot[0],spec.foot[1])
			prop.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
			var resource = PackedScene.new()
			resource.pack(prop)
			ResourceSaver.save(resource,path)
			prop.free()
		var instance = load(path).instantiate()
		var at = Data.ORIGIN+Vector2(cell)*Data.STEP
		if spec.get("anchor","minimum") == "front-center": at += Vector2(spec.footprint[0]*.5,spec.footprint[1])
		if spec.has("offset"): at += Vector2(spec.offset[0],spec.offset[1])
		instance.position = Data.canvas(at*Data.UNIT)
		furniture.add_child(instance)
		instance.owner = root
	root.y_sort_enabled = true
	var result = PackedScene.new()
	result.pack(root)
	ResourceSaver.save(result,"res://scenes/shop_2d.tscn")
	print("Furniture scene instances saved: ",furniture.get_child_count())
	old.free()
	root.free()
	quit()