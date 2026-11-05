@tool
extends Node2D
## Native AnimationPlayer keys edit the same shared run used by the game.
const RunClip = preload("res://scripts/characters/hybrid_v1/run_keyframe_clip.gd")
const Assembler = preload("res://scripts/characters/hybrid_v1/reference_character_assembler.gd")
const CameraSetup = preload("res://scripts/characters/hybrid_v1/camera_setup.gd")
const SOURCE := "res://art/characters/hybrid-v1/shared-run.json"
const BUNDLE := "res://art/characters/hybrid-v1/assembly/parts.json"
const PLUGIN := "hybrid_run_keyframes"
const CROP := Rect2i(104, 8, 112, 164)
const ZOOM := 3.0
const DIRECTIONS := ["S", "SE", "E", "NE", "N", "NW", "W", "SW"]
const PIVOTS := {
	"몸통_기울기":"hip", "고개_기울기":"neck",
	"왼팔_상박":"shoulder_l", "왼팔_전완":"elbow_l",
	"오른팔_상박":"shoulder_r", "오른팔_전완":"elbow_r",
	"왼다리_허벅지":"hip_l", "왼다리_정강이":"knee_l",
	"오른다리_허벅지":"hip_r", "오른다리_정강이":"knee_r",
	"왼발_회전":"ankle_l", "오른발_회전":"ankle_r"
}

@export_group("달리기 미리보기")
@export_enum("S", "SE", "E", "NE", "N", "NW", "W", "SW") var preview_direction := 2:
	set(value):
		preview_direction = value
		_refresh = true
@export var show_handles := true:
	set(value):
		show_handles = value
		_refresh = true
@export var show_reference_view := true:
	set(value):
		show_reference_view = value
		_refresh = true
@export_range(0.0, 10.0, 0.016, "suffix:s") var preview_time: float:
	get: return _cursor
	set(value):
		_cursor = maxf(0.0, value)
		if is_node_ready(): _seek_cursor()
@export_tool_button("달리기 저장 (Ctrl+S)", "Save") var save_keys_action: Callable = save_run_keys

var _cursor := 0.0
var _neutral: Dictionary = {}
var _stages: Array[Dictionary] = []
var _generated: Node2D
var _refresh := true
var _last_values: Dictionary = {}
var _status := "회전 수정 → 🔑 또는 현재 위치 키 기록 → Ctrl+S"
var _font: Font
var _selected_name := ""

func is_hybrid_run_editor() -> bool: return true

func get_run_library() -> AnimationLibrary:
	var player := get_node_or_null("AnimationPlayer") as AnimationPlayer
	return player.get_animation_library("") if player != null and player.has_animation_library("") else null

func get_run_animation() -> Animation:
	var library := get_run_library()
	return library.get_animation("run") if library != null and library.has_animation("run") else null

func current_key_time() -> float:
	var player := get_node_or_null("AnimationPlayer") as AnimationPlayer
	var animation := get_run_animation()
	if player == null or animation == null: return 0.0
	# The editor may stop playback while retaining the displayed pose.
	if player.current_animation.is_empty(): return clampf(_cursor, 0.0, animation.length)
	return clampf(player.current_animation_position, 0.0, animation.length)

func collect_pose_deltas() -> Dictionary:
	var values := {}
	for channel: Dictionary in RunClip.channel_specs():
		var control := get_node_or_null("Pose/" + str(channel.node_path)) as Node2D
		if control == null: return {}
		values[str(channel.path)] = control.get(str(channel.property))
	return values

func set_editor_status(message: String) -> void:
	_status = message
	queue_redraw()

func refresh_pose() -> void:
	_refresh = true
	queue_redraw()

func save_run_keys() -> void:
	if not Engine.is_editor_hint(): return
	var result := EditorInterface.save_scene()
	if result != OK: set_editor_status("씬 저장 실패: " + error_string(result))

func _ready() -> void:
	set_process(true)
	_font = load("res://fonts/NotoSansKR-Medium.tres") as Font
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(SOURCE))
	if not parsed is Dictionary or not parsed.get("neutral") is Dictionary:
		set_editor_status("중립 등록을 읽을 수 없습니다.")
		set_process(false)
		return
	_neutral = parsed.neutral.duplicate(true)
	_build_previews()
	_seek_cursor()
	if Engine.is_editor_hint():
		# Enable only this save bridge; keep the user's other editor plugins.
		if not EditorInterface.is_plugin_enabled(PLUGIN):
			EditorInterface.set_plugin_enabled(PLUGIN, true)
	else:
		(get_node("AnimationPlayer") as AnimationPlayer).play("run")

func _seek_cursor() -> void:
	var player := get_node_or_null("AnimationPlayer") as AnimationPlayer
	var animation := get_run_animation()
	if player == null or animation == null: return
	player.play("run")
	player.seek(clampf(_cursor, 0.0, animation.length), true)
	player.pause()
	_refresh = true

func _build_previews() -> void:
	if is_instance_valid(_generated): _generated.free()
	_stages.clear()
	_generated = Node2D.new()
	_generated.name = "GeneratedRunPreview"
	add_child(_generated, false, Node.INTERNAL_MODE_FRONT)
	for index in 2:
		var card := Control.new()
		card.position = Vector2(40 + index * 410, 125)
		card.size = Vector2(CROP.size) * ZOOM
		card.clip_contents = true
		card.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_generated.add_child(card)
		var stage := SubViewport.new()
		CameraSetup.configure_viewport(stage)
		stage.render_target_update_mode = SubViewport.UPDATE_ONCE
		_generated.add_child(stage)
		var world := Node3D.new()
		stage.add_child(world)
		var camera := Camera3D.new()
		world.add_child(camera)
		CameraSetup.configure_camera(camera)
		var actor := Assembler.new()
		actor.motion_polish = true
		world.add_child(actor)
		if not actor.setup(BUNDLE, camera):
			set_editor_status(actor.last_error)
			continue
		var picture := TextureRect.new()
		picture.mouse_filter = Control.MOUSE_FILTER_IGNORE
		picture.texture = stage.get_texture()
		picture.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		picture.position = -Vector2(CROP.position) * ZOOM
		picture.size = Vector2(CameraSetup.NATIVE) * ZOOM
		card.add_child(picture)
		_stages.append({"stage":stage, "actor":actor, "card":card})
	var pose := get_node_or_null("Pose") as Node2D
	if pose != null:
		pose.position = Vector2(40,125) - Vector2(CROP.position)*ZOOM
		pose.scale = Vector2.ONE*ZOOM

func _process(_delta: float) -> void:
	if _neutral.is_empty() or _stages.is_empty(): return
	var values := collect_pose_deltas()
	if values.is_empty(): return
	_cursor = current_key_time()
	var selected := ""
	if Engine.is_editor_hint():
		for node: Node in EditorInterface.get_selection().get_selected_nodes():
			if is_ancestor_of(node) and node.get_parent() == get_node("Pose"):
				selected = str(node.name)
	if selected != _selected_name:
		_selected_name = selected
		queue_redraw()
	if not _refresh and values == _last_values: return
	_last_values = values.duplicate(true)
	_refresh = false
	var pose := RunClip.deltas_to_pose(values, _neutral)
	var animation := get_run_animation()
	var phase := _cursor/maxf(0.001, animation.length) if animation != null else 0.0
	for index in range(_stages.size()):
		var entry: Dictionary = _stages[index]
		var direction: int = preview_direction if index == 0 else 0
		entry.card.visible = index == 0 or show_reference_view
		if not entry.card.visible: continue
		var actor: Node3D = entry.actor
		if not actor.source.set_authoring_pose(pose):
			set_editor_status(actor.source.last_error)
			continue
		if not actor.apply_pose(phase, 1.0, float(direction)*TAU/8.0, Vector3.ZERO, direction):
			set_editor_status(actor.last_error)
			continue
		_hide_native_bone_gizmos(actor)
		entry.stage.render_target_update_mode = SubViewport.UPDATE_ONCE
	_update_handles(_stages[0].actor)
	queue_redraw()

func _update_handles(actor: Node3D) -> void:
	var points: Dictionary = actor.points.duplicate()
	for key: String in actor.art_points: points[key] = actor.art_points[key]
	for name: String in PIVOTS:
		var handle := get_node_or_null("Pose/"+name) as Node2D
		if handle != null:
			handle.position = points.get(PIVOTS[name], Vector2.ZERO)
			handle.visible = show_handles
	# Root position is animation data, unlike the other handles' display pivots.
	var root_handle := get_node_or_null("Pose/전체_이동") as Node2D
	if root_handle != null: root_handle.visible = false

func _hide_native_bone_gizmos(node: Node) -> void:
	if node is Bone2D: (node as Bone2D).visible = false
	for child in node.get_children(): _hide_native_bone_gizmos(child)

func _draw() -> void:
	draw_rect(Rect2(0,0,860,700), Color("18222f"))
	draw_rect(Rect2(40,125,336,492), Color("2b3b49"))
	if show_reference_view: draw_rect(Rect2(450,125,336,492), Color("2b3b49"))
	if _font == null: return
	draw_string(_font, Vector2(24,33), "하이브리드 버전 1 · 달리기 키프레임", HORIZONTAL_ALIGNMENT_LEFT, -1, 21, Color("f4eee4"))
	draw_string(_font, Vector2(24,60), "AnimationPlayer → run → 시간 선택 → 팔/다리 회전 → 키 기록 → Ctrl+S", HORIZONTAL_ALIGNMENT_LEFT, -1, 15, Color("c7d6df"))
	draw_string(_font, Vector2(40,110), DIRECTIONS[preview_direction]+" · 편집 미리보기", HORIZONTAL_ALIGNMENT_LEFT, -1, 17, Color("9edfff"))
	if show_reference_view: draw_string(_font, Vector2(450,110), "S · 같은 키의 정면", HORIZONTAL_ALIGNMENT_LEFT, -1, 17, Color("c7d6df"))
	draw_string(_font, Vector2(24,650), "현재 %.3f초 / 0.64초   ·   0.00 / 0.16 / 0.32 / 0.48 / 0.64" % _cursor, HORIZONTAL_ALIGNMENT_LEFT, -1, 15, Color("c7d6df"))
	draw_string(_font, Vector2(24,678), _status, HORIZONTAL_ALIGNMENT_LEFT, 820, 14, Color("e4ce9c"))
	if _selected_name.is_empty(): return
	var control := get_node_or_null("Pose/"+_selected_name) as Node2D
	if control == null or not control.visible: return
	var point := to_local(control.global_position)
	draw_arc(point, 14, 0, TAU, 36, Color("ffdd8c"), 2, true)
	draw_string(_font, point+Vector2(18,-12), _selected_name, HORIZONTAL_ALIGNMENT_LEFT, -1, 15, Color("fff1c5"))
