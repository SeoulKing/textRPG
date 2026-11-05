extends Control
## Real Skeleton3D animation with camera-facing, directional pixel sprite parts.
const ReferenceAssembler = preload("res://scripts/characters/hybrid_v1/reference_character_assembler.gd")
const REFERENCE_PARTS := "res://art/characters/hybrid-v1/assembly/parts.json"
@export_file("*.json") var registration_path: String = REFERENCE_PARTS
const DIRECTIONS: Array[String] = ["s", "se", "e", "ne", "n", "nw", "w", "sw"]
const NATIVE := Vector2i(320, 180)

var source
var assembler
var asset_label: Label
var stage: SubViewport
var world: Node3D
var skeleton: Skeleton3D
var camera: Camera3D
var image: TextureRect
var bone_overlay: Control
var status: Label
var panel: PanelContainer
var data: Dictionary = {}
var joints: Dictionary = {}
var points: Dictionary = {}
var stage_origin := Vector2.ZERO
var stage_scale := 3.0
var floor_position := Vector3.ZERO
var velocity := Vector2.ZERO
var heading := 0.0
var target_heading := 0.0
var direction := -1
var phase := 0.0
var weight := 1.0
var demo_speed := 75.0
var time_scale := 1.0
var demo := true
var auto_turn := true
var paused := false
var show_bones := false
var initialized := false
var error_text := ""
var turn_box: CheckBox
var demo_box: CheckBox
var pause_button: Button
var motion_box: CheckBox
var motion_polish_enabled := true

func _ready() -> void:
    var editor_preview := get_node_or_null("EditorPreview")
    if editor_preview != null: editor_preview.queue_free()
    var theme_resource := Theme.new()
    theme_resource.default_font = load("res://fonts/NotoSansKR-Medium.tres")
    theme_resource.default_font_size = 15
    theme = theme_resource
    _build_ui()
    _build_stage()
    var initial_path := registration_path
    if not _switch_registration(initial_path): return
    initialized = true
    _layout_stage()
    _sample()
    resized.connect(_layout_stage)

func _button(row: HBoxContainer, text: String, callback: Callable) -> Button:
    var button := Button.new()
    button.text = text
    button.focus_mode = Control.FOCUS_NONE
    button.pressed.connect(callback)
    row.add_child(button)
    return button

func _build_ui() -> void:
    panel = PanelContainer.new()
    panel.position = Vector2(16,12)
    add_child(panel)
    var column := VBoxContainer.new()
    panel.add_child(column)
    var title := Label.new()
    title.text = "하이브리드 버전 1 · 동작 작업실"
    column.add_child(title)
    var help := Label.new()
    help.text = "WASD / 방향키 이동 · Shift 달리기 · Space 정지/재생 · R 위치 초기화\n자동 시연은 제자리에서 회전합니다. 이동 키를 누르면 직접 조작으로 바뀝니다."
    column.add_child(help)
    var row := HBoxContainer.new()
    column.add_child(row)
    _button(row,"대기",func() -> void: demo_speed = 0.0; _set_demo(true))
    _button(row,"걷기",func() -> void: demo_speed = 38.0; _set_demo(true))
    _button(row,"달리기",func() -> void: demo_speed = 75.0; _set_demo(true))
    pause_button = _button(row,"일시정지",_toggle_pause)
    _button(row,"한 프레임",func() -> void:
        paused = true
        pause_button.text = "재생"
        if initialized: _advance(1.0/30.0)
    )
    demo_box = CheckBox.new()
    demo_box.text = "제자리 시연"
    demo_box.button_pressed = true
    demo_box.focus_mode = Control.FOCUS_NONE
    demo_box.toggled.connect(func(value: bool) -> void: demo = value)
    row.add_child(demo_box)
    turn_box = CheckBox.new()
    turn_box.text = "자동 회전"
    turn_box.button_pressed = true
    turn_box.focus_mode = Control.FOCUS_NONE
    turn_box.toggled.connect(func(value: bool) -> void: auto_turn = value)
    row.add_child(turn_box)
    var bone_box := CheckBox.new()
    bone_box.text = "3D 관절 보기"
    bone_box.focus_mode = Control.FOCUS_NONE
    bone_box.toggled.connect(func(value: bool) -> void:
        show_bones = value
        if is_instance_valid(bone_overlay): bone_overlay.queue_redraw()
    )
    row.add_child(bone_box)
    motion_box = CheckBox.new()
    motion_box.text = "동작 보정"
    motion_box.button_pressed = motion_polish_enabled
    motion_box.focus_mode = Control.FOCUS_NONE
    motion_box.toggled.connect(func(value: bool) -> void:
        motion_polish_enabled = value
        if registration_path == REFERENCE_PARTS and is_instance_valid(assembler):
            assembler.motion_polish = value
            if initialized: _sample()
    )
    row.add_child(motion_box)
    var directions_row := HBoxContainer.new()
    column.add_child(directions_row)
    for i: int in range(DIRECTIONS.size()):
        var chosen: int = i
        _button(directions_row,DIRECTIONS[i].to_upper(),func() -> void:
            auto_turn = false
            turn_box.set_pressed_no_signal(false)
            target_heading = float(chosen)*TAU/8.0
            heading = target_heading
            if initialized: _sample()
        )
    var speed_label := Label.new()
    speed_label.text = "  재생 속도"
    directions_row.add_child(speed_label)
    var speed := HSlider.new()
    speed.min_value = 0.25
    speed.max_value = 1.5
    speed.step = 0.05
    speed.value = 1.0
    speed.custom_minimum_size.x = 120
    speed.focus_mode = Control.FOCUS_NONE
    speed.value_changed.connect(func(value: float) -> void: time_scale = value)
    directions_row.add_child(speed)
    var asset_row := HBoxContainer.new()
    column.add_child(asset_row)
    asset_label = Label.new()
    asset_row.add_child(asset_label)
    var review_row := HBoxContainer.new()
    column.add_child(review_row)
    _button(review_row, "전체 조립 비교", func() -> void: get_tree().change_scene_to_file("res://scenes/characters/hybrid-v1/workbench.tscn"))
    _button(review_row, "통합 상체 Polygon2D", func() -> void: get_tree().change_scene_to_file("res://scenes/characters/hybrid-v1/upper-body-workbench.tscn"))
    _button(review_row, "통합 다리 Polygon2D", func() -> void: get_tree().change_scene_to_file("res://scenes/characters/hybrid-v1/leg-workbench.tscn"))
    status = Label.new()
    status.text = "부품과 공통 동작을 읽는 중입니다."
    column.add_child(status)

func _build_stage() -> void:
    stage = SubViewport.new()
    stage.name = "PixelStage"
    stage.size = NATIVE
    stage.transparent_bg = true
    stage.own_world_3d = true
    stage.render_target_update_mode = SubViewport.UPDATE_ALWAYS
    stage.msaa_3d = Viewport.MSAA_DISABLED
    stage.screen_space_aa = Viewport.SCREEN_SPACE_AA_DISABLED
    add_child(stage)
    world = Node3D.new()
    world.name = "HybridWorld"
    stage.add_child(world)
    camera = Camera3D.new()
    camera.name = "FixedCamera"
    camera.projection = Camera3D.PROJECTION_ORTHOGONAL
    camera.size = 180.0
    camera.near = 0.1
    camera.far = 1000.0
    world.add_child(camera)
    camera.position = Vector3(0,160,260)
    camera.look_at(Vector3(0,42,0),Vector3.UP)
    camera.current = true
    image = TextureRect.new()
    image.name = "PixelComposite"
    image.texture = stage.get_texture()
    image.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
    image.mouse_filter = Control.MOUSE_FILTER_IGNORE
    add_child(image)
    bone_overlay = Control.new()
    bone_overlay.name = "SkeletonOverlay"
    bone_overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
    bone_overlay.draw.connect(_draw_bones)
    add_child(bone_overlay)
    # Keep all controls above the assembled viewport.
    move_child(panel,get_child_count()-1)

func _layout_stage() -> void:
    if not is_instance_valid(image): return
    var top := maxf(250.0,ceilf(panel.get_combined_minimum_size().y+28.0))
    stage_scale = maxf(1.0,floorf(minf((size.x-32.0)/NATIVE.x,(size.y-top-16.0)/NATIVE.y)))
    var extent := Vector2(NATIVE)*stage_scale
    stage_origin = Vector2(floorf((size.x-extent.x)*0.5),top)
    image.position = stage_origin
    image.size = extent
    queue_redraw()

func _set_demo(value: bool) -> void:
    demo = value
    demo_box.set_pressed_no_signal(value)

func _toggle_pause() -> void:
    paused = not paused
    pause_button.text = "재생" if paused else "일시정지"

func _unhandled_key_input(event: InputEvent) -> void:
    var key := event as InputEventKey
    if key == null or not key.pressed or key.echo: return
    if key.keycode == KEY_SPACE:
        _toggle_pause()
        get_viewport().set_input_as_handled()
    elif key.keycode == KEY_R:
        floor_position = Vector3.ZERO
        velocity = Vector2.ZERO
        phase = 0.0
        if initialized: _sample()

func _process(delta: float) -> void:
    if initialized and not paused: _advance(minf(delta,0.05)*time_scale)

func _advance(delta: float) -> void:
    var input := Vector2(float(Input.is_physical_key_pressed(KEY_D) or Input.is_physical_key_pressed(KEY_RIGHT))-float(Input.is_physical_key_pressed(KEY_A) or Input.is_physical_key_pressed(KEY_LEFT)),float(Input.is_physical_key_pressed(KEY_S) or Input.is_physical_key_pressed(KEY_DOWN))-float(Input.is_physical_key_pressed(KEY_W) or Input.is_physical_key_pressed(KEY_UP)))
    if input.length_squared() > 0.0:
        _set_demo(false)
        auto_turn = false
        turn_box.set_pressed_no_signal(false)
    var speed := demo_speed if demo else (75.0 if Input.is_physical_key_pressed(KEY_SHIFT) else 38.0)
    var target := input.normalized()*speed if not demo else Vector2.ZERO
    velocity = velocity.move_toward(target,240.0*delta)
    if demo and auto_turn: target_heading += delta*TAU/12.0
    elif velocity.length_squared() > 0.1: target_heading = atan2(velocity.x,velocity.y)
    heading = lerp_angle(heading,target_heading,minf(1.0,12.0*delta))
    var before := floor_position
    floor_position.x = clampf(floor_position.x+velocity.x*delta,-105.0,105.0)
    # The taller three-head assembly needs room for its crown and swinging
    # boots inside the same 180-pixel fixed-camera viewport.
    var depth_limit := 25.0
    floor_position.z = clampf(floor_position.z+velocity.y*delta,-depth_limit,depth_limit)
    var distance := floor_position.distance_to(before)
    var actual_speed := demo_speed if demo else distance/maxf(delta,0.00001)
    var target_weight := clampf(actual_speed/75.0,0.0,1.0)
    weight = move_toward(weight,target_weight,5.0*delta)
    phase = fposmod(phase+(actual_speed*delta if demo else distance)/48.0,1.0)
    _sample()

func _switch_registration(path: String) -> bool:
    var next = ReferenceAssembler.new()
    if path == REFERENCE_PARTS: next.motion_polish = motion_polish_enabled
    next.name = "CharacterAssembler"
    world.add_child(next)
    var previous_camera_offset := camera.v_offset
    camera.v_offset = 0.0
    if not next.setup(path, camera):
        var message: String = next.last_error
        camera.v_offset = previous_camera_offset
        world.remove_child(next)
        next.queue_free()
        _fail(message)
        return false
    if is_instance_valid(assembler):
        world.remove_child(assembler)
        assembler.queue_free()
    assembler = next
    source = assembler.source
    skeleton = assembler.skeleton
    data = assembler.data
    joints = assembler.joints
    registration_path = path
    if is_instance_valid(motion_box): motion_box.disabled = path != REFERENCE_PARTS
    image.material = null
    if is_instance_valid(asset_label):
        asset_label.text = "확정 캐릭터: 하이브리드 버전 1"
    if initialized: _sample()
    return true

func _sample() -> void:
    if not assembler.apply_pose(phase, weight, heading, floor_position):
        _fail(assembler.last_error)
        return
    points = assembler.points
    direction = assembler.direction
    status.text = "%s · %s · 공통 위상 %.2f · 실제 3D 관절 %d개 · %s" % [DIRECTIONS[direction].to_upper(),"제자리 시연" if demo else "직접 이동",phase,skeleton.get_bone_count(),"재생 정지" if paused else ("달리기" if weight > 0.75 else ("걷기" if weight > 0.05 else "대기"))]
    bone_overlay.queue_redraw()
    queue_redraw()

func _screen(point: Vector3) -> Vector2:
    return stage_origin+camera.unproject_position(point).round()*stage_scale

func _draw() -> void:
    draw_rect(Rect2(Vector2.ZERO,size),Color("171f2b"))
    if not initialized: return
    draw_rect(Rect2(stage_origin,Vector2(NATIVE)*stage_scale),Color("293b43"))
    for value: int in range(-144,145,24):
        draw_line(_screen(Vector3(value,0,-80)),_screen(Vector3(value,0,80)),Color("354e56"),1.0)
    for value: int in range(-72,73,24):
        draw_line(_screen(Vector3(-144,0,value)),_screen(Vector3(144,0,value)),Color("354e56"),1.0)
    var feet := _screen(floor_position)
    draw_set_transform(feet,0.0,Vector2(1.0,0.35))
    draw_circle(Vector2.ZERO,14.0*stage_scale,Color(0.04,0.08,0.12,0.4))
    draw_set_transform(Vector2.ZERO,0.0,Vector2.ONE)

func _draw_bones() -> void:
    if not initialized or not show_bones: return
    for joint: String in source.joint_order:
        var parent: String = source.parents[joint]
        var p: Vector3 = skeleton.get_bone_global_pose(joints[joint]).origin
        if not parent.is_empty():
            var q: Vector3 = skeleton.get_bone_global_pose(joints[parent]).origin
            bone_overlay.draw_line(_screen(q),_screen(p),Color("91e7f0"),2.0)
        bone_overlay.draw_circle(_screen(p),2.5,Color("ffe099"))

func _fail(message: String) -> void:
    error_text = message
    status.text = "실험을 열 수 없습니다: "+message
    push_error(message)
