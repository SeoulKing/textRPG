extends Node
## One world connection carries presence, input acknowledgements and shared combat.
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

func _failure(message: String) -> Dictionary:
	return {"error":"network","message":message}

func _disconnect(message: String) -> void:
	socket_ready = false
	if is_instance_valid(main.spatial_combat): main.spatial_combat.connection_lost = true
	if peer != null: peer.close()
	peer = null
	for entry in pending.values(): entry.response = _failure(message)
	pending.clear()
	failures = mini(failures+1,5)
	retry_at = Time.get_ticks_msec()+int(minf(30000,500*pow(2,failures)))+randi_range(0,250)

func _rejoin() -> void:
	reconnecting = true
	var joined: Dictionary = await main._api("/api/arcana/join",HTTPClient.METHOD_POST,{"controller":main.client_id})
	reconnecting = false
	if joined.has("error"):
		retry_at = Time.get_ticks_msec()+3000
		if joined.get("error","") in ["already_connected","auth_required","access_restricted"]:
			blocked = true
			main._online_error(joined)
		return
	if joined.get("snapshot") is Dictionary:
		main._apply(joined.snapshot)
		if joined.get("position") is Dictionary:
			main.world.player_position = main.world.nearest_walkable(Vector2(float(joined.position.x),float(joined.position.y)))
			main.world.path.clear()
	main.online_presence.revision = -1
	main.online_presence.accept(joined.world)
	_open()

func _open() -> void:
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
	if main.game_id.is_empty() or not main.online_world or blocked: return
	if main.game_id != connected_game:
		_disconnect("입장할 캐릭터가 변경되었습니다.")
		connected_game = main.game_id
		retry_at = 0
	if peer == null:
		if not reconnecting and Time.get_ticks_msec()>=retry_at: _rejoin()
		return
	peer.poll()
	if peer.get_ready_state() == WebSocketPeer.STATE_CLOSED:
		var code: int = peer.get_close_code()
		_disconnect("연결이 끊겼습니다. 다시 연결하고 있습니다.")
		if code in [4001,4003]:
			blocked = true
			main._online_error({"error":"connection_replaced","message":"다른 기기로 접속했거나 로그아웃했습니다."})
		return
	if not socket_ready and Time.get_ticks_msec()-connecting_at>10000:
		_disconnect("서버 연결이 지연되고 있습니다.")
		return
	while peer != null and peer.get_available_packet_count()>0:
		var packet: Variant = JSON.parse_string(peer.get_packet().get_string_from_utf8())
		if not packet is Dictionary:
			_disconnect("세계 응답을 읽지 못했습니다.")
			return
		if packet.get("ready",false) and packet.get("protocol",0)==3:
			socket_ready = true
			failures = 0
			main.spatial_combat.connection_lost = false
		if packet.get("world") is Dictionary: main.online_presence.accept(packet.world)
		if packet.has("id") and pending.has(int(packet.id)):
			pending[int(packet.id)].response = packet.get("result",{})
			pending.erase(int(packet.id))
	timer += delta
	if socket_ready and timer>=.1 and pending.size()<2:
		timer = 0
		_presence()
	for entry in pending.values():
		if Time.get_ticks_msec()-int(entry.started)>15000:
			_disconnect("세계 서버의 응답을 받지 못했습니다.")
			return

func _input_data() -> Dictionary:
	return {"placeRevision":int(main.snapshot.get("onlinePlaceRevision",0)),"developerSpeed":main.developer_tools and main.world.developer_speed_boost,"position":{"x":main.world.player_position.x,"y":main.world.player_position.y},"direction":{"x":main.world.last_move_direction.x,"y":main.world.last_move_direction.y},"bench":main.world.bench_state,"gait":main.world.player_gait,"floor":main.world.academy_floor if main.world.indoor=="arcana_academy" else 0}

func _presence() -> void:
	var result: Dictionary = await _send({} if main.busy else _input_data())
	if result.get("resync",false): main._accept_online_result(result)
	if result.has("error") and result.error not in ["network"]: return

func _send(input: Dictionary) -> Dictionary:
	if not socket_ready or peer == null: return _failure("세계 서버에 연결 중입니다.")
	next_id += 1
	input_sequence += 1
	input.sequence = input_sequence
	var id: int = next_id
	var entry: Dictionary = {"started":Time.get_ticks_msec()}
	pending[id] = entry
	if peer.send_text(JSON.stringify({"id":id,"input":input})) != OK: _disconnect("입력을 보내지 못했습니다.")
	while not entry.has("response"): await get_tree().process_frame
	return entry.response

func synchronize() -> bool:
	var started: int = Time.get_ticks_msec()
	while (not socket_ready or pending.size()>=4) and not blocked and Time.get_ticks_msec()-started<10000: await get_tree().process_frame
	if not socket_ready or pending.size()>=4: return false
	var result: Dictionary = await _send(_input_data())
	if result.get("resync",false): main._accept_online_result(result)
	return not result.has("error")

func request(action: Dictionary) -> Dictionary:
	var started: int = Time.get_ticks_msec()
	while (not socket_ready or pending.size()>=4) and not blocked and Time.get_ticks_msec()-started<10000: await get_tree().process_frame
	if not socket_ready: return _failure("서버에 다시 연결하고 있습니다. 잠시 후 이용해 주세요.")
	if pending.size()>=4: return {"error":"input_busy","message":"앞선 입력을 처리하고 있습니다. 잠시 후 다시 이용해 주세요."}
	var input: Dictionary = _input_data()
	var spatial: Dictionary = action.get("spatial",{})
	input.command = str(action.get("command","spatial_sync"))
	if spatial.has("position"): input.position = spatial.position
	if spatial.has("aim"): input.aim = spatial.aim
	if spatial.has("target"): input.target = spatial.target
	var result: Dictionary = await _send(input)
	if result.has("spatialCombat"): result.sequence = spatial.get("sequence",0)
	return result

func reset() -> void:
	blocked = false
	connected_game = ""
	main.online_presence.revision = -1

func _exit_tree() -> void:
	if peer != null: peer.close()
