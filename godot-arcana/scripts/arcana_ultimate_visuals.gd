extends Node
## Reuses approved slime/flame resources; no character animation assets are changed.
const Slime = preload("res://scripts/slime_sprite.gd")
const Health = preload("res://scripts/enemy_health_overlay.gd")
var combat
var enemies: Dictionary = {}
var meters: Dictionary = {}
var meteors: Dictionary = {}
var aim_ring: Node3D

func hit_enemy(id: String) -> void:
	if id == str(combat._spatial().get("primaryEnemyId","")):
		combat.main.world_renderer.plaza_slime.play_hit()
	elif enemies.has(id): enemies[id].play_hit()

func render(delta: float, active: bool, paused: bool) -> void:
	var main = combat.main
	var spatial: Dictionary = combat._spatial()
	var renderer = main.world_renderer
	var primary = str(spatial.get("primaryEnemyId","slime_0"))
	var present: Dictionary = {}
	for enemy in spatial.get("enemies",[]):
		var id = str(enemy.id)
		if id == primary: continue
		present[id] = true
		if not enemies.has(id):
			var slime = Slime.new()
			slime.ambient_preview = false
			renderer.add_child(slime)
			enemies[id] = slime
			var health = Health.new()
			main.ui.root.add_child(health)
			meters[id] = health
		var node: Node3D = enemies[id]
		var point: Vector2 = combat._point(enemy.position)
		node.position = renderer.map_point(point)
		var battle: Dictionary = combat._battle().duplicate(false)
		battle.id = str(battle.get("id",""))+":"+id
		battle.phase = "victory" if float(enemy.hp)<=0 else "battle" if str(enemy.behavior) not in ["neutral","return"] else "ready"
		battle.attackIn = maxf(0,float(enemy.attackIn)-(0.0 if paused else minf(combat.visual_age,.25)))
		battle.spatial = {"behavior":enemy.behavior,"jumpElapsed":enemy.jumpElapsed}
		node.sync(main.world.time,battle,float(enemy.hp),false,main.world.effects_enabled and not main.world.reduced_motion)
		node.visible = node.visible and active
		var center: Vector2 = combat._screen(point,1.25)
		var width: float = 45.0
		var shown = active and not main.ui.overlay.visible and float(enemy.hp)>0 and main.get_viewport().get_visible_rect().has_point(center)
		meters[id].update_meter(center,width,float(enemy.hp)/float(enemy.maxHp),float(enemy.hp)/float(enemy.maxHp),shown)
	for id in enemies.keys():
		if not present.has(id):
			enemies[id].queue_free()
			meters[id].queue_free()
			enemies.erase(id)
			meters.erase(id)
	if not is_instance_valid(aim_ring):
		aim_ring = renderer._ring(2.0,"ff9b36")
		renderer.add_child(aim_ring)
	aim_ring.visible = active and combat.aim_owner != -1 and combat.aim_spell == "meteor" and combat.manual
	if aim_ring.visible:
		var distance: float = combat._spell_range("meteor")*clampf(combat.aim_pointer.distance_to(combat.aim_origin)/80.0,0,1)
		aim_ring.position = renderer.map_point(main.world.player_position+combat.aim_direction*distance,.05)
	var falling: Dictionary = {}
	for meteor in spatial.get("meteors",[]):
		var id = str(meteor.id)
		falling[id] = true
		if not meteors.has(id):
			var ring: Node3D = renderer._ring(2.0,"ff9b36")
			renderer.add_child(ring)
			meteors[id] = {"ring":ring,"flame":combat.effect_pool.take_flame()}
		var effect: Dictionary = meteors[id]
		var point: Vector2 = combat._point(meteor.position)
		var remaining: float = maxf(0,float(meteor.remaining)-(0.0 if paused else minf(combat.visual_age,.25)))
		effect.ring.position = renderer.map_point(point,.05)
		effect.ring.visible = active
		var flame: Node3D = effect.flame
		flame.position = renderer.map_point(point,.6+remaining*6)
		flame.scale = Vector3.ONE*2.5
		flame.direction = Vector3.DOWN
		flame.visible = active and main.world.effects_enabled
		flame.light_enabled = main.world.effects_enabled
		flame.update_pose(renderer.camera,delta,paused,main.world.reduced_motion)
	for id in meteors.keys():
		if not falling.has(id):
			meteors[id].ring.queue_free()
			meteors[id].flame.scale = Vector3.ONE
			combat.effect_pool.release_flame(meteors[id].flame)
			meteors.erase(id)
