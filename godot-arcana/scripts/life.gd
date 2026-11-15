extends Node
## UI and projection only. Resources, quality rolls, expiry and growth are server-owned.
const Fire = preload("res://scripts/native_2d_campfire.gd")
const PlacementButton = preload("res://scripts/placement_action_button.gd")
const CAMPFIRES = {"campfire":[30,6],"campfireFine":[45,4],"campfireExcellent":[60,3]}
const FOODS = {"grilledFish":40,"grilledFishFine":50,"grilledFishExcellent":60,"grilledMushroom":40,"grilledMushroomFine":50,"grilledMushroomExcellent":60,"roastedPotato":40,"roastedPotatoFine":50,"roastedPotatoExcellent":60,"meatSkewer":40,"meatSkewerFine":50,"meatSkewerExcellent":60}
const RECIPES = [
	{"id":"grilledFish","name":"생선구이","ingredients":{"riverFish":1}},
	{"id":"grilledMushroom","name":"버섯구이","ingredients":{"mushroom":1}},
	{"id":"roastedPotato","name":"구운감자","ingredients":{"potato":1}},
	{"id":"meatSkewer","name":"고기꼬치","ingredients":{"rawMeat":1,"treeBranch":1}},
]
const MATERIAL_NAMES = {"riverFish":"민물고기","mushroom":"버섯","potato":"감자","rawMeat":"고기","treeBranch":"나뭇가지"}
var main: Node
var job: Dictionary = {}
var skills: Array = []
var fires: Dictionary = {}
var fire_nodes: Dictionary = {}
var server_now: float = 0.0
var observed_at: int = 0
var mode: String = "craft"
var selected_fire: String = ""
var progress: ProgressBar
var progress_label: Label
var fire_label: Label
var sending: bool = false
var placing: bool = false
var placement_layer: Control
var placement_anchor: Node2D
var placement_confirm: Button
var placement_cancel: Button
var placement_drag: Button
# -2 = no drag, -1 = mouse, nonnegative = the captured touch index.
var drag_owner: int = -2
var drag_origin_map: Vector2
var drag_origin_placement: Vector2
var ghost: Node2D
var placement_item: String = ""
var placement_point: Vector2
var interaction_key: String = ""

func _ready() -> void:
	main.ui.panel_closed.connect(func():
		if active(): send({"command":"life_cancel"}))

func active() -> bool:
	return job.get("phase","")=="active"

func blocking() -> bool:
	return placing or active()

func now() -> float:
	return server_now+float(Time.get_ticks_msec()-observed_at) if observed_at>0 else Time.get_unix_time_from_system()*1000.0

func accept_world(value: Dictionary) -> void:
	if value.has("serverNow"):
		server_now = float(value.serverNow)
		observed_at = Time.get_ticks_msec()
	if value.has("campfires"):
		fires.clear()
		for fire in value.campfires: fires[str(fire.id)] = fire
	if value.get("self") is Dictionary:
		var update: Dictionary = value.self
		skills = update.get("lifeSkills",skills)
		var next_job: Variant = update.get("lifeActivity")
		if update.has("lifeActivity"):
			var was_active: bool = active()
			var old_key: String = str(job.get("id",""))+str(job.get("phase",""))
			job = next_job if next_job is Dictionary else {}
			if old_key!=str(job.get("id",""))+str(job.get("phase","")):
				if was_active and not active() and not job.is_empty():
					main.ui.toast(str(job.get("message","")))
				if main.panel_mode=="life" and main.ui.overlay.visible: _show()
	_sync_fires()

func _sync_fires() -> void:
	for id in fire_nodes.keys():
		if not fires.has(id):
			fire_nodes[id].queue_free()
			fire_nodes.erase(id)
	for id in fires:
		if not fire_nodes.has(id):
			var node: Node2D = Fire.new()
			main.world_renderer.add_child(node)
			fire_nodes[id] = node
		var fire: Dictionary = fires[id]
		fire_nodes[id].position = main.world_renderer.map_point(Vector2(float(fire.position.x),float(fire.position.y)))
	var key: String = JSON.stringify(fires)+main.world.indoor
	if key!=interaction_key:
		interaction_key = key
		main.world.entities.assign(main.world.entities.filter(func(entity): return entity.kind!="campfire"))
		main.world.life_campfires.clear()
		if main.world.indoor.is_empty():
			for fire in fires.values():
				var point := Vector2(float(fire.position.x),float(fire.position.y))
				main.world.entities.append({"id":str(fire.id),"name":"모닥불","kind":"campfire","pos":point,"interaction_radius":26.0})
				main.world.life_campfires.append(point)
			main.world._rebuild_grid()

func skill_info(id: String) -> Dictionary:
	for skill in skills:
		if skill.id==id: return skill
	return {"id":id,"name":"제작" if id=="crafting" else "요리","mastery":0,"xp":0,"chances":[85,14,1]}

func _growth(id: String) -> void:
	var skill: Dictionary = skill_info(id)
	main.ui.paragraph("%s 숙련도 %.2f / 100 · 경험치 %d / 10000" % [skill.name,float(skill.mastery),int(skill.xp)],main.ui.GOLD)
	var chances: Array = skill.chances
	main.ui.paragraph("품질 확률 · 보통 %.1f%% / 양호 %.1f%% / 우수 %.1f%%" % [float(chances[0]),float(chances[1]),float(chances[2])],main.ui.MUTED)

func show_skill(id: String) -> void:
	main.panel_mode = "skills"
	main.ui.open_panel("생활 스킬 · "+str(skill_info(id).name))
	_growth(id)
	main.ui.paragraph("기본 습득 · 장착 불필요 · MP 소모 없음")
	main.ui.paragraph("완성할 때 경험치 100을 얻고, 경험치 100당 숙련도가 1 오릅니다. 숙련도가 높을수록 좋은 품질이 나올 확률이 커집니다.")
	main.ui.paragraph("좋은 모닥불은 더 오래 타며 요리를 빨리 완성합니다." if id=="crafting" else "좋은 요리는 허기를 더 많이 회복합니다.")
	if id=="crafting": main.ui.choice("모닥불 제작","목재 5개 · 3초",craft_menu)

func craft_menu() -> void:
	mode = "craft"
	_show()

func cook_menu(id: String) -> void:
	selected_fire = id
	mode = "cook"
	_show()

func _show() -> void:
	main.panel_mode = "life"
	main.ui.open_panel("제작 · 모닥불" if mode=="craft" else "모닥불 · 요리")
	if mode=="craft" and not active(): main.ui.section_tabs(["아이템","장비","제작"],2,[main._inventory,main._equipment_menu,craft_menu])
	_growth("crafting" if mode=="craft" else "cooking")
	if active():
		main.ui.paragraph(str(job.message))
		progress = main.ui.make_bar(Color("d49b45"),24)
		main.ui.content.add_child(progress)
		progress_label = main.ui.label("",14,main.ui.MUTED)
		main.ui.content.add_child(progress_label)
		main.ui.choice("작업 취소","재료는 소모하지 않습니다.",func(): send({"command":"life_cancel"}))
		return
	if not job.is_empty():
		main.ui.paragraph(str(job.get("message","")),main.ui.GOLD)
	var bag: Dictionary = main._state().get("inventory",{})
	if mode=="craft":
		main.ui.paragraph("목재 %d / 5 · 작업 3초" % int(bag.get("wood",0)))
		main.ui.paragraph("보통 30분 / 양호 45분 / 우수 60분 유지\n요리 6초 / 4초 / 3초",main.ui.MUTED)
		main.ui.choice("모닥불 만들기","목재 5개 → 모닥불 1개",func(): _start("life_craft"),int(bag.get("wood",0))<5 or sending)
	else:
		if not fires.has(selected_fire):
			main.ui.paragraph("모닥불의 불이 꺼졌습니다.")
			return
		var fire: Dictionary = fires[selected_fire]
		var spec: Array = CAMPFIRES[str(fire.itemId)]
		fire_label = main.ui.label("",14,main.ui.MUTED)
		main.ui.content.add_child(fire_label)
		main.ui.paragraph("조리 시간 %d초" % int(spec[1]))
		main.ui.paragraph("허기 회복 · 보통 40 / 양호 50 / 우수 60",main.ui.MUTED)
		for recipe in RECIPES:
			var materials: PackedStringArray = []
			var enough: bool = true
			for ingredient in recipe.ingredients:
				var needed: int = int(recipe.ingredients[ingredient])
				var count: int = int(bag.get(ingredient,0))
				materials.append("%s %d/%d" % [str(MATERIAL_NAMES[ingredient]),count,needed])
				if count<needed: enough = false
			main.ui.choice(str(recipe.name)+" 만들기"," + ".join(materials)+" → "+str(recipe.name)+" 1개",_start.bind("life_cook",str(recipe.id)),not enough or sending)
	main.ui.choice("소지품 보기","모닥불 설치 · 요리 먹기",main._inventory)

func _start(command: String, recipe_id: String = "grilledFish") -> void:
	if sending: return
	main.world.path.clear()
	main.world.touch_direction = Vector2.ZERO
	main.ui.reset_touch_controls()
	await send({"command":command,"campfireId":selected_fire,"recipeId":recipe_id} if command=="life_cook" else {"command":command})

func send(action: Dictionary) -> bool:
	if sending: return false
	sending = true
	var result: Dictionary = await main.combat_socket.request(action)
	sending = false
	if result.has("error"):
		main.ui.toast(str(result.get("message","요청을 처리하지 못했습니다.")))
		return false
	if int(result.get("transportGeneration",main.combat_socket.connection_generation))!=main.combat_socket.connection_generation: return false
	main._accept_online_result(result)
	return true

func eat(item_id: String) -> void:
	if await send({"command":"life_eat","itemId":item_id}):
		var food_name: String = str(main._item_master(item_id).get("definition",{}).get("name","요리"))
		main.ui.toast(food_name+" 섭취 완료. 허기 %d / 100" % int(main._state().get("arcanaLife",{}).get("hunger",100)))
		main._inventory()

func begin_placement(item_id: String) -> void:
	if blocking() or sending or not main.online_world: return
	if not main.world.indoor.is_empty():
		main.ui.toast("모닥불은 야외에 설치해 주세요.")
		return
	main.ui.close_panel()
	main.spatial_combat.cancel_aim()
	main.world.path.clear()
	main.world.touch_direction = Vector2.ZERO
	main.ui.reset_touch_controls()
	placing = true
	placement_item = item_id
	placement_point = main.world.player_position+Vector2(0,24)
	ghost = Fire.new()
	ghost.ghost = true
	main.world_renderer.add_child(ghost)
	placement_layer = Control.new()
	placement_layer.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	placement_layer.z_index = 180
	placement_layer.mouse_filter = Control.MOUSE_FILTER_STOP
	main.ui.root.add_child(placement_layer)
	placement_anchor = Node2D.new()
	placement_layer.add_child(placement_anchor)
	# Fixed hit targets in HUD space, centered under the fire's ground anchor.
	placement_cancel = _placement_button("cancel",Vector2(48,48),Vector2(-86,-24),Color("a85550"),"취소 · Esc")
	placement_cancel.pressed.connect(cancel_placement)
	placement_drag = _placement_button("move",Vector2(56,56),Vector2(-28,-28),Color("477db6"),"잡고 끌어서 위치 조정")
	placement_drag.gui_input.connect(_drag_start)
	placement_confirm = _placement_button("confirm",Vector2(48,48),Vector2(38,-24),Color("378568"),"설치 확정")
	placement_confirm.pressed.connect(_place)
	_update_placement_controls()

func _placement_button(kind: String, button_size: Vector2, at: Vector2, accent_color: Color, hint: String) -> Button:
	var button: Button = PlacementButton.new()
	button.set("kind",kind)
	button.set("accent",accent_color)
	button.set("primary",kind=="move")
	button.size = button_size
	button.custom_minimum_size = button_size
	button.position = at
	button.tooltip_text = hint
	button.accessibility_name = hint
	placement_anchor.add_child(button)
	return button

func _screen_to_map(screen: Vector2) -> Vector2:
	var local: Vector2 = main.viewport_host.get_global_transform().affine_inverse()*screen
	return main.world_renderer.pick(local*Vector2(main.viewport.size)/main.viewport_host.size)

func _drag_start(event: InputEvent) -> void:
	if not placing or sending or drag_owner!=-2: return
	if event is InputEventMouseButton and event.pressed and event.button_index==MOUSE_BUTTON_LEFT:
		drag_owner = -1
	elif event is InputEventScreenTouch and event.pressed:
		drag_owner = event.index
	else: return
	drag_origin_map = _screen_to_map(placement_drag.get_global_transform()*event.position)
	drag_origin_placement = placement_point
	placement_drag.accept_event()

func _drag_move(screen: Vector2) -> void:
	# Preserve the grab offset; the fire never jumps beneath the pointer.
	placement_point = (drag_origin_placement+_screen_to_map(screen)-drag_origin_map).snapped(Vector2.ONE)
	ghost.position = main.world_renderer.map_point(placement_point)
	_update_placement_controls()

func _update_placement_controls() -> void:
	if not placing or not is_instance_valid(placement_anchor): return
	var render_point: Vector2 = main.world_renderer.screen_point(placement_point)
	var screen: Vector2 = main.viewport_host.get_global_transform()*(render_point*main.viewport_host.size/Vector2(main.viewport.size))
	var at: Vector2 = placement_layer.get_global_transform().affine_inverse()*(screen+Vector2(0,44))
	var available: Vector2 = placement_layer.size
	at.x = clampf(at.x,94,maxf(94,available.x-94))
	at.y = clampf(at.y,32,maxf(32,available.y-36))
	placement_anchor.position = at
	var valid: bool = _valid_placement()
	placement_confirm.disabled = not valid or sending
	placement_cancel.disabled = sending
	placement_drag.disabled = sending
	placement_confirm.tooltip_text = "설치 확정" if valid else "설치할 수 없는 위치"
	placement_confirm.accessibility_name = placement_confirm.tooltip_text

func _valid_placement() -> bool:
	var player: Vector2 = main.world.player_position
	if player.distance_to(placement_point)>48 or player.distance_to(placement_point)<12: return false
	for x in [-8,0,8]:
		for y in [-8,0,8]:
			if not main.world._can_stand(placement_point+Vector2(x,y)): return false
	for door in main.world.entrances:
		var rect: Rect2 = door.get("area",Rect2())
		if rect.has_area() and rect.grow(12).has_point(placement_point): return false
	for fire in fires.values():
		if placement_point.distance_to(Vector2(float(fire.position.x),float(fire.position.y)))<20: return false
	return true

func _place() -> void:
	if sending or not _valid_placement(): return
	drag_owner = -2
	placement_confirm.disabled = true
	if await send({"command":"life_place","itemId":placement_item,"target":{"x":placement_point.x,"y":placement_point.y}}):
		cancel_placement()
		main.ui.toast("모닥불을 설치했습니다. 가까이에서 요리할 수 있습니다.")

func cancel_placement() -> void:
	drag_owner = -2
	placing = false
	if is_instance_valid(placement_layer): placement_layer.queue_free()
	if is_instance_valid(ghost): ghost.queue_free()

func _input(event: InputEvent) -> void:
	if not placing: return
	if event is InputEventKey and event.pressed and event.physical_keycode==KEY_ESCAPE:
		if not sending: cancel_placement()
		get_viewport().set_input_as_handled()
		return
	if drag_owner==-2: return
	if drag_owner==-1:
		if event is InputEventMouseMotion:
			_drag_move(event.position)
			get_viewport().set_input_as_handled()
		elif event is InputEventMouseButton and event.button_index==MOUSE_BUTTON_LEFT and not event.pressed:
			drag_owner = -2
			placement_drag.button_pressed = false
			# GUI must also receive release to clear its pointer capture.
	elif event is InputEventScreenDrag and event.index==drag_owner:
		_drag_move(event.position)
		get_viewport().set_input_as_handled()
	elif event is InputEventScreenTouch and event.index==drag_owner and not event.pressed:
		drag_owner = -2
		placement_drag.button_pressed = false
		# GUI must also receive touch release to clear its pointer capture.

func _notification(what: int) -> void:
	if what==NOTIFICATION_APPLICATION_FOCUS_OUT:
		drag_owner = -2
		if is_instance_valid(placement_drag): placement_drag.button_pressed = false

func _process(_delta: float) -> void:
	if not is_instance_valid(main): return
	if placing and (not main.world.indoor.is_empty() or main._online_fighting()): cancel_placement()
	if not main.combat_socket.socket_ready:
		if placing: cancel_placement()
	if placing and is_instance_valid(ghost):
		ghost.position = main.world_renderer.map_point(placement_point)
		var valid: bool = _valid_placement()
		ghost.modulate = Color(.5,1,.6,.65) if valid else Color(1,.4,.4,.65)
		_update_placement_controls()
	for node in fire_nodes.values():
		node.visible = main.world.indoor.is_empty()
		node.effects = main.world.effects_enabled
		node.reduced = main.world.reduced_motion
	if is_instance_valid(progress) and active():
		progress.value = clampf((now()-float(job.startedAt))/maxf(1,float(job.endsAt)-float(job.startedAt))*100,0,100)
		if is_instance_valid(progress_label): progress_label.text = "완료까지 %.1f초" % maxf(0,(float(job.endsAt)-now())/1000)
	if is_instance_valid(fire_label) and fires.has(selected_fire):
		var left: int = maxi(0,int((float(fires[selected_fire].expiresAt)-now())/1000))
		fire_label.text = "불이 꺼지기까지 %d분 %d초" % [left/60,left%60]