extends RefCounted
## HTTP transport; replay policy stays with the session controller.
static func request(host: Node, route: String, method: int, data: Dictionary, timeout_seconds: float = 0.0, action_id: String = "") -> Dictionary:
	if OS.has_feature("web"): return await preload("res://scripts/browser_api.gd").request(host,route,method,data,timeout_seconds,action_id)
	var started_at: int = Time.get_ticks_msec()
	var req = HTTPRequest.new()
	req.timeout = timeout_seconds if timeout_seconds>0 else (20 if method == HTTPClient.METHOD_GET or data.get("type", "") in ["world_clock", "arcana_combat"] else 65)
	host.add_child(req)
	var headers = PackedStringArray(["Content-Type: application/json", "Accept: application/json"])
	headers.append("X-Arcana-Native: 1")
	if not action_id.is_empty(): headers.append("X-Action-Id: "+action_id)
	if not host.session_token.is_empty(): headers.append("Authorization: Bearer "+host.session_token)
	var result = req.request(host.origin + route, headers, method, JSON.stringify(data) if method != HTTPClient.METHOD_GET else "")
	if result != OK:
		host._record_network(started_at, 0, false)
		req.queue_free()
		return {"error":"network", "retryable":true, "message":"서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요."}
	var reply = await req.request_completed
	host._record_network(started_at, int(reply[1]), reply[0] == HTTPRequest.RESULT_SUCCESS)
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
	if int(reply[1])>=400: parsed.httpStatus = int(reply[1])
	return parsed

