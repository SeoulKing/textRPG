extends Node
## Persistent ordered combat transport. Never replay an unacknowledged command.
var main: Node
var peer: WebSocketPeer
var pending: Dictionary = {}
var next_id: int = 0
var connected_game: String = ""
var socket_ready: bool = false
var retry_at: int = 0
var failures: int = 0
var connecting_at: int = 0

func _failure(message: String) -> Dictionary:
	return {"error":"network", "message":message}

func _disconnect(message: String) -> void:
	socket_ready = false
	if connected_game == main.game_id and not connected_game.is_empty() and is_instance_valid(main.spatial_combat) and main.spatial_combat.available():
		main.spatial_combat.connection_lost = true
	if peer != null:
		peer.close()
	peer = null
	for entry in pending.values():
		entry.response = _failure(message)
	pending.clear()
	failures = mini(failures + 1, 5)
	retry_at = Time.get_ticks_msec() + int(minf(30000.0, 500.0 * pow(2.0, failures))) + randi_range(0,250)

func _process(_delta: float) -> void:
	if main.game_id != connected_game:
		_disconnect("전투 연결 대상이 변경되었습니다.")
		connected_game = main.game_id
		retry_at = 0
		failures = 0
	if connected_game.is_empty(): return
	var now: int = Time.get_ticks_msec()
	if peer == null:
		if now < retry_at or not main.page_active: return
		peer = WebSocketPeer.new()
		peer.inbound_buffer_size = 1024 * 1024
		peer.outbound_buffer_size = 64 * 1024
		peer.max_queued_packets = 32
		connecting_at = now
		var url: String = str(main.origin).replace("https://","wss://").replace("http://","ws://") + "/api/games/" + connected_game + "/combat-ws"
		if peer.connect_to_url(url) != OK:
			_disconnect("전투 서버에 연결하지 못했습니다.")
			return
	peer.poll()
	if peer.get_ready_state() == WebSocketPeer.STATE_CLOSED:
		_disconnect("전투 연결이 끊겼습니다. 서버 상태를 다시 확인합니다.")
		return
	if not socket_ready and now - connecting_at > 10000:
		_disconnect("전투 서버 연결이 지연되고 있습니다.")
		return
	while peer != null and peer.get_available_packet_count() > 0:
		var packet = JSON.parse_string(peer.get_packet().get_string_from_utf8())
		if not packet is Dictionary:
			_disconnect("전투 응답을 읽지 못했습니다.")
			return
		if packet.get("ready",false) and packet.get("protocol",0) == 1:
			socket_ready = true
			failures = 0
		elif packet.has("id") and packet.get("result") is Dictionary:
			var id: int = int(packet.id)
			if pending.has(id):
				pending[id].response = packet.result
				pending.erase(id)
	for entry in pending.values():
		if now - int(entry.started) > 20000:
			_disconnect("전투 응답을 받지 못했습니다. 처리된 공격은 재전송하지 않고 상태를 확인합니다.")
			return

func request(action: Dictionary) -> Dictionary:
	var wait_started: int = Time.get_ticks_msec()
	while not socket_ready and Time.get_ticks_msec() - wait_started < 10000:
		await get_tree().process_frame
	if not socket_ready or peer == null:
		return _failure("전투 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.")
	if pending.size() >= 4:
		return _failure("전투 입력이 지연되고 있습니다.")
	next_id += 1
	var id: int = next_id
	var entry: Dictionary = {"started":Time.get_ticks_msec()}
	pending[id] = entry
	if peer.send_text(JSON.stringify({"id":id,"action":action})) != OK:
		_disconnect("전투 입력을 보내지 못했습니다.")
	while not entry.has("response"):
		await get_tree().process_frame
	var result: Dictionary = entry.response
	main._record_network(int(entry.started), 400 if result.has("error") else 200, result.get("error", "") != "network")
	main.network_timing.transport = "websocket"
	return result

func _exit_tree() -> void:
	if peer != null: peer.close()
