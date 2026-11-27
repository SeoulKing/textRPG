extends RefCounted

const TITLE := "광장 장터"
const PANEL := "plaza_market"
const RETRY_MS := 60_000
const PAGE_SIZE := 8
const HISTORY_LIMIT := 20
const MY_LISTINGS_SECTION := 1
const BUY_ORDERS_SECTION := 3
enum BuyOrderPane { PUBLIC, OWN, REGISTER }

var main: Node
var _game_id := ""
var _simple := false
var _request := 0
var _market: Dictionary = {}
var _pending: Dictionary = {}
var _section := 0
var _page := 0
var _offer_filter := ""
var _offer_filter_open := false
var _selected_item := ""
var _order_pane: BuyOrderPane = BuyOrderPane.PUBLIC
var _order_page := 0
var _order_item := ""
var _archives_open := false
var _archives_loaded := false
var _archives: Array = []
var _archive_source := ""
var _archive_page := 0
var _archive_connection := -1
var _archive_place_revision := -1
var _history_open := false
var _history_loaded := false
var _history: Array = []
var _message := ""


func _init(host: Node) -> void:
	main = host


func _at_plaza() -> bool:
	return main.online_world and main._state().get("location", "") == "arcana_plaza" and main.world.indoor.is_empty()


func _visible() -> bool:
	return main.panel_mode == PANEL and main.ui.overlay.visible and main.ui.panel_title.text == TITLE


func _current(request: int) -> bool:
	return _request == request and _visible() and _at_plaza() \
		and _game_id == str(main.game_id) and _simple == main.simplified_play.enabled

func _same_market_connection(connection: int, place_revision: int) -> bool:
	return main.combat_socket.connection_generation == connection \
		and int(main.snapshot.get("onlinePlaceRevision", 0)) == place_revision


func sync() -> void:
	if _visible() and not _current(_request):
		main.ui.close_panel()


func panel_closed() -> void:
	_request += 1
	_offer_filter = ""
	_offer_filter_open = false
	_order_pane = BuyOrderPane.PUBLIC
	_order_page = 0
	_order_item = ""
	_reset_archives()
	_reset_history()


func open() -> void:
	if not _at_plaza() or main.busy or main.fishing.visible or main.life.blocking(): return
	_game_id = str(main.game_id)
	_simple = main.simplified_play.enabled
	_market = {}
	_section = 0
	_page = 0
	_offer_filter = ""
	_offer_filter_open = false
	_selected_item = ""
	_order_pane = BuyOrderPane.PUBLIC
	_order_page = 0
	_order_item = ""
	_reset_archives()
	_reset_history()
	_refresh()


func _route() -> String:
	return "/api/games/%s/plaza-market" % _game_id.uri_encode()


func _refresh(message: String = "") -> void:
	_request += 1
	var request := _request
	main.panel_mode = PANEL
	_waiting("장터의 거래 기록을 불러오고 있습니다…")
	var route := "%s?controller=%s" % [_route(), str(main.client_id).uri_encode()]
	var reply: Dictionary = await main._api(route, HTTPClient.METHOD_GET, {}, 8.0)
	if not _current(request): return
	_pending = main.town_trade_intents.oldest("market", _game_id)
	if reply.get("plazaMarket") is Dictionary:
		_market = reply.plazaMarket
		_message = message
	else:
		_market = {}
		_message = str(reply.get("message", "장터를 불러오지 못했습니다. 다시 시도해 주세요."))
		if _archives_open:
			_archives_loaded = false
			_archives = []
			_archive_source = ""
			if not message.is_empty(): _message = "%s\n%s" % [message, _message]
		elif _history_open:
			_history_loaded = false
			_history = []
			if not message.is_empty(): _message = "%s\n%s" % [message, _message]
	if _archives_open and not _market.is_empty():
		_load_archives(_message)
	elif _history_open and not _market.is_empty():
		_load_history(_message)
	else:
		_render()


func _waiting(message: String) -> void:
	main.ui.open_panel(TITLE)
	main.ui.paragraph(message, main.ui.MUTED)


func _select_section(section: int) -> void:
	if not _current(_request): return
	_section = section
	_offer_filter_open = false
	_order_pane = BuyOrderPane.PUBLIC
	_order_item = ""
	_reset_archives()
	_reset_history()
	_render()


func _select_page(page: int) -> void:
	if not _current(_request): return
	_page = page
	_render()


func _select_item(item_id: String) -> void:
	if not _current(_request): return
	_selected_item = item_id
	_render()

func _show_offer_filter(show: bool) -> void:
	if not _current(_request): return
	_offer_filter_open = show
	_render()


func _select_offer_filter(item_id: String) -> void:
	if not _current(_request): return
	if item_id != _offer_filter:
		_offer_filter = item_id
		_page = 0
	_show_offer_filter(false)


func _good(item_id: String) -> Dictionary:
	for item: Dictionary in _market.get("goods", []):
		if item.get("id", "") == item_id: return item
	return {}


func _item_name(item_id: String) -> String:
	return str(_good(item_id).get("name", "물품"))


func _can_trade() -> bool:
	return _pending.is_empty() and bool(_market.get("canTrade", false))


func _render() -> void:
	var ui = main.ui
	ui.open_section_panel(TITLE, ["구매", "내 위탁", "등록", "매입 주문"], _section, [
		_select_section.bind(0), _select_section.bind(MY_LISTINGS_SECTION), _select_section.bind(2), _select_section.bind(BUY_ORDERS_SECTION),
	])
	ui.button_list_touch_enabled = true
	if not _message.is_empty(): ui.paragraph(_message)
	if not _market.is_empty() and not bool(_market.get("canTrade", false)):
		ui.paragraph("진행 중인 행동을 마치고 장터를 새로고침해 주세요.", ui.MUTED)
	if not _pending.is_empty():
		ui.choice("이전 거래 확인 · 재시도", str(_pending.get("label", "이전 장터 거래")),
			_submit.bind({}, "", str(_pending.actionId)))
	if _market.is_empty():
		ui.choice("다시 불러오기", "", _refresh)
		if _history_open: ui.choice("내 위탁으로", "", _leave_history)
		return
	match _section:
		0:
			if _offer_filter_open: _render_offer_filter()
			else: _render_offers()
		MY_LISTINGS_SECTION:
			if _archives_open: _render_archives()
			elif _history_open: _render_history()
			else: _render_my_listings()
		2: _render_register()
		BUY_ORDERS_SECTION: _render_buy_orders()
	if _history_open:
		ui.choice("체결 내역 새로고침", "", _load_history)
	else:
		ui.choice("거래 자산 새로고침" if _archives_open else "장터 새로고침", "", _refresh)


func _render_offers() -> void:
	var ui = main.ui
	var money := int(_market.get("money", 0))
	ui.paragraph("보유 %d골드" % money, ui.GOLD)
	ui.choice("품목 필터", "전체 품목" if _offer_filter.is_empty() else _item_name(_offer_filter), _show_offer_filter.bind(true))
	var offers: Array = _market.get("offers", [])
	if not _offer_filter.is_empty():
		offers = offers.filter(func(offer: Dictionary) -> bool:
			return offer.get("itemId", "") == _offer_filter)
	if offers.is_empty():
		var empty := "지금 살 수 있는 물품이 없습니다." if _offer_filter.is_empty() else "선택한 품목은 지금 판매 중인 물품이 없습니다."
		ui.paragraph(empty, ui.MUTED)
		return
	var page_count := ceili(float(offers.size()) / PAGE_SIZE)
	_page = clampi(_page, 0, page_count - 1)
	var first := _page * PAGE_SIZE
	for index in range(first, mini(first + PAGE_SIZE, offers.size())):
		var offer: Dictionary = offers[index]
		var item := _item_name(str(offer.get("itemId", "")))
		var price := int(offer.get("unitPrice", 0))
		var listing := str(offer.get("id", ""))
		var label := "%s 1개 구매" % item
		var detail := "%d골드 · 남은 %d개 · 판매자 %s" % [
			price, int(offer.get("quantity", 0)), str(offer.get("sellerName", "모험가")),
		]
		var intent_label := "%s · %d골드" % [label, price]
		ui.choice(label, detail, _submit.bind({"action": "buy", "listingId": listing}, intent_label), not _can_trade() or money < price)
	if page_count > 1:
		if _page > 0: ui.choice("이전 물품", "%d / %d쪽" % [_page + 1, page_count], _select_page.bind(_page - 1))
		if _page + 1 < page_count: ui.choice("다음 물품", "%d / %d쪽" % [_page + 1, page_count], _select_page.bind(_page + 1))


func _render_offer_filter() -> void:
	var ui = main.ui
	ui.choice("전체 품목", "", _select_offer_filter.bind(""), _offer_filter.is_empty())
	for item: Dictionary in _market.get("goods", []):
		var item_id := str(item.get("id", ""))
		if item_id.is_empty(): continue
		ui.choice(str(item.get("name", "물품")), "", _select_offer_filter.bind(item_id), item_id == _offer_filter)
	ui.choice("구매 목록으로", "", _show_offer_filter.bind(false))


func _render_my_listings() -> void:
	var ui = main.ui
	ui.choice("최근 체결 내역", "", _open_history)
	ui.choice("보관 캐릭터의 거래 자산", "이전 캐릭터가 장터에 남긴 골드와 물품 확인", _open_archives)
	var proceeds := int(_market.get("proceeds", 0))
	ui.choice("판매 대금 받기", "%d골드" % proceeds,
		_submit.bind({"action": "collect"}, "판매 대금 받기"), not _can_trade() or proceeds <= 0)
	var listings: Array = _market.get("myListings", [])
	if listings.is_empty():
		ui.paragraph("맡긴 물품이 없습니다.", ui.MUTED)
		return
	for offer: Dictionary in listings:
		var item := _item_name(str(offer.get("itemId", "")))
		var status := "기한 만료" if bool(offer.get("expired", false)) else "판매 중"
		var label := "%s 회수" % item
		var detail := "%s · 남은 %d개 · 개당 %d골드" % [status, int(offer.get("quantity", 0)), int(offer.get("unitPrice", 0))]
		ui.choice(label, detail, _submit.bind({"action": "withdraw", "listingId": str(offer.get("id", ""))}, label), not _can_trade())


func _reset_history() -> void:
	_history_open = false
	_history_loaded = false
	_history = []


func _open_history() -> void:
	if not _current(_request) or _section != MY_LISTINGS_SECTION or main.busy or _archives_open or _history_open: return
	_history_open = true
	_load_history()


func _load_history(message: String = "") -> void:
	if not _current(_request) or not _history_open: return
	_request += 1
	var request := _request
	var connection: int = main.combat_socket.connection_generation
	var place_revision := int(main.snapshot.get("onlinePlaceRevision", 0))
	_history_loaded = false
	_history = []
	_waiting("체결 내역을 불러오고 있습니다…")
	var route := "%s/history?controller=%s" % [_route(), str(main.client_id).uri_encode()]
	var reply: Dictionary = await main._api(route, HTTPClient.METHOD_GET, {}, 8.0)
	if not _current(request) or not _history_open: return
	_pending = main.town_trade_intents.oldest("market", _game_id)
	var load_error := ""
	if not _same_market_connection(connection, place_revision):
		load_error = "접속이나 위치가 바뀌었습니다. 체결 내역을 다시 불러와 주세요."
	elif reply.get("history") is Array:
		_history = reply.history
		_history_loaded = true
	else:
		load_error = str(reply.get("message", "체결 내역을 불러오지 못했습니다."))
	_message = message
	if not load_error.is_empty():
		_message = load_error if message.is_empty() else "%s\n%s" % [message, load_error]
	_render()


func _leave_history() -> void:
	if not _current(_request): return
	_reset_history()
	_message = ""
	_render()


func _render_history() -> void:
	var ui = main.ui
	ui.paragraph("최근 체결 내역", ui.GOLD)
	if _history_loaded:
		if _history.is_empty():
			ui.paragraph("아직 체결된 거래가 없습니다.", ui.MUTED)
		for index in range(mini(HISTORY_LIMIT, _history.size())):
			var entry: Variant = _history[index]
			if not entry is Dictionary or entry.get("side", "") not in ["buy", "sell"] \
				or entry.get("source", "") not in ["listing", "buyOrder"]:
				continue
			var buying: bool = entry.side == "buy"
			var side := "구매" if buying else "판매"
			var source := "매입 주문" if entry.get("source", "") == "buyOrder" else "위탁 거래"
			var item_id := str(entry.get("itemId", ""))
			var item_name := str(_good(item_id).get("name", item_id))
			var party := "판매자" if buying else "구매자"
			ui.paragraph("%d일차 · %s · %s %d개\n개당 %d골드 · %s %s · %s" % [
				int(entry.get("day", 0)), side, item_name, int(entry.get("quantity", 0)),
				int(entry.get("unitPrice", 0)), party, str(entry.get("counterparty", "모험가")), source,
			])
	ui.choice("내 위탁으로", "", _leave_history)


func _reset_archives() -> void:
	_archives_open = false
	_archives_loaded = false
	_archives = []
	_archive_source = ""
	_archive_page = 0
	_archive_connection = -1
	_archive_place_revision = -1


func _open_archives() -> void:
	if not _current(_request) or _section != MY_LISTINGS_SECTION or main.busy: return
	_archives_open = true
	_archive_page = 0
	_load_archives()


func _load_archives(message: String = "") -> void:
	if not _current(_request) or not _archives_open: return
	_request += 1
	var request := _request
	var connection: int = main.combat_socket.connection_generation
	var place_revision := int(main.snapshot.get("onlinePlaceRevision", 0))
	_archives_loaded = false
	_archives = []
	_archive_source = ""
	_waiting("보관 캐릭터의 거래 자산을 불러오고 있습니다…")
	var route := "%s/archived?controller=%s" % [_route(), str(main.client_id).uri_encode()]
	var reply: Dictionary = await main._api(route, HTTPClient.METHOD_GET, {}, 8.0)
	if not _current(request) or not _archives_open: return
	_pending = main.town_trade_intents.oldest("market", _game_id)
	var load_error := ""
	if not _same_market_connection(connection, place_revision):
		load_error = "접속이나 위치가 바뀌었습니다. 거래 자산을 다시 불러와 주세요."
	elif reply.get("archives") is Array:
		_archives = reply.archives
		_archives_loaded = true
		_archive_connection = connection
		_archive_place_revision = place_revision
	else:
		load_error = str(reply.get("message", "보관 캐릭터의 거래 자산을 불러오지 못했습니다."))
	_message = message
	if not load_error.is_empty():
		_message = load_error if message.is_empty() else "%s\n%s" % [message, load_error]
	_render()


func _leave_archives() -> void:
	if not _current(_request): return
	_reset_archives()
	_message = ""
	_render()


func _select_archive_page(page: int) -> void:
	if not _current(_request) or not _archives_open: return
	_archive_page = page
	_render()


func _archive(character_id: String) -> Dictionary:
	for entry: Dictionary in _archives:
		if entry.get("characterId", "") == character_id: return entry
	return {}


func _archive_projection_current() -> bool:
	return _archives_loaded and _same_market_connection(_archive_connection, _archive_place_revision)


func _select_archive(character_id: String) -> void:
	if not _current(_request) or not _archives_open: return
	if not _archive_projection_current():
		_refresh()
		return
	if not character_id.is_empty():
		var entry := _archive(character_id)
		if entry.is_empty() or bool(entry.get("unavailable", false)): return
	_archive_source = character_id
	_render()


func _render_archives() -> void:
	var ui = main.ui
	ui.paragraph("보관 캐릭터의 거래 자산", ui.GOLD)
	if _archives_loaded:
		if _archives.is_empty():
			ui.paragraph("회수할 거래 자산이 없습니다.", ui.MUTED)
		elif _archive_source.is_empty():
			_render_archive_list()
		else:
			_render_archive_confirmation(_archive(_archive_source))
	ui.choice("내 위탁으로", "", _leave_archives)


func _render_archive_list() -> void:
	var ui = main.ui
	var page_count := ceili(float(_archives.size()) / PAGE_SIZE)
	_archive_page = clampi(_archive_page, 0, page_count - 1)
	var first := _archive_page * PAGE_SIZE
	for index in range(first, mini(first + PAGE_SIZE, _archives.size())):
		var entry: Dictionary = _archives[index]
		var name := str(entry.get("name", "보관 캐릭터"))
		var orders := "위탁 %d건 · 매입 주문 %d건" % [int(entry.get("listings", 0)), int(entry.get("orders", 0))]
		var unavailable := bool(entry.get("unavailable", false))
		var detail := "현재 회수할 수 없습니다 · %s" % orders if unavailable \
			else "%d골드 · %s" % [int(entry.get("gold", 0)), orders]
		ui.choice("%s 자산 확인" % name, detail, _select_archive.bind(str(entry.get("characterId", ""))), unavailable)
	if _archive_page > 0:
		ui.choice("이전 캐릭터", "%d / %d쪽" % [_archive_page + 1, page_count], _select_archive_page.bind(_archive_page - 1))
	if _archive_page + 1 < page_count:
		ui.choice("다음 캐릭터", "%d / %d쪽" % [_archive_page + 1, page_count], _select_archive_page.bind(_archive_page + 1))


func _render_archive_confirmation(entry: Dictionary) -> void:
	var ui = main.ui
	if entry.is_empty() or bool(entry.get("unavailable", false)):
		ui.paragraph("현재 회수할 수 있는 자산이 없습니다.", ui.MUTED)
		ui.choice("보관 캐릭터 목록으로", "", _select_archive.bind(""))
		return
	var name := str(entry.get("name", "보관 캐릭터"))
	ui.paragraph("%s · 회수할 골드 %d" % [name, int(entry.get("gold", 0))], ui.GOLD)
	var items := PackedStringArray()
	for item: Dictionary in entry.get("items", []):
		items.append("%s %d개" % [str(item.get("name", "물품")), int(item.get("quantity", 0))])
	ui.paragraph("회수할 물품이 없습니다." if items.is_empty() else "\n".join(items))
	ui.paragraph("회수하면 위탁 %d건과 매입 주문 %d건이 취소됩니다." % [
		int(entry.get("listings", 0)), int(entry.get("orders", 0)),
	])
	ui.choice("현재 캐릭터로 회수", "장터에 남아 있는 골드와 물품을 옮기기",
		_confirm_archive.bind(str(entry.get("characterId", ""))), not _can_trade())
	ui.choice("보관 캐릭터 목록으로", "", _select_archive.bind(""))


func _confirm_archive(character_id: String) -> void:
	if not _current(_request) or not _archives_open or character_id.is_empty() or character_id != _archive_source: return
	if not _archive_projection_current():
		_refresh()
		return
	var entry := _archive(character_id)
	if entry.is_empty() or bool(entry.get("unavailable", false)): return
	var label := "%s의 거래 자산 회수 · 확인 당시 %d골드" % [str(entry.get("name", "보관 캐릭터")), int(entry.get("gold", 0))]
	_submit({"action": "recoverArchivedTrade", "sourceCharacterId": character_id}, label)


func _render_register() -> void:
	var ui = main.ui
	var can_list := _can_trade() and bool(_market.get("canList", false))
	if _can_trade() and not can_list:
		ui.paragraph("등록할 자리가 없습니다. 내 위탁에서 남은 물품을 회수할 수 있습니다.", ui.MUTED)
	if not _selected_item.is_empty():
		for item: Dictionary in _market.get("goods", []):
			if item.get("id", "") == _selected_item and int(item.get("owned", 0)) > 0 and can_list:
				_render_offer_form(item)
				return
		_selected_item = ""
	for item: Dictionary in _market.get("goods", []):
		var item_id := str(item.get("id", ""))
		var owned := int(item.get("owned", 0))
		ui.choice(str(item.get("name", "물품")), "가방 %d개" % owned,
			_select_item.bind(item_id), not can_list or owned <= 0)


func _show_order_pane(pane: BuyOrderPane) -> void:
	if not _current(_request) or _section != BUY_ORDERS_SECTION: return
	_order_pane = pane
	_order_item = ""
	_render()


func _select_order_page(page: int) -> void:
	if not _current(_request) or _section != BUY_ORDERS_SECTION or _order_pane != BuyOrderPane.PUBLIC: return
	_order_page = page
	_render()


func _select_order_item(item_id: String) -> void:
	if not _current(_request) or _section != BUY_ORDERS_SECTION or _order_pane != BuyOrderPane.REGISTER: return
	_order_item = item_id
	_render()


func _render_buy_orders() -> void:
	var ui = main.ui
	var orders: Variant = _market.get("buyOrders")
	if not orders is Dictionary:
		ui.paragraph("매입 주문을 불러올 수 없습니다.", ui.MUTED)
		return
	var can_order := _can_trade() and bool(orders.get("canOrder", false))
	match _order_pane:
		BuyOrderPane.OWN:
			_render_my_orders(orders)
		BuyOrderPane.REGISTER:
			_render_order_register(can_order)
		_:
			var detail := "수량과 단가를 정해 골드 예치"
			if _can_trade() and not can_order: detail = "등록할 수 있는 주문 자리가 없습니다."
			ui.choice("새 매입 주문", detail, _show_order_pane.bind(BuyOrderPane.REGISTER), not can_order)
			ui.choice("내 주문 · 물품 받기", "남은 예치금 확인 · 납품된 물품 수령", _show_order_pane.bind(BuyOrderPane.OWN))
			_render_public_orders(orders)
	if _order_pane != BuyOrderPane.PUBLIC:
		ui.choice("공개 매입 주문으로", "", _show_order_pane.bind(BuyOrderPane.PUBLIC))


func _render_public_orders(book: Dictionary) -> void:
	var ui = main.ui
	var orders: Array = book.get("orders", [])
	if orders.is_empty():
		ui.paragraph("지금 납품할 수 있는 공개 주문이 없습니다.", ui.MUTED)
		return
	ui.paragraph("공개 주문", ui.GOLD)
	var page_count := ceili(float(orders.size()) / PAGE_SIZE)
	_order_page = clampi(_order_page, 0, page_count - 1)
	var first := _order_page * PAGE_SIZE
	for index in range(first, mini(first + PAGE_SIZE, orders.size())):
		var order: Dictionary = orders[index]
		var item := _good(str(order.get("itemId", "")))
		var owned := int(item.get("owned", 0))
		var quantity := int(order.get("quantity", 0))
		var unit_price := int(order.get("unitPrice", 0))
		var title := "%s 1개 납품" % str(item.get("name", "물품"))
		var detail := "%d골드 받기 · 주문 잔여 %d개 · 가방 %d개 · 주문자 %s" % [
			unit_price, quantity, owned, str(order.get("buyerName", "모험가")),
		]
		var intent_label := "%s · %d골드 받기" % [title, unit_price]
		ui.choice(title, detail, _submit.bind({"action": "fillBuyOrder", "orderId": str(order.get("id", ""))}, intent_label),
			not _can_trade() or owned <= 0)
	if _order_page > 0:
		ui.choice("이전 주문", "%d / %d쪽" % [_order_page + 1, page_count], _select_order_page.bind(_order_page - 1))
	if _order_page + 1 < page_count:
		ui.choice("다음 주문", "%d / %d쪽" % [_order_page + 1, page_count], _select_order_page.bind(_order_page + 1))


func _render_my_orders(book: Dictionary) -> void:
	var ui = main.ui
	var purchases: Array = book.get("purchases", [])
	if purchases.is_empty():
		ui.paragraph("받을 물품이 없습니다.", ui.MUTED)
	else:
		ui.paragraph("접속하지 않은 동안 들어온 납품도 이곳에 보관됩니다.", ui.MUTED)
		var items := PackedStringArray()
		for purchase: Dictionary in purchases:
			items.append("%s %d개" % [str(purchase.get("name", "물품")), int(purchase.get("quantity", 0))])
		ui.paragraph("\n".join(items))
		ui.choice("구매 물품 모두 받기", "보관된 물품을 가방으로 옮기기",
			_submit.bind({"action": "collectPurchases"}, "매입 주문 물품 모두 받기"), not _can_trade())
	var orders: Array = book.get("myOrders", [])
	if orders.is_empty():
		ui.paragraph("남아 있는 내 매입 주문이 없습니다.", ui.MUTED)
		return
	ui.paragraph("내 매입 주문", ui.GOLD)
	for order: Dictionary in orders:
		var item := _item_name(str(order.get("itemId", "")))
		var status := "기한 만료" if bool(order.get("expired", false)) else "매입 중"
		var refund := int(order.get("reservedGold", 0))
		var label := "%s 주문 취소" % item
		var detail := "%s · 남은 %d개 · 개당 %d골드 · 예치금 %d골드 환불" % [
			status, int(order.get("quantity", 0)), int(order.get("unitPrice", 0)), refund,
		]
		var intent_label := "%s · 표시된 예치금 %d골드" % [label, refund]
		ui.choice(label, detail,
			_submit.bind({"action": "cancelBuyOrder", "orderId": str(order.get("id", ""))}, intent_label),
			not _can_trade())


func _render_order_register(can_order: bool) -> void:
	var ui = main.ui
	if not can_order:
		ui.paragraph("지금은 매입 주문을 등록할 수 없습니다.", ui.MUTED)
		return
	if not _order_item.is_empty():
		var item := _good(_order_item)
		if not item.is_empty():
			_render_offer_form(item, true)
			return
		_order_item = ""
	ui.paragraph("매입할 품목을 고르세요.", ui.GOLD)
	for item: Dictionary in _market.get("goods", []):
		var item_id := str(item.get("id", ""))
		if not item_id.is_empty():
			ui.choice(str(item.get("name", "물품")), "", _select_order_item.bind(item_id))


func _number_input(row: HBoxContainer, caption: String, maximum: int) -> SpinBox:
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(column)
	column.add_child(main.ui.label(caption))
	var input := SpinBox.new()
	input.min_value = 1
	input.max_value = maximum
	input.value = 1
	input.step = 1
	input.custom_minimum_size.y = 40
	input.get_line_edit().accessibility_name = caption
	column.add_child(input)
	return input


func _render_offer_form(item: Dictionary, buy_order: bool = false) -> void:
	var ui = main.ui
	# SpinBox editing needs the native GUI input that the button-list swipe handler captures.
	ui.button_list_touch_enabled = false
	var item_id := str(item.get("id", ""))
	var label := str(item.get("name", "물품"))
	var owned := int(item.get("owned", 0))
	var money := int(_market.get("money", 0))
	var max_quantity := int(_market.get("quantityLimit", 1))
	if not buy_order: max_quantity = mini(owned, max_quantity)
	var max_price := int(_market.get("priceLimit", 1))
	var summary := "%s · 보유 %d골드" % [label, money] if buy_order else "%s · 가방 %d개" % [label, owned]
	ui.paragraph(summary, ui.GOLD)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	ui.content.add_child(row)
	var quantity := _number_input(row, "수량 (1–%d)" % max_quantity, max_quantity)
	var price := _number_input(row, "개당 골드 (1–%d)" % max_price, max_price)
	var total: Label = ui.label("")
	ui.content.add_child(total)
	var submit_title := "예치하고 매입 주문 등록" if buy_order else "위탁 등록"
	var submit: Button = ui.button(submit_title, func():
		var amount_text := quantity.get_line_edit().text.strip_edges()
		var price_text := price.get_line_edit().text.strip_edges()
		if not amount_text.is_valid_int() or not price_text.is_valid_int():
			ui.toast("수량과 가격을 정수로 입력해 주세요.")
			return
		var amount := int(amount_text)
		var unit_price := int(price_text)
		if amount < 1 or amount > max_quantity or unit_price < 1 or unit_price > max_price:
			ui.toast("수량과 가격의 입력 범위를 확인해 주세요.")
			return
		if buy_order and amount * unit_price > money:
			ui.toast("예치할 골드가 부족합니다.")
			return
		var action := "placeBuyOrder" if buy_order else "list"
		var payload := {"action": action, "itemId": item_id, "quantity": amount, "unitPrice": unit_price}
		var intent_label := "%s %d개 등록 · 개당 %d골드" % [label, amount, unit_price]
		if buy_order:
			intent_label = "%s %d개 매입 주문 · 개당 %d골드 · 예치금 %d골드" % [label, amount, unit_price, amount * unit_price]
		_submit(payload, intent_label), Vector2(0, 44))
	ui.content.add_child(submit)
	var refresh_total := func() -> void:
		if not buy_order:
			total.text = "전량 판매 시 %d골드" % (int(quantity.value) * int(price.value))
			return
		var amount_text := quantity.get_line_edit().text.strip_edges()
		var price_text := price.get_line_edit().text.strip_edges()
		var amount := int(amount_text) if amount_text.is_valid_int() else 0
		var unit_price := int(price_text) if price_text.is_valid_int() else 0
		var valid := amount >= 1 and amount <= max_quantity and unit_price >= 1 and unit_price <= max_price
		var reserve := amount * unit_price if valid else 0
		submit.disabled = not valid or reserve > money
		total.text = "예치금 %d골드" % reserve if valid else "수량과 단가의 입력 범위를 확인해 주세요."
		if valid and reserve > money: total.text += " · 골드 부족"
	var refresh_number := func(_value: float) -> void: refresh_total.call()
	quantity.value_changed.connect(refresh_number)
	price.value_changed.connect(refresh_number)
	if buy_order:
		var refresh_text := func(_text: String) -> void: refresh_total.call()
		quantity.get_line_edit().text_changed.connect(refresh_text)
		price.get_line_edit().text_changed.connect(refresh_text)
	refresh_total.call()
	var choose_another := _select_order_item.bind("") if buy_order else _select_item.bind("")
	ui.choice("다른 물품 고르기", "", choose_another)


func _submit(payload: Dictionary, label: String, expected_id: String = "") -> void:
	if not _current(_request) or main.busy: return
	if not main.combat_socket.socket_ready:
		main.ui.toast("세계에 다시 연결한 뒤 거래해 주세요.")
		return
	var active_game := _game_id
	var request := _request
	var connection: int = main.combat_socket.connection_generation
	_pending = main.town_trade_intents.oldest("market", active_game)
	var recovering := not expected_id.is_empty()
	if recovering:
		if _pending.get("actionId", "") != expected_id:
			_refresh()
			return
	else:
		if not _pending.is_empty():
			_message = "이전 거래를 먼저 확인해 주세요."
			_render()
			return
		if payload.is_empty() or not _can_trade(): return
		_pending = {
			"payload": payload.duplicate(true), "label": label, "day": int(_market.get("day", 0)),
			"actionId": main._new_action_id(), "createdAt": int(Time.get_unix_time_from_system() * 1000),
		}
		if not main.town_trade_intents.remember("market", active_game, _pending):
			_refresh("거래 정보를 저장하지 못했습니다. 다시 시도해 주세요.")
			return
	var intent := _pending
	var action_id := str(intent.actionId)
	var created_at := int(intent.createdAt)
	var body: Dictionary = intent.payload.duplicate(true)
	body.merge({"controller": main.client_id, "day": int(intent.day), "actionId": action_id}, true)
	var route := _route()
	main.busy = true
	_waiting("장터에서 거래를 확인하고 있습니다…")
	var reply: Dictionary = {}
	if recovering:
		var receipt_route := "/api/games/%s/actions/%s" % [active_game.uri_encode(), action_id.uri_encode()]
		reply = await main._api(receipt_route, HTTPClient.METHOD_GET, {}, 8.0)
		if reply.get("status", "") == "unknown":
			var age := int(Time.get_unix_time_from_system() * 1000) - created_at
			if age < 0 or age >= RETRY_MS:
				reply = {"error": "market_intent_expired", "message": "처리되지 않은 이전 거래를 취소했습니다."}
			elif _current(request) and main.combat_socket.connection_generation == connection:
				reply = await main._api(route, HTTPClient.METHOD_POST, body, 12.0)
			else:
				reply = {"retryable": true}
	else:
		reply = await main._api(route, HTTPClient.METHOD_POST, body, 12.0)
	main.busy = false
	var receipt: Variant = reply.get("actionReceipt")
	var accepted: bool = receipt is Dictionary and receipt.get("id", "") == action_id
	var http_status := int(reply.get("httpStatus", 0))
	var error := str(reply.get("error", ""))
	var reconnect := http_status in [401, 403] or error in ["join_required", "connection_replaced"]
	var uncertain := not accepted and (bool(reply.get("retryable", false)) or http_status >= 500 \
		or error in ["", "invalid_response"] or reconnect)
	if not uncertain:
		main.town_trade_intents.resolve("market", active_game, intent)
	if str(main.game_id) != active_game: return
	_pending = main.town_trade_intents.oldest("market", active_game)
	var applied: bool = accepted and main._apply_trade_snapshot(reply.get("snapshot"), reply.get("worldRevision"), active_game, connection)
	if not _current(request): return
	if accepted:
		if body.get("action", "") == "list": _selected_item = ""
		if body.get("action", "") == "placeBuyOrder" and _section == BUY_ORDERS_SECTION and _order_pane == BuyOrderPane.REGISTER:
			_order_item = ""
			_order_pane = BuyOrderPane.OWN
		_message = str(reply.get("message", "이전 거래 처리를 확인했습니다."))
		if applied and reply.get("plazaMarket") is Dictionary:
			_market = reply.plazaMarket
			if _archives_open: _load_archives(_message)
			elif _history_open: _load_history(_message)
			else: _render()
		else:
			_refresh(_message)
	elif uncertain:
		_message = str(reply.get("message", "거래 결과를 확인하지 못했습니다. 이전 거래를 확인해 주세요."))
		if _archives_open and body.get("action", "") == "recoverArchivedTrade": _load_archives(_message)
		else: _render()
	else:
		_refresh(str(reply.get("message", "거래할 수 없습니다.")))
