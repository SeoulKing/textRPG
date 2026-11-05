extends SceneTree
## Saves native editable whole-leg Polygon2D/Skeleton2D scenes. Never slices
## thigh/shin pictures, downsamples textures or overwrites manual scene edits.
const Rig = preload("res://scripts/characters/hybrid_v1/leg_polygon.gd")
const BASE := "res://art/characters/hybrid-v1/legs"
const TARGET := "res://art/characters/hybrid-v1/rigs/legs"
const DIRS := ["s","se","e","ne","n","nw","w","sw"]

func _initialize() -> void:
	call_deferred("_build")

func _build() -> void:
	var parsed: Variant=JSON.parse_string(FileAccess.get_file_as_string(BASE+"/manifest.json"))
	if not parsed is Dictionary or not parsed.get("directions") is Dictionary:
		_abort("Missing whole-leg manifest");return
	for direction: String in DIRS:
		var entry: Variant=parsed.directions.get(direction)
		if not entry is Dictionary or not entry.get("joints") is Dictionary or not entry.get("texture_rect") is Array or entry.texture_rect.size()!=4:
			_abort("Missing logical joints/texture_rect: "+direction);return
		if not FileAccess.file_exists(str(entry.get("png",BASE+"/"+direction+"/leg.png"))):
			_abort("Missing original whole-leg texture: "+direction);return
	DirAccess.make_dir_recursive_absolute(TARGET)
	var refresh_own := OS.get_cmdline_user_args().has("--refresh-own-draft")
	if refresh_own:
		var previous: Variant=JSON.parse_string(FileAccess.get_file_as_string(BASE+"/polygon-scenes.json"))
		if not previous is Dictionary or not previous.get("directions") is Dictionary:
			_abort("Own-draft refresh requires the previous scene hash report");return
		for direction: String in DIRS:
			var path := TARGET+"/"+direction+".tscn"
			if FileAccess.file_exists(path) and FileAccess.get_sha256(path)!=str(previous.directions.get(direction,{}).get("scene_sha256","")):
				_abort("Refusing to replace artist-edited leg scene: "+direction);return
	var report := {"schema_version":1,"source_manifest":BASE+"/manifest.json","source_manifest_sha256":FileAccess.get_sha256(BASE+"/manifest.json"),"scene_directory":TARGET,"existing_scenes_preserved":true,"texture_policy":"Original full-resolution leg crop; no thigh/shin split or palette conversion","directions":{}}
	for direction: String in DIRS:
		var path := TARGET+"/"+direction+".tscn"
		if FileAccess.file_exists(path) and not refresh_own:
			report.directions[direction]={"scene":path,"status":"preserved_existing","scene_sha256":FileAccess.get_sha256(path)}
			continue
		var entry: Dictionary=parsed.directions[direction]
		var values: Array=entry.texture_rect
		var rect := Rect2(float(values[0]),float(values[1]),float(values[2]),float(values[3]))
		var actor := Rig.new()
		actor.name="Leg_"+direction.to_upper()
		root.add_child(actor)
		if not actor.configure(direction,str(entry.get("png",BASE+"/"+direction+"/leg.png")),entry.joints,rect):
			_abort(actor.last_error);return
		var packed := PackedScene.new()
		if packed.pack(actor)!=OK:
			_abort("Native leg scene pack failed: "+direction);return
		if ResourceSaver.save(packed,path)!=OK:
			_abort("Native leg scene save failed: "+direction);return
		report.directions[direction]={"scene":path,"status":"created","scene_sha256":FileAccess.get_sha256(path),"texture":actor.texture_path,"vertices":actor.polygon.polygon.size(),"triangles":actor.polygon.polygons.size(),"native_bones":actor.polygon.get_bone_count(),"texture_count":1,"texture_rect":entry.texture_rect,"native_texture_size":[actor.polygon.texture.get_width(),actor.polygon.texture.get_height()]}
		actor.free()
	var file := FileAccess.open(BASE+"/polygon-scenes.json",FileAccess.WRITE)
	file.store_string(JSON.stringify(report,"\t"))
	print("WHOLE_LEG_NATIVE_SCENES_OK directions=8 original_textures_preserved=true")
	quit(0)

func _abort(message: String) -> void:
	push_error(message)
	quit(1)
