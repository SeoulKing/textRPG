extends RefCounted
## Visual previews only. Server HP, MP, inventory and rewards stay authoritative.
var combat: Node
var entries: Dictionary = {}
var last_cast_id: String = ""

func begin(command: String, direction: Vector2, target: Vector2) -> String:
	var id: String = combat.main._new_action_id()
	last_cast_id = id
	var heading: Vector2 = direction.normalized() if direction.length_squared()>.00001 else combat._auto_direction(command)
	entries[id] = {"command":command,"direction":heading,"position":combat.main.world.player_position,"target":target,"age":0.0,"accepted":false,"shots":0}
	combat.main.world_renderer.hero.begin_cast(heading)
	combat.main.world_renderer.hero.cast_age = combat.main.world_renderer.hero.CAST_GATHER
	combat.charge_vfx = combat.effect_pool.charge
	if command=="flame_wave": combat._event({"kind":"wave","position":combat._json(combat.main.world.player_position),"direction":combat._json(heading),"clientActionId":id,"_anticipated":true})
	elif command=="giant_fireball": _shot(id,entries[id],command)
	elif command=="flame_barrage":
		entries[id].shots = 1
		_shot(id+"-1",entries[id],command)
	return id

func _shot(id: String, entry: Dictionary, spell: String) -> void:
	combat.local_shots[id] = {"position":combat.main.world.player_position,"direction":entry.direction,"elapsed":0.0,"spellId":spell}

func guard_pending() -> bool:
	for entry in entries.values():
		if entry.command=="flame_guard" and not entry.accepted: return true
	return false

func reserved_cost() -> float:
	return float(combat.main._spell("flame_guard").get("cost",0)) if guard_pending() else 0.0

func tick(delta: float) -> void:
	for id in entries.keys():
		var entry: Dictionary = entries[id]
		entry.age += minf(delta,.1)
		if entry.command=="flame_barrage" and not entry.accepted and entry.age<.6 and entry.age>=float(entry.shots)*.2:
			entry.shots += 1
			_shot(str(id)+"-"+str(entry.shots),entry,"flame_barrage")
		if entry.age>5: cancel(str(id))

func meteors() -> Array:
	var result: Array = []
	for id in entries:
		var entry: Dictionary = entries[id]
		if entry.command=="meteor": result.append({"id":id,"position":combat._json(entry.target),"remaining":maxf(0,1-float(entry.age))})
	return result

func _handoff(local_id: String, server_id: String) -> void:
	combat.local_shots.erase(local_id)
	if local_id==server_id: return
	if combat.projectile_nodes.has(local_id):
		if combat.projectile_nodes.has(server_id): combat.effect_pool.release_flame(combat.projectile_nodes[server_id])
		combat.projectile_nodes[server_id] = combat.projectile_nodes[local_id]
		combat.projectile_nodes.erase(local_id)
	if combat.visual_outcomes.has(local_id):
		combat.visual_outcomes[server_id] = combat.visual_outcomes[local_id]
		combat.visual_outcomes.erase(local_id)

func _accepted(id: String) -> void:
	if entries.has(id): entries[id].accepted = true
	for parent_id in entries:
		if entries[parent_id].command=="flame_barrage" and id.begins_with(str(parent_id)+"-"): entries[parent_id].accepted = true

func observe(spatial: Dictionary) -> void:
	for shot in spatial.get("projectiles",[]):
		var id: String = str(shot.get("clientActionId",""))
		if not id.is_empty():
			_handoff(id,str(shot.id))
			_accepted(id)
	for event in spatial.get("events",[]):
		var id: String = str(event.get("clientActionId",""))
		if id.is_empty(): continue
		if event.get("kind","")=="cast" and event.has("projectileId"): _handoff(id,str(event.projectileId))
		_accepted(id)
	for meteor in spatial.get("meteors",[]):
		var id: String = str(meteor.get("clientActionId",""))
		if not entries.has(id): continue
		var effects: Dictionary = combat.additional_visuals.meteors
		if effects.has(id):
			effects[str(meteor.id)] = effects[id]
			effects.erase(id)
		entries.erase(id)

func suppress_event(event: Dictionary) -> bool:
	return event.get("kind","") in ["wave","guard"] and entries.has(str(event.get("clientActionId","")))

func confirm(id: String, result: Dictionary) -> void:
	if id.is_empty(): return
	if result.has("error"):
		cancel(id)
		return
	if entries.has(id): entries[id].accepted = true
	var battle: Variant = result.get("state",{}).get("arcanaCombat",{}).get("battle")
	if battle is Dictionary and battle.get("spatial") is Dictionary: observe(battle.spatial)

func cancel(id: String) -> void:
	if id==last_cast_id: combat.main.world_renderer.hero.cancel_cast()
	entries.erase(id)
	for shot_id in combat.local_shots.keys():
		if str(shot_id)==id or str(shot_id).begins_with(id+"-"): combat.local_shots.erase(shot_id)
	for wave in combat.wave_effects.duplicate():
		if str(wave.get("actionId",""))==id:
			wave.node.queue_free()
			combat.wave_effects.erase(wave)

func clear() -> void:
	for id in entries.keys(): cancel(str(id))
