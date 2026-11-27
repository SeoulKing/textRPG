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


static func _safe_key(key: String) -> bool:
	return not key.is_empty() and key.is_valid_filename() and not key.begins_with(".")


static func try_write(key: String, value: String) -> bool:
	if not _safe_key(key): return false
	if OS.has_feature("web"):
		return JavaScriptBridge.eval("(()=>{try{localStorage.setItem(" + JSON.stringify(key) + "," + JSON.stringify(value) + ");return true}catch(e){return false}})()") == true
	var file := FileAccess.open("user://" + key + ".txt", FileAccess.WRITE)
	if file == null: return false
	file.store_string(value)
	file.flush()
	return file.get_error() == OK


static func try_remove(key: String) -> bool:
	if not _safe_key(key): return false
	if OS.has_feature("web"):
		return JavaScriptBridge.eval("(()=>{try{localStorage.removeItem(" + JSON.stringify(key) + ");return true}catch(e){return false}})()") == true
	var directory := DirAccess.open("user://")
	if directory == null: return false
	var filename := key + ".txt"
	return not directory.file_exists(filename) or directory.remove(filename) == OK


static func keys_with_prefix(prefix: String) -> Variant:
	if not _safe_key(prefix): return null
	if OS.has_feature("web"):
		var script := "(()=>{try{const p=" + JSON.stringify(prefix) + ";return JSON.stringify(Object.keys(localStorage).filter(k=>k.startsWith(p)))}catch(e){return null}})()"
		var raw: Variant = JavaScriptBridge.eval(script)
		if not raw is String: return null
		var parsed: Variant = JSON.parse_string(raw)
		return PackedStringArray(parsed) if parsed is Array else null
	var directory := DirAccess.open("user://")
	if directory == null: return null
	var keys := PackedStringArray()
	for filename in directory.get_files():
		if filename.begins_with(prefix) and filename.ends_with(".txt"):
			keys.append(filename.trim_suffix(".txt"))
	return keys

