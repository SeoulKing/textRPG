extends VBoxContainer

const Appearance := preload("res://scripts/characters/hero_v12/equipment_appearance.gd")
const HeroModel := preload("res://art/characters/hero-v12/hero.glb")
const Thumbnail := preload("res://scripts/item_thumbnail.gd")
const ACTIVE := Color("e0efff")
const BLUE := Color("3c79b5")
const EMPTY := Color("778291")
const SLOT_SIZE := 40
const SLOT_NAMES := {
	"head": "머리", "top": "상의", "gloves": "장갑", "ringLeft": "반지 1", "bottom": "하의",
	"earrings": "귀걸이", "necklace": "목걸이", "outerwear": "겉옷", "ringRight": "반지 2", "feet": "신발",
	"mainHand": "주무기",
}
const FALLBACK_ICONS := {
	"head": "slot-head", "top": "travel-shirt", "gloves": "slot-gloves", "ringLeft": "bronze-ring",
	"bottom": "travel-trousers", "earrings": "silver-earrings", "necklace": "silver-pendant",
	"outerwear": "slot-outerwear", "ringRight": "bronze-ring", "feet": "travel-boots", "mainHand": "woodcutting-axe",
}
const SLOT_ROWS := [
	["head", 1, 2], ["top", 1, 54], ["gloves", 1, 101], ["ringLeft", 1, 148], ["bottom", 1, 192],
	["earrings", -1, 14], ["necklace", -1, 58], ["outerwear", -1, 101], ["ringRight", -1, 148], ["feet", -1, 201],
	["mainHand", 1, 238],
]
const BODY_POINTS := {
	"head": Vector2(0.45, 0.19), "top": Vector2(0.44, 0.45), "gloves": Vector2(0.33, 0.60),
	"ringLeft": Vector2(0.33, 0.65), "bottom": Vector2(0.43, 0.75), "earrings": Vector2(0.61, 0.30),
	"necklace": Vector2(0.50, 0.40), "outerwear": Vector2(0.63, 0.43), "ringRight": Vector2(0.67, 0.65),
	"feet": Vector2(0.58, 0.90), "mainHand": Vector2(0.33, 0.65),
}

var host: Node
var inventory: Dictionary
var equipped: Dictionary
var catalog: Dictionary
var selected_slot := "top"
var selected_item := ""
var request_change: Callable
var online := true
var pending := false
var _slot_buttons: Dictionary[String, Button] = {}
var _slot_labels: Dictionary[String, Label] = {}
var _layout: BoxContainer
var _doll: Control
var _picker: VBoxContainer
var _separator: VSeparator
var _preview: TextureRect
var _slot_pointer: Control
var _stage: SubViewport
var _appearance := Appearance.new()


func _ready() -> void:
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_layout = BoxContainer.new()
	_layout.add_theme_constant_override("separation", 14)
	add_child(_layout)
	_doll = Control.new()
	_doll.custom_minimum_size.y = 278
	_doll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_layout.add_child(_doll)
	_create_preview()
	_slot_pointer = Control.new()
	_slot_pointer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_slot_pointer.draw.connect(_draw_slot_pointer)
	_doll.add_child(_slot_pointer)
	for slot: String in SLOT_NAMES:
		_create_slot(slot)
	_doll.resized.connect(_position_slots)
	_separator = VSeparator.new()
	_layout.add_child(_separator)
	_picker = VBoxContainer.new()
	_picker.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_picker.size_flags_stretch_ratio = 0.72
	_picker.add_theme_constant_override("separation", 7)
	_layout.add_child(_picker)
	host.panel_scroll.resized.connect(_resize_columns)
	_resize_columns()
	_refresh()


func update_loadout(items: Dictionary, bag: Dictionary) -> void:
	if equipped == items and inventory == bag:
		return
	equipped = items.duplicate()
	inventory = bag.duplicate()
	_refresh()


func set_pending(value: bool) -> void:
	pending = value
	_refresh()


func _create_preview() -> void:
	_stage = SubViewport.new()
	_stage.size = Vector2i(76, 128)
	_stage.own_world_3d = true
	_stage.transparent_bg = true
	_stage.render_target_update_mode = SubViewport.UPDATE_DISABLED
	add_child(_stage)
	var camera := Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 1.86
	camera.position = Vector3(0, 0.85, 4)
	_stage.add_child(camera)
	camera.current = true
	var model := HeroModel.instantiate() as Node3D
	_stage.add_child(model)
	var skeleton := model.find_child("Skeleton3D", true, false) as Skeleton3D
	if skeleton == null:
		var rigs := model.find_children("*", "Skeleton3D", true, false)
		if not rigs.is_empty():
			skeleton = rigs[0] as Skeleton3D
	if skeleton != null:
		_appearance.setup(model, skeleton)
	var animation := model.find_child("AnimationPlayer", true, false) as AnimationPlayer
	if animation != null and animation.has_animation(&"Idle"):
		animation.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
		animation.play(&"Idle")
		animation.advance(0.0)
	_preview = TextureRect.new()
	_preview.texture = _stage.get_texture()
	_preview.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	_preview.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_preview.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_preview.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_doll.add_child(_preview)


func _create_slot(slot: String) -> void:
	var button: Button = host.button("", _select_slot.bind(slot), Vector2(SLOT_SIZE, SLOT_SIZE))
	button.icon_alignment = HORIZONTAL_ALIGNMENT_CENTER
	button.expand_icon = true
	button.add_theme_constant_override("icon_max_width", 36)
	button.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	_doll.add_child(button)
	_slot_buttons[slot] = button
	var label: Label = host.label(SLOT_NAMES[slot], 13, host.INK, true)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_doll.add_child(label)
	_slot_labels[slot] = label


func _resize_columns() -> void:
	var narrow: bool = host.panel_scroll.size.x < 525
	_layout.vertical = narrow
	_picker.custom_minimum_size.x = 0 if narrow else 200
	_separator.visible = not narrow
	_position_slots()


func _position_slots() -> void:
	var width := _doll.size.x
	var middle := width * 0.5
	_preview.size = Vector2(minf(width * 0.48, 146), 242)
	_preview.position = Vector2(middle - _preview.size.x * 0.5, 0)
	var gap := minf(81.0, width * 0.225)
	for row: Array in SLOT_ROWS:
		var slot: String = row[0]
		var on_left: bool = row[1] == 1
		var x := maxf(57, middle - gap - SLOT_SIZE) if on_left else minf(width - 97, middle + gap)
		var y: float = row[2]
		var button: Button = _slot_buttons[slot]
		button.position = Vector2(x, y)
		button.size = Vector2(SLOT_SIZE, SLOT_SIZE)
		var label: Label = _slot_labels[slot]
		label.size = Vector2(53, SLOT_SIZE)
		label.position = Vector2(x - 59 if on_left else x + SLOT_SIZE + 6, y)
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT if on_left else HORIZONTAL_ALIGNMENT_LEFT
	_slot_pointer.queue_redraw()


func _draw_slot_pointer() -> void:
	var button: Button = _slot_buttons[selected_slot]
	var point: Vector2 = _preview.position + _preview.size * BODY_POINTS[selected_slot]
	var edge := button.position + Vector2(0, SLOT_SIZE * 0.5)
	if edge.x < point.x:
		edge.x += SLOT_SIZE
	var tip := Vector2(point.x, point.y)
	var elbow := Vector2(lerpf(edge.x, tip.x, 0.40), edge.y)
	_slot_pointer.draw_polyline(PackedVector2Array([edge, elbow, tip]), BLUE, 1.5, true)
	_slot_pointer.draw_circle(tip, 3.3, host.PAPER, true, -1.0, true)
	_slot_pointer.draw_circle(tip, 2.1, BLUE, true, -1.0, true)


func _select_slot(slot: String) -> void:
	selected_slot = slot
	selected_item = ""
	_refresh()


func _select_item(item: String) -> void:
	selected_item = item
	_refresh()


func _slot_kind(slot: String) -> String:
	return "ring" if slot in ["ringLeft", "ringRight"] else slot


func _current_item() -> String:
	return str(equipped.get(selected_slot, ""))


func _item_name(item: String) -> String:
	return str(catalog.get(item, {}).get("definition", {}).get("name", item))


func _item_icon(item: String, slot: String) -> Texture2D:
	if catalog.has(item):
		var texture := Thumbnail.load_texture(catalog[item].get("thumbnail", {}))
		if texture != null:
			return texture
	var icon := {"travelShirt": "travel-shirt", "travelTrousers": "travel-trousers", "travelBoots": "travel-boots"}
	return Thumbnail.load_texture({"status": "ready", "path": "res://art/export/items/" + icon.get(item, FALLBACK_ICONS[slot]) + ".png"})


func _available(item: String) -> bool:
	var used := 0
	for slot: String in equipped:
		if slot != selected_slot and equipped[slot] == item:
			used += 1
	return int(inventory.get(item, 0)) > used


func _slot_style(background: Color, border: Color) -> StyleBoxFlat:
	var style: StyleBoxFlat = host.style(background, border)
	style.set_content_margin_all(0)
	style.set_corner_radius_all(7)
	return style


func _refresh() -> void:
	if not is_instance_valid(_picker):
		return
	for slot: String in SLOT_NAMES:
		var current := str(equipped.get(slot, ""))
		var button: Button = _slot_buttons[slot]
		button.icon = _item_icon(current, slot)
		button.tooltip_text = SLOT_NAMES[slot] + " · " + ("비어 있음" if current.is_empty() else _item_name(current))
		button.accessibility_name = button.tooltip_text
		var selected := slot == selected_slot
		button.add_theme_stylebox_override("normal", _slot_style(ACTIVE if selected else Color("f9f5ec"), BLUE if selected else host.EDGE))
		button.add_theme_stylebox_override("hover", _slot_style(ACTIVE, BLUE))
		button.add_theme_stylebox_override("pressed", _slot_style(ACTIVE, BLUE))
		for key: String in ["icon_normal_color", "icon_hover_color", "icon_pressed_color", "icon_focus_color"]:
			button.add_theme_color_override(key, Color(EMPTY, 0.36) if current.is_empty() else Color.WHITE)
		_slot_labels[slot].add_theme_color_override("font_color", BLUE if selected else host.INK)
	_refresh_picker()
	_slot_pointer.queue_redraw()
	var preview := equipped.duplicate()
	if not selected_item.is_empty():
		preview[selected_slot] = selected_item
	_appearance.apply(preview)
	_stage.render_target_update_mode = SubViewport.UPDATE_ONCE


func _refresh_picker() -> void:
	for child in _picker.get_children():
		_picker.remove_child(child)
		child.queue_free()
	_picker.add_child(host.label(SLOT_NAMES[selected_slot], 19, host.INK, true))
	_picker.add_child(HSeparator.new())
	var current := _current_item()
	var items: Array[String] = []
	if not current.is_empty():
		items.append(current)
	for item: String in catalog:
		if item != current and catalog[item].get("equipmentSlot", "") == _slot_kind(selected_slot) and int(inventory.get(item, 0)) > 0:
			items.append(item)
	if selected_item not in items:
		selected_item = ""
	var choices := ScrollContainer.new()
	choices.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	choices.custom_minimum_size.y = 116
	choices.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_picker.add_child(choices)
	var list := VBoxContainer.new()
	list.add_theme_constant_override("separation", 5)
	list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	choices.add_child(list)
	if items.is_empty():
		list.add_child(host.label("보유한 장비가 없습니다.", 13, host.MUTED))
	for item: String in items:
		_add_item_row(list, item, current)
	var candidate := current if selected_item.is_empty() else selected_item
	var remove := not candidate.is_empty() and candidate == current and candidate != str(Appearance.DEFAULTS.get(selected_slot, ""))
	var action: Button = host.button("해제" if remove else "장착", _submit.bind("" if remove else candidate), Vector2(0, 40))
	action.disabled = pending or not online or (not remove and (candidate.is_empty() or candidate == current or not _available(candidate)))
	if pending:
		action.text = "적용 중…"
	action.add_theme_stylebox_override("normal", _slot_style(BLUE, BLUE))
	action.add_theme_stylebox_override("hover", _slot_style(Color("366999"), BLUE))
	action.add_theme_stylebox_override("pressed", _slot_style(Color("2b5a88"), BLUE))
	action.add_theme_stylebox_override("disabled", _slot_style(Color("e9e6e0"), host.EDGE))
	for key: String in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color"]:
		action.add_theme_color_override(key, Color.WHITE)
	action.add_theme_color_override("font_disabled_color", host.MUTED)
	_picker.add_child(action)


func _add_item_row(list: VBoxContainer, item: String, current: String) -> void:
	var selected := item == selected_item
	var row: Button = host.button("", _select_item.bind(item), Vector2(0, 44))
	row.disabled = pending
	row.accessibility_name = _item_name(item)
	row.add_theme_stylebox_override("normal", _slot_style(ACTIVE if selected else Color("f9f5ec"), BLUE if selected else host.EDGE))
	row.add_theme_stylebox_override("hover", _slot_style(ACTIVE, BLUE))
	row.add_theme_stylebox_override("pressed", _slot_style(ACTIVE, BLUE))
	list.add_child(row)
	var info := HBoxContainer.new()
	info.mouse_filter = Control.MOUSE_FILTER_IGNORE
	info.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	info.offset_left = 5
	info.offset_right = -8
	row.add_child(info)
	var item_texture := Thumbnail.new(_item_icon(item, selected_slot))
	item_texture.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	info.add_child(item_texture)
	var name_label: Label = host.label(_item_name(item), 14, host.INK, true)
	name_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	info.add_child(name_label)
	if item == current or not _available(item):
		var status: Label = host.label("착용 중" if item == current else "다른 칸에 착용 중", 11, BLUE)
		status.mouse_filter = Control.MOUSE_FILTER_IGNORE
		info.add_child(status)


func _submit(item: String) -> void:
	if not pending:
		request_change.call(selected_slot, item)
