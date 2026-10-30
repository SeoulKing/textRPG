extends Node
## Render projections only. Account identity, positions, combat and rewards are server-owned.
const Hero = preload("res://scripts/native_2d_hero.gd")
const Blink = preload("res://scripts/native_2d_blink.gd")
var main: Node
var actors: Dictionary = {}
var packet: Dictionary = {}
var revision: int = -1
var character_id: String = ""
var self_name: Label
var count_label: Label

func _ready() -> void:
	self_name = _label()
	count_label = _label()
	count_label.position = Vector2(12,12)

func _label() -> Label:
	var label = Label.new()
	label.add_theme_font_size_override("font_size",13)
	label.add_theme_color_override("font_color",Color("f4ecd9"))
	label.add_theme_color_override("font_shadow_color",Color("171c26"))
	label.add_theme_constant_override("shadow_offset_x",1)
	label.add_theme_constant_override("shadow_offset_y",1)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	main.ui.root.add_child(label)
	return label

func accept(value: Dictionary) -> void:
	if int(value.get("revision",-1))<revision: return
	if value.get("playersDelta",false):
		var merged: Dictionary = {}
		for player in packet.get("players",[]): merged[str(player.id)] = player
		for id in value.get("removedPlayers",[]): merged.erase(str(id))
		for player in value.get("players",[]): merged[str(player.id)] = player
		value = value.duplicate(true)
		value.players = merged.values()
		value.playersDelta = false
		value.removedPlayers = []
	var initial: bool = revision < 0
	revision = int(value.get("revision",0))
	packet = value
	if value.get("self") is Dictionary:
		var update: Dictionary = value.self
		character_id = str(update.get("characterId",character_id))
		var old_place_revision: int = int(main.snapshot.get("onlinePlaceRevision",0))
		var next_place_revision: int = int(update.get("placeRevision",old_place_revision))
		main.snapshot.onlinePlaceRevision = next_place_revision
		main.snapshot.onlineFighting = update.get("onlineFighting",false)
		main.snapshot.state.merge(update.get("state",{}),true)
		var location = str(main.snapshot.state.get("location",""))
		var expected_interior = location if location in ["arcana_shop","arcana_inn","arcana_restaurant","arcana_academy"] else ""
		if main.world.indoor != expected_interior:
			main._apply(main.snapshot.duplicate(true))
			for player in value.get("players",[]):
				if str(player.get("id","")) == character_id and player.get("position") is Dictionary:
					main.world.player_position = main.world.nearest_walkable(Vector2(float(player.position.x),float(player.position.y)))
					main.world.path.clear()
					break
		if update.get("place") is Dictionary and main.world.indoor=="arcana_academy" and main.world.academy_floor!=int(update.place.floor):
			main.world.change_academy_floor(int(update.place.floor))
		if next_place_revision!=old_place_revision and update.get("position") is Dictionary:
			main.world.player_position = main.world.nearest_walkable(Vector2(float(update.position.x),float(update.position.y)))
			main.world.path.clear()
		main.snapshot.arcanaSpells = update.get("arcanaSpells",main.snapshot.get("arcanaSpells",[]))
		main.world.battle = main._battle().duplicate(true)
		if float(main.world.battle.get("enemyHp",30))<=0: main.world.battle.phase = "victory"
		main.world.enemy_visual_hp = float(main._battle().get("enemyHp",30))
		var combat = main.spatial_combat
		for entry in main._battle().get("spatial",{}).get("events",[]):
			if initial: combat.last_event = maxi(combat.last_event,int(entry.id))
			if int(entry.id)>combat.last_event:
				combat.last_event = int(entry.id)
				combat._event(entry)
		if main._battle().get("spatial") is Dictionary:
			var point: Dictionary = main._battle().spatial.player
			var authoritative = Vector2(float(point.x),float(point.y))
			if main.world.player_position.distance_to(authoritative)>18 and main.world.dash_age<0 and main.world.teleport_age<0:
				main.world.player_position = main.world.nearest_walkable(authoritative)
				main.world.path.clear()
		main._update_hud()
		main._refresh_controls()
	count_label.text = "접속 %d명" % int(value.get("count",0))
	if value.get("capacity") != null: count_label.text += " · 개발 임시 제한 %d명" % int(value.capacity)
	var retained: Dictionary = {}
	for player in value.get("players",[]):
		var id: String = str(player.id)
		retained[id] = true
		if id == character_id:
			self_name.text = str(player.name)+" · 나"
			continue
		if not actors.has(id):
			var hero = Hero.new()
			main.world_renderer.add_child(hero)
			var blink = Blink.new()
			main.world_renderer.add_child(blink)
			var guard = main.world_renderer._ring(.65,"ffae46")
			hero.add_child(guard)
			actors[id] = {"hero":hero,"blink":blink,"guard":guard,"movement":int(player.get("movement",{}).get("id",0)) if player.get("movement") is Dictionary else 0,"blink_age":-1.0,"label":_label(),"position":Vector2(float(player.position.x),float(player.position.y)),"data":player,"cast":int(player.get("cast",0)),"bench_age":0.0}
		var remote: Dictionary = actors[id]
		if str(remote.data.get("bench","")) != str(player.get("bench","")): remote.bench_age = 0.0
		remote.data = player
		if player.get("movement") is Dictionary and int(player.movement.id)>int(remote.movement):
			remote.movement = int(player.movement.id)
			var move_heading = Vector2(float(player.movement.direction.x),float(player.movement.direction.y))
			if player.movement.get("movement","")=="dodge":
				remote.hero.dash_age = 0.0
				remote.hero.dash_yaw = atan2(move_heading.x,move_heading.y)
			else:
				remote.blink_age = 0.0
				remote.position = Vector2(float(player.position.x),float(player.position.y))
		remote.label.text = str(player.name)+("" if player.get("connected",true) else " · 재접속 중")
		if int(player.get("cast",0))>int(remote.cast):
			remote.cast = int(player.cast)
			var heading = Vector2(float(player.direction.x),float(player.direction.y))
			remote.hero.begin_cast(heading)
	for id in actors.keys():
		if not retained.has(id):
			if is_instance_valid(main.world_renderer.shop2d): main.world_renderer.shop2d.remove_remote(str(id))
			actors[id].hero.queue_free()
			actors[id].blink.queue_free()
			actors[id].label.queue_free()
			actors.erase(id)

func _process(delta: float) -> void:
	if main.snapshot.is_empty(): return
	if is_instance_valid(self_name):
		self_name.visible = not main.ui.overlay.visible
		self_name.position = main.spatial_combat._screen(main.world.player_position,2.1)-Vector2(self_name.size.x*.5,0)
	for remote in actors.values():
		var data: Dictionary = remote.data
		var target = Vector2(float(data.position.x),float(data.position.y))
		remote.position = remote.position.lerp(target,minf(1,delta*12))
		var hero = remote.hero
		var heading = Vector2(float(data.direction.x),float(data.direction.y))
		hero.position = main.world_renderer.map_point(remote.position)
		hero.set_camera_yaw(main.world_renderer.view_yaw())
		remote.bench_age += delta
		hero.set_bench_pose(str(data.get("bench","")),float(remote.bench_age),main.world.reduced_motion)
		hero.advance_cast(delta,false)
		if hero.dash_age>=0:
			hero.dash_age += delta
			if hero.dash_age>.3: hero.dash_age = -1
		remote.guard.visible = float(data.get("guard",{}).get("amount",0))>0
		if float(remote.blink_age)>=0:
			remote.blink_age += delta
			if remote.blink_age>.5: remote.blink_age = -1.0
		hero.visible = not Blink.hides_character(float(remote.blink_age),main.world.effects_enabled,main.world.reduced_motion)
		if data.get("movement") is Dictionary and data.movement.get("movement","")=="teleport":
			var move: Dictionary = data.movement
			var from = Vector2(float(move.sourcePosition.x),float(move.sourcePosition.y))
			var to = Vector2(float(move.position.x),float(move.position.y))
			var direction: int = Hero.direction_for_yaw(atan2(to.x-from.x,to.y-from.y),main.world_renderer.view_yaw())
			remote.blink.update_pose(float(remote.blink_age),direction,main.world_renderer.map_point(from),main.world_renderer.map_point(to),main.world.effects_enabled,main.world.reduced_motion)
		hero.pose(main.world.time,float(data.get("gait",0)),bool(data.get("walking",false)),heading*delta*48 if data.get("walking",false) else Vector2.ZERO,main.world_renderer.pixelated,main.world.effects_enabled)
		hero.apply_bench_pose()
		if main.world.indoor == "arcana_shop" and is_instance_valid(main.world_renderer.shop2d):
			main.world_renderer.shop2d.sync_remote(str(data.id),hero,remote.position)
			hero.hide()
		remote.label.position = main.spatial_combat._screen(remote.position,2.1)-Vector2(remote.label.size.x*.5,0)
		remote.label.visible = not main.ui.overlay.visible and main.get_viewport().get_visible_rect().has_point(remote.label.position)

func _exit_tree() -> void:
	for remote in actors.values():
		if is_instance_valid(remote.hero): remote.hero.queue_free()
		if is_instance_valid(remote.blink): remote.blink.queue_free()
		if is_instance_valid(remote.label): remote.label.queue_free()
	if is_instance_valid(self_name): self_name.queue_free()
	if is_instance_valid(count_label): count_label.queue_free()
