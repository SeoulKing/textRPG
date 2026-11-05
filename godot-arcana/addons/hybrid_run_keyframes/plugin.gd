@tool
extends EditorPlugin
## Editor-only save bridge. The game loads the same external library directly.
const EDITOR_SCENE := "res://scenes/characters/hybrid-v1/run-keyframes.tscn"
const LIBRARY_PATH := "res://art/characters/hybrid-v1/run-keyframes.tres"

var _toolbar: HBoxContainer
var _editor_root: Node
var _observed_animation: Animation
var _dirty := false

func _enter_tree() -> void:
	_toolbar = HBoxContainer.new()
	_toolbar.name = "HybridRunKeyframesToolbar"
	var title := Label.new()
	title.text = "달리기 키 · "
	_toolbar.add_child(title)
	_add_button("현재 위치 키 기록", _record_current_pose, "현재 타임라인 위치에 모든 달리기 채널의 키를 넣습니다. Ctrl+Z로 취소할 수 있습니다.")
	_add_button("0초→끝 복사", _copy_first_pose_to_end, "0초 자세를 마지막 시간에 복사해 루프를 맞춥니다. Ctrl+Z로 취소할 수 있습니다.")
	_add_button("달리기 저장", _save_from_toolbar, "씬과 외부 달리기 애니메이션을 저장합니다. Ctrl+S도 같은 저장 흐름을 사용합니다.")
	add_control_to_container(CONTAINER_CANVAS_EDITOR_MENU, _toolbar)
	_toolbar.hide()
	scene_changed.connect(_on_scene_changed)
	call_deferred("_on_scene_changed", EditorInterface.get_edited_scene_root())

func _exit_tree() -> void:
	if scene_changed.is_connected(_on_scene_changed):
		scene_changed.disconnect(_on_scene_changed)
	_disconnect_animation()
	if is_instance_valid(_toolbar):
		remove_control_from_container(CONTAINER_CANVAS_EDITOR_MENU, _toolbar)
		_toolbar.queue_free()

func _add_button(label: String, callback: Callable, help: String) -> void:
	var button := Button.new()
	button.text = label
	button.tooltip_text = help
	button.focus_mode = Control.FOCUS_NONE
	button.pressed.connect(callback)
	_toolbar.add_child(button)

func _is_run_editor(scene: Node) -> bool:
	return is_instance_valid(scene) and scene.has_method("is_hybrid_run_editor") and bool(scene.call("is_hybrid_run_editor"))

func _on_scene_changed(scene: Node) -> void:
	var active := _is_run_editor(scene)
	if is_instance_valid(_toolbar):
		_toolbar.visible = active
	if not active:
		return
	_editor_root = scene
	var animation: Animation = scene.call("get_run_animation") as Animation
	if animation != _observed_animation:
		_disconnect_animation()
		_observed_animation = animation
		if animation != null:
			animation.changed.connect(_on_animation_changed)

func _disconnect_animation() -> void:
	if is_instance_valid(_observed_animation) and _observed_animation.changed.is_connected(_on_animation_changed):
		_observed_animation.changed.disconnect(_on_animation_changed)
	_observed_animation = null

func _on_animation_changed() -> void:
	_dirty = true

func _status(message: String) -> void:
	if _is_run_editor(_editor_root) and _editor_root.has_method("set_editor_status"):
		_editor_root.call("set_editor_status", message)
	else:
		print("[달리기 키] ", message)

func _record_current_pose() -> void:
	var scene: Node = EditorInterface.get_edited_scene_root()
	if not _is_run_editor(scene):
		return
	_on_scene_changed(scene)
	var animation: Animation = scene.call("get_run_animation") as Animation
	if animation == null:
		_status("달리기 애니메이션을 찾을 수 없습니다.")
		return
	var values: Dictionary = scene.call("collect_pose_deltas")
	if values.is_empty():
		_status("기록할 달리기 컨트롤이 없습니다.")
		return
	var at_time := clampf(float(scene.call("current_key_time")), 0.0, animation.length)
	var before := animation.duplicate(true) as Animation
	var after := animation.duplicate(true) as Animation
	for channel: Variant in values:
		var track := after.find_track(NodePath(str(channel)), Animation.TYPE_VALUE)
		if track < 0:
			_status("기록할 트랙이 없습니다: " + str(channel))
			return
		after.track_insert_key(track, at_time, values[channel])
	_commit_animation("달리기 현재 자세 키 기록", animation, before, after)
	_status("%.3f초에 %d개 채널의 키를 기록했습니다. Ctrl+S로 저장하세요." % [at_time, values.size()])

func _copy_first_pose_to_end() -> void:
	var scene: Node = EditorInterface.get_edited_scene_root()
	if not _is_run_editor(scene):
		return
	_on_scene_changed(scene)
	var animation: Animation = scene.call("get_run_animation") as Animation
	if animation == null:
		return
	var before := animation.duplicate(true) as Animation
	var after := animation.duplicate(true) as Animation
	for track in range(after.get_track_count()):
		if after.track_get_type(track) != Animation.TYPE_VALUE or after.track_get_key_count(track) == 0:
			continue
		var value: Variant = after.value_track_interpolate(track, 0.0)
		after.track_insert_key(track, after.length, value)
	_commit_animation("달리기 처음 자세를 끝에 복사", animation, before, after)
	_status("0초 자세를 %.3f초 끝 키에 복사했습니다. Ctrl+S로 저장하세요." % animation.length)

func _commit_animation(title: String, animation: Animation, before: Animation, after: Animation) -> void:
	var history := get_undo_redo()
	# An external .tres normally belongs to global history. Associate these
	# authoring operations with the open run scene so ordinary Ctrl+Z finds them.
	var context: Object = _editor_root if _is_run_editor(_editor_root) else animation
	history.create_action(title, UndoRedo.MERGE_DISABLE, context)
	history.add_do_method(self, "_restore_animation", animation, after)
	history.add_undo_method(self, "_restore_animation", animation, before)
	history.commit_action()

func _restore_animation(animation: Animation, snapshot: Animation) -> void:
	# Retain resource identity so AnimationPlayer, native timeline and runtime
	# samplers all keep seeing the same object after key recording and Undo/Redo.
	animation.clear()
	animation.length = snapshot.length
	animation.step = snapshot.step
	animation.loop_mode = snapshot.loop_mode
	animation.resource_name = snapshot.resource_name
	for track in range(snapshot.get_track_count()):
		snapshot.copy_track(track, animation)
	for marker: StringName in snapshot.get_marker_names():
		animation.add_marker(marker, snapshot.get_marker_time(marker))
		animation.set_marker_color(marker, snapshot.get_marker_color(marker))
	animation.emit_changed()
	_dirty = true
	if _is_run_editor(_editor_root):
		var at_time := float(_editor_root.call("current_key_time"))
		var player := _editor_root.get_node_or_null("AnimationPlayer") as AnimationPlayer
		if player != null and player.has_animation("run"):
			player.assigned_animation = "run"
			player.seek(at_time, true)
		_editor_root.call("refresh_pose")

func _save_from_toolbar() -> void:
	if not _is_run_editor(EditorInterface.get_edited_scene_root()):
		return
	# The native save invokes _save_external_data after persisting the scene.
	var result := EditorInterface.save_scene()
	if result != OK:
		_status("씬 저장에 실패했습니다: " + error_string(result))

func _save_external_data() -> void:
	var current := EditorInterface.get_edited_scene_root()
	if _is_run_editor(current):
		_on_scene_changed(current)
	if not _is_run_editor(_editor_root):
		return
	var library: AnimationLibrary = _editor_root.call("get_run_library") as AnimationLibrary
	if library == null or not library.has_animation("run"):
		_status("저장할 달리기 라이브러리가 없습니다.")
		return
	var result := ResourceSaver.save(library, LIBRARY_PATH)
	if result != OK:
		_dirty = true
		_status("달리기 저장에 실패했습니다: " + error_string(result))
		push_error("Hybrid run library save failed: " + error_string(result))
		return
	_dirty = false
	_status("달리기 키를 저장했습니다. 본편을 다시 실행하면 8방향에 반영됩니다. 웹은 다시 내보내야 합니다.")

func _get_unsaved_status(for_scene: String) -> String:
	if not _dirty:
		return ""
	if for_scene.is_empty() or for_scene == EDITOR_SCENE:
		return "달리기 키 변경 내용을 저장하시겠습니까?"
	return ""
