extends SceneTree
## Reference transcription into native PixelPen layers. No runtime/motion changes.
const DEST := "res://art/characters/hybrid-v1/boots"
const SIZE := Vector2i(48,48)
const DIRS := ["s","se","e","ne","n","nw","w","sw"]
const REFERENCE_ORDER := ["sw","w","nw","n","ne","e","se","s"]
const SOURCE_X_RUNS := [[112,241],[359,507],[635,768],[902,1032],[1164,1298],[1424,1566],[1677,1812],[1935,2066]]
const COLORS := ["00000000","352d40","8e7999","b89a92","d8bdae","f4e2d2","fff4e3","fff9f4","4d3335","805854","9b7166","b38b77","8f582e","c18b4b","e4b876","ffe1a1"]
var palette := PackedColorArray()
var drafts: Dictionary = {}
var metadata: Dictionary = {}
var reports: Dictionary = {}

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	var mirroring := OS.get_cmdline_user_args().has("--mirror-east-from-west")
	var exporting := OS.get_cmdline_user_args().has("--export") or mirroring
	var retracing := OS.get_cmdline_user_args().has("--retrace-own-draft")
	if not exporting and not OS.get_cmdline_user_args().has("--author"):
		fail("Use --author for NEW sources, --export for saved sources, or --mirror-east-from-west."); return
	for hex: String in COLORS: palette.append(Color(hex))
	if not exporting:
		var previous: Variant = JSON.parse_string(FileAccess.get_file_as_string(DEST+"/manifest.json")) if retracing else null
		for direction: String in DIRS:
			if FileAccess.file_exists(DEST+"/"+direction+"/boot.pxpen"):
				if not retracing or not previous is Dictionary or FileAccess.get_sha256(DEST+"/"+direction+"/boot.pxpen")!=previous.directions[direction].source_sha256:
					fail("Refusing to overwrite existing or manually changed PixelPen source: "+direction); return
		var reference := Image.load_from_file(DEST+"/reference.png")
		if reference == null:
			fail("Missing reference.png"); return
		reference.convert(Image.FORMAT_RGBA8)
		for i in REFERENCE_ORDER.size():
			# One-row reference; exclude printed direction labels below the art.
			var run: Array = SOURCE_X_RUNS[i]
			var roi := Rect2i(int(run[0])-6,185,int(run[1])-int(run[0])+13,265)
			var rect := source_bounds(reference,roi)
			metadata[REFERENCE_ORDER[i]] = {"source_rect":[rect.position.x,rect.position.y,rect.size.x,rect.size.y],"source_cuff_axis_x_relative":cuff_axis(reference,rect)}
			# One shared scale for this reference export, centered at the cuff.
			var data := transcribe(reference,rect)
			drafts[REFERENCE_ORDER[i]] = data
		for direction: String in DIRS:
			var doc := new_document(direction)
			polish_native_features(drafts[direction],direction)
			var layers := split_layers(drafts[direction],direction)
			for label: String in ["fur","leather","metal","silhouette"]:
				var uid := doc.add_layer(label)
				var layer := doc.get_index_image(uid)
				var pixels: PackedByteArray = layers[label]
				for p in pixels.size():
					if pixels[p] != 0: layer.set_index_on_color_map(p%SIZE.x,p/SIZE.x,pixels[p])
				doc.active_layer_uid = uid
				doc.pool_frames[0].layer_active_uid = uid
			DirAccess.make_dir_recursive_absolute(DEST+"/"+direction)
			if ProjectPacker.save(doc,DEST+"/"+direction+"/boot.pxpen") != OK:
				fail("PixelPen save failed: "+direction); return
			metadata[direction]["authored_fingerprint"] = fingerprint(doc)
	else:
		var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(DEST+"/manifest.json"))
		if not parsed is Dictionary:
			fail("Export requires existing manifest."); return
		metadata = parsed.directions
	# User-approved directional rule: E is the complete native W master flipped.
	# Apply on initial authoring or explicit mirror only; export preserves edits.
	if mirroring or not exporting:
		if not mirror_east_from_west():return
	# Preflight the common palette for ALL saved originals before replacing any
	# exported image. A direction-specific palette would break part consistency.
	for direction: String in DIRS:
		var doc: PixelPenProject = ProjectPacker.load_project(DEST+"/"+direction+"/boot.pxpen")
		if doc==null or doc.canvas_size!=SIZE or doc.palette.color_index!=palette:
			fail("Expected 48x48 and the fixed shared palette in saved source: "+direction);return
	for direction: String in DIRS:
		if not export_direction(direction): return
	write_manifest()
	make_reviews()
	print("BOOTS_PARTS_NATIVE_OK directions=8 canvas=48x48 roundtrip=true")
	quit(0)

func mirror_east_from_west() -> bool:
	var source := DEST+"/w/boot.pxpen"
	var target := DEST+"/e/boot.pxpen"
	var doc: PixelPenProject = ProjectPacker.load_project(source)
	if doc==null or doc.canvas_size!=SIZE or doc.palette.color_index!=palette:
		fail("West original needs the common size and palette before mirroring.");return false
	var backup := DEST+"/history/e-before-west-mirror.pxpen"
	if FileAccess.file_exists(target) and not FileAccess.file_exists(backup):
		DirAccess.make_dir_recursive_absolute(DEST+"/history")
		if DirAccess.copy_absolute(ProjectSettings.globalize_path(target),ProjectSettings.globalize_path(backup))!=OK:
			fail("Could not preserve the previous east original.");return false
	for frame: Frame in doc.pool_frames:
		for layer: IndexedColorImage in frame.layers:
			var mirrored := Image.create_from_data(SIZE.x,SIZE.y,false,Image.FORMAT_R8,layer.colormap.get_data().duplicate())
			mirrored.flip_x()
			layer.colormap=mirrored
	doc.file_path=target
	doc.project_name="털 장식 가죽 부츠 · E (W 좌우 반전)"
	if ProjectPacker.save(doc,target)!=OK:
		fail("Could not save mirrored east PixelPen original.");return false
	metadata.e["authored_fingerprint"]=fingerprint(doc)
	metadata.e["source_rect"]=metadata.w.source_rect.duplicate()
	metadata.e["source_cuff_axis_x_relative"]=metadata.w.source_cuff_axis_x_relative
	metadata.e["derived_from"]="w"
	metadata.e["transform"]="flip_x"
	metadata.e["pixel_index_map"]="47-x"
	metadata.e["mirror_axis_x"]=24
	metadata.e["source_native_sha256"]=FileAccess.get_sha256(source)
	return true

func new_document(direction: String) -> PixelPenProject:
	var doc := PixelPenProject.new()
	doc.compatibility_version = PixelPenProject.COMPATIBILITY_NUMBER
	doc.project_name = "털 장식 가죽 부츠 · "+direction.to_upper()
	doc.file_path = DEST+"/"+direction+"/boot.pxpen"
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

func polish_native_features(data: PackedByteArray,direction: String) -> void:
	# Four source pixels preserve the front buckle's dark opening at this scale.
	# Other directions keep their oblique/partly hidden reference buckle shapes.
	if direction!="s":return
	var buckle := [[14,15,15,13],[14,8,8,13],[14,8,8,13],[13,13,13,12]]
	for y in 4:
		for x in 4:
			var at := (17+y)*SIZE.x+22+x
			if data[at]!=0:data[at]=buckle[y][x]

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
	# This boot sheet has its own reference export scale.
	# Shared 0.09 source scale yields about 12x22 visible pixels; no per-view stretch.
	var scale_value := 0.09
	var origin := Vector2(24.0-cuff_axis(image,rect)*scale_value,5.0)
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

func cuff_axis(image: Image,rect: Rect2i) -> float:
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
	for label: String in ["fur","leather","metal","silhouette"]:
		var bytes := PackedByteArray(); bytes.resize(data.size()); result[label]=bytes
	for i in data.size():
		if data[i]==0:continue
		# True rear N has no buckle; partial side buckles in NW/NE are retained.
		if direction=="n" and data[i]>=12:data[i]=10
		var x := i%SIZE.x
		var y := i/SIZE.x
		var edge := false
		for offset: Vector2i in [Vector2i.LEFT,Vector2i.RIGHT,Vector2i.UP,Vector2i.DOWN]:
			var p := Vector2i(x,y)+offset
			if p.x<0 or p.y<0 or p.x>=SIZE.x or p.y>=SIZE.y or data[p.y*SIZE.x+p.x]==0: edge=true
		if edge:
			result.silhouette[i]=1;continue
		# Material roles are shared with the upper body and pelvis.
		var material := "fur" if data[i]<8 else ("leather" if data[i]<12 else "metal")
		result[material][i]=data[i]
	return result

func export_direction(direction: String) -> bool:
	var folder := DEST+"/"+direction
	var path := folder+"/boot.pxpen"
	var doc: PixelPenProject = ProjectPacker.load_project(path)
	if doc==null or doc.canvas_size!=SIZE:
		fail("Native reopen failed: "+direction);return false
	var signature := fingerprint(doc)
	if metadata[direction].has("authored_fingerprint") and metadata[direction].authored_fingerprint!=signature:
		# Manual saved edits are accepted on --export, first author roundtrip is strict.
		if not OS.get_cmdline_user_args().has("--export") and not OS.get_cmdline_user_args().has("--mirror-east-from-west"):
			fail("Native roundtrip changed pixels: "+direction);return false
	var image := doc.get_image(doc.pool_frames[0])
	image.convert(Image.FORMAT_RGBA8)
	if image.save_png(folder+"/boot.png")!=OK:
		fail("PNG export failed: "+direction);return false
	var reopened := Image.load_from_file(folder+"/boot.png")
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
	metadata[direction].merge({"png":folder+"/boot.png","native_source":path,"source_sha256":FileAccess.get_sha256(path),"output_sha256":FileAccess.get_sha256(folder+"/boot.png"),"native_fingerprint":signature,"native_reopened_matches":true,"png_roundtrip_matches":true,"pivot":[24,21],"landmarks":{"cuff_connection":[24,8],"ankle":[24,21],"sole_contact":sole_contact(image)},"anchor_state":"candidate_until_leg_assembly","opaque_bounds":rect_array(image.get_used_rect()),"actual_opaque_colors":colors.size(),"alpha_values":alpha_values.keys(),"layers":layers},true)
	reports[direction]=image
	return true

func sole_contact(image: Image) -> Array:
	var used := image.get_used_rect()
	var lo := SIZE.x
	var hi := -1
	for y in range(maxi(used.position.y,used.end.y-2),used.end.y):
		for x in SIZE.x:
			if image.get_pixel(x,y).a>0.5:lo=mini(lo,x);hi=maxi(hi,x)
	return [roundi(float(lo+hi)*0.5),used.end.y]

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
	var manifest := {"schema_version":1,"part":"boot","reference":"reference.png","reference_sha256":FileAccess.get_sha256(DEST+"/reference.png"),"canvas_size":[48,48],"character_target_canvas":[96,136],"character_proportion_heads":3,"physical_reference_scale":0.09,"reference_art_roi_y":[185,450],"direction_order":DIRS,"sheet_order":REFERENCE_ORDER,"pivot_semantics":"ankle pivot [24,21]; cuff connection [24,8], same upper opening axis for every direction","anchor_state":"candidate_until_leg_assembly","sole_contact_semantics":"bottom edge y exclusive; x is center of opaque pixels in last two rows","outline_owner":"boot silhouette layer, baked once; disable additional outline when displaying boot.png","layers_semantics":"cream fur cuff, brown leather shaft/strap/sole, gold buckle, outer silhouette; exactly one boot per image","left_right_policy":"Single-boot directional master; no left/right pair is painted into one texture. Final leg registration and buckle-side policy are separate.","palette_rgba":COLORS,"palette_roles":{"fur":[2,3,4,5,6,7],"leather":[8,9,10,11],"metal":[12,13,14,15],"silhouette":[1]},"registered_opaque_colors":COLORS.size()-1,"transparent_slots":1,"actual_used_opaque_colors":actual.size(),"runtime_connected":false,"visual_approval":"pending","directions":metadata}
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
	sheet.save_png(DEST+"/boots-8dir.png")
	for pair: Array in [[dark,"preview-dark.png"],[light,"preview-light.png"]]:
		var image: Image=pair[0]
		image.resize(image.get_width()*6,image.get_height()*6,Image.INTERPOLATE_NEAREST)
		image.save_png(DEST+"/"+pair[1])
	var comparison := Image.create(64,38,false,Image.FORMAT_RGBA8)
	comparison.fill(Color("e4dedd"))
	for i in 2:
		var direction: String=["w","e"][i]
		comparison.blend_rect(reports[direction],Rect2i(8,2,32,30),Vector2i(i*32,0))
		draw_label(comparison,direction.to_upper(),Vector2i(i*32+16,32),Color("564b61"))
	comparison.resize(640,380,Image.INTERPOLATE_NEAREST)
	comparison.save_png(DEST+"/west-east-comparison.png")

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
