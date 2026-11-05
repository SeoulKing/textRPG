extends SceneTree
## Initial editor-scene authoring only; never overwrite an artist-edited scene.
const RunClip = preload("res://scripts/characters/hybrid_v1/run_keyframe_clip.gd")
const TARGET := "res://scenes/characters/hybrid-v1/run-keyframes.tscn"

func _initialize() -> void: call_deferred("_author")

func _author() -> void:
	if FileAccess.file_exists(TARGET):
		print("RUN_KEYFRAME_EDITOR_PRESERVED ", TARGET)
		quit()
		return
	var source: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://art/characters/hybrid-v1/shared-run.json"))
	var clip := RunClip.new()
	if not clip.setup(source.neutral):
		push_error(clip.last_error); quit(1); return
	clip.animation.step = 0.016
	for entry in [["시작",0.0],["25%",0.16],["50%",0.32],["75%",0.48],["끝",0.64]]:
		if not clip.animation.has_marker(entry[0]): clip.animation.add_marker(entry[0],entry[1])
	if ResourceSaver.save(clip.library, RunClip.DEFAULT_PATH) != OK:
		push_error("Cannot save the initial run timeline grid"); quit(1); return
	var scene_root := Node2D.new()
	scene_root.name = "RunKeyframes"
	scene_root.scale = Vector2(2,2)
	scene_root.set_script(load("res://scripts/characters/hybrid_v1/run_keyframe_editor.gd"))
	var pose := Node2D.new()
	pose.name = "Pose"
	pose.z_index = 10
	scene_root.add_child(pose); pose.owner = scene_root
	var advanced := Node2D.new()
	advanced.name = "고급"
	advanced.visible = false
	pose.add_child(advanced); advanced.owner = scene_root
	var values := RunClip.pose_to_deltas(clip.sample(0.0), source.neutral)
	for channel: Dictionary in RunClip.channel_specs():
		var path := NodePath(str(channel.node_path))
		var control := Node2D.new()
		control.name = str(path.get_name(path.get_name_count()-1))
		control.set_script(load("res://scripts/characters/hybrid_v1/run_pose_handle.gd"))
		control.handle_label = str(channel.label)
		control.handle_color = Color("ffcb7a") if str(channel.node_path).begins_with("오른") else Color("82d6ff")
		var parent: Node = advanced if path.get_name_count()>1 else pose
		parent.add_child(control); control.owner = scene_root
		control.set(str(channel.property), values[str(channel.path)])
	var player := AnimationPlayer.new()
	player.name = "AnimationPlayer"
	player.root_node = NodePath("../Pose")
	player.add_animation_library("", clip.library)
	player.assigned_animation = "run"
	scene_root.add_child(player); player.owner = scene_root
	var packed := PackedScene.new()
	var error := packed.pack(scene_root)
	if error == OK: error = ResourceSaver.save(packed, TARGET)
	scene_root.free()
	if error != OK:
		push_error("Cannot create run editor scene: "+error_string(error)); quit(1); return
	print("RUN_KEYFRAME_EDITOR_CREATED ",TARGET)
	quit()
