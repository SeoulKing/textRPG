extends SceneTree
## Export runtime collision/door data from the same authored source as the client.
func _init() -> void:
	call_deferred("_export")

func _export() -> void:
	var world = load("res://scripts/world.gd").new()
	root.add_child(world)
	world.set_process(false)
	var result: Dictionary = {"outside": _area(world, true)}
	for id in ["arcana_shop","arcana_inn","arcana_restaurant","arcana_academy"]:
		world.change_interior(id)
		if id == "arcana_academy":
			for level in [1,2]:
				if level != 1: world.change_academy_floor(level)
				result[id+":"+str(level)] = _area(world, false)
		else:
			result[id] = _area(world, false)
	var output: String = OS.get_environment("ARCANA_LAYOUT_OUTPUT")
	if output.is_empty(): output = "res://art/export/online-layout.json"
	var file = FileAccess.open(output, FileAccess.WRITE)
	if file == null:
		push_error("Cannot write online collision layout: "+output)
		quit(1)
		return
	file.store_string(JSON.stringify(result,"\t"))
	file.close()
	var authored = world.layout
	world.queue_free()
	if is_instance_valid(authored) and authored.get_parent() == null: authored.queue_free()
	await process_frame
	await process_frame
	quit()

func _area(world: Node, outside: bool) -> Dictionary:
	var area_fishing: Dictionary = {}
	var rectangles: Array = []
	for rect in world.obstacles:
		rectangles.append({"x":rect.position.x,"y":rect.position.y,"w":rect.size.x,"h":rect.size.y})
	var doors: Array = []
	for entity in world.entities:
		if entity.kind in ["building","exit","gate","city","portal","slime"]:
			var id: String = str(entity.id)
			if entity.kind == "gate": id = "arcana_city_gate"
			if entity.kind == "city": id = "arcana_plaza"
			if entity.kind == "slime": id = "arcana_hunting_ground"
			var door: Dictionary = {"id":id,"x":entity.pos.x,"y":entity.pos.y,"radius":48}
			if entity.kind == "building":
				var outside_point: Vector2 = entity.pos - entity.get("inward",Vector2.UP)*12.0
				door.arrival = {"x":outside_point.x,"y":outside_point.y}
			doors.append(door)
	if outside:
		var river = world.layout.get_node_or_null("Placements/RiverQuarter")
		if river != null: area_fishing = river.fishing_geometry()
		doors.append({"id":"arcana_plaza","x":world.CityMap.CITY_RETURN.x,"y":world.CityMap.CITY_RETURN.y,"radius":72})
		doors.append({"id":"arcana_hunting_ground","x":world.CityMap.FIELD_ENTRY.x,"y":world.CityMap.FIELD_ENTRY.y,"radius":72})
	var box: Rect2 = world.CityMap.WALK_BOUNDS if outside else Rect2(30,30,320,296)
	var bounds: Dictionary = {"x":box.position.x,"y":box.position.y,"w":box.size.x,"h":box.size.y}
	var area: Dictionary = {"rectangles":rectangles,"doors":doors,"bounds":bounds,"spawn":{"x":world.player_position.x,"y":world.player_position.y}}
	if outside: area.fishing = area_fishing
	if world.indoor == "arcana_shop":
		area.floorDomain = {"origin":{"x":80,"y":64},"cellSize":8,"cells":world.shop_layout.floor.duplicate()}
	return area
