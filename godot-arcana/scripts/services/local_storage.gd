extends RefCounted
## Browser/native persistence adapter; existing keys remain unchanged.
static func read(key: String) -> String:
	if OS.has_feature("web"):
		var value = JavaScriptBridge.eval("(()=>{try{return localStorage.getItem(" + JSON.stringify(key) + ")||''}catch(e){return ''}})()")
		return str(value) if value != null else ""
	if FileAccess.file_exists("user://" + key + ".txt"):
		return FileAccess.get_file_as_string("user://" + key + ".txt")
	return ""

static func read_json(key: String) -> Variant:
	var raw = read(key)
	if raw.is_empty(): return null
	var parser = JSON.new()
	return parser.data if parser.parse(raw) == OK else null

static func write(key: String, value: String) -> void:
	if OS.has_feature("web"):
		JavaScriptBridge.eval("try{localStorage.setItem(" + JSON.stringify(key) + "," + JSON.stringify(value) + ")}catch(e){}")
	else:
		var file = FileAccess.open("user://" + key + ".txt", FileAccess.WRITE)
		if file: file.store_string(value)

