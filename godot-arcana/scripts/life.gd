extends Node
## UI and projection only. Resources, quality rolls, expiry and growth are server-owned.
const Fire = preload("res://scripts/native_2d_campfire.gd")
const WorldRenderer = preload("res://scripts/native_2d_world.gd")
const PlacementButton = preload("res://scripts/placement_action_button.gd")
const ItemThumbnail = preload("res://scripts/item_thumbnail.gd")
const CAMPFIRES = {"campfire":[30,6],"campfireFine":[45,4],"campfireExcellent":[60,3]}
const FOODS = {"grilledFish":40,"grilledFishFine":50,"grilledFishExcellent":60,"grilledMushroom":40,"grilledMushroomFine":50,"grilledMushroomExcellent":60,"roastedPotato":40,"roastedPotatoFine":50,"roastedPotatoExcellent":60,"meatSkewer":40,"meatSkewerFine":50,"meatSkewerExcellent":60}
const CRAFT_RESULTS := {"lumber": "wood", "campfire": "campfire"}
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
var meals_key: String = ""
var socket_connected: bool = false
var _selected_recipe_id := ""

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
	_refresh_meals()
	_try_placed_fire()

func _life_state() -> Dictionary:
	var value: Variant = main._state().get("arcanaLife",{})
	return value if value is Dictionary else {}

func _at_home() -> bool:
	return str(main._state().get("location","")) == "arcana_home"

func _peaceful() -> bool:
	return main.online_world and not main._online_fighting() and not main.fishing.visible and not blocking()

func _meal_signature() -> String:
	return JSON.stringify([_hunger(), main._state().get("inventory", {}), _peaceful(), sending, main.combat_socket.socket_ready])

func _refresh_meals() -> void:
	if main.ui.overlay.visible and main.panel_mode == "life_meals" and _meal_signature() != meals_key:
		var scroll: int = main.ui.panel_scroll.scroll_vertical
		meal_menu()
		main.ui.panel_scroll.set_deferred("scroll_vertical",scroll)

func _gather() -> void:
	if not await send({"command":"life_gather"}): return
	main.ui.toast(str(_life_state().get("lastMessage","재료를 모았습니다.")))

func meal_menu() -> void:
	main.panel_mode = "life_meals"
	main.ui.open_panel("식사")
	meals_key = _meal_signature()
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
		main.ui.choice(name+" 먹기",hint,eat.bind(item_id),hunger >= 100 or sending or not _peaceful() or not main.combat_socket.socket_ready,"",main._item_thumbnail(item_id))
	if available == 0: main.ui.paragraph("가방에 완성한 요리가 없습니다. 광장에서 재료를 모아 집 주방이나 모닥불에서 구워 보세요.",main.ui.MUTED)

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
	if not main.simplified_play.enabled: sync_fire_visuals()
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

func sync_fire_visuals() -> void:
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

func skill_info(id: String) -> Dictionary:
	for skill in skills:
		if skill.id==id: return skill
	return {"id":id,"name":"제작" if id=="crafting" else "요리","mastery":0,"xp":0,"chances":[85,14,1]}

func _growth(id: String) -> void:
	var skill: Dictionary = skill_info(id)
	main.ui.skill_progress(main._skill_mastery_progress(id))
	var chances: Array = skill.chances
	main.ui.paragraph("품질 확률 · 보통 %.1f%% / 양호 %.1f%% / 우수 %.1f%%" % [float(chances[0]),float(chances[1]),float(chances[2])],main.ui.MUTED)

func show_skill(id: String) -> void:
	main.panel_mode = "skills"
	main.ui.open_panel("생활 스킬 · "+str(skill_info(id).name))
	_growth(id)
	main.ui.paragraph("장착 불필요 · MP 소모 없음")
	main.ui.paragraph("완성할 때 경험치 100을 얻고, 경험치 100당 숙련도가 1 오릅니다. 숙련도가 높을수록 좋은 품질이 나올 확률이 커집니다.")
	main.ui.paragraph("좋은 모닥불은 더 오래 타며 요리를 빨리 완성합니다." if id=="crafting" else "좋은 요리는 허기를 더 많이 회복합니다.")
	if id=="crafting": main.ui.choice("목재·모닥불 제작","나뭇가지로 목재 만들기 · 모닥불 만들기",craft_menu,false,"crafting")

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
		row.add_child(ItemThumbnail.new(texture))
	var title: Label = main.ui.label(caption,16,main.ui.GOLD,true)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	row.add_child(title)

func _show() -> void:
	main.panel_mode = "life"
	var dock_left: bool = false
	if mode == "cook" and fires.has(selected_fire):
		var point: Dictionary = fires[selected_fire].position
		var fire_raster: Vector2 = main.world_renderer.screen_point(Vector2(float(point.x), float(point.y)))
		var fire_screen := WorldRenderer.raster_to_display(main.viewport_host, main.viewport.size, fire_raster)
		dock_left = fire_screen.x > get_viewport().get_visible_rect().get_center().x
	var working := active()
	var has_result := not working and _has_result()
	if mode == "craft":
		if working or has_result:
			main.ui.open_tab_panel("제작 · 모닥불")
		else:
			main._open_skills_tab(1)
	else:
		main.ui.open_panel("집 · 주방" if selected_fire == "home_kitchen" else "모닥불 · 요리", true, dock_left)
	progress = null
	progress_label = null
	fire_label = null
	if working:
		var recipe_id := str(job.get("recipeId", "campfire" if mode == "craft" else "grilledFish"))
		if recipe_id == "grilledFish":
			_show_product("riverFish","주방에서 생선을 굽고 있습니다." if job.get("homeKitchen",false) else "모닥불에 생선을 굽고 있습니다.")
		else:
			var product_id := str(CRAFT_RESULTS.get(recipe_id, recipe_id))
			_show_product(product_id, str(job.message))
		progress = main.ui.make_bar(Color("d49b45"),24)
		main.ui.content.add_child(progress)
		progress_label = main.ui.label("",14,main.ui.MUTED)
		main.ui.content.add_child(progress_label)
		main.ui.choice("작업 취소","재료는 소모하지 않습니다.",func(): send({"command":"life_cancel"}),sending)
		return
	if has_result:
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
		var branches := int(bag.get("treeBranch", 0))
		var wood := int(bag.get("wood", 0))
		var locked: bool = sending or not main.combat_socket.socket_ready
		main.ui.choice("나뭇가지로 목재 만들기", "나뭇가지 %d / 2개 → 목재 3개 · 3초" % branches,
			_start.bind("life_craft", "lumber"), branches < 2 or locked, "",
			main._item_thumbnail(CRAFT_RESULTS.lumber), main._item_thumbnail("treeBranch"))
		main.ui.choice("모닥불 만들기", "목재 %d / 5개 · 3초" % wood,
			_start.bind("life_craft", "campfire"), wood < 5 or locked, "",
			main._item_thumbnail(CRAFT_RESULTS.campfire), main._item_thumbnail("wood"))
		main.ui.paragraph("나뭇가지는 광장에서 모을 수 있습니다. 목재는 품질 구분 없이 3개씩 만듭니다. 모닥불은 야외 빈 땅에 설치하며 30~60분 동안 타오릅니다.",main.ui.MUTED)
		_growth("crafting")
	else:
		var at_kitchen: bool = selected_fire == "home_kitchen" and _at_home()
		if not at_kitchen and not fires.has(selected_fire):
			main.ui.paragraph("모닥불의 불이 꺼졌습니다." if selected_fire != "home_kitchen" else "집으로 돌아와 주방을 이용해 주세요.")
			main.ui.choice("소지품 보기","모닥불 설치 · 요리 먹기",main._inventory)
			return
		var cook_seconds: int = 4
		if not at_kitchen:
			var fire: Dictionary = fires[selected_fire]
			cook_seconds = int(CAMPFIRES[str(fire.itemId)][1])
		_show_cook_recipes(bag, cook_seconds)
		if at_kitchen:
			main.ui.paragraph("집 주방에서는 모닥불 없이 요리할 수 있습니다.", main.ui.MUTED)
		else:
			fire_label = main.ui.label("",14,main.ui.MUTED)
			main.ui.content.add_child(fire_label)
		main.ui.paragraph("완성한 요리는 품질에 따라 허기 40~60을 회복합니다.", main.ui.MUTED)

func _show_cook_recipes(bag: Dictionary, cook_seconds: int) -> void:
	var grid := GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_theme_constant_override("v_separation", 8)
	main.ui.content.add_child(grid)
	var detail := HFlowContainer.new()
	detail.add_theme_constant_override("h_separation", 10)
	main.ui.content.add_child(detail)
	var cook_button: Button = main.ui.button("요리하기", func(): _start("life_cook", _selected_recipe_id), Vector2(0, 44))
	main.ui.content.add_child(cook_button)

	var idle_style: StyleBoxFlat = main.ui.style(Color.TRANSPARENT, main.ui.TEXT_RULE)
	var selected_style: StyleBoxFlat = main.ui.style(main.ui.TEXT_SKY, main.ui.TEXT_ACCENT)
	var recipes: Dictionary[String, Dictionary] = {}
	var select_recipe := func(recipe_id: String) -> void:
		if recipes.has(_selected_recipe_id):
			var previous: Button = recipes[_selected_recipe_id].button
			previous.add_theme_stylebox_override("normal", idle_style)
		_selected_recipe_id = recipe_id
		var recipe: Dictionary = recipes[recipe_id]
		var selected: Button = recipe.button
		selected.add_theme_stylebox_override("normal", selected_style)
		_show_ingredients(detail, recipe.ingredients, bag, cook_seconds)
		cook_button.disabled = not recipe.enough or sending or not main.combat_socket.socket_ready

	var first_available := ""
	for recipe: Dictionary in RECIPES:
		var recipe_id := str(recipe.id)
		var enough := true
		for ingredient: String in recipe.ingredients:
			if int(bag.get(ingredient, 0)) < int(recipe.ingredients[ingredient]): enough = false
		if enough and first_available.is_empty(): first_available = recipe_id
		var button: Button = main.ui.button(str(recipe.name), select_recipe.bind(recipe_id), Vector2(0, 56))
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.icon = main._item_thumbnail(recipe_id)
		button.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		button.add_theme_constant_override("icon_max_width", ItemThumbnail.SIDE)
		button.add_theme_stylebox_override("normal", idle_style)
		button.add_theme_stylebox_override("hover", selected_style)
		button.add_theme_stylebox_override("pressed", selected_style)
		for font_state: String in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color"]:
			button.add_theme_color_override(font_state, main.ui.INK)
		grid.add_child(button)
		recipes[recipe_id] = {
			"button": button,
			"ingredients": recipe.ingredients,
			"enough": enough,
		}
	var selected_id := _selected_recipe_id
	if not recipes.has(selected_id):
		selected_id = first_available if not first_available.is_empty() else str(RECIPES[0].id)
	select_recipe.call(selected_id)
	if first_available.is_empty():
		main.ui.paragraph("요리할 재료가 부족합니다. 광장에서 버섯·감자를 모으거나 물가에서 민물고기를 낚아 보세요.", main.ui.MUTED)

func _show_ingredients(detail: HFlowContainer, ingredients: Dictionary, bag: Dictionary, cook_seconds: int) -> void:
	for child in detail.get_children():
		detail.remove_child(child)
		child.queue_free()
	for item_id: String in ingredients:
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 4)
		var texture: Texture2D = main._item_thumbnail(item_id)
		if texture != null:
			row.add_child(ItemThumbnail.new(texture, 28))
		var caption := "%s %d/%d" % [MATERIAL_NAMES[item_id], int(bag.get(item_id, 0)), int(ingredients[item_id])]
		row.add_child(main.ui.label(caption, 14, main.ui.MUTED))
		detail.add_child(row)
	detail.add_child(main.ui.label("%d초" % cook_seconds, 14, main.ui.MUTED))

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
	_refresh_meals()
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
	var confirmed: bool = result.get("actionReceipt", {}).get("id", "") == action_id
	if action.command == "life_cancel":
		confirmed = not active()
	elif action.command == "life_storage_open":
		confirmed = result.get("actionId", "") == action_id
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
	if main.simplified_play.enabled:
		_text_placement(item_id, for_cooking)
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

func _text_placement(item_id: String, for_cooking: bool) -> void:
	main.world.path.clear()
	main.world.touch_direction = Vector2.ZERO
	var point := _initial_placement()
	var valid := _valid_placement(point)
	main.panel_mode = "life_placement"
	main.ui.open_panel("모닥불 설치")
	if valid:
		main.ui.paragraph("현재 위치 근처의 빈 땅에 모닥불을 설치합니다.")
		main.ui.choice("설치 확정", "", _place_from_text.bind(item_id, point, for_cooking))
	else:
		main.ui.paragraph("근처에 설치할 자리가 없습니다. 다른 곳으로 이동해 주세요.")
	main.ui.choice("취소", "", main.ui.close_panel)

func _place_from_text(item_id: String, point: Vector2, for_cooking: bool) -> void:
	if sending or main._online_fighting(): return
	if not _valid_placement(point):
		_text_placement(item_id, for_cooking)
		return
	if not await _request_placement(item_id, point): return
	var panel_open: bool = main.panel_mode == "life_placement" and main.ui.overlay.visible
	if panel_open: main.ui.close_panel()
	_placement_complete(point, for_cooking and panel_open)

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
	if await _request_placement(placement_item, placement_point):
		cancel_placement()
		_placement_complete(placement_point, continue_to_cooking)

func _request_placement(item_id: String, point: Vector2) -> bool:
	return await send({"command":"life_place","itemId":item_id,"target":{"x":point.x,"y":point.y}})

func _placement_complete(point: Vector2, for_cooking: bool) -> void:
	if for_cooking: placed_for_cooking = point
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
	if socket_connected != main.combat_socket.socket_ready:
		socket_connected = main.combat_socket.socket_ready
		_refresh_actions()
	var working := active()
	var fraction := 0.0
	if working:
		var current_time := now()
		var started_at := float(job.startedAt)
		var ends_at := float(job.endsAt)
		fraction = clampf((current_time - started_at) / maxf(1.0, ends_at - started_at), 0.0, 1.0)
		if is_instance_valid(progress):
			progress.value = fraction * 100.0
			if is_instance_valid(progress_label):
				progress_label.text = "완료까지 %.1f초" % maxf(0.0, (ends_at - current_time) / 1000.0)
	if is_instance_valid(fire_label) and fires.has(selected_fire):
		var left: int = maxi(0,int((float(fires[selected_fire].expiresAt)-now())/1000))
		fire_label.text = "불이 꺼지기까지 %d분 %d초" % [left/60,left%60]

	if main.simplified_play.enabled: return
	if placing and (not main.world.indoor.is_empty() or main._online_fighting()): cancel_placement()
	if not main.combat_socket.socket_ready:
		if placing: cancel_placement()
	if placing and is_instance_valid(ghost):
		ghost.position = main.world_renderer.map_point(placement_point)
		_update_placement_controls()
	var height_scale: float = main.world_renderer.plaza3d.overlay_height_scale() if main.world_renderer.uses_plaza_v2() else 1.0
	if placing and is_instance_valid(ghost): ghost.sprite.scale.y = height_scale
	for id in fire_nodes:
		var node = fire_nodes[id]
		node.sprite.scale.y = height_scale
		var roasting: bool = working and job.get("recipeId") == "grilledFish" and job.get("campfireId") == id
		node.set_cooking_progress(fraction if roasting else -1.0)
		node.visible = main.world.indoor.is_empty()
		node.effects = main.world.effects_enabled
		node.reduced = main.world.reduced_motion
