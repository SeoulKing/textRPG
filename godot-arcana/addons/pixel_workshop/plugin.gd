@tool
extends EditorPlugin
const Document = preload("res://addons/pixel_workshop/pixel_document.gd")
const Canvas = preload("res://addons/pixel_workshop/pixel_canvas.gd")
var panel: VBoxContainer
var canvas: Control
var preview: TextureRect
var animations: OptionButton
var modes: OptionButton
var frame: SpinBox
var status: Label
var play: CheckButton
var onion: CheckButton
var data: Dictionary
var source_hash = ""
var animation = "idle"
var symbol = "g"
var clock = 0.0
var history: Array[Dictionary] = []
var future: Array[Dictionary] = []
var stroke_before: Dictionary
var dirty = false

func _enter_tree() -> void:
	panel = VBoxContainer.new()
	var bar = HBoxContainer.new()
	panel.add_child(bar)
	animations = OptionButton.new()
	bar.add_child(animations)
	animations.item_selected.connect(_select_animation)
	frame = SpinBox.new()
	frame.prefix = "프레임 "
	frame.step = 1
	bar.add_child(frame)
	frame.value_changed.connect(func(_value): _refresh())
	play = CheckButton.new()
	play.text = "재생"
	bar.add_child(play)
	onion = CheckButton.new()
	onion.text = "이전 프레임"
	bar.add_child(onion)
	onion.toggled.connect(func(_value): _refresh())
	var body = HBoxContainer.new()
	panel.add_child(body)
	canvas = Canvas.new()
	body.add_child(canvas)
	canvas.stroke_started.connect(_begin_stroke)
	canvas.pixel_painted.connect(_paint)
	canvas.stroke_finished.connect(_end_stroke)
	var tools = VBoxContainer.new()
	body.add_child(tools)
	modes = OptionButton.new()
	tools.add_child(modes)
	modes.item_selected.connect(func(_index): play.button_pressed=false; _refresh())
	var palette = HBoxContainer.new()
	tools.add_child(palette)
	data = Document.read_source()
	for color in data.palette:
		var button = Button.new()
		button.text = "·" if color == "." else str(color)
		button.custom_minimum_size = Vector2(30,30)
		button.modulate = Color(data.palette[color]) if color != "." else Color.WHITE
		button.tooltip_text = "지우개" if color == "." else str(color)+" #"+str(data.palette[color])
		button.pressed.connect(func(): symbol=color; _refresh())
		palette.add_child(button)
	preview = TextureRect.new()
	preview.custom_minimum_size = Vector2(128,160)
	preview.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	preview.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	preview.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	tools.add_child(preview)
	var help = Label.new()
	help.text = "왼쪽 클릭/드래그: 칠하기 · 오른쪽: 지우기\n공통 레이어: 모든 동작에 반영\n현재 프레임: 해당 좌표만 수정\n금색 표시: 접지점 (32,74) · 선택색: g"
	tools.add_child(help)
	var actions = HBoxContainer.new()
	tools.add_child(actions)
	_button(actions,"되돌리기",_undo)
	_button(actions,"다시 하기",_redo)
	_button(actions,"저장 + 시트 반영",_save)
	_button(actions,"파일 다시 읽기",_reload)
	status = Label.new()
	tools.add_child(status)
	add_control_to_bottom_panel(panel,"슬라임 도트")
	_reload()
	set_process(true)

func _button(parent: Control, title: String, action: Callable) -> void:
	var button = Button.new()
	button.text = title
	button.pressed.connect(action)
	parent.add_child(button)

func _reload() -> void:
	data = Document.read_source()
	source_hash = FileAccess.get_sha256(Document.SOURCE)
	history.clear()
	future.clear()
	dirty = false
	animations.clear()
	for name in data.animations: animations.add_item(name)
	modes.clear()
	modes.add_item("현재 프레임 수정")
	for name in data.layers: modes.add_item("공통: "+str(name))
	_select_animation(0)

func _select_animation(index: int) -> void:
	animation = animations.get_item_text(index)
	frame.max_value = int(data.animations[animation].count)-1
	frame.value = 0
	clock = 0
	_refresh()

func _refresh() -> void:
	if canvas == null or data.is_empty(): return
	var image = Document.frame_image(data,animation,int(frame.value))
	preview.texture = ImageTexture.create_from_image(image)
	var ghost: Image = null
	if modes.selected>0:
		image = Document.layer_image(data,data.layers.keys()[modes.selected-1])
	elif onion.button_pressed and frame.value>0:
		ghost = Document.frame_image(data,animation,int(frame.value)-1)
	canvas.show_image(image,ghost)
	status.text = ("미저장 · " if dirty else "저장됨 · ")+animation+" / "+str(int(frame.value))+" · 색 "+symbol

func _begin_stroke() -> void:
	play.button_pressed = false
	stroke_before = data.duplicate(true)

func _paint(point: Vector2i, erase: bool) -> void:
	var color = "." if erase else symbol
	if modes.selected>0:
		var layer: String = data.layers.keys()[modes.selected-1]
		var row: String = data.layers[layer][point.y]
		data.layers[layer][point.y] = row.substr(0,point.x)+color+row.substr(point.x+1)
	else:
		var key = animation+"/"+str(int(frame.value))
		if not data.patches.has(key): data.patches[key] = {}
		data.patches[key]["%d,%d" % [point.x,point.y]] = color
	dirty = true
	_refresh()

func _end_stroke() -> void:
	if stroke_before == data: return
	history.append(stroke_before)
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
	if FileAccess.get_sha256(Document.SOURCE) != source_hash:
		status.text = "외부에서 원본이 바뀌었습니다. 파일 다시 읽기 후 수정해 주세요."
		return
	var file = FileAccess.open(Document.SOURCE+".tmp",FileAccess.WRITE)
	if file == null:
		status.text = "원본 저장 실패: "+error_string(FileAccess.get_open_error())
		return
	file.store_string(JSON.stringify(data,"  ")+"\n")
	file.close()
	var error = DirAccess.rename_absolute(Document.SOURCE+".tmp",Document.SOURCE)
	if error == OK:
		source_hash = FileAccess.get_sha256(Document.SOURCE)
		error = Document.bake(data)
	if error != OK:
		status.text = "저장/시트 반영 실패: "+error_string(error)
		return
	dirty = false
	EditorInterface.get_resource_filesystem().scan()
	_refresh()

func _process(delta: float) -> void:
	if play == null or not play.button_pressed or modes.selected>0: return
	clock += delta*float(data.animations[animation].fps)
	if clock>=1:
		var next = int(frame.value)+int(clock)
		clock = fmod(clock,1.0)
		var count = int(data.animations[animation].count)
		if next>=count and not data.animations[animation].loop:
			play.button_pressed = false
			next = count-1
		frame.value = next%count

func _exit_tree() -> void:
	remove_control_from_bottom_panel(panel)
	panel.queue_free()
