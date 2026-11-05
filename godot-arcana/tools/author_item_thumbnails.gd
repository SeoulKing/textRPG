extends SceneTree
## Approved icon silhouettes -> 64px indexed PixelPen sources; preserve edited sources.
const BASE = "res://art/source/items/inventory-v1/"
const OUT = "res://art/export/items/"
const IDS = ["river-fish", "grilled-fish", "wood"]
const PALETTES = [
	["#171d2c","#273346","#354b5a","#486472","#60808b","#83a5a8","#afc9c6","#d8e1d5","#fff5df","#9b7435","#d5a34d","#edce7e","#565572","#888398","#bac0ce"],
	["#281923","#48262a","#693128","#8a4529","#ae5b28","#cf7b2a","#e79d35","#f6bd52","#ffda87","#fff0bf","#a6794b","#c09c6c","#e0c698"],
	["#271e29","#422c31","#5d3933","#794735","#96593c","#b07247","#cd9257","#e5b773","#f4d79b","#805c3d","#ad8150","#d1a363","#bc7e4f"]
]
func _initialize() -> void: call_deferred("author")

func nearest(c: Color, palette: PackedColorArray) -> int:
	var best: int = 1
	var distance: float = INF
	for index in range(1,palette.size()):
		var p: Color = palette[index]
		var d: float = (c.r-p.r)*(c.r-p.r)*0.3+(c.g-p.g)*(c.g-p.g)*0.5+(c.b-p.b)*(c.b-p.b)*0.2
		if d < distance:
			distance = d
			best = index
	return best

func transcribe(reference: Image, zone: Rect2i, palette: PackedColorArray) -> Array:
	var lo: Vector2i = zone.end
	var hi: Vector2i = zone.position
	for y in range(zone.position.y,zone.end.y):
		for x in range(zone.position.x,zone.end.x):
			if reference.get_pixel(x,y).a >= 0.5:
				lo = lo.min(Vector2i(x,y))
				hi = hi.max(Vector2i(x,y))
	var bounds: Rect2i = Rect2i(lo,hi-lo+Vector2i.ONE)
	var factor: float = 48.0/float(maxi(bounds.size.x,bounds.size.y))
	var extent: Vector2i = Vector2i(roundi(bounds.size.x*factor),roundi(bounds.size.y*factor))
	var origin: Vector2i = (Vector2i(64,64)-extent)/2
	var rows: Array = []
	for y in range(64):
		var row: Array = []
		for x in range(64):
			var index: int = 0
			var cell: Vector2i = Vector2i(x,y)-origin
			if cell.x >= 0 and cell.y >= 0 and cell.x < extent.x and cell.y < extent.y:
				var votes: Array = []
				votes.resize(palette.size())
				votes.fill(0)
				for sy in range(5):
					for sx in range(5):
						var point: Vector2i = Vector2i(Vector2(bounds.position)+Vector2((cell.x+(sx+0.5)/5.0)*bounds.size.x/extent.x,(cell.y+(sy+0.5)/5.0)*bounds.size.y/extent.y))
						var color: Color = reference.get_pixel(point.x,point.y)
						votes[nearest(color,palette) if color.a >= 0.5 else 0] += 1
				if 25-int(votes[0]) >= 13:
					index = 1
					for candidate in range(2,palette.size()):
						if votes[candidate] > votes[index]: index = candidate
			row.append(index)
		rows.append(row)
	# Remove isolated specks and group the contour into readable source-pixel steps.
	var clean: Array = rows.duplicate(true)
	for y in range(8,56):
		for x in range(8,56):
			if int(rows[y][x]) == 0: continue
			var neighbours: int = 0
			for direction in [Vector2i.LEFT,Vector2i.RIGHT,Vector2i.UP,Vector2i.DOWN]:
				if int(rows[y+direction.y][x+direction.x]) > 0: neighbours += 1
			if neighbours == 0: clean[y][x] = 0
	return clean

func author() -> void:
	DirAccess.make_dir_recursive_absolute(BASE)
	DirAccess.make_dir_recursive_absolute(OUT)
	var reference: Image = Image.load_from_file(ProjectSettings.globalize_path("res://").path_join("../art-studies/item-thumbnails-v1/concept-v1.png"))
	if reference == null: push_error("Approved item concept missing"); quit(1); return
	var preview: Image = Image.create(576,304,false,Image.FORMAT_RGBA8)
	preview.fill(Color("fffaf0"))
	for y in range(224,304):
		for x in range(576): preview.set_pixel(x,y,Color("26364d"))
	for item_index in range(IDS.size()):
		var id: String = IDS[item_index]
		var project_path: String = BASE+id+".pxpen"
		var project: PixelPenProject
		if FileAccess.file_exists(project_path):
			project = ProjectPacker.load_project(project_path)
		else:
			var palette: PackedColorArray = PackedColorArray([Color.TRANSPARENT])
			for hex in PALETTES[item_index]: palette.append(Color(hex))
			var zone_width: int = reference.get_width()/3
			var rows: Array = transcribe(reference,Rect2i(item_index*zone_width,0,zone_width,reference.get_height()),palette)
			project = PixelPenProject.new()
			project.initialized(Vector2i(64,64),id+" - approved inventory thumbnail")
			PixelPen.state.current_project = project
			project.palette.color_index = palette
			var layer: IndexedColorImage = project.active_frame.layers[0]
			layer.label = "Indexed silhouette, material shading and readable details"
			for y in range(64):
				for x in range(64):
					if int(rows[y][x]) > 0: layer.set_index_on_color_map(x,y,int(rows[y][x]))
			project.file_path = project_path
			if ProjectPacker.save(project,project_path) != OK: push_error("PixelPen save failed: "+id); quit(1); return
		# Reopen native sources before exporting. Reruns preserve manual pixel edits.
		project = ProjectPacker.load_project(project_path)
		if project == null or project.canvas_size != Vector2i(64,64): push_error("Invalid item source: "+id); quit(1); return
		PixelPen.state.current_project = project
		var image: Image = project.get_image(project.animation_timeline[0].frame)
		image.convert(Image.FORMAT_RGBA8)
		if image.save_png(OUT+id+".png") != OK: push_error("Item export failed"); quit(1); return
		var palette_hex: Array = []
		for color in project.palette.color_index: palette_hex.append(color.to_html(true))
		var pixel_rows: Array = []
		for y in range(64):
			var row: Array = []
			for x in range(64):
				var color: Color = image.get_pixel(x,y)
				if color.a > 0.0 and (x < 8 or x >= 56 or y < 8 or y >= 56): push_error("Icon margin violated: "+id); quit(1); return
				if color.a != 0.0 and color.a != 1.0: push_error("Nonbinary icon alpha: "+id); quit(1); return
				row.append(color.to_html(true))
			pixel_rows.append(row)
		var file: FileAccess = FileAccess.open(BASE+id+".json",FileAccess.WRITE)
		file.store_string(JSON.stringify({"canvas":[64,64],"margin":8,"palette":palette_hex,"rows":pixel_rows,"pixelpen_source":project_path,"approved_concept":"art-studies/item-thumbnails-v1/concept-v1.png","native_reopened":true,"method":"5x5 cell votes, limited material palette and isolated-pixel contour cleanup in native PixelPen"},"  "))
		file.close()
		for size in [192,64,40]:
			var copy: Image = image.duplicate()
			copy.resize(size,size,Image.INTERPOLATE_NEAREST)
			var origin: Vector2i = Vector2i(item_index*192,0) if size == 192 else Vector2i(item_index*192+(12 if size == 64 else 110),232)
			preview.blend_rect(copy,Rect2i(0,0,size,size),origin)
		print("PIXELPEN_ITEM_EXPORTED ",id," 64x64; saved/reopened; binary alpha; 8px margin")
	preview.save_png(BASE+"preview.png")
	PixelPen.state.current_project = null
	PixelPen.state.free()
	PixelPen.state = null
	quit()
