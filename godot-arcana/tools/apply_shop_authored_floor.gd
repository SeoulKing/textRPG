extends SceneTree
const FloorArt = preload("res://scripts/shop_authored_floor.gd")
func _initialize() -> void:
	var tiles = load("res://art/resources/shop_2d_tileset.tres") as TileSet
	FloorArt.install(tiles)
	ResourceSaver.save(tiles,"res://art/resources/shop_2d_tileset.tres")
	var root = load("res://scenes/shop_2d.tscn").instantiate()
	FloorArt.paint(root.get_node("Floor"))
	var packed = PackedScene.new()
	packed.pack(root)
	ResourceSaver.save(packed,"res://scenes/shop_2d.tscn")
	print("SHOP_FLOOR original authored floor applied to existing cells; furniture preserved")
	root.free()
	quit()