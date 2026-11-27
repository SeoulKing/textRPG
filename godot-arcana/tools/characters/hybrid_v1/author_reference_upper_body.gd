extends SceneTree
## Reference transcription into native PixelPen layers. No runtime/motion changes.
const DEST := "res://art/characters/hybrid-v1/upper-body"
const SIZE := Vector2i(48,48)
const DIRS := ["s","se","e","ne","n","nw","w","sw"]
const REFERENCE_ORDER := ["s","se","e","ne","n","nw","w","sw"]
const COLORS := ["00000000","352d40","8e7999","b89a92","d8bdae","f4e2d2","fff4e3","fff9f4","4d3335","805854","9b7166","b38b77","8f582e","c18b4b","e4b876","ffe1a1","65536f","e9ad9b","ffd8bd","c58481"]
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
			if FileAccess.file_exists(DEST+"/"+direction+"/upper_body.pxpen"):
				if not retracing or not previous is Dictionary or FileAccess.get_sha256(DEST+"/"+direction+"/upper_body.pxpen")!=previous.directions[direction].source_sha256:
					fail("Refusing to overwrite existing or manually changed PixelPen source: "+direction); return
		var reference := Image.load_from_file(DEST+"/reference.png")
		if reference == null:
			fail("Missing reference.png"); return
		reference.convert(Image.FORMAT_RGBA8)
		var cell := Vector2i(reference.get_width()/4,reference.get_height()/2)
		for i in REFERENCE_ORDER.size():
			var rect := source_bounds(reference,Rect2i(Vector2i(i%4,i/4)*cell,cell))
			metadata[REFERENCE_ORDER[i]] = {"source_rect":[rect.position.x,rect.position.y,rect.size.x,rect.size.y],"source_neck_axis_x_relative":neck_axis(reference,rect)}
			# Same physical scale as the completed head. Align neck opening.
			var data := transcribe(reference,rect)
			drafts[REFERENCE_ORDER[i]] = data
		for direction: String in DIRS:
			var doc := new_document(direction)
			var layers := split_layers(drafts[direction],direction)
			for label: String in ["shirt","leather","metal","collar_trim","skin","silhouette"]:
				var uid := doc.add_layer(label)
				var layer := doc.get_index_image(uid)
				var pixels: PackedByteArray = layers[label]
				for p in pixels.size():
					if pixels[p] != 0: layer.set_index_on_color_map(p%SIZE.x,p/SIZE.x,pixels[p])
				doc.active_layer_uid = uid
				doc.pool_frames[0].layer_active_uid = uid
			DirAccess.make_dir_recursive_absolute(DEST+"/"+direction)
			if ProjectPacker.save(doc,DEST+"/"+direction+"/upper_body.pxpen") != OK:
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
		var doc: PixelPenProject = ProjectPacker.load_project(DEST+"/"+direction+"/upper_body.pxpen")
		if doc==null or doc.canvas_size!=SIZE or doc.palette.color_index!=palette:
			fail("Expected 48x48 and the fixed shared palette in saved source: "+direction);return
	for direction: String in DIRS:
		if not export_direction(direction): return
	write_manifest()
	make_reviews()
	print("UPPER_BODY_NATIVE_OK directions=8 canvas=48x48 roundtrip=true")
	quit(0)

func new_document(direction: String) -> PixelPenProject:
	var doc := PixelPenProject.new()
	doc.compatibility_version = PixelPenProject.COMPATIBILITY_NUMBER
	doc.project_name = "팔·몸통 통합 상체 · "+direction.to_upper()
	doc.file_path = DEST+"/"+direction+"/upper_body.pxpen"
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

func upper_joints(direction: String) -> Dictionary:
	var arms := {
		"s":[[12,15],[9,26],[9,35],[36,15],[39,26],[39,35]],
		"se":[[16,15],[12,27],[12,36],[32,16],[35,26],[35,34]],
		"e":[[23,15],[23,27],[23,36],[27,16],[28,26],[28,33]],
		"ne":[[34,15],[38,27],[38,35],[19,16],[19,26],[19,34]],
		"n":[[35,15],[39,27],[39,35],[13,15],[9,27],[9,35]],
		"nw":[[29,16],[30,26],[30,34],[14,15],[10,27],[10,35]],
		"w":[[20,16],[19,26],[19,33],[24,15],[24,27],[24,36]],
		"sw":[[17,16],[15,26],[15,34],[32,15],[36,27],[36,35]]}
	var a: Array=arms[direction]
	return {"neck":[24,9],"spine":[24,23],"shoulder_l":a[0],"elbow_l":a[1],"wrist_l":a[2],"shoulder_r":a[3],"elbow_r":a[4],"wrist_r":a[5]}

func source_pixel(c: Color) -> bool:
	if c.a < 0.5 or maxf(c.r,maxf(c.g,c.b)) < 0.06: return false
	# The pasted sheet has magenta selection marks and red edge contamination.
	if c.r > 0.6 and c.b > 0.55 and c.g < 0.35: return false
	if c.r > 0.7 and c.g < 0.3 and c.b < 0.35: return false
	if c.r > 0.5 and c.g > 0.4 and c.b < 0.25 and c.g > c.r*0.9: return false
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
	var origin := Vector2(24.0-neck_axis(image,rect)*scale_value,6.0)
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
	# Keep enclosed buckle openings as opaque dark leather.
	fill_enclosed_ink(result)
	retain_main_component(result)
	return result

func neck_axis(image: Image,rect: Rect2i) -> float:
	var total := 0.0
	var count := 0
	for y in range(rect.position.y,rect.position.y+maxi(2,roundi(rect.size.y*0.08))):
		var lo := rect.end.x
		var hi := rect.position.x
		for x in range(rect.position.x,rect.end.x):
			if source_pixel(image.get_pixel(x,y)):lo=mini(lo,x);hi=maxi(hi,x)
		if hi>=lo:total+=float(lo+hi)*0.5-rect.position.x;count+=1
	return total/maxi(1,count)

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
		if data[i]==0 and not outside.has(i):data[i]=8

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
	for label: String in ["shirt","leather","metal","collar_trim","skin","silhouette"]:
		var bytes := PackedByteArray(); bytes.resize(data.size()); result[label]=bytes
	for i in data.size():
		if data[i]==0:continue
		if direction in ["n","ne","nw"] and data[i]>=12 and data[i]<=15:data[i]=10
		var x := i%SIZE.x
		var y := i/SIZE.x
		var edge := false
		for offset: Vector2i in [Vector2i.LEFT,Vector2i.RIGHT,Vector2i.UP,Vector2i.DOWN]:
			var p := Vector2i(x,y)+offset
			if p.x<0 or p.y<0 or p.x>=SIZE.x or p.y>=SIZE.y or data[p.y*SIZE.x+p.x]==0: edge=true
		if edge:
			result.silhouette[i]=1;continue
		var material := "shirt" if data[i]<8 else ("leather" if data[i]<12 else ("metal" if data[i]<16 else ("collar_trim" if data[i]==16 else "skin")))
		result[material][i]=data[i]
	return result

func export_direction(direction: String) -> bool:
	var folder := DEST+"/"+direction
	var path := folder+"/upper_body.pxpen"
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
	if image.save_png(folder+"/upper_body.png")!=OK:
		fail("PNG export failed: "+direction);return false
	var reopened := Image.load_from_file(folder+"/upper_body.png")
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
	metadata[direction].merge({"png":folder+"/upper_body.png","native_source":path,"source_sha256":FileAccess.get_sha256(path),"output_sha256":FileAccess.get_sha256(folder+"/upper_body.png"),"native_fingerprint":signature,"native_reopened_matches":true,"png_roundtrip_matches":true,"pivot":[24,9],"landmarks":{"neck":[24,9],"waist":[24,33]},"joints":upper_joints(direction),"opaque_bounds":rect_array(image.get_used_rect()),"actual_opaque_colors":colors.size(),"alpha_values":alpha_values.keys(),"layers":layers},true)
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
	var combined := actual.duplicate()
	for direction: String in DIRS:
		var head := Image.load_from_file("res://art/characters/hybrid-v1/heads/"+direction+"/head.png")
		if head!=null:
			for y in head.get_height():
				for x in head.get_width():
					var c := head.get_pixel(x,y)
					if c.a>0:combined[c.to_html(true)]=true
	var manifest := {"schema_version":1,"part":"upper_body","reference":"reference.png","reference_sha256":FileAccess.get_sha256(DEST+"/reference.png"),"canvas_size":[48,48],"character_target_canvas":[96,136],"character_proportion_heads":3,"physical_reference_scale":42.0/264.0,"direction_order":DIRS,"sheet_order":REFERENCE_ORDER,"pivot_semantics":"neck opening [24,9] joins head pivot [24,44] without rescaling","outline_owner":"upper body silhouette layer, baked once; no extra displayed outline","layers_semantics":"Materials only: shirt, leather, metal, collar_trim, skin, silhouette; arms and torso remain one continuous output texture.","palette_rgba":COLORS,"registered_opaque_colors":COLORS.size()-1,"transparent_slots":1,"actual_used_opaque_colors":actual.size(),"combined_head_upper_body_opaque_colors":combined.size(),"render_method":"single Polygon2D texture with Skeleton2D skin weights","runtime_connected":false,"visual_approval":"pending","directions":metadata}
	manifest["assembly_preview"] = {"head_origin":[24,7],"torso_origin":[24,42],"neck_canvas":[48,51],"canvas_size":[96,136],"scope":"head and integrated upper body; lower body separate","directions":{}}
	for direction: String in DIRS:
		var head_path := "res://art/characters/hybrid-v1/heads/"+direction+"/head.png"
		manifest.assembly_preview.directions[direction] = {"head_png":head_path,"head_png_sha256":FileAccess.get_sha256(head_path),"torso_png_sha256":metadata[direction].output_sha256}
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
	sheet.save_png(DEST+"/upper-body-8dir.png")
	for pair: Array in [[dark,"preview-dark.png"],[light,"preview-light.png"]]:
		var image: Image=pair[0]
		image.resize(image.get_width()*6,image.get_height()*6,Image.INTERPOLATE_NEAREST)
		image.save_png(DEST+"/"+pair[1])
	make_assembly_reviews()

func make_assembly_reviews() -> void:
	DirAccess.make_dir_recursive_absolute(DEST+"/assembly")
	var light := Image.create(96*4,96*2,false,Image.FORMAT_RGBA8);light.fill(Color("e4dedd"))
	var dark := Image.create(96*4,96*2,false,Image.FORMAT_RGBA8);dark.fill(Color("283341"))
	for i in REFERENCE_ORDER.size():
		var direction: String=REFERENCE_ORDER[i]
		var torso: Image=reports[direction]
		var head := Image.load_from_file("res://art/characters/hybrid-v1/heads/"+direction+"/head.png")
		if head==null:continue
		var assembled := Image.create(96,136,false,Image.FORMAT_RGBA8)
		assembled.fill(Color.TRANSPARENT)
		assembled.blend_rect(torso,Rect2i(Vector2i.ZERO,SIZE),Vector2i(24,42))
		assembled.blend_rect(head,Rect2i(Vector2i.ZERO,SIZE),Vector2i(24,7))
		assembled.save_png(DEST+"/assembly/"+direction+".png")
		var at := Vector2i(i%4*96,i/4*96)
		light.blend_rect(assembled,Rect2i(0,0,96,86),at)
		dark.blend_rect(assembled,Rect2i(0,0,96,86),at)
		draw_label(light,direction.to_upper(),at+Vector2i(48,88),Color("564b61"))
		draw_label(dark,direction.to_upper(),at+Vector2i(48,88),Color("c9d0de"))
	for pair: Array in [[light,"assembly-light.png"],[dark,"assembly-dark.png"]]:
		var image: Image=pair[0]
		image.resize(image.get_width()*4,image.get_height()*4,Image.INTERPOLATE_NEAREST)
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
