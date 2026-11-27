extends RefCounted

const Storage = preload("res://scripts/services/local_storage.gd")
const KEY_PREFIX := "arcana-town-trade-v1-"
const MAX_PENDING := 4
const MAX_SAFE_NUMBER := 9_007_199_254_740_991
const LEGACY_KEYS := {
	"inn": "arcana-inn-supply-pending-v1-",
	"market": "arcana-plaza-market-pending-v1-",
}
const ACTIONS := {
	"inn": ["deliver", "sellMeal", "buyMeal", "donateWood"],
	"market": ["list", "buy", "withdraw", "collect", "placeBuyOrder", "fillBuyOrder", "cancelBuyOrder", "collectPurchases", "recoverArchivedTrade"],
}

var _memory: Dictionary = {}
var _settled: Dictionary = {}


func _scope(channel: String, game_id: String) -> String:
	return "%s%s-%s-" % [KEY_PREFIX, channel, game_id.sha256_text()]


func _record_key(scope: String, record: Dictionary) -> String:
	return "%spending-%016d-%s" % [scope, int(record.createdAt), str(record.actionId)]


func _legacy_marker(scope: String, action_id: String) -> String:
	return "%slegacy-done-%s" % [scope, action_id]


func _read_legacy(channel: String, game_id: String) -> Variant:
	if not game_id.is_valid_filename(): return null
	return Storage.read_json(str(LEGACY_KEYS[channel]) + game_id)


func _already_resolved(scope: String, action_id: String, settled: Dictionary) -> bool:
	return settled.has(action_id) or Storage.read(_legacy_marker(scope, action_id)) == "1"


func _valid_number(value: Variant) -> bool:
	return (value is int or value is float) and value >= 1 and value <= MAX_SAFE_NUMBER and value == floor(value)


func _valid_action_id(action_id: Variant) -> bool:
	if not action_id is String or action_id.length() < 16 or action_id.length() > 100: return false
	for character in action_id:
		if not "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-".contains(character): return false
	return true


func _valid_record(channel: String, record: Variant) -> bool:
	if not record is Dictionary or not _valid_number(record.get("createdAt")) or not _valid_number(record.get("day")) \
		or not _valid_action_id(record.get("actionId")):
		return false
	var payload: Variant = record.get("payload") if channel == "market" else record
	return payload is Dictionary and payload.get("action", "") in ACTIONS.get(channel, [])


func _action_id_in_key(prefix: String, key: String) -> String:
	var tail := key.trim_prefix(prefix)
	if tail.length() < 33 or tail[16] != "-" or not tail.left(16).is_valid_int(): return ""
	var action_id := tail.substr(17)
	return action_id if _valid_action_id(action_id) else ""


func _older(left: Dictionary, right: Dictionary) -> bool:
	var left_time := int(left.createdAt)
	var right_time := int(right.createdAt)
	if left_time == right_time: return str(left.actionId) < str(right.actionId)
	return left_time < right_time


func remember(channel: String, game_id: String, record: Dictionary) -> bool:
	if not _valid_record(channel, record): return false
	var scope := _scope(channel, game_id)
	var stored := Storage.try_write(_record_key(scope, record), JSON.stringify(record))
	var memory: Dictionary = _memory.get(scope, {})
	memory[str(record.actionId)] = {"record": record.duplicate(true), "stored": stored}
	_memory[scope] = memory
	return true


func oldest(channel: String, game_id: String) -> Dictionary:
	var records := pending(channel, game_id)
	return records[0] if not records.is_empty() else {}


func pending(channel: String, game_id: String) -> Array[Dictionary]:
	if game_id.is_empty() or not LEGACY_KEYS.has(channel): return []
	var scope := _scope(channel, game_id)
	_cleanup(channel, game_id, scope)
	var settled: Dictionary = _settled.get(scope, {})
	var memory: Dictionary = _memory.get(scope, {})
	var candidates: Dictionary = {}
	var prefix := scope + "pending-"
	var keys: Variant = Storage.keys_with_prefix(prefix)
	for action_id: String in memory.keys():
		var row: Dictionary = memory[action_id]
		var key := _record_key(scope, row.record)
		if _already_resolved(scope, action_id, settled):
			memory.erase(action_id)
		elif keys is PackedStringArray and row.stored and not keys.has(key):
			memory.erase(action_id)
		else:
			if keys is PackedStringArray and not row.stored:
				row.stored = Storage.try_write(key, JSON.stringify(row.record))
			candidates[action_id] = row.record
	if memory.is_empty(): _memory.erase(scope)
	if keys is PackedStringArray:
		keys.sort()
		var read_count := 0
		for key: String in keys:
			var action_id := _action_id_in_key(prefix, key)
			if action_id.is_empty() or _already_resolved(scope, action_id, settled): continue
			var record: Variant = Storage.read_json(key)
			if not _valid_record(channel, record) or key != _record_key(scope, record): continue
			candidates[action_id] = record
			read_count += 1
			if read_count >= MAX_PENDING: break
	var legacy: Variant = _read_legacy(channel, game_id)
	if _valid_record(channel, legacy):
		var legacy_id := str(legacy.actionId)
		if _already_resolved(scope, legacy_id, settled):
			candidates.erase(legacy_id)
		elif not candidates.has(legacy_id):
			# Copy the exact legacy payload while leaving the shared, mutable slot intact.
			remember(channel, game_id, legacy)
			candidates[legacy_id] = legacy
	var records: Array[Dictionary] = []
	for record: Dictionary in candidates.values():
		records.append(record)
	records.sort_custom(_older)
	if records.size() > MAX_PENDING: records.resize(MAX_PENDING)
	return records


func resolve(channel: String, game_id: String, record: Dictionary) -> void:
	var scope := _scope(channel, game_id)
	var action_id := str(record.actionId)
	var memory: Dictionary = _memory.get(scope, {})
	memory.erase(action_id)
	if memory.is_empty(): _memory.erase(scope)
	var settled: Dictionary = _settled.get(scope, {})
	settled[action_id] = record
	_settled[scope] = settled
	_cleanup(channel, game_id, scope)


func _cleanup(channel: String, game_id: String, scope: String) -> void:
	if not _settled.has(scope): return
	var settled: Dictionary = _settled[scope]
	var legacy: Variant = _read_legacy(channel, game_id)
	for action_id: String in settled.keys():
		if legacy is Dictionary and legacy.get("actionId", "") == action_id \
			and not Storage.try_write(_legacy_marker(scope, action_id), "1"):
			continue
		if Storage.try_remove(_record_key(scope, settled[action_id])):
			settled.erase(action_id)
	if settled.is_empty(): _settled.erase(scope)
