extends SceneTree
## One-time native source extraction. Keeps only the two approved hand layers.
## Saved hand pixels and the existing sixteen PNG files must remain identical.
const ROOT := "res://art/characters/hybrid-v1/hands"
const DIRECTIONS := ["s","se","e","ne","n","nw","w","sw"]
const LAYERS := ["hand_l__skin","hand_r__skin"]
var report := {}

func _initialize() -> void:call_deferred("extract")

func extract() -> void:
	if not OS.get_cmdline_user_args().has("--extract"):
		fail("Pass --extract for the reviewed one-time hand source extraction.");return
	var parsed: Variant=JSON.parse_string(FileAccess.get_file_as_string(ROOT+"/manifest.json"))
	if not parsed is Dictionary:fail("Missing hand registration");return
	var manifest: Dictionary=parsed
	DirAccess.make_dir_recursive_absolute("res://.runtime/hybrid-hand-export")
	var documents := {}
	# Preflight every original before creating a replacement or removing anything.
	for direction: String in DIRECTIONS:
		var path := ROOT+"/"+direction+"/parts.pxpen"
		var source: PixelPenProject=ProjectPacker.load_project(path)
		if source==null or source.pool_frames.size()!=1:
			fail("Expected one saved source frame: "+path);return
		for label: String in LAYERS:
			if find_layer(source,label)==null:fail("Missing hand layer: "+direction+" "+label);return
		documents[direction]=source
	for direction: String in DIRECTIONS:
		var source: PixelPenProject=documents[direction]
		var path := ROOT+"/"+direction+"/hands.pxpen"
		if FileAccess.file_exists(path):fail("Refusing to overwrite a saved hand original: "+path);return
		var doc := make_document(source,direction,path)
		if ProjectPacker.save(doc,path)!=OK:fail("Native hand save failed: "+direction);return
		var reopened: PixelPenProject=ProjectPacker.load_project(path)
		if reopened==null or reopened.pool_frames.size()!=1 or reopened.pool_frames[0].layers.size()!=2 or not reopened._cache_pool_frames.is_empty():
			fail("Saved hand source did not reopen as exactly two layers: "+direction);return
		var row := {"native_source":path,"source_sha256":FileAccess.get_sha256(path),"source_reopened":true,"frame_count":1,"layer_count":2,"outputs":{}}
		for side: String in ["l","r"]:
			var label := "hand_"+side+"__skin"
			var original_layer := find_layer(source,label)
			var saved_layer := find_layer(reopened,label)
			if saved_layer==null or saved_layer.colormap.get_data()!=original_layer.colormap.get_data():
				fail("Native hand indices changed: "+direction+" "+side);return
			var image: Image=PixelPenCPP.get_image(reopened.palette.color_index,saved_layer.colormap,false)
			image.convert(Image.FORMAT_RGBA8)
			var output := ROOT+"/"+direction+"/hand_"+side+".png"
			var previous := Image.load_from_file(output)
			previous.convert(Image.FORMAT_RGBA8)
			if image.get_size()!=previous.get_size() or image.get_data()!=previous.get_data():
				fail("Hand RGBA changed: "+direction+" "+side);return
			var temporary := "res://.runtime/hybrid-hand-export/"+direction+"_"+side+".png"
			if image.save_png(temporary)!=OK:fail("Hand PNG export failed: "+direction+" "+side);return
			var expected_sha := FileAccess.get_sha256(output)
			if FileAccess.get_sha256(temporary)!=expected_sha:
				fail("Hand PNG encoding differs from the existing file: "+direction+" "+side);return
			if DirAccess.copy_absolute(ProjectSettings.globalize_path(temporary),ProjectSettings.globalize_path(output))!=OK:
				fail("Could not publish the identical hand PNG: "+direction+" "+side);return
			DirAccess.remove_absolute(ProjectSettings.globalize_path(temporary))
			var part: Dictionary=manifest.directions[direction].parts["hand_"+side]
			part.nativeSource=path
			part["native_source_sha256"]=row.source_sha256
			part["output_sha256"]=expected_sha
			part["native_reopened_matches"]=true
			part["png_byte_identical"]=true
			row.outputs["hand_"+side]={"png":output,"sha256":expected_sha,"rgba_identical":true,"png_byte_identical":true,"native_indices_identical":true}
		report[direction]=row
	# Registration is switched only after all sixteen PNGs match exactly.
	manifest["source_policy"]="Each hands.pxpen contains one frame and only hand_l__skin / hand_r__skin. No old body, face, hair, clothes, footwear or cached frames remain."
	manifest["source_extraction"]={"tool":"res://tools/characters/hybrid_v1/extract_hand_sources.gd","directions":8,"pngs":16,"all_png_bytes_unchanged":true,"native_sources_reopened":true}
	var registration := FileAccess.open(ROOT+"/manifest.json",FileAccess.WRITE)
	if registration==null:fail("Could not save updated hand registration");return
	registration.store_string(JSON.stringify(manifest,"  ")+"\n");registration.close()
	var proof := FileAccess.open(ROOT+"/source-extraction.json",FileAccess.WRITE)
	if proof==null:fail("Could not save extraction evidence");return
	proof.store_string(JSON.stringify({"schema_version":1,"art_modified":false,"pngs_byte_identical":16,"source_frames_per_direction":1,"source_layers":LAYERS,"directions":report},"  ")+"\n");proof.close()
	# Exact non-recursive deletions stay inside the approved hand source directory.
	var allowed_root := ProjectSettings.globalize_path(ROOT).simplify_path()+"/"
	for direction: String in DIRECTIONS:
		var obsolete := ProjectSettings.globalize_path(ROOT+"/"+direction+"/parts.pxpen").simplify_path()
		if not obsolete.begins_with(allowed_root):fail("Hand source deletion escaped its approved directory");return
		if DirAccess.remove_absolute(obsolete)!=OK:fail("Could not remove superseded hand source: "+direction);return
	print("HYBRID_HAND_SOURCES_OK directions=8 native_layers=2 old_body_layers=0 png_bytes_identical=16")
	quit(0)

func make_document(source: PixelPenProject,direction: String,path: String) -> PixelPenProject:
	var doc := PixelPenProject.new()
	doc.compatibility_version=PixelPenProject.COMPATIBILITY_NUMBER
	doc.project_name="Hybrid v1 · hands · "+direction.to_upper()
	doc.file_path=path;doc.canvas_size=source.canvas_size
	doc.symetric_guid=source.symetric_guid
	doc.palette=source.palette.duplicate(true)
	var frame := Frame.create(doc.get_uid())
	doc.pool_frames.append(frame);doc.canvas_pool_frame_uid=frame.frame_uid
	var cell := AnimationCell.create(doc.get_uid());cell.frame=frame
	doc.animation_timeline.append(cell);doc.animation_frame_index=0;doc.animation_fps=8.0
	for label: String in LAYERS:
		var original := find_layer(source,label)
		var uid := doc.add_layer(label)
		var saved := doc.get_index_image(uid)
		saved.colormap=original.colormap.duplicate();saved.visible=true
		doc.active_layer_uid=uid;frame.layer_active_uid=uid
	return doc

func find_layer(doc: PixelPenProject,label: String) -> IndexedColorImage:
	for layer: IndexedColorImage in doc.pool_frames[0].layers:
		if layer.label==label:return layer
	return null

func fail(message: String) -> void:
	push_error(message);quit(1)
