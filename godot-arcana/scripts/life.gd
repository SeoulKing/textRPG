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
var continue_to_cooking: bool = false
var placed_for_cooking := Vector2.INF
var dismissed_job: String = ""
var hunger_at_result: int = -1
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
var journal_key: String = ""
var meals_key: String = ""
var journal_connected: bool = false

func _ready() -> void:
	main.ui.panel_closed.connect(func():
		if active(): send({"command":"life_cancel"})
		elif job.get("phase") == "success": dismissed_job = str(job.id))

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
	var redraw: bool = false
	if value.has("campfires"):
		var had_fire: bool = fires.has(selected_fire)
		fires.clear()
		for fire in value.campfires: fires[str(fire.id)] = fire
		redraw = mode == "cook" and had_fire != fires.has(selected_fire)
	if value.get("self") is Dictionary:
		var update: Dictionary = value.self
		skills = update.get("lifeSkills",skills)
		if update.has("lifeActivity"):
			var was_active: bool = active()
			var old_key: String = str(job.get("id",""))+str(job.get("phase",""))
			job = update.lifeActivity if update.lifeActivity is Dictionary else {}
			if old_key != str(job.get("id","")) + str(job.get("phase","")):
				redraw = true
				if was_active and not active() and not job.is_empty():
					main.ui.toast(str(job.get("message","")))
	_sync_fires()
	if main.panel_mode == "life" and main.ui.overlay.visible:
		if redraw or (_has_result() and mode == "cook" and hunger_at_result != _hunger()):
			_show()
	_refresh_journal()
	_try_placed_fire()

func _life_state() -> Dictionary:
	var value: Variant = main._state().get("arcanaLife",{})
	return value if value is Dictionary else {}

func _at_home() -> bool:
	return str(main._state().get("location","")) == "arcana_home"

func _peaceful() -> bool:
	return main.online_world and not main._online_fighting() and not main.fishing.visible and not blocking()

func _location_name() -> String:
	var location: String = str(main._state().get("location","arcana_plaza"))
	if location == "arcana_home": return "내 집"
	for place: Dictionary in main.snapshot.get("visibleLocations",[]):
		if str(place.get("id","")) == location: return str(place.get("name","분수 광장")).trim_prefix("아르카나 ")
	return {"arcana_plaza":"분수 광장","arcana_inn":"여관","arcana_shop":"상점","arcana_academy":"마법 학원","arcana_hunting_ground":"사냥터"}.get(location,"지금 있는 곳")

func _journal_signature() -> String:
	var life: Dictionary = _life_state()
	return JSON.stringify([life.get("day",1),life.get("gatheredToday",0),life.get("cookedMeals",0),life.get("craftedItems",0),life.get("lastMessage",""),_hunger(),main._state().get("location",""),main._state().get("inventory",{}),_peaceful(),sending,main.combat_socket.socket_ready])

func _refresh_journal() -> void:
	if not main.ui.overlay.visible or main.panel_mode not in ["life_journal","life_meals"]: return
	var key: String = _journal_signature()
	if main.panel_mode == "life_journal" and key != journal_key:
		var scroll: int = main.ui.panel_scroll.scroll_vertical
		journal_menu()
		main.ui.panel_scroll.set_deferred("scroll_vertical",scroll)
	elif main.panel_mode == "life_meals" and key != meals_key:
		var scroll: int = main.ui.panel_scroll.scroll_vertical
		meal_menu()
		main.ui.panel_scroll.set_deferred("scroll_vertical",scroll)

func journal_menu() -> void:
	if active():
		mode = str(job.get("kind","craft"))
		selected_fire = "home_kitchen" if job.get("homeKitchen",false) else str(job.get("campfireId",selected_fire))
		_show()
		return
	main.panel_mode = "life_journal"
	main.ui.open_panel("생활 수첩")
	journal_key = _journal_signature()
	var life: Dictionary = _life_state()
	var gathered: int = int(life.get("gatheredToday",0))
	main.ui.paragraph("%d일차 · %s" % [int(life.get("day",1)),_location_name()],main.ui.GOLD)
	main.ui.paragraph("오늘 채집 %d / 3회 · 요리 누계 %d개 · 제작 누계 %d개\n허기 %d / 100" % [gathered,int(life.get("cookedMeals",0)),int(life.get("craftedItems",0)),_hunger()])
	var next_step: String = "광장 야외에서 재료를 모아 보세요. 나뭇가지는 목재로, 버섯과 감자는 요리로 만들 수 있습니다."
	if _at_home(): next_step = "주방에서 요리하고 거실에서 제작할 수 있습니다. 침실에서 쉬면 체력과 마력이 회복됩니다."
	elif gathered >= 3: next_step = "오늘 모을 재료는 모두 챙겼습니다. 요리를 먹거나 집 침실에서 하루를 마무리해 보세요."
	elif gathered > 0: next_step = "모은 재료로 요리나 제작을 해 보세요. 집 침실에서 쉬면 다음 날 다시 채집할 수 있습니다."
	main.ui.paragraph(next_step,main.ui.MUTED)
	var last_message: String = str(life.get("lastMessage",""))
	if not last_message.is_empty(): main.ui.paragraph(last_message,main.ui.GOLD)
	var ready: bool = _peaceful() and main.combat_socket.socket_ready and not sending
	var at_plaza: bool = str(main._state().get("location","")) == "arcana_plaza" and main.world.indoor.is_empty()
	var gather_hint: String = "목재 2 · 나뭇가지 2 · "+("감자 1" if gathered == 1 else "버섯 1")+" · 허기 %d 감소" % mini(5,_hunger())
	if not at_plaza: gather_hint = "분수 광장 야외로 나가 재료를 모아 주세요."
	elif gathered >= 3: gather_hint = "오늘 채집을 마쳤습니다. 집 침실에서 하루를 마무리해 주세요."
	main.ui.choice("주변 재료 모으기",gather_hint,_gather,not ready or not at_plaza or gathered >= 3)
	main.ui.choice("주방으로 가기" if _at_home() else "요리하기","집 주방으로 걸어가 재료를 굽습니다." if _at_home() else "가까운 모닥불로 이동하거나 모닥불 제작·설치를 준비합니다.",main.home_walk_to.bind("home_kitchen") if _at_home() else main.prepare_cooking,not ready)
	main.ui.choice("모닥불·목재 만들기","나뭇가지 2개 → 목재 3개 · 목재 5개 → 모닥불",craft_menu,not ready)
	main.ui.choice("요리 꺼내 먹기","가방의 요리로 허기를 채웁니다.",meal_menu,not ready)
	main.ui.choice("내 집 둘러보기" if _at_home() else "내 집으로","주방 · 침실 · 거실",main.open_home,not ready)

func _gather() -> void:
	if not await send({"command":"life_gather"}): return
	main.ui.toast(str(_life_state().get("lastMessage","재료를 모았습니다.")))

func meal_menu() -> void:
	main.panel_mode = "life_meals"
	main.ui.open_panel("생활 수첩 · 식사")
	meals_key = _journal_signature()
	var hunger: int = _hunger()
	main.ui.paragraph("허기 %d / 100" % hunger,main.ui.GOLD)
	var bag: Dictionary = main._state().get("inventory",{})
	var available: int = 0
	for item_id: String in FOODS:
		var count: int = int(bag.get(item_id,0))
		if count <= 0: continue
		available += 1
		var name: String = str(main._item_master(item_id).get("definition",{}).get("name","요리"))
		var hint: String = "%d개 · 허기 %d → %d / 100" % [count,hunger,mini(100,hunger+int(FOODS[item_id]))]
		if hunger >= 100: hint = "%d개 · 지금은 배가 부릅니다." % count
		main.ui.choice(name+" 먹기",hint,eat.bind(item_id),hunger >= 100 or sending or not _peaceful() or not main.combat_socket.socket_ready)
	if available == 0: main.ui.paragraph("가방에 완성한 요리가 없습니다. 광장에서 재료를 모아 집 주방이나 모닥불에서 구워 보세요.",main.ui.MUTED)
	main.ui.choice("생활 수첩으로","",journal_menu)

func home_kitchen() -> void:
	if not _at_home():
		main.ui.toast("집으로 돌아와 주방을 이용해 주세요.")
		return
	selected_fire = "home_kitchen"
	mode = "cook"
	_show()

func home_rest() -> void:
	if str(main._state().get("location","")) not in ["arcana_home","arcana_inn"] or not _peaceful(): return
	if not await send({"command":"life_rest"}): return
	main.ui.toast(str(_life_state().get("lastMessage","푹 쉬었습니다.")))
	if main.ui.overlay.visible and main.panel_mode == "home" and main.ui.panel_title.text == "내 집 · 침실":
		main._home_bedroom()

func _try_placed_fire() -> void:
	if placed_for_cooking == Vector2.INF: return
	if main.ui.overlay.visible or not main.world.indoor.is_empty() or main.world.player_position.distance_to(placed_for_cooking) > 26:
		placed_for_cooking = Vector2.INF
		return
	for fire in fires.values():
		var point := Vector2(float(fire.position.x),float(fire.position.y))
		if point.is_equal_approx(placed_for_cooking):
			placed_for_cooking = Vector2.INF
			cook_menu(str(fire.id))
			return

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
	if id=="crafting": main.ui.choice("목재·모닥불 제작","나뭇가지로 목재 만들기 · 모닥불 만들기",craft_menu)

func craft_menu(for_cooking: bool = false) -> void:
	continue_to_cooking = for_cooking
	mode = "craft"
	_show()

func cook_menu(id: String) -> void:
	selected_fire = id
	mode = "cook"
	_show()

func _hunger() -> int:
	return int(_life_state().get("hunger",100))

func _has_result() -> bool:
	if job.get("phase") != "success" or job.get("kind") != mode or str(job.id) == dismissed_job: return false
	if mode == "cook" and (not job.get("homeKitchen",false) or selected_fire != "home_kitchen") and job.get("campfireId","") != selected_fire: return false
	return int(main._state().get("inventory",{}).get(job.get("itemId",""),0)) > 0

func _show_product(item_id: String, caption: String) -> void:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation",10)
	main.ui.content.add_child(row)
	var texture: Texture2D = main._item_thumbnail(item_id)
	if texture != null:
		var icon := TextureRect.new()
		icon.texture = texture
		icon.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		icon.custom_minimum_size = Vector2(48,48)
		icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
		row.add_child(icon)
	var title: Label = main.ui.label(caption,16,main.ui.GOLD,true)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	row.add_child(title)

func _show() -> void:
	main.panel_mode = "life"
	var dock_left: bool = false
	if mode == "cook" and fires.has(selected_fire):
		var point: Dictionary = fires[selected_fire].position
		var fire_screen: Vector2 = main.world_renderer.screen_point(Vector2(float(point.x),float(point.y)))
		dock_left = fire_screen.x > main.viewport.size.x * 0.5
	main.ui.open_panel("제작 · 모닥불" if mode == "craft" else ("집 · 주방" if selected_fire == "home_kitchen" else "모닥불 · 요리"),true,dock_left)
	progress = null
	progress_label = null
	fire_label = null
	if active():
		if job.get("recipeId") == "grilledFish":
			_show_product("riverFish","주방에서 생선을 굽고 있습니다." if job.get("homeKitchen",false) else "모닥불에 생선을 굽고 있습니다.")
		else:
			main.ui.paragraph(str(job.message))
		progress = main.ui.make_bar(Color("d49b45"),24)
		main.ui.content.add_child(progress)
		progress_label = main.ui.label("",14,main.ui.MUTED)
		main.ui.content.add_child(progress_label)
		main.ui.choice("작업 취소","재료는 소모하지 않습니다.",func(): send({"command":"life_cancel"}),sending)
		return
	if _has_result():
		var item_id := str(job.itemId)
		var product_name: String = str(main._item_master(item_id).get("definition",{}).get("name","모닥불" if mode == "craft" else "요리"))
		_show_product(item_id,product_name + (" 3개 완성" if job.get("recipeId","") == "lumber" else " 완성"))
		if mode == "craft" and job.get("recipeId","") != "lumber":
			var indoors: bool = not main.world.indoor.is_empty()
			main.ui.choice("이 모닥불 설치","실내에서는 설치할 수 없습니다. 가방에 보관한 뒤 야외에서 설치해 주세요." if indoors else "빈 땅에 놓고 요리합니다.",begin_placement.bind(item_id,continue_to_cooking),indoors or sending or not main.combat_socket.socket_ready)
		elif mode == "cook":
			hunger_at_result = _hunger()
			var full_at_result := hunger_at_result >= 100
			var meal_hint := "배가 부릅니다. 가방에 보관했다가 드실 수 있습니다." if full_at_result else "허기 %d / 100 → %d / 100" % [_hunger(),mini(100,_hunger()+int(FOODS[item_id]))]
			main.ui.choice("바로 먹기",meal_hint,eat.bind(item_id,true),full_at_result or sending)
		main.ui.choice("가방에 보관","소지품에서 언제든 사용할 수 있습니다.",main.ui.close_panel)
		main.ui.choice("계속 만들기" if mode == "craft" else "계속 요리하기","",func():
			dismissed_job = str(job.id)
			_show())
		return
	var bag: Dictionary = main._state().get("inventory",{})
	if mode == "craft":
		main.ui.section_tabs(["아이템","장비","제작"],2,[main._inventory,main._equipment_menu,craft_menu])
		main.ui.choice("나뭇가지로 목재 만들기","나뭇가지 %d / 2개 → 목재 3개 · 3초" % int(bag.get("treeBranch",0)),_start.bind("life_craft","lumber"),int(bag.get("treeBranch",0)) < 2 or sending or not main.combat_socket.socket_ready)
		main.ui.choice("모닥불 만들기","목재 %d / 5개 · 3초" % int(bag.get("wood",0)),_start.bind("life_craft","campfire"),int(bag.get("wood",0)) < 5 or sending or not main.combat_socket.socket_ready)
		main.ui.paragraph("나뭇가지는 광장에서 모을 수 있습니다. 목재는 품질 구분 없이 3개씩 만듭니다. 모닥불은 야외 빈 땅에 설치하며 30~60분 동안 타오릅니다.",main.ui.MUTED)
		_growth("crafting")
	else:
		var at_kitchen: bool = selected_fire == "home_kitchen" and _at_home()
		if not at_kitchen and not fires.has(selected_fire):
			main.ui.paragraph("모닥불의 불이 꺼졌습니다." if selected_fire != "home_kitchen" else "집으로 돌아와 주방을 이용해 주세요.")
			main.ui.choice("소지품 보기","모닥불 설치 · 요리 먹기",main._inventory)
			return
		var cook_seconds: int = 4
		if at_kitchen:
			main.ui.paragraph("집 주방에서는 모닥불을 설치하지 않고 요리할 수 있습니다.",main.ui.MUTED)
		else:
			var fire: Dictionary = fires[selected_fire]
			cook_seconds = int(CAMPFIRES[str(fire.itemId)][1])
			fire_label = main.ui.label("",14,main.ui.MUTED)
			main.ui.content.add_child(fire_label)
		var available_recipes: int = 0
		for recipe in RECIPES:
			var materials: PackedStringArray = []
			var enough: bool = true
			for ingredient in recipe.ingredients:
				var needed: int = int(recipe.ingredients[ingredient])
				var count: int = int(bag.get(ingredient,0))
				materials.append("%s %d/%d" % [str(MATERIAL_NAMES[ingredient]),count,needed])
				if count < needed: enough = false
			if enough: available_recipes += 1
			var title: String = "생선 굽기" if recipe.id == "grilledFish" else str(recipe.name)+" 만들기"
			main.ui.choice(title," + ".join(materials)+" · %d초"%cook_seconds,_start.bind("life_cook",str(recipe.id)),not enough or sending or not main.combat_socket.socket_ready)
		if available_recipes == 0: main.ui.paragraph("요리할 재료가 부족합니다. 광장에서 버섯·감자를 모으거나 물가에서 민물고기를 낚아 보세요.",main.ui.MUTED)
		main.ui.paragraph("완성한 요리는 품질에 따라 허기 40~60을 회복합니다.",main.ui.MUTED)
	main.ui.choice("생활 수첩으로","채집 · 제작 · 요리 · 식사",journal_menu)

func _start(command: String, recipe_id: String = "campfire") -> void:
	if sending: return
	main.world.path.clear()
	main.world.touch_direction = Vector2.ZERO
	main.ui.reset_touch_controls()
	var action: Dictionary = {"command":command,"recipeId":recipe_id}
	if command == "life_cook" and selected_fire != "home_kitchen": action.campfireId = selected_fire
	var started: bool = await send(action)
	if started and active() and (not main.ui.overlay.visible or main.panel_mode != "life"):
		# The player dismissed the panel while the start request was in flight.
		await send({"command":"life_cancel"})

func _refresh_actions() -> void:
	_refresh_journal()
	if main.ui.overlay.visible and main.panel_mode == "life": _show()

func send(action: Dictionary) -> bool:
	if sending: return false
	if not main.combat_socket.socket_ready:
		main.ui.toast("세계 서버에 연결한 뒤 다시 시도해 주세요.")
		return false
	sending = true
	_refresh_actions()
	var action_id: String = main._new_action_id()
	action.actionId = action_id
	var result: Dictionary = await main.combat_socket.request(action)
	sending = false
	if int(result.get("transportGeneration",main.combat_socket.connection_generation)) != main.combat_socket.connection_generation:
		_refresh_actions()
		return false
	if result.has("error"):
		_refresh_actions()
		main.ui.toast(str(result.get("message","요청을 처리하지 못했습니다.")))
		return false
	main._accept_online_result(result)
	_refresh_actions()
	var confirmed: bool = not active() if action.command == "life_cancel" else result.get("actionReceipt", {}).get("id", "") == action_id
	if result.get("resync", false) or not confirmed:
		main.ui.toast("작업 상태를 갱신했습니다. 다시 시도해 주세요.")
		return false
	return true

func eat(item_id: String, at_fire: bool = false) -> void:
	if not await send({"command":"life_eat","itemId":item_id}): return
	var food_name: String = str(main._item_master(item_id).get("definition",{}).get("name","요리"))
	main.ui.toast(food_name+" 섭취 완료. 허기 %d / 100" % _hunger())
	if at_fire:
		dismissed_job = str(job.get("id",""))
		if main.panel_mode == "life" and main.ui.overlay.visible: main.ui.close_panel()
	elif main.panel_mode == "inventory" and main.ui.overlay.visible:
		main._inventory()

func begin_placement(item_id: String, for_cooking: bool = false) -> void:
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
	continue_to_cooking = for_cooking
	placement_point = _initial_placement()
	if not _valid_placement(placement_point):
		main.ui.toast("빈 땅 쪽으로 모닥불을 끌어 주세요.")
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
	var valid: bool = _valid_placement(placement_point)
	ghost.modulate = Color(.5,1,.6,.65) if valid else Color(1,.4,.4,.65)
	placement_confirm.disabled = not valid or sending
	placement_cancel.disabled = sending
	placement_drag.disabled = sending
	placement_confirm.tooltip_text = "설치 확정" if valid else "설치할 수 없는 위치"
	placement_confirm.accessibility_name = placement_confirm.tooltip_text

func _initial_placement() -> Vector2:
	var player: Vector2 = main.world.player_position
	for distance: int in [20,24,16]:
		for direction: int in range(8):
			var point := (player + Vector2.DOWN.rotated(direction * PI / 4.0) * distance).round()
			if _valid_placement(point): return point
	return (player + Vector2.DOWN * 20).round()

func _valid_placement(point: Vector2) -> bool:
	var player: Vector2 = main.world.player_position
	if player.distance_to(point) > 48 or player.distance_to(point) < 12: return false
	for x in [-8,0,8]:
		for y in [-8,0,8]:
			if not main.world._can_stand(point+Vector2(x,y)): return false
	# Match the outdoor door circles exported for the world server.
	for entity in main.world.entities:
		if entity.kind in ["building","exit","gate","city","portal","slime"] and point.distance_to(entity.pos) < 60: return false
	if not main.world.uses_plaza_v2():
		for gate: Vector2 in [main.world.CityMap.CITY_RETURN,main.world.CityMap.FIELD_ENTRY]:
			if point.distance_to(gate) < 84: return false
	for actor in main.online_presence.packet.get("players",[]):
		if actor.id != main.online_presence.character_id and point.distance_to(Vector2(float(actor.position.x),float(actor.position.y))) < 12: return false
	for fire in fires.values():
		if point.distance_to(Vector2(float(fire.position.x),float(fire.position.y))) < 20: return false
	return true

func _place() -> void:
	if sending or not _valid_placement(placement_point): return
	drag_owner = -2
	placement_confirm.disabled = true
	if await send({"command":"life_place","itemId":placement_item,"target":{"x":placement_point.x,"y":placement_point.y}}):
		if continue_to_cooking: placed_for_cooking = placement_point
		cancel_placement()
		main.ui.toast("모닥불을 설치했습니다. 가까이에서 요리할 수 있습니다.")
		_try_placed_fire()

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
	if journal_connected != main.combat_socket.socket_ready:
		journal_connected = main.combat_socket.socket_ready
		_refresh_actions()
	if placing and (not main.world.indoor.is_empty() or main._online_fighting()): cancel_placement()
	if not main.combat_socket.socket_ready:
		if placing: cancel_placement()
	if placing and is_instance_valid(ghost):
		ghost.position = main.world_renderer.map_point(placement_point)
		_update_placement_controls()
	var height_scale: float = main.world_renderer.plaza3d.overlay_height_scale() if main.world_renderer.uses_plaza_v2() else 1.0
	if placing and is_instance_valid(ghost): ghost.sprite.scale.y = height_scale
	var fraction: float = 0.0
	if active():
		fraction = clampf((now()-float(job.startedAt))/maxf(1,float(job.endsAt)-float(job.startedAt)),0,1)
	for id in fire_nodes:
		var node = fire_nodes[id]
		node.sprite.scale.y = height_scale
		var roasting: bool = active() and job.get("recipeId") == "grilledFish" and job.get("campfireId") == id
		node.set_cooking_progress(fraction if roasting else -1.0)
		node.visible = main.world.indoor.is_empty()
		node.effects = main.world.effects_enabled
		node.reduced = main.world.reduced_motion
	if is_instance_valid(progress) and active():
		progress.value = fraction * 100
		if is_instance_valid(progress_label): progress_label.text = "완료까지 %.1f초" % maxf(0,(float(job.endsAt)-now())/1000)
	if is_instance_valid(fire_label) and fires.has(selected_fire):
		var left: int = maxi(0,int((float(fires[selected_fire].expiresAt)-now())/1000))
		fire_label.text = "불이 꺼지기까지 %d분 %d초" % [left/60,left%60]