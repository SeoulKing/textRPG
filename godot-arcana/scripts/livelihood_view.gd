extends RefCounted

const TITLE := "생활 수첩"
const PANEL := "livelihood"
const ROLES := ["fishing", "cooking", "merchant", "crafting"]
const ROLE_NAMES := {"none": "미지정", "fishing": "어부", "cooking": "요리사", "merchant": "상인", "crafting": "제작자"}

var main: Node
var _data: Dictionary = {}
var _tab := 0
var _game_id := ""
var _location := ""
var _place_revision := -1
var _connection := -1
var _simple := false
var _request := 0
var _message := ""


func _init(host: Node) -> void:
	main = host


func _visible() -> bool:
	return main.panel_mode == PANEL and main.ui.overlay.visible and main.ui.panel_title.text == TITLE


func _current(request: int) -> bool:
	return _request == request and _visible() and _game_id == str(main.game_id) \
		and _location == str(main._state().get("location", "")) \
		and _place_revision == int(main.snapshot.get("onlinePlaceRevision", 0)) \
		and _connection == main.combat_socket.connection_generation and _simple == main.simplified_play.enabled


func sync() -> void:
	if _visible() and not _current(_request):
		main.ui.close_panel()


func panel_closed() -> void:
	_request += 1


func open() -> void:
	if not main.online_world or main.busy or main.fishing.visible or main.life.blocking(): return
	_game_id = str(main.game_id)
	_location = str(main._state().get("location", ""))
	_place_revision = int(main.snapshot.get("onlinePlaceRevision", 0))
	_connection = main.combat_socket.connection_generation
	_simple = main.simplified_play.enabled
	_data = {}
	_tab = 0
	main.panel_mode = PANEL
	_read(true)


func _route() -> String:
	return "/api/games/%s/livelihood" % _game_id.uri_encode()


func _waiting(text: String) -> void:
	main.ui.open_panel(TITLE)
	main.ui.paragraph(text, main.ui.MUTED)


func _set_data(reply: Dictionary) -> bool:
	var data: Variant = reply.get("livelihood")
	if not data is Dictionary or data.get("focus", "") not in ROLE_NAMES \
		or not data.get("fishing") is Dictionary or not data.get("cooking") is Dictionary \
		or not data.get("merchant") is Dictionary or not data.get("crafting") is Dictionary:
		return false
	_data = data
	return true


func _read(select_focus: bool = false, previous_error: String = "", requested_focus: String = "") -> void:
	_request += 1
	var request := _request
	_waiting("생활 기록을 불러오고 있습니다…")
	var route := "%s?controller=%s" % [_route(), str(main.client_id).uri_encode()]
	var reply: Dictionary = await main._api(route, HTTPClient.METHOD_GET, {}, 8.0)
	if not _current(request): return
	if _set_data(reply):
		var focus := str(_data.focus)
		if select_focus: _tab = maxi(0, ROLES.find(focus))
		_message = "현재 선택을 다시 불러왔습니다." if requested_focus == focus else previous_error
	else:
		_data = {}
		_message = str(reply.get("message", "기록을 확인하지 못했습니다. 생활 수첩을 다시 불러와 주세요."))
	_render()


func _saved_message(focus: String) -> String:
	if focus == "none": return "중점 활동을 해제했습니다."
	return "%s 활동을 중점으로 저장했습니다." % ROLE_NAMES[focus]


func _choose_focus(focus: String) -> void:
	if not _current(_request) or main.busy or _data.is_empty() or focus == _data.focus: return
	if not main.combat_socket.socket_ready:
		main.ui.toast("세계에 다시 연결한 뒤 중점 활동을 저장해 주세요.")
		return
	_request += 1
	var request := _request
	var body := {"controller": main.client_id, "focus": focus}
	main.busy = true
	_waiting("중점 활동을 저장하고 있습니다…")
	var reply: Dictionary = await main._api(_route(), HTTPClient.METHOD_POST, body, 8.0)
	main.busy = false
	if not _current(request): return
	if _set_data(reply):
		_message = _saved_message(str(_data.focus))
		_render()
	else:
		var error := str(reply.get("message", "중점 활동의 저장 결과를 확인하지 못했습니다."))
		_read(false, error, focus)


func _select_tab(tab: int) -> void:
	if not _current(_request): return
	_tab = tab
	_message = ""
	_render()


func _render() -> void:
	var ui = main.ui
	var tabs: Array = []
	var select_tabs: Array[Callable] = []
	for index in range(ROLES.size()):
		tabs.append(ROLE_NAMES[ROLES[index]])
		select_tabs.append(_select_tab.bind(index))
	ui.open_section_panel(TITLE, tabs, _tab, select_tabs)
	ui.button_list_touch_enabled = true
	if not _message.is_empty(): ui.paragraph(_message)
	if _data.is_empty():
		ui.choice("기록 다시 불러오기", "", _read.bind(true))
		ui.choice("모험 메뉴로", "", main._menu.bind("menu"))
		return
	var focus := str(_data.focus)
	var role: String = ROLES[_tab]
	ui.paragraph("현재 중점 · %s" % ROLE_NAMES[focus], ui.GOLD)
	match role:
		"fishing": _render_fishing(_data.fishing)
		"cooking": _render_cooking(_data.cooking)
		"merchant": _render_merchant(_data.merchant)
		"crafting": _render_crafting(_data.crafting)
	if role != focus:
		ui.choice("%s 활동을 중점으로 정하기" % ROLE_NAMES[role], "수첩을 열면 이 활동을 먼저 봅니다.", _choose_focus.bind(role))
	if focus != "none":
		ui.choice("중점 활동 해제", "", _choose_focus.bind("none"))
	ui.choice("모험 메뉴로", "", main._menu.bind("menu"))


func _can_travel() -> bool:
	return main.combat_socket.socket_ready and not main._online_fighting() and not main.busy \
		and not main.life.sending and not main.life.blocking() and not main.fishing.visible


func _at_plaza() -> bool:
	return _location == "arcana_plaza" and main.world.indoor.is_empty()

func _go_to(action: Callable) -> void:
	if not _current(_request) or not _can_travel(): return
	action.call()


func _render_fishing(stats: Dictionary) -> void:
	var ui = main.ui
	ui.paragraph("낚시 숙련도 %.2f / 100 · 가방 민물고기 %d마리" % [
		float(stats.get("mastery", 0.0)), int(stats.get("fishOwned", 0)),
	])
	if _can_travel() and _at_plaza() and main.world.uses_plaza_v2():
		var go_to_water: Callable = main.simplified_play._select_city_place.bind("river") if _simple else main._walk_to_plaza_water
		ui.choice("낚시터로 이동", main._plaza_fishing_place(), _go_to.bind(go_to_water))
	else:
		_directions("%s에서 민물고기를 낚을 수 있습니다." % main._plaza_fishing_place())
	if _can_travel() and (_at_plaza() or _location == "arcana_inn"):
		ui.choice("마르텐의 민물고기 매입 보기", "여관 접수대에서 납품", _go_to.bind(main._open_inn_supply.bind(false)))


func _render_cooking(stats: Dictionary) -> void:
	var ui = main.ui
	ui.paragraph("요리 숙련도 %.2f / 100 · 완성한 요리 %d개" % [
		float(stats.get("mastery", 0.0)), int(stats.get("cookedMeals", 0)),
	])
	if _can_travel() and main.world.indoor == "arcana_home":
		ui.choice("집 주방으로 이동", "화덕에서 요리하기", _go_to.bind(main.home_walk_to.bind("home_kitchen")))
	elif _can_travel() and _simple and _at_plaza():
		ui.choice("내 집으로 이동", "주방에서 민물고기를 구워 보세요.", _go_to.bind(main.simplified_play._select_city_place.bind("home")))
	else:
		_directions("내 집 주방이나 설치한 야외 모닥불에서 요리할 수 있습니다.")
	if _can_travel() and (_at_plaza() or _location == "arcana_inn"):
		ui.choice("마르텐의 생선구이 메뉴 보기", "품질별 납품 보상과 주문 가격", _go_to.bind(main._open_inn_supply.bind(true)))


func _render_merchant(stats: Dictionary) -> void:
	var ui = main.ui
	var sold := int(stats.get("soldUnits", 0))
	var shelf_at := int(stats.get("expandedShelfAt", 0))
	ui.paragraph("누적 판매 %d개 · 위탁 %d/%d건\n받을 판매 대금 %d골드" % [
		sold, int(stats.get("listed", 0)), int(stats.get("listingLimit", 0)), int(stats.get("proceeds", 0)),
	])
	if shelf_at > sold:
		ui.paragraph("%d개 더 판매하면 진열대가 확장됩니다." % (shelf_at - sold), ui.MUTED)
	elif shelf_at > 0:
		ui.paragraph("진열대 확장 완료", ui.MUTED)
	if _can_travel() and _at_plaza():
		ui.choice("광장 장터 열기", "구매 · 위탁 · 판매 대금 받기", _go_to.bind(main.plaza_market.open))
	else:
		_directions("분수 광장에 돌아오면 광장 장터에서 물품을 위탁하고 판매 대금을 받을 수 있습니다.")


func _render_crafting(stats: Dictionary) -> void:
	var ui = main.ui
	ui.paragraph("제작 숙련도 %.2f / 100 · 만든 물품 %d개" % [
		float(stats.get("mastery", 0.0)), int(stats.get("craftedItems", 0)),
	])
	var can_travel := _can_travel()
	if can_travel and main.world.indoor == "arcana_home":
		ui.choice("집 작업대로 이동", "나뭇가지 다듬기 · 모닥불 만들기", _go_to.bind(main.home_walk_to.bind("home_table")))
	elif can_travel and _simple and _at_plaza():
		ui.choice("내 집으로 이동", "집 작업대에서 물품 만들기", _go_to.bind(main.simplified_play._select_city_place.bind("home")))
	else:
		_directions("내 집 작업대에서 나뭇가지를 다듬거나 모닥불을 만들 수 있습니다.")
	if can_travel and _at_plaza():
		ui.choice("광장 장터 열기", "목재와 모닥불 구매 · 위탁", _go_to.bind(main.plaza_market.open))


func _directions(text: String) -> void:
	main.ui.paragraph(text, main.ui.MUTED)
	if _can_travel():
		main.ui.choice("지도 열기", "", _go_to.bind(main._menu.bind("map")))
