extends SceneTree
## Author native, editable Polygon2D/Skeleton2D scenes from the saved art set.
## Existing scenes are preserved so manual UV/weight/bone edits survive reruns.
const Rig = preload("res://scripts/characters/hybrid_v1/upper_body_polygon.gd")
const BASE := "res://art/characters/hybrid-v1/upper-body"
const TARGET := "res://art/characters/hybrid-v1/rigs/upper-body"
const DIRS := ["s","se","e","ne","n","nw","w","sw"]

func _initialize() -> void:
	call_deferred("_build")

func _build() -> void:
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(BASE+"/manifest.json"))
	if not parsed is Dictionary or not parsed.get("directions") is Dictionary:
		_abort("Missing upper-body manifest with directions");return
	for direction: String in DIRS:
		if not parsed.directions.get(direction) is Dictionary or not parsed.directions[direction].get("joints") is Dictionary:
			_abort("Missing source joints: "+direction);return
		if not FileAccess.file_exists(BASE+"/"+direction+"/upper_body.png"):
			_abort("Missing upper-body PNG: "+direction);return
	DirAccess.make_dir_recursive_absolute(TARGET)
	var refresh_own := OS.get_cmdline_user_args().has("--refresh-own-draft")
	if refresh_own:
		var previous: Variant=JSON.parse_string(FileAccess.get_file_as_string(BASE+"/polygon-scenes.json"))
		if not previous is Dictionary or not previous.get("directions") is Dictionary:
			_abort("Own-draft refresh requires the previous scene hash report");return
		for direction: String in DIRS:
			var path := TARGET+"/"+direction+".tscn"
			if FileAccess.file_exists(path) and FileAccess.get_sha256(path)!=str(previous.directions.get(direction,{}).get("scene_sha256","")):
				_abort("Refusing to replace manually changed native scene: "+direction);return
	var report := {"schema_version":1,"source_manifest":BASE+"/manifest.json","source_manifest_sha256":FileAccess.get_sha256(BASE+"/manifest.json"),"scene_directory":TARGET,"existing_scenes_preserved":true,"directions":{}}
	for direction: String in DIRS:
		var path := TARGET+"/"+direction+".tscn"
		if FileAccess.file_exists(path) and not refresh_own:
			report.directions[direction] = {"scene":path,"status":"preserved_existing","scene_sha256":FileAccess.get_sha256(path)}
			continue
		var actor := Rig.new()
		actor.name = "UpperBody_"+direction.to_upper()
		root.add_child(actor)
		if not actor.configure(direction,BASE+"/"+direction+"/upper_body.png",parsed.directions[direction].joints):
			_abort(actor.last_error);return
		var packed := PackedScene.new()
		var result := packed.pack(actor)
		if result!=OK:
			_abort("Native scene pack failed: "+direction);return
		result=ResourceSaver.save(packed,path)
		if result!=OK:
			_abort("Native scene save failed: "+direction);return
		report.directions[direction] = {"scene":path,"status":"created","scene_sha256":FileAccess.get_sha256(path),"texture":actor.texture_path,"vertices":actor.polygon.polygon.size(),"triangles":actor.polygon.polygons.size(),"native_bones":actor.polygon.get_bone_count(),"texture_count":1,"protected_trunk_detail_masks":["leather","metal","collar_trim"]}
		actor.free()
	var file := FileAccess.open(BASE+"/polygon-scenes.json",FileAccess.WRITE)
	file.store_string(JSON.stringify(report,"\t"))
	print("UPPER_BODY_NATIVE_SCENES_OK directions=8 existing_edits_preserved=true")
	quit(0)

func _abort(message: String) -> void:
	push_error(message)
	quit(1)
