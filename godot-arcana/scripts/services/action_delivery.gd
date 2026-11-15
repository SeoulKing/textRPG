extends Node
## Persist only bounded transaction intents. Attacks are never replayed here.
const STORAGE_KEY: String = "arcana-pending-actions-v1"
const RETRY_WINDOW_MS: int = 60000
var main: Node
var pending: Dictionary = {}
var in_flight: Dictionary = {}
var timer: float = 0.0

func _ready() -> void:
	var saved: Variant = main._stored_json(STORAGE_KEY)
	if saved is Dictionary: pending = saved

func handles(action: Dictionary) -> bool:
	return main.online_world and action.get("type","")=="arcana_combat" and action.get("command","") in ["buy_item","sell_item","buy_potion","potion"]

func _save() -> void:
	main._store(STORAGE_KEY,JSON.stringify(pending))

func _same(left: Dictionary, right: Dictionary) -> bool:
	return JSON.stringify(left)==JSON.stringify(right)

func _resolved(result: Dictionary, id: String) -> bool:
	return result.get("actionReceipt",{}).get("id","")==id

func _rejected(result: Dictionary) -> bool:
	return int(result.get("httpStatus",0)) in [400,404,409] or result.get("error","") in ["potion_unavailable","action_id_required","action_id_conflict","transaction_rejected"]

func _finish(key: String, entry: Dictionary, result: Dictionary) -> void:
	if not pending.has(key) or pending[key].id!=entry.id: return
	if _resolved(result,str(entry.id)) or _rejected(result):
		pending.erase(key)
		_save()

func submit(action: Dictionary) -> Dictionary:
	var key: String = "potion" if action.get("command","")=="potion" else "trade"
	if in_flight.has(key): return {"error":"action_pending","quiet":true}
	if pending.has(key) and str(pending[key].gameId)!=main.game_id: pending.erase(key)
	if pending.has(key) and not _same(pending[key].action,action):
		return {"error":"action_pending","message":"거래 결과를 확인하고 있습니다. 잠시 후 이용해 주세요."}
	# Existing intents are queried before any resend, including after a long reload.
	if pending.has(key):
		_recover(key)
		return {"error":"action_pending","quiet":true}
	if not pending.has(key):
		pending[key] = {"id":main._new_action_id(),"gameId":main.game_id,"action":action.duplicate(true),"createdAt":int(Time.get_unix_time_from_system()*1000)}
		_save()
	var entry: Dictionary = pending[key]
	var generation: int = main.combat_socket.connection_generation
	in_flight[key] = true
	var result: Dictionary = await _send(entry)
	in_flight.erase(key)
	if generation!=main.combat_socket.connection_generation: return {"error":"network","quiet":true}
	_finish(key,entry,result)
	return result

func _send(entry: Dictionary) -> Dictionary:
	if entry.action.get("command","")=="potion":
		var action: Dictionary = entry.action.duplicate(true)
		action.actionId = entry.id
		return await main.combat_socket.request(action)
	return await main._api("/api/games/"+str(entry.gameId)+"/actions",HTTPClient.METHOD_POST,entry.action,8.0,str(entry.id))

func _process(delta: float) -> void:
	timer += delta
	if timer<2 or not main.online_world or main.game_id.is_empty() or main.busy or not main.combat_socket.socket_ready: return
	timer = 0
	for key in pending.keys():
		if not in_flight.has(key): _recover(str(key))

func _recover(key: String) -> void:
	if not pending.has(key): return
	var entry: Dictionary = pending[key]
	if str(entry.get("gameId",""))!=main.game_id:
		pending.erase(key)
		_save()
		return
	in_flight[key] = true
	var generation: int = main.combat_socket.connection_generation
	var result: Dictionary = await main._api("/api/games/"+str(entry.gameId)+"/actions/"+str(entry.id).uri_encode(),HTTPClient.METHOD_GET,{},8.0)
	if generation!=main.combat_socket.connection_generation:
		in_flight.erase(key)
		return
	if result.get("status","")=="unknown":
		var age: int = int(Time.get_unix_time_from_system()*1000)-int(entry.createdAt)
		if age<RETRY_WINDOW_MS and age>=0 and main.combat_socket.socket_ready:
			result = await _send(entry)
		else:
			pending.erase(key)
			_save()
			main.ui.toast("처리되지 않은 요청을 취소했습니다. 다시 이용해 주세요.")
	in_flight.erase(key)
	if str(entry.gameId)!=main.game_id or generation!=main.combat_socket.connection_generation: return
	_finish(key,entry,result)
	if _resolved(result,str(entry.id)):
		if result.get("snapshot") is Dictionary: main._apply(result.snapshot)
		elif result.has("state"):
			if result.get("spatialCombat",false): main._accept_online_result(result)
			else: main._apply(result)
		if key=="trade" and main.world.indoor=="arcana_shop" and main.panel_mode=="shop": main._shop_menu(entry.action.get("command","")=="sell_item")
		main.ui.toast("거래 결과를 확인했습니다." if key=="trade" else "포션 사용을 확인했습니다.")
	elif _rejected(result): main.ui.toast(str(result.get("message","요청을 처리하지 못했습니다.")))
