extends Node

const View = preload("res://scripts/simplified_view.gd")
const MapGrid = preload("res://scripts/simplified_city_grid.gd")
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
const DODGE_DETAIL := "1초간 공격 1회 회피"
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
var _academy_floor := 0
var _academy_story_room := ""
var _academy_stair_landing := false
var _academy_notice_target := ""
var _story_scene_id := ""
var _story_page := 0
var _slime_selected := false
var _slime_finished := false
var _slime_approach := Vector2.INF
var _plaza_engage_pending := false
var _other_combat_actions := false
var _retreating := false
var _retreat_request_pending := false
var _retreat_revision := -1
var _combat_walk_position := Vector2.ZERO
var _combat_walk_progress_ms := 0

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
	main.fishing.catch_confirmed.connect(_view.set_fishing_result)
	main.spatial_combat.confirmed_combat_event.connect(_record_combat_event)
	main.ui.toast_shown.connect(_record)
	main.ui.overlay.visibility_changed.connect(_sync_view_focus)

func set_enabled(value: bool) -> void:
	if enabled == value or main.busy or main.fishing.visible or main.life.blocking(): return
	_close_slime()
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
	if kind == "map":
		main._menu("map")
		return
	if kind == "destinations":
		open_destinations()
	else:
		main._menu(kind)

func show_map() -> void:
	main.panel_mode = "map"
	main.ui.open_tab_panel("월드맵")
	main.ui.show_tab_body(_view.build_map_body())
	_view.remember_map_tab()
	refresh()

func _plaza_destinations() -> Dictionary:
	var destinations := {"plaza_fountain": MapGrid.PLAZA_PLACES.plaza_fountain[1]}
	var battle: Dictionary = main._battle()
	if not main.online_world or (main.combat_socket.socket_ready and int(battle.get("enemyHp", 0)) > 0 and battle.get("spatial", {}).get("behavior", "") != "return"):
		destinations["plaza_slime"] = MapGrid.PLAZA_PLACES.plaza_slime[1]
	return destinations

func is_map_open() -> bool:
	return enabled and _view.is_map_open()

func handle_map_input(event: InputEvent) -> bool:
	if not is_map_open(): return false
	if event is InputEventKey and event.pressed and not event.echo:
		if event.physical_keycode in [KEY_ESCAPE, KEY_M]: main.ui.close_panel()
		get_viewport().set_input_as_handled()
	return true

func show_scene() -> void:
	if main.ui.overlay.visible: main.ui.close_panel()
	_story_page = 0
	refresh()
	_view.scroll_to_scene_start()

func _record(message: String) -> void:
	if enabled and message != "진행 중…":
		_view.record(message)

func refresh() -> void:
	if not enabled or main.fishing.visible: return
	var location := str(main._state().get("location", ""))
	if _detail_location != location:
		_detail_location = location
		_place_detail = ""
	var tile := _current_tile()
	var battle: Dictionary = main._battle()
	var fighting: bool = main._online_fighting() if main.online_world else battle.get("phase", "") == "battle"
	var spatial: Dictionary = battle.get("spatial", {})
	var meadow_ox := tile == "meadow"
	var online_slime: bool = main.online_world and spatial.get("encounterId", "") in ["plaza_slime", "meadow_ox"]
	var enemy_nearby: bool = tile != "river" and main.spatial_combat.available() and main.spatial_combat.visible_enemy()
	if online_slime:
		_update_slime_approach(enemy_nearby)
		if fighting and tile != "river" and not _slime_selected and not _retreat_request_pending:
			_select_slime()
		_update_slime_retreat(spatial, fighting)
	elif _slime_selected or _retreating or _slime_approach.is_finite():
		_close_slime()
	var show_slime := online_slime and _slime_selected
	var pond: bool = main.online_world and tile == "river" and not show_slime
	var offline_combat: bool = not main.online_world and (fighting or enemy_nearby)
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
		main.ui.zone_label.text, combat, life_state,
		int(state.get("money", 0)), int(state.get("worldElapsedMs", -1))
	)
	var context := ""
	if main.online_world and not main.combat_socket.socket_ready:
		context = "세계에 연결하고 있습니다…"
	elif main.busy:
		context = "행동 결과를 기다리고 있습니다…"
	elif show_slime:
		context = _slime_description(battle, spatial)
	elif not main.online_world and (fighting or enemy_nearby):
		context = _combat_description(battle)
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
	elif tile in ["plaza", "meadow"]: title = TILE_LABELS[tile]
	elif academy:
		title = "마법학교 · %d층" % _academy_floor
	elif inside:
		var name: String = TILE_LABELS[tile]
		title = "%s · %s" % [name, destinations[current]] if destinations.has(current) else name
	var equipment := ""
	if tile == "river" and _rod_equipped(): equipment = "나무 낚싯대 장착 중"
	var show_combatants: bool = show_slime or (offline_combat and not battle.is_empty())
	_view.set_pond_layout(pond)
	_view.set_place_detail(title, equipment)
	var show_local_map := not (show_slime or offline_combat or _slime_approach.is_finite())
	if tile == "plaza":
		var plaza_place := "plaza_fountain" if _place_detail.is_empty() else _place_detail
		_view.set_local_map_state(MapGrid.PLAZA_AREA, plaza_place, _plaza_destinations(), show_local_map)
	elif meadow_ox:
		var meadow_destinations := MapGrid.meadow_destinations(meadow_target_ready())
		_view.set_local_map_state(MapGrid.MEADOW_AREA, "meadow_entrance", meadow_destinations, show_local_map)
	else:
		var locked := _academy_locked_rooms(destinations) if academy else {}
		var map_position := current
		if inside and map_position.is_empty():
			map_position = "home_door" if area == "arcana_home" else "exit"
		_view.set_local_map_state(area, map_position, destinations, show_local_map, locked)
	_view.set_scene("" if show_combatants else description, context, show_combatants)
	var warning := _leap_warning(battle, spatial) if show_slime and main.combat_socket.socket_ready else -1.0
	_view.set_combat_telegraph(warning)
	_view.set_combatants(show_combatants, main.snapshot.get("arcanaEquipment", {}), _slime_pose(spatial),
		0 if _slime_finished else int(battle.get("enemyHp", 0)), int(_slime_enemy(spatial).get("maxHp", 30)), meadow_ox)
	if show_combatants:
		var dodge_active: bool = combat.get("evadeSkill", "") == "dodge" and not _slime_finished and (not main.online_world or main.combat_socket.socket_ready)
		_view.set_dodge_remaining(float(combat.get("evadeSeconds", 0.0)) if dodge_active else 0.0)
	if show_slime:
		_view.set_actions(_slime_actions(spatial, warning, fighting), true)
	elif pond:
		_view.set_actions(_pond_actions(life_state, fighting))
	elif _slime_approach.is_finite():
		_view.set_actions([_action("slime_cancel_approach", "이동 취소", "", _cancel_slime_approach, main.busy)])
	elif offline_combat:
		_view.set_actions(_combat_actions(), true)
	elif inside and not academy and not dialogue_active:
		_view.set_actions([])
	else:
		_view.set_actions(_local_actions(life_state, tile, online_slime and enemy_nearby))

func _pond_actions(life_state: Dictionary, fighting: bool) -> Array[Dictionary]:
	var ready: bool = main.world.enabled and main.combat_socket.socket_ready and not main.busy
	if fighting:
		if _retreating: return [_action("slime_cancel_retreat", "물러나기 취소", "", _stop_slime_retreat, _retreat_request_pending)]
		return [_action("slime_leave", "물러나기", "", _start_slime_retreat, not ready)]
	var gathered := int(life_state.get("gatheredToday", 0))
	var actions: Array[Dictionary] = [
		_action("fish", "낚시하기", "", main._start_text_fishing, not ready),
		_action("gather", "주변 재료 모으기", "%d/3" % gathered, main.life._gather, not ready or gathered >= 3 or main.life.sending),
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
	if main.online_world:
		var in_plaza: bool = main.world.indoor.is_empty() and main._state().get("location", "") == "arcana_plaza"
		if in_plaza:
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

func _combat_description(battle: Dictionary) -> String:
	var spatial: Dictionary = battle.get("spatial", {})
	var behavior := str(spatial.get("behavior", ""))
	var description := "슬라임 · HP %d" % int(battle.get("enemyHp", 0))
	if behavior == "prepare":
		description += " · 공격을 준비합니다."
	elif behavior == "attack":
		description += " · 공격 중"
	elif behavior == "recover":
		description += " · 자세를 가다듬고 있습니다."
	return description

func _combat_actions() -> Array[Dictionary]:
	var actions: Array[Dictionary] = []
	for index in range(main.ui.quickslot_bindings.size()):
		var command: String = main.ui.quickslot_bindings[index]
		if command.is_empty() or command == "dev_speed" or command == "dodge": continue
		var name: String = main.ui.SLOT_NAMES.get(command, command)
		actions.append(_action("slot_%d" % index, name, "", main._use_quickslot.bind(index), main.ui.quickslot_buttons[index].disabled))
	actions.append(_action("dodge", "회피", DODGE_DETAIL, main._magic.bind("dodge"), not main.spatial_combat.can_dash()))
	return actions

func _enemy_name() -> String:
	return MapGrid.MEADOW_PLACES.meadow_ox[1] if _current_tile() == "meadow" else "슬라임"

func meadow_target_ready() -> bool:
	var battle: Dictionary = main._battle()
	var spatial: Dictionary = battle.get("spatial", {})
	return main.combat_socket.socket_ready and spatial.get("encounterId", "") == "meadow_ox" and int(battle.get("enemyHp", 0)) > 0 and spatial.get("behavior", "") != "return"

func _slime_description(battle: Dictionary, spatial: Dictionary) -> String:
	var meadow_ox := _current_tile() == "meadow"
	if _slime_finished: return "진흙코 뿔소가 쓰러졌습니다." if meadow_ox else "슬라임이 쓰러졌습니다."
	if _retreating: return "거리를 벌리고 있습니다."
	if meadow_ox:
		match str(spatial.get("behavior", "")):
			"prepare": return "돌진 임박" if float(battle.get("attackIn", 0.0)) <= 1.0 else "뿔을 낮춥니다 · 돌진 준비 중"
			"attack": return "돌진 중" if spatial.get("slimeAction", "") == "charge" else "진흙코 뿔소가 움직입니다."
			"recover": return "돌진을 멈추고 자세를 가다듬습니다."
			"return": return "진흙코 뿔소가 제자리로 돌아갑니다."
		return ""
	match str(spatial.get("behavior", "")):
		"prepare":
			if spatial.get("slimeAction", "") == "leap":
				return "도약 임박" if float(battle.get("attackIn", 0.0)) <= 1.0 else "몸을 웅크립니다 · 도약 준비 중"
		"attack":
			match str(spatial.get("slimeAction", "")):
				"leap": return "도약 중"
				"flee": return "슬라임이 물러납니다."
				"hop": return "슬라임이 다가옵니다."
		"recover": return "착지해 자세를 가다듬습니다."
		"return": return "슬라임이 제자리로 돌아갑니다."
	return ""

func _slime_enemy(spatial: Dictionary) -> Dictionary:
	var enemies: Array = spatial.get("enemies", [])
	return enemies[0] if not enemies.is_empty() else {}

func _slime_pose(spatial: Dictionary) -> StringName:
	if _slime_finished: return &"death"
	match str(spatial.get("behavior", "")):
		"prepare": return &"prepare"
		"attack": return &"attack" if spatial.get("slimeAction", "") in ["leap", "charge"] else &"hop"
		"recover": return &"recover"
		"return": return &"hop"
	return &"idle"

func _leap_warning(battle: Dictionary, spatial: Dictionary) -> float:
	if _slime_finished or spatial.get("behavior", "") != "prepare" or spatial.get("slimeAction", "") not in ["leap", "charge"]:
		return -1.0
	return clampf(float(battle.get("attackIn", 0.0)) / float(spatial.get("windupDuration", 3.0)), 0.0, 1.0)

func _slime_actions(spatial: Dictionary, warning: float, fighting: bool) -> Array[Dictionary]:
	var ready := _slime_input_ready()
	if _slime_finished:
		return [
			_action("slime_next", "다음 %s 상대하기" % _enemy_name(), "",
				_start_encounter.bind(true) if _current_tile() == "meadow" else _select_slime,
				not ready or fighting or (_current_tile() == "meadow" and not meadow_target_ready())),
			_action("slime_leave", "주변으로 돌아가기", "", _close_slime, not ready or fighting),
		]
	if _retreating:
		return [_action("slime_cancel_retreat", "물러나기 취소", "", _stop_slime_retreat, _retreat_request_pending)]
	if _slime_approach.is_finite():
		return [_action("slime_cancel_approach", "이동 취소", "", _cancel_slime_approach, not ready)]
	var can_fire: bool = ready and main.spatial_combat.can_target_fireball()
	var fireball := _action("slime_fireball", main.ui.SLOT_NAMES.fireball, _fireball_detail(can_fire), _cast_slime_fireball, not can_fire)
	if ready and not can_fire and not main.spatial_combat.has_fireball_target() and main.spatial_combat.can_cast("fireball") and int(main._battle().get("enemyHp", 0)) > 0:
		fireball = _action("slime_fireball", "사거리까지 접근", "", _approach_slime, false)
	fireball.cooldown = _combat_cooldown("fireball", float(main._spell("fireball").get("cooldown", 0.0)))
	var evade := _action("slime_evade", "회피", DODGE_DETAIL, _dodge_slime, not ready or not main.spatial_combat.can_dash())
	evade.cooldown = _combat_cooldown("dodge", 5.0)
	var target_id: String = str(_slime_enemy(spatial).get("targetId", ""))
	evade.highlighted = warning >= 0.0 and spatial.get("targetLocked", false) and not target_id.is_empty() and target_id == main.online_presence.character_id
	var leave := _action("slime_leave", "물러나기" if fighting else "주변으로 돌아가기", "", _start_slime_retreat if fighting else _close_slime, not ready)
	var actions: Array[Dictionary] = [fireball, evade, leave]
	var other: Array[Dictionary] = []
	for index in range(main.ui.quickslot_bindings.size()):
		var command: String = main.ui.quickslot_bindings[index]
		if command in ["", "dev_speed", "fireball", "dodge"]: continue
		other.append(_action("slime_slot_%d" % index, main.ui.SLOT_NAMES.get(command, command), "", main._use_quickslot.bind(index), not ready or main.ui.quickslot_buttons[index].disabled))
	if not other.is_empty():
		actions.append(_action("slime_other", "다른 행동 접기" if _other_combat_actions else "다른 행동", "", _toggle_other_combat_actions, not ready))
		if _other_combat_actions: actions.append_array(other)
	return actions

func _combat_cooldown(command: String, duration: float) -> float:
	if duration <= 0.0: return -1.0
	return clampf(float(main._combat().get("cooldowns", {}).get(command, 0.0)) / duration, 0.0, 1.0)

func _fireball_detail(can_fire: bool) -> String:
	if can_fire: return "슬라임 자동 조준"
	var spell: Dictionary = main._spell("fireball")
	if not spell.get("equipped", false): return "파이어볼 장착 필요"
	if float(main._combat().get("mp", 0.0)) < float(spell.get("cost", 0.0)): return "마나 부족"
	if not main.spatial_combat.has_fireball_target(): return "사거리 밖"
	return ""

func _toggle_other_combat_actions() -> void:
	_other_combat_actions = not _other_combat_actions
	refresh()

func _slime_input_ready() -> bool:
	return enabled and main.online_world and main.combat_socket.socket_ready and main.world.enabled and not _view.is_map_open()

func handle_combat_command(command: String) -> bool:
	if not enabled or not main.online_world: return false
	if command not in ["fireball", "dodge"]: return _slime_selected and (_retreating or _slime_finished)
	if not _slime_selected or _slime_approach.is_finite() or _retreating or _slime_finished: return true
	match command:
		"fireball": _cast_slime_fireball()
		"dodge": _dodge_slime()
	return true

func _cast_slime_fireball() -> void:
	if _slime_input_ready(): main.spatial_combat.cast_targeted_fireball()

func _dodge_slime() -> void:
	if _slime_input_ready(): main.spatial_combat.dodge_slime()

func _select_slime() -> void:
	_slime_selected = true
	_slime_finished = false
	_other_combat_actions = false
	_view.scroll_to_scene_start()

func _close_slime() -> void:
	_stop_slime_retreat()
	_cancel_slime_approach()
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
	if event.get("kind", "") == "evade":
		if main.online_world and (main.online_presence.character_id.is_empty() or event.get("targetPlayerId", "") != main.online_presence.character_id): return
		if event.has("movement"):
			var combat: Dictionary = main._combat()
			if event.movement == "dodge" and combat.get("evadeSkill", "") == "dodge":
				_view.set_dodge_remaining(float(combat.get("evadeSeconds", 0.0)))
			return
		if event.get("evadeSkill", "") == "dodge":
			_view.show_dodge_result(true)
			_view.record("회피 성공 · 피해 0")
		else:
			_view.record("공격을 피했습니다.")
		return
	if not main.online_world: return
	var character_id: String = main.online_presence.character_id
	if character_id.is_empty(): return
	var is_actor: bool = event.get("actorId", "") == character_id
	var is_target: bool = event.get("targetPlayerId", "") == character_id
	var amount := int(event.get("amount", 0))
	match str(event.get("kind", "")):
		"hit":
			if is_actor and amount > 0:
				_slime_finished = false
				_view.record("%s에게 피해 %d" % [_enemy_name(), amount])
		"hurt":
			if is_target and amount > 0: _view.record("피격 · HP −%d" % amount)
		"enemy_down":
			if not _slime_selected and not is_actor: return
			_stop_slime_retreat()
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
			if not is_target: return
			_close_slime()
			_view.record("전투에서 쓰러져 분수 광장으로 돌아왔습니다.")

func _start_encounter(meadow_ox: bool = false) -> void:
	var location := MapGrid.MEADOW_AREA if meadow_ox else MapGrid.PLAZA_AREA
	if _plaza_engage_pending or not enabled or main.busy or main._state().get("location", "") != location: return
	var action := {"type": "arcana_combat", "command": "engage_meadow_ox" if meadow_ox else "engage_plaza_slime"}
	_plaza_engage_pending = true
	main.world.path.clear()
	if main.online_world:
		var result: Dictionary = await main.combat_socket.request(action)
		_plaza_engage_pending = false
		if int(result.get("transportGeneration", -1)) != main.combat_socket.connection_generation: return
		if result.has("state"): main._accept_online_result(result)
		if not enabled: return
		if main._online_fighting():
			_select_slime()
		else:
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
		_view.record("슬라임에게 접근할 길을 찾지 못했습니다.")

func _update_slime_approach(enemy_nearby: bool) -> void:
	if not _slime_approach.is_finite(): return
	if not main.world.path.is_empty():
		if _combat_walk_stalled():
			_cancel_slime_approach()
			_view.record("슬라임에게 다가가지 못했습니다.")
		return
	var reached: bool = main.world.player_position.distance_to(_slime_approach) <= float(main.world.TILE)
	_slime_approach = Vector2.INF
	if reached and enemy_nearby: _select_slime()
	else: _view.record("슬라임에게 다가가지 못했습니다.")

func _cancel_slime_approach() -> void:
	if _slime_approach.is_finite(): main.world.path.clear()
	_slime_approach = Vector2.INF

func _start_slime_retreat() -> void:
	if not _slime_input_ready() or _retreat_request_pending: return
	main.spatial_combat.cancel_unreleased_cast()
	_cancel_slime_approach()
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
		_record("슬라임에게서 벗어났습니다.")
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
		_record("슬라임에게서 벗어났습니다.")

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

func _action(id: String, label: String, detail: String, callback: Callable, disabled: bool) -> Dictionary:
	return {"id":id, "label":label, "detail":detail, "callback":callback, "disabled":disabled}

func _water_name() -> String:
	return "남쪽 강" if main.world.has_terraced_plaza() else "광장 연못"

func _rod_equipped() -> bool:
	return main._state().get("flags", {}).get("arcana_life_tool", "") == "fishingRod"

func _current_tile() -> String:
	var location := str(main._state().get("location", ""))
	if location == "arcana_plaza":
		return "river" if _detail_location == location and _place_detail == "river" else "plaza"
	if location == MapGrid.MEADOW_AREA: return "meadow"
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
	return targets

func _interior_labels(area: String, targets: Dictionary) -> Dictionary:
	var places := MapGrid.places_for(area)
	var labels := {}
	for id: String in places:
		if targets.has(id): labels[id] = places[id][1]
	return labels

func _map_destinations() -> Dictionary:
	var world = main.world
	if world.indoor.is_empty() and main._state().get("location", "") not in [MapGrid.PLAZA_AREA, MapGrid.MEADOW_AREA]: return {}
	var tiles := {"plaza": TILE_LABELS.plaza}
	if main.online_world: tiles["meadow"] = TILE_LABELS.meadow
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
		await _walk_map_choice(id, false, _select_city_place.bind(id))

func _choose_local_tile(id: String) -> void:
	if _map_move_active or not enabled or main.ui.overlay.visible: return
	var area := _interior_area()
	if _is_academy_area(area) and _show_academy_restriction(id): return
	await _walk_map_choice(id, true, _select_local_place.bind(id))

func _walk_map_choice(id: String, local: bool, arrive: Callable) -> void:
	if _map_move_active or not _can_choose_place(false): return
	_map_move_active = true
	if await _view.play_map_move(id, local):
		await arrive.call()
	_view.finish_map_move(local)
	_map_move_active = false

func _select_local_place(id: String) -> void:
	if _current_tile() == "plaza":
		await _select_plaza_tile(id)
	elif _current_tile() == "meadow":
		if id == "meadow_entrance":
			await _select_city_place("plaza")
		elif id == "meadow_ox" and meadow_target_ready() and _can_choose_place():
			await _start_encounter(true)
	else:
		await select_room(id)

func _can_choose_place(prepare: bool = true) -> bool:
	if not enabled or main.busy or main.life.blocking() or main.life.sending or main.fishing.visible: return false
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
	if not _can_choose_place(): return
	var location := str(main._state().get("location", ""))
	var target := str(BUILDING_TILES.find_key(id)) if id in BUILDING_TILES.values() else MapGrid.PLAZA_AREA
	if id == "meadow": target = MapGrid.MEADOW_AREA
	if location != target and location != "arcana_plaza":
		if location == "arcana_home":
			await main._leave_player_home()
		else:
			await main._travel("arcana_plaza")
		if main._state().get("location", "") != "arcana_plaza": return
	if target == "arcana_home":
		await main.open_home()
	elif target != main._state().get("location", ""):
		if not await main._travel(target): return
	if main._state().get("location", "") != target: return
	_detail_location = target
	_place_detail = "river" if id == "river" else ""
	show_scene()

func select_room(id: String) -> void:
	var area := _interior_area()
	if area.is_empty(): return
	var targets := _interior_targets(area)
	if not targets.has(id): return
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
			main.ui.choice(rooms[id], detail, select_room.bind(id), not restriction.is_empty())
		return
	main.ui.open_tab_panel("어디로 갈까요?")
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
