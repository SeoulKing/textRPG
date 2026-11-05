extends SceneTree
## Copy whole directional legs from the user's attachment without repainting,
## resampling, palette conversion or alpha changes. UV geometry sets display size.
const BASE := "res://art/characters/hybrid-v1/legs"
const SIZE := Vector2i(48,48)
const ORDER := ["sw","w","nw","n","ne","e","se","s"]
const X_RUNS := [[73,289],[343,537],[593,806],[865,1076],[1131,1345],[1396,1591],[1641,1854],[1899,2109]]
const DISPLAY_SCALE := Vector2(0.06,0.08)

func _initialize() -> void:
	call_deferred("_prepare")

func _prepare() -> void:
	var source := Image.load_from_file(BASE+"/reference.png")
	if source==null:
		_abort("Missing exact uploaded reference");return
	source.convert(Image.FORMAT_RGBA8)
	for direction: String in ORDER:
		if FileAccess.file_exists(BASE+"/"+direction+"/leg.png"):
			_abort("Preserving existing leg texture: "+direction);return
	var manifest := {"schema_version":1,"part":"whole_leg","input":"user_uploaded_attachment","reference":"reference.png","reference_sha256":FileAccess.get_sha256(BASE+"/reference.png"),"source_size":[source.get_width(),source.get_height()],"direction_order":["s","se","e","ne","n","nw","w","sw"],"sheet_order":ORDER,"source_order_policy":"Same SW W NW N NE E SE S order as the preceding uploaded pelvis/boot sheets; the current sheet has no labels.","logical_canvas_size":[48,48],"character_target_canvas":[96,136],"character_proportion_heads":3,"texture_policy":"Exact RGBA source subrect per whole leg. No thigh/shin split, redraw, resampling, color quantization or alpha normalization.","display_scale_xy":[DISPLAY_SCALE.x,DISPLAY_SCALE.y],"scale_semantics":"Logical Polygon2D geometry only; original full-resolution texture pixels remain unchanged.","outline_owner":"source texture only; no generated or additional outline","alpha_policy":"Original source alpha retained, including partial alpha.","render_method":"One Polygon2D texture with two weighted Bone2D joints per whole leg","runtime_connected":false,"user_art_approval":"pending","directions":{}}
	for i in ORDER.size():
		var direction: String=ORDER[i]
		var run: Array=X_RUNS[i]
		var crop := Rect2i(int(run[0])-4,120,int(run[1])-int(run[0])+8,500)
		var image := source.get_region(crop)
		var folder := BASE+"/"+direction
		DirAccess.make_dir_recursive_absolute(folder)
		var path := folder+"/leg.png"
		if image.save_png(path)!=OK:
			_abort("Could not save whole leg: "+direction);return
		var reopened := Image.load_from_file(path)
		reopened.convert(Image.FORMAT_RGBA8)
		if reopened.get_data()!=image.get_data():
			_abort("PNG pixels changed from uploaded source: "+direction);return
		var hx := row_center(source,run,175)-crop.position.x
		var kx := row_center(source,run,430)-crop.position.x
		var ax := row_center(source,run,587)-crop.position.x
		var origin := Vector2(24.0-hx*DISPLAY_SCALE.x,4)
		var logical_size := Vector2(image.get_size())*DISPLAY_SCALE
		var joints := {"hip":[24.0,4+(175-120)*DISPLAY_SCALE.y],"knee":[origin.x+kx*DISPLAY_SCALE.x,4+(430-120)*DISPLAY_SCALE.y],"ankle":[origin.x+ax*DISPLAY_SCALE.x,4+(587-120)*DISPLAY_SCALE.y]}
		manifest.directions[direction] = {"png":path,"png_sha256":FileAccess.get_sha256(path),"source_rect":[crop.position.x,crop.position.y,crop.size.x,crop.size.y],"texture_size":[image.get_width(),image.get_height()],"source_pixels_match":true,"source_joints":{"hip":[hx,55],"knee":[kx,310],"ankle":[ax,467]},"texture_rect":[origin.x,origin.y,logical_size.x,logical_size.y],"joints":joints,"joint_state":"authoring reference pending whole-character assembly"}
	var file := FileAccess.open(BASE+"/manifest.json",FileAccess.WRITE)
	file.store_string(JSON.stringify(manifest,"\t"));file.close()
	make_source_preview(source)
	print("WHOLE_LEG_SOURCE_OK directions=8 exact_uploaded_RGBA=true thigh_shin_split=false")
	quit(0)

func row_center(image: Image,run: Array,center_y: int) -> float:
	var sum := 0.0
	var count := 0
	for y in range(center_y-4,center_y+5):
		var lo := image.get_width()
		var hi := -1
		for x in range(int(run[0]),int(run[1])):
			if image.get_pixel(x,y).a>0.5:lo=mini(lo,x);hi=maxi(hi,x)
		if hi>=lo:sum+=float(lo+hi)*0.5;count+=1
	return sum/maxi(1,count)

func make_source_preview(source: Image) -> void:
	# Cropping only: this preview retains the exact original leg pixels too.
	var sheet := Image.create(256*4,520*2,false,Image.FORMAT_RGBA8)
	sheet.fill(Color("e4dedd"))
	for i in ORDER.size():
		var run: Array=X_RUNS[i]
		var crop := Rect2i(int(run[0])-4,120,int(run[1])-int(run[0])+8,500)
		var at := Vector2i(i%4*256+(256-crop.size.x)/2,i/4*520+10)
		sheet.blend_rect(source,crop,at)
	sheet.save_png(BASE+"/source-preview.png")

func _abort(message: String) -> void:
	push_error(message);quit(1)
