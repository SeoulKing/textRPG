@tool
extends EditorPlugin
const Document = preload("res://addons/heroine_workshop/document.gd")
const Canvas = preload("res://addons/pixel_workshop/pixel_canvas.gd")
var panel: VBoxContainer
var canvas: Control
var preview: TextureRect
var direction: OptionButton
var animation: OptionButton
var arm_piece: OptionButton
var layer: OptionButton
var frame: SpinBox
var playing: CheckButton
var onion: CheckButton
var status: Label
var data: Dictionary
var color = "#283452"
var source_hash = ""
var history: Array[Dictionary] = []
var future: Array[Dictionary] = []
var before: Dictionary
var dirty = false
var clock = 0.0
var atlas_cache: Dictionary = {}
var bake_pid = -1
func _enter_tree() -> void:
    panel = VBoxContainer.new()
    var bar = HBoxContainer.new()
    panel.add_child(bar)
    direction = OptionButton.new()
    for d in Document.DIRECTIONS: direction.add_item(d)
    bar.add_child(direction)
    animation = OptionButton.new()
    for a in Document.CLIPS: animation.add_item(a)
    bar.add_child(animation)
    animation.select(1)
    layer = OptionButton.new()
    for name in Document.LAYERS: layer.add_item(name)
    bar.add_child(layer)
    arm_piece=OptionButton.new()
    for name in ["위팔","아래팔","소맷단","손"]:arm_piece.add_item(name)
    arm_piece.tooltip_text="팔 원본의 연결 부위를 선택합니다."
    bar.add_child(arm_piece)
    frame = SpinBox.new()
    frame.prefix = "프레임 "
    frame.step = 1
    bar.add_child(frame)
    playing = CheckButton.new()
    playing.text = "재생"
    bar.add_child(playing)
    onion = CheckButton.new()
    onion.text = "이전 프레임"
    bar.add_child(onion)
    var row = HBoxContainer.new()
    panel.add_child(row)
    canvas = Canvas.new()
    canvas.dimensions = Document.SPEC.FRAME_SIZE
    canvas.foot = Vector2(Document.SPEC.FOOT)
    canvas.display_scale = 3
    row.add_child(canvas)
    var tools = VBoxContainer.new()
    row.add_child(tools)
    var colors = GridContainer.new()
    colors.columns = 8
    tools.add_child(colors)
    data = Document.read_source()
    for value in ["."]+data.palette:
        var button = Button.new()
        button.custom_minimum_size = Vector2(24,24)
        button.modulate = Color.WHITE if value=="." else Color(value)
        button.text = "×" if value=="." else "■"
        button.tooltip_text = value
        button.pressed.connect(func(): color=value)
        colors.add_child(button)
    preview = TextureRect.new()
    preview.custom_minimum_size = Vector2(192,272)
    preview.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
    preview.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
    preview.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
    tools.add_child(preview)
    var help = Label.new()
    help.text = "현재 프레임의 선택 레이어를 편집합니다.\n왼쪽 칠하기 · 오른쪽 지우기 · 이전 프레임 비교\n공통 원본은 PixelPen으로 수정 후 PNG로 내보냅니다.\n발 기준: (48,116) · 이동 최대: 초당 3칸"
    tools.add_child(help)
    var actions = HBoxContainer.new()
    panel.add_child(actions)
    _button(actions,"되돌리기",_undo)
    _button(actions,"다시 하기",_redo)
    _button(actions,"저장 + 시트 반영",_save)
    _button(actions,"원본 다시 읽기",_reload)
    _button(actions,"PixelPen 원본",_pixelpen)
    _button(actions,"왼쪽 부품",func(): _pixelpen_part("left"))
    _button(actions,"오른쪽 부품",func(): _pixelpen_part("right"))
    _button(actions,"공통 뼈대",_native_rig)
    _button(actions,"뼈대 재출력",_bake_rig)
    _button(actions,"SpriteFrames",_native_frames)
    _button(actions,"보행 미리보기 장면",_preview_scene)
    status = Label.new()
    panel.add_child(status)
    for select in [direction,animation,layer]: select.item_selected.connect(func(_i): playing.button_pressed=false; _refresh())
    frame.value_changed.connect(func(_v): _refresh())
    onion.toggled.connect(func(_v): _refresh())
    canvas.stroke_started.connect(func(): playing.button_pressed=false; before=data.duplicate(true))
    canvas.pixel_painted.connect(_paint)
    canvas.stroke_finished.connect(_finish_stroke)
    add_control_to_bottom_panel(panel,"주인공 도트")
    _reload()
    set_process(true)
func _button(parent: Control, title: String, action: Callable) -> void:
    var button = Button.new()
    button.text = title
    button.pressed.connect(action)
    parent.add_child(button)
func _selection() -> Array:
    return [layer.get_item_text(layer.selected),direction.get_item_text(direction.selected),animation.get_item_text(animation.selected),int(frame.value)]
func _refresh() -> void:
    if data.is_empty() or canvas==null: return
    arm_piece.visible=str(layer.get_item_text(layer.selected)).begins_with("arms")
    var selected = _selection()
    frame.max_value = Document.count(selected[2])-1
    var current = Document.frame_image(data,selected[0],selected[1],selected[2],int(frame.value))
    var ghost: Image = null
    if onion.button_pressed and frame.value>0: ghost = Document.frame_image(data,selected[0],selected[1],selected[2],int(frame.value)-1)
    canvas.show_image(current,ghost)
    preview.texture = ImageTexture.create_from_image(Document.composed(data,selected[1],selected[2],int(frame.value)))
    status.text = ("미저장 · " if dirty else "저장됨 · ")+" / ".join(selected.map(func(v): return str(v)))
func _reload() -> void:
    data = Document.read_source()
    source_hash = FileAccess.get_sha256(Document.SOURCE)
    history.clear()
    future.clear()
    dirty = false
    _refresh()
func _paint(point: Vector2i, erase: bool) -> void:
    var s = _selection()
    var key = Document.key(s[0],s[1],s[2],s[3])
    if not data.patches.has(key): data.patches[key] = {}
    data.patches[key]["%d,%d" % [point.x,point.y]] = "." if erase or color=="." else color
    dirty = true
    _refresh()
func _finish_stroke() -> void:
    if before==data: return
    history.append(before)
    if history.size()>40: history.pop_front()
    future.clear()
func _undo() -> void:
    if history.is_empty(): return
    future.append(data.duplicate(true))
    data = history.pop_back()
    dirty = true
    _refresh()
func _redo() -> void:
    if future.is_empty(): return
    history.append(data.duplicate(true))
    data = future.pop_back()
    dirty = true
    _refresh()
func _save() -> void:
    if source_hash!=FileAccess.get_sha256(Document.SOURCE):
        status.text = "외부 원본이 바뀌었습니다. 다시 읽은 뒤 편집해 주세요."
        return
    var file = FileAccess.open(Document.SOURCE,FileAccess.WRITE)
    if file==null:
        status.text = "수정 원본 저장 실패"
        return
    file.store_string(JSON.stringify(data,"  ")+"\n")
    file.close()
    source_hash = FileAccess.get_sha256(Document.SOURCE)
    var root = ProjectSettings.globalize_path("res://").trim_suffix("/").get_base_dir()
    var output: Array = []
    var code = OS.execute("node",PackedStringArray([root.path_join("scripts/build-arcana-reference-art.cjs"),"--hero-only"]),output,true,false)
    if code!=0:
        status.text = "시트 생성 실패: "+str(output).right(250)
        return
    dirty = false
    Document.clear_cache()
    EditorInterface.get_resource_filesystem().scan()
    _refresh()
func _pixelpen() -> void:
    var s = _selection()
    if str(s[0]).begins_with("arms"):
        _pixelpen_part("left")
        return
    if s[0].ends_with("-mask"):
        status.text = "가림 마스크는 현재 프레임 도트 패널에서 수정합니다."
        return
    var path = "res://art/source/heroine/skeletal/"+s[0]+"-"+s[1]+".png"
    EditorInterface.get_file_system_dock().navigate_to_path(path)
    DisplayServer.clipboard_set(ProjectSettings.globalize_path(path))
    EditorInterface.set_main_screen_editor("PixelPen")
    status.text = "PixelPen Import에서 복사된 경로를 여세요. 수정 후 같은 PNG로 Export하고 저장 + 시트 반영을 누르세요."
func _pixelpen_part(side: String) -> void:
    var selected = _selection()
    if selected[0]!="body" and not str(selected[0]).begins_with("boots") and not str(selected[0]).begins_with("arms"):
        status.text = "몸체나 신발 레이어를 선택해 주세요."
        return
    var path = "res://art/source/heroine/skeletal/leg-"+selected[1]+"-"+side+".png" if selected[0]=="body" else "res://art/source/heroine/parts/"+selected[0]+"-"+selected[1]+"-"+side+".png"
    if str(selected[0]).begins_with("arms"):
        path="res://art/source/heroine/skeletal/"+("bare-arm-" if selected[0]=="arms-bare" else "arm-")+["upper","fore","cuff","hand"][arm_piece.selected]+"-"+selected[1]+"-"+side+".png"
    EditorInterface.get_file_system_dock().navigate_to_path(path)
    DisplayServer.clipboard_set(ProjectSettings.globalize_path(path))
    EditorInterface.set_main_screen_editor("PixelPen")
    status.text = "한쪽 부품 경로를 복사했습니다. PNG Export 후 뼈대 재출력을 눌러 주세요."

func _native_rig() -> void:
    var d=direction.get_item_text(direction.selected)
    EditorInterface.open_scene_from_path("res://art/source/heroine/skeletal/scenes/rig-"+d+".tscn")
func _bake_rig() -> void:
    if bake_pid>0 and OS.is_process_running(bake_pid):return
    var root=ProjectSettings.globalize_path("res://").trim_suffix("/").get_base_dir()
    bake_pid=OS.create_process("pwsh",PackedStringArray(["-NoProfile","-File",root.path_join("scripts/rebuild-heroine-skeleton.ps1")]),false)
    status.text="공통 뼈대 출력 중입니다. 원본 장면을 먼저 저장해 주세요."

func _native_frames() -> void:
    EditorInterface.edit_resource(load("res://art/resources/heroine_frames.tres"))
func _preview_scene() -> void:
    EditorInterface.open_scene_from_path("res://scenes/characters/heroine_walk_preview.tscn")
func _process(delta: float) -> void:
    if bake_pid>0 and not OS.is_process_running(bake_pid):
        bake_pid=-1
        Document.clear_cache()
        EditorInterface.get_resource_filesystem().scan()
        var root=ProjectSettings.globalize_path("res://").trim_suffix("/").get_base_dir()
        var result=JSON.parse_string(FileAccess.get_file_as_string(root.path_join(".runtime/godot/skeleton-rebuild-result.json")))
        _refresh()
        status.text="뼈대와 도트 시트 반영 완료" if result is Dictionary and result.get("ok",false) else "뼈대 출력 실패: .runtime/godot/skeleton-bake.log를 확인해 주세요."
    if playing==null or not playing.button_pressed: return
    clock += delta*24.0
    if clock>=1.0:
        var count = Document.count(animation.get_item_text(animation.selected))
        frame.value = (int(frame.value)+int(clock))%count
        clock = fmod(clock,1.0)
func _exit_tree() -> void:
    Document.clear_cache()
    if panel!=null:
        remove_control_from_bottom_panel(panel)
        panel.queue_free()
