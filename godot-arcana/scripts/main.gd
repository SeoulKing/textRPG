extends Node

const World = preload("res://scripts/world.gd")
const UI = preload("res://scripts/game_ui.gd")
const SAVE_KEY = "arcana-godot-game-v1"
const SHARED_SAVE_KEY = "ruined-seoul-stage1-manual-save-game-id-v1"
var world
var ui
var viewport: SubViewport
var viewport_host: SubViewportContainer
var snapshot: Dictionary = {}
var game_id = ""
var busy = false
var clock_busy = false
var origin = "http://localhost:3000"
var client_id = "godot-" + str(Time.get_ticks_usec()) + "-" + str(randi())
var sequence = 0
var heartbeat = 0.0
var last_clock_paused = true
var page_active = true
var panel_mode = ""
var action_page = 0
var bridge_callback
var state_callback
var keyboard_callback
var pending_interaction: Dictionary = {}
var saved_position: Dictionary = {}
var resume_error = ""
var previous_enemy_hp = 30.0
var ui_refresh = 0.0

func _ready() -> void:
	viewport_host = SubViewportContainer.new()
	viewport_host.mouse_filter = Control.MOUSE_FILTER_IGNORE
	viewport_host.stretch = true
	viewport_host.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	add_child(viewport_host)
	viewport = SubViewport.new()
	viewport.disable_3d = true
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	viewport.canvas_item_default_texture_filter = Viewport.DEFAULT_CANVAS_ITEM_TEXTURE_FILTER_NEAREST
	viewport_host.add_child(viewport)
	world = World.new()
	viewport.add_child(world)
	world.interacted.connect(_interact)
	ui = UI.new()
	add_child(ui)
	ui.menu_requested.connect(_menu)
	ui.interact_pressed.connect(_activate)
	ui.magic_pressed.connect(_magic)
	ui.move_changed.connect(func(value): world.touch_direction = value)
	ui.panel_closed.connect(func(): panel_mode = ""; world.touch_direction = Vector2.ZERO; world.enabled = not busy and page_active)
	if OS.has_feature("web"):
		origin = str(JavaScriptBridge.eval("location.origin"))
		bridge_callback = JavaScriptBridge.create_callback(_bridge_command)
		state_callback = JavaScriptBridge.create_callback(_bridge_state)
		var window = JavaScriptBridge.get_interface("window")
		window.arcanaGodotCommand = bridge_callback
		window.arcanaGodotState = state_callback
		JavaScriptBridge.eval("window.arcanaReady = true; window.dispatchEvent(new Event('arcana-ready'));")
	_resize()
	get_viewport().size_changed.connect(_resize)
	await _boot()

func _resize() -> void:
	var size = get_viewport().get_visible_rect().size
	viewport_host.position = Vector2.ZERO
	viewport_host.size = size
	# SubViewportContainer owns the render size when stretch is enabled.
	viewport_host.stretch_shrink = 1

func _api(route: String, method: int = HTTPClient.METHOD_GET, data: Dictionary = {}) -> Dictionary:
	var req = HTTPRequest.new()
	req.timeout = 65
	add_child(req)
	var headers = PackedStringArray(["Content-Type: application/json", "Accept: application/json"])
	var result = req.request(origin + route, headers, method, JSON.stringify(data) if method != HTTPClient.METHOD_GET else "")
	if result != OK:
		req.queue_free()
		return {"error":"network", "message":"서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요."}
	var reply = await req.request_completed
	req.queue_free()
	if reply[0] != HTTPRequest.RESULT_SUCCESS:
		return {"error":"network", "message":"서버 응답을 받지 못했습니다. 진행은 유지됩니다."}
	var parsed = JSON.parse_string(reply[3].get_string_from_utf8())
	if not parsed is Dictionary:
		return {"error":"invalid_response", "message":"서버 응답을 읽지 못했습니다."}
	if reply[1] >= 400 and not parsed.has("error"): parsed.error = "request_failed"
	return parsed

func _stored(key: String) -> String:
	if OS.has_feature("web"):
		var value = JavaScriptBridge.eval("(()=>{try{return localStorage.getItem(" + JSON.stringify(key) + ")||''}catch(e){return ''}})()")
		return str(value) if value != null else ""
	if FileAccess.file_exists("user://" + key + ".txt"):
		return FileAccess.get_file_as_string("user://" + key + ".txt")
	return ""

func _store(key: String, value: String) -> void:
	if OS.has_feature("web"):
		JavaScriptBridge.eval("try{localStorage.setItem(" + JSON.stringify(key) + "," + JSON.stringify(value) + ")}catch(e){}")
	else:
		var file = FileAccess.open("user://" + key + ".txt", FileAccess.WRITE)
		if file: file.store_string(value)

func _boot() -> void:
	busy = true
	ui.open_panel("아르카나", false)
	ui.paragraph("별빛의 도시로 이어지는 길을 열고 있습니다.")
	game_id = _stored(SAVE_KEY)
	var position_text = _stored(SAVE_KEY + "-position")
	var restore_position = JSON.parse_string(position_text) if not position_text.is_empty() else null
	if restore_position is Dictionary: saved_position = restore_position
	var loaded: Dictionary = {}
	if not game_id.is_empty():
		loaded = await _api("/api/games/" + game_id + "/state")
		if loaded.has("error") or not loaded.has("state"):
			busy = false
			ui.open_panel("진행 불러오기", false)
			ui.paragraph(loaded.get("message", "저장된 진행을 불러오지 못했습니다. 서버 연결을 확인해 주세요."))
			ui.choice("다시 불러오기", "", _boot)
			ui.choice("홈으로", "", _home)
			return
	else:
		var shared = _stored(SHARED_SAVE_KEY)
		if not shared.is_empty():
			var candidate = await _api("/api/games/" + shared + "/state")
			if candidate.get("state", {}).get("flags", {}).get("in_magic_world", false): loaded = candidate
		if loaded.is_empty(): loaded = await _api("/api/games", HTTPClient.METHOD_POST, {"startAt":"arcana"})
	busy = false
	if not loaded.has("state"):
		ui.open_panel("연결을 확인해 주세요", false)
		ui.paragraph(loaded.get("message", "게임 서버에 연결하지 못했습니다."))
		ui.choice("다시 연결하기", "", _boot)
		ui.choice("홈으로", "", _home)
		return
	game_id = loaded.gameId
	_store(SAVE_KEY, game_id)
	_apply(loaded, true)
	ui.close_panel()
	if not _state().get("flags", {}).get("in_magic_world", false):
		_returned_home()
	else:
		ui.toast("길을 눌러 이동 · 가까이에서 살펴보기 E")
		if _state().get("magicDungeon", {}).get("run") is Dictionary:
			world.change_interior("dungeon")
			_scene()
		elif _state().get("npcDialogue", {}).get("active") is Dictionary or not _battle().is_empty(): _scene()

func _state() -> Dictionary:
	return snapshot.get("state", {})

func _combat() -> Dictionary:
	return _state().get("arcanaCombat", {})

func _battle() -> Dictionary:
	var value = _combat().get("battle")
	return value if value is Dictionary else {}

func _apply(value: Dictionary, initial: bool = false) -> void:
	var old_location = str(_state().get("location", ""))
	var had_battle = not _battle().is_empty()
	snapshot = value
	var location = str(_state().get("location", "arcana_plaza"))
	if initial or location != old_location:
		if location in ["arcana_shop", "arcana_inn", "arcana_restaurant", "arcana_academy"]:
			world.change_interior(location)
			if initial:
				for entity in world._outdoor_entities:
					if entity.id == location: world.outside_position = entity.pos + Vector2(0, 7)
		elif world.indoor != "": world.change_interior("")
		if initial:
			if location == "arcana_hunting_ground": world.player_position = Vector2(576, 989)
			elif location == "arcana_city_gate": world.player_position = Vector2(576, 710)
			elif location == "arcana_return_portal": world.player_position = Vector2(576, 241)
			if saved_position.get("location", "") == location:
				var point = Vector2(float(saved_position.get("x", 576)), float(saved_position.get("y", 500)))
				world.player_position = world.nearest_walkable(point)
	if _battle().get("phase", "") == "defeat" and old_location != location:
		world.player_position = world.SPAWN
		world.path.clear()
	if not had_battle and _battle().get("phase", "") == "ready" and world.indoor == "":
		if world.player_position.distance_to(Vector2(600, 1054)) < 36:
			world.player_position = Vector2(600, 1082)
			world.path.clear()
	world.battle = _battle().duplicate(true)
	var enemy_hp = float(_battle().get("enemyHp", 30))
	if enemy_hp < previous_enemy_hp: world.effect("fireball", str(int(previous_enemy_hp - enemy_hp)))
	previous_enemy_hp = enemy_hp
	_update_hud()

func _update_hud() -> void:
	var dungeon = _state().get("magicDungeon", {})
	var run = dungeon.get("run")
	var in_dungeon = run is Dictionary
	var c = run if in_dungeon else _combat()
	var level = int(dungeon.get("level", 1) if in_dungeon else c.get("level", 1))
	var hp = float(c.get("hp", 100))
	var mp = float(c.get("mp", 30))
	var max_hp = float(run.maxHp) if in_dungeon else 100.0 + (level - 1) * 10
	var max_mp = float(run.maxMp) if in_dungeon else 30.0 + (level - 1) * 3
	ui.title_label.text = "ARCANA · " + str(level)
	var location_name = "분수 광장"
	for loc in snapshot.get("visibleLocations", []):
		if loc.id == _state().get("location", ""): location_name = loc.name.trim_prefix("아르카나 ")
	var school = snapshot.get("academyMap")
	if school is Dictionary:
		for room in school.get("rooms", []):
			if room.isCurrent: location_name = room.name
	if in_dungeon: location_name = "별빛 회랑 %d층" % int(run.floor)
	ui.zone_label.text = location_name
	ui.money_label.text = "%s원" % int(_state().get("money", 0))
	ui.hp_label.text = "HP  %d / %d" % [int(hp), max_hp]
	ui.mp_label.text = "MP  %d / %d" % [int(mp), max_mp]
	ui.hp_bar.value = hp / max_hp * 100
	ui.mp_bar.value = mp / max_mp * 100
	ui.xp_bar.value = float(dungeon.get("xp", 0) if in_dungeon else c.get("xp", 0)) / ((40 if in_dungeon else 30) + (level - 1) * 15) * 100

func _process(delta: float) -> void:
	if not is_instance_valid(ui): return
	world.enabled = not busy and not ui.overlay.visible and page_active and not snapshot.is_empty()
	if snapshot.is_empty(): return
	heartbeat += delta
	ui_refresh += delta
	var battle = _battle()
	if not battle.is_empty() and battle.get("phase", "") == "battle" and not battle.get("paused", true) and world.enabled:
		world.battle.attackIn = maxf(0, float(world.battle.get("attackIn", 6)) - delta)
		for key in ["fireball", "dodge", "potion"]:
			_combat().cooldowns[key] = maxf(0, float(_combat().cooldowns.get(key, 0)) - delta)
	if ui_refresh > .10:
		ui_refresh = 0
		_refresh_controls()
	if heartbeat >= 1.0 and not busy and not clock_busy:
		heartbeat = 0
		_clock()
	# Crossing the southern gate keeps position and commits the existing travel rule.
	if not busy and not ui.overlay.visible and world.indoor == "" and battle.is_empty():
		var p = world.player_position
		var loc = str(_state().get("location", ""))
		if p.y > 793 and loc != "arcana_hunting_ground": _cross_gate(true)
		elif p.y < 781 and loc == "arcana_hunting_ground": _cross_gate(false)

func _refresh_controls() -> void:
	var b = _battle()
	var fighting = b.get("phase", "") == "battle"
	var available = not busy and not ui.overlay.visible
	ui.interaction.disabled = not available
	if busy: ui.interaction.text = "진행 중…"
	elif not b.is_empty():
		ui.interaction.text = {"ready":"전투 준비  E", "battle":"전투 메뉴  E", "victory":"전리품 확인  E", "defeat":"돌아보기  E"}.get(b.get("phase", ""), "살펴보기  E")
	elif not world.nearest.is_empty(): ui.interaction.text = "살펴보기  E"
	else: ui.interaction.text = "주변 보기  E"
	if not world.nearest.is_empty(): ui.hint_label.text = world.nearest.name
	elif fighting: ui.hint_label.text = "슬라임 · 도약 예고에 맞춰 회피하세요"
	elif world.indoor != "": ui.hint_label.text = "인물이나 문 가까이에서 살펴보세요"
	else: ui.hint_label.text = "길을 눌러 이동 · 방향키 / WASD"
	var cooldowns = _combat().get("cooldowns", {})
	for pair in [[ui.fireball, "fireball", "불꽃  1"], [ui.dodge, "dodge", "회피  2"], [ui.potion, "potion", "포션  3"]]:
		var remaining = float(cooldowns.get(pair[1], 0))
		pair[0].text = pair[2]
		pair[0].disabled = not available or remaining > .01 or (not fighting and pair[1] != "potion")
		if pair[1] == "fireball" and float(_combat().get("mp", 0)) < 4: pair[0].disabled = true
		if pair[1] == "potion" and int(_state().get("inventory", {}).get("manaPotion", 0)) <= 0: pair[0].disabled = true
		# A shrinking bar conveys cooldown without a numeric countdown.
		ui.cooldown_bars[pair[0]].visible = remaining > .01
		ui.cooldown_bars[pair[0]].value = remaining / (3.0 if pair[1] == "fireball" else 5.0) * 100
		pair[0].tooltip_text = "재사용 대기 중" if remaining > .01 else pair[2]
	ui.attack_bar.visible = fighting
	ui.attack_bar.value = float(world.battle.get("attackIn", 6)) / 6 * 100

func _clock() -> void:
	var paused = not page_active or ui.overlay.visible
	var dungeon = _state().get("magicDungeon", {}).get("run")
	if panel_mode == "scene" and dungeon is Dictionary: paused = not page_active
	if paused and last_clock_paused: return
	clock_busy = true
	sequence += 1
	var data = await _api("/api/games/" + game_id + "/actions", HTTPClient.METHOD_POST, {"type":"world_clock", "command":"pause" if paused else "tick", "clientId":client_id, "sequence":sequence})
	if data.has("state"):
		_apply(data)
		last_clock_paused = paused
		if not paused and _battle().get("phase", "") == "battle" and _battle().get("paused", false):
			data = await _api("/api/games/" + game_id + "/actions", HTTPClient.METHOD_POST, {"type":"arcana_combat", "command":"resume", "battleId":_battle().id})
			if data.has("state"): _apply(data)
		var run = _state().get("magicDungeon", {}).get("run")
		if not paused and run is Dictionary and run.get("phase", "") == "battle" and run.get("paused", false):
			data = await _api("/api/games/" + game_id + "/actions", HTTPClient.METHOD_POST, {"type":"magic_dungeon", "command":"resume"})
			if data.has("state"): _apply(data)
		if run is Dictionary and panel_mode == "scene" and ui.overlay.visible: _scene(action_page)
	else: ui.toast(data.get("message", "서버 연결을 확인해 주세요."))
	clock_busy = false

func perform(action: Dictionary, show_result: bool = true) -> bool:
	if busy: return false
	busy = true
	while clock_busy: await get_tree().process_frame
	world.touch_direction = Vector2.ZERO
	ui.toast("진행 중…")
	var data = await _api("/api/games/" + game_id + "/actions", HTTPClient.METHOD_POST, action)
	busy = false
	if not data.has("state"):
		ui.toast(data.get("message", "행동을 마치지 못했습니다. 진행을 확인해 주세요."))
		return false
	_apply(data)
	_remember_position()
	var note = str(_state().get("systemNote", ""))
	if not note.is_empty(): ui.toast(note)
	else: ui.toast_time = 0
	if not _state().get("flags", {}).get("in_magic_world", false): _returned_home()
	elif show_result: _scene()
	return true

func _travel(target: String) -> bool:
	if _state().get("location", "") == target: return true
	return await perform({"type":"travel", "targetId":target}, false)

func _cross_gate(outbound: bool) -> void:
	var continuation = world.path.duplicate()
	world.path.clear()
	if outbound:
		if await _travel("arcana_hunting_ground"):
			world.path = continuation
			ui.toast("도시 앞 평원 · 슬라임의 흔적이 이어집니다.")
		else: world.player_position.y = 778
	else:
		if await _travel("arcana_plaza"):
			world.path = continuation
			ui.toast("아르카나 · 분수 광장")
		else: world.player_position.y = 800
func _activate() -> void:
	if busy: return
	if not _battle().is_empty(): _scene()
	elif not world.nearest.is_empty(): world.interact()
	else: _scene()

func _interact(entity: Dictionary) -> void:
	if busy: return
	world.path.clear()
	match entity.kind:
		"building":
			if await _travel(entity.id):
				if entity.id == "arcana_academy":
					ui.toast("학교 안에서 인물과 각 공간을 찾아가 보세요.")
				else: _scene()
		"exit":
			if world.indoor == "dungeon": _scene(); return
			if await _travel("arcana_plaza"):
				world.change_interior("")
				ui.toast("분수 광장")
		"academy_room":
			var school = snapshot.get("academyMap", {})
			for room in school.get("rooms", []):
				if room.id != entity.id: continue
				if not room.lockedReason.is_empty(): ui.toast(room.lockedReason); return
				if room.action is Dictionary:
					await perform(room.action)
				else: _scene()
		"portal":
			if await _travel("arcana_return_portal"): _scene()
		"gate":
			world.walk_to(Vector2(576, 855))
		"city":
			world.walk_to(Vector2(576, 716))
		"slime":
			if not await _travel("arcana_hunting_ground"): return
			var track = _find_action("content_action", "track_slime_at_arcana_hunting_ground")
			if not track.is_empty(): await perform(track)
			else: _scene()
		"workbench":
			if await _travel("arcana_plaza"):
				var action = _find_action("content_action", "open_arcana_workbench")
				if not action.is_empty(): await perform(action)
				else: _scene()
		"dungeon":
			if await _travel("arcana_plaza"):
				var action = _find_action("magic_dungeon", "start")
				if not action.is_empty():
					if await perform(action): world.change_interior("dungeon")
				else: _scene()
		"resident":
			ui.open_panel("광장의 여행자")
			panel_mode = "resident"
			ui.paragraph("망토를 두른 여행자가 분수 너머의 길을 가리킵니다. 서쪽에는 상점과 여관, 동쪽에는 식당과 아카데미가 있습니다. 남문 밖은 슬라임이 나타나는 평원입니다.")
			ui.choice("길을 이어 간다", "", ui.close_panel)
		_:
			_scene()

func _find_action(type: String, id: String) -> Dictionary:
	for entry in snapshot.get("availableActions", []):
		var a = entry.get("action", {})
		if a.get("type", "") == type and (a.get("actionId", "") == id or a.get("command", "") == id): return a
	return {}

func _scene(page: int = 0) -> void:
	panel_mode = "scene"
	action_page = page
	var scene = snapshot.get("currentScene", {})
	var scene_title = str(scene.get("title", "주변 살펴보기"))
	for pair in [["early morning", "이른 아침"], ["late morning", "오전"], ["late night", "깊은 밤"], ["dawn", "새벽"], ["noon", "정오"], ["morning", "아침"], ["afternoon", "낮"], ["evening", "저녁"], ["night", "밤"]]:
		scene_title = scene_title.replace("(" + pair[0] + ")", "· " + pair[1])
	ui.open_panel(scene_title)
	for p in scene.get("paragraphs", []): ui.paragraph(p)
	var run = _state().get("magicDungeon", {}).get("run")
	if run is Dictionary and run.get("phase", "") == "battle":
		ui.paragraph("%s · HP %d / %d" % [run.enemy.name, int(run.enemy.hp), int(run.enemy.maxHp)], ui.GOLD)
		var enemy_meter = ui.make_bar(Color("b5c58e"), 4)
		enemy_meter.value = float(run.enemy.hp) / float(run.enemy.maxHp) * 100
		ui.content.add_child(enemy_meter)
	var note = str(_state().get("systemNote", ""))
	if not note.is_empty(): ui.paragraph(note, ui.GOLD)
	var actions = _visible_actions()
	for i in range(page * 5, mini(page * 5 + 5, actions.size())):
		var entry: Dictionary = actions[i]
		ui.choice(entry.get("label", "선택"), entry.get("outcomeHint", ""), func(): _choose(entry), not entry.get("isAvailable", true))
	if actions.size() > 5:
		ui.choice("다른 행동 보기", "%d / %d" % [page + 1, ceili(actions.size() / 5.0)], func(): _scene((page + 1) % ceili(actions.size() / 5.0)))
	if actions.is_empty(): ui.paragraph("이곳에서는 주변을 걸어 다니며 문과 인물을 살펴볼 수 있습니다.", ui.MUTED)

func _visible_actions() -> Array:
	var result: Array = []
	var school = snapshot.get("academyMap")
	var navigation = ["academy_visit_headmaster", "academy_visit_stella", "academy_visit_stella_again", "academy_open_curriculum", "academy_return_courtyard", "academy_return_headmaster", "academy_return_curriculum", "academy_visit_library", "academy_return_library", "academy_return_stella", "academy_resume_observatory", "academy_view_observatory"]
	for entry in snapshot.get("availableActions", []):
		var id = entry.get("action", {}).get("choiceId", entry.id)
		if school is Dictionary and not _state().get("npcDialogue", {}).get("active") is Dictionary:
			if id in navigation: continue
			if id == "academy_attend_theory" and school.currentRoomId != "classroom": continue
			if id == "academy_open_practical" and school.currentRoomId != "practice": continue
		result.append(entry)
	return result

func _choose(entry: Dictionary) -> void:
	if busy: return
	var action: Dictionary = entry.action
	var battle_action = action.get("type", "") == "arcana_combat"
	var command = action.get("command", "")
	if battle_action and command in ["start", "resume", "fireball", "dodge", "potion", "finish", "retreat"]:
		ui.close_panel()
		if await perform(action, false):
			if command == "dodge": world.effect("dodge")
			if command == "retreat": world.player_position = Vector2(576, 910)
	else:
		if await perform(action):
			if _state().get("magicDungeon", {}).get("run") == null and world.indoor == "dungeon": world.change_interior("")

func _magic(command: String) -> void:
	if busy or ui.overlay.visible: return
	if _state().get("magicDungeon", {}).get("run") is Dictionary: return
	if _battle().is_empty() and command != "potion": return
	var action = {"type":"arcana_combat", "command":command}
	if not _battle().is_empty(): action.battleId = _battle().id
	if await perform(action, false):
		if command == "dodge": world.effect("dodge")
		if _battle().get("phase", "") in ["victory", "defeat"]: _scene()

func _menu(kind: String) -> void:
	if busy or snapshot.is_empty(): return
	panel_mode = kind
	match kind:
		"map": _map()
		"inventory": _inventory()
		"quests":
			ui.open_panel("의뢰")
			for quest in snapshot.get("quests", []):
				if not quest.id.begins_with("academy_"): continue
				ui.paragraph(quest.name + " · " + {"inactive":"미수락", "active":"진행 중", "completed":"완료", "failed":"실패"}.get(quest.status, quest.status), ui.GOLD)
				ui.paragraph(quest.get("nextStep", quest.summary))
		"journal":
			ui.open_panel("여행 기록")
			var logs = _state().get("log", []).duplicate()
			logs.reverse()
			for log in logs.slice(0, 18): ui.paragraph(log.get("timestampLabel", "") + "\n" + log.get("message", ""))
		"menu":
			ui.open_panel("잠시 쉬어가기")
			ui.paragraph("아르카나 · 별빛의 도시", ui.GOLD)
			ui.choice("진행 저장", "현재 모험과 위치를 저장합니다.", _save)
			ui.choice("조작 방법", "터치와 키보드 안내", _help)
			ui.choice("전체 화면", "F · Esc로 해제", _fullscreen)
			ui.choice("낮 / 해질녘", "광장 빛 전환", func(): world.set_art_state(not world.dusk, world.effects_enabled); ui.close_panel())
			ui.choice("환경 효과 켜기 / 끄기", "기본 그림 보기", func(): world.set_art_state(world.dusk, not world.effects_enabled); ui.close_panel())
			ui.choice("홈으로", "저장한 뒤 홈 메뉴로 돌아갑니다.", _save_and_home)
			ui.choice("새 모험", "현재 모험을 유지할지 먼저 확인합니다.", _confirm_new)

func _map() -> void:
	ui.open_panel("아르카나 지도")
	var school = snapshot.get("academyMap")
	if school is Dictionary and world.indoor == "arcana_academy":
		ui.paragraph("학교 안의 공간을 골라 걸어갈 수 있습니다.", ui.MUTED)
		for entity in world.entities:
			if entity.kind != "academy_room": continue
			var reason = ""
			for room in school.rooms:
				if room.id == entity.id: reason = room.lockedReason
			ui.choice(entity.name, reason if not reason.is_empty() else "길 안내", func(): ui.close_panel(); world.walk_to(entity.pos), not reason.is_empty())
		ui.choice("도시 지도 보기", "", _city_map)
	else: _city_map()

func _city_map() -> void:
	ui.open_panel("아르카나 지도")
	ui.paragraph("북쪽의 귀환 포탈과 아카데미, 분수 주변의 상점과 여관, 남문 밖의 평원이 하나의 길로 이어집니다. 목적지를 고르면 그곳까지 걸어갑니다.", ui.MUTED)
	if world.indoor != "":
		ui.paragraph("문으로 나가면 도시의 길을 안내할 수 있습니다.")
		return
	for entity in world._outdoor_entities:
		if entity.kind == "resident" or entity.kind == "city": continue
		var destination = entity.pos + (Vector2(0, 24) if entity.kind == "slime" else Vector2.ZERO)
		ui.choice(entity.name, "걸어가기 · 도착 후 살펴보기", func(): ui.close_panel(); world.walk_to(destination))

func _inventory() -> void:
	ui.open_panel("소지품")
	ui.paragraph("소지금 %d원" % int(_state().get("money", 0)), ui.GOLD)
	var bag = _state().get("inventory", {})
	if bag.is_empty(): ui.paragraph("가방이 비어 있습니다.")
	for item in snapshot.get("inventoryCards", []):
		var count = int(bag.get(item.id, 0))
		if count <= 0: continue
		var action = {"type":"arcana_combat", "command":"potion"} if item.id == "manaPotion" else {"type":"use_item", "itemId":item.id}
		if item.id == "manaPotion" and not _battle().is_empty(): action.battleId = _battle().id
		var usable = item.kind in ["food", "drink", "medicine"]
		ui.choice("%s × %d" % [item.name, count], item.description, func():
			if await perform(action, false): _inventory(), not usable)

func _help() -> void:
	ui.open_panel("조작 방법")
	ui.paragraph("화면의 길을 누르면 장애물을 피해 걸어갑니다. 왼쪽 아래 방향 버튼 또는 WASD·방향키로 직접 움직일 수도 있습니다.")
	ui.paragraph("문·인물·작업대 가까이에서 ‘살펴보기’ 또는 E·Space를 누르세요. 학교 안에서도 각 공간으로 걸어가 상호작용할 수 있습니다.")
	ui.paragraph("평원의 슬라임을 살펴보고 전투를 시작하세요. 1은 파이어볼, 2는 회피, 3은 마나 포션입니다. 파이어볼은 MP 4와 재사용 3초, 회피는 0.8초와 재사용 5초입니다. 적의 도약 예고는 줄어드는 바로 표시됩니다.")
	ui.paragraph("메뉴를 열거나 다른 창으로 전환하면 시간을 멈춥니다. 진행 저장 후 다시 들어오면 같은 모험을 이어 갑니다.")

func _save() -> bool:
	if busy: return false
	busy = true
	while clock_busy: await get_tree().process_frame
	var data = await _api("/api/games/" + game_id + "/save", HTTPClient.METHOD_POST)
	busy = false
	if data.has("error"):
		ui.toast(data.get("message", "저장하지 못했습니다."))
		return false
	_remember_position()
	ui.toast("현재 모험과 위치를 저장했습니다.")
	return true

func _remember_position() -> void:
	_store(SAVE_KEY, game_id)
	_store(SAVE_KEY + "-position", JSON.stringify({"location":_state().get("location", ""), "x":world.player_position.x, "y":world.player_position.y}))

func _save_and_home() -> void:
	if await _save(): _home()

func _home() -> void:
	if OS.has_feature("web"): JavaScriptBridge.eval("location.href='/'")
	else: get_tree().quit()

func _fullscreen() -> void:
	if OS.has_feature("web"): JavaScriptBridge.eval("window.arcanaToggleFullscreen()")
	else:
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED if DisplayServer.window_get_mode() == DisplayServer.WINDOW_MODE_FULLSCREEN else DisplayServer.WINDOW_MODE_FULLSCREEN)
	ui.close_panel()

func _confirm_new() -> void:
	ui.open_panel("새 모험을 시작할까요?")
	ui.paragraph("현재 모험의 이어가기 연결을 새 모험으로 바꿉니다. 홈 메뉴의 기존 텍스트 게임 저장은 유지됩니다.")
	ui.choice("현재 모험 계속하기", "", ui.close_panel)
	ui.choice("새 아르카나 모험 시작", "", _new_game)

func _new_game() -> void:
	# Explicit new game must not automatically attach an older shared save.
	busy = true
	var data = await _api("/api/games", HTTPClient.METHOD_POST, {"startAt":"arcana"})
	busy = false
	if not data.has("state"): ui.toast(data.get("message", "새 모험을 시작하지 못했습니다.")); return
	game_id = data.gameId
	saved_position = {}
	world.change_interior("")
	world.player_position = world.SPAWN
	_apply(data)
	_remember_position()
	ui.close_panel()

func _returned_home() -> void:
	panel_mode = "returned"
	ui.open_panel("현실로 이어진 길", false)
	ui.paragraph("귀환 포탈을 지나 현실의 들판으로 돌아왔습니다. 현재 진행을 저장하고 텍스트 게임에서 이어갈 수 있습니다.")
	ui.choice("텍스트 게임에서 이어가기", "현재 모험을 홈의 이어하기에 연결합니다.", func():
		if await _save():
			_store(SHARED_SAVE_KEY, game_id)
			_home())
	ui.choice("홈으로", "", _home)

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		match event.physical_keycode:
			KEY_E, KEY_SPACE:
				if not ui.overlay.visible: _activate()
			KEY_1: _magic("fireball")
			KEY_2: _magic("dodge")
			KEY_3: _magic("potion")
			KEY_I: _menu("inventory")
			KEY_M: _menu("map")
			KEY_J: _menu("quests")
			KEY_ESCAPE:
				if ui.overlay.visible and ui.close_button.visible: ui.close_panel()
				else: _menu("menu")
			KEY_F: _fullscreen()
	if ui.overlay.visible or busy: return
	var position = Vector2.ZERO
	var tapped = false
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		position = event.position
		tapped = true
	elif event is InputEventScreenTouch and event.pressed:
		position = event.position
		tapped = true
	if tapped and viewport_host.get_rect().has_point(position):
		var local = (position - viewport_host.position) * Vector2(viewport.size) / viewport_host.size
		var target = viewport.canvas_transform.affine_inverse() * local
		world.walk_to(target)

func _bridge_command(args: Array) -> void:
	if args.is_empty(): return
	var payload = JSON.parse_string(str(args[0]))
	if not payload is Dictionary: return
	match payload.get("command", ""):
		"focus":
			page_active = bool(payload.get("active", true))
			world.enabled = page_active and not busy and not ui.overlay.visible
			world.touch_direction = Vector2.ZERO
			heartbeat = 1
		"menu": _menu(payload.get("kind", "menu"))
		"interact": _activate()
		"move": world.touch_direction = Vector2(float(payload.get("x", 0)), float(payload.get("y", 0)))
		"magic": _magic(payload.get("spell", "fireball"))
		"close": ui.close_panel()

func _bridge_state(_args: Array) -> void:
	var state = {"engine":"Godot 4.5.1", "coordinateSystem":"origin top-left; x right; y down; world pixels", "ready":not snapshot.is_empty(), "gameId":game_id, "clockClientId":client_id, "clockSequence":sequence, "busy":busy, "location":_state().get("location", ""), "interior":world.indoor, "active":page_active, "walkingEnabled":world.enabled, "pathLength":world.path.size(), "player":{"x":world.player_position.x, "y":world.player_position.y}, "nearby":world.nearest.get("name", ""), "stats":_combat(), "money":_state().get("money", 0), "inventory":_state().get("inventory", {}), "panel":panel_mode if ui.overlay.visible else "", "panelTitle":ui.panel_title.text, "actions":_visible_actions(), "academyMap":snapshot.get("academyMap"), "quests":snapshot.get("quests", []), "error":resume_error}
	if OS.has_feature("web"):
		JavaScriptBridge.eval("window.arcanaLatestState=" + JSON.stringify(state))
