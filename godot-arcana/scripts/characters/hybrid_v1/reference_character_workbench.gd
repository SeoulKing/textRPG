@tool
extends Control
## Full new character, driven by the shared real Skeleton3D.
## Fixed authoring poses only; opening this scene never starts movement.
const Assembler = preload("res://scripts/characters/hybrid_v1/reference_character_assembler.gd")
const CameraSetup = preload("res://scripts/characters/hybrid_v1/camera_setup.gd")
const ReviewExporter = preload("res://tools/characters/hybrid_v1/export_reference_character_review.gd")
const BUNDLE := "res://art/characters/hybrid-v1/assembly/parts.json"
const DIRECTIONS: Array[String] = ["s","se","e","ne","n","nw","w","sw"]
const POSES: Array[String] = ["중립","달리기 0.00","달리기 0.25","달리기 0.50","달리기 0.75"]
const CROP := Rect2i(104,8,112,164)

@export_enum("중립","달리기 0.00","달리기 0.25","달리기 0.50","달리기 0.75") var pose_index := 0:
	set(value):
		pose_index=clampi(value,0,4)
		_request_refresh()
@export_enum("8방향","인접 방향 W / NW / N") var direction_layout := 0:
	set(value):
		direction_layout=value
		_request_refresh()
@export var show_joints := false:
	set(value):
		show_joints=value
		_request_refresh()
@export var motion_polish := true:
	set(value):
		motion_polish=value
		_request_refresh()
@export_range(1,3,1) var pixel_zoom := 2:
	set(value):
		pixel_zoom=clampi(value,1,3)
		_request_refresh()
@export_enum("어두운 배경","밝은 배경") var background_view := 0:
	set(value):
		background_view=value
		_request_refresh()
@export var refresh_requested := false:
	set(value):
		refresh_requested=false
		if value:_request_refresh()
@export_dir var review_directory := "res://art/characters/hybrid-v1/assembly/review"
@export var export_requested := false:
	set(value):
		export_requested=false
		if value and is_node_ready() and not _exporting:call_deferred("_export_review")

var _generated: Control
var _refresh_queued := false
var _exporting := false
var _status: Label
var last_error := ""
var _issues: Array[String] = []

func _ready() -> void:
	_request_refresh()

func _request_refresh() -> void:
	if not is_node_ready() or _refresh_queued:return
	_refresh_queued=true
	call_deferred("_rebuild")

func _rebuild() -> void:
	_refresh_queued=false
	if not is_inside_tree():return
	if is_instance_valid(_generated):
		remove_child(_generated)
		_generated.queue_free()
	_issues.clear()
	_generated=Control.new()
	_generated.name="GeneratedReferenceCharacterReview"
	add_child(_generated)
	_generated.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var theme_resource := Theme.new()
	theme_resource.default_font=load("res://fonts/NotoSansKR-Medium.tres")
	theme_resource.default_font_size=14
	_generated.theme=theme_resource
	var background := ColorRect.new()
	background.color=Color("18212d")
	background.mouse_filter=Control.MOUSE_FILTER_IGNORE
	_generated.add_child(background)
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var margin := MarginContainer.new()
	_generated.add_child(margin)
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for side: String in ["left","top","right","bottom"]:margin.add_theme_constant_override("margin_"+side,12)
	var column := VBoxContainer.new()
	margin.add_child(column)
	var title := Label.new()
	title.text="새 파츠 전체 조립 · 공통 3D 뼈대 + Polygon2D"
	column.add_child(title)
	var help := Label.new()
	help.text="머리·통합 상체·골반·통합 다리·신발을 같은 자세로 비교합니다.\n편집기에서도 인스펙터로 갱신합니다. 자동 이동 없이 고정 위상만 표시합니다."
	column.add_child(help)
	var row := HBoxContainer.new()
	column.add_child(row)
	_choice(row,POSES,pose_index,func(index: int)->void:pose_index=index)
	_choice(row,["8방향","W / NW / N"],direction_layout,func(index: int)->void:direction_layout=index)
	_choice(row,["1×","2×","3×"],pixel_zoom-1,func(index: int)->void:pixel_zoom=index+1)
	_choice(row,["어두운 배경","밝은 배경"],background_view,func(index: int)->void:background_view=index)
	var joint_box := CheckBox.new()
	joint_box.text="실제 3D 관절 보기"
	joint_box.button_pressed=show_joints
	joint_box.toggled.connect(func(value: bool)->void:show_joints=value)
	row.add_child(joint_box)
	var motion_box := CheckBox.new()
	motion_box.text="애니메이션 보정"
	motion_box.button_pressed=motion_polish
	motion_box.toggled.connect(func(value: bool)->void:motion_polish=value)
	row.add_child(motion_box)
	var actions := HBoxContainer.new()
	column.add_child(actions)
	_button(actions,"원본 다시 읽기",_request_refresh)
	_button(actions,"5개 자세 PNG 비교 출력",func()->void:export_requested=true)
	if not Engine.is_editor_hint():_button(actions,"이동 실험으로",func()->void:get_tree().change_scene_to_file("res://scenes/characters/hybrid-v1/experiment.tscn"))
	_status=Label.new()
	_status.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART
	_status.text="원본 조립을 읽고 있습니다."
	column.add_child(_status)
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical=Control.SIZE_EXPAND_FILL
	column.add_child(scroll)
	var grid := GridContainer.new()
	grid.columns=4 if direction_layout==0 else 3
	grid.add_theme_constant_override("h_separation",12)
	grid.add_theme_constant_override("v_separation",12)
	scroll.add_child(grid)
	var indices: Array[int]=[]
	indices.assign([0,1,2,3,4,5,6,7] if direction_layout==0 else [6,5,4])
	for index: int in indices:_build_card(grid,index)
	_status.text=" · ".join(_issues) if not _issues.is_empty() else "동일한 카메라·배율·동작 위상으로 전체 파츠를 표시합니다."

func _choice(row: HBoxContainer,values: Array,chosen: int,callback: Callable) -> void:
	var choice := OptionButton.new()
	for value: Variant in values:choice.add_item(str(value))
	choice.select(chosen)
	choice.item_selected.connect(callback)
	row.add_child(choice)

func _button(row: HBoxContainer,text: String,callback: Callable) -> void:
	var button := Button.new()
	button.text=text
	button.pressed.connect(callback)
	row.add_child(button)

func _build_card(grid: GridContainer,index: int) -> void:
	var card := VBoxContainer.new()
	grid.add_child(card)
	var label := Label.new()
	label.text=DIRECTIONS[index].to_upper()+" · "+POSES[pose_index]
	card.add_child(label)
	var canvas := Control.new()
	canvas.custom_minimum_size=Vector2(CROP.size)*pixel_zoom
	canvas.clip_contents=true
	card.add_child(canvas)
	var backdrop := ColorRect.new()
	backdrop.color=Color("e4dedd") if background_view==1 else Color("283341")
	backdrop.size=canvas.custom_minimum_size
	canvas.add_child(backdrop)
	var stage := build_stage(_generated,index,pose_index,show_joints)
	if stage==null:
		_issues.append(last_error)
		return
	var picture := TextureRect.new()
	picture.texture=stage.get_texture()
	picture.texture_filter=CanvasItem.TEXTURE_FILTER_NEAREST
	picture.position=-Vector2(CROP.position)*pixel_zoom
	picture.size=Vector2(CameraSetup.NATIVE)*pixel_zoom
	picture.mouse_filter=Control.MOUSE_FILTER_IGNORE
	canvas.add_child(picture)
	stage.render_target_update_mode=SubViewport.UPDATE_ONCE

func build_stage(parent: Node,direction_index: int,fixed_pose: int,joint_overlay: bool=false) -> SubViewport:
	last_error=""
	var stage := SubViewport.new()
	stage.name="ReferenceCharacterReview_"+DIRECTIONS[direction_index]+"_"+str(fixed_pose)
	CameraSetup.configure_viewport(stage)
	stage.render_target_update_mode=SubViewport.UPDATE_DISABLED
	stage.canvas_item_default_texture_filter=Viewport.DEFAULT_CANVAS_ITEM_TEXTURE_FILTER_NEAREST
	parent.add_child(stage)
	var world := Node3D.new()
	world.name="ReferenceWorld"
	stage.add_child(world)
	var camera := Camera3D.new()
	world.add_child(camera)
	CameraSetup.configure_camera(camera)
	var actor = Assembler.new()
	actor.name="ReferenceCharacter"
	actor.motion_polish=motion_polish
	world.add_child(actor)
	if not actor.setup(BUNDLE,camera):
		last_error=str(actor.last_error)
		parent.remove_child(stage);stage.queue_free();return null
	var phase := float(fixed_pose-1)*0.25 if fixed_pose>0 else 0.0
	if not actor.apply_pose(phase,1.0 if fixed_pose>0 else 0.0,float(direction_index)*TAU/8.0,Vector3.ZERO,direction_index):
		last_error=str(actor.last_error)
		parent.remove_child(stage);stage.queue_free();return null
	if joint_overlay:
		var overlay := Node2D.new()
		overlay.name="JointOverlay"
		stage.add_child(overlay)
		overlay.draw.connect(_draw_joints.bind(overlay,actor,camera))
		overlay.queue_redraw()
	return stage

func _draw_joints(overlay: Node2D,actor: Node3D,camera: Camera3D) -> void:
	if not is_instance_valid(actor) or not is_instance_valid(camera):return
	var rig: Skeleton3D=actor.get("skeleton")
	var source=actor.get("source")
	var joints: Dictionary=actor.get("joints")
	if not is_instance_valid(rig) or source==null:return
	for name: String in source.joint_order:
		var point: Vector3=rig.get_bone_global_pose(joints[name]).origin
		var p:=camera.unproject_position(point)
		var parent_name: String=source.parents[name]
		if not parent_name.is_empty():
			var other: Vector3=rig.get_bone_global_pose(joints[parent_name]).origin
			overlay.draw_line(camera.unproject_position(other),p,Color("91e7f0"),0.8)
		overlay.draw_circle(p,1.2,Color("ffe099"))

func _export_review() -> void:
	if _exporting:return
	_exporting=true
	if is_instance_valid(_status):_status.text="전체 캐릭터의 고정 자세를 출력하고 있습니다."
	var exporter=ReviewExporter.new()
	var result: Dictionary=await exporter.export_review(self,review_directory,build_stage)
	_exporting=false
	if is_instance_valid(_status):_status.text="PNG 출력 완료: "+str(result.get("directory","")) if result.get("ok",false) else "PNG 출력 실패: "+str(result.get("error",""))
