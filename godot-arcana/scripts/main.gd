extends Node

const World = preload("res://scripts/world.gd")
const HeroSpec = preload("res://art/resources/heroine_reference_spec.gd")
const PixelWorld3D = preload("res://scripts/native_2d_world.gd")
const UI = preload("res://scripts/game_ui.gd")
const SpatialCombat = preload("res://scripts/native_2d_spatial.gd")
var spatial_combat
var combat_socket: Node
const SAVE_KEY = "arcana-godot-game-v1"
const SHARED_SAVE_KEY = "ruined-seoul-stage1-manual-save-game-id-v1"
const CONTROLS_KEY = "arcana-godot-controls-v1"
const QUICKSLOT_KEY = "arcana-godot-quickslots-v1"
var authored_layout: Node
var world
var world_renderer
var ui
var viewport: SubViewport
var viewport_host: TextureRect
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
# Gate travel serializes server actions, but never pauses outdoor locomotion.
var gate_crossing = false
var clock_busy = false
var origin = "http://localhost:3000"
var client_id = "godot-" + str(Time.get_ticks_usec()) + "-" + str(randi())
var sequence = 0
var heartbeat = 0.0
var clock_failures: int = 0
var clock_retry_at: int = 0
var last_clock_paused = true
var page_active = true
var panel_mode = ""
var action_page = 0
var bridge_callback
var state_callback
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
	add_child(viewport_host)
	viewport = SubViewport.new()
	viewport.disable_3d = true
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	viewport.canvas_item_default_texture_filter = Viewport.DEFAULT_CANVAS_ITEM_TEXTURE_FILTER_NEAREST
	add_child(viewport)
	viewport_host.texture = viewport.get_texture()
	# Sample the completed world texture directly; never read/write the same viewport.
	var world_palette = ShaderMaterial.new()
	world_palette.shader = preload("res://art/resources/pixel3d_palette.gdshader")
	world_palette.set_shader_parameter("palette_lut",preload("res://art/export/arcana-palette-lut.png"))
	viewport_host.material = world_palette
	world = World.new()
	world.layout = authored_layout
	if OS.has_feature("web"):
		world.reduced_motion = bool(JavaScriptBridge.eval("matchMedia('(prefers-reduced-motion: reduce)').matches"))
	viewport.add_child(world)
	world.hide()
	world.camera.enabled = false
	world_renderer = PixelWorld3D.new()
	world_renderer.world = world
	viewport.add_child(world_renderer)
	world_renderer.camera_updated.connect(_update_mei_nameplate)
	world.interacted.connect(_interact)
	world.building_entry_intended.connect(_auto_enter_building)
	ui = UI.new()
	add_child(ui)
	ui.restore_controls(JSON.parse_string(_stored(CONTROLS_KEY)))
	ui.menu_requested.connect(_menu)
	ui.interact_pressed.connect(_activate)
	ui.quickslot_pressed.connect(_use_quickslot)
	var slots = JSON.parse_string(_stored(QUICKSLOT_KEY))
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
	ui.move_changed.connect(_joystick_move)
	ui.panel_closed.connect(func(): panel_mode = ""; world.touch_direction = Vector2.ZERO; world.enabled = (not busy or gate_crossing) and page_active)
	if OS.has_feature("web"):
		origin = str(JavaScriptBridge.eval("location.origin"))
		bridge_callback = JavaScriptBridge.create_callback(_bridge_command)
		state_callback = JavaScriptBridge.create_callback(_bridge_state)
		var window = JavaScriptBridge.get_interface("window")
		window.arcanaGodotCommand = bridge_callback
		window.arcanaGodotState = state_callback
		JavaScriptBridge.eval("window.arcanaReady = true; window.dispatchEvent(new Event('arcana-ready'));")
	if OS.has_feature("web"):
		client_id = str(JavaScriptBridge.eval("globalThis.crypto?.randomUUID?.() || ('tab-'+Date.now()+'-'+Math.random().toString(36).slice(2))"))
	else:
		session_token = _stored("arcana-native-session")
	_resize()
	get_viewport().size_changed.connect(_resize)
	await _boot()

func _joystick_move(value: Vector2) -> void:
	# world.gd projects touch and keyboard together using the active view.
	world.touch_direction = value
	# Taking direct control cancels any click/map destination, including at center.
	if ui.joystick.is_active():
		world.clicked_interaction_id = ""
		world.path.clear()

func _toggle_camera_view() -> void:
	world_renderer.set_quarter_view(not world_renderer.quarter_view)
	ui.close_panel()

func _toggle_pixel_render() -> void:
	world_renderer.pixelated = not world_renderer.pixelated
	_resize()
	ui.close_panel()

func _resize() -> void:
	var size = get_viewport().get_visible_rect().size
	var stretch_scale = get_viewport().get_stretch_transform().get_scale()
	var physical = (size*stretch_scale).round()
	world_renderer.set_display_size(size)
	# Keep source texels when zooming out by using more of the physical screen.
	# At the native-resolution limit, further zoom changes only camera coverage.
	var source_pixel_scale = minf(stretch_scale.x, stretch_scale.y) * 2.0 * world_renderer.camera_zoom / world_renderer.CAMERA_ZOOM
	var divisor = maxi(1, int(floorf(source_pixel_scale))) if world_renderer.pixelated else 1
	# Integer nearest-neighbor presentation; odd sizes overscan by one pixel.
	viewport.size = Vector2i((physical/divisor).ceil()).max(Vector2i(2,2))
	viewport_host.position = Vector2.ZERO
	viewport_host.scale = Vector2.ONE/stretch_scale
	viewport_host.size = Vector2(viewport.size)*divisor
	viewport_host.material.set_shader_parameter("palette_enabled",world_renderer.pixelated)
	world._update_camera()
func _api(route: String, method: int = HTTPClient.METHOD_GET, data: Dictionary = {}) -> Dictionary:
	# Only reads may be replayed: a lost POST response can already be committed.
	var attempts: int = 3 if method == HTTPClient.METHOD_GET else 1
	var response: Dictionary = {}
	for attempt in range(attempts):
		if attempt > 0:
			await get_tree().create_timer(pow(2.0, attempt - 1) + randf() * 0.25).timeout
		response = await _api_once(route, method, data)
		if not response.get("retryable", false): return response
	return response

func _api_once(route: String, method: int, data: Dictionary) -> Dictionary:
	if OS.has_feature("web"): return await preload("res://scripts/browser_api.gd").request(self,route,method,data)
	var started_at: int = Time.get_ticks_msec()
	var req = HTTPRequest.new()
	req.timeout = 20 if method == HTTPClient.METHOD_GET or data.get("type", "") in ["world_clock", "arcana_combat"] else 65
	add_child(req)
	var headers = PackedStringArray(["Content-Type: application/json", "Accept: application/json"])
	headers.append("X-Arcana-Native: 1")
	if not session_token.is_empty(): headers.append("Authorization: Bearer "+session_token)
	var result = req.request(origin + route, headers, method, JSON.stringify(data) if method != HTTPClient.METHOD_GET else "")
	if result != OK:
		_record_network(started_at, 0, false)
		req.queue_free()
		return {"error":"network", "retryable":true, "message":"서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요."}
	var reply = await req.request_completed
	_record_network(started_at, int(reply[1]), reply[0] == HTTPRequest.RESULT_SUCCESS)
	req.queue_free()
	if reply[0] != HTTPRequest.RESULT_SUCCESS:
		return {"error":"network", "retryable":true, "message":"서버 응답을 받지 못했습니다. 행동이 처리되었을 수 있으니 진행을 확인해 주세요."}
	if int(reply[1]) in [502, 503, 504]:
		return {"error":"network", "retryable":true, "message":"서버 연결이 일시적으로 지연되고 있습니다. 잠시 후 다시 확인해 주세요."}
	var parsed = JSON.parse_string(reply[3].get_string_from_utf8())
	if not parsed is Dictionary:
		return {"error":"invalid_response", "message":"서버 응답을 읽지 못했습니다."}
	if reply[1] >= 400 and not parsed.has("error"): parsed.error = "request_failed"
	if parsed.has("error") and not parsed.has("message"):
		parsed.message = "서버가 행동을 거절했습니다: "+str(parsed.error)+" (HTTP "+str(reply[1])+")"
		push_warning(str(parsed.message)+" "+JSON.stringify(parsed.get("details",{})))
	return parsed

func _record_network(started_at: int, status: int, received: bool) -> void:
	var elapsed: float = float(Time.get_ticks_msec() - started_at)
	network_requests += 1
	if not received or status >= 400: network_failures += 1
	network_samples.append(elapsed)
	if network_samples.size() > 100: network_samples.pop_front()
	var ordered: Array[float] = network_samples.duplicate()
	ordered.sort()
	network_timing = {"requests":network_requests, "failures":network_failures, "lastMs":elapsed, "p95Ms":ordered[int((ordered.size()-1)*0.95)], "httpStatus":status, "windowSize":ordered.size()}

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
	if online_world: await _api("/api/arcana/leave",HTTPClient.METHOD_POST)
	if OS.has_feature("web"): JavaScriptBridge.eval("location.href='/account.html'")
	else: ui.toast("계정 연결은 웹 게임에서 이용해 주세요.")

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
	if notify_unlocks: _notify_spell_unlocks(previous_spells)
	var location = str(_state().get("location", "arcana_plaza"))
	# Online position packets may update snapshot.location before the HTTP reply.
	var expected_interior = location if location in ["arcana_shop","arcana_inn","arcana_restaurant","arcana_academy"] else ""
	if initial or location != old_location or world.indoor != expected_interior:
		if location in ["arcana_shop", "arcana_inn", "arcana_restaurant", "arcana_academy"]:
			world.change_interior(location)
			if initial:
				for entity in world._outdoor_entities:
					if entity.id == location: world.outside_position = entity.pos + Vector2(0, 7)
		elif world.indoor != "": world.change_interior("")
		if initial:
			if location == "arcana_hunting_ground": world.player_position = Vector2(576, 989)
			elif location == "arcana_city_gate": world.player_position = Vector2(576, 710)
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
		if world.player_position.distance_to(Vector2(600, 1054)) < 36:
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
	world.battle = _battle().duplicate(true)
	var enemy_hp = float(_battle().get("enemyHp", 30))
	if enemy_hp < previous_enemy_hp and not _battle().has("spatial"): world.effect("fireball", str(int(previous_enemy_hp - enemy_hp)))
	previous_enemy_hp = enemy_hp
	_update_hud()

func _update_hud() -> void:
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
	ui.zone_label.text = location_name
	var pending_money = spatial_combat.reward_effects.pending_money if is_instance_valid(spatial_combat.reward_effects) else 0
	ui.money_label.text = "%s골드" % maxi(0,int(_state().get("money",0))-int(pending_money))
	ui.hp_label.text = "HP  %d / %d" % [int(hp), max_hp]
	if float(c.get("guard",{}).get("amount",0)) > 0:
		ui.hp_label.text += " · 장막 %d" % int(c.guard.amount)
	ui.mp_label.text = "MP  %d / %d" % [int(mp), max_mp]
	ui.hp_bar.value = hp / max_hp * 100
	ui.mp_bar.value = mp / max_mp * 100

func _process(delta: float) -> void:
	_record_frame(delta)
	if not is_instance_valid(ui): return
	world.enabled = (not busy or gate_crossing) and not ui.overlay.visible and page_active and not snapshot.is_empty()
	ui.joystick.set_enabled(page_active and not ui.overlay.visible and not snapshot.is_empty())
	if world.enabled and ui.joystick.is_active(): _joystick_move(ui.joystick.direction)
	if snapshot.is_empty(): return
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
		for marker in get_tree().get_nodes_in_group("arcana_quest_markers"):
			marker.sync_quest(_state(),snapshot.get("quests",[]))
	if heartbeat >= 1.0 and not busy and not clock_busy and not spatial_combat.request_busy and not spatial_combat.connection_lost and spatial_combat.queue.is_empty() and spatial_combat.aim_owner == -1 and spatial_combat.pending_cast.is_empty() and spatial_combat.buffered_cast.is_empty() and not battle.has("spatial") and not spatial_combat.available():
		heartbeat = 0
		_clock()
	# Crossing the southern gate keeps position and commits the existing travel rule.
	if world.enabled and not busy and world.indoor == "" and battle.is_empty():
		var p = world.player_position
		var loc = str(_state().get("location", ""))
		if p.y > 793 and loc != "arcana_hunting_ground": _cross_gate(true)
		elif p.y < 781 and loc == "arcana_hunting_ground": _cross_gate(false)

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
	frame_timing = {"animationFps": snappedf((pose_count - previous_pose_updates) / frame_window, .1), "fps": snappedf(frame_samples.size() / frame_window, .1), "p95Ms": snappedf(frame_samples[int((frame_samples.size() - 1) * .95)], .1), "maxMs": snappedf(frame_samples[frame_samples.size() - 1], .1), "slowFrames": slow, "processMs": snappedf(Performance.get_monitor(Performance.TIME_PROCESS) * 1000.0, .1), "drawCalls": int(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME))}
	previous_pose_updates = pose_count
	frame_samples.clear()
	frame_window = 0.0

func _refresh_controls() -> void:
	var b = _battle()
	var fighting = b.get("phase", "") == "battle"
	var available = not busy and not ui.overlay.visible
	ui.interaction.disabled = not available or (world.nearest.is_empty() and world.bench_state.is_empty())
	var interaction_name = str(world.nearest.get("name","주변 사물과 상호작용"))
	if world.bench_pose_active(): interaction_name = "소파에서 일어나기" if world.bench_entity.get("kind","")=="inn_sofa" else "벤치에서 일어나기"
	elif world.bench_state=="approach": interaction_name = "앉으러 가기 취소"
	elif world.nearest.get("kind","") in ["bench","inn_sofa"]: interaction_name = "소파에 앉기" if world.nearest.kind=="inn_sofa" else "벤치에 앉기"
	ui.interaction.tooltip_text = "E / Space · " + interaction_name
	var cooldowns = _combat().get("cooldowns", {})
	for i in range(ui.quickslot_buttons.size()):
		var slot: Button = ui.quickslot_buttons[i]
		var command: String = ui.quickslot_bindings[i]
		var remaining = 0.0 if command == "teleport" else float(cooldowns.get(command, 0))
		var count = int(_state().get("inventory", {}).get("manaPotion", 0))
		slot.disabled = not available
		if not command.is_empty():
			slot.disabled = not available or remaining > .01 or (not fighting and command != "potion")
			var spell = _spell(command)
			if not spell.is_empty():
				slot.disabled = not available or not spell.get("unlocked",false) or not spell.get("equipped",false) or remaining > .01 or float(_combat().get("mp",0)) < float(spell.cost)
				if spatial_combat.available(): slot.disabled = not available or not spatial_combat.can_cast(command)
				elif command != "flame_guard" and not fighting: slot.disabled = true
				elif b.get("paused",false) and fighting: slot.disabled = true
				elif b.get("phase","") in ["victory","defeat"]: slot.disabled = true
			if command in ["dodge","teleport"]: slot.disabled = not spatial_combat.can_dash(command)
			if command == "potion" and count <= 0: slot.disabled = true
		if not world.bench_state.is_empty() and command!="dev_speed": slot.disabled = true
		if command == "dev_speed":
			slot.disabled = not developer_tools or not available
			remaining = 0.0
			ui.quickslot_labels[i].text = "가속 ON" if world.developer_speed_boost else "개발 가속"
			slot.tooltip_text = "개발자 전용 · 4: 이동 속도 3배 켜기/끄기 · 비용 없음"
			slot.set("accent",Color("3b9b8b") if world.developer_speed_boost else ui.MUTED)
		ui.quickslot_icons[i].modulate.a = .70 if slot.disabled else 1.0
		ui.quickslot_labels[i].modulate.a = .70 if slot.disabled else 1.0
		ui.quickslot_counts[i].text = "×3" if command=="dev_speed" and world.developer_speed_boost else str(count) if command == "potion" else ""
		# A shrinking outer ring conveys cooldown without a numeric countdown.
		ui.cooldown_bars[slot].visible = remaining > .01
		ui.cooldown_bars[slot].value = remaining / float(_spell(command).get("cooldown",5.0)) * 100
		if command != "dev_speed": slot.tooltip_text = "%d · %s" % [i + 1, _spell_hint(_spell(command)) if not _spell(command).is_empty() else ("재사용 대기 중" if remaining > .01 else ui.SLOT_NAMES[command])]

func _spell(command: String) -> Dictionary:
	for spell in snapshot.get("arcanaSpells",[]):
		if spell.id == command: return spell
	return {}

func _spell_hint(spell: Dictionary) -> String:
	if spell.get("parentSkill","")=="fireball": return "%s · 피해 %d · MP 30 · 재사용 60초" % [spell.name,int(spell.magnitude)]
	var effect = "4초간 보호막 %d" % int(spell.magnitude) if spell.targeting == "self" else "피해 %d" % int(spell.magnitude)
	if spell.targeting == "cone": effect = "전방 90도 · 2칸 · " + effect
	return "%s · %s · MP %d · 재사용 %d초%s" % [spell.name,effect,int(spell.cost),int(spell.cooldown),"" if spell.get("unlocked",false) else " · 스킬 탭에서 습득"]

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
	var paused = not page_active or ui.overlay.visible
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
	if online_world and action.get("type","") == "arcana_combat" and action.get("command","") in ["potion","flame_guard"]:
		return await _online_instant(str(action.command))
	if busy: return false
	var previous_combat = _combat().duplicate(true)
	var previous_battle_phase = previous_combat.battle.get("phase","") if previous_combat.get("battle") is Dictionary else ""
	var previous_mucus = int(_state().get("inventory",{}).get("slimeMucus",0))
	busy = true
	while clock_busy: await get_tree().process_frame
	if not await spatial_combat.before_action():
		busy = false
		ui.toast("서버에 다시 연결하고 있습니다. 잠시 후 이용해 주세요.")
		return false
	if not gate_crossing:
		world.touch_direction = Vector2.ZERO
		ui.toast("진행 중…")
	var data = await _api("/api/games/" + game_id + "/actions", HTTPClient.METHOD_POST, action)
	busy = false
	if not data.has("state"):
		ui.toast(data.get("message", "행동을 마치지 못했습니다. 진행을 확인해 주세요."))
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
	return await perform({"type":"travel", "targetId":target}, false)

func _cross_gate(outbound: bool) -> void:
	if busy or gate_crossing: return
	gate_crossing = true
	var arrived = await _travel("arcana_hunting_ground" if outbound else "arcana_plaza")
	gate_crossing = false
	if arrived:
		# Keep the live position/path: the player may have turned around while waiting.
		# The next frame commits a return crossing if they walked back through the gate.
		ui.toast("도시 앞 평원 · 슬라임의 흔적이 이어집니다." if outbound else "아르카나 · 분수 광장")
	elif (outbound and world.player_position.y > 793) or (not outbound and world.player_position.y < 781):
		# A rejected travel must leave the player on the server-confirmed side.
		world.player_position.y = 778 if outbound else 800
		world.path.clear()

func _activate() -> void:
	if busy: return
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
	if busy: return
	world.path.clear()
	match entity.kind:
		"merchant":
			_shop_menu()
		"innkeeper":
			_innkeeper_dialogue()
		"quest_board":
			_inn_quest_board()
		"bench":
			_sit_furniture(entity)
		"building":
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
			world.change_academy_floor(2 if world.academy_floor == 1 else 1)
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
		"resident":
			ui.open_panel(str(entity.get("name", "메이")))
			panel_mode = "resident"
			ui.paragraph("초록 망토를 두른 메이가 펼친 지도에서 분수를 짚습니다. “서쪽에는 상점과 여관, 북쪽에는 식당, 동쪽에는 아카데미가 있어요. 남문 밖 평원에는 슬라임이 나타나니 조심하세요.”")
			ui.choice("길을 이어 간다", "", ui.close_panel)
		_:
			_scene()

func _innkeeper_dialogue(topic: String = "welcome") -> void:
	if str(_state().get("location","")) != "arcana_inn": return
	panel_mode = "innkeeper"
	ui.open_panel("여관주인 · 마르텐")
	match topic:
		"inn":
			ui.paragraph("마르텐은 닦던 잔을 선반에 올리고 소파 쪽으로 손바닥을 펼칩니다.")
			ui.paragraph("“오래 걸으셨다면 저쪽에 앉아 쉬세요. 벽난로 가까운 자리가 따뜻합니다. 계단 앞은 다른 손님들도 다니니 짐을 놓지 말아 주세요.”")
		"directions":
			ui.paragraph("“분수 광장으로 나가시면 길을 찾기 쉬울 겁니다.” 마르텐이 문 너머를 가리킵니다.")
			ui.paragraph("“서쪽에는 상점, 동쪽에는 식당과 마법학교가 있어요. 남문 밖은 슬라임이 나타나는 평원입니다. 처음 가시는 길이면 준비부터 하고 나가세요.”")
		_:
			ui.paragraph("접수대 뒤의 남자가 접어 든 천을 내려놓습니다. 자주색 조끼에 달린 작은 초승달 장식이 등불을 받습니다.")
			ui.paragraph("“어서 오세요. 여관을 맡고 있는 마르텐입니다. 쉬어 가실 건가요, 아니면 길을 찾으세요?”")
	var quest_status = str(_state().get("quests",{}).get("arcana_inn_slimes","inactive"))
	var kills = mini(10,int(_state().get("flags",{}).get("arcana_inn_slime_kills",0)))
	if quest_status == "inactive":
		ui.paragraph("마르텐이 접수대 옆 게시판을 가리킵니다. “슬라임 퇴치 의뢰를 붙여 두었습니다. 맡으시려면 저쪽에서 확인해 주세요.”")
		ui.choice("퀘스트판을 확인한다", "슬라임 10마리 처치 · 보상 10골드", func(): ui.close_panel(); world.walk_to(preload("res://scripts/inn_lobby.gd").QUEST_BOARD_POINT))
	elif quest_status == "active":
		ui.paragraph("슬라임 퇴치 %d/10마리 · 보상 10골드" % kills,ui.GOLD)
		ui.choice("슬라임 퇴치를 보고한다", "10골드 수령", func(): _inn_slime_quest("claim_slime_quest"), kills < 10)
	else:
		ui.paragraph("마르텐이 고개를 숙입니다. “슬라임을 정리해 주셔서 고맙습니다.”")
	ui.choice("여관에 관해 묻는다", "", func(): _innkeeper_dialogue("inn"))
	ui.choice("주변 길을 묻는다", "", func(): _innkeeper_dialogue("directions"))
	ui.choice("여관 서비스를 이용한다", "", func(): _scene())
	ui.choice("대화를 마친다", "", ui.close_panel)

func _inn_quest_board() -> void:
	if world.indoor != "arcana_inn": return
	panel_mode = "quest_board"
	ui.open_panel("여관 퀘스트판")
	var status: String = str(_state().get("quests",{}).get("arcana_inn_slimes","inactive"))
	var kills: int = mini(10,int(_state().get("flags",{}).get("arcana_inn_slime_kills",0)))
	ui.paragraph("슬라임 퇴치 · 의뢰인 마르텐",ui.GOLD)
	ui.paragraph("남문 밖의 슬라임 10마리를 처치한 뒤 여관 주인에게 보고해 주세요. 보상은 10골드입니다.")
	if status == "inactive":
		ui.choice("의뢰를 받는다", "수락 후 처치부터 집계 · 0/10마리", func(): _inn_slime_quest("accept_slime_quest"))
	elif status == "active":
		ui.paragraph("진행 %d/10마리" % kills,ui.GOLD)
		ui.paragraph("마르텐에게 보고하고 10골드를 받으세요." if kills >= 10 else "의뢰를 받은 뒤 처치한 슬라임만 집계됩니다.")
	else:
		ui.paragraph("완료 · 보상 수령 완료",ui.MUTED)
	ui.choice("그만 본다", "", ui.close_panel)

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
	ui.open_shop(snapshot.get("availableActions", []), _state().get("inventory", {}), int(_state().get("money", 0)), selling, _shop_trade)

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
			if command == "retreat": world.player_position = Vector2(576, 910)
	else:
		await perform(action)

func _online_instant(command: String) -> bool:
	sequence += 1
	var result: Dictionary = await combat_socket.request({"type":"arcana_combat","command":command,"spatial":{"sequence":sequence}})
	if result.has("error"):
		ui.toast(str(result.get("message","사용하지 못했습니다.")))
		return false
	_accept_online_result(result)
	return true

func _accept_online_result(result: Dictionary) -> void:
	var update: Dictionary = online_presence.packet.duplicate(true)
	update.self = result
	update.revision = int(result.get("worldRevision",0))
	online_presence.accept(update)

func _magic(command: String) -> void:
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
		# The action path checks current readiness; the HUD refresh can be stale.
		_magic(ui.quickslot_bindings[index])

func _quickslots_menu() -> void:
	panel_mode = "quickslots"
	ui.open_panel("퀵슬롯 설정")
	ui.paragraph("슬롯을 골라 스킬이나 아이템을 배치하세요. 숫자 키 1~4로도 사용할 수 있습니다.", ui.MUTED)
	for i in range(4):
		ui.choice("슬롯 %d · %s" % [i + 1, ui.SLOT_NAMES[ui.quickslot_bindings[i]] if not ui.quickslot_bindings[i].is_empty() else "비어 있음"], "배치 변경", func(): _quickslot_picker(i))

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
	for entry in [["텔레포트", "teleport", "기본 마법 · 진행 방향으로 즉시 순간이동"], ["대시", "dodge", "기본 스킬 · 진행 방향으로 즉시 이동"], ["마나 포션", "potion", "아이템 · 보유 %d개" % int(_state().get("inventory", {}).get("manaPotion", 0))], ["비워 두기", "", "슬롯에서 해제"]]:
		ui.choice(entry[0], entry[2], func():
			_assign_quickslot(index,entry[1]))

func _assign_quickslot(index: int, command: String) -> void:
	if not _spell(command).is_empty() and not _spell(command).get("equipped",false):
		ui.toast("액티브 슬롯에 먼저 장착해 주세요.")
		return
	ui.set_quickslot(index,command)
	_store(QUICKSLOT_KEY,JSON.stringify(ui.quickslot_bindings))
	ui.close_panel()
	_refresh_controls()

func _skills_menu() -> void:
	panel_mode = "skills"
	ui.open_panel("스킬")
	ui.section_tabs(["스킬", "상태"], 0, [_skills_menu, _status_menu])
	ui.paragraph("액티브 6칸 · 패시브 2칸",ui.MUTED)
	ui.paragraph("모든 스킬을 배울 수 있으며, 장착한 전투 스킬만 사용할 수 있습니다.",ui.MUTED)
	ui.choice("장착 구성","주력 4칸 · 자유 2칸 · 패시브 2칸",_loadout_menu)
	var school = ""
	for spell in snapshot.get("arcanaSpells",[]):
		if spell.school != school:
			school = spell.school
			ui.paragraph(spell.schoolName+" 계열",ui.GOLD)
		var command: String = spell.id
		var status = "습득 완료" if spell.get("unlocked",false) else "배우기 가능" if spell.get("learnable",false) else "습득 조건 확인"
		if not spell.get("schoolUnlocked",true): status = spell.schoolName+" 계열 해금 필요"
		ui.choice(spell.name,status+(" · 파이어볼 궁극기" if spell.get("parentSkill","")=="fireball" else " · 스킬 레벨 %d" % int(spell.get("tree",{}).get("level",1)))+(" · 장착 중" if spell.get("equipped",false) else ""),func(): _skill_details(command),false,command)
	ui.paragraph("기본 기술",ui.GOLD)
	ui.choice("텔레포트","습득 완료 · 즉시 순간이동 · 0.3초 회피 · MP 0 · 재사용 0초",func(): _skill_slot_picker("teleport"),false,"teleport")
	ui.choice("대시","습득 완료 · 즉시 전방 이동 · 0.3초 회피 · 재사용 5초",func(): _skill_slot_picker("dodge"),false,"dodge")
	ui.choice("퀵슬롯 관리","배치 확인 · 교체 · 해제",_quickslots_menu)
	if developer_tools: ui.paragraph("개발자 전용 이동 가속은 4번 슬롯에 고정됩니다.",ui.MUTED)

func _status_menu() -> void:
	panel_mode = "skills"
	ui.open_panel("스킬 · 상태")
	ui.section_tabs(["스킬", "상태"], 1, [_skills_menu, _status_menu])
	var c = _combat()
	var stats: Dictionary = c
	ui.paragraph("현재 상태", ui.GOLD)
	ui.paragraph("HP  %d / %d\nMP  %d / %d" % [int(stats.get("hp", 0)), int(stats.get("maxHp", 100)), int(stats.get("mp", 0)), int(stats.get("maxMp", 30))])
	ui.paragraph("마나 회복  시간당 %s MP" % str(c.get("manaRegenPerHour", 12)))
	var guard: Dictionary = c.get("guard", {})
	ui.paragraph("보호막  %d · 남은 시간 %.1f초" % [int(guard.get("amount", 0)), float(guard.get("seconds", 0))] if float(guard.get("amount", 0)) > 0 else "보호막 없음", ui.MUTED)
	ui.paragraph("스킬 성장", ui.GOLD)
	for spell in snapshot.get("arcanaSpells", []):
		if spell.get("unlocked", false):
			ui.paragraph("%s · 스킬 레벨 %d%s" % [spell.name, int(spell.get("tree",{}).get("level",1)), " · 장착 중" if spell.get("equipped", false) else ""])
	ui.choice("장착 구성", "액티브 · 패시브 슬롯 확인", _loadout_menu)

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
		ui.choice("파이어볼 트리","",func(): _show_skill_tree("fireball"))
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
		ui.choice(label+" · "+str(_spell(id).get("name","비어 있음")),"장착 변경 · 해제",func(): _loadout_slot_picker(i))
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
		ui.choice(label+" · "+str(_spell(id).get("name","비어 있음")),"이 슬롯에 장착",func(): _equip_skill(i,command))
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
		var current = ui.SLOT_NAMES.get(ui.quickslot_bindings[i],"비어 있음") if not ui.quickslot_bindings[i].is_empty() else "비어 있음"
		ui.choice("%d번 · %s" % [i+1,current],"이 슬롯에 배치",func(): _assign_quickslot(index,command); _skills_menu())
	ui.choice("스킬 목록으로","",_skills_menu)

func _menu(kind: String) -> void:
	if busy or snapshot.is_empty(): return
	panel_mode = kind
	match kind:
		"skills": _skills_menu()
		"map": _map()
		"inventory": _inventory()
		"quests":
			var quests: Array = []
			for quest in snapshot.get("quests", []):
				if quest.id.begins_with("academy_") or quest.id == "arcana_inn_slimes": quests.append(quest)
			ui.open_quests(quests, func(): _menu("map"))
		"journal":
			_skills_menu()
		"menu":
			ui.open_panel("잠시 쉬어가기")
			ui.paragraph("아르카나 · 별빛의 도시", ui.GOLD)
			ui.choice("진행 저장", "현재 모험과 위치를 저장합니다.", _save)
			ui.choice("조작 버튼 설정", "버튼 영역 크기 · 좌우 · 상하 위치", _controls_settings)
			ui.choice("조작 방법", "터치와 키보드 안내", _help)
			ui.choice("스킬 관리", "스킬 습득 · 설명 · 퀵슬롯 배치", _skills_menu)
			ui.choice("전체 화면", "F · Esc로 해제", _fullscreen)
			ui.choice("화면 확대", "+ · 휠 위 / 두 손가락 벌리기", func(): _menu_zoom(1.12))
			ui.choice("화면 축소", "− · 휠 아래 / 두 손가락 모으기", func(): _menu_zoom(1.0/1.12))
			ui.choice("기본 화면 크기", "0 · 현재 %d%%" % roundi(world_renderer.get_zoom_ratio()*100), func(): _menu_zoom(0.0))
			ui.choice("낮 / 해질녘", "광장 빛 전환", func(): world.set_art_state(not world.dusk, world.effects_enabled); ui.close_panel())
			ui.choice("환경 효과 켜기 / 끄기", "기본 그림 보기", func(): world.set_art_state(world.dusk, not world.effects_enabled); ui.close_panel())
			ui.choice("홈으로", "저장한 뒤 홈 메뉴로 돌아갑니다.", _save_and_home)
			ui.choice("계정 · 캐릭터 등록", "이름 등록 · 카카오·구글 연결", _account)

func _map() -> void:
	ui.open_panel("아르카나 지도")
	var school = snapshot.get("academyMap")
	if school is Dictionary and world.indoor == "arcana_academy":
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
	panel_mode = "inventory"
	ui.open_panel("소지품")
	ui.section_tabs(["아이템", "장비"], 0, [_inventory, _equipment_menu])
	ui.paragraph("소지금 %d골드" % int(_state().get("money", 0)), ui.GOLD)
	var bag = _state().get("inventory", {})
	if bag.is_empty(): ui.paragraph("가방이 비어 있습니다.")
	for item in snapshot.get("inventoryCards", []):
		var count = int(bag.get(item.id, 0))
		if count <= 0: continue
		var action = {"type":"arcana_combat", "command":"potion"} if item.id == "manaPotion" else {"type":"use_item", "itemId":item.id}
		if item.id == "manaPotion" and not _battle().is_empty(): action.battleId = _battle().id
		var usable = item.kind in ["food", "drink", "medicine"]
		ui.choice("%s × %d" % [item.name, count], item.description, func():
			if await perform(action, false): _inventory(), not usable, "manaPotion" if item.id == "manaPotion" else "")

func _equipment_menu() -> void:
	panel_mode = "inventory"
	ui.open_panel("소지품 · 장비")
	ui.section_tabs(["아이템", "장비"], 1, [_inventory, _equipment_menu])
	var hero = world_renderer.hero
	var outfit: PackedStringArray = hero.outfit
	var portrait: Texture2D
	if hero.art.visible:
		var atlas = AtlasTexture.new()
		atlas.atlas = world_renderer.Hero.IDLE_ATLAS
		atlas.region = Rect2(0, 0, 96, 136)
		portrait = atlas
	else:
		portrait = hero.material.get_shader_parameter("avatar_texture")
	ui.character_portrait(portrait)
	ui.paragraph("현재 착용 장비", ui.GOLD)
	var names = {"dress":"상아색 드레스", "blouse":"블라우스", "skirt":"스커트", "shawl":"하늘색 숄", "boots-taupe":"토프색 부츠", "boots-navy":"남색 부츠"}
	var occupied: Dictionary = {}
	for item in outfit:
		for slot in world_renderer.Hero.LEGACY.ITEM_SLOTS.get(item, []):
			occupied[slot] = names.get(item, item)
	for entry in [["무기", "weapon"], ["머리", "head"], ["어깨", "shoulders"], ["상의", "top"], ["하의", "bottom"], ["발", "feet"], ["장신구", "accessory"]]:
		ui.paragraph("%s  ·  %s" % [entry[0], occupied.get(entry[1], "미착용")], ui.INK if occupied.has(entry[1]) else ui.MUTED)

func _help() -> void:
	ui.open_panel("조작 방법")
	ui.paragraph("화면 확대·축소: 마우스 휠, 두 손가락 벌리기·모으기, 키보드 +/−. 숫자 0으로 기본 크기로 돌아갑니다. 메뉴에서도 화면 크기를 바꿀 수 있습니다.")
	ui.paragraph("화면의 길을 누르면 장애물을 피해 걸어갑니다. 왼쪽 아래를 누른 채 밀면 그 자리에 나타나는 조이스틱으로 움직입니다. WASD·방향키도 사용할 수 있습니다.")
	ui.paragraph("문·인물·작업대 가까이에서 오른쪽 아래 상호작용 버튼 또는 E·Space를 누르세요. 학교 안에서도 각 공간으로 걸어가 상호작용할 수 있습니다.")
	ui.paragraph("상호작용 버튼 주위의 네 퀵슬롯은 숫자 키 1~4와 연결됩니다. 빈 슬롯을 누르거나 메뉴의 퀵슬롯 설정에서 불꽃·회피·마나 포션을 배치하세요. 배치는 다음 접속에도 유지됩니다.")
	ui.paragraph("광장 슬라임을 눌러 선택하세요. 불꽃을 짧게 누르면 자동 조준하고, 길게 누르거나 끌면 직접 조준하며 손을 떼면 발사합니다. 위쪽 취소 영역으로 끌면 취소합니다. 첫 명중 후에만 슬라임이 쫓아옵니다. 도약 경로에서 벗어나거나 회피로 몸통 박치기를 피하고, 슬라임과 멀어지면 추격이 끝납니다. 파이어볼은 MP 0·재사용 0초, 회피는 0.8초·재사용 5초입니다.")
	ui.paragraph("아르카나 세계는 메뉴를 열거나 다른 창으로 전환해도 계속 진행됩니다. 진행은 자동 저장되며 연결이 끊겨도 30초 안에 돌아오면 같은 자리에서 이어갑니다.")

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
	ui.close_panel()

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
	world_renderer.set_zoom_ratio(ratio)
	_resize()

func _change_zoom(factor: float) -> void:
	_set_zoom_ratio(world_renderer.get_zoom_ratio()*factor)

func _menu_zoom(factor: float) -> void:
	if factor == 0.0: _set_zoom_ratio(1.0)
	else: _change_zoom(factor)
	ui.close_panel()
	ui.toast("화면 크기 %d%%" % roundi(world_renderer.get_zoom_ratio()*100))

func _clear_zoom_touches() -> void:
	zoom_touches.clear()
	zoom_pinching = false
	zoom_distance = 0.0

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT: _clear_zoom_touches()

func _input(event: InputEvent) -> void:
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
	if not ui.overlay.visible and (not busy or gate_crossing) and page_active:
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
	if ui.overlay.visible or (busy and not gate_crossing): return
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
		var local = viewport_host.get_global_transform().affine_inverse() * position
		if Rect2(Vector2.ZERO, viewport_host.size).has_point(local):
			var render_point = local*Vector2(viewport.size)/viewport_host.size
			var object = world_renderer.pick_interaction(render_point)
			if not object.is_empty() and not gate_crossing and page_active and not spatial_combat.request_busy and spatial_combat.aim_owner == -1:
				world.interact_with(object)
				return
			var target = world_renderer.pick(render_point)
			world.walk_to(target)

func _bridge_command(args: Array) -> void:
	if args.is_empty(): return
	var payload = JSON.parse_string(str(args[0]))
	if not payload is Dictionary: return
	match payload.get("command", ""):
		"focus":
			var active = bool(payload.get("active", true))
			if not active or active != page_active: ui.reset_touch_controls()
			if not active: spatial_combat.cancel_aim()
			page_active = active
			world.enabled = page_active and (not busy or gate_crossing) and not ui.overlay.visible
			heartbeat = 1
		"menu": _menu(payload.get("kind", "menu"))
		"interact": _activate()
		"move": world.touch_direction = Vector2(float(payload.get("x", 0)), float(payload.get("y", 0)))
		"magic": _magic(payload.get("spell", "fireball"))
		"close": ui.close_panel()

func _bridge_state(_args: Array) -> void:
	var state = {"engine":"Godot 4.5.1", "renderer":"native_2d", "characterRendering":"layered_pixel_sprite_8dir", "characterSourcePixels":HeroSpec.SOURCE_HEIGHT, "characterFrame":[world_renderer.hero.current_frame.x,world_renderer.hero.current_frame.y], "timing":frame_timing, "networkTiming":network_timing, "renderWidth":viewport.size.x, "renderHeight":viewport.size.y, "coordinateSystem":"origin top-left; x right; y down; world pixels", "ready":not snapshot.is_empty(), "gameId":game_id, "clockClientId":client_id, "clockSequence":sequence, "busy":busy, "location":_state().get("location", ""), "interior":world.indoor, "academyFloor":world.academy_floor if world.indoor == "arcana_academy" else 0, "active":page_active, "walkingEnabled":world.enabled, "pathLength":world.path.size(), "player":{"x":world.player_position.x, "y":world.player_position.y}, "nearby":world.nearest.get("name", ""), "spatialCombat":{"selected":spatial_combat.selected,"aiming":spatial_combat.aim_owner != -1,"manual":spatial_combat.manual,"requestBusy":spatial_combat.request_busy,"transport":"websocket","socketReady":combat_socket.socket_ready,"inFlight":spatial_combat.in_flight,"pendingCommands":spatial_combat.queue.size(),"clockBusy":clock_busy,"canFireball":spatial_combat.can_cast("fireball"),"connectionLost":spatial_combat.connection_lost}, "stats":_combat(), "money":_state().get("money", 0), "inventory":_state().get("inventory", {}), "panel":panel_mode if ui.overlay.visible else "", "panelTitle":ui.panel_title.text, "actions":_visible_actions(), "academyMap":snapshot.get("academyMap"), "quests":snapshot.get("quests", []), "error":resume_error}
	if OS.has_feature("web"):
		JavaScriptBridge.eval("window.arcanaLatestState=" + JSON.stringify(state))

func _controls_settings() -> void:
	panel_mode = "controls"
	ui.open_panel("조작 버튼 설정")
	var orientation: String = ui.controls_orientation()
	ui.paragraph(("가로" if orientation == "landscape" else "세로") + " 화면 설정 · 변경 즉시 적용되며 자동 저장됩니다. 가로·세로 화면은 따로 저장됩니다.")
	var entry: Dictionary = ui.controls_layout()
	ui.setting_slider("크기", 75, 200, 5, float(entry.get("scale", 1.25 if orientation == "landscape" else 1.0)) * 100, "%", func(value: float): _adjust_controls("scale", value / 100.0))
	ui.setting_slider("좌우 위치 · 왼쪽 ↔ 오른쪽", 0, 100, 1, float(entry.get("x", 1.0)) * 100, "%", func(value: float): _adjust_controls("x", value / 100.0))
	ui.setting_slider("상하 위치 · 위 ↔ 아래", 0, 100, 1, float(entry.get("y", 1.0)) * 100, "%", func(value: float): _adjust_controls("y", value / 100.0))
	ui.choice("현재 방향 기본값 복원", "크기와 위치를 처음 상태로 되돌립니다.", func():
		ui.reset_controls()
		_store(CONTROLS_KEY, JSON.stringify(ui.control_layouts))
		_controls_settings())
	ui.choice("적용한 배치 확인", "설정을 닫고 게임으로 돌아갑니다.", ui.close_panel)

func _adjust_controls(key: String, value: float) -> void:
	ui.adjust_controls(key, value)
	_store(CONTROLS_KEY, JSON.stringify(ui.control_layouts))

func _update_mei_nameplate() -> void:
	if not is_instance_valid(ui) or not is_instance_valid(world_renderer):return
	var shown=not snapshot.is_empty() and world.indoor.is_empty()
	var point=Vector2.ZERO
	if shown:
		for entry in world_renderer.sprites:
			if entry.kind=="plaza-guide":
				var logical=entry.anchor/4.0
				point=world_renderer.screen_point(logical,2.1)
				point=viewport_host.position+point*viewport_host.size/Vector2(viewport.size)*viewport_host.scale
				break
	ui.update_mei_nameplate(point,shown)
