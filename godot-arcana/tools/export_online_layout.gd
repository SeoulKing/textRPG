extends SceneTree
## Export runtime collision/door data from the same authored source as the client.
const InnTileLayout = preload("res://scripts/inn_tile_layout.gd")
const RestaurantTileLayout = preload("res://scripts/restaurant_tile_layout.gd")
const AcademyFloorLayout = preload("res://scripts/academy_first_floor_layout.gd")
const RegionRegistry = preload("res://scripts/region_registry.gd")

func _init() -> void:
	call_deferred("_export")

func _export() -> void:
	var world = load("res://scripts/world.gd").new()
	var source := OS.get_environment("ARCANA_PLAZA_LAYOUT_SCENE")
	if not source.is_empty():
		var layout_source := preload("res://scripts/plaza_3d_game_layout.gd").new(source)
		if not layout_source.loaded_from_scene:
			push_error("Could not read plaza layout from " + source)
			layout_source.free()
			world.free()
			quit(1)
			return
		world.layout = layout_source
	root.add_child(world)
	world.set_process(false)
	var result: Dictionary = {"outside": _area(world, true)}
	world.set_outdoor_field(world.FOREST_LOCATION)
	var forest := _area(world, true)
	if not forest.get("forestTrees", {}).has("forest_trees"):
		push_error("Could not export the registered 3D pondside forest and its timber oak.")
		world.free()
		quit(1)
		return
	result[world.FOREST_LOCATION] = forest
	world.set_outdoor_field("")
	for id in ["arcana_shop","arcana_inn","arcana_restaurant","arcana_academy","arcana_home"]:
		world.change_interior(id)
		if id == "arcana_academy":
			for level in [1,2]:
				if level != 1: world.change_academy_floor(level)
				result[id+":"+str(level)] = _area(world, false)
		else:
			result[id] = _area(world, false)
	var home_furniture := _home_furniture()
	if home_furniture.is_empty():
		push_error("Could not export the player home's furniture grid and fixtures.")
		quit(1)
		return
	result.arcana_home.furniture = home_furniture
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
	var city: bool = outside and world.outdoor_field.is_empty()
	var plaza_v2: bool = city and world.uses_plaza_v2()
	var area_fishing: Dictionary = {}
	var static_obstacles: Array = world.obstacles.duplicate()
	var forest_trees: Dictionary = {}
	var doors: Array = []
	for entity in world.entities:
		if entity.kind == "forest_trees":
			var collision: Array = []
			for rect: Rect2 in entity.collision_parts:
				static_obstacles.erase(rect)
				collision.append(_rect(rect))
			forest_trees[entity.id] = {"position": _point(entity.pos), "radius": float(entity.get("interaction_radius", 34.0)), "rectangles": collision}
		if entity.kind in ["building","exit","gate","city","portal","slime","forest_entrance"] or world.indoor == "arcana_home":
			var id: String = str(entity.id)
			if entity.kind == "gate": id = "arcana_city_gate"
			if entity.kind in ["city", "forest_entrance"]: id = "arcana_plaza"
			if entity.kind == "slime": id = "arcana_hunting_ground"
			var radius := 48.0
			if world.indoor == "arcana_home":
				radius = float(entity.get("interaction_radius", 26.0))
			elif entity.kind == "forest_entrance":
				radius = float(entity.get("interaction_radius", radius))
			var door: Dictionary = {"id":id,"x":entity.pos.x,"y":entity.pos.y,"radius":radius}
			if entity.kind == "building":
				var outside_point: Vector2 = entity.pos - entity.get("inward",Vector2.UP)*12.0
				door.arrival = {"x":outside_point.x,"y":outside_point.y}
			doors.append(door)
	if city:
		if plaza_v2:
			area_fishing = world.layout.fishing_geometry()
		else:
			var river = world.layout.get_node_or_null("Placements/RiverQuarter")
			if river != null: area_fishing = river.fishing_geometry()
			doors.append({"id":"arcana_plaza","x":world.CityMap.CITY_RETURN.x,"y":world.CityMap.CITY_RETURN.y,"radius":72})
			doors.append({"id":"arcana_hunting_ground","x":world.CityMap.FIELD_ENTRY.x,"y":world.CityMap.FIELD_ENTRY.y,"radius":72})
	var box := Rect2(30,30,320,296)
	if outside:
		box = world.outside_walk_bounds()
	elif world.indoor == "arcana_inn":
		box = InnTileLayout.WALK_BOUNDS
	elif world.indoor == "arcana_restaurant":
		box = RestaurantTileLayout.WALK_BOUNDS
	elif world.uses_academy_first_floor_layout():
		box = AcademyFloorLayout.WALK_BOUNDS
	var bounds: Dictionary = {"x":box.position.x,"y":box.position.y,"w":box.size.x,"h":box.size.y}
	var rectangles: Array = []
	for rect: Rect2 in static_obstacles:
		rectangles.append(_rect(rect))
	var area: Dictionary = {"rectangles":rectangles,"doors":doors,"bounds":bounds,"spawn":{"x":world.player_position.x,"y":world.player_position.y}}
	if not forest_trees.is_empty():
		area.forestTrees = forest_trees
	if outside and world.forest_active:
		area.layoutId = "pondside_forest_3d"
	if world.indoor == "arcana_inn":
		area.layoutId = InnTileLayout.LAYOUT_ID
	elif world.indoor == "arcana_restaurant":
		area.layoutId = RestaurantTileLayout.LAYOUT_ID
	if city:
		if plaza_v2:
			area.layoutId = "plaza_v2"
			area.circles = _collision_circles(world.round_obstacles)
		area.fishing = area_fishing
	if world.indoor == "arcana_academy":
		var authored := preload("res://scripts/region_layout.gd").load_region(world.indoor, world.academy_floor)
		var rooms := {}
		for entity in world.entities:
			if entity.kind == "academy_room":
				rooms[entity.id] = _point(entity.pos)
			elif entity.kind == "academy_stairs":
				area.stairs = _point(entity.pos)
		area.rooms = rooms
		area.stairArrival = _point(authored.markers.StairArrival)
	if world.indoor == "arcana_shop":
		area.floorDomain = {"origin":{"x":80,"y":64},"cellSize":8,"cells":world.shop_layout.floor.duplicate()}
	return area

func _rect(box: Rect2) -> Dictionary:
	return {"x": box.position.x, "y": box.position.y, "w": box.size.x, "h": box.size.y}

func _collision_circles(obstacles: Array) -> Array[Dictionary]:
	var circles: Array[Dictionary] = []
	for obstacle: Dictionary in obstacles:
		var inverse: Transform2D = obstacle.inverse
		circles.append({"localRadius": obstacle.radius,
			"inverse": [inverse.x.x, inverse.x.y, inverse.y.x, inverse.y.y, inverse.origin.x, inverse.origin.y]})
	return circles

func _home_furniture() -> Dictionary:
	var packed := RegionRegistry.scene("arcana_home", 1)
	if packed == null: return {}
	var home := packed.instantiate()
	var grid: Dictionary = home.get_meta("home_grid", {})
	var layout: Dictionary = home.collect_layout()
	var fixtures: Dictionary = home.collect_home_catalog()
	home.free()
	if grid.is_empty() or fixtures.is_empty() or not layout.has("fixed_rectangles"): return {}
	var rooms: PackedStringArray = grid.rooms
	var names := {"K":"kitchen", "B":"bedroom", "L":"living", "W":"bathroom"}
	var cells := {}
	for z in range(rooms.size()):
		for x in range(rooms[z].length()):
			cells["%d:%d" % [x, z]] = names.get(rooms[z][x], "")
	return {"gridVersion":grid.version, "origin":_point(grid.origin), "cellSize":grid.cell_size,
		"cells":cells, "reservedCells":Array(grid.reserved), "fixedRectangles":_rectangles(layout.fixed_rectangles),
		"edgeWalls":_rectangles(layout.edge_walls), "fixtures":fixtures}

func _rectangles(boxes: Array) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for box: Rect2 in boxes:
		result.append({"x":box.position.x, "y":box.position.y, "w":box.size.x, "h":box.size.y})
	return result

func _point(position: Vector2) -> Dictionary:
	return {"x": position.x, "y": position.y}
