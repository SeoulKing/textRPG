extends Control

# Shared single-skill template. Node definitions and authoritative ranks come from API.
signal invest_requested(node_id: String)
signal reset_requested
signal close_requested
const Icon = preload("res://scripts/quickslot_icon.gd")
const INK = Color("26364d")
const MUTED = Color("586779")
const BLUE = Color("2789d8")
const GOLD = Color("be934d")
var spell: Dictionary = {}
var selected_id = "power"
var pending = false
var nodes: Array = []
var node_buttons: Dictionary = {}
var centers: Dictionary = {}
var heading: Label
var level_label: Label
var xp_label: Label
var points_label: Label
var xp_bar: ProgressBar
var close_button: Button
var detail_title: Label
var detail_text: Label
var detail_effect: Label
var detail_reason: Label
var invest_button: Button
var reset_button: Button
var spec_label: Label
var tree_area = Rect2()
var detail_area = Rect2()
var wide = false

func _label(text: String, font_size: int = 13, color: Color = INK) -> Label:
	var item = Label.new()
	item.text = text
	item.add_theme_font_size_override("font_size",font_size)
	item.add_theme_color_override("font_color",color)
	item.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(item)
	return item

func _skin(color: Color, border: Color) -> StyleBoxFlat:
	var value = StyleBoxFlat.new()
	value.bg_color = color
	value.border_color = border
	value.set_border_width_all(2)
	value.set_corner_radius_all(6)
	return value

func _button(text: String, action: Callable) -> Button:
	var item = Button.new()
	item.text = text
	item.custom_minimum_size = Vector2(44,44)
	item.add_theme_font_size_override("font_size",13)
	item.pressed.connect(action)
	add_child(item)
	return item

func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	offset_left = 10
	offset_right = -10
	offset_top = 10
	offset_bottom = -10
	texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	heading = _label(str(spell.get("name","스킬")),21)
	close_button = _button("×",func(): close_requested.emit())
	close_button.accessibility_name = "스킬 트리 닫기"
	level_label = _label("")
	xp_label = _label("",11,MUTED)
	points_label = _label("",13,BLUE)
	xp_bar = ProgressBar.new()
	xp_bar.show_percentage = false
	xp_bar.add_theme_stylebox_override("background",_skin(Color("dce5ed"),Color.TRANSPARENT))
	xp_bar.add_theme_stylebox_override("fill",_skin(BLUE,Color.TRANSPARENT))
	add_child(xp_bar)
	detail_title = _label("",16)
	detail_text = _label("",12,MUTED)
	detail_text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	detail_effect = _label("",12,BLUE)
	detail_effect.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	detail_reason = _label("",11,MUTED)
	detail_reason.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	invest_button = _button("1포인트 투자",func():
		if pending: return
		pending = true
		_update_detail()
		invest_requested.emit(selected_id))
	invest_button.add_theme_stylebox_override("normal",_skin(Color("d6ecff"),BLUE))
	reset_button = _button("초기화",func():
		if pending: return
		pending = true
		_update_detail()
		reset_requested.emit())
	reset_button.accessibility_name = "이 스킬의 트리 전체 초기화 및 포인트 반환"
	spec_label = _label("전문화",11,MUTED)
	spec_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	nodes = spell.get("tree",{}).get("nodes",[])
	var root_node = {"id":"root","rank":1,"maxRank":1,"row":0,"column":.5,"parents":[],"name":spell.get("name","스킬")}
	_build_node(root_node)
	for node in nodes: _build_node(node)
	resized.connect(_layout)
	_update_detail()
	_layout()

func _build_node(node: Dictionary) -> void:
	var id = str(node.id)
	var item = _button("",func():
		selected_id = id
		_update_detail()
		_restyle_nodes())
	# Existing spell textures are deliberately reused as temporary icons.
	var icon = Icon.new()
	icon.kind = str(node.id) if str(node.id) in ["meteor","giant_fireball","flame_barrage"] else str(spell.get("id","fireball"))
	icon.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	icon.offset_left = 5
	icon.offset_top = 4
	icon.offset_right = -5
	icon.offset_bottom = -12
	if int(node.get("rank",0)) == 0 and not node.get("available",false): icon.modulate = Color(.55,.57,.6)
	item.add_child(icon)
	var badge = Label.new()
	badge.text = "●" if id == "root" else "%d/%d" % [int(node.rank),int(node.maxRank)]
	if int(spell.get("tree",{}).get("level",1)) < int(node.get("level",1)): badge.text = "Lv.%d" % int(node.level)
	badge.add_theme_font_size_override("font_size",10)
	badge.add_theme_color_override("font_color",INK)
	badge.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	badge.mouse_filter = Control.MOUSE_FILTER_IGNORE
	badge.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	badge.offset_top = -15
	badge.offset_bottom = 0
	item.add_child(badge)
	item.accessibility_name = str(node.name)
	node_buttons[id] = item

func _restyle_nodes() -> void:
	for id in node_buttons:
		var item: Button = node_buttons[id]
		var node = _node(id)
		var border = BLUE if id == selected_id else GOLD if int(node.get("rank",0))>0 else Color("aab7c3")
		item.add_theme_stylebox_override("normal",_skin(Color("fffaf0"),border))
		item.add_theme_stylebox_override("hover",_skin(Color("e9f3fc"),BLUE))
		item.add_theme_stylebox_override("pressed",_skin(Color("d6ecff"),BLUE))
		if node.has("specialization"):
			# Diamond frame distinguishes mutually exclusive specialization nodes.
			item.add_theme_stylebox_override("normal",_skin(Color("fff0d7"),border))
	queue_redraw()

func _node(id: String) -> Dictionary:
	for node in nodes:
		if str(node.id) == id: return node
	return {"name":spell.get("name","스킬"),"rank":1,"maxRank":1,"current":"","next":"","reason":"기본 스킬","available":false}

func _update_detail() -> void:
	var data: Dictionary = spell.get("tree",{})
	level_label.text = ("Lv.%d · 마스터" if data.get("master",false) else "스킬 레벨 %d") % int(data.get("level",1))
	points_label.text = "남은 포인트 %d" % int(data.get("points",0))
	xp_label.text = "숙련도 %d / %d" % [int(data.get("xp",0)),int(data.get("xpRequired",400))]
	xp_bar.max_value = float(data.get("xpRequired",400))
	xp_bar.value = float(data.get("xp",0))
	var node = _node(selected_id)
	detail_title.text = str(node.name) if int(node.maxRank)==1 else "%s  %d / %d" % [str(node.name),int(node.rank),int(node.maxRank)]
	detail_text.text = "궁극기 · 레벨마다 하나 습득" if node.get("specialization","")=="ultimate" else "전문화" if node.has("specialization") else ""
	detail_effect.text = str(node.get("next","")) if int(node.rank)==0 else str(node.get("current",""))
	detail_reason.text = str(node.get("reason",""))
	invest_button.text = "자동 획득" if node.get("automatic",false) else "습득" if node.get("specialization","")=="ultimate" else "선택" if node.has("specialization") else "1포인트 투자"
	invest_button.disabled = pending or not node.get("available",false)
	reset_button.disabled = pending or not data.get("editable",false) or not _has_investment()
	_restyle_nodes()

func _has_investment() -> bool:
	for node in nodes:
		if int(node.get("rank",0))>0 and not node.get("automatic",false): return true
	return false

func _place(item: Control, rect: Rect2) -> void:
	item.position = rect.position
	item.size = rect.size

func _layout() -> void:
	if not is_instance_valid(heading): return
	wide = size.x >= 560 and size.x > size.y*1.2 and size.y < 620
	_place(heading,Rect2(14,8,size.x-78,34))
	_place(close_button,Rect2(size.x-56,6,44,44))
	var stat_width = size.x-28
	_place(level_label,Rect2(14,53,stat_width*.32,24))
	_place(xp_label,Rect2(14+stat_width*.33,53,stat_width*.38,20))
	_place(xp_bar,Rect2(14+stat_width*.33,77,stat_width*.35,5))
	_place(points_label,Rect2(14+stat_width*.72,53,stat_width*.28,24))
	if wide:
		detail_area = Rect2(size.x-238,100,224,size.y-114)
		tree_area = Rect2(18,103,size.x-276,size.y-118)
	else:
		detail_area = Rect2(14,size.y-164,size.x-28,152)
		tree_area = Rect2(12,98,size.x-24,size.y-272)
	_place(detail_title,Rect2(detail_area.position,Vector2(detail_area.size.x,25)))
	_place(detail_text,Rect2(detail_area.position+Vector2(0,27),Vector2(detail_area.size.x,19)))
	_place(detail_effect,Rect2(detail_area.position+Vector2(0,45),Vector2(detail_area.size.x,38)))
	_place(detail_reason,Rect2(detail_area.position+Vector2(0,86),Vector2(detail_area.size.x,18)))
	var action_y = detail_area.end.y-44 if not wide else detail_area.position.y+160
	_place(invest_button,Rect2(detail_area.position.x,action_y,detail_area.size.x-86,44))
	_place(reset_button,Rect2(detail_area.end.x-80,action_y,80,44))
	centers.clear()
	var all_nodes: Array = [{"id":"root","row":0,"column":.5}]+nodes
	var rows: float = 1.0
	for node in all_nodes: rows = maxf(rows,float(node.row)+1)
	for node in all_nodes:
		var point: Vector2
		if wide:
			point = tree_area.position+Vector2((float(node.row)+.5)/rows*tree_area.size.x,float(node.column)*tree_area.size.y)
		else:
			point = tree_area.position+Vector2(float(node.column)*tree_area.size.x,(float(node.row)+.5)/rows*tree_area.size.y)
		centers[str(node.id)] = point
		var item: Button = node_buttons[str(node.id)]
		_place(item,Rect2(point-Vector2(24,27),Vector2(48,54)))
	var spec_center: Vector2 = (centers.get("burst",Vector2.ZERO)+centers.get("reach",Vector2.ZERO))*.5
	_place(spec_label,Rect2(spec_center-Vector2(28,11),Vector2(56,22)))
	queue_redraw()

func _draw() -> void:
	draw_style_box(_skin(Color("fffaf0"),Color("e0d4bf")),Rect2(Vector2.ZERO,size))
	if not is_instance_valid(heading): return
	draw_line(Vector2(14,91),Vector2(size.x-14,91),Color("dfd7ca"),1)
	if wide: draw_line(detail_area.position-Vector2(9,0),Vector2(detail_area.position.x-9,size.y-14),Color("dfd7ca"),1)
	else: draw_line(detail_area.position-Vector2(0,7),Vector2(detail_area.end.x,detail_area.position.y-7),Color("dfd7ca"),1)
	for node in nodes:
		var destination: Vector2 = centers.get(str(node.id),Vector2.ZERO)
		var parents: Array = node.parents if not node.parents.is_empty() else ["root"]
		for parent in parents:
			var source: Vector2 = centers.get(str(parent),Vector2.ZERO)
			var color = GOLD if int(node.rank)>0 else BLUE if node.get("available",false) else Color("bac2ca")
			var middle = (source+destination)*.5
			var path = PackedVector2Array([source,Vector2(middle.x,source.y),Vector2(middle.x,destination.y),destination]) if wide else PackedVector2Array([source,Vector2(source.x,middle.y),Vector2(destination.x,middle.y),destination])
			draw_polyline(path,color,2,true)
		if node.has("specialization"):
			draw_polyline(PackedVector2Array([destination+Vector2(0,-34),destination+Vector2(32,0),destination+Vector2(0,34),destination+Vector2(-32,0),destination+Vector2(0,-34)]),GOLD,2,true)
