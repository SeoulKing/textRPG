extends SceneTree
const Data = preload("res://scripts/shop_layout_2d.gd")
var checks: Array[String] = []
func require(value: bool, label: String) -> void:
	if not value:
		push_error("SHOP_2D_CHECK "+label)
		quit(1)
		assert(value,label)
	checks.append(label)
func _initialize() -> void: call_deferred("run")
func run() -> void:
	var packed = load("res://scenes/shop_2d.tscn") as PackedScene
	require(packed != null,"native scene exists")
	var scene = packed.instantiate()
	require(scene is Node2D,"scene is native Node2D")
	require(scene.find_children("*","Node3D",true,false).is_empty(),"shop has no 3D nodes")
	var layout = Data.collect(scene)
	require(layout.valid,"one counter, one doorway, floor")
	require(layout.floor.size() == 504,"14x9 half-unit floor cells")
	for id in ["arrival","exit","merchant"]:
		require(Data.can_stand(layout,layout.markers[id]),"walkable "+id)
	var floor_layer = scene.get_node("Floor") as TileMapLayer
	var floor_cell = Vector2i(14,12)
	var floor_source = floor_layer.get_cell_source_id(floor_cell)
	floor_layer.erase_cell(floor_cell)
	require(not Data.floor_contains(Data.collect(scene),(Data.ORIGIN+(Vector2(floor_cell)+Vector2(.5,.5))*.5)*16),"erasing floor removes walkable domain")
	floor_layer.set_cell(floor_cell,floor_source,Vector2i.ZERO)
	var furniture = scene.get_node("Furniture") as TileMapLayer
	var counter_cell = Vector2i(10,6)
	var counter_source = furniture.get_cell_source_id(counter_cell)
	furniture.erase_cell(counter_cell)
	furniture.set_cell(counter_cell+Vector2i(2,0),counter_source,Vector2i.ZERO)
	var shifted = Data.collect(scene)
	require(shifted.markers.merchant-layout.markers.merchant == Vector2(16,0),"counter move updates trade point")
	require(shifted.markers.actor-layout.markers.actor == Vector2(16,0),"counter move updates merchant")
	furniture.erase_cell(counter_cell+Vector2i(2,0))
	furniture.set_cell(counter_cell,counter_source,Vector2i.ZERO)
	require(Data.canvas(Vector2(16,0)) == Vector2(64,0),"horizontal axis remains horizontal")
	require(is_equal_approx(Data.canvas(Vector2(0,16)).y,64.0/sqrt(2.0)),"45-degree depth projection")
	var meta = Data.definitions()
	var geometry: Array = []
	for id in meta:
		var spec: Dictionary = meta[id]
		if not spec.has("geometry"): continue
		var g: Dictionary = spec.geometry
		require(int(g.roofDepthPixels)==roundi(float(spec.footprint[1])*64.0/sqrt(2.0)),"roof depth "+id)
		require(int(g.frontHeightPixels)==roundi(float(spec.height)*64.0/sqrt(2.0)),"front height "+id)
		var image = (load(spec.file) as Texture2D).get_image()
		require(image.get_size()==Vector2i(spec.size[0],spec.size[1]),"native canvas "+id)
		for y in range(int(g.roofBackY),int(g.baseline)):
			require(image.get_pixel(0,y).a>.99 and image.get_pixel(image.get_width()-1,y).a>.99,"vertical edges "+id+" "+str(y))
		geometry.append({"asset":id,"footprint":spec.footprint,"height":spec.height,"roofDepthPixels":g.roofDepthPixels,"frontHeightPixels":g.frontHeightPixels})
	for side in ["left","right"]:
		var spec: Dictionary = meta["wall-"+side+"-return"]
		var image = (load(spec.file) as Texture2D).get_image()
		var x = 8 if side == "left" else 24
		for y in range(169): require(image.get_pixel(x,y).a>.99,"unbroken "+side+" return "+str(y))
		var rear = Data.canvas(Vector2(5,4.25)*16).y-169
		var side_top = Data.canvas(Vector2(5,4.25)*16).y-float(spec.foot[1])
		require(is_equal_approx(rear,side_top),"rear-to-side upper corner "+side)
	# Use the actual existing navigation lattice, with the same clearance as online movement.
	var cells: Dictionary = {}
	for y in range(21):
		for x in range(24):
			if Data.can_stand(layout,Vector2(x*16+8,y*16+8)): cells[Vector2i(x,y)]=true
	var targets: Dictionary = {}
	for id in ["arrival","exit","merchant"]:
		var best = Vector2i.ZERO
		var dist = INF
		for cell in cells:
			var point = Vector2(cell)*16+Vector2(8,8)
			var d = point.distance_squared_to(layout.markers[id])
			if d<dist: dist=d;best=cell
		targets[id]=best
	var pending: Array = [targets.arrival]
	var visited: Dictionary = {targets.arrival:true}
	for item in pending:
		for direction in [Vector2i.LEFT,Vector2i.RIGHT,Vector2i.UP,Vector2i.DOWN]:
			var next: Vector2i = item+direction
			if cells.has(next) and not visited.has(next): visited[next]=true;pending.append(next)
	require(visited.has(targets.exit),"arrival-to-exit navigation")
	require(visited.has(targets.merchant),"arrival-to-counter navigation")
	var report = {"passed":true,"checks":checks.size(),"geometry":geometry,"floorCells":layout.floor.size(),"walkableNodes":cells.size(),"connectedNodes":visited.size(),"markers":{}}
	for key in layout.markers: report.markers[key]=[layout.markers[key].x,layout.markers[key].y]
	var file = FileAccess.open(OS.get_environment("ARCANA_SHOP_EVIDENCE").path_join("geometry-and-layout-check.json"),FileAccess.WRITE)
	file.store_string(JSON.stringify(report,"  "));file.close()
	scene.free()
	print("SHOP_2D_CHECK passed ",checks.size()," geometry, edge, mutation and navigation checks")
	quit()
