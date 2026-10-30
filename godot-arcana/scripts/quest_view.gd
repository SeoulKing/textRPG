extends PanelContainer

signal close_requested
signal map_requested
const Icon = preload("res://scripts/quickslot_icon.gd")
const INK = Color("172e58")
const MUTED = Color("647a96")
const BLUE = Color("087fff")
const GREEN = Color("079e60")
const AMBER = Color("cf680b")
const PAPER = Color("fffaf0")
const EDGE = Color("dfc6a6")
var quests: Array = []
var selected_tab: int = 0
var rows: VBoxContainer
var tabs: Array[Button] = []
var scroll: ScrollContainer

func skin(background: Color, border: Color = Color.TRANSPARENT) -> StyleBoxFlat:
	var value = StyleBoxFlat.new()
	value.bg_color = background
	value.border_color = border
	value.set_border_width_all(1 if border.a > 0 else 0)
	value.set_corner_radius_all(9)
	value.content_margin_left = 12
	value.content_margin_right = 12
	value.content_margin_top = 12
	value.content_margin_bottom = 12
	return value

func text(value: String, font_size: int = 14, color: Color = INK, strong: bool = false) -> Label:
	var node = Label.new()
	node.text = value
	node.add_theme_font_size_override("font_size", font_size)
	node.add_theme_color_override("font_color", color)
	if strong: node.add_theme_font_override("font", preload("res://fonts/NotoSansKR-SemiBold.tres"))
	return node

func wrapped(value: String, font_size: int = 14, color: Color = INK, strong: bool = false) -> Label:
	var node = text(value, font_size, color, strong)
	node.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	node.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return node

func action(value: String, callback: Callable) -> Button:
	var node = Button.new()
	node.text = value
	node.custom_minimum_size = Vector2(44, 44)
	node.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	node.pressed.connect(callback)
	return node

func _ready() -> void:
	texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	resized.connect(_fit)
	add_theme_stylebox_override("panel", skin(PAPER, EDGE))
	var stack = VBoxContainer.new()
	stack.add_theme_constant_override("separation", 12)
	add_child(stack)
	var header = HBoxContainer.new()
	stack.add_child(header)
	var title = text("퀘스트", 24, INK, true)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(title)
	header.add_child(action("×", func(): close_requested.emit()))
	var tab_row = HBoxContainer.new()
	tab_row.add_theme_constant_override("separation", 4)
	stack.add_child(tab_row)
	for i in range(3):
		var index = i
		var tab = action("", func(): selected_tab = index; scroll.scroll_vertical = 0; rebuild())
		tab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		tab.add_theme_font_size_override("font_size", 14)
		tab_row.add_child(tab)
		tabs.append(tab)
	scroll = ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	stack.add_child(scroll)
	rows = VBoxContainer.new()
	rows.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	rows.add_theme_constant_override("separation", 12)
	scroll.add_child(rows)
	if not quests.any(func(quest): return str(quest.get("status", "inactive")) == "active"):
		selected_tab = 1 if quests.any(func(quest): return str(quest.get("status", "inactive")) == "inactive") else 2
	_fit()
	rebuild()

func _fit() -> void:
	var viewport_size = get_viewport_rect().size
	var margin = maxf(12.0, (viewport_size.x - 760.0) * 0.5)
	offset_left = margin
	offset_right = -margin
	offset_top = 12
	offset_bottom = -12

func rebuild() -> void:
	for child in rows.get_children():
		rows.remove_child(child)
		child.queue_free()
	var states = ["active", "inactive", "completed"]
	var names = ["진행 중", "미수락", "완료"]
	for i in range(3):
		var count = quests.filter(func(quest): return str(quest.get("status", "inactive")) == states[i]).size()
		tabs[i].text = "%s %d" % [names[i], count]
		tabs[i].add_theme_stylebox_override("normal", skin(Color("eaf4ff") if i == selected_tab else Color.TRANSPARENT))
		tabs[i].add_theme_color_override("font_color", BLUE if i == selected_tab else MUTED)
	var visible_quests = quests.filter(func(quest): return str(quest.get("status", "inactive")) == states[selected_tab])
	# Bring reportable quests to the top without changing the server's quest states.
	var ordered: Array = []
	for quest in visible_quests:
		if quest.get("readyToReport", false): ordered.append(quest)
	for quest in visible_quests:
		if not quest.get("readyToReport", false): ordered.append(quest)
	if ordered.is_empty():
		rows.add_child(wrapped(["진행 중인 퀘스트가 없습니다.", "새로 받을 퀘스트가 없습니다.", "완료한 퀘스트가 없습니다."][selected_tab], 14, MUTED))
	for quest in ordered: add_quest(quest)

func divider(parent: VBoxContainer) -> void:
	var line = HSeparator.new()
	line.modulate = Color("eadbca")
	parent.add_child(line)

func requirement(parent: VBoxContainer, entry: Dictionary, item: bool) -> void:
	var row = HBoxContainer.new()
	row.custom_minimum_size.y = 44
	row.add_theme_constant_override("separation", 10)
	parent.add_child(row)
	var id = str(entry.get("itemId", ""))
	# Thumbnails belong to item conditions only; never decorate tasks with fake items.
	if item and Icon.SPELL_TEXTURES.has(id):
		var icon = Icon.new()
		icon.kind = id
		icon.custom_minimum_size = Vector2(42, 42)
		icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		row.add_child(icon)
	var name_label = wrapped(str(entry.get("name", "")), 15, INK, true)
	name_label.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(name_label)
	var current = maxi(0, int(entry.get("ownedAmount", 0)))
	var needed = maxi(1, int(entry.get("amount", 1)))
	var amount_label = text("%d / %d" % [current, needed], 20, GREEN if current >= needed else AMBER, true)
	amount_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	row.add_child(amount_label)

func add_quest(quest: Dictionary) -> void:
	var frame = PanelContainer.new()
	frame.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	frame.add_theme_stylebox_override("panel", skin(Color("fffdf8"), EDGE))
	rows.add_child(frame)
	var body = VBoxContainer.new()
	body.add_theme_constant_override("separation", 9)
	frame.add_child(body)
	body.add_child(wrapped(str(quest.get("name", "")), 18, INK, true))
	var status = str(quest.get("status", "inactive"))
	var ready = status == "active" and bool(quest.get("readyToReport", false))
	var status_label = "보고 가능" if ready else {"active":"진행 중", "inactive":"미수락", "completed":"완료"}.get(status, status)
	body.add_child(text(status_label, 12, GREEN if ready or status == "completed" else MUTED))
	divider(body)
	var entries = quest.get("requirements", [])
	var objectives = quest.get("objectives", [])
	for entry in entries: requirement(body, entry, true)
	for entry in objectives: requirement(body, entry, false)
	if entries.is_empty() and objectives.is_empty():
		body.add_child(wrapped(str(quest.get("summary", "")), 14, MUTED))
	divider(body)
	var report_to = str(quest.get("reportTo", ""))
	if not report_to.is_empty(): body.add_child(wrapped("보고 대상  " + report_to, 12, MUTED))
	var reward = str(quest.get("rewardText", ""))
	if not reward.is_empty(): body.add_child(wrapped("보상  " + reward, 13, INK))
	if status != "completed":
		var map_button = action("지도 보기", func(): map_requested.emit())
		map_button.size_flags_horizontal = Control.SIZE_SHRINK_END
		map_button.add_theme_color_override("font_color", BLUE)
		body.add_child(map_button)