@tool
extends RefCounted
## Explicit editor authoring capture. Does not run the gameplay scene.
const DIRECTIONS: Array[String]=["s","se","e","ne","n","nw","w","sw"]
const POSES: Array[String]=["neutral","run_000","run_025","run_050","run_075"]
const SIZE := Vector2i(96,104)

func export_review(parent: Node,destination: String,builder: Callable,include_boots: bool=true) -> Dictionary:
	if not is_instance_valid(parent) or not parent.is_inside_tree():return {"ok":false,"error":"Existing editor tree required"}
	if not builder.is_valid():return {"ok":false,"error":"Stage builder missing"}
	if DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(destination))!=OK:return {"ok":false,"error":"Output folder creation failed"}
	var sheet := Image.create(SIZE.x*8,SIZE.y*5,false,Image.FORMAT_RGBA8)
	sheet.fill(Color.TRANSPARENT)
	var files: Array[String]=[]
	for pose_index in 5:
		var folder := destination.path_join(POSES[pose_index])
		DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(folder))
		for direction_index in 8:
			var stage: SubViewport=builder.call(parent,direction_index,pose_index,false,include_boots)
			if stage==null:return {"ok":false,"error":"Stage creation failed: "+DIRECTIONS[direction_index],"files":files}
			stage.name="LegExport_"+str(pose_index)+"_"+str(direction_index)
			stage.render_target_update_mode=SubViewport.UPDATE_ONCE
			await parent.get_tree().process_frame
			if not is_instance_valid(parent) or not is_instance_valid(stage):return {"ok":false,"error":"Review scene closed during export","files":files}
			if Engine.is_editor_hint():
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
			var path:=folder.path_join(DIRECTIONS[direction_index]+".png")
			if image.save_png(ProjectSettings.globalize_path(path))!=OK:return {"ok":false,"error":"PNG save failed: "+path,"files":files}
			files.append(path)
			sheet.blit_rect(image,Rect2i(Vector2i.ZERO,SIZE),Vector2i(direction_index*SIZE.x,pose_index*SIZE.y))
	var contact_path:=destination.path_join("contact-sheet.png")
	sheet.save_png(ProjectSettings.globalize_path(contact_path));files.append(contact_path)
	for background: String in ["light","dark"]:
		var board:=Image.create(sheet.get_width(),sheet.get_height(),false,Image.FORMAT_RGBA8)
		board.fill(Color("e4dedd") if background=="light" else Color("283341"))
		board.blend_rect(sheet,Rect2i(Vector2i.ZERO,sheet.get_size()),Vector2i.ZERO)
		var path:=destination.path_join("comparison-"+background+".png")
		board.resize(board.get_width()*2,board.get_height()*2,Image.INTERPOLATE_NEAREST)
		board.save_png(ProjectSettings.globalize_path(path));files.append(path)
	var focus := Image.create(SIZE.x*3,SIZE.y*2,false,Image.FORMAT_RGBA8)
	focus.fill(Color("e4dedd"))
	var focus_directions: Array[int]=[0,2,4]
	var focus_poses: Array[int]=[0,2]
	for row in 2:
		for column in 3:
			focus.blend_rect(sheet,Rect2i(Vector2i(focus_directions[column]*SIZE.x,focus_poses[row]*SIZE.y),SIZE),Vector2i(column*SIZE.x,row*SIZE.y))
	focus.resize(focus.get_width()*3,focus.get_height()*3,Image.INTERPOLATE_NEAREST)
	var focus_path:=destination.path_join("focus-neutral-run025.png")
	focus.save_png(ProjectSettings.globalize_path(focus_path));files.append(focus_path)
	var manifest:={"status":"exported","runtime_verified":false,"visual_approval":"pending","renderer":"whole original leg texture + Polygon2D + two Bone2D weights","shared_motion":"res://art/characters/hybrid-v1/shared-run.json","motion_transfer":"left-leg projected angle and foreshortening relative to neutral; source proportions retained","directions_left_to_right":DIRECTIONS,"poses_top_to_bottom":POSES,"native_viewport":[96,104],"mesh_overlay_included":false,"boots_included":include_boots,"bone_editor_gizmos_included":false,"focus":{"directions":["s","e","n"],"rows":["neutral","run_025"],"nearest_scale":3},"files":files}
	var handle:=FileAccess.open(destination.path_join("review-manifest.json"),FileAccess.WRITE)
	if handle==null:return {"ok":false,"error":"Manifest write failed","files":files}
	handle.store_string(JSON.stringify(manifest,"\t"));handle.close()
	return {"ok":true,"directory":destination,"files":files}
