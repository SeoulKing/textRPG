extends SceneTree
func _initialize() -> void:call_deferred("export_layout")

func export_layout() -> void:
	# Use the same logical geometry as player movement and the online exporter.
	var world = load("res://scripts/world.gd").new()
	root.add_child(world)
	world.set_process(false)
	var home: Vector2 = world.layout.combat_home()
	var spawn: Vector2 = world.spawn_position
	var rectangles: Array[Dictionary] = []
	for box: Rect2 in world.obstacles:
		rectangles.append(_box(box))
	var circles: Array[Dictionary] = []
	for obstacle: Dictionary in world.round_obstacles:
		var inverse: Transform2D = obstacle.inverse
		var forward := inverse.affine_inverse()
		var center := forward.origin
		circles.append({"x": center.x, "y": center.y,
			"radius": obstacle.radius * maxf(forward.x.length(), forward.y.length()),
			"localRadius": obstacle.radius,
			"inverse": [inverse.x.x, inverse.x.y, inverse.y.x, inverse.y.y, inverse.origin.x, inverse.origin.y]})
	var data := {"encounterId": "plaza_slime", "home": _point(home), "spawn": _point(spawn),
		"rectangles": rectangles, "circles": circles, "bounds": _box(world.outside_walk_bounds()),
		"tuning": {"tile": 16, "range": 96, "projectileSpeed": 128, "projectileRadius": 2.4,
			"enemyRadius": 7.2, "playerRadius": 4.8, "chaseLimit": 160, "chaseSpeed": 32,
			"returnSpeed": 64, "jumpRange": 48, "jumpDuration": .72, "attackInterval": 6}}
	var output := OS.get_environment("ARCANA_COMBAT_LAYOUT_OUTPUT")
	if output.is_empty():
		output = "res://art/export/combat-layout.json"
	var file := FileAccess.open(output, FileAccess.WRITE)
	if file == null:
		push_error("Cannot write plaza V2 combat layout")
		quit(1)
		return
	file.store_string(JSON.stringify(data, "  "))
	file.close()
	print("Exported combat layout from plaza V2: ", home)
	var layout: Node = world.layout
	world.queue_free()
	if is_instance_valid(layout) and layout.get_parent() == null:
		layout.queue_free()
	await process_frame
	await process_frame
	quit()

func _point(point: Vector2) -> Dictionary:
	return {"x": point.x, "y": point.y}

func _box(box: Rect2) -> Dictionary:
	return {"x": box.position.x, "y": box.position.y, "w": box.size.x, "h": box.size.y}
