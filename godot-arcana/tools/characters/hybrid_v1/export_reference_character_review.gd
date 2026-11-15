@tool
extends RefCounted
## Explicit authoring capture inside the existing editor. No gameplay launch.
const DIRECTIONS: Array[String]=["s","se","e","ne","n","nw","w","sw"]
const POSES: Array[String]=["neutral","run_000","run_025","run_050","run_075"]
const NATIVE := Vector2i(320,180)
const CROP := Rect2i(104,8,112,164)

func export_review(parent: Node,destination: String,builder: Callable) -> Dictionary:
	if not is_instance_valid(parent) or not parent.is_inside_tree():return {"ok":false,"error":"Existing editor tree required"}
	if not builder.is_valid():return {"ok":false,"error":"Stage builder missing"}
	if DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(destination))!=OK:return {"ok":false,"error":"Output folder creation failed"}
	var sheet := Image.create(CROP.size.x*8,CROP.size.y*5,false,Image.FORMAT_RGBA8)
	sheet.fill(Color.TRANSPARENT)
	var files: Array[String]=[]
	var bounds := {}
	var framing_issues: Array[String]=[]
	for pose_index in 5:
		var folder := destination.path_join(POSES[pose_index])
		DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(folder))
		for direction_index in 8:
			var stage: SubViewport=builder.call(parent,direction_index,pose_index,false)
			if stage==null:return {"ok":false,"error":"Stage creation failed: "+DIRECTIONS[direction_index],"files":files}
			if parent.has_meta("match_editor_raw_sources"):_use_editor_raw_sources(stage)
			stage.name="ReferenceCharacterExport_"+str(pose_index)+"_"+str(direction_index)
			stage.render_target_update_mode=SubViewport.UPDATE_ONCE
			await parent.get_tree().process_frame
			if not is_instance_valid(parent) or not is_instance_valid(stage):return {"ok":false,"error":"Review scene closed during export","files":files}
			if Engine.is_editor_hint() or parent.has_meta("offline_gpu_authoring"):
				RenderingServer.force_draw(false)
				stage.render_target_update_mode=SubViewport.UPDATE_ONCE
				RenderingServer.force_draw(false)
			else:
				await RenderingServer.frame_post_draw
			var image := stage.get_texture().get_image()
			parent.remove_child(stage)
			stage.queue_free()
			if image==null or image.is_empty():return {"ok":false,"error":"Empty GPU image","files":files}
			image.convert(Image.FORMAT_RGBA8)
			if image.get_size()!=NATIVE:return {"ok":false,"error":"Unexpected native viewport size","files":files}
			var used := image.get_used_rect()
			if used.size==Vector2i.ZERO:return {"ok":false,"error":"No rendered character pixels: "+DIRECTIONS[direction_index],"files":files}
			var frame_key: String=POSES[pose_index]+"/"+DIRECTIONS[direction_index]
			bounds[frame_key]=[used.position.x,used.position.y,used.size.x,used.size.y]
			if not CROP.encloses(used):framing_issues.append(frame_key)
			var path:=folder.path_join(DIRECTIONS[direction_index]+".png")
			if image.save_png(ProjectSettings.globalize_path(path))!=OK:return {"ok":false,"error":"PNG save failed: "+path,"files":files}
			files.append(path)
			sheet.blit_rect(image,CROP,Vector2i(direction_index*CROP.size.x,pose_index*CROP.size.y))
	var contact:=destination.path_join("contact-sheet.png")
	sheet.save_png(ProjectSettings.globalize_path(contact));files.append(contact)
	for background: String in ["light","dark"]:
		var board:=_background(sheet,background)
		board.resize(board.get_width()*2,board.get_height()*2,Image.INTERPOLATE_NEAREST)
		var path:=destination.path_join("comparison-"+background+".png")
		board.save_png(ProjectSettings.globalize_path(path));files.append(path)
	var neutral:=Image.create(CROP.size.x*4,CROP.size.y*2,false,Image.FORMAT_RGBA8)
	neutral.fill(Color("e4dedd"))
	for index in 8:neutral.blend_rect(sheet,Rect2i(Vector2i(index*CROP.size.x,0),CROP.size),Vector2i(index%4*CROP.size.x,index/4*CROP.size.y))
	neutral.resize(neutral.get_width()*2,neutral.get_height()*2,Image.INTERPOLATE_NEAREST)
	var neutral_path:=destination.path_join("neutral-8dir.png")
	neutral.save_png(ProjectSettings.globalize_path(neutral_path));files.append(neutral_path)
	var focus:=Image.create(CROP.size.x*3,CROP.size.y*2,false,Image.FORMAT_RGBA8)
	focus.fill(Color("e4dedd"))
	var focus_indices: Array[int]=[0,2,4]
	var focus_poses: Array[int]=[0,2]
	for row in 2:
		for column in 3:focus.blend_rect(sheet,Rect2i(Vector2i(focus_indices[column]*CROP.size.x,focus_poses[row]*CROP.size.y),CROP.size),Vector2i(column*CROP.size.x,row*CROP.size.y))
	focus.resize(focus.get_width()*3,focus.get_height()*3,Image.INTERPOLATE_NEAREST)
	var focus_path:=destination.path_join("focus-neutral-run025.png")
	focus.save_png(ProjectSettings.globalize_path(focus_path));files.append(focus_path)
	var neighbors:=Image.create(CROP.size.x*3,CROP.size.y,false,Image.FORMAT_RGBA8)
	neighbors.fill(Color("e4dedd"))
	for column in 3:
		var index: int=[6,5,4][column]
		neighbors.blend_rect(sheet,Rect2i(Vector2i(index*CROP.size.x,2*CROP.size.y),CROP.size),Vector2i(column*CROP.size.x,0))
	neighbors.resize(neighbors.get_width()*3,neighbors.get_height()*3,Image.INTERPOLATE_NEAREST)
	var neighbor_path:=destination.path_join("focus-wnwn-run025.png")
	neighbors.save_png(ProjectSettings.globalize_path(neighbor_path));files.append(neighbor_path)
	var cycle_result: Dictionary=await _export_motion_cycle(parent,destination,builder)
	if not cycle_result.get("ok",false):return cycle_result
	for cycle_path: String in cycle_result.files:files.append(cycle_path)
	var manifest:={"status":"exported","runtime_verified":false,"visual_approval":"pending","renderer":"full new parts + shared real Skeleton3D + weighted Polygon2D upper body and legs","bundle":"res://art/characters/hybrid-v1/assembly/parts.json","shared_motion":"res://art/characters/hybrid-v1/shared-run.json","directions_left_to_right":DIRECTIONS,"poses_top_to_bottom":POSES,"native_viewport":[320,180],"contact_sheet_crop":[104,8,112,164],"joint_overlay_included":false,"extra_outline_included":false,"files":files}
	manifest["motion_polish_enabled"]=bool(parent.get("motion_polish"))
	manifest["cycle_preview"]=cycle_result.manifest
	manifest["authoring_context"]="dedicated offscreen GPU SceneTree with raw PNG capture sources" if parent.has_meta("offline_gpu_authoring") else "existing Godot editor"
	manifest["bundle_sha256"]=FileAccess.get_sha256(str(manifest.bundle))
	manifest["shared_motion_sha256"]=FileAccess.get_sha256(str(manifest.shared_motion))
	manifest["alpha_bounds_native"]=bounds
	manifest["outside_contact_crop"]=framing_issues
	var profile_path := "res://art/characters/hybrid-v1/assembly/assembly.json"
	if FileAccess.file_exists(profile_path):
		manifest["assembly_profile"]=profile_path
		manifest["assembly_profile_sha256"]=FileAccess.get_sha256(profile_path)
	var handle:=FileAccess.open(destination.path_join("review-manifest.json"),FileAccess.WRITE)
	if handle==null:return {"ok":false,"error":"Manifest write failed","files":files}
	handle.store_string(JSON.stringify(manifest,"\t"));handle.close()
	return {"ok":true,"directory":destination,"files":files}

func _export_motion_cycle(parent: Node,destination: String,builder: Callable) -> Dictionary:
	# Two temporary actors share exact phase/camera settings. Source PNGs and
	# native UV/weights remain untouched; only motion_polish differs.
	var stages := {}
	var actors := {}
	var files: Array[String]=[]
	var samples: Array[Dictionary]=[]
	var cycle_seconds := 0.64
	for variant: String in ["before","after"]:
		var stage: SubViewport=builder.call(parent,2,1,false)
		if stage==null:return {"ok":false,"error":"Cannot create motion cycle stage: "+variant}
		stage.name="MotionCycle_"+variant
		if parent.has_meta("match_editor_raw_sources"):_use_editor_raw_sources(stage)
		var actor: Node=stage.get_node_or_null("ReferenceWorld/ReferenceCharacter")
		if actor==null:
			parent.remove_child(stage);stage.queue_free()
			return {"ok":false,"error":"Motion cycle actor missing"}
		actor.set("motion_polish",variant=="after")
		stages[variant]=stage;actors[variant]=actor
		cycle_seconds=float(actor.get("source").duration)
		DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(destination.path_join("motion-cycle/"+variant)))
	for index in 16:
		var phase := float(index)/16.0
		for variant: String in ["before","after"]:
			var actor: Node=actors[variant]
			if not actor.apply_pose(phase,1.0,PI*0.5,Vector3.ZERO,2):
				_cleanup_cycle(parent,stages)
				return {"ok":false,"error":"Motion cycle pose failed: "+variant}
			(stages[variant] as SubViewport).render_target_update_mode=SubViewport.UPDATE_ONCE
		await parent.get_tree().process_frame
		if not is_instance_valid(parent):return {"ok":false,"error":"Review scene closed during motion cycle"}
		if Engine.is_editor_hint() or parent.has_meta("offline_gpu_authoring"):
			RenderingServer.force_draw(false)
			for stage: SubViewport in stages.values():stage.render_target_update_mode=SubViewport.UPDATE_ONCE
			RenderingServer.force_draw(false)
		else:await RenderingServer.frame_post_draw
		var sample := {"phase":phase}
		for variant: String in ["before","after"]:
			var image := (stages[variant] as SubViewport).get_texture().get_image()
			if image==null or image.is_empty():
				_cleanup_cycle(parent,stages)
				return {"ok":false,"error":"Empty motion cycle image: "+variant}
			image.convert(Image.FORMAT_RGBA8)
			var path:=destination.path_join("motion-cycle/"+variant+"/e_%02d.png"%index)
			if image.save_png(ProjectSettings.globalize_path(path))!=OK:
				_cleanup_cycle(parent,stages)
				return {"ok":false,"error":"Could not save motion cycle image: "+path}
			files.append(path)
			var metrics: Variant=(actors[variant] as Node).get("motion_metrics")
			sample[variant]=metrics.duplicate(true) if metrics is Dictionary else {}
		samples.append(sample)
	_cleanup_cycle(parent,stages)
	var cycle_manifest := {"direction":"e","frames_per_cycle":16,"source_cycle_seconds":cycle_seconds,"preview_playback_speed":0.5,"comparison":"same sources, camera and phase; motion_polish false then true","native_viewport":[320,180],"crop":[104,8,112,164],"metrics_are_production_pose_captures":true,"samples":samples,"files":files}
	var metrics_path:=destination.path_join("motion-cycle/manifest.json")
	var handle:=FileAccess.open(metrics_path,FileAccess.WRITE)
	if handle==null:return {"ok":false,"error":"Could not save cycle metrics"}
	handle.store_string(JSON.stringify(cycle_manifest,"\t"));handle.close();files.append(metrics_path)
	return {"ok":true,"manifest":{"metrics_path":metrics_path,"frames_per_cycle":16,"source_cycle_seconds":cycle_seconds,"preview_playback_speed":0.5},"files":files}

func _cleanup_cycle(parent: Node,stages: Dictionary) -> void:
	for stage: SubViewport in stages.values():
		if is_instance_valid(stage):
			if stage.get_parent()==parent:parent.remove_child(stage)
			stage.queue_free()

func export_neutral_appearance(parent: Node,destination: String,builder: Callable) -> Dictionary:
	# Minimal same-runtime-context appearance check. This never compares an
	# offscreen framebuffer against a previous editor framebuffer.
	var files: Array[String]=[]
	for direction_index: int in [0,2,4]:
		for variant: String in ["before","after"]:
			var stage: SubViewport=builder.call(parent,direction_index,0,false)
			if stage==null:return {"ok":false,"error":"Neutral appearance stage failed"}
			var actor: Node=stage.get_node("ReferenceWorld/ReferenceCharacter")
			actor.set("motion_polish",variant=="after")
			if not actor.apply_pose(0.0,0.0,float(direction_index)*TAU/8.0,Vector3.ZERO,direction_index):
				parent.remove_child(stage);stage.queue_free()
				return {"ok":false,"error":"Neutral appearance pose failed"}
			stage.render_target_update_mode=SubViewport.UPDATE_ONCE
			await parent.get_tree().process_frame
			RenderingServer.force_draw(false)
			stage.render_target_update_mode=SubViewport.UPDATE_ONCE
			RenderingServer.force_draw(false)
			var image:=stage.get_texture().get_image()
			parent.remove_child(stage);stage.queue_free()
			if image==null:return {"ok":false,"error":"Empty neutral appearance image"}
			image.convert(Image.FORMAT_RGBA8)
			var folder:=destination.path_join("neutral-same-context/"+variant)
			DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(folder))
			var path:=folder.path_join(DIRECTIONS[direction_index]+".png")
			if image.save_png(ProjectSettings.globalize_path(path))!=OK:return {"ok":false,"error":"Neutral image save failed"}
			files.append(path)
	return {"ok":true,"context":"same dedicated GPU runtime with unchanged runtime import settings","mode":"weight zero; motion_polish false versus true","files":files}

func _use_editor_raw_sources(stage: SubViewport) -> void:
	# Engine.is_editor_hint() is false in the dedicated authoring helper. Match
	# the editor's raw-PNG texture path instead of runtime import compression;
	# this affects these temporary captures only, not source art/import settings.
	var actor: Node=stage.get_node_or_null("ReferenceWorld/ReferenceCharacter")
	if actor==null:return
	var cache: Dictionary=actor.get("_cache")
	var bundle: Dictionary=actor.get("data")
	for direction: String in cache:
		var entry: Dictionary=cache[direction]
		entry.head.texture=_raw_texture(str(bundle.parts.head.png_template).replace("{direction}",direction))
		entry.pelvis.texture=_raw_texture(str(bundle.parts.pelvis.png_template).replace("{direction}",direction))
		entry.upper.polygon.texture=_raw_texture("res://art/characters/hybrid-v1/assembly/upper-body-assembly/"+direction+".png")
		for side: String in ["l","r"]:
			entry.legs[side].rig.polygon.texture=_raw_texture(str(bundle.parts.legs.png_template).replace("{direction}",direction))
			entry.boots[side].texture=_raw_texture(str(bundle.parts.boots.png_template).replace("{direction}",direction))
			var hand: Dictionary=entry.hands[side]
			hand.sprite.texture=_raw_texture(str(hand.info.get("texture","")))

func _raw_texture(path: String) -> Texture2D:
	if path.is_empty():return null
	var image:=Image.load_from_file(ProjectSettings.globalize_path(path))
	return ImageTexture.create_from_image(image) if image!=null else null

func _background(sheet: Image,background: String) -> Image:
	var board:=Image.create(sheet.get_width(),sheet.get_height(),false,Image.FORMAT_RGBA8)
	board.fill(Color("e4dedd") if background=="light" else Color("283341"))
	board.blend_rect(sheet,Rect2i(Vector2i.ZERO,sheet.get_size()),Vector2i.ZERO)
	return board
