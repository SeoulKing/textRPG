extends Node

const View = preload("res://scripts/simplified_view.gd")
const MapGrid = preload("res://scripts/simplified_city_grid.gd")
const HomesteadView = preload("res://scripts/simple_homestead_view.gd")
const ROOM_DETAILS := {
	"home_bathroom": "욕조와 세면대가 있는 작은 욕실입니다.",
	"counter": "화덕과 조리대가 있는 식당 안쪽입니다.",
	"restaurant_window_north": "항구가 보이는 북쪽 창가의 2인석입니다.",
	"restaurant_window_south": "항구가 보이는 남쪽 창가의 2인석입니다.",
	"restaurant_table_four": "홀 오른쪽에 있는 4인석입니다.",
	"restaurant_table_shared": "여러 사람이 둘러앉을 수 있는 공용 식탁입니다.",
}
const VIEW_LAYER := 100
const COMBAT_WALK_STALL_MS := 2500
const DODGE_WALK_RESUME_COOLDOWN := 4.3
const DODGE_DETAIL := "1초간 공격 1회 회피"
const SLIME_HIT_LABELS := {"slime_contact": "몸 접촉", "slime_leap": "도약"}
const BUILDING_TILES := {
	"arcana_inn": "inn",
	"arcana_academy": "academy",
	"arcana_restaurant": "restaurant",
	"arcana_shop": "shop",
	"arcana_home": "home",
}
const TILE_LABELS := {
	"inn": "여관",
	"academy": "마법학교",
	"restaurant": "식당",
	"shop": "상점",
	"plaza": "분수 광장",
	"home": "내 집",
	"meadow": "뿔소 초원",
}
const DESTINATION_DETAILS := {
	"academy_room": "방으로 이동 · 이야기 또는 수업",
	"academy_stairs": "계단으로 이동 · 층 바꾸기",
	"building": "입구까지 이동 · 입장",
	"city_corner": "지나가며 둘러보기",
	"city_resident": "인물에게 다가가 대화",
	"counter": "조리대 앞으로 이동",
	"exit": "출입문을 지나 밖으로",
	"gate": "남문을 지나 평원으로",
	"home_bathroom": "욕실로 이동",
	"home_bed": "쉬기 · 다음 날 준비",
	"home_door": "분수 광장으로 나가기",
	"home_kitchen": "화덕에서 요리하기",
	"home_sofa": "앉아서 쉬기 · 식사",
	"home_storage": "소지품 넣기 · 보관한 물건 꺼내기",
	"home_table": "작업대에서 제작하기",
	"innkeeper": "마르텐과 대화 · 의뢰 보고",
	"inn_quest_board": "받을 수 있는 의뢰 확인",
	"inn_sofa": "긴 소파에 앉기",
	"inn_armchair": "안락의자에 앉기",
	"inn_window_bench": "창가 벤치에 앉기",
	"inn_entrance_bench": "입구 벤치에 앉기",
	"merchant": "물품 사고팔기",
	"quest_board": "받을 수 있는 의뢰 확인",
	"resident": "인물에게 다가가 대화",
	"slime": "슬라임의 흔적 살펴보기",
	"workbench": "작업대에서 제작하기",
}

var main: Node
var enabled := false
var _view: View
var _place_detail := ""
var _detail_location := ""
var _map_move_active := false
var _travel_notices: Array[String] = []
var _academy_floor := 0
var _academy_story_room := ""
var _academy_stair_landing := false
var _academy_notice_target := ""
var _story_scene_id := ""
var _story_page := 0
var _slime_selected := false
var _slime_finished := false
var _slime_approach := Vector2.INF
var _plaza_approach_life := ""
var _plaza_approach_spell := ""
var _slime_stepping := false
var _plaza_engage_pending := false
var _other_combat_actions := false
var _offline_battle_log: Array = []
var _retreating := false
var _retreat_request_pending := false
var _retreat_revision := -1
var _combat_walk_position := Vector2.ZERO
var _combat_walk_progress_ms := 0
var _homestead_view := HomesteadView.new()
var _homestead_page := ""
var _homestead_game_id := ""
var _homestead_state: Dictionary = {}
var _homestead_error := ""
var _homestead_sending := false
var _duel_recheck_on_connect := false
var _live_duel_impact_revision := -1
var _seen_duel_results: Dictionary = {}
var _homestead_request := 0

func _ready() -> void:
	_view = View.new()
	# World nameplates and reward effects can be added to the HUD at runtime.
	_view.z_index = VIEW_LAYER
	main.ui.root.add_child(_view)
	main.ui.root.move_child(_view, main.ui.overlay.get_index())
	_view.hide()
	_view.navigation_requested.connect(_navigate)
	_view.place_requested.connect(_choose_world_tile)
	_view.local_place_requested.connect(_choose_local_tile)
	main.ui.hunger_bar.value_changed.connect(_view.set_hunger)
	_view.set_hunger(main.ui.hunger_bar.value)
	main.fishing.catch_confirmed.connect(_view.set_fishing_result)
	main.spatial_combat.confirmed_combat_event.connect(_record_combat_event)
	main.ui.toast_shown.connect(_record)
	main.ui.overlay.visibility_changed.connect(_sync_view_focus)

func set_enabled(value: bool) -> void:
	if enabled == value or _map_move_active or main.busy or main.fishing.visible or main.life.blocking(): return
	_close_slime()
	_reset_homestead()
	enabled = value
	_view.set_pond_layout(false)
	_place_detail = ""
	_detail_location = ""
	if enabled:
		main.world.path.clear()
		main.world.touch_direction = Vector2.ZERO
		main.world.clicked_interaction_id = ""
		main.world.click_door_id = ""
		main.world.bench_has_destination = false
	main.ui.close_panel()
	main.ui.overlay.z_index = VIEW_LAYER + 1 if enabled else 0
	main.ui.set_text_mode(enabled)
	main.ui.reset_touch_controls()
	main.spatial_combat.cancel_aim()
	main._clear_zoom_touches()
	main.world.keyboard_movement_enabled = not enabled
	main.fishing.set_text_mode(enabled)
	_sync_display()
	main._sync_world_input()
	if enabled:
		_story_scene_id = ""
		_story_page = 0
		_view.clear_log()
		refresh()
		_view.scroll_to_scene_start()

func _sync_display() -> void:
	var show_world := not enabled
	_view.visible = enabled
	main.ui.hud.visible = show_world
	main.ui.action_cluster.visible = show_world
	main._world_display.visible = show_world
	if enabled:
		get_tree().node_added.connect(_suspend_new_world_viewport)
	else:
		get_tree().node_added.disconnect(_suspend_new_world_viewport)
	# A nested viewport can render independently of the hidden main viewport.
	_set_world_viewports_active(main.viewport, show_world)
	main.world_renderer.process_mode = Node.PROCESS_MODE_INHERIT if show_world else Node.PROCESS_MODE_DISABLED
	main.world.set_world_visuals_enabled(show_world)
	main.spatial_combat.set_world_visuals_enabled(show_world)
	main.online_presence.set_world_visuals_enabled(show_world)
	if show_world:
		main._resize()
		main.life.sync_fire_visuals()
	else:
		main.ui.update_mei_nameplate(Vector2.ZERO, false)

func _set_world_viewports_active(node: Node, active: bool) -> void:
	if node is SubViewport:
		RenderingServer.viewport_set_active(node.get_viewport_rid(), active)
	for child in node.get_children(true):
		_set_world_viewports_active(child, active)

func _suspend_new_world_viewport(node: Node) -> void:
	if node is SubViewport and main.viewport.is_ancestor_of(node):
		RenderingServer.viewport_set_active(node.get_viewport_rid(), false)

func _sync_view_focus() -> void:
	_view.set_panel_open(enabled and main.ui.overlay.visible)

func _navigate(kind: String) -> void:
	if _map_move_active or main.busy or main.fishing.visible or main.life.blocking(): return
	if not _homestead_page.is_empty(): _close_homestead()
	if kind == "map":
		main._menu("map")
		return
	if kind == "destinations":
		open_destinations()
	else:
		main._menu(kind)

func show_map() -> void:
	if not _homestead_page.is_empty(): _close_homestead()
	main.panel_mode = "map"
	main.ui.open_tab_panel("월드맵")
	main.ui.show_tab_body(_view.build_map_body())
	_view.remember_map_tab()
	refresh()

func _plaza_destinations() -> Dictionary:
	var destinations := {"plaza_fountain": MapGrid.PLAZA_PLACES.plaza_fountain[1]}
	if main.online_world:
		destinations["plaza_village_board"] = MapGrid.PLAZA_PLACES.plaza_village_board[1]
	if not main.online_world or _field_target_ready("plaza_slime"):
		destinations["plaza_slime"] = MapGrid.PLAZA_PLACES.plaza_slime[1]
	return destinations

func is_map_open() -> bool:
	return enabled and _view.is_map_open()

func handle_map_input(event: InputEvent) -> bool:
	var map_open := is_map_open()
	if not map_open and not _view.region_move_active:
		if _homestead_page.is_empty() or main.ui.overlay.visible or not event is InputEventKey or not event.pressed or event.echo: return false
		match event.physical_keycode:
			KEY_ESCAPE: _close_homestead()
			KEY_I: _navigate("inventory")
			KEY_M: _navigate("map")
			KEY_J: _navigate("quests")
			KEY_E, KEY_SPACE, KEY_1, KEY_2, KEY_3, KEY_4: pass
			_: return false
		get_viewport().set_input_as_handled()
		return true
	if event is InputEventKey and event.pressed and not event.echo:
		if map_open and event.physical_keycode in [KEY_ESCAPE, KEY_M]: main.ui.close_panel()
		get_viewport().set_input_as_handled()
	return true

func show_scene() -> void:
	if main.ui.overlay.visible: main.ui.close_panel()
	_story_page = 0
	refresh()
	_view.scroll_to_scene_start()

func _record(message: String) -> void:
	if not enabled or message == "진행 중…": return
	if _view.region_move_active:
		_travel_notices.append(message)
	else:
		_view.record(message)

func refresh() -> void:
	if not enabled or main.fishing.visible or _view.region_move_active: return
	if not _homestead_page.is_empty():
		if _homestead_page == _homestead_area() and _homestead_game_id == str(main.game_id):
			if _homestead_page == "forest":
				if not main.combat_socket.socket_ready:
					_duel_recheck_on_connect = true
				elif _duel_recheck_on_connect and not _homestead_sending:
					_duel_recheck_on_connect = false
					_request_homestead()
					return
			_render_homestead()
			return
		_reset_homestead()
	_view.set_duel_health()
	_view.set_duel_impact()
	_view.set_duel_log([])
	var location := str(main._state().get("location", ""))
	if _detail_location != location:
		_detail_location = location
		_place_detail = ""
	var tile := _current_tile()
	var battle: Dictionary = main._battle()
	var fighting: bool = main._online_fighting() if main.online_world else battle.get("phase", "") == "battle"
	var spatial: Dictionary = battle.get("spatial", {})
	var meadow_ox := tile == "meadow"
	var enemy_name := _enemy_name()
	if tile == "plaza" and _slime_finished and fighting and _joined_plaza_slime(battle, spatial):
		_select_slime()
	var plaza_victory := tile == "plaza" and _slime_selected and _slime_finished
	var online_slime: bool = main.online_world and (plaza_victory or spatial.get("encounterId", "") in ["plaza_slime", "meadow_ox"])
	var enemy_nearby: bool = tile != "river" and main.spatial_combat.available() and main.spatial_combat.visible_enemy()
	if online_slime:
		_update_slime_approach(spatial, enemy_nearby)
		_update_slime_step(spatial, fighting)
		if fighting and tile != "river" and not _slime_selected and not _retreat_request_pending:
			_select_slime()
		_update_slime_retreat(spatial, fighting)
	elif _slime_selected or _retreating or _slime_stepping or _slime_approach.is_finite():
		_close_slime()
	var show_slime := online_slime and _slime_selected
	var offline_combat: bool = not main.online_world and (not battle.is_empty() or enemy_nearby)
	var show_combatants: bool = show_slime or (offline_combat and not battle.is_empty())
	var connected: bool = not main.online_world or main.combat_socket.socket_ready
	var plaza_slime: bool = show_slime and (plaza_victory or spatial.get("encounterId", "") == "plaza_slime")
	var enemy_hp := int(battle.get("enemyHp", 0))
	var plaza_slime_defeated := plaza_slime and (plaza_victory or enemy_hp <= 0)
	var active_plaza_slime: bool = plaza_slime and not plaza_slime_defeated \
		and battle.get("phase", "") == "battle" and not battle.get("paused", false)
	var show_combat_timing := show_combatants and connected and (not plaza_slime or active_plaza_slime)
	var enemy := _combat_enemy(spatial)
	var remaining := float(battle.get("attackIn", 6.0)) if main.online_world else float(main.world.battle.get("attackIn", battle.get("attackIn", 6.0)))
	var warning := _combat_warning(battle, spatial, remaining) if show_combat_timing else -1.0
	var imminent := warning >= 0.0 and remaining <= 1.0
	var player_id: String = main.online_presence.character_id if main.online_world else ""
	var saved_target: Variant = enemy.get("targetId")
	var target_id: String = saved_target if saved_target is String else ""
	var target_locked: bool = spatial.get("targetLocked", false)
	var targeting_player: bool = not player_id.is_empty() and target_id == player_id
	var behavior := str(spatial.get("behavior", ""))
	var leap_in_progress: bool = active_plaza_slime and behavior == "attack" and spatial.get("slimeAction", "") == "leap"
	var leap_path_clear := false
	if show_combat_timing and not _slime_finished and active_plaza_slime and tile == "plaza" and target_locked and targeting_player \
		and spatial.get("slimeAction", "") == "leap" and (warning >= 0.0 or leap_in_progress):
		leap_path_clear = main.spatial_combat.plaza_leap_path_clear(spatial, leap_in_progress)
	var warn_player: bool = imminent and (not main.online_world or (target_locked and targeting_player))
	if leap_in_progress:
		warn_player = target_locked and targeting_player and not spatial.get("jumpHit", false)
	warn_player = warn_player and not leap_path_clear
	var intent := ""
	var danger := false
	var recovery := -1.0
	var recovery_seconds := -1.0
	if show_combat_timing and not _slime_finished:
		if warning >= 0.0:
			var attack_name := "돌진" if meadow_ox else "도약"
			intent = "%s 임박" % attack_name if imminent else "%s 준비 중" % attack_name
		elif leap_in_progress:
			intent = "도약 중"
		elif behavior == "recover":
			intent = "반격 기회"
			if active_plaza_slime:
				recovery_seconds = _combat_recovery_seconds(spatial)
				if recovery_seconds >= 0.0: recovery = recovery_seconds / float(spatial.recoveryDuration)
		if active_plaza_slime and (warning >= 0.0 or leap_in_progress):
			danger = warn_player
			if not target_id.is_empty() and not player_id.is_empty() and not targeting_player:
				intent += " · 다른 모험가로 고정" if target_locked else " · 다른 모험가 조준"
			if leap_path_clear: intent += " · 경로 밖"
	var pond: bool = main.online_world and tile == "river" and not show_slime
	var scene: Dictionary = main.snapshot.currentScene if main.snapshot.get("currentScene") is Dictionary else {}
	var scene_id := str(scene.get("id", ""))
	var area := _interior_area()
	var inside := not area.is_empty()
	var targets := _interior_targets(area) if inside else {}
	var destinations := _interior_labels(area, targets) if inside else {}
	var academy := _is_academy_area(area)
	var current := _academy_map_position(area, scene_id) if academy else _place_detail
	if not academy:
		_academy_floor = 0
		_academy_story_room = ""
		_academy_stair_landing = false
		_academy_notice_target = ""
	if _view.is_map_open():
		_view.set_world_map_state(tile, _map_destinations())
	var state: Dictionary = main._state()
	var combat: Dictionary = main._combat()
	var life_state: Dictionary = state.get("arcanaLife", {})
	_view.set_status(
		main.ui.zone_label.text, combat,
		int(state.get("money", 0)), int(state.get("worldElapsedMs", -1))
	)
	var context := ""
	if main.online_world and not main.combat_socket.socket_ready:
		context = "세계에 연결하고 있습니다…"
	elif main.busy and not main.travel_pending:
		context = "행동 결과를 기다리고 있습니다…"
	elif show_combatants:
		if plaza_slime_defeated:
			context = "%s 처치" % enemy_name
		elif _retreating or intent.is_empty():
			context = _combat_description(battle, spatial, enemy_name, meadow_ox)
		elif warn_player and not plaza_slime:
			context = "%s의 공격이 당신을 향하고 있습니다." % enemy_name
	elif _slime_approach.is_finite():
		context = "%s에게 다가가고 있습니다…" % _enemy_name()
	elif academy and not _academy_notice_target.is_empty():
		context = _academy_entry_restriction(_academy_notice_target)
	elif pond and fighting:
		context = "슬라임에게서 거리를 벌리고 있습니다." if _retreating else "슬라임의 추격을 받고 있습니다. 물러난 뒤 낚시할 수 있습니다."

	var dialogue_active: bool = state.get("npcDialogue", {}).get("active") is Dictionary
	# Authored scene cards add a cache version and world time after the definition ID.
	var scene_key := scene_id.get_slice(":", 1) if scene_id.begins_with("scene:") else scene_id
	var location_intro := (location.begins_with("arcana_") and scene_key.ends_with("_intro")) or scene_key == "academy_hall"
	var story_visible := not location_intro and tile != "river" and (not inside or (academy and current != "academy_stairs"))
	var description := ""
	if scene.get("locationId", "") == location and (dialogue_active or story_visible):
		description = "\n\n".join(PackedStringArray(scene.get("paragraphs", [])))
	if scene_id != _story_scene_id:
		_story_scene_id = scene_id
		_story_page = 0
		_view.scroll_to_scene_start()
	var title := str(main.ui.zone_label.text)
	if tile == "river": title = _water_name()
	elif tile in ["plaza", "meadow", "forest"]: title = MapGrid.PLACES[tile][1]
	elif academy:
		title = "마법학교 · %d층" % _academy_floor
	elif inside:
		var name: String = TILE_LABELS[tile]
		title = "%s · %s" % [name, destinations[current]] if destinations.has(current) else name
	var equipment := ""
	if tile == "river" and _rod_equipped(): equipment = "나무 낚싯대 장착 중"
	if tile == "forest" and main.life.axe_equipped(): equipment = "벌목 도끼 장착 중"
	_view.set_pond_layout(pond)
	_view.set_place_detail(title, equipment)
	var show_local_map := not (show_slime or offline_combat or _slime_approach.is_finite())
	if tile == "plaza":
		var plaza_place := "plaza_fountain" if _place_detail.is_empty() else _place_detail
		_view.set_local_map_state(MapGrid.PLAZA_AREA, plaza_place, _plaza_destinations(), show_local_map)
	elif tile == "forest":
		var forest_place := "forest_entrance" if _place_detail.is_empty() else _place_detail
		_view.set_local_map_state(MapGrid.FOREST_AREA, forest_place, MapGrid.forest_destinations(main.online_world), show_local_map)
	elif meadow_ox:
		var meadow_destinations := MapGrid.meadow_destinations(meadow_target_ready())
		_view.set_local_map_state(MapGrid.MEADOW_AREA, "meadow_entrance", meadow_destinations, show_local_map)
	else:
		var locked := _academy_locked_rooms(destinations) if academy else {}
		var map_position := current
		if inside and map_position.is_empty():
			map_position = "home_door" if area == "arcana_home" else "exit"
		_view.set_local_map_state(area, map_position, destinations, show_local_map, locked)
	_view.set_combat_layout(show_combatants, intent, warning, danger, recovery, plaza_slime and tile == "plaza")
	_view.set_scene("" if show_combatants else description, context)
	var enemy_pose := &"death" if plaza_slime_defeated else _enemy_pose(battle, spatial, warning)
	_view.set_combatants(show_combatants, enemy_name, enemy_pose,
		0 if _slime_finished else enemy_hp, int(enemy.get("maxHp", 30)), meadow_ox)
	if show_combatants:
		var dodge_active: bool = combat.get("evadeSkill", "") == "dodge" and not _slime_finished and (not main.online_world or main.combat_socket.socket_ready)
		_view.set_dodge_remaining(float(combat.get("evadeSeconds", 0.0)) if dodge_active else 0.0)
	_sync_offline_combat_log(battle if show_combatants and not main.online_world else {})
	if show_slime:
		_view.set_actions(_encounter_actions(spatial, warn_player, fighting, recovery_seconds), true)
	elif offline_combat:
		_view.set_actions(_offline_combat_actions(battle, warn_player), true)
	elif pond:
		_view.set_actions(_pond_actions(fighting))
	elif tile == "forest":
		var forest_actions: Array[Dictionary] = []
		if _place_detail == "forest_trees":
			var locked: bool = not main.world.enabled or not main.life.can_chop_wood()
			var wood := int(state.get("inventory", {}).get("wood", 0))
			var detail := "쓰러뜨리면 목재 1개 획득 · 현재 %d개 보유" % wood
			if not main.life.axe_equipped(): detail = "장비 창에서 벌목 도끼를 장착해 주세요."
			forest_actions.append(_action("chop_wood", main.life.forest_chop_caption(), detail, main.life.chop_wood.bind("forest_trees", true), locked))
		_view.set_actions(forest_actions)
	elif _slime_approach.is_finite():
		_view.set_actions([_action("slime_cancel_approach", "이동 취소", "", _cancel_slime_approach, main.busy)])
	elif inside and not academy and not dialogue_active:
		_view.set_actions([])
	else:
		_view.set_actions(_local_actions(life_state, tile, online_slime and enemy_nearby))

func _homestead_area() -> String:
	if not main.online_world: return ""
	var location := str(main._state().get("location", ""))
	if location == "arcana_home" and main.world.indoor == "arcana_home": return "home"
	if location == MapGrid.FOREST_AREA and main.world.indoor.is_empty(): return "forest"
	if location == MapGrid.PLAZA_AREA and main.world.indoor.is_empty() and not main._online_fighting(): return "village"
	return ""

func _open_homestead(place: String) -> void:
	var area := _homestead_area()
	if area.is_empty() or not _can_choose_place(): return
	_reset_homestead()
	_detail_location = str(main._state().get("location", ""))
	_place_detail = place
	_homestead_page = area
	_homestead_game_id = str(main.game_id)
	_view.scroll_to_scene_start()
	_request_homestead()

func _reset_homestead() -> void:
	_homestead_request += 1
	_homestead_view.reset_duel_options()
	_homestead_page = ""
	_homestead_game_id = ""
	_homestead_state = {}
	_homestead_error = ""
	_homestead_sending = false
	_duel_recheck_on_connect = false
	_live_duel_impact_revision = -1

func _close_homestead() -> void:
	var result_key := _duel_result_key()
	if not result_key.is_empty(): _seen_duel_results[_homestead_game_id] = result_key
	_reset_homestead()
	refresh()
	_view.scroll_to_scene_start()

func _duel_result_key() -> String:
	if _homestead_page != "forest" or _homestead_state.get("battle") is Dictionary or not _homestead_error.is_empty(): return ""
	var entries: Variant = _homestead_state.get("duelLog")
	if not entries is Array or entries.is_empty(): return ""
	var latest: Variant = entries.back()
	if not latest is Dictionary or not latest.get("finish") is Dictionary: return ""
	if latest.get("result", "") != _homestead_state.get("message", ""): return ""
	return "%s:%d" % [_homestead_game_id, int(_homestead_state.get("revision", 0))]

func _continue_from_duel(result_key: String) -> void:
	if result_key.is_empty() or result_key != _duel_result_key(): return
	_seen_duel_results[_homestead_game_id] = result_key
	refresh()
	_view.scroll_to_scene_start()

func _render_homestead() -> void:
	var state: Dictionary = main._state()
	_view.set_status(main.ui.zone_label.text, main._combat(), int(state.get("money", 0)), int(state.get("worldElapsedMs", -1)))
	var connected: bool = main.combat_socket.socket_ready
	var locked: bool = not connected or _homestead_sending or main.busy or main.life.sending or main.life.blocking()
	if not _homestead_state.is_empty():
		var page := _homestead_state
		var result_key := _duel_result_key()
		var result_seen: bool = not result_key.is_empty() and result_key == _seen_duel_results.get(_homestead_game_id, "")
		var waiting_for_turn := _homestead_sending and page.get("battle") is Dictionary
		if not _homestead_error.is_empty() or waiting_for_turn or result_seen:
			page = page.duplicate()
			if not _homestead_error.is_empty(): page["message"] = _homestead_error
			elif result_seen: page["message"] = ""
			if waiting_for_turn: page["actionPending"] = true
		var reduced_motion: bool = main.world.reduced_motion
		var animate_impact := not _homestead_sending and not reduced_motion and _live_duel_impact_revision >= 0 and _live_duel_impact_revision == int(page.get("revision", -1))
		var continue_duel := Callable()
		if not result_key.is_empty() and not result_seen:
			continue_duel = _continue_from_duel.bind(result_key)
		_homestead_view.render(_view, page, _homestead_page, _request_homestead, _close_homestead, locked, animate_impact, reduced_motion, continue_duel, main._open_inn_supply)
		return
	_view.set_pond_layout(false)
	_view.set_combat_layout(false)
	_view.set_combatants(false, "", &"idle", 0, 0, false)
	_view.set_duel_health()
	_view.set_duel_impact()
	_view.set_duel_log([])
	_view.set_local_map_state("", "", {}, false)
	var titles := {"home": "텃밭", "forest": "정령 터", "village": "마을 게시판"}
	_view.set_place_detail(titles.get(_homestead_page, ""), "")
	var message := _homestead_error
	if _homestead_sending: message = "기록을 불러오고 있습니다…"
	elif message.is_empty(): message = "세계에 연결한 뒤 기록을 불러와 주세요."
	_view.set_scene("", message)
	var actions: Array[Dictionary] = []
	if _homestead_page == "village":
		actions.append(_action("inn_supply", "마르텐의 생선 매입", "민물고기 납품 · 여관의 생선구이 재고", main._open_inn_supply, main.busy))
	actions.append_array([
		_action("homestead_reload", "기록 불러오기", "", _request_homestead, locked),
		_action("homestead_close", "지도로 돌아가기", "", _close_homestead, false),
	])
	_view.set_actions(actions)

func _request_homestead(action: String = "", extra: Dictionary = {}) -> void:
	if _homestead_sending or _homestead_page.is_empty() or not main.combat_socket.socket_ready: return
	var generation := _homestead_request
	var game_id := _homestead_game_id
	if game_id != str(main.game_id): return
	var submitted_revision := int(_homestead_state.get("revision", 0))
	var direct_duel_reply := not action.is_empty() and _homestead_page == "forest" and _homestead_state.get("battle") is Dictionary
	var controller := str(main.client_id)
	var route := "/api/games/%s/simple-homestead" % game_id.uri_encode()
	var read_route := "%s?controller=%s" % [route, controller.uri_encode()]
	_homestead_sending = true
	_homestead_error = ""
	_render_homestead()
	var response: Dictionary
	if action.is_empty():
		response = await main._api_once(read_route, HTTPClient.METHOD_GET, {}, 12.0)
	else:
		var body := extra.duplicate()
		body.merge({"controller": controller, "action": action, "revision": submitted_revision}, true)
		response = await main._api_once(route, HTTPClient.METHOD_POST, body, 12.0)
	if generation != _homestead_request or game_id != str(main.game_id): return
	var uncertain: bool = response.get("retryable", false) or int(response.get("httpStatus", 0)) >= 500
	var refreshed: bool = response.get("error", "") in ["invalid_response", "simple_homestead_revision"]
	var stock_changed: bool = response.get("error", "") == "simple_homestead_village_material"
	if not action.is_empty() and (uncertain or refreshed or stock_changed):
		# The action or the inventory may have changed. Read before enabling another action.
		direct_duel_reply = false
		var rejection := str(response.get("message", "")) if stock_changed else ""
		response = await main._api_once(read_route, HTTPClient.METHOD_GET, {}, 12.0)
		if generation != _homestead_request or game_id != str(main.game_id): return
		if not response.get("homestead") is Dictionary: _homestead_state = {}
		else: _homestead_error = rejection
	_homestead_sending = false
	_live_duel_impact_revision = -1
	if response.get("homestead") is Dictionary:
		_homestead_state = response.homestead
		if direct_duel_reply and int(_homestead_state.get("revision", -1)) == submitted_revision + 1:
			_live_duel_impact_revision = submitted_revision + 1
		if main.combat_socket.socket_ready: _duel_recheck_on_connect = false
	else:
		if action.is_empty(): _homestead_state = {}
		_homestead_error = str(response.get("message", "기록을 불러오지 못했습니다. 다시 시도해 주세요."))
	refresh()

func _pond_actions(fighting: bool) -> Array[Dictionary]:
	var ready: bool = main.world.enabled and main.combat_socket.socket_ready and not main.busy
	if fighting:
		if _retreating: return [_action("slime_cancel_retreat", "물러나기 취소", "", _stop_slime_retreat, _retreat_request_pending)]
		return [_action("slime_leave", "물러나기", "", _start_slime_retreat, not ready)]
	var actions: Array[Dictionary] = [
		_action("fish", "낚시하기", "", main._start_text_fishing, not ready),
	]
	if _view.has_pond_catch() and int(main._state().get("inventory", {}).get("riverFish", 0)) > 0:
		actions.append(_action("cook_catch", "잡은 생선 굽기", "", main.prepare_fish, not ready))
	return actions

func _local_actions(life_state: Dictionary, tile: String, slime_nearby: bool) -> Array[Dictionary]:
	var actions: Array[Dictionary] = []
	var ready: bool = main.world.enabled and not main.busy
	if tile.is_empty() and (not main.world.nearest.is_empty() or not main.world.bench_state.is_empty()):
		actions.append(_action("nearby", main.ui.interaction.accessibility_name, "", main._activate, not ready or main.ui.interaction.disabled))
	var slime_on_map := tile == "plaza" and _plaza_destinations().has("plaza_slime")
	if tile != "meadow" and not slime_on_map and slime_nearby and not _slime_approach.is_finite():
		actions.append(_action("slime", "슬라임 상대하기", "", _select_slime, not ready))
	if main.online_world and tile == "plaza" and main.world.indoor.is_empty() and _place_detail in ["", "plaza_fountain"]:
		var gathered := int(life_state.get("gatheredToday", 0))
		actions.append(_action("gather", "주변 재료 모으기", "오늘 채집 %d / 3회" % gathered, main.life._gather, not ready or gathered >= 3 or main.life.sending))
	if main.world.indoor == "arcana_shop" and not main._visible_actions().is_empty():
		actions.append(_action("shop", "상점 이용", "", main._scene, not ready))
	elif main.world.indoor != "arcana_academy" or not _academy_stair_landing:
		_append_story_actions(actions, ready)
	return actions

func _append_story_actions(actions: Array[Dictionary], ready: bool) -> void:
	var choices: Array = main._visible_actions()
	if choices.is_empty(): return
	const PAGE_SIZE := 5
	var page_count := ceili(float(choices.size()) / PAGE_SIZE)
	_story_page = mini(_story_page, page_count - 1)
	var first := _story_page * PAGE_SIZE
	for index in range(first, mini(first + PAGE_SIZE, choices.size())):
		var entry: Dictionary = choices[index]
		actions.append(_action("story_" + str(entry.id), entry.get("label", "선택"), entry.get("outcomeHint", ""), main._choose.bind(entry), not ready or not entry.get("isAvailable", true)))
	if page_count > 1:
		actions.append(_action("story_next_page", "다른 행동 보기", "%d / %d" % [_story_page + 1, page_count], _next_story_page.bind(page_count), not ready))

func _next_story_page(page_count: int) -> void:
	_story_page = (_story_page + 1) % page_count
	refresh()

func _enemy_name() -> String:
	return MapGrid.MEADOW_PLACES.meadow_ox[1] if _current_tile() == "meadow" else "슬라임"

func meadow_target_ready() -> bool:
	return _field_target_ready("meadow_ox")

func _field_target_ready(encounter_id: String) -> bool:
	var battle: Dictionary = main._battle()
	var spatial: Dictionary = battle.get("spatial", {})
	return main.combat_socket.socket_ready and spatial.get("encounterId", "") == encounter_id \
		and int(battle.get("enemyHp", 0)) > 0 and spatial.get("behavior", "") != "return"

func _joined_plaza_slime(battle: Dictionary, spatial: Dictionary) -> bool:
	if not main.online_world or not main.combat_socket.socket_ready or spatial.get("encounterId", "") != "plaza_slime": return false
	if int(battle.get("enemyHp", 0)) <= 0 or spatial.get("behavior", "") == "return": return false
	var contribution: Dictionary = _combat_enemy(spatial).get("contribution", {})
	return contribution.has(main.online_presence.character_id)

func _combat_description(battle: Dictionary, spatial: Dictionary, enemy_name: String, meadow_ox: bool) -> String:
	if _slime_finished or battle.get("phase", "") == "victory": return "%s 처치" % enemy_name
	if _retreating: return "거리를 벌리고 있습니다."
	match str(spatial.get("behavior", "")):
		"attack":
			match str(spatial.get("slimeAction", "")):
				"charge": return "돌진 중"
				"leap": return "도약 중"
				"flee": return "슬라임이 물러납니다."
				"hop": return "슬라임이 다가옵니다."
			return "돌진 중" if meadow_ox else "도약 중"
		"return": return "%s의 추격에서 벗어났습니다." % enemy_name
	var log: Array = battle.get("log", [])
	if not log.is_empty(): return str(log.back())
	return ""

func _sync_offline_combat_log(battle: Dictionary) -> void:
	var log: Array = battle.get("log", [])
	if _offline_battle_log == log: return
	_offline_battle_log = log.duplicate()
	if not log.is_empty(): _view.record(str(log.back()))

func _combat_enemy(spatial: Dictionary) -> Dictionary:
	var enemies: Array = spatial.get("enemies", [])
	var primary := str(spatial.get("primaryEnemyId", ""))
	for enemy: Dictionary in enemies:
		if enemy.get("id", "") == primary: return enemy
	return enemies[0] if not enemies.is_empty() else {}

func _enemy_pose(battle: Dictionary, spatial: Dictionary, warning: float) -> StringName:
	if _slime_finished or battle.get("phase", "") == "victory": return &"death"
	if warning >= 0.0: return &"prepare"
	match str(spatial.get("behavior", "")):
		"prepare": return &"prepare"
		"attack": return &"attack" if spatial.get("slimeAction", "leap") in ["leap", "charge"] else &"hop"
		"recover": return &"recover"
		"return": return &"hop"
	return &"idle"

func _combat_warning(battle: Dictionary, spatial: Dictionary, remaining: float) -> float:
	if _slime_finished or battle.get("phase", "") != "battle" or battle.get("paused", false): return -1.0
	if spatial.is_empty(): return clampf(remaining / 3.0, 0.0, 1.0) if remaining <= 3.0 else -1.0
	if spatial.get("behavior", "") != "prepare" or spatial.get("slimeAction", "leap") not in ["leap", "charge"]: return -1.0
	return clampf(remaining / maxf(0.01, float(spatial.get("windupDuration", 3.0))), 0.0, 1.0)

func _combat_recovery_seconds(spatial: Dictionary) -> float:
	var elapsed: Variant = spatial.get("recoveryElapsed")
	var duration: Variant = spatial.get("recoveryDuration")
	if typeof(elapsed) not in [TYPE_INT, TYPE_FLOAT] or typeof(duration) not in [TYPE_INT, TYPE_FLOAT]: return -1.0
	if float(elapsed) < 0.0 or float(duration) <= 0.0: return -1.0
	return maxf(0.0, float(duration) - float(elapsed))

func _encounter_actions(spatial: Dictionary, warn_player: bool, fighting: bool, recovery_seconds: float) -> Array[Dictionary]:
	var ready := _slime_input_ready()
	if _slime_finished:
		var tile := _current_tile()
		var next_action: Callable = _select_slime
		var next_ready: bool = ready and not fighting and not _plaza_engage_pending and not main.busy
		var detail := ""
		if tile == "plaza":
			next_action = _start_encounter
			var target_ready := _field_target_ready("plaza_slime")
			next_ready = next_ready and target_ready
			if _plaza_engage_pending:
				detail = "교전 준비 중"
			elif ready and fighting:
				detail = "이전 전투 정리 중"
			elif ready and not target_ready:
				detail = "복귀 중" if spatial.get("behavior", "") == "return" else "재등장 대기"
		elif tile == "meadow":
			next_action = _start_encounter.bind(true)
			next_ready = next_ready and meadow_target_ready()
		return [
			_action("combat_next", "다음 %s 상대하기" % _enemy_name(), detail, next_action, not next_ready),
			_action("combat_leave", "주변으로 돌아가기", "", _close_slime, not ready or fighting or _plaza_engage_pending),
		]
	var approaching := _slime_approach.is_finite()
	var plaza_slime: bool = spatial.get("encounterId", "") == "plaza_slime"
	var plaza_spell_actions := plaza_slime and _current_tile() == "plaza"
	var moving := approaching or _retreating or _slime_stepping
	var flame_wave: Dictionary = {}
	if plaza_spell_actions and main._spell("flame_wave").get("equipped", false):
		var counter_window := recovery_seconds if spatial.get("slimeAction", "leap") == "leap" else -1.0
		flame_wave = _slime_flame_wave_action(ready, moving, counter_window)
	var wave_primary: bool = not flame_wave.is_empty() and not main._spell("fireball").get("equipped", false)
	var primary := flame_wave if wave_primary else _slime_fireball_action(spatial, ready, moving, recovery_seconds, plaza_spell_actions)
	var primary_spell := "flame_wave" if wave_primary else "fireball"
	if approaching:
		var detail := "사격 자리 이동" if _plaza_approach_spell == "fireball" else "접근 중"
		primary = _action("combat_" + primary_spell, "이동 취소", detail, _cancel_slime_approach, not ready, primary_spell)
	var evade_cooldown := _combat_cooldown("dodge", 5.0)
	var move_blocks_dodge := _retreating or (approaching and not plaza_slime)
	var can_evade: bool = ready and not move_blocks_dodge and main.spatial_combat.can_dash()
	var evade_detail := "공격·접촉 1회 / 1초" if plaza_slime else DODGE_DETAIL
	if evade_cooldown > 0.0: evade_detail = "재사용 대기 중"
	elif move_blocks_dodge: evade_detail = "이동 중"
	elif plaza_slime and warn_player and can_evade: evade_detail = "지금 회피"
	var evade := _action("combat_evade", "회피", evade_detail, _dodge_slime, not can_evade, "dodge")
	evade.cooldown = evade_cooldown
	evade.highlighted = warn_player and not evade.disabled
	var leave_label := "주변으로 돌아가기"
	if fighting: leave_label = "전투에서 벗어나기" if plaza_slime else "물러나기"
	var leave := _action("combat_leave", leave_label, "거리 벌리기" if fighting and not plaza_slime else "", _start_slime_retreat if fighting else _close_slime, not ready or approaching)
	if _retreating:
		leave = _action("combat_leave", "이탈 취소" if plaza_slime else "물러나기 취소", "이동 중", _stop_slime_retreat, _retreat_request_pending)
	var actions: Array[Dictionary] = [primary, evade]
	var guard_shown: bool = plaza_spell_actions and main._spell("flame_guard").get("equipped", false)
	if guard_shown: actions.append(_slime_flame_guard_action(ready, warn_player and evade.disabled))
	if not flame_wave.is_empty() and not wave_primary: actions.append(flame_wave)
	if plaza_slime and fighting:
		if _slime_stepping:
			actions.append(_action("combat_step", "이동 멈추기", "이동 중", _stop_slime_step, not ready))
		else:
			var blocked := "이동 중" if moving else _slime_step_block_reason(spatial)
			actions.append(_action("combat_step", "거리 벌리기", "전투 유지" if blocked.is_empty() else blocked, _start_slime_step, not blocked.is_empty()))
	actions.append(leave)
	_append_combat_quickslots(actions, not ready or moving, not flame_wave.is_empty(), guard_shown)
	return actions

func _slime_fireball_action(spatial: Dictionary, ready: bool, moving: bool, recovery_seconds: float, plaza_spell_actions: bool) -> Dictionary:
	var can_fire: bool = ready and not moving and main.spatial_combat.can_target_fireball()
	var duration: float = main.spatial_combat.fireball_cooldown_duration()
	var remaining: float = main.spatial_combat.fireball_cooldown_remaining()
	var cooldown := clampf(remaining / duration, 0.0, 1.0) if duration > 0.0 else -1.0
	var detail := _fireball_detail(can_fire)
	var highlight_counter: bool = spatial.get("encounterId", "") != "plaza_slime" and spatial.get("behavior", "") == "recover"
	if cooldown > 0.0: detail = "재사용 대기 중"
	elif _retreating or _slime_stepping: detail = "이동 중"
	elif spatial.has("plazaFireballCooldown") and main.spatial_combat.fireball_cast_pending(): detail = "발사 중"
	elif can_fire and recovery_seconds >= 0.0 and spatial.get("slimeAction", "leap") == "leap":
		var arrival: float = main.spatial_combat.targeted_fireball_arrival_seconds()
		if arrival >= 0.0:
			highlight_counter = arrival < recovery_seconds
			detail = "반격 노리기" if highlight_counter else "반격 시간 부족"
	var action := _action("combat_fireball", main.ui.SLOT_NAMES.fireball, detail, _cast_slime_fireball, not can_fire, "fireball")
	if ready and not moving and not can_fire and not main.spatial_combat.has_fireball_target() and main.spatial_combat.can_cast("fireball") and int(main._battle().get("enemyHp", 0)) > 0:
		var blocked: bool = plaza_spell_actions and main.spatial_combat.has_fireball_target(false)
		var approach := _approach_plaza_spell.bind("fireball") if plaza_spell_actions else _approach_slime
		var waiting := plaza_spell_actions and _combat_walk_waiting_for_evasion()
		var approach_detail := "이동 중" if waiting else ("장애물에 막힘" if blocked else "사거리 밖")
		action = _action("combat_fireball", "쏠 자리로 이동" if blocked else "사거리까지 접근", approach_detail, approach, waiting, "fireball")
	action.cooldown = cooldown
	action.highlighted = can_fire and highlight_counter
	return action

func _slime_flame_wave_action(ready: bool, moving: bool, recovery_seconds: float) -> Dictionary:
	var spell: Dictionary = main._spell("flame_wave")
	var cooldown := _combat_cooldown("flame_wave", float(spell.get("cooldown", 0.0)))
	var detail := ""
	var can_fire: bool = ready and not moving and main.spatial_combat.can_target_flame_wave()
	var highlight_counter := false
	if moving: detail = "이동 중"
	elif cooldown > 0.0: detail = "재사용 대기 중"
	elif float(main._combat().get("mp", 0.0)) < float(spell.get("cost", 0.0)): detail = "마나 부족"
	elif can_fire:
		if recovery_seconds >= 0.0:
			highlight_counter = float(main.spatial_combat.estimated_combat_input_seconds()) < recovery_seconds
			detail = "반격 노리기" if highlight_counter else "반격 시간 부족"
		else:
			detail = "가까운 적 공격"
	var action := _action("combat_flame_wave", main.ui.SLOT_NAMES.flame_wave, detail, _cast_slime_flame_wave, not can_fire, "flame_wave")
	if ready and not moving and not can_fire and not main.spatial_combat.has_flame_wave_target() \
		and main.spatial_combat.can_cast("flame_wave") and int(main._battle().get("enemyHp", 0)) > 0:
		var blocked: bool = main.spatial_combat.has_flame_wave_target(false)
		var waiting := _combat_walk_waiting_for_evasion()
		var approach_detail := "이동 중" if waiting else ("장애물에 막힘" if blocked else "사거리 밖")
		var label := "화염파 쓸 자리로" if blocked else "화염파 사거리까지"
		action = _action("combat_flame_wave", label, approach_detail, _approach_plaza_spell.bind("flame_wave"), waiting, "flame_wave")
	action.cooldown = cooldown
	action.highlighted = highlight_counter
	return action

func _slime_flame_guard_action(ready: bool, recommend_guard: bool) -> Dictionary:
	var spell: Dictionary = main._spell("flame_guard")
	var combat: Dictionary = main._combat()
	var guard: Dictionary = combat.get("guard", {})
	var amount := ceili(float(guard.get("amount", 0.0)))
	var seconds := float(guard.get("seconds", 0.0))
	var active := amount > 0 and seconds > 0.0
	var duration := float(spell.get("duration", 0.0))
	var cooldown := _combat_cooldown("flame_guard", float(spell.get("cooldown", 0.0)))
	var magnitude := int(spell.get("magnitude", 0))
	var detail := "피해 %d 흡수" % magnitude if magnitude > 0 else "피해 흡수"
	if active: detail = "흡수 %d 남음" % amount
	elif main.spatial_combat.flame_guard_pending(): detail = "발동 중"
	elif cooldown > 0.0: detail = "재사용 대기 중"
	elif float(combat.get("mp", 0.0)) < float(spell.get("cost", 0.0)): detail = "마나 부족"
	elif _retreating or _slime_stepping: detail = "이동 중"
	var can_guard: bool = ready and _slime_can_cast_guard()
	var action := _action("combat_flame_guard", main.ui.SLOT_NAMES.flame_guard, detail, _cast_slime_flame_guard, not can_guard, "flame_guard")
	action.cooldown = cooldown
	if active and duration > 0.0: action.guard_duration_ratio = clampf(seconds / duration, 0.0, 1.0)
	action.highlighted = recommend_guard and can_guard and not active
	return action

func _offline_combat_actions(battle: Dictionary, warn_player: bool) -> Array[Dictionary]:
	var ready: bool = main.world.enabled and not main.busy and not main.ui.overlay.visible
	var phase := str(battle.get("phase", ""))
	var battle_id := str(battle.get("id", ""))
	var paused: bool = battle.get("paused", false)
	var spatial: Dictionary = battle.get("spatial", {})
	if phase in ["victory", "defeat"]:
		var finish := {"type": "arcana_combat", "command": "finish", "battleId": battle_id}
		return [_action("combat_leave", "전투 마치기" if phase == "victory" else "광장으로 돌아가기", "", main.perform.bind(finish, false), not ready)]
	var spell: Dictionary = main._spell("fireball")
	var fireball_cooldown := _combat_cooldown("fireball", float(spell.get("cooldown", 0.0)))
	var classic_cast: bool = phase == "battle" and spell.get("unlocked", false) and spell.get("equipped", false) and float(main._combat().get("mp", 0)) >= float(spell.get("cost", 0.0)) and fireball_cooldown <= 0.0
	var can_fire: bool = ready and not paused and (main.spatial_combat.can_cast("fireball") if not spatial.is_empty() or battle.is_empty() else classic_cast)
	var fireball_detail := "재사용 대기 중" if fireball_cooldown > 0.0 else ""
	if can_fire and main.spatial_combat.has_fireball_target(): fireball_detail = "자동 조준"
	var fireball := _action("combat_fireball", main.ui.SLOT_NAMES.fireball, fireball_detail, main._magic.bind("fireball"), not can_fire, "fireball")
	fireball.cooldown = fireball_cooldown
	fireball.highlighted = can_fire and spatial.get("behavior", "") == "recover"
	var starting := phase == "ready" and spatial.is_empty()
	var resuming := phase == "battle" and paused
	if starting or resuming:
		var command := {"type": "arcana_combat", "command": "start" if starting else "resume", "battleId": battle_id}
		fireball = _action("combat_fireball", "전투 시작" if starting else "전투 재개", "", main.perform.bind(command, false), not ready)
	var evade_cooldown := _combat_cooldown("dodge", 5.0)
	var evade := _action("combat_evade", "회피", "재사용 대기 중" if evade_cooldown > 0.0 else DODGE_DETAIL,
		main._magic.bind("dodge"), not ready or starting or paused or not main.spatial_combat.can_dash(), "dodge")
	evade.cooldown = evade_cooldown
	evade.highlighted = warn_player and not evade.disabled
	var retreat := {"type": "arcana_combat", "command": "retreat", "battleId": battle_id}
	var leave := _action("combat_leave", "물러나기", "거리 벌리기", main._choose.bind({"action": retreat}), not ready or battle.is_empty())
	var actions: Array[Dictionary] = [fireball, evade, leave]
	_append_combat_quickslots(actions, not ready or starting or paused)
	return actions

func _append_combat_quickslots(actions: Array[Dictionary], disabled: bool, flame_wave_shown: bool = false, guard_shown: bool = false) -> void:
	var other: Array[Dictionary] = []
	for index in range(main.ui.quickslot_bindings.size()):
		var command: String = main.ui.quickslot_bindings[index]
		if command in ["", "dev_speed", "fireball", "dodge"]: continue
		if command == "flame_wave" and flame_wave_shown: continue
		if command == "flame_guard" and guard_shown: continue
		other.append(_action("combat_slot_%d" % index, main.ui.SLOT_NAMES.get(command, command), "", main._use_quickslot.bind(index), disabled or main.ui.quickslot_buttons[index].disabled))
	if not other.is_empty():
		actions.append(_action("combat_other", "다른 행동 접기" if _other_combat_actions else "다른 행동", "", _toggle_other_combat_actions, disabled))
		if _other_combat_actions: actions.append_array(other)

func _combat_cooldown(command: String, duration: float) -> float:
	if duration <= 0.0: return -1.0
	return clampf(float(main._combat().get("cooldowns", {}).get(command, 0.0)) / duration, 0.0, 1.0)

func _fireball_detail(can_fire: bool) -> String:
	if can_fire: return "자동 조준"
	var spell: Dictionary = main._spell("fireball")
	if not spell.get("equipped", false): return "파이어볼 장착 필요"
	if float(main._combat().get("mp", 0.0)) < float(spell.get("cost", 0.0)): return "마나 부족"
	if not main.spatial_combat.has_fireball_target():
		return "장애물에 막힘" if main.spatial_combat.has_fireball_target(false) else "사거리 밖"
	return ""

func _toggle_other_combat_actions() -> void:
	_other_combat_actions = not _other_combat_actions
	refresh()

func _slime_input_ready() -> bool:
	return enabled and main.online_world and main.combat_socket.socket_ready and main.world.enabled and not _view.is_map_open()

func handle_combat_command(command: String) -> bool:
	if not enabled or not main.online_world: return false
	if _slime_selected and _current_tile() == "plaza":
		match command:
			"flame_wave":
				_cast_slime_flame_wave()
				return true
			"flame_guard":
				_cast_slime_flame_guard()
				return true
	if command not in ["fireball", "dodge"]: return _slime_selected and (_retreating or _slime_stepping or _slime_finished)
	if not _slime_selected or _retreating or _slime_finished: return true
	match command:
		"fireball":
			if not _slime_approach.is_finite() and not _slime_stepping: _cast_slime_fireball()
		"dodge": _dodge_slime()
	return true

func _cast_slime_fireball() -> void:
	if _slime_input_ready() and not _slime_stepping: main.spatial_combat.cast_targeted_fireball()

func _cast_slime_flame_wave() -> void:
	if not _slime_input_ready() or _slime_finished or _retreating or _slime_stepping or _slime_approach.is_finite(): return
	main.spatial_combat.cast_targeted_flame_wave()

func _slime_can_cast_guard() -> bool:
	return _slime_input_ready() and _slime_selected and not _slime_finished and not _retreating and not _slime_stepping \
		and _current_tile() == "plaza" and main._battle().get("spatial", {}).get("encounterId", "") == "plaza_slime" \
		and not main.busy and not main.ui.overlay.visible and main.spatial_combat.can_cast_guard()

func _cast_slime_flame_guard() -> void:
	if not _slime_can_cast_guard(): return
	await main._online_instant("flame_guard")
	refresh()

func _dodge_slime() -> void:
	if not _slime_input_ready() or _retreating or _slime_finished: return
	var approaching := _slime_approach.is_finite()
	if approaching:
		var spatial: Dictionary = main._battle().get("spatial", {})
		if spatial.get("encounterId", "") != "plaza_slime": return
	var movement_sequence: int = main.spatial_combat.movement_sequence
	main.spatial_combat.dodge_slime()
	if (approaching or _slime_stepping) and main.spatial_combat.movement_sequence != movement_sequence:
		_cancel_slime_approach()
		_stop_slime_step()
		refresh()

func _select_slime() -> void:
	_slime_selected = true
	_slime_finished = false
	_other_combat_actions = false
	_view.scroll_to_scene_start()

func _close_slime() -> void:
	_stop_slime_retreat()
	_cancel_slime_approach()
	_stop_slime_step()
	_slime_selected = false
	_slime_finished = false
	_other_combat_actions = false

func _show_projectile_event(event: Dictionary, id: String) -> void:
	match str(event.get("kind", "")):
		"cast":
			if main.online_world and (main.online_presence.character_id.is_empty() or event.get("actorId", "") != main.online_presence.character_id): return
			var spatial: Dictionary = main._battle().get("spatial", {})
			var spell := str(event.get("spellId", ""))
			if spell.is_empty():
				for projectile: Dictionary in spatial.get("projectiles", []):
					if projectile.get("id", "") == id:
						spell = str(projectile.get("spellId", ""))
						break
			if spell != "fireball" or not spatial.has("enemy"): return
			refresh()
			var origin := _combat_point(event.position)
			var distance := origin.distance_to(_combat_point(spatial.enemy))
			var speed: float = main.spatial_combat.layout.tuning.projectileSpeed
			_view.show_fireball(id, distance / speed, main.world.reduced_motion)
		"hit", "miss":
			_view.resolve_fireball(id, event.kind == "hit")

func _record_combat_event(event: Dictionary) -> void:
	if not enabled: return
	var projectile_id := str(event.get("projectileId", ""))
	if not projectile_id.is_empty(): _show_projectile_event(event, projectile_id)
	var hit_label: String = SLIME_HIT_LABELS.get(event.get("hitSource", ""), "")
	if event.get("kind", "") == "evade":
		if main.online_world and (main.online_presence.character_id.is_empty() or event.get("targetPlayerId", "") != main.online_presence.character_id): return
		if event.has("movement"):
			var combat: Dictionary = main._combat()
			if event.movement == "dodge" and combat.get("evadeSkill", "") == "dodge":
				_view.set_dodge_remaining(float(combat.get("evadeSeconds", 0.0)))
			return
		var dodged: bool = event.get("evadeSkill", "") == "dodge"
		if dodged:
			_view.show_dodge_result(true)
		if not hit_label.is_empty():
			_view.record("회피 성공 · %s · 피해 0" % hit_label, "evade")
		elif dodged:
			_view.record("회피 성공 · 피해 0")
		else:
			_view.record("공격을 피했습니다.")
		return
	var character_id: String = main.online_presence.character_id
	if main.online_world and character_id.is_empty(): return
	var is_actor: bool = not main.online_world or event.get("actorId", "") == character_id
	var is_target: bool = not main.online_world or event.get("targetPlayerId", "") == character_id
	var amount := int(event.get("amount", 0))
	var kind := str(event.get("kind", ""))
	match kind:
		"hit":
			if is_actor and amount > 0:
				_slime_finished = false
				var spatial: Dictionary = main._battle().get("spatial", {})
				var message := "%s에게 피해 %d" % [_enemy_name(), amount]
				if (_slime_selected or not main.online_world) and event.get("enemyId", "") == _combat_enemy(spatial).get("id", ""):
					refresh()
					_view.show_enemy_damage(amount)
					message = "명중 · 피해 %d" % amount
				var counter_bonus := int(event.get("slimeCounterBonus", -1))
				if counter_bonus >= 0:
					message = "반격 명중 · 피해 %d" % amount
					if counter_bonus > 0: message += " · 추가 %d" % counter_bonus
				_view.record(message)
		"miss", "slime_leap_miss", "wave":
			if not main.online_world or not _slime_selected or _slime_finished or _current_tile() != "plaza": return
			var leap_missed := kind == "slime_leap_miss"
			if leap_missed:
				if not is_target: return
			elif not is_actor or not event.has("missReason") or (kind == "miss" and event.get("spellId", "") != "fireball"): return
			var battle: Dictionary = main._battle()
			var spatial: Dictionary = battle.get("spatial", {})
			if spatial.get("encounterId", "") != "plaza_slime" or int(battle.get("enemyHp", 0)) <= 0: return
			var enemy := _combat_enemy(spatial)
			var life_id := str(enemy.get("lifeId", ""))
			if life_id.is_empty() or event.get("enemyLifeId", "") != life_id: return
			if leap_missed:
				if event.get("enemyId", "") == enemy.get("id", ""): _view.record("도약이 빗나갔습니다.")
				return
			var spell_name := "화염파" if kind == "wave" else "파이어볼"
			match event.get("missReason", ""):
				"obstacle": _view.record("%s · 장애물에 막힘" % spell_name)
				"range_exhausted", "outside_cone": _view.record("%s · 적에게 닿지 않음" % spell_name)
		"hurt":
			if not is_target or amount <= 0: return
			if hit_label.is_empty():
				_view.record("피격 · HP −%d" % amount)
			else:
				_view.record("%s · HP −%d" % [hit_label, amount], "hurt")
		"absorb":
			if is_target and amount > 0 and not hit_label.is_empty():
				_view.record("%s · 보호막 흡수 %d" % [hit_label, amount], "absorb")
		"enemy_down":
			if not main.online_world or (not _slime_selected and not is_actor): return
			_stop_slime_retreat()
			_stop_slime_step()
			if not _plaza_approach_life.is_empty(): _cancel_slime_approach()
			_slime_finished = true
			if event.get("enemyId", "") == "meadow-ox" or _current_tile() == "meadow":
				var meat := int(event.get("rewards", {}).get("rawMeat", 0))
				_view.record("+%d 고기" % meat if is_actor and meat > 0 else "진흙코 뿔소가 쓰러졌습니다.")
				return
			var reward := int(event.get("rewards", {}).get("slimeMucus", 0))
			var message := "+%d 슬라임의 점액질" % reward if is_actor and reward > 0 else "슬라임이 쓰러졌습니다."
			var state: Dictionary = main._state()
			if is_actor and reward > 0 and state.get("quests", {}).get("arcana_inn_slimes", "") == "active":
				message += " · 마르텐 의뢰 %d/10" % mini(10, int(state.get("flags", {}).get("arcana_inn_slime_kills", 0)))
			_view.record(message)
		"defeat":
			if not main.online_world or not is_target: return
			_close_slime()
			if hit_label.is_empty():
				_view.record("전투에서 쓰러져 분수 광장으로 돌아왔습니다.")
			else:
				_view.set_combat_layout(false)
				_view.record("%s으로 쓰러져 분수 광장으로 돌아왔습니다." % hit_label, "hurt")

func _start_encounter(meadow_ox: bool = false) -> void:
	var location := MapGrid.MEADOW_AREA if meadow_ox else MapGrid.PLAZA_AREA
	if _plaza_engage_pending or not enabled or main.busy or main._state().get("location", "") != location: return
	var plaza_rematch: bool = main.online_world and not meadow_ox and _slime_finished
	if plaza_rematch and (not _slime_input_ready() or not _field_target_ready("plaza_slime") or main._online_fighting()): return
	var action := {"type": "arcana_combat", "command": "engage_meadow_ox" if meadow_ox else "engage_plaza_slime"}
	_plaza_engage_pending = true
	main.world.path.clear()
	if plaza_rematch:
		_view.clear_combat_result()
		refresh()
	if main.online_world:
		var result: Dictionary = await main.combat_socket.request(action)
		_plaza_engage_pending = false
		if int(result.get("transportGeneration", -1)) != main.combat_socket.connection_generation:
			if plaza_rematch: refresh()
			return
		if result.has("state"): main._accept_online_result(result)
		if not enabled or main._state().get("location", "") != location: return
		var encounter_id := "meadow_ox" if meadow_ox else "plaza_slime"
		var battle: Dictionary = main._battle()
		var spatial: Dictionary = battle.get("spatial", {})
		var engaged := false
		if plaza_rematch:
			engaged = not _slime_finished or _joined_plaza_slime(battle, spatial)
		else:
			engaged = result.has("state") and not result.has("error") and main._online_fighting() and spatial.get("encounterId", "") == encounter_id
			if engaged: _select_slime()
		if not engaged:
			_view.record(str(result.get("message", "%s의 상태가 바뀌었습니다. 다시 선택해 주세요." % _enemy_name())))
	else:
		var started: bool = await main.perform(action, false)
		_plaza_engage_pending = false
		if not started: return
		var spatial: Dictionary = main._battle().get("spatial", {})
		if spatial.get("player") is Dictionary:
			main.world.player_position = main.world.nearest_walkable(_combat_point(spatial.player))
			main.world.path.clear()
			main._remember_position()
		if not enabled: return
		_view.scroll_to_scene_start()
	refresh()

func _approach_slime() -> void:
	main.ui.close_panel()
	main._sync_world_input()
	if not main.online_world:
		main.world.walk_to(main.world.layout.combat_home())
		return
	if not _slime_input_ready(): return
	var spatial: Dictionary = main._battle().get("spatial", {})
	if spatial.is_empty(): return
	var enemy := _combat_point(spatial.get("enemy", {}))
	var offset: Vector2 = main.world.player_position - enemy
	_slime_approach = _combat_destination(enemy, offset, float(main.world.TILE) * 2.0)
	if _slime_approach.is_finite():
		_walk_in_combat(_slime_approach)
	else:
		_view.record("%s에게 접근할 길을 찾지 못했습니다." % _enemy_name())

func _can_approach_plaza_spell(spatial: Dictionary) -> bool:
	return _slime_input_ready() and _slime_selected and not _slime_finished and not main.ui.overlay.visible \
		and _current_tile() == "plaza" and spatial.get("encounterId", "") == "plaza_slime" \
		and spatial.get("behavior", "") != "return" and int(main._battle().get("enemyHp", 0)) > 0

func _approach_plaza_spell(command: String) -> void:
	var spatial: Dictionary = main._battle().get("spatial", {})
	if not _can_approach_plaza_spell(spatial) or _slime_approach.is_finite() or _retreating or _slime_stepping: return
	if _combat_walk_waiting_for_evasion() or not main.spatial_combat.can_cast(command) or _plaza_spell_has_target(command): return
	var enemy := _combat_enemy(spatial)
	var life_id := str(enemy.get("lifeId", ""))
	if life_id.is_empty() or not enemy.get("position") is Dictionary: return
	var route := _plaza_spell_route(command, _combat_point(enemy.position))
	if route.is_empty():
		_view.record("공격할 자리로 갈 길을 찾지 못했습니다.")
		return
	main.spatial_combat.cancel_unreleased_cast()
	_plaza_approach_life = life_id
	_plaza_approach_spell = command
	_slime_approach = route[-1]
	_combat_walk_position = main.world.player_position
	_combat_walk_progress_ms = Time.get_ticks_msec()
	main.world.clicked_interaction_id = ""
	main.world.click_door_id = ""
	main.world.path = route
	refresh()

func _plaza_spell_has_target(command: String) -> bool:
	return main.spatial_combat.has_flame_wave_target() if command == "flame_wave" else main.spatial_combat.has_fireball_target()

func _plaza_spell_route(command: String, target: Vector2) -> PackedVector2Array:
	var grid: AStarGrid2D = main.world.grid
	var feet: Vector2 = main.world.player_position
	var from := Vector2i(feet / grid.cell_size)
	if not grid.is_in_boundsv(from): return PackedVector2Array()
	var heading := (feet - target).normalized()
	if heading.is_zero_approx(): heading = Vector2.DOWN
	var best_route := PackedVector2Array()
	var best_length := INF
	var distances := [2.0, 1.5] if command == "flame_wave" else [3.0, 4.0, 2.0]
	for tiles: float in distances:
		for angle: float in [0.0, 45.0, -45.0, 90.0, -90.0, 135.0, -135.0, 180.0]:
			var point := target + heading.rotated(deg_to_rad(angle)) * tiles * float(main.world.TILE)
			var cell := Vector2i(point / grid.cell_size)
			if cell == from or not grid.is_in_boundsv(cell) or grid.is_point_solid(cell): continue
			var destination := grid.get_point_position(cell)
			if feet.distance_to(destination) >= best_length: continue
			var clear_path: bool = main.spatial_combat.plaza_flame_wave_path_clear(destination, target) if command == "flame_wave" \
				else main.spatial_combat.plaza_fireball_path_clear(destination, target)
			if not clear_path: continue
			var route := grid.get_point_path(from, cell)
			if route.size() < 2: continue
			var start := 1
			if not main.world._walk_segment_clear(feet, route[1]):
				if not main.world._walk_segment_clear(feet, route[0]): continue
				start = 0
			var length := feet.distance_to(route[start])
			for index in range(start + 1, route.size()): length += route[index - 1].distance_to(route[index])
			if length < best_length:
				best_length = length
				best_route = route.slice(start)
	return best_route

func _update_slime_approach(spatial: Dictionary, enemy_nearby: bool) -> void:
	if not _slime_approach.is_finite(): return
	if not _plaza_approach_life.is_empty():
		if not _can_approach_plaza_spell(spatial) or _combat_enemy(spatial).get("lifeId", "") != _plaza_approach_life \
			or not main._spell(_plaza_approach_spell).get("equipped", false) or _plaza_spell_has_target(_plaza_approach_spell):
			_cancel_slime_approach()
		elif main.world.path.is_empty() or _combat_walk_stalled():
			_cancel_slime_approach()
			_view.record("공격할 자리까지 다가가지 못했습니다.")
		return
	if not main.world.path.is_empty():
		if _combat_walk_stalled():
			_cancel_slime_approach()
			_view.record("%s에게 다가가지 못했습니다." % _enemy_name())
		return
	var reached: bool = main.world.player_position.distance_to(_slime_approach) <= float(main.world.TILE)
	_slime_approach = Vector2.INF
	if reached and enemy_nearby: _select_slime()
	else: _view.record("%s에게 다가가지 못했습니다." % _enemy_name())

func _cancel_slime_approach() -> void:
	if _slime_approach.is_finite(): main.world.path.clear()
	_slime_approach = Vector2.INF
	_plaza_approach_life = ""
	_plaza_approach_spell = ""

func _slime_step_in_battle(spatial: Dictionary) -> bool:
	var battle: Dictionary = main._battle()
	return _slime_input_ready() and _slime_selected and not _slime_finished \
		and spatial.get("encounterId", "") == "plaza_slime" and spatial.get("behavior", "") != "return" \
		and battle.get("phase", "") == "battle" and not battle.get("paused", false)

func _slime_step_block_reason(spatial: Dictionary) -> String:
	if not _slime_step_in_battle(spatial) or main.busy or not spatial.get("enemy") is Dictionary: return "사용 대기"
	if not main.world.bench_state.is_empty(): return "사용 대기"
	if _combat_walk_waiting_for_evasion(): return "이동 중"
	var feet: Vector2 = main.world.player_position
	var enemy := _combat_point(spatial.enemy)
	return "이미 떨어짐" if feet.distance_to(enemy) > float(main.spatial_combat.layout.tuning.jumpRange) else ""

func _combat_walk_waiting_for_evasion() -> bool:
	# The server ignores normal position samples briefly after an evasion move.
	var combat: Dictionary = main._combat()
	var dodge_cooldown := maxf(float(main.world.dash_lock), float(combat.get("cooldowns", {}).get("dodge", 0.0)))
	return main.world.dash_age >= 0.0 or main.world.teleport_age >= 0.0 or dodge_cooldown > DODGE_WALK_RESUME_COOLDOWN \
		or (combat.get("evadeSkill", "") == "teleport" and float(combat.get("evadeSeconds", 0.0)) > 0.1)

func _start_slime_step() -> void:
	if _slime_stepping or _slime_approach.is_finite() or _retreating or not main._online_fighting(): return
	var spatial: Dictionary = main._battle().get("spatial", {})
	if not _slime_step_block_reason(spatial).is_empty(): return
	var feet: Vector2 = main.world.player_position
	var away := (feet - _combat_point(spatial.enemy)).normalized()
	if away.is_zero_approx(): away = -main.world.last_move_direction
	for angle: float in [0.0, 45.0, -45.0]:
		var destination := feet + away.rotated(deg_to_rad(angle)) * float(main.world.TILE)
		if main.world.try_walk_segment(destination):
			main.spatial_combat.cancel_unreleased_cast()
			_slime_stepping = true
			_combat_walk_position = feet
			_combat_walk_progress_ms = Time.get_ticks_msec()
			refresh()
			return
	_view.record("거리를 벌릴 길이 막혔습니다.")

func _update_slime_step(spatial: Dictionary, fighting: bool) -> void:
	if not _slime_stepping: return
	if not fighting or not _slime_step_in_battle(spatial):
		_stop_slime_step()
	elif main.world.path.is_empty():
		_slime_stepping = false
	elif _combat_walk_stalled():
		_stop_slime_step()
		_view.record("거리를 벌릴 길이 막혔습니다.")

func _stop_slime_step() -> void:
	if _slime_stepping: main.world.path.clear()
	_slime_stepping = false

func _start_slime_retreat() -> void:
	if not _slime_input_ready() or _retreat_request_pending: return
	main.spatial_combat.cancel_unreleased_cast()
	_cancel_slime_approach()
	_stop_slime_step()
	_retreating = true
	_retreat_revision = -1
	main.world.path.clear()
	_update_slime_retreat(main._battle().get("spatial", {}), main._online_fighting())

func _stop_slime_retreat() -> void:
	if _retreating: main.world.path.clear()
	_retreating = false

func _update_slime_retreat(spatial: Dictionary, fighting: bool) -> void:
	if not _retreating or _retreat_request_pending: return
	if not main.world.enabled:
		_combat_walk_progress_ms = Time.get_ticks_msec()
		return
	if not fighting:
		_close_slime()
		_record("%s에게서 벗어났습니다." % _enemy_name())
		return
	var enemy := _combat_point(spatial.get("enemy", {}))
	var feet := _combat_point(spatial.get("player", {}))
	var chase_limit: float = float(main.spatial_combat.layout.tuning.chaseLimit)
	if feet.distance_to(enemy) > chase_limit:
		var revision := int(spatial.get("revision", -1))
		if revision != _retreat_revision:
			_retreat_revision = revision
			_confirm_slime_retreat()
	elif main.world.path.is_empty():
		var offset: Vector2 = main.world.player_position - enemy
		var destination := _combat_destination(enemy, offset, chase_limit + float(main.world.TILE) * 3.0)
		if destination.is_finite():
			_walk_in_combat(destination)
		else:
			_stop_slime_retreat()
			_record("물러날 길을 찾지 못했습니다.")
	elif _combat_walk_stalled():
		_stop_slime_retreat()
		_record("물러나는 길이 막혔습니다.")

func _confirm_slime_retreat() -> void:
	_retreat_request_pending = true
	var result: Dictionary = await main.combat_socket.request({"type":"arcana_combat", "command":"retreat"})
	_retreat_request_pending = false
	if int(result.get("transportGeneration", -1)) != main.combat_socket.connection_generation: return
	if result.has("state"): main._accept_online_result(result)
	if not enabled or not _retreating: return
	if result.get("resync", false) or result.get("error", "") in ["retreat_in_range", "input_busy"]: return
	if result.has("error"):
		_stop_slime_retreat()
		_record(str(result.get("message", "물러나기를 마치지 못했습니다.")))
	elif not main._online_fighting():
		_close_slime()
		_record("%s에게서 벗어났습니다." % _enemy_name())

func _combat_point(point: Dictionary) -> Vector2:
	return Vector2(float(point.get("x", 0.0)), float(point.get("y", 0.0)))

func _walk_in_combat(point: Vector2) -> void:
	_combat_walk_position = main.world.player_position
	_combat_walk_progress_ms = Time.get_ticks_msec()
	main.world.walk_to(point)

func _combat_walk_stalled() -> bool:
	var now := Time.get_ticks_msec()
	var feet: Vector2 = main.world.player_position
	if not main.world.enabled or feet.distance_squared_to(_combat_walk_position) > 1.0:
		_combat_walk_position = feet
		_combat_walk_progress_ms = now
	return now - _combat_walk_progress_ms > COMBAT_WALK_STALL_MS

func _combat_destination(center: Vector2, offset: Vector2, distance: float) -> Vector2:
	var grid: AStarGrid2D = main.world.grid
	var feet: Vector2 = main.world.player_position
	var from := Vector2i(feet / grid.cell_size)
	if not grid.is_in_boundsv(from): return Vector2.INF
	var heading := offset.normalized() if not offset.is_zero_approx() else Vector2.DOWN
	for angle: float in [0.0, 45.0, -45.0, 90.0, -90.0, 135.0, -135.0, 180.0]:
		var point := center + heading.rotated(deg_to_rad(angle)) * distance
		var cell := Vector2i(point / grid.cell_size)
		if not grid.is_in_boundsv(cell) or grid.is_point_solid(cell): continue
		if cell == from or not grid.get_id_path(from, cell).is_empty():
			return grid.get_point_position(cell)
	return Vector2.INF

func _action(id: String, label: String, detail: String, callback: Callable, disabled: bool, icon: String = "") -> Dictionary:
	return {"id":id, "label":label, "detail":detail, "callback":callback, "disabled":disabled, "icon":icon}

func _water_name() -> String:
	return "남쪽 강" if main.world.has_terraced_plaza() else "광장 연못"

func _rod_equipped() -> bool:
	return main._state().get("flags", {}).get("arcana_life_tool", "") == "fishingRod"

func _current_tile() -> String:
	var location := str(main._state().get("location", ""))
	if location == "arcana_plaza":
		return "river" if _detail_location == location and _place_detail == "river" else "plaza"
	if location == MapGrid.MEADOW_AREA: return "meadow"
	if location == MapGrid.FOREST_AREA: return "forest"
	return BUILDING_TILES.get(location, "")

func at_fishing_place() -> bool:
	return enabled and main.online_world and _current_tile() == "river" and not main._online_fighting() and not _slime_selected

func get_pond_fishing_host() -> Control:
	return _view.get_pond_fishing_host()

func set_pond_fishing_active(active: bool) -> void:
	_view.set_pond_fishing_active(active)
	if not active: refresh()

func selected_room() -> String:
	return _place_detail if enabled and _detail_location == main._state().get("location", "") and not _interior_area().is_empty() else ""

func _interior_area() -> String:
	var area: String = main.world.indoor
	if area == "arcana_academy":
		return MapGrid.ACADEMY_SECOND_AREA if main.world.academy_floor == 2 else MapGrid.ACADEMY_FIRST_AREA
	return area if MapGrid.INTERIOR_PLACES.has(area) else ""

func _is_academy_area(area: String) -> bool:
	return area == MapGrid.ACADEMY_FIRST_AREA or area == MapGrid.ACADEMY_SECOND_AREA

func _academy_map() -> Dictionary:
	var school = main.snapshot.get("academyMap")
	return school if school is Dictionary else {}

func _academy_room(id: String) -> Dictionary:
	for room: Dictionary in _academy_map().get("rooms", []):
		if room.get("id") == id: return room
	return {}

func _academy_map_position(area: String, scene_id: String) -> String:
	var room := str(_academy_map().get("currentRoomId", "courtyard"))
	var floor: int = main.world.academy_floor
	if _academy_floor != 0 and floor != _academy_floor:
		_academy_stair_landing = room == _academy_story_room
		_academy_notice_target = ""
	elif room != _academy_story_room or scene_id != _story_scene_id:
		_academy_stair_landing = false
	_academy_floor = floor
	_academy_story_room = room
	var map_room := "exit" if room == "courtyard" else room
	if not MapGrid.places_for(area).has(map_room):
		_academy_stair_landing = true
	return "academy_stairs" if _academy_stair_landing else map_room

func _academy_locked_rooms(destinations: Dictionary) -> Dictionary:
	var locked := {}
	for room: Dictionary in _academy_map().get("rooms", []):
		var id := str(room.get("id", ""))
		var reason := str(room.get("lockedReason", ""))
		if destinations.has(id) and not reason.is_empty(): locked[id] = reason
	return locked

func _academy_entry_restriction(id: String) -> String:
	if id == "exit": return ""
	var room := _academy_room(id)
	var reason := str(room.get("lockedReason", ""))
	if not reason.is_empty(): return reason
	reason = str(_academy_map().get("blockedReason", ""))
	if not reason.is_empty() or id == "academy_stairs": return reason
	if room.is_empty() or (room.get("id") != _academy_story_room and not room.get("action") is Dictionary):
		return "지금은 이 방으로 이동할 수 없습니다."
	return ""

func _show_academy_restriction(id: String) -> bool:
	var reason := _academy_entry_restriction(id)
	if reason.is_empty():
		_academy_notice_target = ""
		return false
	_academy_notice_target = id
	refresh()
	return true

func _interior_targets(area: String) -> Dictionary:
	var places := MapGrid.places_for(area)
	var targets := {}
	for entity: Dictionary in main.world.entities:
		if places.has(entity.id): targets[entity.id] = entity
	for id: String in ROOM_DETAILS:
		if places.has(id) and not targets.has(id): targets[id] = {}
	if area == "arcana_home" and main.online_world: targets["home_plot"] = {}
	return targets

func _interior_labels(area: String, targets: Dictionary) -> Dictionary:
	var places := MapGrid.places_for(area)
	var labels := {}
	for id: String in places:
		if targets.has(id): labels[id] = places[id][1]
	return labels

func _map_destinations() -> Dictionary:
	var world = main.world
	if world.indoor.is_empty() and main._state().get("location", "") not in [MapGrid.PLAZA_AREA, MapGrid.MEADOW_AREA, MapGrid.FOREST_AREA]: return {}
	var tiles := {"plaza": TILE_LABELS.plaza}
	if main.online_world:
		tiles["meadow"] = TILE_LABELS.meadow
		tiles["forest"] = MapGrid.PLACES.forest[1]
	# Home entry is a life command and also works on maps without a house door.
	if main.online_world: tiles["home"] = TILE_LABELS.home
	for entity in world._outdoor_entities:
		var id: String = BUILDING_TILES.get(entity.id, "")
		if id == "home": continue
		if not id.is_empty() and entity.kind == "building" and (not world.uses_plaza_v2() or entity.get("auto_enter", false)):
			tiles[id] = TILE_LABELS[id]
	if world.uses_plaza_v2(): tiles["river"] = _water_name()
	return tiles

func _choose_world_tile(id: String) -> void:
	if is_map_open() and _map_destinations().has(id):
		await _walk_city_place(id, false, id)

func _choose_local_tile(id: String) -> void:
	if _map_move_active or not enabled or main.ui.overlay.visible: return
	var area := _interior_area()
	if _is_academy_area(area) and _show_academy_restriction(id): return
	if id in ["exit", "home_door", "meadow_entrance", "forest_entrance"]:
		if _view.is_at_local_place(id):
			await _select_city_place("plaza")
		else:
			await _walk_city_place(id, true, "plaza")
		return
	await _walk_map_choice(id, true, _select_local_place.bind(id))

func _walk_map_choice(id: String, local: bool, arrive: Callable) -> void:
	if _map_move_active or not _can_choose_place(false): return
	_map_move_active = true
	if await _view.play_map_move(id, local):
		await arrive.call()
	_view.finish_map_move(local)
	_map_move_active = false

func _walk_city_place(tile: String, local: bool, destination: String) -> void:
	if _map_move_active or not _can_choose_place(false): return
	_map_move_active = true
	_view.region_move_active = true
	_close_slime()
	var target := _city_target(destination)
	var arrived := await _view.play_map_move(tile, local, _request_city_travel.bind(target))
	_view.finish_map_move(local)
	_view.region_move_active = false
	_map_move_active = false
	if arrived:
		_detail_location = str(main._state().get("location", ""))
		_place_detail = "river" if destination == "river" else ""
		show_scene()
	else:
		refresh()
	for notice in _travel_notices:
		_view.record(notice)
	_travel_notices.clear()

func _select_local_place(id: String) -> void:
	if id in ["home_plot", "forest_spirits", "plaza_village_board"]:
		_open_homestead(id)
	elif _current_tile() == "plaza":
		await _select_plaza_tile(id)
	elif _current_tile() == "forest":
		if id == "forest_trees" and _can_choose_place():
			_place_detail = id
			show_scene()
	elif _current_tile() == "meadow":
		if id == "meadow_ox" and meadow_target_ready() and _can_choose_place():
			await _start_encounter(true)
	else:
		await select_room(id)

func _can_choose_place(prepare: bool = true) -> bool:
	if not enabled or _plaza_engage_pending or main.busy or main.life.blocking() or main.life.sending or main.fishing.visible: return false
	var fighting: bool = main._online_fighting() if main.online_world else main._battle().get("phase", "") == "battle"
	if fighting:
		main.ui.toast("전투를 마친 뒤 이동할 수 있습니다.")
		return false
	if prepare:
		_close_slime()
		main.ui.close_panel()
		main._sync_world_input()
	return true

func _select_plaza_tile(id: String) -> void:
	if _current_tile() != "plaza" or not _plaza_destinations().has(id): return
	if id == "plaza_slime" and (main._online_fighting() if main.online_world else main._battle().get("phase", "") == "battle"):
		show_scene()
		return
	if not _can_choose_place(): return
	_place_detail = id
	if id == "plaza_slime":
		await _start_encounter()
	else:
		show_scene()

func _select_city_place(id: String) -> void:
	if _map_move_active or not _can_choose_place(false) or not _map_destinations().has(id): return
	show_map()
	await _walk_city_place(id, false, id)

func _city_target(id: String) -> String:
	if id == "meadow": return MapGrid.MEADOW_AREA
	if id == "forest": return MapGrid.FOREST_AREA
	return str(BUILDING_TILES.find_key(id)) if id in BUILDING_TILES.values() else MapGrid.PLAZA_AREA

func _request_city_travel(target: String) -> bool:
	var location := str(main._state().get("location", ""))
	if location == target: return true
	await main.world.prepare_text_region(target)
	if location != MapGrid.PLAZA_AREA:
		if location == "arcana_home":
			await main._leave_player_home(false)
		elif not await main._travel(MapGrid.PLAZA_AREA):
			return false
		if main._state().get("location", "") != MapGrid.PLAZA_AREA: return false
	if target == "arcana_home":
		await main.open_home(false)
	elif target != main._state().get("location", ""):
		if not await main._travel(target): return false
	return main._state().get("location", "") == target

func select_room(id: String) -> void:
	var area := _interior_area()
	if area.is_empty(): return
	var targets := _interior_targets(area)
	if not targets.has(id): return
	if id == "home_plot":
		_open_homestead(id)
		return
	if id in ["exit", "home_door"]:
		await _select_city_place("plaza")
		return
	if _is_academy_area(area):
		if _show_academy_restriction(id) or not _can_choose_place(): return
		if id == _academy_story_room and not _academy_room(id).get("action") is Dictionary:
			_academy_stair_landing = false
		await main._interact(targets[id])
		return
	if not _can_choose_place(): return
	_detail_location = str(main._state().get("location", ""))
	_place_detail = id
	show_scene()
	var entity: Dictionary = targets[id]
	if _room_has_action(entity):
		await main._interact(entity)
	elif ROOM_DETAILS.has(id):
		main.ui.open_panel(str(MapGrid.places_for(area)[id][1]))
		main.ui.paragraph(ROOM_DETAILS[id])

func _room_has_action(entity: Dictionary) -> bool:
	return entity.get("kind", "") in ["innkeeper", "quest_board", "inn_sofa", "inn_chair", "bench", "home_kitchen", "home_bed", "home_table", "home_sofa", "home_storage", "merchant"]

func open_destinations() -> void:
	var world = main.world
	var area := _interior_area()
	if not area.is_empty():
		main.ui.open_tab_panel("%s · 목적지" % TILE_LABELS.get(_current_tile(), "실내"))
		var rooms := _interior_labels(area, _interior_targets(area))
		for id: String in rooms:
			var restriction := _academy_entry_restriction(id) if _is_academy_area(area) else ""
			var detail: String = DESTINATION_DETAILS.get(id, "장소 살펴보기") if restriction.is_empty() else restriction
			if id == "home_plot": detail = "별열매를 기르고 정령과 쉬기"
			main.ui.choice(rooms[id], detail, select_room.bind(id), not restriction.is_empty())
		return
	main.ui.open_tab_panel("어디로 갈까요?")
	if _current_tile() == "forest":
		main.ui.choice(MapGrid.FOREST_PLACES.forest_trees[1], "나무를 베어 목재 얻기", _select_local_place.bind("forest_trees"))
		if main.online_world:
			main.ui.choice(MapGrid.FOREST_PLACES.forest_spirits[1], "야생 정령 만나기", _select_local_place.bind("forest_spirits"))
		main.ui.choice("분수 광장", "숲에서 돌아가기", _select_city_place.bind("plaza"))
		return
	if _current_tile() == "meadow":
		main.ui.choice("분수 광장", "초원에서 돌아가기", _select_city_place.bind("plaza"))
		return
	var school: Dictionary = main.snapshot.academyMap if main.snapshot.get("academyMap") is Dictionary else {}
	var added := false
	var has_home := false
	for entity in world.entities:
		var kind := str(entity.get("kind", ""))
		if not DESTINATION_DETAILS.has(kind): continue
		if kind == "building" and world.uses_plaza_v2() and not entity.get("auto_enter", false): continue
		if kind == "slime" and main.online_world: continue
		if entity.id == "arcana_home": has_home = true
		var restriction := ""
		if kind == "academy_room":
			for room in school.get("rooms", []):
				if room.id == entity.id:
					restriction = str(room.get("lockedReason", ""))
					break
		var detail: String = DESTINATION_DETAILS[kind] if restriction.is_empty() else restriction
		main.ui.choice(str(entity.get("name", "이동")), detail, _select_destination.bind(entity), not restriction.is_empty())
		added = true
	if not has_home and main.online_world and world.indoor.is_empty() and main._state().get("location", "") == "arcana_plaza":
		main.ui.choice("내 집", "주방 · 침실 · 거실", _select_city_place.bind("home"))
		added = true
	if main.online_world and _current_tile() in ["plaza", "river"]:
		main.ui.choice(MapGrid.PLAZA_PLACES.plaza_village_board[1], "마을의 납품 의뢰 보기", _select_local_place.bind("plaza_village_board"))
		main.ui.choice(MapGrid.PLACES.forest[1], "월드맵 (2, 5) · 벌목", _select_city_place.bind("forest"))
		main.ui.choice(TILE_LABELS.meadow, "월드맵 (5, 5)", _select_city_place.bind("meadow"))
		added = true
	if world.indoor.is_empty() and world.uses_plaza_v2():
		main.ui.choice(main._plaza_fishing_place(), "낚시하기", _select_city_place.bind("river"))
		added = true
		main.ui.choice("슬라임 출몰지", "마르텐의 퇴치 의뢰", _approach_slime)
		added = true
	if not added:
		main.ui.paragraph("이곳에서 바로 이동할 수 있는 목적지가 없습니다.")

func _select_destination(entity: Dictionary) -> void:
	if entity.kind == "building":
		var tile: String = BUILDING_TILES.get(entity.id, "")
		if not tile.is_empty():
			await _select_city_place(tile)
			return
	if entity.kind == "exit":
		await _select_city_place("plaza")
		return
	if not _can_choose_place(): return
	await main._interact(entity)
