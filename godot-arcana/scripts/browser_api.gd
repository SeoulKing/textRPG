extends RefCounted
## Browser fetch explicitly carries the same-origin HttpOnly session.
static func request(main: Node, route: String, method: int, data: Dictionary) -> Dictionary:
	var started: int = Time.get_ticks_msec()
	var id: String = str(started)+"-"+str(randi())
	var names: Array = ["GET","HEAD","POST","PUT","DELETE","OPTIONS","TRACE","CONNECT","PATCH"]
	var verb: String = str(names[method])
	var options: Dictionary = {"method":verb,"credentials":"same-origin","headers":{"Content-Type":"application/json","Accept":"application/json"}}
	if verb not in ["GET","HEAD"]: options.body = JSON.stringify(data)
	var script: String = "(()=>{window.arcanaHttp=window.arcanaHttp||{};const id="+JSON.stringify(id)+";const c=new AbortController();const t=setTimeout(()=>c.abort(),65000);fetch("+JSON.stringify(route)+",Object.assign("+JSON.stringify(options)+",{signal:c.signal})).then(async r=>({status:r.status,body:await r.json()})).catch(()=>({status:0,body:{error:'network',retryable:true,message:'서버 연결이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.'}})).then(v=>{clearTimeout(t);window.arcanaHttp[id]=JSON.stringify(v);});})()"
	JavaScriptBridge.eval(script)
	var response: Variant = null
	while Time.get_ticks_msec()-started < 67000:
		response = JavaScriptBridge.eval("window.arcanaHttp&&window.arcanaHttp["+JSON.stringify(id)+"]||null")
		if response != null: break
		await main.get_tree().create_timer(.05).timeout
	JavaScriptBridge.eval("if(window.arcanaHttp)delete window.arcanaHttp["+JSON.stringify(id)+"]")
	if response == null: return {"error":"network","retryable":true,"message":"서버 응답이 지연되고 있습니다."}
	var result: Variant = JSON.parse_string(str(response))
	if not result is Dictionary: return {"error":"invalid_response","message":"서버 응답을 읽지 못했습니다."}
	main._record_network(started,int(result.get("status",0)),int(result.get("status",0))>0)
	var body: Variant = result.get("body",{})
	if not body is Dictionary: return {"error":"invalid_response","message":"서버 응답을 읽지 못했습니다."}
	if int(result.get("status",0))>=400 and not body.has("error"): body.error="request_failed"
	return body
