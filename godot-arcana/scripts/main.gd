extends Node

const MEADOW_LOCATION := "arcana_meadow_field"
const INDOOR_LOCATIONS := ["arcana_shop", "arcana_inn", "arcana_restaurant", "arcana_academy", "arcana_home"]
const INN_FISH_QUEST := "arcana_inn_supper"
const INN_SUPPLY_PENDING_KEY := "arcana-inn-supply-pending-v1-"
const INN_SUPPLY_RETRY_MS := 60_000
const World = preload("res://scripts/world.gd")
const HeroSpec = preload("res://art/resources/heroine_reference_spec.gd")
const NativeWorld = preload("res://scripts/native_2d_world.gd")
const UI = preload("res://scripts/game_ui.gd")
const EquipmentView := preload("res://scripts/equipment_view.gd")
const ItemThumbnail := preload("res://scripts/item_thumbnail.gd")
const SimplifiedPlay = preload("res://scripts/simplified_play.gd")
const HomeFurnitureEditor = preload("res://scripts/home_furniture_editor.gd")
const CityGrid = preload("res://scripts/simplified_city_grid.gd")
const SpatialCombat = preload("res://scripts/native_2d_spatial.gd")
const WorldDisplaySettings = preload("res://scripts/services/world_display_settings.gd")
const WORLD_PRESENTATION_SHADER = preload("res://art/resources/world_presentation.gdshader")
var fishing: Control
var life: Node
var spatial_combat
var combat_socket: Node
var action_delivery: Node
const HOME_UPPER_WALLS_KEY := "arcana-home-upper-walls-v1"
const SAVE_KEY = "arcana-godot-game-v1"
const SHARED_SAVE_KEY = "ruined-seoul-stage1-manual-save-game-id-v1"
const CONTROLS_KEY = "arcana-godot-controls-v1"
const QUICKSLOT_KEY = "arcana-godot-quickslots-v1"
const HUD_SIZE_KEY = "arcana-godot-ui-size-v1"
const MENU_SIZE_KEY = "arcana-godot-menu-size-v1"
const HUD_SIZE_MIN := 40
const MENU_SIZE_MIN := 30
const UI_SIZE_MAX := 115
const WORLD_MIN_ZOOM_RATIO := 0.5
var authored_layout: Node
var world: World
var world_renderer
var ui
var simplified_play: SimplifiedPlay
var home_furniture: HomeFurnitureEditor
var _home_furniture_game := ""
var _home_furniture_revision := -1
var _native_field_map: CityGrid
var viewport: SubViewport
var viewport_host: TextureRect
var _world_display: Node2D
var _world_display_size := Vector2i.ZERO
var _world_zoom_ratio := 1.0
var _world_presentation: ShaderMaterial
var _screen_pixel_size := WorldDisplaySettings.pixel_size(NativeWorld.TileStyle.REFERENCE_PIXEL_SIZE)
var mei_nameplate_target: Node2D
var mei_projection_valid = false
var mei_camera_transform: Transform3D
var mei_camera_settings: Vector3
var mei_viewport_size: Vector2i
var mei_world_position: Vector3
var mei_source_position: Vector2
var mei_pixel_origin: Vector2
var mei_quarter_view = false
var snapshot: Dictionary = {}
var game_id = ""
var online_world: bool = false
var online_presence: Node
var session_token: String = ""
var busy = false
var travel_pending := false
# Gate travel serializes server actions, but never pauses outdoor locomotion.
var gate_crossing = false
var clock_busy = false
# Native uses IPv4 loopback directly; browser builds replace this with location.origin.
var origin = "http://127.0.0.1:3000"
var client_id = "godot-" + str(Time.get_ticks_usec()) + "-" + str(randi())
var sequence = 0
var heartbeat = 0.0
var clock_failures: int = 0
var clock_retry_at: int = 0
var last_clock_paused = true
var page_active = true
var panel_mode = ""
var _inn_supply_request := 0
var _inn_supply_location := ""
var _inn_supply_pending_game := ""
var _inn_supply_pending: Dictionary = {}
var _status_vitals: Dictionary = {}
var _status_readout: Label
var inventory_selected_id: String = ""
var _home_storage_tab := 0
var _home_storage_selection: Array[String] = ["", ""]
var _equipment_view: EquipmentView
var action_page = 0
var bridge_callback
var state_callback
var web_window: JavaScriptObject
var keyboard_callback
var pending_interaction: Dictionary = {}
var developer_tools = false
var saved_position: Dictionary = {}
var resume_error = ""
var previous_enemy_hp = 30.0
var ui_refresh = 0.0
var frame_samples = PackedFloat64Array()
var frame_window = 0.0
var previous_pose_updates = 0
var previous_frame_usec = 0
var frame_timing: Dictionary = {}
var network_timing: Dictionary = {}
var network_samples: Array[float] = []
var network_requests: int = 0
var network_failures: int = 0
var zoom_touches: Dictionary = {}
var zoom_pinching = false
var zoom_distance = 0.0


func _ready() -> void:
	if authored_layout == null: authored_layout = get_node_or_null("Plaza")
	if authored_layout != null and authored_layout.get_parent() != null:
		authored_layout.get_parent().remove_child(authored_layout)
	viewport_host = TextureRect.new()
	viewport_host.mouse_filter = Control.MOUSE_FILTER_IGNORE
	viewport_host.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	viewport_host.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	viewport_host.stretch_mode = TextureRect.STRETCH_SCALE
	_world_presentation = ShaderMaterial.new()
	_world_presentation.shader = WORLD_PRESENTATION_SHADER
	_world_presentation.set_shader_parameter("pixel_size", _screen_pixel_size)
	_world_presentation.set_shader_parameter("use_viewport_texels", true)
	viewport_host.material = _world_presentation
	_world_display = Node2D.new()
	add_child(_world_display)
	_world_display.add_child(viewport_host)
	viewport = SubViewport.new()
	viewport.name = "WorldViewport"
	viewport.positional_shadow_atlas_size = 2048
	viewport.disable_3d = true
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	viewport.canvas_item_default_texture_filter = Viewport.DEFAULT_CANVAS_ITEM_TEXTURE_FILTER_NEAREST
	add_child(viewport)
	viewport_host.texture = viewport.get_texture()
	world = World.new()
	world.layout = authored_layout
	if OS.has_feature("web"):
		world.reduced_motion = bool(JavaScriptBridge.eval("matchMedia('(prefers-reduced-motion: reduce)').matches"))
	viewport.add_child(world)
	world.hide()
	world.camera.enabled = false
	world_renderer = NativeWorld.new()
	world_renderer.name = "WorldRenderer"
	world_renderer.world = world
	world_renderer.presentation_minimum = _screen_pixel_size
	world_renderer.show_home_upper_walls = _stored(HOME_UPPER_WALLS_KEY) == "1"
	viewport.add_child(world_renderer)
	world_renderer.camera_updated.connect(_on_world_camera_updated)
	world.interacted.connect(_interact)
	world.building_entry_intended.connect(_auto_enter_building)
	world.building_exit_intended.connect(_auto_exit_building)
	ui = UI.new()
	add_child(ui)
	var saved_hud_size := _stored(HUD_SIZE_KEY)
	if saved_hud_size.is_valid_int():
		ui.set_hud_size(clampi(saved_hud_size.to_int(), HUD_SIZE_MIN, UI_SIZE_MAX))
	var saved_menu_size := _stored(MENU_SIZE_KEY)
	if saved_menu_size.is_valid_int():
		ui.set_menu_size(clampi(saved_menu_size.to_int(), MENU_SIZE_MIN, UI_SIZE_MAX))
	ui.hud_size_committed.connect(func(percentage: int): _store(HUD_SIZE_KEY, str(percentage)))
	ui.menu_size_committed.connect(func(percentage: int): _store(MENU_SIZE_KEY, str(percentage)))
	ui.restore_controls(_stored_json(CONTROLS_KEY))
	ui.menu_requested.connect(_menu)
	ui.interact_pressed.connect(_activate)
	ui.quickslot_pressed.connect(_use_quickslot)
	var slots = _stored_json(QUICKSLOT_KEY)
	developer_tools = OS.has_feature("editor") or OS.is_debug_build()
	if OS.has_feature("web"):
		developer_tools = bool(JavaScriptBridge.eval("['localhost','127.0.0.1','::1','[::1]'].includes(location.hostname)"))
	if slots is Array and slots.size() == 4:
		for i in range(4):
			if slots[i] is String: ui.set_quickslot(i, "" if slots[i]=="dev_speed" else slots[i])
	if _stored("arcana-teleport-slot-v1")!="1":
		ui.set_quickslot(1,"teleport")
		_store(QUICKSLOT_KEY,JSON.stringify(ui.quickslot_bindings))
		_store("arcana-teleport-slot-v1","1")
	if developer_tools: ui.set_quickslot(3,"dev_speed")
	combat_socket = preload("res://scripts/combat_socket.gd").new()
	combat_socket.main = self
	add_child(combat_socket)
	spatial_combat = SpatialCombat.new()
	spatial_combat.main = self
	add_child(spatial_combat)
	online_presence = preload("res://scripts/native_2d_presence.gd").new()
	online_presence.main = self
	add_child(online_presence)
	world_renderer.enemy_render_sample = online_presence.enemy_render_sample
	action_delivery = preload("res://scripts/services/action_delivery.gd").new()
	action_delivery.main = self
	add_child(action_delivery)
	fishing = preload("res://scripts/fishing.gd").new()
	fishing.main = self
	ui.hud.add_child(fishing)
	life = preload("res://scripts/life.gd").new()
	life.main = self
	add_child(life)
	world_renderer.kitchen_cook_progress = life.kitchen_cook_progress
	simplified_play = SimplifiedPlay.new()
	simplified_play.main = self
	add_child(simplified_play)
	home_furniture = HomeFurnitureEditor.new(self)
	ui.move_changed.connect(_joystick_move)
	ui.panel_closed.connect(func():
		panel_mode = ""
		_inn_supply_request += 1
		world.touch_direction = Vector2.ZERO
		_sync_world_input())
	if OS.has_feature("web"):
		origin = str(JavaScriptBridge.eval("location.origin"))
		bridge_callback = JavaScriptBridge.create_callback(_bridge_command)
		state_callback = JavaScriptBridge.create_callback(_bridge_state)
		web_window = JavaScriptBridge.get_interface("window")
		web_window.arcanaGodotCommand = bridge_callback
		web_window.arcanaGodotState = state_callback
		JavaScriptBridge.eval("window.arcanaReady = true; window.dispatchEvent(new Event('arcana-ready'));")
	if OS.has_feature("web"):
		client_id = str(JavaScriptBridge.eval("globalThis.crypto?.randomUUID?.() || ('tab-'+Date.now()+'-'+Math.random().toString(36).slice(2))"))
	else:
		session_token = _stored("arcana-native-session")
	_resize()
	get_viewport().size_changed.connect(_resize)
	await _boot()

func _joystick_move(value: Vector2) -> void:
	if home_furniture.active: return
	# world.gd projects touch and keyboard together using the active view.
	world.touch_direction = value
	# Taking direct control cancels any click/map destination, including at center.
	if ui.joystick.is_active():
		world.clicked_interaction_id = ""
		world.path.clear()

func _toggle_camera_view() -> void:
	world_renderer.set_quarter_view(not world_renderer.quarter_view)
	ui.close_panel()

func _resize() -> void:
	var window := get_window()
	var reference := window.content_scale_size
	# Swap the design dimensions on rotation so touch controls keep their size.
	if (window.size.x >= window.size.y) != (reference.x >= reference.y):
		window.content_scale_size = Vector2i(reference.y, reference.x)
	if simplified_play.enabled: return
	var size = get_viewport().get_visible_rect().size
	var stretch_scale = get_viewport().get_stretch_transform().get_scale()
	_world_display_size = Vector2i((size*stretch_scale).round()).max(Vector2i(2, 2))
	world_renderer.set_display_size(size)
	var source_pixel_scale: float = minf(stretch_scale.x, stretch_scale.y) * 2.0 * world_renderer.base_camera_zoom / NativeWorld.CAMERA_ZOOM
	world_renderer.set_physical_size(_world_display_size, WORLD_MIN_ZOOM_RATIO)
	world_renderer.set_render_pixel_scale(source_pixel_scale)
	_world_display.scale = Vector2.ONE / stretch_scale
	world._update_camera()
	_set_zoom_ratio(_world_zoom_ratio)

func _api(route: String, method: int = HTTPClient.METHOD_GET, data: Dictionary = {}, timeout_seconds: float = 0.0, action_id: String = "") -> Dictionary:
	# Only reads may be replayed: a lost POST response can already be committed.
	var attempts: int = 3 if method == HTTPClient.METHOD_GET else 1
	var response: Dictionary = {}
	for attempt in range(attempts):
		if attempt > 0:
			await get_tree().create_timer(pow(2.0, attempt - 1) + randf() * 0.25).timeout
		response = await _api_once(route, method, data, timeout_seconds, action_id)
		if not response.get("retryable", false): return response
	return response

func _api_once(route: String, method: int, data: Dictionary, timeout_seconds: float = 0.0, action_id: String = "") -> Dictionary:
	return await preload("res://scripts/services/api_client.gd").request(self,route,method,data,timeout_seconds,action_id)

func _record_network(started_at: int, status: int, received: bool) -> void:
	var elapsed: float = float(Time.get_ticks_msec() - started_at)
	network_requests += 1
	if not received or status >= 400: network_failures += 1
	network_samples.append(elapsed)
	if network_samples.size() > 100: network_samples.pop_front()
	var ordered: Array[float] = network_samples.duplicate()
	ordered.sort()
	network_timing = {"requests":network_requests, "failures":network_failures, "lastMs":elapsed, "p95Ms":ordered[int((ordered.size()-1)*0.95)], "httpStatus":status, "windowSize":ordered.size()}

func _new_action_id() -> String:
	return client_id+"-"+str(Time.get_ticks_usec())+"-"+str(randi())

func _stored(key: String) -> String:
	return preload("res://scripts/services/local_storage.gd").read(key)
func _stored_json(key: String) -> Variant:
	return preload("res://scripts/services/local_storage.gd").read_json(key)
func _store(key: String, value: String) -> void:
	preload("res://scripts/services/local_storage.gd").write(key,value)

func _boot(takeover: bool = false) -> void:
	busy = true
	online_world = false
	combat_socket.blocked = true
	ui.close_panel()
	world.enabled = false
	# This also upgrades an authenticated legacy save before a guest is created.
	var account: Dictionary = await _api("/api/auth/me")
	if account.has("error"):
		busy = false
		_online_error(account)
		return
	if not account.get("characterChoices",[]).is_empty():
		busy = false
		_online_error({"error":"character_choice_required","message":"계정 화면에서 이어갈 캐릭터를 선택해 주세요."})
		return
	var guest: Dictionary = await _api("/api/auth/guest",HTTPClient.METHOD_POST)
	if guest.has("sessionToken"):
		session_token = str(guest.sessionToken)
		_store("arcana-native-session",session_token)
	if guest.has("error"):
		busy = false
		_online_error(guest)
		return
	var joined: Dictionary = await _api("/api/arcana/join",HTTPClient.METHOD_POST,{"controller":client_id,"takeover":takeover})
	busy = false
	if joined.has("error"):
		_online_error(joined)
		return
	game_id = str(joined.gameId)
	saved_position = {"location":joined.place.location,"x":joined.position.x,"y":joined.position.y,"academyFloor":joined.place.floor}
	online_world = true
	_apply(joined.snapshot,true)
	if OS.has_feature("web") and bool(JavaScriptBridge.eval("new URLSearchParams(location.search).get('mode') === 'text'")):
		simplified_play.set_enabled(true)
	online_presence.character_id = str(joined.characterId)
	online_presence.revision = -1
	online_presence.accept(joined.world)
	combat_socket.reset()
	ui.close_panel()

func _online_error(data: Dictionary) -> void:
	world.enabled = false
	ui.open_panel("아르카나 세계 입장",false)
	ui.paragraph(str(data.get("message","서버가 준비 중입니다. 잠시 후 다시 시도해 주세요.")))
	if data.get("error","") == "already_connected":
		ui.choice("현재 접속을 종료하고 이어받기","",func(): _boot(true))
	ui.choice("다시 입장하기","",_boot)
	ui.choice("계정 · 캐릭터 등록","",_account)
	ui.choice("홈으로","",_home)

func _online_fighting() -> bool:
	return bool(snapshot.get("onlineFighting",false))

func _account() -> void:
	if not OS.has_feature("web"):
		ui.toast("계정 연결은 웹 게임에서 이용해 주세요.")
		return
	if online_world: await _api("/api/arcana/leave",HTTPClient.METHOD_POST)
	JavaScriptBridge.eval("location.href='/account.html'")

func _state() -> Dictionary:
	return snapshot.get("state", {})

func _combat() -> Dictionary:
	return _state().get("arcanaCombat", {})

func _battle() -> Dictionary:
	var value = _combat().get("battle")
	return value if value is Dictionary else {}

func _apply(value: Dictionary, initial: bool = false) -> void:
	var previous_place_revision: int = int(snapshot.get("onlinePlaceRevision",0))
	if value.has("placeRevision"): value.onlinePlaceRevision = int(value.placeRevision)
	var old_school_room = str(snapshot.get("academyMap",{}).get("currentRoomId","")) if snapshot.get("academyMap") is Dictionary else ""
	var old_location = str(_state().get("location", ""))
	var had_battle = not _battle().is_empty()
	var previous_spells = _unlocked_spell_ids()
	var notify_unlocks = not initial and snapshot.get("gameId","") == value.get("gameId","") and not snapshot.is_empty()
	snapshot = value
	_sync_equipment(value.get("arcanaEquipment", EquipmentView.Appearance.DEFAULTS))
	if notify_unlocks: _notify_spell_unlocks(previous_spells)
	var location = str(_state().get("location", "arcana_plaza"))
	if _home_furniture_game != game_id:
		_home_furniture_game = game_id
		_home_furniture_revision = -1
		home_furniture.close()
		world.apply_home_layout([])
		world_renderer.apply_home_layout([])
	if location != "arcana_home": home_furniture.close()
	if value.get("homeFurniture") is Dictionary: _apply_home_furniture(value.homeFurniture)
	# Online position packets may update snapshot.location before the HTTP reply.
	var expected_interior = location if location in INDOOR_LOCATIONS else ""
	world.set_outdoor_field(location if online_world else "")
	life.accept_forest_trees(value)
	if initial or location != old_location or world.indoor != expected_interior:
		if location in INDOOR_LOCATIONS:
			world.change_interior(location)
			if initial:
				for entity in world._outdoor_entities:
					if entity.id == location: world.outside_position = entity.pos + Vector2(0, 7)
		elif world.indoor != "": world.change_interior("")
		if initial:
			if location == "arcana_hunting_ground": world.player_position = world.nearest_walkable(world.CityMap.HUNTING_ENTRY)
			elif location == "arcana_city_gate": world.player_position = world.nearest_walkable(world.CityMap.GATE - Vector2(0, 12))
			elif location == "arcana_return_portal":
				for entity in world._outdoor_entities:
					if entity.id == "arcana_return_portal":
						world.player_position = world.nearest_walkable(entity.pos + Vector2(0, 7))
						break
			if location == "arcana_academy":
				var room_id = str(snapshot.get("academyMap",{}).get("currentRoomId","hall"))
				var level = world.Academy.room_floor(room_id)
				if saved_position.get("location","") == location: level = clampi(int(saved_position.get("academyFloor",level)),1,2)
				world.change_academy_floor(level)
			if saved_position.get("location", "") == location:
				var point = Vector2(float(saved_position.get("x", 576)), float(saved_position.get("y", 500)))
				world.player_position = world.nearest_walkable(point)
	# Dialogue choices may return to another room. Move between floors only when
	# the server room actually changes; heartbeat responses preserve free exploration.
	if not initial and world.indoor == "arcana_academy" and snapshot.get("academyMap") is Dictionary:
		var room_id = str(snapshot.academyMap.currentRoomId)
		var target_floor = world.Academy.room_floor(room_id)
		if room_id != old_school_room and target_floor != world.academy_floor:
			world.change_academy_floor(target_floor)
			for entity in world.entities:
				if entity.id == room_id: world.player_position = world.nearest_walkable(entity.pos)
	if _battle().get("phase", "") == "defeat" and old_location != location:
		world.player_position = world.spawn_position
		world.path.clear()
	if not had_battle and _battle().get("phase", "") == "ready" and world.indoor == "":
		if world.player_position.distance_to(world.CityMap.HUNTING_HOME) < 36:
			world.player_position = Vector2(600, 1082)
			world.path.clear()
	if initial: world._update_camera(true)
	if initial and _battle().has("spatial"):
		var point: Dictionary = _battle().spatial.player
		world.player_position = world.nearest_walkable(Vector2(float(point.x),float(point.y)))
		world.path.clear()
		world._update_camera(true)
	if online_world and value.get("position") is Dictionary and (initial or int(value.get("onlinePlaceRevision",0))!=previous_place_revision):
		world.player_position = world.nearest_walkable(Vector2(float(value.position.x),float(value.position.y)))
		world.path.clear()
	if online_world and (initial or location!=old_location or int(value.get("onlinePlaceRevision",0))!=previous_place_revision): online_presence.reset_prediction()
	world.battle = _battle().duplicate(true)
	var enemy_hp = float(_battle().get("enemyHp", 30))
	if enemy_hp < previous_enemy_hp and not _battle().has("spatial"): world.effect("fireball", str(int(previous_enemy_hp - enemy_hp)))
	previous_enemy_hp = enemy_hp
	_update_hud(initial)

func _apply_home_furniture(value: Dictionary) -> void:
	if _state().get("location", "") != "arcana_home" or not value.get("placements") is Array: return
	var revision := int(value.get("layoutRevision", -1))
	if revision < 0 or revision < _home_furniture_revision: return
	if revision > _home_furniture_revision:
		_home_furniture_revision = revision
		world.apply_home_layout(value.placements)
		world_renderer.apply_home_layout(value.placements)
	home_furniture.accept_state(value)

func _update_hud(initial: bool = false) -> void:
	var c = _combat()
	var hp = float(c.get("hp", 100))
	var mp = float(c.get("mp", 30))
	var max_hp = 100.0
	var max_mp = 30.0
	ui.title_label.text = "ARCANA"
	var location_name = "분수 광장"
	for loc in snapshot.get("visibleLocations", []):
		if loc.id == _state().get("location", ""): location_name = loc.name.trim_prefix("아르카나 ")
	var school = snapshot.get("academyMap")
	if school is Dictionary:
		for room in school.get("rooms", []):
			if room.isCurrent: location_name = room.name
	if world.indoor == "arcana_academy": location_name = "마법학교 · %d층" % world.academy_floor
	if world.indoor == "arcana_home": location_name = "내 집 · 생활 %d일째" % int(_state().get("arcanaLife", {}).get("day", 1))
	ui.zone_label.text = location_name
	var pending_money = spatial_combat.reward_effects.pending_money if is_instance_valid(spatial_combat.reward_effects) else 0
	ui.money_label.text = "%s G" % maxi(0,int(_state().get("money",0))-int(pending_money))
	ui.hp_label.text = "HP  %d / %d" % [int(hp), max_hp]
	if float(c.get("guard",{}).get("amount",0)) > 0:
		ui.hp_label.text += " · 장막 %d" % int(c.guard.amount)
	ui.mp_label.text = "MP  %d / %d" % [int(mp), max_mp]
	ui.hp_bar.value = hp / max_hp * 100
	ui.mp_bar.value = mp / max_mp * 100
	var hunger: int = int(_state().get("arcanaLife",{}).get("hunger",100))
	ui.set_hunger(hunger, initial)
	ui.hunger_bar.visible = online_world
	ui.refresh_skill_choices(_skill_mastery_progress)
	if panel_mode == "status" and is_instance_valid(_status_readout):
		_refresh_status_readout()
	if is_instance_valid(ui.quest_view):
		ui.quest_view.sync_slime_progress(int(_state().get("flags", {}).get("arcana_inn_slime_kills", 0)))

func _sync_world_input() -> void:
	var ready: bool = (not online_world or combat_socket.socket_ready) and page_active and not snapshot.is_empty()
	if online_world and world.indoor == "arcana_home" and _home_furniture_revision < 0: ready = false
	var allows_travel: bool = not ui.overlay.visible or simplified_play.is_map_open()
	var can_move: bool = ready and allows_travel and not fishing.visible and not life.blocking() and not home_furniture.active
	world.enabled = can_move and (not busy or gate_crossing)
	ui.joystick.set_enabled(can_move and not simplified_play.enabled)

func _process(delta: float) -> void:
	_record_frame(delta)
	if not is_instance_valid(ui): return
	home_furniture.sync()
	_sync_world_input()
	if world.enabled and ui.joystick.is_active(): _joystick_move(ui.joystick.direction)
	if snapshot.is_empty(): return
	if panel_mode == "inn_supply" and ui.overlay.visible and _state().get("location", "") != _inn_supply_location:
		ui.close_panel()
	# Resolve the local position before the world, camera, and HUD sample it.
	online_presence.apply_local_correction(delta)
	heartbeat += delta
	ui_refresh += delta
	var battle = _battle()
	if not battle.is_empty() and not battle.has("spatial") and battle.get("phase", "") == "battle" and not battle.get("paused", true) and world.enabled:
		world.battle.attackIn = maxf(0, float(world.battle.get("attackIn", 6)) - delta)
		for key in ["fireball", "flame_wave", "flame_guard", "meteor", "giant_fireball", "flame_barrage", "ultimate", "dodge", "teleport", "potion"]:
			_combat().cooldowns[key] = maxf(0, float(_combat().cooldowns.get(key, 0)) - delta)
	if ui_refresh > .10:
		ui_refresh = 0
		_refresh_controls()
		simplified_play.refresh()
		if not simplified_play.enabled:
			for marker in get_tree().get_nodes_in_group("arcana_quest_markers"):
				marker.sync_quest(_state(),snapshot.get("quests",[]))
	if heartbeat >= 1.0 and not busy and not clock_busy and not spatial_combat.request_busy and not spatial_combat.connection_lost and spatial_combat.queue.is_empty() and spatial_combat.aim_owner == -1 and spatial_combat.pending_cast.is_empty() and spatial_combat.buffered_cast.is_empty() and not battle.has("spatial") and not spatial_combat.available():
		heartbeat = 0
		_clock()
	# Crossing the southern gate keeps position and commits the existing travel rule.
	if world.enabled and not busy and world.indoor == "" and battle.is_empty() and not world.uses_plaza_v2():
		var p = world.player_position
		var loc = str(_state().get("location", ""))
		if p.y > world.CityMap.GATE_OUTBOUND_Y and loc != "arcana_hunting_ground": _cross_gate(true)
		elif p.y < world.CityMap.GATE_RETURN_Y and loc == "arcana_hunting_ground": _cross_gate(false)

func _record_frame(_delta: float) -> void:
	var now = Time.get_ticks_usec()
	var elapsed = float(now - previous_frame_usec) / 1000000.0 if previous_frame_usec > 0 else 0.0
	previous_frame_usec = now
	if not page_active or elapsed <= 0.0:
		previous_pose_updates = world_renderer.hero.pose_updates
		frame_samples.clear()
		frame_window = 0.0
		return
	# Use wall time; engine delta smoothing can hide uneven frame delivery.
	frame_samples.append(elapsed * 1000.0)
	frame_window += elapsed
	if frame_window < 2.0: return
	frame_samples.sort()
	var slow = 0
	for ms in frame_samples:
		if ms > 25.0: slow += 1
	var pose_count = world_renderer.hero.pose_updates
	frame_timing = {"animationFps": snappedf((pose_count - previous_pose_updates) / frame_window, .1), "fps": snappedf(frame_samples.size() / frame_window, .1), "p95Ms": snappedf(frame_samples[int((frame_samples.size() - 1) * .95)], .1), "p99Ms": snappedf(frame_samples[ceili((frame_samples.size()-1)*.99)],.1), "sampleAtMs":Time.get_ticks_msec(), "maxMs": snappedf(frame_samples[frame_samples.size() - 1], .1), "slowFrames": slow, "processMs": snappedf(Performance.get_monitor(Performance.TIME_PROCESS) * 1000.0, .1), "drawCalls": int(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME))}
	if web_window != null and web_window.arcanaUpdateFrameRate != null:
		web_window.arcanaUpdateFrameRate(frame_timing.fps, frame_timing.p95Ms)
	previous_pose_updates = pose_count
	frame_samples.clear()
	frame_window = 0.0

func _refresh_controls() -> void:
	_refresh_native_field_map()
	var b = _battle()
	var fighting = b.get("phase", "") == "battle"
	var available = not busy and not ui.overlay.visible and not life.blocking() and not home_furniture.active
	ui.interaction.disabled = not available or (world.nearest.is_empty() and world.bench_state.is_empty())
	var interaction_name = str(world.nearest.get("name","주변 사물과 상호작용"))
	var at_plaza_water: bool = world.uses_plaza_v2() and world.nearest.get("kind","") == "fishing"
	var at_fire: bool = world.nearest.get("kind","") == "campfire"
	var at_trees: bool = world.nearest.get("kind", "") == "forest_trees"
	var home_actions := {"home_kitchen":"요리", "home_table":"제작", "home_storage":"보관함", "home_bed":"잠자리", "home_sofa":"쉬기", "home_door":"외출"}
	var home_action: String = home_actions.get(world.nearest.get("kind", ""), "") if world.indoor == "arcana_home" else ""
	ui.interaction_caption.visible = at_plaza_water or at_fire or at_trees or not home_action.is_empty()
	if not home_action.is_empty(): ui.interaction_caption.text = home_action
	if at_fire:
		ui.interaction_caption.text = "요리"
		interaction_name = "모닥불에서 요리하기"
	elif at_trees:
		var tree_id := str(world.nearest.id)
		ui.interaction_caption.text = life.forest_chop_caption(tree_id)
		interaction_name = ui.interaction_caption.text
		ui.interaction.disabled = not available or not life.can_chop_wood(tree_id)
	elif at_plaza_water:
		ui.interaction_caption.text = "낚시하기"
		interaction_name = ui.interaction_caption.text
	if world.bench_pose_active():
		var seat_name = str(world.bench_entity.get("seat_name","소파" if world.bench_entity.get("kind","")=="inn_sofa" else "벤치"))
		interaction_name = seat_name + "에서 일어나기"
	elif world.bench_state=="approach": interaction_name = "앉으러 가기 취소"
	elif world.nearest.get("kind","") in ["bench","inn_sofa","inn_chair"]:
		interaction_name = str(world.nearest.get("seat_name","소파" if world.nearest.kind=="inn_sofa" else "벤치")) + "에 앉기"
	ui.interaction.tooltip_text = "E / Space · " + interaction_name
	ui.interaction.accessibility_name = interaction_name
	var cooldowns = _combat().get("cooldowns", {})
	for i in range(ui.quickslot_buttons.size()):
		var slot: Button = ui.quickslot_buttons[i]
		var command: String = ui.quickslot_bindings[i]
		var spell := _spell(command)
		var remaining = 0.0 if command == "teleport" else float(cooldowns.get(command, 0))
		var cooldown_duration := float(spell.get("cooldown", 5.0))
		if command == "fireball":
			remaining = spatial_combat.fireball_cooldown_remaining()
			cooldown_duration = spatial_combat.fireball_cooldown_duration()
		var count = int(_state().get("inventory", {}).get("manaPotion", 0))
		slot.disabled = not available
		if not command.is_empty():
			slot.disabled = not available or remaining > .01 or (not fighting and command != "potion")
			if not spell.is_empty():
				slot.disabled = not available or not spell.get("unlocked",false) or not spell.get("equipped",false) or remaining > .01 or float(_combat().get("mp",0)) < float(spell.cost)
				if spatial_combat.available(): slot.disabled = not available or not spatial_combat.can_accept_cast_input(command)
				elif command != "flame_guard" and not fighting: slot.disabled = true
				elif b.get("paused",false) and fighting: slot.disabled = true
				elif b.get("phase","") in ["victory","defeat"]: slot.disabled = true
			if command == "dodge": slot.disabled = not spatial_combat.can_accept_dodge_input()
			if command == "teleport": slot.disabled = not spatial_combat.can_dash(command)
			if command == "potion" and count <= 0: slot.disabled = true
		if not world.bench_state.is_empty() and command!="dev_speed": slot.disabled = true
		if command == "dev_speed":
			slot.disabled = not developer_tools or not available
			remaining = 0.0
			ui.quickslot_labels[i].text = "가속 ON" if world.developer_speed_boost else "개발 가속"
			slot.tooltip_text = "개발자 전용 · 4: 이동 속도 3배 켜기/끄기 · 비용 없음"
			slot.set("accent",Color("3b9b8b") if world.developer_speed_boost else ui.MUTED)
		if world.indoor == "arcana_home" and command != "dev_speed": slot.disabled = true
		ui.quickslot_icons[i].modulate.a = .70 if slot.disabled else 1.0
		ui.quickslot_labels[i].modulate.a = .70 if slot.disabled else 1.0
		ui.quickslot_counts[i].text = "×3" if command=="dev_speed" and world.developer_speed_boost else str(count) if command == "potion" else ""
		# A shrinking outer ring conveys cooldown without a numeric countdown.
		var cooldown_visible := cooldown_duration > 0.0 and float(remaining) > .01
		ui.cooldown_bars[slot].visible = cooldown_visible
		ui.cooldown_bars[slot].value = clampf(float(remaining) / cooldown_duration, 0.0, 1.0) * 100.0 if cooldown_visible else 0.0
		if command != "dev_speed":
			var cooldown_override := cooldown_duration if command == "fireball" and cooldown_duration > 0.0 else -1.0
			var hint: String = _spell_hint(spell, cooldown_override) if not spell.is_empty() else ("재사용 대기 중" if remaining > .01 else ui.SLOT_NAMES[command])
			slot.tooltip_text = "%d · %s" % [i + 1, hint]

func _spell(command: String) -> Dictionary:
	for spell in snapshot.get("arcanaSpells",[]):
		if spell.id == command: return spell
	return {}

func _spell_hint(spell: Dictionary, cooldown_override: float = -1.0) -> String:
	if spell.get("parentSkill","")=="fireball": return "%s · 피해 %d · MP 30 · 재사용 60초" % [spell.name,int(spell.magnitude)]
	var effect = "4초간 보호막 %d" % int(spell.magnitude) if spell.targeting == "self" else "피해 %d" % int(spell.magnitude)
	if spell.targeting == "cone": effect = "전방 90도 · 2칸 · " + effect
	var shown_cooldown := str(cooldown_override) if cooldown_override >= 0.0 else str(int(spell.cooldown))
	return "%s · %s · MP %d · 재사용 %s초%s" % [spell.name,effect,int(spell.cost),shown_cooldown,"" if spell.get("unlocked",false) else " · 스킬 탭에서 습득"]

func _unlocked_spell_ids() -> Array:
	var result: Array = []
	for spell in snapshot.get("arcanaSpells",[]):
		if spell.get("unlocked",false): result.append(spell.id)
	return result

func _notify_spell_unlocks(previous: Array) -> void:
	var names: PackedStringArray = []
	for spell in snapshot.get("arcanaSpells",[]):
		if spell.get("unlocked",false) and not spell.id in previous: names.append(spell.name)
	if not names.is_empty(): ui.toast("새 주문 습득 · " + " · ".join(names))

func _clock() -> void:
	if online_world: return
	if Time.get_ticks_msec() < clock_retry_at: return
	var paused = not page_active or (ui.overlay.visible and not simplified_play.is_map_open())
	if paused and last_clock_paused: return
	clock_busy = true
	sequence += 1
	var data = await _api("/api/games/" + game_id + "/actions", HTTPClient.METHOD_POST, {"type":"world_clock", "command":"pause" if paused else "tick", "clientId":client_id, "sequence":sequence})
	if data.has("state"):
		_apply(data)
		last_clock_paused = paused
		clock_failures = 0
		clock_retry_at = 0
		if not paused and _battle().get("phase", "") == "battle" and _battle().get("paused", false):
			data = await _api("/api/games/" + game_id + "/actions", HTTPClient.METHOD_POST, {"type":"arcana_combat", "command":"resume", "battleId":_battle().id})
			if data.has("state"): _apply(data)
	else:
		clock_failures = mini(clock_failures + 1, 5)
		clock_retry_at = Time.get_ticks_msec() + int(minf(30.0, pow(2.0, clock_failures)) * 1000)
		if clock_failures == 1: ui.toast(data.get("message", "서버 연결을 확인해 주세요."))
	clock_busy = false

func perform(action: Dictionary, show_result: bool = true) -> bool:
	var action_type := str(action.get("type", ""))
	if online_world and simplified_play.enabled and action_type in ["travel", "academy_move"]:
		action = action.duplicate()
		action.textMode = true
	if online_world and action.get("type","") == "arcana_combat" and action.get("command","") in ["potion","flame_guard"]:
		return await _online_instant(str(action.command))
	if busy: return false
	var previous_combat = _combat().duplicate(true)
	var previous_battle_phase = previous_combat.battle.get("phase","") if previous_combat.get("battle") is Dictionary else ""
	var previous_mucus = int(_state().get("inventory",{}).get("slimeMucus",0))
	busy = true
	travel_pending = action_type == "travel"
	while clock_busy: await get_tree().process_frame
	if not await spatial_combat.before_action():
		busy = false
		travel_pending = false
		ui.toast("서버에 다시 연결하고 있습니다. 잠시 후 이용해 주세요.")
		return false
	if not gate_crossing:
		world.touch_direction = Vector2.ZERO
		if not travel_pending: ui.toast("진행 중…")
	var data: Dictionary = await action_delivery.submit(action) if action_delivery.handles(action) else await _api("/api/games/" + game_id + "/actions", HTTPClient.METHOD_POST, action)
	busy = false
	travel_pending = false
	if not data.has("state"):
		if not data.get("quiet",false): ui.toast(data.get("message", "행동을 마치지 못했습니다. 진행을 확인해 주세요."))
		return false
	_apply(data)
	if _battle().get("phase","")=="victory" and not _battle().has("spatial") and previous_battle_phase!="victory" and is_instance_valid(spatial_combat.reward_effects):
		spatial_combat.reward_effects.show_slime_loot(str(_battle().id)+":classic",maxi(0,int(_state().get("inventory",{}).get("slimeMucus",0))-previous_mucus))
	_remember_position()
	var note = str(_state().get("systemNote", ""))
	if not note.is_empty(): ui.toast(note)
	else: ui.toast_time = 0
	if not _state().get("flags", {}).get("in_magic_world", false): _returned_home()
	elif show_result: _scene()
	return true

func _travel(target: String) -> bool:
	if _state().get("location", "") == target:
		_apply(snapshot)
		return true
	var action := {"type":"travel", "targetId":target}
	if online_world and (target in [MEADOW_LOCATION, CityGrid.FOREST_AREA] or _state().get("location", "") in [MEADOW_LOCATION, CityGrid.FOREST_AREA]):
		action.textMode = true
	return await perform(action, false)

func _cross_gate(outbound: bool) -> void:
	if busy or gate_crossing: return
	gate_crossing = true
	var arrived = await _travel("arcana_hunting_ground" if outbound else "arcana_plaza")
	gate_crossing = false
	if arrived:
		# Keep the live position/path: the player may have turned around while waiting.
		# The next frame commits a return crossing if they walked back through the gate.
		ui.toast("도시 앞 평원 · 슬라임의 흔적이 이어집니다." if outbound else "아르카나 · 분수 광장")
	elif (outbound and world.player_position.y > world.CityMap.GATE_OUTBOUND_Y) or (not outbound and world.player_position.y < world.CityMap.GATE_RETURN_Y):
		# A rejected travel must leave the player on the server-confirmed side.
		world.player_position.y = world.CityMap.GATE_INSIDE_Y if outbound else world.CityMap.GATE_OUTSIDE_Y
		world.path.clear()

func _activate() -> void:
	if busy or fishing.visible or life.blocking() or home_furniture.active: return
	if not world.nearest.is_empty() or not world.bench_state.is_empty(): world.interact()

func _auto_enter_building(entity: Dictionary) -> void:
	if busy or not page_active or ui.overlay.visible or not world.indoor.is_empty() or (_online_fighting() if online_world else _battle().get("phase","")=="battle"):
		world.entered_door_id = ""
		return
	if spatial_combat.request_busy or spatial_combat.aim_owner!=-1:
		world.entered_door_id = ""
		return
	world.enabled = false
	world.touch_direction = Vector2.ZERO
	await _interact(entity)
	world.enabled = not busy and page_active and not ui.overlay.visible

func _auto_exit_building(entity: Dictionary) -> void:
	if busy or not page_active or ui.overlay.visible or home_furniture.active or world.indoor.is_empty() or (_online_fighting() if online_world else _battle().get("phase", "") == "battle") or spatial_combat.request_busy or spatial_combat.aim_owner != -1:
		world.exit_pending = false
		return
	world.enabled = false
	world.touch_direction = Vector2.ZERO
	await _interact(entity)
	world.exit_pending = false
	world.enabled = not busy and page_active and not ui.overlay.visible

func _sit_furniture(entity: Dictionary) -> bool:
	if (not online_world and not _battle().is_empty()) or (online_world and _online_fighting()) or spatial_combat.request_busy or spatial_combat.aim_owner!=-1 or not spatial_combat.queue.is_empty() or not spatial_combat.pending_cast.is_empty(): return false
	if not world_renderer.hero.supports_bench_pose():
		ui.toast("현재 의상에는 앉기 모션이 준비되지 않았습니다.")
		return false
	if not world.sit_on_bench(entity):
		ui.toast("앉을 자리 앞이 막혀 있습니다.")
		return false
	return true

func _interact(entity: Dictionary) -> void:
	if busy or fishing.visible or life.blocking() or home_furniture.active: return
	world.path.clear()
	match entity.kind:
		"home_kitchen": life.home_kitchen()
		"home_bed": _home_bedroom()
		"home_table": life.craft_menu()
		"home_storage": _open_home_storage()
		"home_sofa": _home_lounge(entity)
		"home_door": await _leave_player_home()
		"forest_trees": await life.chop_wood(str(entity.id))
		"forest_entrance": await _travel("arcana_plaza")
		"fishing":
			await _start_water_fishing()
		"campfire":
			life.cook_menu(str(entity.id))
		"merchant":
			_shop_menu()
		"innkeeper":
			_innkeeper_dialogue()
		"quest_board":
			_inn_quest_board()
		"bench", "inn_chair":
			_sit_furniture(entity)
		"building":
			if entity.id == "arcana_home":
				await open_home()
				return
			if await _travel(entity.id):
				if entity.id == "arcana_academy":
					ui.toast("학교 안에서 인물과 각 공간을 찾아가 보세요.")
				elif entity.id not in ["arcana_inn","arcana_shop"]: _scene()
		"inn_sofa":
			if not _sit_furniture(entity): return
			if not developer_tools: return
			if await perform({"type":"arcana_combat","command":"dev_sofa_rest"}, false):
				ui.close_panel()
				ui.toast("소파에서 쉬었습니다. HP · MP 모두 회복")
		"exit":
			if await _travel("arcana_plaza"):
				ui.toast("분수 광장")
		"academy_stairs":
			var school = snapshot.get("academyMap",{})
			if not str(school.get("blockedReason","")).is_empty():
				ui.toast(school.blockedReason)
				return
			if online_world and not await spatial_combat.before_action():
				ui.toast("서버에 다시 연결하고 있습니다. 잠시 후 이용해 주세요.")
				return
			var next_floor := 2 if world.academy_floor == 1 else 1
			if online_world and simplified_play.enabled:
				var result: Dictionary = await combat_socket.request({"command":"spatial_sync", "floor":next_floor, "textPlace":"academy_stairs"})
				if result.has("error"):
					ui.toast(str(result.get("message", "층을 바꾸지 못했습니다.")))
					return
				_accept_online_result(result)
			else:
				world.change_academy_floor(next_floor)
			_remember_position()
			_update_hud()
			ui.toast("마법학교 · %d층" % world.academy_floor)
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
			world.walk_to(world.CityMap.FIELD_ENTRY)
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
		"city_corner", "city_resident":
			_city_corner_dialogue(entity)
		"resident":
			ui.open_panel(str(entity.get("name", "메이")))
			panel_mode = "resident"
			ui.paragraph("초록 망토를 두른 메이가 펼친 지도에서 분수를 짚습니다. “서쪽에는 상점과 여관, 북쪽에는 식당, 동쪽에는 아카데미가 있어요. 남문 밖 평원에는 슬라임이 나타나니 조심하세요.”")
			ui.choice("길을 이어 간다", "", ui.close_panel)
		_:
			_scene()

func open_home(close_panel: bool = true) -> void:
	if busy or life.blocking() or life.sending: return
	if world.indoor == "arcana_home":
		if close_panel: ui.close_panel()
		return
	if not online_world or str(_state().get("location", "")) != "arcana_plaza" or not world.indoor.is_empty():
		ui.toast("분수 광장으로 나온 뒤 집에 들어갈 수 있습니다.")
		return
	if await life.send({"command":"life_home_enter"}):
		if close_panel: ui.close_panel()
		ui.toast("집에 돌아왔습니다. 지도에서 가구를 찾을 수 있습니다.")

func _leave_player_home(close_panel: bool = true) -> void:
	if await life.send({"command":"life_home_leave"}):
		world.entered_door_id = ""
		if close_panel: ui.close_panel()
		ui.toast("분수 광장으로 나왔습니다.")

func home_walk_to(kind: String) -> void:
	if world.indoor != "arcana_home": return
	if simplified_play.enabled:
		simplified_play.select_room(kind)
		return
	for entity in world.entities:
		if entity.kind != kind: continue
		if ui.overlay.visible: ui.close_panel()
		_sync_world_input()
		world.interact_with(entity)
		return

func _home_bedroom() -> void:
	panel_mode = "home"
	ui.open_panel("내 집 · 침대")
	var gathered := int(_state().get("arcanaLife", {}).get("gatheredToday", 0))
	if gathered > 0:
		var hunger_cost := mini(25, int(_state().get("arcanaLife", {}).get("hunger", 100)))
		ui.choice("잠들기", "다음 생활일 · 채집 횟수 회복 · 허기 %d 감소 · HP와 MP 회복" % hunger_cost, life.home_rest)
	else:
		ui.choice("잠시 눈 붙이기", "HP와 MP 회복 · 오늘은 그대로 이어집니다", life.home_rest)
	ui.choice("침대에서 물러난다", "", ui.close_panel)

func _home_lounge(entity: Dictionary) -> void:
	panel_mode = "home"
	ui.open_panel("내 집 · 안락의자")
	ui.choice("만든 요리 먹기", "가방에서 요리를 골라 식사합니다", life.meal_menu)
	if not simplified_play.enabled:
		ui.choice("안락의자에 앉기", "일어나려면 상호작용 버튼을 누르세요", func():
			ui.close_panel()
			_sit_furniture(entity))

func _city_corner_dialogue(entity: Dictionary) -> void:
	var corners: Dictionary = preload("res://scripts/native_2d_city_life.gd").CORNERS
	var detail: Dictionary = corners.get(str(entity.get("id", "")), {})
	if detail.is_empty(): return
	panel_mode = "city_corner"
	ui.open_panel(str(entity.get("name", "도시 산책")))
	ui.paragraph(str(detail.text))
	var destination: Vector2 = detail.target
	ui.choice(str(detail.walk), "길을 따라 걸어갑니다", func(): ui.close_panel(); world.walk_to(destination))
	ui.choice("계속 둘러본다", "", ui.close_panel)

func _innkeeper_dialogue(topic: String = "welcome") -> void:
	if str(_state().get("location","")) != "arcana_inn": return
	panel_mode = "innkeeper"
	ui.open_panel("여관주인 · 마르텐")
	match topic:
		"fish_delivered":
			ui.paragraph("마르텐이 생선을 받아 접시에 올리고 주방 쪽으로 돌아봅니다. “빈 솥에 물부터 올려 주세요. 오늘은 국물이 있겠습니다.” 그는 앞치마 주머니에서 동전을 꺼내 접수대에 놓습니다.")
		"inn":
			ui.paragraph("마르텐은 닦던 잔을 선반에 올리고 소파 쪽으로 손바닥을 펼칩니다.")
			ui.paragraph("“오래 걸으셨다면 저쪽에 앉아 쉬세요. 벽난로 가까운 자리가 따뜻합니다. 계단 앞은 다른 손님들도 다니니 짐을 놓지 말아 주세요.”")
		"directions":
			if world.uses_plaza_v2():
				ui.paragraph("마르텐이 잔을 내려놓고 창밖의 분수를 가리킵니다. “물약은 광장 상점에서 팔아요. 고기를 낚으시려면 %s으로 가세요.”" % _plaza_fishing_place())
			else:
				ui.paragraph("“분수 광장으로 나가시면 길을 찾기 쉬울 겁니다.” 마르텐이 문 너머를 가리킵니다.")
				ui.paragraph("“서쪽에는 상점, 동쪽에는 식당과 마법학교가 있어요. 남문 밖은 슬라임이 나타나는 평원입니다. 처음 가시는 길이면 준비부터 하고 나가세요.”")
		_:
			ui.paragraph("접수대 뒤의 남자가 접어 든 천을 내려놓습니다. 자주색 조끼에 달린 작은 초승달 장식이 등불을 받습니다.")
			ui.paragraph("“어서 오세요. 여관을 맡고 있는 마르텐입니다. 쉬어 가실 건가요, 아니면 길을 찾으세요?”")
	var quest_status = str(_state().get("quests",{}).get("arcana_inn_slimes","inactive"))
	var kills = mini(10,int(_state().get("flags",{}).get("arcana_inn_slime_kills",0)))
	var fish_quest := _inn_fish_card()
	var fish_status := str(fish_quest.get("status", ""))
	if online_world:
		ui.choice("여관 생선 매입 · 식사", "민물고기 납품 · 생선구이 주문", _open_inn_supply)
	if quest_status == "inactive" or fish_status == "inactive":
		ui.paragraph("마르텐이 접수대 옆 게시판을 가리킵니다. “맡으실 일이 있다면 저쪽에서 의뢰를 확인해 주세요.”")
		_local_map_choice("quest_board", "의뢰판을 보러 간다", "여관 의뢰 확인")
	if quest_status == "active":
		ui.paragraph("슬라임 퇴치 %d/10마리 · 보상 10골드" % kills,ui.GOLD)
		ui.choice("슬라임 퇴치를 보고한다", "10골드 수령", func(): _inn_slime_quest("claim_slime_quest"), kills < 10)
	elif quest_status == "completed" and topic != "fish_delivered":
		ui.paragraph("마르텐이 고개를 숙입니다. “슬라임을 정리해 주셔서 고맙습니다.”")
	if fish_status == "active":
		ui.paragraph("“저녁상에는 민물고기 한 마리면 됩니다. %s에서 낚으실 수 있어요.”" % _plaza_fishing_place())
		ui.choice("민물고기를 건넨다", "민물고기 1마리 제출 · %s 수령" % fish_quest.rewardText,
			_inn_supper_action.bind("claim_fish_quest"), not bool(fish_quest.readyToReport))
	ui.choice("여관에서 쉬어 간다", "오늘의 채집을 마쳤다면 다음 생활일로", life.home_rest)
	ui.choice("여관에 관해 묻는다", "", func(): _innkeeper_dialogue("inn"))
	ui.choice("주변 길을 묻는다", "", func(): _innkeeper_dialogue("directions"))
	if simplified_play.enabled:
		for entry: Dictionary in _visible_actions():
			var action: Dictionary = entry.get("action", {})
			if action.get("type") == "arcana_combat" and action.get("command") == "rest":
				ui.choice(entry.label, entry.outcomeHint, _choose.bind(entry), not entry.get("isAvailable", true))
				break
	else:
		ui.choice("여관 서비스를 이용한다", "", func(): _scene())
	ui.choice("대화를 마친다", "", ui.close_panel)

func _inn_supply_route() -> String:
	return "/api/games/%s/inn-supply" % game_id.uri_encode()

func _inn_supply_panel_current(request: int, active_game: String, location: String, simple: bool) -> bool:
	return _inn_supply_request == request and game_id == active_game and simplified_play.enabled == simple \
		and _state().get("location", "") == location and panel_mode == "inn_supply" and ui.overlay.visible

func _open_inn_supply() -> void:
	var location := str(_state().get("location", ""))
	if not online_world or busy or location not in ["arcana_plaza", "arcana_inn"]: return
	var active_game := str(game_id)
	var simple: bool = simplified_play.enabled
	if _inn_supply_pending_game != active_game: _inn_supply_pending = {}
	_inn_supply_pending_game = active_game
	if _inn_supply_pending.is_empty():
		var saved: Variant = _stored_json(INN_SUPPLY_PENDING_KEY + active_game)
		if saved is Dictionary:
			var day: Variant = saved.get("day")
			var created_at: Variant = saved.get("createdAt")
			var action_id: Variant = saved.get("actionId")
			if saved.get("action", "") in ["deliver", "buyMeal"] and action_id is String and action_id.length() >= 16 \
				and (day is int or day is float) and day > 0 and (created_at is int or created_at is float) and created_at > 0:
				_inn_supply_pending = saved
	_inn_supply_request += 1
	var request := _inn_supply_request
	panel_mode = "inn_supply"
	_inn_supply_location = location
	_render_inn_supply({}, "여관의 기록을 불러오고 있습니다…", true)
	var route := "%s?controller=%s" % [_inn_supply_route(), client_id.uri_encode()]
	var reply := await _api(route, HTTPClient.METHOD_GET, {}, 8.0)
	if not _inn_supply_panel_current(request, active_game, location, simple): return
	if reply.get("innSupply") is Dictionary:
		_render_inn_supply(reply.innSupply)
	else:
		_render_inn_supply({}, str(reply.get("message", "여관의 기록을 불러오지 못했습니다.")))

func _render_inn_supply(supply: Dictionary, message: String = "", loading: bool = false) -> void:
	var in_inn: bool = _state().get("location", "") == "arcana_inn"
	ui.open_panel("마르텐의 생선 매입")
	ui.button_list_touch_enabled = true
	if not message.is_empty(): ui.paragraph(message, ui.MUTED)
	if not supply.is_empty():
		var day := int(supply.get("day", 0))
		var remaining := int(supply.get("remaining", 0))
		var fish_price := int(supply.get("unitPrice", 0))
		var daily_limit := int(supply.get("dailyLimit", 0))
		ui.paragraph("%d일차 · 공동 매입 잔여 %d/%d마리" % [day, remaining, daily_limit], ui.GOLD)
		ui.paragraph("민물고기 1마리당 %d골드 · 내 가방 %d마리\n여관의 민물고기 재고 %d마리" % [
			fish_price, int(supply.get("owned", 0)), int(supply.get("fishStock", 0))])
		var servings := int(supply.get("menuServings", 0))
		var meal_price := int(supply.get("mealPrice", 0))
		ui.paragraph("생선구이 %d인분 · 1인분 %d골드" % [servings, meal_price])
		if not bool(supply.get("menuOpen", false)):
			ui.paragraph("18:00부터 오늘 들어온 생선을 구워 메뉴에 올립니다.", ui.MUTED)
		if in_inn and _inn_supply_pending.is_empty() and not loading:
			ui.choice("민물고기 1마리 납품", "%d골드 받기" % fish_price,
				_inn_supply_trade.bind("deliver", day), not bool(supply.get("canDeliver", false)))
			ui.choice("생선구이 1인분 주문", "%d골드 · 가방에 담기" % meal_price,
				_inn_supply_trade.bind("buyMeal", day), not bool(supply.get("canBuyMeal", false)))
	if not in_inn:
		ui.paragraph("%s에서 민물고기를 낚아 여관 접수대의 마르텐에게 가져가세요." % _plaza_fishing_place())
		if simplified_play.enabled:
			if world.uses_plaza_v2():
				ui.choice("낚시터로 이동", _plaza_fishing_place(), simplified_play._select_city_place.bind("river"), loading)
			ui.choice("여관으로 이동", "접수대의 마르텐에게 납품", simplified_play._select_city_place.bind("inn"), loading)
		else:
			if world.uses_plaza_v2(): ui.choice("낚시 자리로 이동", _plaza_fishing_place(), _walk_to_plaza_water, loading)
			for entity in world.entities:
				if entity.kind == "building" and entity.id == "arcana_inn":
					ui.choice("여관으로 이동", "접수대의 마르텐에게 납품", func():
						ui.close_panel()
						world.interact_with(entity), loading)
					break
	if not loading:
		if not _inn_supply_pending.is_empty():
			var title := "이전 거래 확인 · 재시도" if in_inn else "이전 거래 확인"
			var previous := "생선구이 1인분 주문" if _inn_supply_pending.action == "buyMeal" else "민물고기 1마리 납품"
			ui.choice(title, previous,
				_inn_supply_trade.bind(str(_inn_supply_pending.action), int(_inn_supply_pending.day)))
		ui.choice("재고 새로고침", "", _open_inn_supply)
		if in_inn: ui.choice("마르텐과 대화", "", _innkeeper_dialogue)
	ui.choice("닫기", "", ui.close_panel)

func _inn_supply_trade(action: String, day: int) -> void:
	if busy or panel_mode != "inn_supply" or not ui.overlay.visible: return
	if not combat_socket.socket_ready:
		ui.toast("세계에 다시 연결한 뒤 거래해 주세요.")
		return
	var active_game := str(game_id)
	var location := str(_state().get("location", ""))
	var simple: bool = simplified_play.enabled
	var connection: int = combat_socket.connection_generation
	var recovering := not _inn_supply_pending.is_empty()
	var key := INN_SUPPLY_PENDING_KEY + active_game
	var now := int(Time.get_unix_time_from_system() * 1000)
	if not recovering:
		if location != "arcana_inn" or life.blocking() or life.sending or _online_fighting(): return
		_inn_supply_pending = {"action": action, "day": day, "actionId": _new_action_id(), "createdAt": now}
		_store(key, JSON.stringify(_inn_supply_pending))
	elif _inn_supply_pending.action != action or int(_inn_supply_pending.day) != day:
		return
	var request := _inn_supply_request
	var action_id := str(_inn_supply_pending.actionId)
	var body := {"controller": client_id, "action": action, "day": day, "actionId": action_id}
	var route := _inn_supply_route()
	var world_revision: int = online_presence.revision
	busy = true
	_render_inn_supply({}, "여관에서 거래를 확인하고 있습니다…", true)
	var reply: Dictionary = {}
	if recovering:
		var receipt_route := "/api/games/%s/actions/%s" % [active_game.uri_encode(), action_id.uri_encode()]
		reply = await _api(receipt_route, HTTPClient.METHOD_GET, {}, 8.0)
		# An old request can still have a receipt. Only resend recent, unrecorded intents at the counter.
		if reply.get("status", "") == "unknown":
			var since := int(Time.get_unix_time_from_system() * 1000) - int(_inn_supply_pending.createdAt)
			if since < 0 or since >= INN_SUPPLY_RETRY_MS:
				reply = {"error": "inn_supply_intent_expired", "message": "처리되지 않은 이전 주문을 취소했습니다."}
			elif _inn_supply_panel_current(request, active_game, "arcana_inn", simple) \
				and combat_socket.connection_generation == connection:
				reply = await _api(route, HTTPClient.METHOD_POST, body, 12.0)
			else:
				reply = {"retryable": true, "message": "아직 처리 기록이 없습니다. 여관에서 같은 거래를 다시 요청할 수 있습니다."}
	else:
		reply = await _api(route, HTTPClient.METHOD_POST, body, 12.0)
	busy = false
	if game_id != active_game: return
	var receipt: Variant = reply.get("actionReceipt")
	var accepted: bool = receipt is Dictionary and receipt.get("id", "") == action_id
	var supply: Variant = reply.get("innSupply")
	var error := str(reply.get("error", ""))
	var http_status := int(reply.get("httpStatus", 0))
	var reconnect: bool = recovering and (http_status in [401, 403] or error in ["join_required", "connection_replaced"])
	var uncertain: bool = not accepted and (bool(reply.get("retryable", false)) \
		or http_status >= 500 or error in ["", "invalid_response"] or reconnect)
	if not uncertain:
		_inn_supply_pending = {}
		var saved: Variant = _stored_json(key)
		if saved is Dictionary and saved.get("actionId", "") == action_id:
			_store(key, "")
	var value: Variant = reply.get("snapshot")
	if accepted and value is Dictionary and value.get("state") is Dictionary \
		and combat_socket.connection_generation == connection \
		and str(value.state.get("location", "")) == str(_state().get("location", "")) \
		and int(value.get("placeRevision", -1)) == int(snapshot.get("onlinePlaceRevision", 0)) \
		and int(reply.get("worldRevision", world_revision)) >= online_presence.revision:
		_apply(value)
	if not _inn_supply_panel_current(request, active_game, location, simple): return
	if accepted:
		var label := "생선구이 1인분을 가방에 담았습니다." if action == "buyMeal" else "민물고기 1마리를 납품했습니다."
		if supply is Dictionary:
			_render_inn_supply(supply, label)
		else:
			ui.toast(label)
			_open_inn_supply()
	elif uncertain:
		_render_inn_supply({}, str(reply.get("message", "거래 결과를 확인하지 못했습니다. 잠시 후 이전 거래를 확인해 주세요.")))
	else:
		ui.toast(str(reply.get("message", "거래할 수 없습니다.")))
		_open_inn_supply()

func _inn_quest_board() -> void:
	if world.indoor != "arcana_inn": return
	panel_mode = "quest_board"
	ui.open_panel("여관 퀘스트판")
	var status: String = str(_state().get("quests",{}).get("arcana_inn_slimes","inactive"))
	var kills: int = mini(10,int(_state().get("flags",{}).get("arcana_inn_slime_kills",0)))
	ui.paragraph("슬라임 퇴치 · 의뢰인 마르텐",ui.GOLD)
	var hunting_area := "분수 광장" if world.uses_plaza_v2() else "남문 밖 평원"
	ui.paragraph("%s의 슬라임 10마리를 처치한 뒤 여관 주인에게 보고해 주세요. 보상은 10골드입니다." % hunting_area)
	if status == "inactive":
		ui.choice("슬라임 퇴치 의뢰를 받는다", "수락 후 처치부터 집계 · 0/10마리", func(): _inn_slime_quest("accept_slime_quest"))
	elif status == "active":
		ui.paragraph("진행 %d/10마리" % kills,ui.GOLD)
		if kills >= 10:
			_local_map_choice("innkeeper", "마르텐에게 간다", "접수대에서 의뢰 보고")
		else:
			_local_map_choice("exit", "광장으로 나간다", "여관 출입문")
	else:
		ui.paragraph("완료 · 보상 수령 완료",ui.MUTED)
	var fish_quest := _inn_fish_card()
	if not fish_quest.is_empty():
		ui.paragraph(str(fish_quest.name), ui.GOLD)
		match str(fish_quest.status):
			"inactive":
				ui.paragraph("“비 맞고 돌아올 마차꾼들에게 따뜻한 국을 내려고 합니다. %s에서 민물고기 한 마리를 구해 주세요. 이미 잡아 둔 생선도 받습니다. — 마르텐”" % _plaza_fishing_place())
				ui.choice("저녁상 의뢰를 받는다", "민물고기 1마리 제출 · 보상 %s" % fish_quest.rewardText,
					_inn_supper_action.bind("accept_fish_quest"))
			"active":
				if fish_quest.readyToReport:
					_local_map_choice("innkeeper", "민물고기를 들고 마르텐에게 간다", "접수대에서 제출")
				else:
					ui.paragraph("%s에서 민물고기 한 마리를 낚아 마르텐에게 가져가세요." % _plaza_fishing_place())
			"completed":
				ui.paragraph("완료 · 저녁상에 올릴 민물고기를 전달했습니다.", ui.MUTED)
	ui.choice("그만 본다", "", ui.close_panel)

func _inn_fish_card() -> Dictionary:
	if not online_world: return {}
	for quest: Dictionary in snapshot.get("quests", []):
		if quest.get("id") != INN_FISH_QUEST: continue
		if quest.get("status") == "completed": return quest
		# Fishing updates inventory through the world connection before the next full snapshot.
		var card := quest.duplicate(true)
		var requirement: Dictionary = card.requirements[0]
		var count := int(_state().get("inventory", {}).get("riverFish", 0))
		requirement.ownedAmount = count
		requirement.met = count >= int(requirement.amount)
		card.readyToReport = card.status == "active" and requirement.met
		return card
	return {}

func _inn_supper_action(command: String) -> void:
	var accepting := command == "accept_fish_quest"
	var success: bool = await perform({"type":"arcana_combat", "command":command}, false)
	if str(_state().get("location", "")) != "arcana_inn": return
	if accepting:
		_inn_quest_board()
		if success: ui.toast("마르텐의 저녁상 의뢰를 받았습니다.")
	elif success:
		_innkeeper_dialogue("fish_delivered")
		ui.toast("민물고기 1마리 전달 · 의뢰 보상 %s" % _inn_fish_card().get("rewardText", ""))
	else:
		_innkeeper_dialogue()

func _inn_slime_quest(command: String) -> void:
	var success = await perform({"type":"arcana_combat","command":command},false)
	if str(_state().get("location","")) == "arcana_inn":
		if command == "accept_slime_quest": _inn_quest_board()
		else: _innkeeper_dialogue()
		if success: ui.toast("의뢰를 받았습니다." if command == "accept_slime_quest" else "의뢰 보상 10골드를 받았습니다.")

func _find_action(type: String, id: String) -> Dictionary:
	for entry in snapshot.get("availableActions", []):
		var a = entry.get("action", {})
		if a.get("type", "") == type and (a.get("actionId", "") == id or a.get("command", "") == id): return a
	return {}

func _shop_menu(selling: bool = false) -> void:
	if world.indoor != "arcana_shop": return
	panel_mode = "shop"
	ui.open_shop(snapshot.get("availableActions", []), _state().get("inventory", {}), int(_state().get("money", 0)), selling, _shop_trade, _item_thumbnail)

func _shop_trade(template: Dictionary, quantity: int, selling: bool) -> void:
	if busy or world.indoor != "arcana_shop": return
	var action = template.duplicate(true)
	action.quantity = quantity
	var success = await perform(action,false)
	if world.indoor == "arcana_shop":
		_shop_menu(selling)
		if success: ui.toast("거래를 마쳤습니다.")

func _scene(page: int = 0) -> void:
	if world.indoor == "arcana_shop":
		_shop_menu()
		return
	if _battle().get("phase","")=="victory":
		_finish_victory_quietly.call_deferred()
		return
	if simplified_play.enabled:
		simplified_play.show_scene()
		return
	panel_mode = "scene"
	action_page = page
	var scene = snapshot.get("currentScene", {})
	var scene_title = str(scene.get("title", "주변 살펴보기"))
	for pair in [["early morning", "이른 아침"], ["late morning", "오전"], ["late night", "깊은 밤"], ["dawn", "새벽"], ["noon", "정오"], ["morning", "아침"], ["afternoon", "낮"], ["evening", "저녁"], ["night", "밤"]]:
		scene_title = scene_title.replace("(" + pair[0] + ")", "· " + pair[1])
	ui.open_panel(scene_title)
	for p in scene.get("paragraphs", []): ui.paragraph(p)
	var note = str(_state().get("systemNote", ""))
	if not note.is_empty(): ui.paragraph(note, ui.GOLD)
	var actions = _visible_actions()
	for i in range(page * 5, mini(page * 5 + 5, actions.size())):
		var entry: Dictionary = actions[i]
		ui.choice(entry.get("label", "선택"), entry.get("outcomeHint", ""), func(): _choose(entry), not entry.get("isAvailable", true))
	if actions.size() > 5:
		ui.choice("다른 행동 보기", "%d / %d" % [page + 1, ceili(actions.size() / 5.0)], func(): _scene((page + 1) % ceili(actions.size() / 5.0)))
	if actions.is_empty(): ui.paragraph("이곳에서는 주변을 걸어 다니며 문과 인물을 살펴볼 수 있습니다.", ui.MUTED)

func _finish_victory_quietly() -> void:
	if busy or _battle().get("phase","")!="victory": return
	ui.close_panel()
	await perform({"type":"arcana_combat","command":"finish","battleId":_battle().id},false)

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
	if battle_action and command in ["dodge","teleport"]:
		ui.close_panel()
		spatial_combat.start_dash(command)
		return
	if battle_action and _battle().has("spatial"):
		ui.close_panel()
		if command in ["fireball","flame_wave","meteor","giant_fireball"]: spatial_combat.cast_auto(command)
		else: spatial_combat.queue_command(command)
		return
	if battle_action and command in ["start", "resume", "fireball", "flame_wave", "flame_guard", "dodge", "teleport", "potion", "finish", "retreat"]:
		ui.close_panel()
		if await perform(action, false):
			if command == "dodge": world.effect("dodge")
			if command == "retreat": world.player_position = world.spawn_position if world.uses_plaza_v2() else Vector2(576, 910)
	else:
		await perform(action)

func _online_instant(command: String) -> bool:
	sequence += 1
	var action: Dictionary = {"type":"arcana_combat","command":command}
	var result: Dictionary = await action_delivery.submit(action) if command=="potion" else await spatial_combat.instant_guard()
	if result.has("error"):
		if not result.get("quiet",false): ui.toast(str(result.get("message","사용하지 못했습니다.")))
		return false
	if int(result.get("transportGeneration",combat_socket.connection_generation))!=combat_socket.connection_generation: return false
	_accept_online_result(result)
	return true

func _accept_online_result(result: Dictionary) -> void:
	var update: Dictionary = online_presence.packet.duplicate()
	update.self = result
	update.revision = int(result.get("worldRevision",0))
	# A durable command reply can follow a newer movement broadcast for the same room.
	if update.revision < online_presence.revision and result.get("homeFurniture") is Dictionary:
		if int(result.get("placeRevision", -1)) == int(snapshot.get("onlinePlaceRevision", 0)):
			_apply_home_furniture(result.homeFurniture)
	online_presence.accept(update)

func _magic(command: String) -> void:
	if fishing.visible or life.blocking() or world.indoor == "arcana_home": return
	if is_instance_valid(simplified_play) and simplified_play.handle_combat_command(command): return
	if online_world and command in ["potion","flame_guard"]:
		await _online_instant(command)
		return
	if command in ["dodge","teleport"]:
		spatial_combat.start_dash(command)
		return
	if busy or ui.overlay.visible or not world.bench_state.is_empty(): return
	if spatial_combat.available():
		if command in ["fireball","flame_wave","meteor","giant_fireball"]: spatial_combat.cast_auto(command)
		else: spatial_combat.queue_command(command)
		return
	if _battle().is_empty() and command not in ["potion","flame_guard"]: return
	var action = {"type":"arcana_combat", "command":command}
	if not _battle().is_empty(): action.battleId = _battle().id
	if await perform(action, false):
		if command == "dodge": world.effect("dodge")
		if _battle().get("phase", "") in ["victory", "defeat"]: _scene()

func _use_quickslot(index: int) -> void:
	if fishing.visible or life.blocking(): return
	if world.indoor == "arcana_home" and ui.quickslot_bindings[index] != "dev_speed": return
	if ui.quickslot_bindings[index] == "teleport":
		spatial_combat.start_dash("teleport")
		return
	if busy or ui.overlay.visible or snapshot.is_empty(): return
	if ui.quickslot_bindings[index]=="dev_speed":
		if developer_tools and not ui.quickslot_buttons[index].disabled:
			world.developer_speed_boost = not world.developer_speed_boost
			_refresh_controls()
		return
	if ui.quickslot_bindings[index].is_empty():
		_quickslot_picker(index)
	else:
		if ui.quickslot_bindings[index] == "potion" and ui.quickslot_buttons[index].disabled: return
		# The action path checks current readiness; the HUD refresh can be stale.
		_magic(ui.quickslot_bindings[index])

func _quickslots_menu() -> void:
	panel_mode = "quickslots"
	ui.open_panel("퀵슬롯 설정")
	ui.paragraph("슬롯을 골라 스킬이나 아이템을 배치하세요. 숫자 키 1~4로도 사용할 수 있습니다.", ui.MUTED)
	for i in range(4):
		var command: String = ui.quickslot_bindings[i]
		var current: String = "비어 있음" if command.is_empty() else ui.SLOT_NAMES[command]
		ui.choice("슬롯 %d · %s" % [i + 1, current], "배치 변경", func(): _quickslot_picker(i), false, command)

func _quickslot_picker(index: int) -> void:
	if developer_tools and index==3:
		panel_mode = "quickslots"
		ui.open_panel("개발자 전용 · 이동 가속")
		ui.paragraph("4번 슬롯은 개발용 이동 가속입니다. 4키 또는 슬롯 버튼으로 이동 속도 3배를 켜고 끕니다.",ui.MUTED)
		return
	panel_mode = "quickslots"
	ui.open_panel("슬롯 %d에 배치" % (index + 1))
	ui.paragraph("이 슬롯은 키보드 %d 키와 연결됩니다." % (index + 1), ui.MUTED)
	var current_school = ""
	for spell in snapshot.get("arcanaSpells",[]):
		if spell.school != current_school:
			current_school = spell.school
			ui.paragraph(spell.schoolName + " 계열",ui.GOLD)
		var command: String = spell.id
		ui.choice(spell.name,_spell_hint(spell),func(): _assign_quickslot(index,command),not spell.get("equipped",false),command)
	for entry in [["텔레포트", "teleport", "기본 마법 · 진행 방향으로 즉시 순간이동"], ["대시", "dodge", "진행 방향으로 이동 · 1초간 공격 1회 회피"], ["마나 포션", "potion", "아이템 · 보유 %d개" % int(_state().get("inventory", {}).get("manaPotion", 0))], ["비워 두기", "", "슬롯에서 해제"]]:
		var command: String = entry[1]
		ui.choice(entry[0], entry[2], func(): _assign_quickslot(index, command), false, command)

func _assign_quickslot(index: int, command: String) -> void:
	if not _spell(command).is_empty() and not _spell(command).get("equipped",false):
		ui.toast("액티브 슬롯에 먼저 장착해 주세요.")
		return
	ui.set_quickslot(index,command)
	_store(QUICKSLOT_KEY,JSON.stringify(ui.quickslot_bindings))
	ui.close_panel()
	_refresh_controls()

func _open_skills_tab(selected: int) -> void:
	var icon_kinds: Array[String] = ["skills_tab", "crafting"]
	ui.open_section_panel("스킬", ["스킬", "제작"], selected, [_menu.bind("skills"), life.craft_menu], false, icon_kinds)

func _skill_mastery_progress(skill_id: String) -> Dictionary:
	var spell := _spell(skill_id)
	if not spell.is_empty():
		if not spell.get("unlocked", false): return {}
		var parent_id := str(spell.get("parentSkill", ""))
		if not parent_id.is_empty():
			spell = _spell(parent_id)
		var tree: Variant = spell.get("tree")
		return tree if tree is Dictionary and float(tree.get("xpRequired", 0)) > 0.0 else {}
	# 생활 스킬과 기본 회피 기술은 100 XP마다 숙련도가 1씩 오릅니다.
	var xp := maxf(0.0, float(_combat().get("skillTraining", {}).get(skill_id, {}).get("xp", 0)))
	var level := mini(floori(xp / 100.0), 100)
	var maxed := level == 100
	return {"level": level, "xp": 100.0 if maxed else fposmod(xp, 100.0), "xpRequired": 100, "maxed": maxed}

func _skills_menu() -> void:
	panel_mode = "skills"
	_open_skills_tab(0)
	ui.paragraph("액티브 6칸 · 패시브 2칸",ui.MUTED)
	ui.paragraph("모든 스킬을 배울 수 있으며, 장착한 전투 스킬만 사용할 수 있습니다.",ui.MUTED)
	ui.choice("장착 구성","주력 4칸 · 자유 2칸 · 패시브 2칸",_loadout_menu,false,"loadout")
	var school = ""
	for spell in snapshot.get("arcanaSpells",[]):
		if spell.school != school:
			school = spell.school
			ui.paragraph(spell.schoolName+" 계열",ui.GOLD)
		var command: String = spell.id
		var parent_id := str(spell.get("parentSkill", ""))
		var detail := "궁극기" if not parent_id.is_empty() else ""
		if spell.get("equipped", false):
			detail = "장착 중" if detail.is_empty() else detail + " · 장착 중"
		if not spell.get("unlocked", false):
			detail = "배우기" if spell.get("learnable", false) else "잠김"
		if not spell.get("schoolUnlocked", true):
			detail = spell.schoolName + " 계열 해금 필요"
		var level_prefix := str(_spell(parent_id).get("name", "")) + " " if not parent_id.is_empty() else ""
		ui.skill_choice(spell.name, detail, _skill_details.bind(command), command, _skill_mastery_progress(command), level_prefix)
	ui.paragraph("생활 스킬",ui.GOLD)
	for id in ["crafting","cooking"]:
		var skill_id: String = id
		var info: Dictionary = life.skill_info(skill_id)
		ui.skill_choice(str(info.name), "", life.show_skill.bind(skill_id), skill_id, _skill_mastery_progress(skill_id))
	ui.skill_choice("낚시", "", _fishing_details, "fishing", _skill_mastery_progress("fishing"))
	ui.paragraph("기본 기술",ui.GOLD)
	ui.skill_choice("텔레포트", "즉시 순간이동 · 0.3초 회피 · MP 0 · 재사용 0초", _skill_slot_picker.bind("teleport"), "teleport", _skill_mastery_progress("teleport"))
	ui.skill_choice("대시", "즉시 전방 이동 · 1초간 공격 1회 회피 · 재사용 5초", _skill_slot_picker.bind("dodge"), "dodge", _skill_mastery_progress("dodge"))
	ui.choice("퀵슬롯 관리","배치 확인 · 교체 · 해제",_quickslots_menu,false,"quickslots")
	if developer_tools: ui.paragraph("개발자 전용 이동 가속은 4번 슬롯에 고정됩니다.",ui.MUTED)

func _plaza_fishing_place() -> String:
	return "광장 남쪽 강둑" if world.has_terraced_plaza() else "광장 남서쪽 연못"

func _fishing_details() -> void:
	panel_mode = "skills"
	ui.open_panel("생활 스킬 · 낚시")
	ui.skill_progress(_skill_mastery_progress("fishing"))
	ui.paragraph("낚싯대 장착 필요 · MP 소모 없음")
	ui.paragraph("%s에서 E 또는 ‘낚시하기’를 누르세요. 소지한 나무 낚싯대를 들고 찌를 던집니다. 물가에서 수면을 직접 눌러도 됩니다." % _plaza_fishing_place())
	ui.paragraph("광장에서는 입질을 놓쳐도 찌가 떠 있는 동안 다음 물고기가 찾아옵니다.")
	ui.paragraph("입질이 오면 Space / E 또는 챔질 버튼을 누르세요. 물고기를 초록 구간 안에 유지하면 포획합니다. 누르면 구간이 올라가고, 떼면 내려갑니다.")
	ui.paragraph("성공하면 민물고기 1마리와 경험치 25를 얻습니다. 물고기를 거의 놓치지 않은 완벽한 포획은 경험치 40입니다. 경험치 100당 숙련도 1이 오르며, 숙련도가 오를수록 조작 구간이 넓어집니다.")
	ui.choice("스킬 목록으로", "", _skills_menu)

func _skill_tree_action(command: String, node_id: String, reset: bool = false) -> void:
	if busy: return
	var action = {"type":"arcana_combat","command":"reset_skill_tree" if reset else "invest_skill","spellId":command}
	if not reset: action.nodeId = node_id
	var source_view = ui.skill_tree_view
	await perform(action,false)
	if is_instance_valid(source_view) and ui.skill_tree_view == source_view and ui.overlay.visible:
		_show_skill_tree(command,node_id if not node_id.is_empty() else "power")

func _show_skill_tree(command: String, selected: String = "power") -> void:
	panel_mode = "skills"
	ui.open_skill_tree(_spell(command),selected,func(node_id: String): _skill_tree_action(command,node_id),func(): _skill_tree_action(command,"",true),_skills_menu)

func _skill_details(command: String) -> void:
	var spell = _spell(command)
	if spell.is_empty(): return
	if spell.get("parentSkill","")=="fireball":
		panel_mode = "skills"
		ui.open_panel(spell.name)
		ui.paragraph(_spell_hint(spell))
		ui.choice("액티브 장착 위치 선택","",func(): _equip_picker(command),false,command)
		ui.choice("퀵슬롯에 배치","",func(): _skill_slot_picker(command),not spell.get("equipped",false),command)
		ui.choice("파이어볼 트리","",func(): _show_skill_tree("fireball"),false,"fireball")
		return
	if spell.get("unlocked",false) and spell.has("tree"):
		_show_skill_tree(command)
		return
	panel_mode = "skills"
	ui.open_panel(spell.name)
	ui.paragraph(_spell_hint(spell))
	if spell.get("unlocked",false):
		ui.paragraph("숙련도 %.2f / 100 · 숙련 경험치 %.0f / 10000" % [float(spell.get("mastery",0)),float(spell.get("masteryXp",0))],ui.GOLD)
		ui.paragraph("유효 명중·실제 보호 기여로 성장합니다. 전문화는 아직 준비 중입니다.",ui.MUTED)
		ui.choice("액티브 장착 위치 선택","전투 밖에서 변경할 수 있습니다.",func(): _equip_picker(command),false,command)
		ui.choice("퀵슬롯에 배치","장착한 스킬을 빠르게 사용",func(): _skill_slot_picker(command),not spell.get("equipped",false),command)
	else:
		var can_learn = bool(spell.get("learnable",false))
		var reason = "비용 없음 · 한 번 배우면 유지됩니다." if can_learn else "현재 배울 수 없습니다."
		if not spell.get("schoolUnlocked",true): reason = spell.schoolName+" 계열을 먼저 해금해 주세요."
		if _battle().get("phase","")=="battle":
			can_learn = false
			reason = "전투를 마친 뒤 배울 수 있습니다."
		if _state().get("npcDialogue",{}).get("active") is Dictionary:
			can_learn = false
			reason = "대화를 마친 뒤 배울 수 있습니다."
		ui.choice("배우기",reason,func(): _learn_skill(command),not can_learn,command)
	ui.choice("스킬 목록으로","",_skills_menu)

func _loadout_menu() -> void:
	panel_mode = "skills"
	ui.open_panel("장착 구성")
	ui.paragraph("전투 중에는 변경할 수 없습니다. 퀵슬롯과 장착 구성은 별개입니다.",ui.MUTED)
	var slots = _combat().get("activeSkills",[])
	for i in range(6):
		var id = str(slots[i]) if slots.size()>i and slots[i]!=null else ""
		var label = "주력 %d" % (i+1) if i<4 else "자유 %d" % (i-3)
		ui.choice(label+" · "+str(_spell(id).get("name","비어 있음")),"장착 변경 · 해제",func(): _loadout_slot_picker(i),false,id)
	ui.paragraph("패시브 1 · 비어 있음 / 패시브 2 · 비어 있음",ui.MUTED)
	ui.paragraph("패시브·발견·융합·생활 스킬은 이후 정의되는 항목부터 연결합니다. 기본 회피는 슬롯 없이 사용할 수 있습니다.",ui.MUTED)
	ui.choice("스킬 목록으로","",_skills_menu)

func _loadout_slot_picker(index: int) -> void:
	panel_mode = "skills"
	ui.open_panel("액티브 %d번 슬롯" % (index+1))
	for spell in snapshot.get("arcanaSpells",[]):
		if not spell.get("unlocked",false): continue
		var command: String = spell.id
		ui.choice(spell.name,"이 슬롯에 장착",func(): _equip_skill(index,command),false,command)
	ui.choice("비우기","장착 해제",func(): _equip_skill(index,""))
	ui.choice("장착 구성으로","",_loadout_menu)

func _equip_picker(command: String) -> void:
	panel_mode = "skills"
	ui.open_panel("액티브 장착")
	var slots = _combat().get("activeSkills",[])
	for i in range(6):
		var id = str(slots[i]) if slots.size()>i and slots[i]!=null else ""
		var label = "주력 %d" % (i+1) if i<4 else "자유 %d" % (i-3)
		ui.choice(label+" · "+str(_spell(id).get("name","비어 있음")),"이 슬롯에 장착",func(): _equip_skill(i,command),false,id)
	ui.choice("스킬 목록으로","",_skills_menu)

func _equip_skill(index: int, command: String) -> void:
	if busy: return
	var action = {"type":"arcana_combat","command":"equip_spell","slotIndex":index}
	if not command.is_empty(): action.spellId = command
	if await perform(action,false): _loadout_menu()

func _learn_skill(command: String) -> void:
	if busy: return
	if await perform({"type":"arcana_combat","command":"learn_spell","spellId":command},false):
		_skill_details(command)
		ui.toast(_spell(command).get("name",command)+" 습득")
	else: _skill_details(command)

func _skill_slot_picker(command: String) -> void:
	panel_mode = "skills"
	ui.open_panel("퀵슬롯에 배치")
	for i in range(3 if developer_tools else 4):
		var index = i
		var slot_command: String = ui.quickslot_bindings[i]
		var current: String = "비어 있음" if slot_command.is_empty() else ui.SLOT_NAMES.get(slot_command,"비어 있음")
		ui.choice("%d번 · %s" % [i+1,current],"이 슬롯에 배치",func(): _assign_quickslot(index,command); _skills_menu(),false,slot_command)
	ui.choice("스킬 목록으로","",_skills_menu)

func _menu(kind: String) -> void:
	if fishing.visible or life.blocking() or home_furniture.active: return
	if busy or snapshot.is_empty(): return
	panel_mode = kind
	match kind:
		"skills": _skills_menu()
		"map": _map()
		"inventory": _inventory()
		"status": _status_menu()
		"quests":
			var quests: Array = []
			for quest in snapshot.get("quests", []):
				if quest.id.begins_with("academy_") or quest.id == "arcana_inn_slimes": quests.append(quest)
			var fish_quest := _inn_fish_card()
			if not fish_quest.is_empty(): quests.append(fish_quest)
			ui.open_quests(quests, func(): _menu("map"))
			ui.quest_view.sync_slime_progress(int(_state().get("flags", {}).get("arcana_inn_slime_kills", 0)))
		"menu":
			ui.open_tab_panel("모험 메뉴")
			ui.menu_entry("상태", "기본 능력치 · 현재 상태 · 스킬 성장", _menu.bind("status"), "journal")
			if simplified_play.enabled:
				ui.menu_entry("의뢰", "진행 중인 의뢰와 보상", _menu.bind("quests"), "quests")
				ui.menu_entry("그래픽 모드", "지금 위치에서 지도로 돌아가기", simplified_play.set_enabled.bind(false), "display")
			else:
				ui.menu_entry("심플 모드", "장소 · 상태 · 행동 선택지로 모험 이어가기", simplified_play.set_enabled.bind(true), "display")
			ui.menu_entry("진행 저장", "현재 위치와 모험 기록", _save, "save")
			ui.menu_entry("화면 설정", "HUD %d%% · 메뉴 %d%% · 월드 %d%%" % [ui.hud_size_percent, ui.menu_size_percent, roundi(_world_zoom_ratio * 100)], _environment_settings, "display")
			ui.menu_entry("조작 설정", "조작 버튼 배치와 퀵슬롯 크기", _controls_settings, "controls")
			ui.menu_entry("도움말", "조작 방법 · 연결 기록", _help, "help")
			ui.menu_entry("계정과 캐릭터", "이름 등록 · 계정 연결", _account, "account")
			var exit_title := "홈으로" if OS.has_feature("web") else "게임 종료"
			ui.menu_entry(exit_title, "진행을 저장한 뒤 나가기", _save_and_home, "home")

func _status_menu() -> void:
	panel_mode = "status"
	ui.open_tab_panel("상태")
	for title: String in ui.VITAL_COLORS:
		_status_vitals[title] = ui.add_vital_bar(ui.content, title)
	_status_readout = ui.label("", 16, ui.TEXT_INK)
	_status_readout.add_theme_constant_override("line_spacing", 8)
	_status_readout.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	ui.content.add_child(_status_readout)
	_refresh_status_readout()
	_add_status_abilities()
	ui.paragraph("스킬 성장", ui.GOLD)
	for spell in snapshot.get("arcanaSpells", []):
		if spell.get("unlocked", false):
			var level := int(spell.get("tree", {}).get("level", 1))
			var equipped := " · 장착 중" if spell.get("equipped", false) else ""
			ui.paragraph("%s · 스킬 레벨 %d%s" % [spell.name, level, equipped])
	ui.choice("장착 구성", "액티브 · 패시브 슬롯 확인", _loadout_menu)
	ui.choice("모험 메뉴로", "", _menu.bind("menu"))

func _add_status_abilities() -> void:
	var abilities: Variant = snapshot.get("arcanaAbilities")
	if not (abilities is Array) or abilities.is_empty():
		return
	ui.paragraph("기본 능력치", ui.GOLD)
	var grid := GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 12)
	grid.add_theme_constant_override("v_separation", 8)
	ui.content.add_child(grid)
	for ability in abilities:
		if not (ability is Dictionary):
			continue
		var modifier := int(ability.get("modifier", 0))
		var signed_modifier := "+" + str(modifier) if modifier >= 0 else str(modifier)
		var label: Label = ui.label("%s  %d (%s)" % [str(ability.get("name", "")), int(ability.get("score", 10)), signed_modifier], 16, ui.TEXT_INK)
		label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		grid.add_child(label)

func _refresh_status_readout() -> void:
	var combat := _combat()
	var guard: Dictionary = combat.get("guard", {})
	_set_status_vital("HP", int(combat.get("hp", 100)), int(combat.get("maxHp", 100)))
	_set_status_vital("MP", int(combat.get("mp", 30)), int(combat.get("maxMp", 30)))
	var lines := PackedStringArray([
		"마나 회복  시간당 %s MP" % str(combat.get("manaRegenPerHour", 12)),
	])
	if float(guard.get("amount", 0)) > 0:
		lines.append("보호막  %d · 남은 시간 %.1f초" % [int(guard.amount), float(guard.get("seconds", 0))])
	else:
		lines.append("보호막 없음")
	_status_readout.text = "\n".join(lines)

func _set_status_vital(title: String, current: int, maximum: int) -> void:
	var vital: Dictionary = _status_vitals[title]
	var bar: ProgressBar = vital.bar
	bar.max_value = maxi(1, maximum)
	bar.value = current
	vital.label.text = "%s  %d / %d" % [title, int(bar.value), int(bar.max_value)]

func _map() -> void:
	if simplified_play.enabled:
		simplified_play.show_map()
		return
	var school = snapshot.get("academyMap")
	if school is Dictionary and world.indoor == "arcana_academy":
		ui.open_panel("아르카나 지도")
		ui.paragraph("마법학교 %d층 · 다른 층은 계단으로 이동하실 수 있습니다." % world.academy_floor, ui.MUTED)
		for entity in world.entities:
			if entity.kind == "academy_stairs":
				ui.choice(entity.name,"계단까지 길 안내 · 도착 후 상호작용",func(): ui.close_panel(); world.walk_to(entity.pos))
		for entity in world.entities:
			if entity.kind != "academy_room": continue
			var reason = ""
			for room in school.rooms:
				if room.id == entity.id: reason = room.lockedReason
			ui.choice(entity.name, reason if not reason.is_empty() else "길 안내", func(): ui.close_panel(); world.walk_to(entity.pos), not reason.is_empty())
		ui.choice("도시 지도 보기", "", _city_map)
	else: _city_map()

func _city_map() -> void:
	if world.meadow_active or world.forest_active:
		_show_native_field_map()
		return
	if world.indoor == "arcana_home":
		ui.open_panel("내 집")
		if online_world and not simplified_play.enabled:
			ui.choice("꾸미기", "가구 이동 · 회전 · 보관", home_furniture.open, not home_furniture.can_open())
		ui.choice("주방", "화덕에서 요리하기", home_walk_to.bind("home_kitchen"))
		ui.choice("작업대", "나뭇가지 다듬기 · 모닥불 만들기", home_walk_to.bind("home_table"))
		ui.choice("보관함", "아이템 넣기 · 꺼내기", home_walk_to.bind("home_storage"))
		ui.choice("안락의자", "앉아서 쉬기 · 식사", home_walk_to.bind("home_sofa"))
		ui.choice("침대", "하루 마무리", home_walk_to.bind("home_bed"))
		ui.choice("현관", "분수 광장으로 나가기", home_walk_to.bind("home_door"))
		return
	ui.open_panel("아르카나 지도")
	if world.indoor != "":
		_local_map_choice("quest_board", "여관 의뢰판", "의뢰 확인")
		_local_map_choice("innkeeper", "마르텐의 접수대", "대화 · 의뢰 보고")
		_local_map_choice("merchant", "상점 거래대", "물품 사고팔기")
		_local_map_choice("exit", "광장으로 나간다", "출입문")
		return
	if online_world and _state().get("location", "") == "arcana_plaza":
		ui.choice("마을 게시판", "마르텐의 생선 매입 확인", _open_inn_supply, _online_fighting())
		ui.choice("%s (2, 5)" % CityGrid.PLACES.forest[1], "벌목지로 이동", _travel_from_map.bind(CityGrid.FOREST_AREA), _online_fighting())
		ui.choice("뿔소 초원 (5, 5)", "진흙코 뿔소 사냥터로 이동", _travel_from_map.bind(MEADOW_LOCATION), _online_fighting())
		var gathered := int(_state().get("arcanaLife", {}).get("gatheredToday", 0))
		var gather_ready: bool = life._peaceful() and combat_socket.socket_ready and not life.sending and gathered < 3
		ui.choice("주변 재료 모으기", "오늘 채집 %d / 3회" % gathered, func():
			ui.close_panel()
			life._gather(), not gather_ready)
		if not world.uses_plaza_v2():
			ui.choice("내 집으로", "주방 · 침실 · 거실", open_home)
	if world.uses_plaza_v2():
		var building_details := {
			"arcana_inn": "마르텐 · 여관 의뢰판",
			"arcana_shop": "물품 사고팔기",
			"arcana_home": "분수 북동쪽 · 현관",
			"arcana_restaurant": "북서쪽 상점가 · 식당 입구",
			"arcana_academy": "동쪽 학교길 · 아카데미 정문",
		}
		for entity in world.entities:
			if entity.kind != "building" or not entity.get("auto_enter", false): continue
			var detail: String = building_details.get(entity.id, "건물 입구")
			ui.choice(entity.name, detail, func(): ui.close_panel(); world.interact_with(entity))
		ui.choice(_plaza_fishing_place(), "낚시 자리로 이동", _walk_to_plaza_water)
		var slime_home: Vector2 = world.layout.combat_home()
		ui.choice("슬라임 출몰지", "마르텐의 퇴치 의뢰", func(): ui.close_panel(); world.walk_to(slime_home))
		return
	ui.paragraph("북쪽의 귀환 포탈과 아카데미, 분수 주변의 상점과 여관, 남문 밖의 평원이 하나의 길로 이어집니다. 목적지를 고르면 그곳까지 걸어갑니다.", ui.MUTED)
	ui.choice("강둑으로 이동","도착 후 강물을 바라보세요.",func(): ui.close_panel(); world.walk_to(Vector2(480,580)))
	for entity in world._outdoor_entities:
		if entity.kind == "resident" or entity.kind == "city": continue
		var destination = entity.pos + (Vector2(0, 24) if entity.kind == "slime" else Vector2.ZERO)
		ui.choice(entity.name, "걸어가기 · 도착 후 살펴보기", func(): ui.close_panel(); world.walk_to(destination))

func _walk_to_plaza_water() -> Vector2:
	if ui.overlay.visible and not simplified_play.is_map_open(): ui.close_panel()
	_sync_world_input()
	var bank: Vector2 = world.walk_to_plaza_water()
	if not bank.is_finite(): ui.toast("현재 위치에서 걸어갈 수 있는 낚시 자리가 없습니다.")
	return bank

func _travel_from_map(target: String) -> void:
	ui.close_panel()
	if await _travel(target) and world.meadow_active and not simplified_play.enabled:
		_show_native_field_map()

func _show_native_field_map() -> void:
	panel_mode = "map"
	ui.open_tab_panel(CityGrid.PLACES.forest[1] if world.forest_active else CityGrid.PLACES.meadow[1])
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_SHOW_NEVER
	scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_SHOW_NEVER
	scroll.follow_focus = true
	var center := CenterContainer.new()
	center.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(center)
	var grid := CityGrid.new()
	center.add_child(grid)
	scroll.resized.connect(func(): grid.custom_minimum_size.x = minf(minf(scroll.size.x, 320.0), maxf(180.0, scroll.size.y)))
	grid.place_requested.connect(_choose_native_field_tile)
	ui.show_tab_body(scroll)
	_native_field_map = grid
	_refresh_native_field_map()

func _native_field_destinations() -> Dictionary:
	if busy or not combat_socket.socket_ready or _online_fighting(): return {}
	if world.forest_active:
		if life.sending: return {}
		var forest: Dictionary = CityGrid.forest_destinations()
		if not world.forest_tree_available("forest_trees"): forest.erase("forest_trees")
		return forest
	if world.meadow_active: return CityGrid.meadow_destinations(simplified_play.meadow_target_ready())
	return {}

func _refresh_native_field_map() -> void:
	if not is_instance_valid(_native_field_map) or not _native_field_map.is_inside_tree(): return
	if world.forest_active:
		var current := str(world.nearest.get("id", ""))
		_native_field_map.set_state(current, _native_field_destinations(), CityGrid.FOREST_AREA)
	elif world.meadow_active:
		var at_entrance: bool = world.player_position.distance_to(World.FIELD_ENTRY) < float(world.TILE) * 3.0
		var current := "meadow_entrance" if at_entrance else ""
		_native_field_map.set_state(current, _native_field_destinations(), CityGrid.MEADOW_AREA)

func _choose_native_field_tile(id: String) -> void:
	if not _native_field_destinations().has(id): return
	if id in ["meadow_entrance", "forest_entrance"]:
		await _travel_from_map("arcana_plaza")
	elif id == "forest_trees":
		for entity: Dictionary in world.entities:
			if entity.id == id:
				ui.close_panel()
				_sync_world_input()
				world.interact_with(entity)
				return
	elif id == "meadow_ox":
		var enemy: Vector2 = spatial_combat.enemy_position()
		var player: Vector2 = world.player_position
		var stand_off := float(world.TILE) * 2.0
		ui.close_panel()
		_sync_world_input()
		if player.distance_to(enemy) > stand_off:
			world.walk_to(enemy + enemy.direction_to(player) * stand_off)

func _local_map_choice(kind: String, label: String, detail: String) -> void:
	for entity in world.entities:
		if entity.kind != kind: continue
		if simplified_play.enabled:
			ui.choice(label, detail, simplified_play.select_room.bind(str(entity.id)))
			return
		var approach: Callable = world.walk_to.bind(entity.pos) if kind == "exit" else world.interact_with.bind(entity)
		ui.choice(label, detail, func(): ui.close_panel(); approach.call())
		return

func _item_master(item_id: String) -> Dictionary:
	for item in snapshot.get("arcanaItemCatalog", []):
		if item is Dictionary and str(item.get("id","")) == item_id: return item
	return {}

func _item_thumbnail(item_id: String) -> Texture2D:
	return ItemThumbnail.load_texture(_item_master(item_id).get("thumbnail", {}))

func _item_cards() -> Dictionary:
	var cards: Dictionary = {}
	for item in snapshot.get("itemCatalog", []): cards[item.id] = item
	for item in snapshot.get("inventoryCards", []): cards[item.id] = item
	for item in snapshot.get("arcanaItemCatalog", []):
		if item is Dictionary and item.get("definition") is Dictionary: cards[item.id] = item.definition
	return cards

func _open_home_storage() -> void:
	if not online_world or world.indoor != "arcana_home" or life.sending: return
	if not combat_socket.socket_ready:
		ui.toast("세계 서버에 연결한 뒤 다시 시도해 주세요.")
		return
	panel_mode = "home_storage"
	_home_storage_selection = ["", ""]
	_show_home_storage(0)

func _show_home_storage(tab: int) -> void:
	_home_storage_tab = tab
	var withdrawing := tab == 1
	var stock: Dictionary = _state().get("arcanaLife", {}).get("homeStorage", {}) if withdrawing else _state().get("inventory", {})
	var equipment: Dictionary = snapshot.get("arcanaEquipment", {})
	var equipped_items := equipment.values()
	var rod_equipped: bool = _state().get("flags", {}).get("arcana_life_tool", "") == "fishingRod"
	var cards := _item_cards()
	var entries: Array = []
	for key in stock:
		var item_id := str(key)
		var count := int(stock[key])
		if count <= 0 or (not withdrawing and item_id == "waterBottle"): continue
		var reserved := 0
		if not withdrawing:
			reserved = equipped_items.count(item_id)
			if item_id == "fishingRod" and rod_equipped: reserved += 1
		var available := maxi(0, count - reserved)
		var item: Dictionary = cards.get(item_id, {})
		entries.append({
			"id": item_id, "name": str(item.get("name", item_id)), "count": count,
			"thumbnail": _item_master(item_id).get("thumbnail", {}),
			"action_label": "꺼내기" if withdrawing else "넣기",
			"disabled": available == 0, "equipped": reserved > 0, "transfer_max": available,
			"hint": "장착 중인 %d개는 소지품에 남습니다." % reserved if reserved > 0 else "",
		})
	var tabs := [_show_home_storage.bind(0), _show_home_storage.bind(1)]
	ui.open_home_storage(entries, _home_storage_selection[tab], _transfer_home_storage.bind(tab), tabs, tab)
	ui.inventory_view.item_selected.connect(func(item_id: String): _home_storage_selection[tab] = item_id)

func _send_home_storage(action: Dictionary) -> bool:
	if simplified_play.selected_room() == "home_storage":
		action.textPlace = "home_storage"
	return await life.send(action)

func _transfer_home_storage(item_id: String, quantity: int, tab: int) -> void:
	if life.sending or busy or panel_mode != "home_storage": return
	var command := "life_storage_withdraw" if tab == 1 else "life_storage_deposit"
	var transferred := await _send_home_storage({"command":command, "itemId":item_id, "quantity":quantity})
	if not ui.overlay.visible: return
	if panel_mode == "home_storage":
		_show_home_storage(_home_storage_tab)
	elif transferred and panel_mode == "inventory":
		_inventory()

func _inventory() -> void:
	panel_mode = "inventory"
	var bag: Dictionary = _state().get("inventory", {})
	var cards := _item_cards()
	var entries: Array = []
	for key in bag:
		var item_id: String = str(key)
		if item_id == "waterBottle": continue
		var count: int = int(bag[key])
		if count <= 0: continue
		var item: Dictionary = cards.get(item_id, {"name":item_id,"description":"","kind":"material"})
		var entry: Dictionary = {"id":item_id,"name":str(item.name),"description":str(item.get("description","")),"kind":str(item.get("kind","material")),"count":count,"action_label":"","disabled":false,"equipped":false,"hint":""}
		var master := _item_master(item_id)
		entry.thumbnail = master.get("thumbnail", {})
		var wearable := str(master.get("equipmentSlot", ""))
		if online_world and life.CAMPFIRES.has(item_id):
			entry.action_label = "설치"
		elif online_world and item_id in ["treeBranch", "wood"]:
			entry.action_label = "제작"
			entry.hint = "나뭇가지 2개로 목재 3개를 만듭니다." if item_id == "treeBranch" else "목재 5개로 모닥불 1개를 만듭니다."
		elif online_world and life.MATERIAL_NAMES.has(item_id):
			entry.action_label = "요리"
			entry.hint = "이 재료로 만들 요리를 집 주방이나 야외 모닥불에서 준비합니다."
		elif online_world and life.FOODS.has(item_id):
			entry.action_label = "먹기"
			entry.disabled = int(_state().get("arcanaLife",{}).get("hunger",100)) >= 100
			entry.hint = "허기가 가득 차 있습니다." if entry.disabled else "허기 %d 회복" % int(life.FOODS[item_id])
		elif item_id == "fishingRod":
			entry.equipped = str(_state().get("flags",{}).get("arcana_life_tool","")) == "fishingRod"
			entry.action_label = "해제" if entry.equipped else "장착"
			entry.disabled = not online_world
			entry.hint = "온라인 월드에서 장착할 수 있습니다." if entry.disabled else "생활 도구 · 강을 바라보고 E 또는 상호작용"
		elif wearable not in ["", "lifeTool"]:
			var equipped: Dictionary = snapshot.get("arcanaEquipment", {})
			entry.equipped = item_id in equipped.values()
			entry.action_label = "장비 창"
		elif entry.kind in ["food", "drink", "medicine"]:
			entry.action_label = "사용"
		entries.append(entry)
	ui.open_inventory(entries, int(_state().get("money",0)), inventory_selected_id, _inventory_item_action, [_inventory, _equipment_menu])
	ui.inventory_view.item_selected.connect(func(item_id: String): inventory_selected_id = item_id)

func _inventory_item_action(item_id: String) -> void:
	if busy or int(_state().get("inventory",{}).get(item_id,0)) <= 0: return
	if online_world and life.CAMPFIRES.has(item_id):
		life.begin_placement(item_id)
		return
	if online_world and item_id in ["treeBranch", "wood"]:
		life.craft_menu(false, "lumber" if item_id == "treeBranch" else "campfire")
		return
	if online_world and life.MATERIAL_NAMES.has(item_id):
		prepare_cooking(item_id)
		return
	if online_world and life.FOODS.has(item_id):
		await life.eat(item_id)
		return
	if item_id == "fishingRod":
		await _set_life_tool(str(_state().get("flags",{}).get("arcana_life_tool","")) != "fishingRod", true)
		return
	var slot := str(_item_master(item_id).get("equipmentSlot", ""))
	if slot not in ["", "lifeTool"]:
		if slot == "ring":
			var equipped: Dictionary = snapshot.get("arcanaEquipment", {})
			slot = "ringRight" if equipped.get("ringRight") == item_id or (equipped.has("ringLeft") and not equipped.has("ringRight") and equipped.ringLeft != item_id) else "ringLeft"
		_equipment_menu(slot, item_id)
		return
	var action: Dictionary = {"type":"arcana_combat","command":"potion"} if item_id == "manaPotion" else {"type":"use_item","itemId":item_id}
	if item_id == "manaPotion" and not _battle().is_empty(): action.battleId = _battle().id
	if await perform(action, false): _inventory()

func prepare_fish() -> void:
	if int(_state().get("inventory", {}).get("riverFish", 0)) < 1:
		ui.toast("구울 민물고기가 없습니다.")
		return
	prepare_cooking("riverFish")

func prepare_cooking(ingredient_id: String) -> void:
	if busy or not online_world or life.blocking() or fishing.visible: return
	if world.indoor == "arcana_home":
		life.prefer_cooking_ingredient(ingredient_id)
		home_walk_to("home_kitchen")
		return
	var bag: Dictionary = _state().get("inventory", {})
	if not world.indoor.is_empty() or _online_fighting():
		ui.toast("전투를 마친 뒤 요리할 수 있습니다." if _online_fighting() else "집 주방이나 야외 모닥불로 가 주세요.")
		return
	if ui.overlay.visible: ui.close_panel()
	_sync_world_input()
	if not world.enabled:
		ui.toast("세계 서버에 연결한 뒤 다시 시도해 주세요.")
		return
	life.prefer_cooking_ingredient(ingredient_id)
	var fires: Array = world.entities.filter(func(entity): return entity.kind == "campfire")
	fires.sort_custom(func(a, b): return world.player_position.distance_squared_to(a.pos) < world.player_position.distance_squared_to(b.pos))
	for fire in fires:
		world.interact_with(fire)
		if ui.overlay.visible: return
		if world.clicked_interaction_id == str(fire.id):
			ui.toast("모닥불로 이동합니다.")
			return
	for item_id: String in life.CAMPFIRES:
		if int(bag.get(item_id, 0)) > 0:
			life.begin_placement(item_id, true)
			return
	life.craft_menu(true)

func _start_text_fishing() -> void:
	if simplified_play.at_fishing_place(): await _start_water_fishing(true)

func _start_water_fishing(text_pond: bool = false) -> void:
	if not world.enabled or busy or fishing.visible or life.blocking(): return
	if online_world and world.uses_plaza_v2():
		world.path.clear()
		if _state().get("flags", {}).get("arcana_life_tool", "") != "fishingRod":
			if not await _set_life_tool(true): return
		if not page_active or ui.overlay.visible: return
		if text_pond:
			if not simplified_play.at_fishing_place(): return
		else:
			if not world.bench_state.is_empty(): return
			var target: Dictionary = world.water_cast_target()
			if target.is_empty():
				ui.toast("물가에 조금 더 가까이 가 주세요.")
				return
			world.last_move_direction = world.player_position.direction_to(Vector2(target.x, target.y))
	fishing.begin()

func _set_life_tool(equip: bool, return_to_inventory: bool = false) -> bool:
	if busy or fishing.visible or life.blocking(): return false
	busy = true
	var result: Dictionary = await combat_socket.request({"command":"fishing_equip" if equip else "fishing_unequip"})
	busy = false
	if result.has("error"):
		ui.toast(str(result.get("message","장비를 바꾸지 못했습니다.")))
		return false
	_accept_online_result(result)
	if return_to_inventory: _inventory()
	return (_state().get("flags", {}).get("arcana_life_tool", "") == "fishingRod") == equip

func _equipment_menu(slot: String = "top", item: String = "") -> void:
	panel_mode = "equipment"
	ui.open_section_panel("장비 창", ["아이템", "장비"], 1, [_inventory, _equipment_menu], true)
	var equipment := EquipmentView.new()
	equipment.host = ui
	equipment.inventory = _state().get("inventory", {}).duplicate()
	equipment.equipped = snapshot.get("arcanaEquipment", EquipmentView.Appearance.DEFAULTS).duplicate()
	equipment.catalog = {}
	for card in snapshot.get("arcanaItemCatalog", []):
		if card is Dictionary:
			var kind := str(card.get("equipmentSlot", ""))
			if kind not in ["", "lifeTool"]:
				equipment.catalog[str(card.id)] = card
	equipment.selected_slot = slot
	equipment.selected_item = item
	equipment.online = online_world
	equipment.pending = busy
	equipment.request_change = _set_equipment
	_equipment_view = equipment
	ui.content.add_child(equipment)


func _sync_equipment(equipped: Dictionary) -> void:
	snapshot.arcanaEquipment = equipped
	if is_instance_valid(world_renderer) and is_instance_valid(world_renderer.hero):
		world_renderer.hero.set_equipment(equipped)
	if panel_mode == "equipment" and is_instance_valid(_equipment_view):
		_equipment_view.update_loadout(equipped, _state().get("inventory", {}))


func _set_equipment(slot: String, item: String) -> void:
	if busy or not online_world:
		return
	if fishing.visible or life.blocking() or _online_fighting():
		ui.toast("현재 행동을 마친 뒤 장비를 바꿔 주세요.")
		return
	busy = true
	var view := _equipment_view
	view.set_pending(true)
	var action := {"command": "equipment_set", "equipmentSlot": slot}
	if not item.is_empty():
		action.itemId = item
	var result: Dictionary = await combat_socket.request(action)
	busy = false
	if result.has("error"):
		ui.toast(str(result.get("message", "장비를 바꾸지 못했습니다.")))
	elif int(result.get("transportGeneration", -1)) == combat_socket.connection_generation:
		if not result.get("resync", false) and is_instance_valid(view) and view.selected_slot == slot:
			view.selected_item = ""
		_accept_online_result(result)
		if result.get("resync", false):
			ui.toast("현재 위치를 다시 확인했습니다. 장비를 다시 선택해 주세요.")
	if panel_mode == "equipment" and is_instance_valid(_equipment_view):
		_equipment_view.set_pending(false)
	_sync_world_input()


func _help() -> void:
	panel_mode = "help"
	ui.open_panel("도움말")
	ui.paragraph("이동과 대화", ui.GOLD)
	ui.paragraph("갈 곳을 누르거나 왼쪽 아래 조이스틱을 밀어 이동하세요. 키보드는 WASD와 방향키를 씁니다. 문이나 인물 앞에서는 상호작용 버튼 또는 E·Space를 누르세요.")
	ui.paragraph("화면과 전투", ui.GOLD)
	ui.paragraph("두 손가락이나 마우스 휠로 화면을 확대하고 축소합니다. 키보드는 +와 −로 조절하고 0으로 기본 배율을 복원합니다.")
	ui.paragraph("퀵슬롯은 숫자 1~4로도 쓸 수 있습니다. 파이어볼을 짧게 누르면 자동 조준합니다. 길게 끌어 조준한 뒤 손을 떼면 발사하고, 취소 영역에서 떼면 취소합니다. 슬라임이 도약할 때는 진행 방향을 피해 움직이세요.")
	ui.choice("스킬과 퀵슬롯", "주문 습득과 단축 슬롯 배치", _skills_menu)
	ui.paragraph("저장과 연결", ui.GOLD)
	ui.paragraph("메뉴를 열어도 온라인 세계의 시간은 흐릅니다. 모험은 자동 저장되며, 모험 메뉴에서 직접 저장할 수도 있습니다.")
	ui.choice("연결 기록 저장", "접속 문제를 확인할 최근 기록", _export_network_report)
	ui.choice("모험 메뉴로", "", _menu.bind("menu"))

func _save() -> bool:
	if busy: return false
	busy = true
	while clock_busy: await get_tree().process_frame
	await spatial_combat.before_action()
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
	_store(SAVE_KEY + "-position", JSON.stringify({"location":_state().get("location", ""), "x":world.player_position.x, "y":world.player_position.y, "academyFloor":world.academy_floor}))

func _save_and_home() -> void:
	if await _save(): _home()

func _home() -> void:
	if online_world:
		await _api("/api/arcana/leave",HTTPClient.METHOD_POST)
		online_world = false
	if OS.has_feature("web"): JavaScriptBridge.eval("location.href='/'")
	else: get_tree().quit()

func _fullscreen() -> void:
	if OS.has_feature("web"): JavaScriptBridge.eval("window.arcanaToggleFullscreen()")
	else:
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED if DisplayServer.window_get_mode() == DisplayServer.WINDOW_MODE_FULLSCREEN else DisplayServer.WINDOW_MODE_FULLSCREEN)
	if panel_mode != "settings": ui.close_panel()

func _confirm_new() -> void:
	ui.open_panel("새 모험을 시작할까요?")
	ui.paragraph("현재 모험의 이어가기 연결을 새 모험으로 바꿉니다. 홈 메뉴의 기존 텍스트 게임 저장은 유지됩니다.")
	ui.choice("현재 모험 계속하기", "", ui.close_panel)
	ui.choice("새 아르카나 모험 시작", "", _new_game)

func _new_game() -> void:
	if online_world:
		ui.toast("정식 계정은 하나의 캐릭터로 모험을 이어갑니다.")
		return
	# Explicit new game must not automatically attach an older shared save.
	busy = true
	var data = await _api("/api/games", HTTPClient.METHOD_POST, {"startAt":"arcana"})
	busy = false
	if not data.has("state"): ui.toast(data.get("message", "새 모험을 시작하지 못했습니다.")); return
	game_id = data.gameId
	saved_position = {}
	world.change_interior("")
	world.player_position = world.spawn_position
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

func _set_zoom_ratio(ratio: float) -> void:
	var maximum := maxf(WORLD_MIN_ZOOM_RATIO, world_renderer.maximum_zoom_ratio())
	var next_ratio := clampf(ratio, WORLD_MIN_ZOOM_RATIO, maximum)
	if is_equal_approx(next_ratio, _world_zoom_ratio):
		return
	_world_zoom_ratio = next_ratio
	_layout_world_display()
	_update_mei_nameplate()

func _change_zoom(factor: float) -> void:
	_set_zoom_ratio(_world_zoom_ratio * factor)

func _menu_zoom(factor: float) -> void:
	if factor == 0.0: _set_zoom_ratio(1.0)
	else: _change_zoom(factor)
	_environment_settings()

func _clear_zoom_touches() -> void:
	zoom_touches.clear()
	zoom_pinching = false
	zoom_distance = 0.0

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		_clear_zoom_touches()
		if is_instance_valid(home_furniture):
			home_furniture.end_drag()

func _input(event: InputEvent) -> void:
	if is_instance_valid(home_furniture) and home_furniture.active:
		if home_furniture.handle_drag_input(event):
			get_viewport().set_input_as_handled()
		return
	if (is_instance_valid(fishing) and fishing.visible) or (is_instance_valid(life) and life.blocking()): return
	if is_instance_valid(simplified_play) and simplified_play.enabled: return
	# Observe releases before GUI handling so a pinch cannot leave a stuck finger.
	if ui == null or not page_active or ui.overlay.visible or (busy and not gate_crossing):
		_clear_zoom_touches()
		return
	if event is InputEventScreenTouch:
		if not event.pressed:
			zoom_touches.erase(event.index)
			if zoom_pinching: get_viewport().set_input_as_handled()
			if zoom_touches.is_empty(): _clear_zoom_touches()
		elif zoom_pinching:
			# Ignore extra fingers until the original gesture has fully ended.
			get_viewport().set_input_as_handled()
	elif event is InputEventScreenDrag and zoom_touches.has(event.index):
		zoom_touches[event.index] = event.position
		if zoom_pinching:
			var points = zoom_touches.values()
			if points.size() >= 2:
				var distance = points[0].distance_to(points[1])
				if zoom_distance > 8.0 and distance > 8.0:
					_change_zoom(distance/zoom_distance)
				zoom_distance = distance
			get_viewport().set_input_as_handled()

func _unhandled_input(event: InputEvent) -> void:
	if is_instance_valid(home_furniture) and home_furniture.handle_input(event):
		get_viewport().set_input_as_handled()
		return
	if fishing.visible or life.blocking(): return
	if simplified_play.handle_map_input(event): return
	if not simplified_play.enabled and not ui.overlay.visible and (not busy or gate_crossing) and page_active:
		if event is InputEventScreenTouch and event.pressed:
			# Only unhandled world touches qualify: joystick/buttons keep their input.
			zoom_touches[event.index] = event.position
			if zoom_touches.size() >= 2:
				var points = zoom_touches.values()
				zoom_distance = points[0].distance_to(points[1])
				zoom_pinching = true
				world.path.clear()
				world.touch_direction = Vector2.ZERO
				get_viewport().set_input_as_handled()
				return
		elif event is InputEventMagnifyGesture:
			_change_zoom(event.factor)
			get_viewport().set_input_as_handled()
			return
		elif event is InputEventMouseButton and event.pressed:
			if event.button_index in [MOUSE_BUTTON_WHEEL_UP,MOUSE_BUTTON_WHEEL_DOWN]:
				var direction = 1.0 if event.button_index == MOUSE_BUTTON_WHEEL_UP else -1.0
				_change_zoom(pow(1.12,direction*event.factor))
				get_viewport().set_input_as_handled()
				return
		elif event is InputEventKey and event.pressed:
			if event.physical_keycode in [KEY_EQUAL,KEY_PLUS,KEY_KP_ADD,KEY_MINUS,KEY_KP_SUBTRACT,KEY_0,KEY_KP_0]:
				if event.physical_keycode in [KEY_0,KEY_KP_0]: _set_zoom_ratio(1.0)
				else: _change_zoom(1.0/1.12 if event.physical_keycode in [KEY_MINUS,KEY_KP_SUBTRACT] else 1.12)
				get_viewport().set_input_as_handled()
				return
	if event is InputEventKey and event.pressed and not event.echo:
		match event.physical_keycode:
			KEY_E, KEY_SPACE:
				if not ui.overlay.visible: _activate()
			KEY_1: _use_quickslot(0)
			KEY_2: _use_quickslot(1)
			KEY_3: _use_quickslot(2)
			KEY_4: _use_quickslot(3)
			KEY_I: _menu("inventory")
			KEY_M: _menu("map")
			KEY_J: _menu("quests")
			KEY_ESCAPE:
				if ui.overlay.visible and ui.close_button.visible: ui.close_panel()
				else: _menu("menu")
			KEY_F: _fullscreen()
	if simplified_play.enabled or ui.overlay.visible or (busy and not gate_crossing): return
	if ui.joystick.is_active(): return
	var position = Vector2.ZERO
	var tapped = false
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		position = event.position
		tapped = true
	elif event is InputEventScreenTouch and event.pressed:
		position = event.position
		tapped = true
	if tapped:
		if not gate_crossing and spatial_combat.select_at(position): return
		if get_viewport().get_visible_rect().has_point(position):
			var render_point := NativeWorld.display_to_raster(viewport_host, viewport.size, position)
			var object = world_renderer.pick_interaction(render_point)
			if not object.is_empty() and not gate_crossing and page_active and not spatial_combat.request_busy and spatial_combat.aim_owner == -1:
				world.interact_with(object)
				return
			var target = world_renderer.pick(render_point)
			if not gate_crossing and world.face_plaza_water_from_bank(target): return
			world.walk_to(target)

func _export_network_report() -> void:
	var report: Dictionary = combat_socket.network_report()
	if OS.has_feature("web"):
		JavaScriptBridge.eval("window.arcanaSaveNetworkReport("+JSON.stringify(report)+")")
	else:
		var output := FileAccess.open("user://arcana-network-report.json",FileAccess.WRITE)
		if output==null:
			ui.toast("기록을 저장하지 못했습니다.")
			return
		output.store_string(JSON.stringify(report,"  "))
	ui.toast("연결 기록을 저장했습니다.")

func _bridge_command(args: Array) -> void:
	if args.is_empty(): return
	var payload = JSON.parse_string(str(args[0]))
	if not payload is Dictionary: return
	match payload.get("command", ""):
		"focus":
			var active = bool(payload.get("active", true))
			if not active or active != page_active: ui.reset_touch_controls()
			if not active: spatial_combat.cancel_aim()
			var was_active: bool = page_active
			page_active = active
			if active and not was_active: combat_socket.resume()
			_sync_world_input()
			heartbeat = 1
		"network": combat_socket.network_changed(bool(payload.get("online",true)))
		"resume": combat_socket.resume()
		"network_report":
			if OS.has_feature("web"): JavaScriptBridge.eval("window.arcanaNetworkDiagnostics="+JSON.stringify(combat_socket.network_report()))
		"menu": _menu(payload.get("kind", "menu"))
		"interact": _activate()
		"move": _joystick_move(Vector2(float(payload.get("x", 0)), float(payload.get("y", 0))))
		"magic": _magic(payload.get("spell", "fireball"))
		"close": ui.close_panel()

func _bridge_state(_args: Array) -> void:
	var state = {"engine":"Godot 4.5.1", "renderer":"plaza_3d_v2" if world_renderer.uses_plaza_v2() else "native_2d", "zoomRatio":_world_zoom_ratio, "cameraZoom":world_renderer.camera.zoom.x, "walking":world.walking, "characterRendering":"skinned_pixel3d_v12" if world_renderer.hero.get_meta("model_outline", false) else "layered_pixel_sprite_8dir", "characterSourcePixels":HeroSpec.SOURCE_HEIGHT, "characterFrame":[world_renderer.hero.current_frame.x,world_renderer.hero.current_frame.y], "timing":frame_timing, "networkTiming":network_timing, "worldNetwork":combat_socket.diagnostics(), "motionNetwork":online_presence.diagnostics(), "renderWidth":viewport.size.x, "renderHeight":viewport.size.y, "coordinateSystem":"origin top-left; x right; y down; world pixels", "ready":not snapshot.is_empty(), "gameId":game_id, "clockClientId":client_id, "clockSequence":sequence, "busy":busy, "location":_state().get("location", ""), "interior":world.indoor, "academyFloor":world.academy_floor if world.indoor == "arcana_academy" else 0, "active":page_active, "walkingEnabled":world.enabled, "pathLength":world.path.size(), "player":{"x":world.player_position.x, "y":world.player_position.y}, "nearby":world.nearest.get("name", ""), "spatialCombat":{"selected":spatial_combat.selected,"aiming":spatial_combat.aim_owner != -1,"manual":spatial_combat.manual,"requestBusy":spatial_combat.request_busy,"transport":"websocket","socketReady":combat_socket.socket_ready,"inFlight":spatial_combat.in_flight,"pendingCommands":spatial_combat.queue.size(),"clockBusy":clock_busy,"canFireball":spatial_combat.can_cast("fireball"),"connectionLost":spatial_combat.connection_lost}, "stats":_combat(), "money":_state().get("money", 0), "inventory":_state().get("inventory", {}), "panel":panel_mode if ui.overlay.visible else "", "panelTitle":ui.panel_title.text, "actions":_visible_actions(), "academyMap":snapshot.get("academyMap"), "quests":snapshot.get("quests", []), "error":resume_error}
	if OS.has_feature("web"):
		if world_renderer.uses_forest_3d(): state.renderer = "pondside_forest_3d"
		JavaScriptBridge.eval("window.arcanaLatestState=" + JSON.stringify(state))

func _environment_settings(save_failed: bool = false) -> void:
	var previous_scroll: int = ui.panel_scroll.scroll_vertical if panel_mode == "settings" else 0
	panel_mode = "settings"
	ui.open_panel("화면 설정")
	ui.add_size_sliders(HUD_SIZE_MIN, MENU_SIZE_MIN, UI_SIZE_MAX)
	if simplified_play.enabled:
		ui.choice("전체 화면 전환", "단축키 F", _fullscreen)
		ui.choice("모험 메뉴로", "", _menu.bind("menu"))
		return
	ui.paragraph("월드 화면 배율  %d%%" % roundi(_world_zoom_ratio * 100), ui.GOLD)
	ui.section_tabs(["축소", "기본 배율", "확대"], -1, [_menu_zoom.bind(1.0 / 1.12), _menu_zoom.bind(0.0), _menu_zoom.bind(1.12)])
	ui.paragraph("2D 도트 크기  %d×%d" % [_screen_pixel_size, _screen_pixel_size], ui.GOLD)
	var selected := [2, 4].find(_screen_pixel_size)
	ui.section_tabs(["2×2", "4×4"], selected, [_set_screen_pixel_size.bind(2), _set_screen_pixel_size.bind(4)])
	if save_failed:
		ui.paragraph("설정을 저장하지 못했습니다. 이번 실행 동안 적용됩니다.", ui.MUTED)
	ui.choice("광장 조명", "해질녘 → 낮" if world.dusk else "낮 → 해질녘", func():
		world.set_art_state(not world.dusk, world.effects_enabled)
		_environment_settings())
	ui.choice("환경 효과", "켜짐 → 끄기" if world.effects_enabled else "꺼짐 → 켜기", func():
		world.set_art_state(world.dusk, not world.effects_enabled)
		_environment_settings())
	var show_upper: bool = world_renderer.show_home_upper_walls
	ui.choice("내 집 앞벽과 칸막이", "표시 중 · 숨기기" if show_upper else "숨김 · 표시하기", _set_home_upper_walls.bind(not show_upper))
	ui.choice("전체 화면 전환", "단축키 F", _fullscreen)
	ui.choice("모험 메뉴로", "", _menu.bind("menu"))
	if previous_scroll > 0:
		ui.panel_scroll.set_deferred("scroll_vertical", previous_scroll)

func _set_home_upper_walls(enabled: bool) -> void:
	world_renderer.show_home_upper_walls = enabled
	_store(HOME_UPPER_WALLS_KEY, "1" if enabled else "0")
	_environment_settings()

func _set_screen_pixel_size(value: int) -> void:
	_screen_pixel_size = value
	world_renderer.presentation_minimum = value
	_environment_settings(WorldDisplaySettings.save_pixel_size(value) != OK)

func _on_world_camera_updated() -> void:
	# The shared 3D lighting already applies the approved color bands.
	var presentation: Material = null if world_renderer.uses_approved_3d() else _world_presentation
	if viewport_host.material != presentation:
		viewport_host.material = presentation
	var render_pixel_size: int = world_renderer.presentation_pixel_size
	if _world_presentation.get_shader_parameter("pixel_size") != render_pixel_size:
		_world_presentation.set_shader_parameter("pixel_size", render_pixel_size)
	_layout_world_display()
	_update_mei_nameplate()

func _layout_world_display() -> void:
	var raster_size := Vector2(viewport.size)
	var screen_size := Vector2(_world_display_size)
	var base_pixel_size: int = world_renderer.presentation_pixel_size
	var zoom_ratio := 1.0 if is_instance_valid(home_furniture) and home_furniture.active else _world_zoom_ratio
	var pixel_size := base_pixel_size * zoom_ratio
	viewport_host.size = raster_size * pixel_size
	var residual: Vector2 = world_renderer.camera_texel_offset
	var camera_center := raster_size * 0.5 - residual
	var offset := screen_size * 0.5 - camera_center * pixel_size
	if zoom_ratio > 1.0:
		# Keep the player's screen position when cropping closer in a room.
		var anchor: Vector2 = world_renderer.screen_point(world.bench_visual_position(), NativeWorld.TileStyle.AVATAR_HEIGHT * 0.5)
		offset += (anchor - camera_center) * (base_pixel_size - pixel_size)
	var minimum_offset := (screen_size - viewport_host.size).ceil().min(Vector2.ZERO)
	_world_display.position = offset.round().clamp(minimum_offset, Vector2.ZERO) * _world_display.scale

func _controls_settings() -> void:
	panel_mode = "controls"
	ui.open_panel("조작 버튼 설정")
	var orientation: String = ui.controls_orientation()
	ui.paragraph(("가로" if orientation == "landscape" else "세로") + " 화면 설정 · 변경 즉시 적용되며 자동 저장됩니다. 가로·세로 화면은 따로 저장됩니다.")
	var entry: Dictionary = ui.controls_layout()
	ui.setting_slider("조작 버튼 전체 크기", 75, 200, 5, float(entry.get("scale", 1.25 if orientation == "landscape" else 1.0)) * 100, "%", func(value: float): _adjust_controls("scale", value / 100.0))
	ui.setting_slider("퀵슬롯 크기", ui.QUICKSLOT_SIZE_MIN * 100, ui.QUICKSLOT_SIZE_MAX * 100, 5, float(entry.get("quickslot_scale", 1.0)) * 100, "%", func(value: float): _adjust_controls("quickslot_scale", value / 100.0))
	ui.setting_slider("좌우 위치 · 왼쪽 ↔ 오른쪽", 0, 100, 1, float(entry.get("x", 1.0)) * 100, "%", func(value: float): _adjust_controls("x", value / 100.0))
	ui.setting_slider("상하 위치 · 위 ↔ 아래", 0, 100, 1, float(entry.get("y", 1.0)) * 100, "%", func(value: float): _adjust_controls("y", value / 100.0))
	ui.choice("현재 방향 기본값 복원", "크기와 위치를 처음 상태로 되돌립니다.", func():
		ui.reset_controls()
		_store(CONTROLS_KEY, JSON.stringify(ui.control_layouts))
		_controls_settings())
	ui.choice("적용한 배치 확인", "설정을 닫고 게임으로 돌아갑니다.", ui.close_panel)
	ui.choice("모험 메뉴로", "", _menu.bind("menu"))

func _adjust_controls(key: String, value: float) -> void:
	ui.adjust_controls(key, value)
	_store(CONTROLS_KEY, JSON.stringify(ui.control_layouts))

func _update_mei_nameplate() -> void:
	if not is_instance_valid(ui) or not is_instance_valid(world_renderer):return
	var shown=not snapshot.is_empty() and world.indoor.is_empty() and not world_renderer.uses_plaza_v2() and not ui.overlay.visible
	var point=Vector2.ZERO
	if shown:
		shown=false
		for entry in world_renderer.sprites:
			if entry.kind=="plaza-guide":
				var sprite: Sprite2D=entry.sprite
				# All approved Mei idle frames start at row 17 of the 136px sprite.
				var head=world_renderer.to_local(sprite.to_global(Vector2(0,sprite.offset.y+17.0)))
				point=world_renderer.screen_point(head/4.0)
				point=NativeWorld.raster_to_display(viewport_host, viewport.size, point)
				shown=true
				break
	ui.update_mei_nameplate(point,shown)
