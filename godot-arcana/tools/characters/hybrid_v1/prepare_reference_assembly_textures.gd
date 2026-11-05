extends SceneTree
## Assembly-only transparency derivative. Whole upper-body art stays one texture;
## original PixelPen documents/exports remain untouched. Pelvis owns the belt.
const SOURCE := "res://art/characters/hybrid-v1/upper-body"
const DEST := "res://art/characters/hybrid-v1/assembly/upper-body-assembly"
const DIRS := ["s","se","e","ne","n","nw","w","sw"]
const BELTS := {"s":Rect2i(14,27,20,7),"se":Rect2i(17,27,19,6),"e":Rect2i(29,27,9,6),"ne":Rect2i(15,27,15,6),"n":Rect2i(14,27,20,6),"nw":Rect2i(20,27,14,6),"w":Rect2i(9,27,11,6),"sw":Rect2i(13,27,17,6)}

func _initialize() -> void:
	call_deferred("_prepare")

func _prepare() -> void:
	var previous: Variant=null
	if FileAccess.file_exists(DEST+"/manifest.json"):
		previous=JSON.parse_string(FileAccess.get_file_as_string(DEST+"/manifest.json"))
	# Refuse to overwrite manually altered assembly derivatives.
	for direction: String in DIRS:
		var path := DEST+"/"+direction+".png"
		if FileAccess.file_exists(path) and (not previous is Dictionary or FileAccess.get_sha256(path)!=str(previous.directions.get(direction,{}).get("sha256",""))):
			_abort("Preserving modified assembly texture: "+direction);return
	DirAccess.make_dir_recursive_absolute(DEST)
	var report := {"schema_version":1,"source_directory":SOURCE,"belt_owner":"pelvis","original_sources_modified":false,"one_texture_for_arms_and_torso":true,"directions":{}}
	var board := Image.create(48*4,48*4,false,Image.FORMAT_RGBA8)
	board.fill(Color("e4dedd"))
	for i in DIRS.size():
		var direction: String=DIRS[i]
		var original := Image.load_from_file(SOURCE+"/"+direction+"/upper_body.png")
		var leather := Image.load_from_file(SOURCE+"/"+direction+"/leather.png")
		var metal := Image.load_from_file(SOURCE+"/"+direction+"/metal.png")
		var outline := Image.load_from_file(SOURCE+"/"+direction+"/silhouette.png")
		if original==null or leather==null or metal==null or outline==null:
			_abort("Missing material layer for belt ownership: "+direction);return
		var image := original.duplicate() as Image
		image.convert(Image.FORMAT_RGBA8)
		var mask := Image.create(48,48,false,Image.FORMAT_RGBA8);mask.fill(Color.TRANSPARENT)
		var rect: Rect2i=BELTS[direction]
		var remove := {}
		for y in range(rect.position.y,rect.end.y):
			for x in range(rect.position.x,rect.end.x):
				if leather.get_pixel(x,y).a>0.5 or metal.get_pixel(x,y).a>0.5:remove[Vector2i(x,y)]=true
		var border := {}
		for point: Vector2i in remove:
			for oy in range(-1,2):
				for ox in range(-1,2):
					var p := point+Vector2i(ox,oy)
					if rect.has_point(p) and outline.get_pixelv(p).a>0.5:border[p]=true
		remove.merge(border)
		for p: Vector2i in remove:
			image.set_pixelv(p,Color.TRANSPARENT)
			mask.set_pixelv(p,Color.WHITE)
		# Old belt corner pixels can remain as isolated ink after material
		# removal. Only drop islands wholly inside the clipped belt region;
		# cuffs connected beyond it remain intact.
		var seen := {}
		for yy in range(rect.position.y,rect.end.y):
			for xx in range(rect.position.x,rect.end.x):
				var start := Vector2i(xx,yy)
				if seen.has(start) or image.get_pixelv(start).a<0.5:continue
				var queue: Array[Vector2i]=[start]
				var cursor := 0
				var connected_outside := false
				seen[start]=true
				while cursor<queue.size():
					var p: Vector2i=queue[cursor];cursor+=1
					if not rect.has_point(p):connected_outside=true
					for oy in range(-1,2):
						for ox in range(-1,2):
							var next := p+Vector2i(ox,oy)
							if next.x<0 or next.y<0 or next.x>=48 or next.y>=48 or seen.has(next):continue
							if image.get_pixelv(next).a>0.5:seen[next]=true;queue.append(next)
				if not connected_outside:
					for p: Vector2i in queue:image.set_pixelv(p,Color.TRANSPARENT);mask.set_pixelv(p,Color.WHITE);remove[p]=true
		var path := DEST+"/"+direction+".png"
		image.save_png(path)
		mask.save_png(DEST+"/"+direction+"-waist-mask.png")
		report.directions[direction] = {"png":path,"sha256":FileAccess.get_sha256(path),"source_png":SOURCE+"/"+direction+"/upper_body.png","source_sha256":FileAccess.get_sha256(SOURCE+"/"+direction+"/upper_body.png"),"waist_clip_rect":[rect.position.x,rect.position.y,rect.size.x,rect.size.y],"removed_pixels":remove.size()}
		var at := Vector2i(i%4*48,i/4*96)
		board.blend_rect(original,Rect2i(0,0,48,48),at)
		board.blend_rect(image,Rect2i(0,0,48,48),at+Vector2i(0,48))
	board.resize(board.get_width()*4,board.get_height()*4,Image.INTERPOLATE_NEAREST)
	board.save_png(DEST+"/before-after.png")
	var file := FileAccess.open(DEST+"/manifest.json",FileAccess.WRITE)
	file.store_string(JSON.stringify(report,"\t"));file.close()
	print("REFERENCE_ASSEMBLY_TEXTURES_OK one_upper_texture=true pelvis_owns_belt=true")
	quit(0)

func _abort(message: String) -> void:
	push_error(message);quit(1)
