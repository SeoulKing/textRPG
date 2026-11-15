extends SceneTree
## Reference transcription into native PixelPen layers. No runtime/motion changes.
const DEST := "res://art/characters/hybrid-v1/heads"
const SIZE := Vector2i(48,48)
const DIRS := ["s","se","e","ne","n","nw","w","sw"]
const REFERENCE_ORDER := ["nw","n","ne","w","sw","s","se","e"]
const COLORS := ["00000000","352d40","65536f","8e7999","af98bb","c9b4d1","dfcce2","eedfed","fff9f4","c58481","e9ad9b","ffd8bd","ffe8d4","fff4e3","47354e","3f365f","655b9d","8c80bf","b7b2e1","fff8f5","eab0b0","c37e8b"]
var palette := PackedColorArray()
var drafts: Dictionary = {}
var metadata: Dictionary = {}
var reports: Dictionary = {}

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	var exporting := OS.get_cmdline_user_args().has("--export")
	var retracing := OS.get_cmdline_user_args().has("--retrace-own-draft")
	if not exporting and not OS.get_cmdline_user_args().has("--author"):
		fail("Use --author for a NEW source set or --export for saved sources."); return
	for hex: String in COLORS: palette.append(Color(hex))
	if not exporting:
		var previous: Variant = JSON.parse_string(FileAccess.get_file_as_string(DEST+"/manifest.json")) if retracing else null
		for direction: String in DIRS:
			if FileAccess.file_exists(DEST+"/"+direction+"/head.pxpen"):
				if not retracing or not previous is Dictionary or FileAccess.get_sha256(DEST+"/"+direction+"/head.pxpen")!=previous.directions[direction].source_sha256:
					fail("Refusing to overwrite existing or manually changed PixelPen source: "+direction); return
		var reference := Image.load_from_file(DEST+"/reference.png")
		if reference == null:
			fail("Missing reference.png"); return
		reference.convert(Image.FORMAT_RGBA8)
		var cell := Vector2i(reference.get_width()/4,reference.get_height()/2)
		for i in REFERENCE_ORDER.size():
			var rect := source_bounds(reference,Rect2i(Vector2i(i%4,i/4)*cell,cell))
			metadata[REFERENCE_ORDER[i]] = {"source_rect":[rect.position.x,rect.position.y,rect.size.x,rect.size.y]}
			# Same scale in every view. Align the crown, center the shared skull axis.
			var data := transcribe(reference,rect)
			drafts[REFERENCE_ORDER[i]] = data
		for direction: String in DIRS:
			var doc := new_document(direction)
			var layers := split_layers(drafts[direction],direction)
			for label: String in ["hair_visible","face_visible","silhouette"]:
				var uid := doc.add_layer(label)
				var layer := doc.get_index_image(uid)
				var pixels: PackedByteArray = layers[label]
				for p in pixels.size():
					if pixels[p] != 0: layer.set_index_on_color_map(p%SIZE.x,p/SIZE.x,pixels[p])
				doc.active_layer_uid = uid
				doc.pool_frames[0].layer_active_uid = uid
			DirAccess.make_dir_recursive_absolute(DEST+"/"+direction)
			if ProjectPacker.save(doc,DEST+"/"+direction+"/head.pxpen") != OK:
				fail("PixelPen save failed: "+direction); return
			metadata[direction]["authored_fingerprint"] = fingerprint(doc)
	else:
		var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(DEST+"/manifest.json"))
		if not parsed is Dictionary:
			fail("Export requires existing manifest."); return
		metadata = parsed.directions
	# Preflight the common palette for ALL saved originals before replacing any
	# exported image. A direction-specific palette would break part consistency.
	for direction: String in DIRS:
		var doc: PixelPenProject = ProjectPacker.load_project(DEST+"/"+direction+"/head.pxpen")
		if doc==null or doc.canvas_size!=SIZE or doc.palette.color_index!=palette:
			fail("Expected 48x48 and the fixed shared palette in saved source: "+direction);return
	for direction: String in DIRS:
		if not export_direction(direction): return
	write_manifest()
	make_reviews()
	print("HEAD_PARTS_NATIVE_OK directions=8 canvas=48x48 roundtrip=true")
	quit(0)

func new_document(direction: String) -> PixelPenProject:
	var doc := PixelPenProject.new()
	doc.compatibility_version = PixelPenProject.COMPATIBILITY_NUMBER
	doc.project_name = "기준 단발 머리 · "+direction.to_upper()
	doc.file_path = DEST+"/"+direction+"/head.pxpen"
	doc.canvas_size = SIZE
	doc.symetric_guid = Vector2(SIZE)*0.5
	doc.palette = IndexedPalette.new()
	doc.palette.color_index = palette
	doc.palette.grid_sync_to_palette()
	var frame := Frame.create(doc.get_uid())
	doc.pool_frames.append(frame)
	doc.canvas_pool_frame_uid = frame.frame_uid
	var cell := AnimationCell.create(doc.get_uid())
	cell.frame = frame
	doc.animation_timeline.append(cell)
	doc.animation_frame_index = 0
	doc.animation_fps = 8.0
	return doc

func source_pixel(c: Color) -> bool:
	if c.a < 0.5 or maxf(c.r,maxf(c.g,c.b)) < 0.06: return false
	# The pasted sheet has magenta selection marks and red edge contamination.
	if c.r > 0.6 and c.b > 0.55 and c.g < 0.35: return false
	if c.r > 0.7 and c.g < 0.3 and c.b < 0.35: return false
	return true

func source_bounds(image: Image,cell: Rect2i) -> Rect2i:
	var lo := cell.end
	var hi := cell.position
	for y in range(cell.position.y,cell.end.y):
		for x in range(cell.position.x,cell.end.x):
			if source_pixel(image.get_pixel(x,y)):
				lo = lo.min(Vector2i(x,y)); hi = hi.max(Vector2i(x,y))
	return Rect2i(lo,hi-lo+Vector2i.ONE)

func transcribe(image: Image,rect: Rect2i) -> PackedByteArray:
	var result := PackedByteArray()
	result.resize(SIZE.x*SIZE.y)
	# User sheet heads are consistently about 264 source pixels tall.
	# Shared scale, never stretch each direction independently to equal width.
	var scale_value := 42.0/264.0
	var origin := Vector2(24.0-float(rect.size.x)*scale_value*0.5,3.0)
	for y in SIZE.y:
		for x in SIZE.x:
			var p := (Vector2(x+0.5,y+0.5)-origin)/scale_value+Vector2(rect.position)
			var votes := 0
			var samples: Array[Color] = []
			for sy in [-1.6,0.0,1.6]:
				for sx in [-1.6,0.0,1.6]:
					var at := Vector2i(roundi(p.x+sx),roundi(p.y+sy))
					if not rect.has_point(at): continue
					var c := image.get_pixelv(at)
					if source_pixel(c): votes+=1; samples.append(c)
			if votes < 5: continue
			# Representative existing color, no blur or generated intermediate ramp.
			samples.sort_custom(func(a: Color,b: Color)->bool:return a.get_luminance()<b.get_luminance())
			result[y*SIZE.x+x] = nearest_color(samples[samples.size()/2])
	# Remove disconnected edge fragments, retaining the main connected head.
	# Reference black is both background and real eyelash/pupil ink. Only exterior
	# empty regions are background; enclosed black regions must remain opaque ink.
	fill_enclosed_ink(result)
	retain_main_component(result)
	return result

func fill_enclosed_ink(data: PackedByteArray) -> void:
	var outside := {}
	var queue: Array[int] = []
	for y in SIZE.y:
		for x in SIZE.x:
			if (x==0 or y==0 or x==SIZE.x-1 or y==SIZE.y-1) and data[y*SIZE.x+x]==0:
				queue.append(y*SIZE.x+x);outside[y*SIZE.x+x]=true
	var cursor := 0
	while cursor<queue.size():
		var at: int=queue[cursor];cursor+=1
		for offset: Vector2i in [Vector2i.LEFT,Vector2i.RIGHT,Vector2i.UP,Vector2i.DOWN]:
			var p := Vector2i(at%SIZE.x,at/SIZE.x)+offset
			if p.x<0 or p.y<0 or p.x>=SIZE.x or p.y>=SIZE.y:continue
			var next := p.y*SIZE.x+p.x
			if data[next]==0 and not outside.has(next):outside[next]=true;queue.append(next)
	for i in data.size():
		if data[i]==0 and not outside.has(i):data[i]=14

func nearest_color(c: Color) -> int:
	var best := 1
	var distance := INF
	for i in range(1,palette.size()):
		var target := palette[i]
		var d := 0.9*pow(c.r-target.r,2)+1.2*pow(c.g-target.g,2)+pow(c.b-target.b,2)
		if d < distance: distance=d; best=i
	return best

func retain_main_component(data: PackedByteArray) -> void:
	var seen := {}
	var largest: Array[int] = []
	for i in data.size():
		if data[i]==0 or seen.has(i): continue
		var queue: Array[int] = [i]
		var cursor := 0
		seen[i]=true
		while cursor<queue.size():
			var at: int = queue[cursor]; cursor+=1
			for offset: Vector2i in [Vector2i.LEFT,Vector2i.RIGHT,Vector2i.UP,Vector2i.DOWN]:
				var p := Vector2i(at%SIZE.x,at/SIZE.x)+offset
				if p.x<0 or p.y<0 or p.x>=SIZE.x or p.y>=SIZE.y:continue
				var next := p.y*SIZE.x+p.x
				if data[next]!=0 and not seen.has(next): seen[next]=true; queue.append(next)
		if queue.size()>largest.size():largest=queue
	var kept := {}
	for i in largest:kept[i]=true
	for i in data.size():
		if not kept.has(i): data[i]=0

func split_layers(data: PackedByteArray,direction: String) -> Dictionary:
	var result := {}
	for label: String in ["hair_visible","face_visible","silhouette"]:
		var bytes := PackedByteArray(); bytes.resize(data.size()); result[label]=bytes
	for i in data.size():
		if data[i]==0:continue
		var x := i%SIZE.x
		var y := i/SIZE.x
		var edge := false
		for offset: Vector2i in [Vector2i.LEFT,Vector2i.RIGHT,Vector2i.UP,Vector2i.DOWN]:
			var p := Vector2i(x,y)+offset
			if p.x<0 or p.y<0 or p.x>=SIZE.x or p.y>=SIZE.y or data[p.y*SIZE.x+p.x]==0: edge=true
		if edge:
			result.silhouette[i]=1;continue
		var face := y>=18 and data[i] in [9,10,11,12,13,20,21]
		# Shared white/deep purple are used by hair AND eyes. Classify by the
		# visible skin region, never put rear crown highlights in the face layer.
		if data[i] in [1,2,3,8,14,15,16,17,18,19] and y>=18:
			for yy in range(maxi(0,y-3),mini(SIZE.y,y+4)):
				for xx in range(maxi(0,x-3),mini(SIZE.x,x+4)):
					if data[yy*SIZE.x+xx] in [9,10,11,12,20,21]:face=true
		if direction=="n":face=false
		result["face_visible" if face else "hair_visible"][i]=data[i]
	return result

func export_direction(direction: String) -> bool:
	var folder := DEST+"/"+direction
	var path := folder+"/head.pxpen"
	var doc: PixelPenProject = ProjectPacker.load_project(path)
	if doc==null or doc.canvas_size!=SIZE:
		fail("Native reopen failed: "+direction);return false
	var signature := fingerprint(doc)
	if metadata[direction].has("authored_fingerprint") and metadata[direction].authored_fingerprint!=signature:
		# Manual saved edits are accepted on --export, first author roundtrip is strict.
		if not OS.get_cmdline_user_args().has("--export"):
			fail("Native roundtrip changed pixels: "+direction);return false
	var image := doc.get_image(doc.pool_frames[0])
	image.convert(Image.FORMAT_RGBA8)
	if image.save_png(folder+"/head.png")!=OK:
		fail("PNG export failed: "+direction);return false
	var reopened := Image.load_from_file(folder+"/head.png")
	reopened.convert(Image.FORMAT_RGBA8)
	if image.get_data()!=reopened.get_data():fail("PNG roundtrip differs: "+direction);return false
	var layers := {}
	for layer: IndexedColorImage in doc.pool_frames[0].layers:
		var png: Image = PixelPenCPP.get_image(doc.palette.color_index,layer.colormap,false)
		png.convert(Image.FORMAT_RGBA8)
		var layer_path := folder+"/"+layer.label+".png"
		png.save_png(layer_path)
		layers[layer.label] = {"path":layer_path,"sha256":FileAccess.get_sha256(layer_path)}
	var colors := {}
	var alpha_values := {}
	for y in SIZE.y:
		for x in SIZE.x:
			var c := image.get_pixel(x,y)
			alpha_values[str(roundi(c.a*255))]=true
			if c.a>0.0:colors[c.to_html(true)]=true
	metadata[direction].merge({"png":folder+"/head.png","native_source":path,"source_sha256":FileAccess.get_sha256(path),"output_sha256":FileAccess.get_sha256(folder+"/head.png"),"native_fingerprint":signature,"native_reopened_matches":true,"png_roundtrip_matches":true,"pivot":[24,44],"opaque_bounds":rect_array(image.get_used_rect()),"actual_opaque_colors":colors.size(),"alpha_values":alpha_values.keys(),"layers":layers},true)
	reports[direction]=image
	return true

func fingerprint(doc: PixelPenProject) -> String:
	var context := HashingContext.new();context.start(HashingContext.HASH_SHA256)
	for c: Color in doc.palette.color_index:context.update(c.to_html(true).to_utf8_buffer())
	for frame: Frame in doc.pool_frames:
		for layer: IndexedColorImage in frame.layers:
			context.update(layer.label.to_utf8_buffer());context.update(layer.colormap.get_data())
	return context.finish().hex_encode()

func write_manifest() -> void:
	var actual := {}
	for image: Image in reports.values():
		for y in SIZE.y:
			for x in SIZE.x:
				var c := image.get_pixel(x,y)
				if c.a>0:actual[c.to_html(true)]=true
	var manifest := {"schema_version":1,"part":"head","reference":"reference.png","reference_sha256":FileAccess.get_sha256(DEST+"/reference.png"),"canvas_size":[48,48],"character_target_canvas":[96,136],"character_proportion_heads":3,"direction_order":DIRS,"sheet_order":REFERENCE_ORDER,"pivot_semantics":"shared neck connection; crown aligned at y3, pivot at [24,44]","outline_owner":"head silhouette layer, baked once; disable additional outline when displaying head.png","layers_semantics":"Visible regions only. Hidden scalp/face are not invented. Keep the three layers together for the complete head.","palette_rgba":COLORS,"registered_opaque_colors":COLORS.size()-1,"transparent_slots":1,"actual_used_opaque_colors":actual.size(),"runtime_connected":false,"visual_approval":"pending","directions":metadata}
	var file := FileAccess.open(DEST+"/manifest.json",FileAccess.WRITE)
	file.store_string(JSON.stringify(manifest,"\t"))

func make_reviews() -> void:
	var sheet := Image.create(48*4,48*2,false,Image.FORMAT_RGBA8)
	sheet.fill(Color.TRANSPARENT)
	var dark := Image.create(48*4,56*2,false,Image.FORMAT_RGBA8);dark.fill(Color("283341"))
	var light := Image.create(48*4,56*2,false,Image.FORMAT_RGBA8);light.fill(Color("e4dedd"))
	for i in REFERENCE_ORDER.size():
		var image: Image = reports[REFERENCE_ORDER[i]]
		var p := Vector2i(i%4,i/4)*SIZE
		sheet.blit_rect(image,Rect2i(Vector2i.ZERO,SIZE),p)
		var preview_at := Vector2i(i%4*48,i/4*56)
		dark.blend_rect(image,Rect2i(Vector2i.ZERO,SIZE),preview_at)
		light.blend_rect(image,Rect2i(Vector2i.ZERO,SIZE),preview_at)
		draw_label(dark,REFERENCE_ORDER[i].to_upper(),preview_at+Vector2i(24,48),Color("c9d0de"))
		draw_label(light,REFERENCE_ORDER[i].to_upper(),preview_at+Vector2i(24,48),Color("564b61"))
	sheet.save_png(DEST+"/heads-8dir.png")
	for pair: Array in [[dark,"preview-dark.png"],[light,"preview-light.png"]]:
		var image: Image=pair[0]
		image.resize(image.get_width()*6,image.get_height()*6,Image.INTERPOLATE_NEAREST)
		image.save_png(DEST+"/"+pair[1])

func draw_label(image: Image,label: String,center: Vector2i,color: Color) -> void:
	var glyphs := {"N":["10001","11001","10101","10011","10001"],"S":["01111","10000","01110","00001","11110"],"E":["11111","10000","11110","10000","11111"],"W":["10001","10001","10101","11011","10001"]}
	var origin := center-Vector2i((label.length()*6-1)/2,0)
	for i in label.length():
		var glyph: Array=glyphs[label[i]]
		for y in glyph.size():
			for x in 5:
				if glyph[y][x]=="1":image.set_pixelv(origin+Vector2i(i*6+x,y),color)

func rect_array(rect: Rect2i) -> Array:
	return [rect.position.x,rect.position.y,rect.size.x,rect.size.y]

func fail(message: String) -> void:
	push_error(message);quit(1)
