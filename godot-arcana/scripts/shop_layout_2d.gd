@tool
extends RefCounted
const ORIGIN = Vector2(5,4)
const TILE_ORIGIN = Vector2i.ZERO
const CANVAS_ORIGIN = Vector2(320,256)
const STEP = .5
const UNIT = 16.0
const PPU = 64.0
const PITCH = 1.0
const ASSETS = "res://art/export/shop-2d/assets.json"
static func definitions() -> Dictionary:
	var value = JSON.parse_string(FileAccess.get_file_as_string(ASSETS))
	return value.assets if value is Dictionary else {}
static func collect(source: Node) -> Dictionary:
	var assets = definitions()
	var result: Dictionary = {"entries":[],"floor":{},"rectangles":[],"markers":{},"valid":true,"errors":[]}
	if source is Node2D and source.transform != Transform2D.IDENTITY: result.errors.append("Keep the Shop2D root transform at identity; move painted cells instead.")
	var counters = 0
	var doors = 0
	var placements: Array[Dictionary] = []
	for layer in source.get_children():
		if not layer is TileMapLayer: continue
		var expected = Transform2D.IDENTITY
		if layer is TileMapLayer: expected = Transform2D(Vector2(1,0),Vector2(0,PITCH),Vector2.ZERO)
		if not layer.transform.is_equal_approx(expected) or layer.tile_set == null or layer.tile_set.tile_size != Vector2i(32,32): result.errors.append("Keep all tile layers at their registered projected transform.")
		for cell in layer.get_used_cells():
			var tile = layer.get_cell_tile_data(cell)
			var id: String = ""
			if tile != null: id = str(tile.get_custom_data("asset"))
			else:
				var collection = layer.tile_set.get_source(layer.get_cell_source_id(cell)) as TileSetScenesCollectionSource
				if collection == null: continue
				var packed = collection.get_scene_tile_scene(layer.get_cell_alternative_tile(cell))
				id = scene_asset(packed)
			if not assets.has(id):
				result.errors.append("Unknown tile asset: "+id)
				continue
			placements.append({"id":id,"cell":cell-TILE_ORIGIN,"start":ORIGIN+Vector2(cell-TILE_ORIGIN)*STEP,"floor_layer":layer.name == "Floor"})
	var props = source.get_node_or_null("Furniture")
	if props != null and not props is TileMapLayer:
		for prop in props.get_children():
			if not prop is Node2D or not prop.has_method("placement_start"): continue
			var id: String = prop.asset_id
			if not assets.has(id):
				result.errors.append("Unknown furniture asset: "+id)
				continue
			var start: Vector2 = prop.placement_start()
			placements.append({"id":id,"start":start,"cell":Vector2i(((start-ORIGIN)/STEP).round()),"floor_layer":false})
	for placement in placements:
		var id: String = placement.id
		var cell: Vector2i = placement.cell
		var start: Vector2 = placement.start
		var spec: Dictionary = assets[id]
		if (spec.kind == "floor") != placement.floor_layer:
			result.errors.append("Paint floor tiles only on Floor, and props/walls on their own layers.")
			continue
		if spec.kind == "floor":
			result.floor["%d:%d" % [cell.x,cell.y]] = true
			continue
		result.entries.append({"id":id,"spec":spec,"start":start,"cell":cell})
		for box in spec.get("collisions",[]):
			result.rectangles.append(Rect2((start+Vector2(box[0],box[1]))*UNIT,Vector2(box[2],box[3])*UNIT))
		if spec.has("interaction"):
			counters += 1
			var interaction: Dictionary = spec.interaction
			result.markers.merchant = (start+Vector2(interaction.offset[0],interaction.offset[1]))*UNIT
			var actor: Dictionary = spec.actor
			var at = start+Vector2(actor.offset[0],actor.offset[1])
			result.markers.actor = at*UNIT
			var sz = Vector2(actor.footprint[0],actor.footprint[1])
			result.rectangles.append(Rect2((at-Vector2(sz.x*.5,sz.y))*UNIT,sz*UNIT))
		if spec.kind == "door":
			doors += 1
			result.markers.arrival = (start+Vector2(spec.arrivalOffset[0],spec.arrivalOffset[1]))*UNIT
			result.markers.exit = (start+Vector2(spec.exitOffset[0],spec.exitOffset[1]))*UNIT
	if counters != 1: result.errors.append("Place exactly one counter; its merchant and interaction point follow it.")
	if doors != 1: result.errors.append("Place exactly one doorway.")
	if result.floor.is_empty(): result.errors.append("Paint walkable floor cells.")
	var furniture: Array[Rect2] = []
	for entry in result.entries:
		if entry.spec.kind != "furniture": continue
		var spec: Dictionary = entry.spec
		var box = Rect2(entry.start*UNIT,Vector2(spec.footprint[0],spec.footprint[1])*UNIT)
		for previous in furniture:
			if box.intersects(previous): result.errors.append("Furniture footprints overlap; separate their occupied cells.")
		furniture.append(box)
		for wall in result.entries:
			if wall.spec.kind != "wall": continue
			for collision in wall.spec.get("collisions",[]):
				var boundary = Rect2((wall.start+Vector2(collision[0],collision[1]))*UNIT,Vector2(collision[2],collision[3])*UNIT)
				if box.intersects(boundary): result.errors.append("A furniture footprint intersects a wall.")
		var first = Vector2i(((entry.start-ORIGIN)/STEP).round())
		for y in range(roundi(float(spec.footprint[1])/STEP)):
			for x in range(roundi(float(spec.footprint[0])/STEP)):
				if not result.floor.has("%d:%d" % [first.x+x,first.y+y]): result.errors.append("Paint floor under the complete furniture footprint.")
	for id in ["arrival","exit","merchant"]:
		if result.markers.has(id) and not can_stand(result,result.markers[id]): result.errors.append("Keep "+id+" walkable.")
	result.valid = result.errors.is_empty()
	return result
static func load_layout() -> Dictionary:
	var packed = ResourceLoader.load("res://scenes/shop_2d.tscn","PackedScene",ResourceLoader.CACHE_MODE_REPLACE) as PackedScene
	if packed == null: return {}
	var source = packed.instantiate()
	var result = collect(source)
	source.free()
	return result
static func floor_contains(layout: Dictionary, point: Vector2, margin: float = 3.0) -> bool:
	if not layout.has("floor"): return false
	for corner in [Vector2(-margin,-margin),Vector2(margin,-margin),Vector2(margin,margin),Vector2(-margin,margin)]:
		var local = ((point+corner-corner.normalized()*.001)/UNIT-ORIGIN)/STEP
		var key = "%d:%d" % [floori(local.x),floori(local.y)]
		if not layout.floor.has(key): return false
	return true
static func can_stand(layout: Dictionary, point: Vector2) -> bool:
	if not floor_contains(layout,point): return false
	for box in layout.get("rectangles",[]):
		# Match the server's inclusive three-coordinate clearance.
		if point.x >= box.position.x-3 and point.x <= box.end.x+3 and point.y >= box.position.y-3 and point.y <= box.end.y+3: return false
	return true
static func canvas(point: Vector2, height: float = 0.0) -> Vector2:
	return Vector2(point.x*PPU/UNIT,point.y*PPU/UNIT*PITCH-height*PPU*PITCH) - CANVAS_ORIGIN

static func scene_asset(packed: PackedScene) -> String:
	if packed == null: return ""
	var state = packed.get_state()
	for index in state.get_node_property_count(0):
		if state.get_node_property_name(0,index) == "asset_id": return str(state.get_node_property_value(0,index))
	return ""
