@tool
extends Control
## The upper body remains one texture. Fixed projected poses share the 3D run.
const Rig = preload("res://scripts/characters/hybrid_v1/upper_body_polygon.gd")
const PoseSource = preload("res://scripts/characters/hybrid_v1/hybrid_pose_source.gd")
const ReviewExporter = preload("res://tools/characters/hybrid_v1/export_upper_body_polygon_review.gd")
const DIRECTIONS: Array[String] = ["s","se","e","ne","n","nw","w","sw"]
const POSES: Array[String] = ["중립","달리기 0.00","달리기 0.25","달리기 0.50","달리기 0.75"]
const NATIVE := Vector2i(96,104)
const MANIFEST := "res://art/characters/hybrid-v1/upper-body/manifest.json"
const ORIGIN := Vector2(24,44)

@export_enum("중립","달리기 0.00","달리기 0.25","달리기 0.50","달리기 0.75") var pose_index := 0:
	set(value):
		pose_index = clampi(value,0,4)
		_request_refresh()
@export_enum("8방향","인접 방향 W / NW / N") var direction_layout := 0:
	set(value):
		direction_layout = value
		_request_refresh()
@export var show_mesh := false:
	set(value):
		show_mesh = value
		_request_refresh()
@export var show_head := true:
	set(value):
		show_head = value
		_request_refresh()
@export_range(1,4,1) var pixel_zoom := 2:
	set(value):
		pixel_zoom = clampi(value,1,4)
		_request_refresh()
@export_enum("어두운 배경","밝은 배경") var background_view := 0:
	set(value):
		background_view = value
		_request_refresh()
@export var refresh_requested := false:
	set(value):
		refresh_requested = false
		if value:_request_refresh()
@export_dir var review_directory := "res://art/characters/hybrid-v1/upper-body/review"
@export var export_requested := false:
	set(value):
		export_requested = false
		if value and is_node_ready() and not _exporting:call_deferred("_export_review")

var _generated: Control
var _refresh_queued := false
var _exporting := false
var _status: Label
var _source = PoseSource.new()
var _manifest: Dictionary = {}
var last_error := ""

func _ready() -> void:
	_request_refresh()

func _request_refresh() -> void:
	if not is_node_ready() or _refresh_queued:return
	_refresh_queued = true
	call_deferred("_rebuild")

func _load_data() -> bool:
	last_error = ""
	if not _source.setup():last_error = _source.last_error;return false
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(MANIFEST))
	if not parsed is Dictionary or not parsed.get("directions") is Dictionary:
		last_error = "상체 원본 명세를 읽을 수 없습니다."
		return false
	_manifest = parsed
	return true

func _rebuild() -> void:
	_refresh_queued = false
	if not is_inside_tree():return
	if is_instance_valid(_generated):
		remove_child(_generated)
		_generated.queue_free()
	_generated = Control.new()
	_generated.name = "GeneratedUpperBodyReview"
	add_child(_generated)
	_generated.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var theme_resource := Theme.new()
	theme_resource.default_font = load("res://fonts/NotoSansKR-Medium.tres")
	theme_resource.default_font_size = 14
	_generated.theme = theme_resource
	var background := ColorRect.new()
	background.color = Color("18212d")
	_generated.add_child(background)
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	background.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var margin := MarginContainer.new()
	_generated.add_child(margin)
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for side: String in ["left","top","right","bottom"]:margin.add_theme_constant_override("margin_"+side,12)
	var column := VBoxContainer.new()
	margin.add_child(column)
	var title := Label.new()
	title.text = "통합 상체 작업실 · 팔과 몸통이 이어진 한 장의 그림"
	column.add_child(title)
	var help := Label.new()
	help.text = "중립과 기존 달리기 자세를 같은 크기로 비교합니다. 편집기에서도 인스펙터로 자세를 바꿀 수 있습니다.\n머리와 통합 상체만 표시합니다. 격자는 소매가 어떻게 휘는지 확인하는 보기입니다."
	column.add_child(help)
	var row := HBoxContainer.new()
	column.add_child(row)
	_choice(row,POSES,pose_index,func(index: int)->void:pose_index=index)
	_choice(row,["8방향","W / NW / N"],direction_layout,func(index: int)->void:direction_layout=index)
	_choice(row,["격자 숨김","변형 격자"],1 if show_mesh else 0,func(index: int)->void:show_mesh=index==1)
	_choice(row,["머리 표시","상체만"],0 if show_head else 1,func(index: int)->void:show_head=index==0)
	_choice(row,["1×","2×","3×","4×"],pixel_zoom-1,func(index: int)->void:pixel_zoom=index+1)
	_choice(row,["어두운 배경","밝은 배경"],background_view,func(index: int)->void:background_view=index)
	var actions := HBoxContainer.new()
	column.add_child(actions)
	_button(actions,"원본 다시 읽기",_request_refresh)
	_button(actions,"중립·달리기 4자세 PNG",func()->void:export_requested=true)
	_status = Label.new()
	_status.text = "자동 이동 없이 선택한 자세를 표시합니다."
	column.add_child(_status)
	if not _load_data():_status.text=last_error;return
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_child(scroll)
	var grid := GridContainer.new()
	grid.columns = 4 if direction_layout==0 else 3
	grid.add_theme_constant_override("h_separation",12)
	grid.add_theme_constant_override("v_separation",12)
	scroll.add_child(grid)
	var indices: Array[int] = []
	indices.assign([0,1,2,3,4,5,6,7] if direction_layout==0 else [6,5,4])
	for index: int in indices:
		var card := VBoxContainer.new()
		grid.add_child(card)
		var label := Label.new()
		label.text = DIRECTIONS[index].to_upper()+" · "+POSES[pose_index]
		card.add_child(label)
		var canvas := Control.new()
		canvas.custom_minimum_size = Vector2(NATIVE)*pixel_zoom
		canvas.clip_contents = true
		card.add_child(canvas)
		var backdrop := ColorRect.new()
		backdrop.size = canvas.custom_minimum_size
		backdrop.color = Color("e4dedd") if background_view==1 else Color("283341")
		canvas.add_child(backdrop)
		var stage := build_stage(_generated,index,pose_index,show_mesh,show_head)
		if stage==null:_status.text=last_error;continue
		var picture := TextureRect.new()
		picture.texture = stage.get_texture()
		picture.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		picture.size = Vector2(NATIVE)*pixel_zoom
		picture.mouse_filter = Control.MOUSE_FILTER_IGNORE
		canvas.add_child(picture)
		stage.render_target_update_mode = SubViewport.UPDATE_ONCE

func _choice(row: HBoxContainer,values: Array,chosen: int,callback: Callable) -> void:
	var choice := OptionButton.new()
	for value: Variant in values:choice.add_item(str(value))
	choice.select(chosen)
	choice.item_selected.connect(callback)
	row.add_child(choice)

func _button(row: HBoxContainer,text: String,callback: Callable) -> void:
	var button := Button.new()
	button.text = text
	button.pressed.connect(callback)
	row.add_child(button)

func build_stage(parent: Node,direction_index: int,fixed_pose: int,mesh_visible: bool=false,head_visible: bool=true) -> SubViewport:
	if _manifest.is_empty() and not _load_data():return null
	var direction: String=DIRECTIONS[direction_index]
	if not _manifest.directions.has(direction):last_error="방향이 없습니다: "+direction;return null
	var entry: Dictionary=_manifest.directions[direction]
	if not entry.get("joints") is Dictionary:last_error="연결점이 없습니다: "+direction;return null
	var source_joints := {}
	for name: String in entry.joints:
		var value: Variant=entry.joints[name]
		if value is Array and value.size()==2:source_joints[name]=Vector2(float(value[0]),float(value[1]))
	for name: String in ["neck","spine","shoulder_l","elbow_l","wrist_l","shoulder_r","elbow_r","wrist_r"]:
		if not source_joints.has(name):last_error="Missing joint: "+direction+"/"+name;return null
	var stage := SubViewport.new()
	stage.name = "UpperBodyReview_"+direction+"_"+str(fixed_pose)
	stage.size = NATIVE
	stage.transparent_bg = true
	stage.disable_3d = true
	stage.render_target_update_mode = SubViewport.UPDATE_DISABLED
	stage.canvas_item_default_texture_filter = Viewport.DEFAULT_CANVAS_ITEM_TEXTURE_FILTER_NEAREST
	parent.add_child(stage)
	var packed_path := "res://art/characters/hybrid-v1/rigs/upper-body/"+direction+".tscn"
	var packed: PackedScene = ResourceLoader.load(packed_path,"PackedScene",ResourceLoader.CACHE_MODE_IGNORE) as PackedScene if FileAccess.file_exists(packed_path) else null
	var rig = packed.instantiate() if packed!=null else Rig.new()
	rig.name = "IntegratedUpperBody"
	stage.add_child(rig)
	rig.position = ORIGIN
	var path: String=str(entry.get("png","res://art/characters/hybrid-v1/upper-body/"+direction+"/upper_body.png"))
	var ready_rig: bool = rig.reload_texture() if packed!=null else rig.configure(direction,path,source_joints)
	if not ready_rig:
		last_error = str(rig.get("last_error"))
		parent.remove_child(stage);stage.queue_free();return null
	# Native Bone2D editor hints are CanvasItem drawings and otherwise leak into
	# this authoring SubViewport. Only hide the preview's bone subtree; the
	# sibling Polygon2D still skins and saved artist-editable bones stay visible.
	if rig.bones.has("torso"):(rig.bones.torso as Bone2D).visible=false
	var pose := projected_source_pose(source_joints,direction_index,fixed_pose)
	if not rig.apply_projected_pose(pose):
		last_error = str(rig.get("last_error"))
		parent.remove_child(stage);stage.queue_free();return null
	if head_visible:
		var image := Image.load_from_file("res://art/characters/hybrid-v1/heads/"+direction+"/head.png")
		if image!=null:
			var head := Sprite2D.new()
			head.name = "Head"
			head.texture = ImageTexture.create_from_image(image)
			head.centered = false
			head.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
			head.position = ORIGIN+(pose.neck as Vector2)-Vector2(24,44)
			stage.add_child(head)
	if mesh_visible:
		var overlay := Node2D.new()
		overlay.name = "MeshOverlay"
		rig.add_child(overlay)
		overlay.draw.connect(_draw_mesh.bind(overlay,rig,pose))
		overlay.queue_redraw()
	return stage

func projected_source_pose(source_joints: Dictionary,direction_index: int,fixed_pose: int) -> Dictionary:
	var result := source_joints.duplicate()
	if fixed_pose==0:return result
	var neutral: Dictionary=_source.sample(0.0,0.0)
	var current: Dictionary=_source.sample(float(fixed_pose-1)*0.25,1.0)
	var yaw := Basis(Vector3.UP,float(direction_index)*TAU/8.0)
	var base3 := {}
	var moved3 := {}
	for key: String in neutral:
		base3[key]=_project(yaw*(neutral[key] as Vector3))
		moved3[key]=_project(yaw*(current[key] as Vector3))
	var original_torso: Vector2=(base3.neck as Vector2)-(base3.spine as Vector2)
	var moved_torso: Vector2=(moved3.neck as Vector2)-(moved3.spine as Vector2)
	var angle := moved_torso.angle()-original_torso.angle()
	var ratio := clampf(moved_torso.length()/maxf(original_torso.length(),0.01),0.85,1.1)
	var bob: Vector2=((moved3.spine as Vector2)-(base3.spine as Vector2))*0.25
	var spine: Vector2=(source_joints.spine as Vector2)+bob
	result.spine=spine
	result.neck=spine+((source_joints.neck as Vector2)-(source_joints.spine as Vector2)).rotated(angle)*ratio
	for side: String in ["l","r"]:
		var shoulder := "shoulder_"+side
		var elbow := "elbow_"+side
		var wrist := "wrist_"+side
		result[shoulder]=spine+((source_joints[shoulder] as Vector2)-(source_joints.spine as Vector2)).rotated(angle)*ratio
		for pair: Array in [[shoulder,elbow],[elbow,wrist]]:
			var from: String=pair[0]
			var to: String=pair[1]
			var before: Vector2=(base3[to] as Vector2)-(base3[from] as Vector2)
			var after: Vector2=(moved3[to] as Vector2)-(moved3[from] as Vector2)
			var delta := after.angle()-before.angle()
			var shortening := clampf(after.length()/maxf(before.length(),0.01),0.2,1.2)
			result[to]=(result[from] as Vector2)+((source_joints[to] as Vector2)-(source_joints[from] as Vector2)).rotated(delta)*shortening
	return result

func _project(value: Vector3) -> Vector2:
	# Fixed orthographic camera (0,160,260), target (0,42,0), size180.
	var up := Vector3(0,260,-118).normalized()
	return Vector2(value.x,-value.dot(up))

func _draw_mesh(overlay: Node2D,rig: Node2D,pose: Dictionary) -> void:
	if not is_instance_valid(rig):return
	var vertices: PackedVector2Array=rig.deformed_vertices()
	for triangle: PackedInt32Array in rig.triangle_indices:
		if triangle.size()!=3:continue
		for i in 3:overlay.draw_line(vertices[triangle[i]],vertices[triangle[(i+1)%3]],Color(0.2,1.0,0.7,0.35),0.35)
	for name: String in pose:overlay.draw_circle(pose[name],0.8,Color("f0a940"))

func _export_review() -> void:
	if _exporting:return
	if not _load_data():
		if is_instance_valid(_status):_status.text=last_error
		return
	_exporting=true
	if is_instance_valid(_status):_status.text="고정 자세 PNG를 출력하고 있습니다."
	var exporter=ReviewExporter.new()
	var result: Dictionary=await exporter.export_review(self,review_directory,build_stage)
	_exporting=false
	if is_instance_valid(_status):_status.text="PNG 출력 완료: "+str(result.get("directory","")) if result.get("ok",false) else "PNG 출력 실패: "+str(result.get("error",""))
