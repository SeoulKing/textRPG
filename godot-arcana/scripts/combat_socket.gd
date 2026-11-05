extends Node
## One world connection carries presence, input acknowledgements and shared combat.
const MAX_PENDING: int = 6
const MAX_PRESENCE_PENDING: int = 2
var main: Node
var peer: WebSocketPeer
var pending: Dictionary = {}
var next_id: int = 0
var input_sequence: int = 0
var connected_game: String = ""
var socket_ready: bool = false
var retry_at: int = 0
var failures: int = 0
var connecting_at: int = 0
var timer: float = 0.0
var reconnecting: bool = false
var blocked: bool = false
var network_available: bool = true
var connection_generation: int = 0
var last_received_at: int = 0
var rtt_ms: float = 100.0
var rtt_jitter_ms: float = 0.0
var reconnect_count: int = 0
var connection_label: Label
const NetworkTrace = preload("res://scripts/network_diagnostics.gd")
var network_trace = NetworkTrace.new()

func _ready() -> void:
	if OS.has_feature("web"): network_available = bool(JavaScriptBridge.eval("navigator.onLine !== false"))
	connection_label = Label.new()
	connection_label.text = "연결을 복구하고 있습니다…"
	connection_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	connection_label.add_theme_font_size_override("font_size",13)
	connection_label.add_theme_color_override("font_color",Color("f1dba6"))
	connection_label.add_theme_color_override("font_shadow_color",Color("142e33"))
	connection_label.add_theme_constant_override("shadow_offset_y",1)
	connection_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	main.ui.root.add_child(connection_label)
	connection_label.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	connection_label.offset_top = 112
	connection_label.offset_bottom = 136
	connection_label.hide()

func _failure(message: String) -> Dictionary:
	return {"error":"network","message":message,"transportGeneration":connection_generation}

func _disconnect(message: String) -> void:
	if socket_ready or not pending.is_empty():
		network_trace.event("disconnect",connection_status())
		network_trace.preserve_incident(main)
	socket_ready = false
	connection_generation += 1
	reconnecting = false
	if peer != null: peer.close()
	peer = null
	for entry in pending.values():
		entry.response = _failure(message)
		entry.response.transportGeneration = int(entry.generation)
	pending.clear()
	if is_instance_valid(main.spatial_combat): main.spatial_combat.network_interrupted()
	if is_instance_valid(main.online_presence): main.online_presence.reset_prediction()
	main.world.path.clear()
	main.world.touch_direction = Vector2.ZERO
	main.ui.reset_touch_controls()
	failures = mini(failures+1,5)
	retry_at = Time.get_ticks_msec()+int(minf(8000,500*pow(2,failures-1)))+randi_range(0,250)

func network_changed(available: bool) -> void:
	if available==network_available: return
	network_available = available
	network_trace.event("online" if available else "offline")
	if not main.online_world or blocked: return
	if not available:
		_disconnect("통신 연결이 끊겼습니다. 복구되면 자동으로 다시 연결합니다.")
	else:
		failures = 0
		retry_at = 0

func resume() -> void:
	if not main.online_world or blocked: return
	network_trace.event("resume")
	network_trace.last_received_at = 0
	network_trace.last_world_at = 0
	if OS.has_feature("web"): network_changed(bool(JavaScriptBridge.eval("navigator.onLine !== false")))
	if not network_available: return
	timer = .1
	if socket_ready and Time.get_ticks_msec()-last_received_at>_silence_timeout():
		_disconnect("서버 상태를 다시 확인하고 있습니다.")
	if peer==null: retry_at = 0

func _silence_timeout() -> int:
	return int(clampf(rtt_ms*6+rtt_jitter_ms*4,2500,8000))

func connection_status() -> Dictionary:
	return {"ready":socket_ready,"online":network_available,"rttMs":roundi(rtt_ms),"jitterMs":roundi(rtt_jitter_ms),"silenceMs":Time.get_ticks_msec()-last_received_at if last_received_at>0 else 0,"pending":pending.size(),"reconnections":maxi(0,reconnect_count-1)}

func diagnostics() -> Dictionary:
	var value: Dictionary = connection_status()
	value.merge(network_trace.diagnostics())
	return value

func network_report() -> Dictionary:
	return network_trace.report(main)

func _rejoin() -> void:
	reconnecting = true
	var generation: int = connection_generation
	var joined: Dictionary = await main._api("/api/arcana/join",HTTPClient.METHOD_POST,{"controller":main.client_id},8.0)
	# An offline event, reset or newer recovery can supersede this HTTP response.
	if generation!=connection_generation: return
	reconnecting = false
	if joined.has("error"):
		_disconnect(str(joined.get("message","서버에 다시 연결하고 있습니다.")))
		if joined.get("error","") in ["already_connected","auth_required","access_restricted"]:
			blocked = true
			main._online_error(joined)
		return
	main.online_presence.reset_stream()
	if joined.get("snapshot") is Dictionary:
		main._apply(joined.snapshot)
		if joined.get("position") is Dictionary:
			main.world.cancel_dash()
			main.world.cancel_teleport()
			main.world.player_position = main.world.nearest_walkable(Vector2(float(joined.position.x),float(joined.position.y)))
			main.world.path.clear()
	main.online_presence.accept(joined.world)
	_open()

func _open() -> void:
	network_trace.event("connect_attempt")
	peer = WebSocketPeer.new()
	peer.inbound_buffer_size = 1024*1024
	peer.outbound_buffer_size = 64*1024
	peer.max_queued_packets = 64
	if not OS.has_feature("web"):
		peer.handshake_headers = PackedStringArray(["X-Arcana-Native: 1","Authorization: Bearer "+main.session_token])
	connecting_at = Time.get_ticks_msec()
	var url: String = str(main.origin).replace("https://","wss://").replace("http://","ws://")+"/api/arcana/worlds/main/ws?controller="+main.client_id.uri_encode()+"&protocol=3"
	if peer.connect_to_url(url) != OK: _disconnect("아르카나 세계에 연결하지 못했습니다.")

func _process(delta: float) -> void:
	network_trace.tick(main)
	if is_instance_valid(connection_label):
		connection_label.visible = main.online_world and not blocked and not socket_ready and not main.ui.overlay.visible and (failures>0 or not network_available)
	if main.game_id.is_empty() or not main.online_world or blocked: return
	if main.game_id != connected_game:
		_disconnect("입장할 캐릭터가 변경되었습니다.")
		connected_game = main.game_id
		failures = 0
		retry_at = 0
	if not network_available: return
	if peer == null:
		if not reconnecting and Time.get_ticks_msec()>=retry_at: _rejoin()
		return
	peer.poll()
	if peer.get_ready_state() == WebSocketPeer.STATE_CLOSED:
		var code: int = peer.get_close_code()
		network_trace.event("socket_closed",{"code":code})
		_disconnect("연결이 끊겼습니다. 다시 연결하고 있습니다.")
		if code in [4001,4003]:
			blocked = true
			main._online_error({"error":"connection_replaced","message":"다른 기기로 접속했거나 로그아웃했습니다."})
		return
	if not socket_ready and Time.get_ticks_msec()-connecting_at>10000:
		_disconnect("서버 연결이 지연되고 있습니다.")
		return
	while peer != null and peer.get_available_packet_count()>0:
		var packet_bytes: PackedByteArray = peer.get_packet()
		var parse_started: int = Time.get_ticks_usec()
		var packet: Variant = JSON.parse_string(packet_bytes.get_string_from_utf8())
		var parse_ms: float = float(Time.get_ticks_usec()-parse_started)/1000.0
		if not packet is Dictionary:
			_disconnect("세계 응답을 읽지 못했습니다.")
			return
		last_received_at = Time.get_ticks_msec()
		network_trace.receive(packet_bytes.size(),parse_ms,packet.get("world") is Dictionary,packet.get("network",{}),main.page_active)
		var apply_started: int = Time.get_ticks_usec()
		if packet.get("ready",false) and packet.get("protocol",0)==3:
			socket_ready = true
			failures = 0
			timer = .1
			reconnect_count += 1
			main.spatial_combat.connection_lost = false
			main.spatial_combat.connection_failures = 0
			main.spatial_combat.failed_at = -100.0
		if packet.get("world") is Dictionary: main.online_presence.accept(packet.world)
		if packet.has("id") and pending.has(int(packet.id)):
			var entry: Dictionary = pending[int(packet.id)]
			var elapsed: float = float(last_received_at-int(entry.started))
			rtt_jitter_ms = lerpf(rtt_jitter_ms,absf(elapsed-rtt_ms),.2)
			rtt_ms = lerpf(rtt_ms,elapsed,.2)
			network_trace.acknowledgement(elapsed,float(packet.get("serverTiming",{}).get("processingMs",0)),float(packet.get("deliveryTiming",{}).get("queueMs",0)))
			entry.response = packet.get("result",{})
			entry.response.transportGeneration = int(entry.generation)
			pending.erase(int(packet.id))
		network_trace.record("applyMs",float(Time.get_ticks_usec()-apply_started)/1000.0)
	if socket_ready and main.page_active and Time.get_ticks_msec()-last_received_at>_silence_timeout():
		_disconnect("서버 응답이 지연되어 다시 연결하고 있습니다.")
		return
	timer += minf(delta,.1)
	var presence_pending: int = 0
	for entry in pending.values():
		if entry.presence: presence_pending += 1
		if Time.get_ticks_msec()-int(entry.started)>int(clampf(rtt_ms*8+rtt_jitter_ms*4,5000,10000)):
			_disconnect("세계 서버의 응답을 받지 못했습니다.")
			return
	# Sample the latest position only when a slot is free; never queue old positions.
	# Presence has its own cap, leaving room for combat input during a slow round trip.
	if socket_ready and timer>=.1 and presence_pending<MAX_PRESENCE_PENDING and pending.size()<MAX_PENDING:
		timer = 0
		_presence()

func _input_data() -> Dictionary:
	return {"placeRevision":int(main.snapshot.get("onlinePlaceRevision",0)),"developerSpeed":main.developer_tools and main.world.developer_speed_boost,"position":{"x":main.world.player_position.x,"y":main.world.player_position.y},"direction":{"x":main.world.last_move_direction.x,"y":main.world.last_move_direction.y},"bench":main.world.bench_state,"gait":main.world.player_gait,"floor":main.world.academy_floor if main.world.indoor=="arcana_academy" else 0}

func _presence() -> void:
	var generation: int = connection_generation
	var result: Dictionary = await _send({} if main.busy else _input_data(),true)
	if generation==connection_generation and result.get("resync",false): main._accept_online_result(result)

func _send(input: Dictionary, presence: bool = false) -> Dictionary:
	if not socket_ready or peer == null: return _failure("세계 서버에 연결 중입니다.")
	if pending.size()>=MAX_PENDING: return {"error":"input_busy","transportGeneration":connection_generation}
	next_id += 1
	input_sequence += 1
	input.sequence = input_sequence
	main.online_presence.record_input(input_sequence,input)
	var id: int = next_id
	var entry: Dictionary = {"started":Time.get_ticks_msec(),"generation":connection_generation,"presence":presence}
	pending[id] = entry
	if peer.send_text(JSON.stringify({"id":id,"input":input})) != OK: _disconnect("입력을 보내지 못했습니다.")
	while not entry.has("response"): await get_tree().process_frame
	return entry.response

func synchronize() -> bool:
	if not socket_ready or pending.size()>=MAX_PENDING: return false
	var generation: int = connection_generation
	var result: Dictionary = await _send(_input_data())
	if generation!=connection_generation: return false
	if result.get("resync",false): main._accept_online_result(result)
	return not result.has("error")

func request(action: Dictionary) -> Dictionary:
	# Combat inputs expire at their source. Never hold an old attack for a new connection.
	if not socket_ready: return _failure("서버에 다시 연결하고 있습니다. 잠시 후 이용해 주세요.")
	if pending.size()>=MAX_PENDING: return {"error":"input_busy","message":"앞선 입력을 처리하고 있습니다.","transportGeneration":connection_generation}
	var input: Dictionary = _input_data()
	var spatial: Dictionary = action.get("spatial",{})
	input.command = str(action.get("command","spatial_sync"))
	input.actionId = str(action.get("actionId",main._new_action_id()))
	if spatial.has("position"): input.position = spatial.position
	if spatial.has("aim"): input.aim = spatial.aim
	if spatial.has("target"): input.target = spatial.target
	for key in ["itemId","campfireId","recipeId","target"]:
		if action.has(key): input[key] = action[key]
	var result: Dictionary = await _send(input)
	if result.has("spatialCombat"):
		result.acceptedInput = result.get("sequence",-1)
		result.sequence = spatial.get("sequence",0)
	return result

func reset() -> void:
	_disconnect("접속 상태를 새로 확인합니다.")
	blocked = false
	connected_game = main.game_id
	failures = 0
	retry_at = 0
	main.online_presence.reset_prediction()
	if main.online_world and network_available: _open()

func _exit_tree() -> void:
	if peer != null: peer.close()
	if is_instance_valid(connection_label): connection_label.queue_free()
