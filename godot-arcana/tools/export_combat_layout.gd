extends SceneTree

func _initialize() -> void:
	var scene = load("res://scenes/plaza.tscn").instantiate()
	scene.normalize_coordinate_frame()
	scene.refresh_plan()
	var rectangles: Array = []
	# Preserve the outdoor movement restrictions already used by world.gd.
	rectangles.append({"x":930,"y":840,"w":222,"h":360})
	for rect in scene.wall_collision_rects():
		rectangles.append({"x":rect.position.x,"y":rect.position.y,"w":rect.size.x,"h":rect.size.y})
	var circles: Array = []
	var spawn = Vector2(576,500)
	for entry in scene.placements():
		if entry.gameplay_id == "player_spawn": spawn = entry.map_position(scene)
		for rect in entry.map_collision_parts(scene):
			rectangles.append({"x":rect.position.x,"y":rect.position.y,"w":rect.size.x,"h":rect.size.y})
		var circle = entry.map_round_collision(scene)
		if not circle.is_empty():
			var inverse: Transform2D = circle.inverse
			var forward = inverse.affine_inverse()
			circles.append({"x":forward.origin.x,"y":forward.origin.y,"radius":circle.radius*maxf(forward.x.length(),forward.y.length()),"localRadius":circle.radius,"inverse":[inverse.x.x,inverse.x.y,inverse.y.x,inverse.y.y,inverse.origin.x,inverse.origin.y]})
	var monster: Node3D
	for node in scene.find_children("*","Node3D",true,false):
		if node.get_meta("encounter_id","") == "plaza_slime": monster = node
	if monster == null:
		push_error("Missing plaza_slime encounter anchor")
		quit(1)
		return
	var at = monster.position
	var ancestor = monster.get_parent()
	while ancestor != scene and ancestor != null:
		if ancestor is Node3D: at = ancestor.transform*at
		ancestor = ancestor.get_parent()
	var data = {"encounterId":"plaza_slime","home":{"x":at.x*16.0,"y":at.z*16.0},"spawn":{"x":spawn.x,"y":spawn.y},"rectangles":rectangles,"circles":circles,"bounds":{"x":32,"y":48,"w":1078,"h":1352},"tuning":{"tile":16,"range":96,"projectileSpeed":128,"projectileRadius":2.4,"enemyRadius":7.2,"playerRadius":4.8,"chaseLimit":160,"chaseSpeed":32,"returnSpeed":64,"jumpRange":48,"jumpDuration":0.72,"attackInterval":6}}
	var file = FileAccess.open("res://art/export/combat-layout.json",FileAccess.WRITE)
	file.store_string(JSON.stringify(data,"  "))
	file.close()
	print("Exported combat layout from plaza scene: ",data.home)
	scene.free()
	quit()
