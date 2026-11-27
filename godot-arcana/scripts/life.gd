extends Node
## UI and projection only. Resources, quality rolls, expiry and growth are server-owned.
const Fire = preload("res://scripts/native_2d_campfire.gd")
const WorldRenderer = preload("res://scripts/native_2d_world.gd")
const PlacementButton = preload("res://scripts/placement_action_button.gd")
const ItemThumbnail = preload("res://scripts/item_thumbnail.gd")
const CookingAnimation := preload("res://scripts/cooking_animation.gd")
const WOODCUTTING_AXE := "woodcutting_axe"
const FOREST_TIMBER_ID := "forest_trees"
const FALLBACK_LIFE_CATALOG := {
	"crafting": [
		{"id": "lumber", "name": "목재", "ingredients": {"treeBranch": 2}, "results": ["wood", "wood", "wood"], "count": 3, "qualityRoll": false},
		{"id": "campfire", "name": "모닥불", "ingredients": {"wood": 5}, "results": ["campfire", "campfireFine", "campfireExcellent"], "count": 1, "qualityRoll": true},
	],
	"cooking": [
		{"id": "grilledFish", "name": "생선구이", "ingredients": {"riverFish": 1}, "results": ["grilledFish", "grilledFishFine", "grilledFishExcellent"], "count": 1, "qualityRoll": true},
		{"id": "grilledMushroom", "name": "버섯구이", "ingredients": {"mushroom": 1}, "results": ["grilledMushroom", "grilledMushroomFine", "grilledMushroomExcellent"], "count": 1, "qualityRoll": true},
		{"id": "roastedPotato", "name": "구운감자", "ingredients": {"potato": 1}, "results": ["roastedPotato", "roastedPotatoFine", "roastedPotatoExcellent"], "count": 1, "qualityRoll": true},
		{"id": "meatSkewer", "name": "고기꼬치", "ingredients": {"rawMeat": 1, "treeBranch": 1}, "results": ["meatSkewer", "meatSkewerFine", "meatSkewerExcellent"], "count": 1, "qualityRoll": true},
	],
	"campfires": {
		"campfire": {"quality": "보통", "minutes": 30, "cookSeconds": 6},
		"campfireFine": {"quality": "양호", "minutes": 45, "cookSeconds": 4},
		"campfireExcellent": {"quality": "우수", "minutes": 60, "cookSeconds": 3},
	},
	"foods": {
		"grilledFish": {"name": "생선구이", "quality": "보통", "hunger": 40},
		"grilledFishFine": {"name": "생선구이", "quality": "양호", "hunger": 50},
		"grilledFishExcellent": {"name": "생선구이", "quality": "우수", "hunger": 60},
		"grilledMushroom": {"name": "버섯구이", "quality": "보통", "hunger": 40},
		"grilledMushroomFine": {"name": "버섯구이", "quality": "양호", "hunger": 50},
		"grilledMushroomExcellent": {"name": "버섯구이", "quality": "우수", "hunger": 60},
		"roastedPotato": {"name": "구운감자", "quality": "보통", "hunger": 40},
		"roastedPotatoFine": {"name": "구운감자", "quality": "양호", "hunger": 50},
		"roastedPotatoExcellent": {"name": "구운감자", "quality": "우수", "hunger": 60},
		"meatSkewer": {"name": "고기꼬치", "quality": "보통", "hunger": 40},
		"meatSkewerFine": {"name": "고기꼬치", "quality": "양호", "hunger": 50},
		"meatSkewerExcellent": {"name": "고기꼬치", "quality": "우수", "hunger": 60},
	},
	"materials": {"riverFish": "민물고기", "mushroom": "버섯", "potato": "감자", "rawMeat": "고기", "treeBranch": "나뭇가지", "wood": "목재"},
	"maxQuantity": 20,
	"craftSeconds": 3,
	"homeCookSeconds": 4,
}
var main: Node
var job: Dictionary = {}
var skills: Array = []
var _forest_trees: Dictionary = {}
var _forest_hits_required := 0
var _forest_revisions: Dictionary = {}
var _forest_observed := false
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
var cooking_animation: CookingAnimation
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
var _selected_craft_id := ""
var _selected_quantity: int = 1
var _displayed_bag: Dictionary = {}
var _catalog: Dictionary = FALLBACK_LIFE_CATALOG
var _catalog_game := ""
var _catalog_revision := 0
var _displayed_catalog_revision := -1

func _ready() -> void:
	main.ui.panel_closed.connect(func():
		if active(): send({"command":"life_cancel"})
		elif job.get("phase") in ["success", "cancelled"]: dismissed_job = str(job.id))

func accept_catalog(game_id: String, snapshot: Dictionary) -> void:
	var catalog: Dictionary = _catalog if _catalog_game == game_id else FALLBACK_LIFE_CATALOG
	_catalog_game = game_id
	if snapshot.has("lifeCatalog"):
		var supplied: Variant = snapshot.lifeCatalog
		catalog = supplied if _valid_catalog(supplied) else FALLBACK_LIFE_CATALOG
	elif snapshot.has("arcanaItemCatalog"):
		# A full reply from a legacy server has item definitions but no life catalog.
		catalog = FALLBACK_LIFE_CATALOG
	if catalog != _catalog:
		_catalog_revision += 1
	_catalog = catalog

func _named(value: Variant) -> bool:
	return value is String and not value.is_empty()

func _whole_number(value: Variant, minimum: int = 1) -> bool:
	return (value is int or value is float) and value >= minimum and value <= 9_007_199_254_740_991 and value == floor(value)

func _valid_recipes(rows: Variant) -> bool:
	if not rows is Array: return false
	var ids := {}
	for row: Variant in rows:
		if not row is Dictionary or not _named(row.get("id")) or not _named(row.get("name")) \
			or not row.get("ingredients") is Dictionary or not row.get("results") is Array \
			or not _whole_number(row.get("count")) or not row.get("qualityRoll") is bool:
			return false
		if ids.has(row.id) or row.results.size() != 3: return false
		ids[row.id] = true
		for item_id: Variant in row.ingredients:
			if not _named(item_id) or not _whole_number(row.ingredients[item_id]): return false
		for item_id: Variant in row.results:
			if not _named(item_id): return false
	return true

func _valid_catalog(catalog: Variant) -> bool:
	if not catalog is Dictionary or not _valid_recipes(catalog.get("crafting")) or not _valid_recipes(catalog.get("cooking")) \
		or not catalog.get("campfires") is Dictionary or not catalog.get("foods") is Dictionary or not catalog.get("materials") is Dictionary \
		or not _whole_number(catalog.get("maxQuantity")) or not _whole_number(catalog.get("craftSeconds")) or not _whole_number(catalog.get("homeCookSeconds")):
		return false
	for item_id: Variant in catalog.campfires:
		var fire: Variant = catalog.campfires[item_id]
		if not _named(item_id) or not fire is Dictionary or not _named(fire.get("quality")) \
			or not _whole_number(fire.get("minutes")) or not _whole_number(fire.get("cookSeconds")):
			return false
	for item_id: Variant in catalog.foods:
		var food: Variant = catalog.foods[item_id]
		if not _named(item_id) or not food is Dictionary or not _named(food.get("name")) or not _named(food.get("quality")) \
			or not _whole_number(food.get("hunger"), 0):
			return false
	for item_id: Variant in catalog.materials:
		if not _named(item_id) or not _named(catalog.materials[item_id]): return false
	return true

func _recipes(crafting: bool) -> Array:
	return _catalog.crafting if crafting else _catalog.cooking

func _recipe_by_id(recipe_id: String, crafting: bool) -> Dictionary:
	for recipe: Dictionary in _recipes(crafting):
		if recipe.id == recipe_id: return recipe
	return {}

func _first_recipe_using(item_id: String, crafting: bool) -> Dictionary:
	for recipe: Dictionary in _recipes(crafting):
		if recipe.ingredients.has(item_id): return recipe
	return {}

func inventory_recipe(item_id: String) -> Dictionary:
	var craft := _first_recipe_using(item_id, true)
	if not craft.is_empty(): return {"crafting": true, "recipe": craft}
	var cook := _first_recipe_using(item_id, false)
	return {} if cook.is_empty() else {"crafting": false, "recipe": cook}

func _material_name(item_id: String) -> String:
	return str(_catalog.materials.get(item_id, item_id))

func recipe_hint(recipe: Dictionary) -> String:
	var parts := PackedStringArray()
	for item_id: String in recipe.ingredients:
		parts.append("%s %d개" % [_material_name(item_id), int(recipe.ingredients[item_id])])
	return "%s → %s %d개" % [" · ".join(parts), str(recipe.name), int(recipe.count)]

func is_campfire(item_id: String) -> bool:
	return _catalog.campfires.has(item_id)

func campfire_items() -> Array:
	return _catalog.campfires.keys()

func campfire_hint(item_id: String) -> String:
	var fire: Dictionary = _catalog.campfires.get(item_id, {})
	if fire.is_empty(): return ""
	return "야외 빈 땅 · %d분 유지 · 요리 1회 %d초" % [int(fire.minutes), int(fire.cookSeconds)]

func _campfire_seconds(item_id: String) -> int:
	return int(_catalog.campfires.get(item_id, {}).get("cookSeconds", 0))

func _campfire_recipe_id() -> String:
	for recipe: Dictionary in _recipes(true):
		for item_id: String in recipe.results:
			if is_campfire(item_id): return str(recipe.id)
	return ""

func food_hunger(item_id: String) -> int:
	return int(_catalog.foods.get(item_id, {}).get("hunger", -1))

func _food_name(item_id: String) -> String:
	var food: Dictionary = _catalog.foods.get(item_id, {})
	if food.is_empty(): return "요리"
	return "%s · %s" % [str(food.name), str(food.quality)]

func active() -> bool:
	return job.get("phase","")=="active"

func blocking() -> bool:
	return placing or active()

func now() -> float:
	return server_now+float(Time.get_ticks_msec()-observed_at) if observed_at>0 else Time.get_unix_time_from_system()*1000.0

func kitchen_cook_progress() -> float:
	if not active() or job.get("kind") != "cook" or not job.get("homeKitchen", false) or not main.combat_socket.socket_ready:
		return -1.0
	return _job_fraction(now())

func _job_fraction(current_time: float) -> float:
	var started_at := float(job.startedAt)
	return clampf((current_time - started_at) / maxf(1.0, float(job.endsAt) - started_at), 0.0, 1.0)

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
		if update.has("forestTrees") or update.has("forestTree"):
			accept_forest_trees(update)
		else:
			accept_forest_trees(value)
		if update.has("lifeActivity"):
			var was_active: bool = active()
			var previous_id: String = str(job.get("id", ""))
			var previous_phase: String = str(job.get("phase", ""))
			job = update.lifeActivity if update.lifeActivity is Dictionary else {}
			if previous_id != str(job.get("id", "")) or previous_phase != str(job.get("phase", "")):
				redraw = true
				if was_active and not active() and not job.is_empty():
					main.ui.toast(str(job.get("message","")))
	_sync_fires()
	if main.panel_mode == "life" and main.ui.overlay.visible:
		if redraw or (not active() and (_displayed_catalog_revision != _catalog_revision or _displayed_bag != main._state().get("inventory", {}))) \
			or (_has_result() and mode == "cook" and hunger_at_result != _hunger()):
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
	return JSON.stringify([_catalog_revision, _hunger(), main._state().get("inventory", {}), _peaceful(), sending, main.combat_socket.socket_ready])

func _refresh_meals() -> void:
	if main.ui.overlay.visible and main.panel_mode == "life_meals" and _meal_signature() != meals_key:
		var scroll: int = main.ui.panel_scroll.scroll_vertical
		meal_menu()
		main.ui.panel_scroll.set_deferred("scroll_vertical",scroll)

func _gather() -> void:
	if not await send({"command":"life_gather"}): return
	main.ui.toast(str(_life_state().get("lastMessage","재료를 모았습니다.")))

func accept_forest_trees(update: Dictionary) -> void:
	if main._state().get("location", "") != main.CityGrid.FOREST_AREA:
		_forest_observed = false
		_forest_trees.clear()
		_forest_revisions.clear()
		main.world.set_forest_trees_felled({})
		return
	var primary: Variant = update.get("forestTree")
	var projected: Variant = update.get("forestTrees")
	if not primary is Dictionary and not projected is Dictionary: return
	_forest_hits_required = int(update.get("forestHitsRequired", 0))
	_forest_trees = projected.duplicate() if projected is Dictionary else {}
	if primary is Dictionary: _forest_trees[FOREST_TIMBER_ID] = primary
	var felled := {}
	for tree_id: String in _forest_trees:
		var tree: Dictionary = _forest_trees[tree_id]
		if tree.get("felled", false): felled[tree_id] = true
	main.world.set_forest_trees_felled(felled)
	main.world_renderer.sync_forest_trees()
	for tree_id: String in _forest_trees:
		var tree: Dictionary = _forest_trees[tree_id]
		var revision := int(tree.get("revision", 0))
		var hit_at: Variant = tree.get("lastHitAt")
		var recent_hit := (hit_at is float or hit_at is int) and now() - float(hit_at) < 1800.0
		if _forest_observed and recent_hit and revision > int(_forest_revisions.get(tree_id, 0)) and not main.simplified_play.enabled:
			var local_hit: bool = str(tree.get("lastHitBy", "")) == main.online_presence.character_id
			main.world_renderer.play_forest_tree_hit(tree_id, local_hit, tree.get("felled", false))
		_forest_revisions[tree_id] = revision
	_forest_observed = true

func axe_equipped() -> bool:
	return main.snapshot.get("arcanaEquipment", {}).get("mainHand", "") == WOODCUTTING_AXE

func forest_chop_caption(tree_id: String = FOREST_TIMBER_ID) -> String:
	var tree: Dictionary = _forest_trees.get(tree_id, {})
	if tree.get("felled", false): return "나무가 자라는 중"
	if not axe_equipped(): return "도끼 장착 필요"
	var remaining := int(tree.get("hitsRemaining", _forest_hits_required))
	return "벌목 · %d회 남음" % remaining if remaining > 0 else "벌목하기"

func can_chop_wood(tree_id: String = FOREST_TIMBER_ID) -> bool:
	return axe_equipped() and _forest_observed and main.world.forest_tree_available(tree_id) \
		and not sending and _peaceful() and main.combat_socket.socket_ready

func chop_wood(tree_id: String = FOREST_TIMBER_ID, text_selection: bool = false) -> void:
	if main._state().get("location", "") != main.CityGrid.FOREST_AREA or not _peaceful() or main.busy: return
	if not axe_equipped():
		main.ui.toast("장비 창에서 벌목 도끼를 장착해 주세요.")
		return
	if not can_chop_wood(tree_id): return
	var action := {"command": "life_chop_wood", "treeId": tree_id}
	if text_selection: action.textPlace = "forest_trees"
	if not await send(action): return
	var fallback := "목재 1개를 얻었습니다." if not main.world.forest_tree_available(tree_id) else forest_chop_caption(tree_id)
	main.ui.toast(str(_life_state().get("lastMessage", fallback)))

func meal_menu() -> void:
	main.panel_mode = "life_meals"
	main.ui.open_panel("식사")
	meals_key = _meal_signature()
	var hunger: int = _hunger()
	main.ui.paragraph("허기 %d / 100" % hunger,main.ui.GOLD)
	var bag: Dictionary = main._state().get("inventory",{})
	var available: int = 0
	for item_id: String in _catalog.foods:
		var count: int = int(bag.get(item_id,0))
		if count <= 0: continue
		available += 1
		var food_name := _food_name(item_id)
		var hint: String = "%d개 · 허기 %d → %d / 100" % [count,hunger,mini(100,hunger+food_hunger(item_id))]
		if hunger >= 100: hint = "%d개 · 지금은 배가 부릅니다." % count
		main.ui.choice(food_name+" 먹기",hint,eat.bind(item_id),hunger >= 100 or sending or not _peaceful() or not main.combat_socket.socket_ready,"",main._item_thumbnail(item_id))
	if available == 0: main.ui.paragraph("가방에 완성한 요리가 없습니다. 광장에서 재료를 모아 집 주방이나 모닥불에서 구워 보세요.",main.ui.MUTED)

func prefer_cooking_ingredient(item_id: String) -> bool:
	var recipe := _first_recipe_using(item_id, false)
	if recipe.is_empty(): return false
	dismissed_job = str(job.get("id", ""))
	_selected_recipe_id = str(recipe.id)
	_selected_quantity = 1
	return true

func home_kitchen() -> void:
	if not _at_home():
		main.ui.toast("집으로 돌아와 주방을 이용해 주세요.")
		return
	selected_fire = "home_kitchen"
	_selected_quantity = 1
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

func craft_menu(for_cooking: bool = false, recipe_id: String = "") -> void:
	var requested_recipe := _campfire_recipe_id() if for_cooking else recipe_id
	if for_cooking and requested_recipe.is_empty():
		main.ui.toast("제작할 수 있는 모닥불이 없습니다.")
		return
	continue_to_cooking = for_cooking
	_selected_quantity = 1
	if not requested_recipe.is_empty():
		if not for_cooking: dismissed_job = str(job.get("id", ""))
		_selected_craft_id = requested_recipe
	mode = "craft"
	_show()

func cook_menu(id: String) -> void:
	selected_fire = id
	_selected_quantity = 1
	mode = "cook"
	_show()

func _hunger() -> int:
	return int(_life_state().get("hunger",100))

func _result_counts() -> Dictionary:
	var counts: Variant = job.get("resultCounts", {})
	if counts is Dictionary and not counts.is_empty(): return counts
	var item_id := str(job.get("itemId", ""))
	if item_id.is_empty(): return {}
	var recipe := _recipe_by_id(str(job.get("recipeId", "")), job.get("kind", "") == "craft")
	return {item_id: int(recipe.get("count", 1))}

func _result_item(campfire_only: bool = false) -> String:
	var bag: Dictionary = main._state().get("inventory", {})
	var recent := str(job.get("itemId", ""))
	if int(bag.get(recent, 0)) > 0 and (not campfire_only or is_campfire(recent)): return recent
	for item_id: String in _result_counts():
		if int(bag.get(item_id, 0)) > 0 and (not campfire_only or is_campfire(item_id)): return item_id
	return ""

func _has_result() -> bool:
	if job.get("phase") not in ["success", "cancelled"] or job.get("kind") != mode or str(job.id) == dismissed_job: return false
	if mode == "cook" and (not job.get("homeKitchen",false) or selected_fire != "home_kitchen") and job.get("campfireId","") != selected_fire: return false
	return not _result_item().is_empty()

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
	if active():
		mode = str(job.get("kind", mode))
		if mode == "cook": selected_fire = "home_kitchen" if job.get("homeKitchen", false) else str(job.get("campfireId", selected_fire))
	main.panel_mode = "life"
	var dock_left: bool = false
	if mode == "cook" and fires.has(selected_fire):
		var point: Dictionary = fires[selected_fire].position
		var fire_raster: Vector2 = main.world_renderer.screen_point(Vector2(float(point.x), float(point.y)))
		var fire_screen := WorldRenderer.raster_to_display(main.viewport_host, main.viewport.size, fire_raster)
		dock_left = fire_screen.x > get_viewport().get_visible_rect().get_center().x
	var working := active()
	var show_world_cook: bool = working and mode == "cook" and job.get("homeKitchen", false) \
		and not main.simplified_play.enabled and main.world.indoor == "arcana_home" \
		and is_instance_valid(main.world_renderer.room3d)
	var has_result := not working and _has_result()
	if mode == "craft":
		if working or has_result:
			main.ui.open_tab_panel("제작 · 모닥불")
		else:
			main._open_skills_tab(1)
	elif show_world_cook:
		var focus := func() -> Rect2:
			var player_point: Vector2 = main.world.player_position
			var feet_raster: Vector2 = main.world_renderer.screen_point(player_point)
			var head_raster: Vector2 = main.world_renderer.actor_label_point(player_point)
			var feet := WorldRenderer.raster_to_display(main.viewport_host, main.viewport.size, feet_raster)
			var head := WorldRenderer.raster_to_display(main.viewport_host, main.viewport.size, head_raster)
			return Rect2(head, feet - head)
		main.ui.open_panel("집 · 주방", true, false, false, false, focus)
	else:
		main.ui.open_panel("집 · 주방" if selected_fire == "home_kitchen" else "모닥불 · 요리", true, dock_left)
	_displayed_bag = main._state().get("inventory", {}).duplicate()
	_displayed_catalog_revision = _catalog_revision
	progress = null
	progress_label = null
	cooking_animation = null
	fire_label = null
	if working:
		var recipe_id := str(job.get("recipeId", "campfire" if mode == "craft" else "grilledFish"))
		if mode == "cook":
			var using_kitchen: bool = job.get("homeKitchen", false)
			if not show_world_cook:
				cooking_animation = CookingAnimation.new()
				main.ui.content.add_child(cooking_animation)
				cooking_animation.setup(recipe_id, using_kitchen)
			var caption := str(job.message)
			if recipe_id == "grilledFish":
				caption = "주방에서 생선을 굽고 있습니다." if using_kitchen else "모닥불에 생선을 굽고 있습니다."
			main.ui.paragraph(caption, main.ui.GOLD)
		else:
			var recipe := _recipe_by_id(recipe_id, true)
			var product_id := str(recipe.results[0]) if not recipe.is_empty() else str(job.get("itemId", recipe_id))
			_show_product(product_id, str(job.message))
		progress = main.ui.make_bar(Color("d49b45"),24)
		main.ui.content.add_child(progress)
		progress_label = main.ui.label("",14,main.ui.MUTED)
		if show_world_cook: progress_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		main.ui.content.add_child(progress_label)
		main.ui.choice("작업 취소","완료한 결과·숙련도는 유지됩니다. 남은 재료는 소모하지 않습니다.",func(): send({"command":"life_cancel"}),sending or not main.combat_socket.socket_ready)
		return
	if has_result:
		var item_id := _result_item()
		var completed := int(job.get("completed", 1 if job.get("phase") == "success" else 0))
		var quantity := int(job.get("quantity", 1))
		main.ui.paragraph("%d / %d회 완료%s" % [completed, quantity, " · 작업 취소" if job.get("phase") == "cancelled" else ""], main.ui.GOLD)
		var counts := _result_counts()
		for result_id: String in counts:
			var product_name: String = str(main._item_master(result_id).get("definition",{}).get("name",result_id))
			_show_product(result_id, "%s %d개" % [product_name, int(counts[result_id])])
		var campfire_id := _result_item(true) if mode == "craft" else ""
		if not campfire_id.is_empty():
			var indoors: bool = not main.world.indoor.is_empty()
			var campfire_name := str(main._item_master(campfire_id).get("definition", {}).get("name", "모닥불"))
			var detail := "실내에서는 설치할 수 없습니다. 가방에 보관한 뒤 야외에서 설치해 주세요." if indoors \
				else "%s 1개 · %s" % [campfire_name, campfire_hint(campfire_id)]
			main.ui.choice("이 모닥불 설치", detail, begin_placement.bind(campfire_id, continue_to_cooking),
				indoors or sending or not main.combat_socket.socket_ready)
		elif mode == "cook":
			hunger_at_result = _hunger()
			var recovery := food_hunger(item_id)
			if recovery >= 0:
				var full_at_result := hunger_at_result >= 100
				var meal_hint := "배가 부릅니다. 가방에 보관했다가 드실 수 있습니다." if full_at_result else "허기 %d / 100 → %d / 100" % [hunger_at_result,mini(100,hunger_at_result+recovery)]
				main.ui.choice("바로 먹기",_food_name(item_id)+" 1개 · "+meal_hint,eat.bind(item_id,true),full_at_result or sending or not main.combat_socket.socket_ready)
		main.ui.choice("가방에 보관","소지품에서 언제든 사용할 수 있습니다.",main.ui.close_panel)
		main.ui.choice("계속 만들기" if mode == "craft" else "계속 요리하기","",func():
			dismissed_job = str(job.id)
			_selected_quantity = 1
			_show())
		return
	var bag: Dictionary = main._state().get("inventory",{})
	if mode == "craft":
		_show_recipes(_recipes(true), bag, int(_catalog.craftSeconds), "life_craft")
		main.ui.paragraph("나뭇가지는 광장에서 모을 수 있습니다. 모닥불은 야외 빈 땅에 설치합니다.",main.ui.MUTED)
		_growth("crafting")
	else:
		var at_kitchen: bool = selected_fire == "home_kitchen" and _at_home()
		if not at_kitchen and not fires.has(selected_fire):
			main.ui.paragraph("모닥불의 불이 꺼졌습니다." if selected_fire != "home_kitchen" else "집으로 돌아와 주방을 이용해 주세요.")
			main.ui.choice("소지품 보기","모닥불 설치 · 요리 먹기",main._inventory)
			return
		var cook_seconds := int(_catalog.homeCookSeconds)
		if not at_kitchen:
			var fire: Dictionary = fires[selected_fire]
			cook_seconds = _campfire_seconds(str(fire.itemId))
			if cook_seconds <= 0:
				main.ui.paragraph("이 모닥불의 조리 정보를 확인할 수 없습니다.")
				return
		_show_recipes(_recipes(false), bag, cook_seconds, "life_cook")
		if at_kitchen:
			main.ui.paragraph("집 주방에서는 모닥불 없이 요리할 수 있습니다.", main.ui.MUTED)
		else:
			fire_label = main.ui.label("",14,main.ui.MUTED)
			fire_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
			main.ui.content.add_child(fire_label)
		main.ui.paragraph("완성한 요리는 품질에 따라 허기를 회복합니다.", main.ui.MUTED)

func _max_quantity(ingredients: Dictionary, bag: Dictionary) -> int:
	var available := int(_catalog.maxQuantity)
	for item_id: String in ingredients:
		available = mini(available, int(int(bag.get(item_id, 0)) / maxi(1, int(ingredients[item_id]))))
	return maxi(0, available)

func _quantity_button(caption: String, accessible_name: String, width: int = 44) -> Button:
	var button := Button.new()
	button.text = caption
	button.accessibility_name = accessible_name
	button.custom_minimum_size = Vector2(width, 44)
	button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	return button

func _show_recipes(definitions: Array, bag: Dictionary, seconds: int, command: String) -> void:
	var crafting := command == "life_craft"
	if definitions.is_empty():
		main.ui.paragraph("지금 이용할 수 있는 제작법이 없습니다." if crafting else "지금 이용할 수 있는 조리법이 없습니다.", main.ui.MUTED)
		return
	var selected_id: String = _selected_craft_id if crafting else _selected_recipe_id
	var grid := GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_theme_constant_override("v_separation", 8)
	main.ui.content.add_child(grid)
	var quantity_row := HBoxContainer.new()
	quantity_row.add_theme_constant_override("separation", 8)
	main.ui.content.add_child(quantity_row)
	var minus := _quantity_button("−", "작업 횟수 줄이기")
	quantity_row.add_child(minus)
	var quantity_label: Label = main.ui.label("1회", 16, main.ui.INK)
	quantity_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	quantity_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	quantity_row.add_child(quantity_label)
	var plus := _quantity_button("+", "작업 횟수 늘리기")
	quantity_row.add_child(plus)
	var maximum := _quantity_button("최대", "가능한 최대 횟수 선택", 56)
	quantity_row.add_child(maximum)
	var detail := VBoxContainer.new()
	detail.add_theme_constant_override("separation", 6)
	main.ui.content.add_child(detail)
	var start_button: Button = main.ui.button("제작하기" if crafting else "요리하기", func():
		_start(command, _selected_craft_id if crafting else _selected_recipe_id), Vector2(0, 44))
	main.ui.content.add_child(start_button)
	var idle_style: StyleBoxFlat = main.ui.style(Color.TRANSPARENT, main.ui.TEXT_RULE)
	var selected_style: StyleBoxFlat = main.ui.style(main.ui.TEXT_SKY, main.ui.TEXT_ACCENT)
	var recipes: Dictionary[String, Dictionary] = {}
	var refresh := func() -> void:
		var current_id: String = _selected_craft_id if crafting else _selected_recipe_id
		if not recipes.has(current_id): return
		var recipe: Dictionary = recipes[current_id]
		var available := _max_quantity(recipe.ingredients, bag)
		_selected_quantity = clampi(_selected_quantity, 1, maxi(1, available))
		var locked: bool = sending or not main.combat_socket.socket_ready
		minus.disabled = locked or _selected_quantity <= 1
		plus.disabled = locked or _selected_quantity >= available
		maximum.disabled = locked or available <= _selected_quantity
		quantity_label.text = "%d회" % _selected_quantity
		start_button.disabled = locked or available < 1
		start_button.text = ("제작하기" if crafting else "요리하기") + (" · %d회" % _selected_quantity if _selected_quantity > 1 else "")
		_show_ingredients(detail, recipe, bag, seconds, _selected_quantity, available)
	minus.pressed.connect(func():
		_selected_quantity -= 1
		refresh.call())
	plus.pressed.connect(func():
		_selected_quantity += 1
		refresh.call())
	maximum.pressed.connect(func():
		var current_id: String = _selected_craft_id if crafting else _selected_recipe_id
		_selected_quantity = _max_quantity(recipes[current_id].ingredients, bag)
		refresh.call())
	var select_recipe := func(recipe_id: String) -> void:
		var previous_id: String = _selected_craft_id if crafting else _selected_recipe_id
		if recipes.has(previous_id):
			var previous: Button = recipes[previous_id].button
			previous.add_theme_stylebox_override("normal", idle_style)
		if previous_id != recipe_id: _selected_quantity = 1
		if crafting: _selected_craft_id = recipe_id
		else: _selected_recipe_id = recipe_id
		var selected: Button = recipes[recipe_id].button
		selected.add_theme_stylebox_override("normal", selected_style)
		refresh.call()
	var first_available := ""
	for definition: Dictionary in definitions:
		var recipe_id := str(definition.id)
		if _max_quantity(definition.ingredients, bag) > 0 and first_available.is_empty(): first_available = recipe_id
		var button: Button = main.ui.button(str(definition.name), select_recipe.bind(recipe_id), Vector2(0, 56))
		button.disabled = sending or not main.combat_socket.socket_ready
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.icon = main._item_thumbnail(str(definition.results[0]))
		button.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		button.add_theme_constant_override("icon_max_width", ItemThumbnail.SIDE)
		button.add_theme_stylebox_override("normal", idle_style)
		button.add_theme_stylebox_override("hover", selected_style)
		button.add_theme_stylebox_override("pressed", selected_style)
		for font_state: String in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color"]:
			button.add_theme_color_override(font_state, main.ui.INK)
		grid.add_child(button)
		var recipe: Dictionary = definition.duplicate()
		recipe.button = button
		recipes[recipe_id] = recipe
	if not recipes.has(selected_id):
		selected_id = first_available if not first_available.is_empty() else str(definitions[0].id)
	select_recipe.call(selected_id)
	if first_available.is_empty():
		main.ui.paragraph("재료가 부족합니다. 광장에서 재료를 모으거나 소지품을 확인해 주세요.", main.ui.MUTED)

func _show_ingredients(detail: VBoxContainer, recipe: Dictionary, bag: Dictionary, seconds: int, quantity: int, available: int) -> void:
	for child in detail.get_children():
		detail.remove_child(child)
		child.queue_free()
	for item_id: String in recipe.ingredients:
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 4)
		var texture: Texture2D = main._item_thumbnail(item_id)
		if texture != null: row.add_child(ItemThumbnail.new(texture, 28))
		var caption := "%s %d개 소요 / 보유 %d개" % [_material_name(item_id), int(recipe.ingredients[item_id]) * quantity, int(bag.get(item_id, 0))]
		var material: Label = main.ui.label(caption, 14, main.ui.MUTED)
		material.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		material.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(material)
		detail.add_child(row)
	var summary: Label = main.ui.label("1회 %d초 · 전체 %d초 · 최대 %d회\n%s %d개 완성 예정%s" % [seconds, seconds * quantity, available, recipe.name, quantity * int(recipe.count), " · 매회 품질 판정" if recipe.qualityRoll else ""], 14, main.ui.MUTED)
	summary.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	summary.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	detail.add_child(summary)

func _start(command: String, recipe_id: String) -> void:
	if sending or _recipe_by_id(recipe_id, command == "life_craft").is_empty(): return
	main.world.path.clear()
	main.world.touch_direction = Vector2.ZERO
	main.ui.reset_touch_controls()
	var action: Dictionary = {"command":command,"recipeId":recipe_id,"quantity":_selected_quantity}
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
	if result.get("resync", false) or not confirmed:
		main.ui.toast("작업 상태를 갱신했습니다. 다시 시도해 주세요.")
		return false
	return true

func eat(item_id: String, at_fire: bool = false) -> void:
	if food_hunger(item_id) < 0: return
	if not await send({"command":"life_eat","itemId":item_id}): return
	var food_name := _food_name(item_id)
	main.ui.toast(food_name+" 섭취 완료. 허기 %d / 100" % _hunger())
	if at_fire:
		dismissed_job = str(job.get("id",""))
		if main.panel_mode == "life" and main.ui.overlay.visible: main.ui.close_panel()
	elif main.panel_mode == "inventory" and main.ui.overlay.visible:
		main._inventory()

func begin_placement(item_id: String, for_cooking: bool = false) -> void:
	if blocking() or sending or not main.online_world or not is_campfire(item_id): return
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
	if main.world.forest_active and point.distance_to(main.world.field_spawn) < 20: return false
	for x in [-8,0,8]:
		for y in [-8,0,8]:
			if not main.world._can_stand(point+Vector2(x,y)): return false
	# Match the outdoor door circles exported for the world server.
	for entity in main.world.entities:
		if entity.kind == "forest_entrance" and point.distance_to(entity.pos) < float(entity.interaction_radius) + 12.0: return false
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
		fraction = _job_fraction(current_time)
		if is_instance_valid(cooking_animation) and cooking_animation.is_visible_in_tree():
			var still: bool = main.world.reduced_motion or not main.world.effects_enabled
			var elapsed_seconds := fraction * (ends_at - started_at) / 1000.0
			cooking_animation.present(fraction, elapsed_seconds, still)
		if is_instance_valid(progress):
			progress.value = (int(job.get("completed", 0)) + fraction) / maxi(1, int(job.get("quantity", 1))) * 100.0
			if is_instance_valid(progress_label):
				var completed := int(job.get("completed", 0))
				var quantity := maxi(1, int(job.get("quantity", 1)))
				var cycle_left := maxf(0.0, (ends_at - current_time) / 1000.0)
				var total_left := cycle_left + maxi(0, quantity - completed - 1) * maxf(0.0, (ends_at - started_at) / 1000.0)
				progress_label.text = "%d / %d회 완료 · 이번 %.1f초\n전체 남은 시간 약 %.1f초" % [completed, quantity, cycle_left, total_left]
	if is_instance_valid(fire_label) and fires.has(selected_fire):
		var fire: Dictionary = fires[selected_fire]
		var left_ms := maxf(0.0, float(fire.expiresAt) - now())
		var left := floori(left_ms / 1000.0)
		fire_label.text = "불이 꺼지기까지 %d분 %d초" % [left/60,left%60]
		var seconds_per_serving := _campfire_seconds(str(fire.itemId))
		if seconds_per_serving > 0:
			var servings_left := maxi(0, floori((left_ms - 1.0) / (seconds_per_serving * 1000.0)))
			if _selected_quantity > servings_left:
				fire_label.text += "\n불이 꺼지기 전까지 약 %d회 완성할 수 있습니다." % servings_left

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
		node.visible = main.world.indoor.is_empty()
		node.effects = main.world.effects_enabled
		node.reduced = main.world.reduced_motion
		var roasting: bool = working and job.get("kind") == "cook" and job.get("campfireId") == id
		node.set_cooking_progress(str(job.get("recipeId", "grilledFish")) if roasting else "", fraction)
