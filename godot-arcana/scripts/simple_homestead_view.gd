extends RefCounted

const SimplifiedView = preload("res://scripts/simplified_view.gd")
const ELEMENT_NAMES := {"ember": "불", "leaf": "잎", "water": "물"}
const ELEMENT_ADVANTAGE := {"ember": "leaf", "leaf": "water", "water": "ember"}
const PLOT_STAGE_NAMES := {"seed": "씨앗", "sprout": "새싹", "ready": "수확 가능"}
const VILLAGE_SUPPLY_HINTS := {
	"fish": "광장 물가에서 낚시",
	"wood": "연못가 숲 → 벌목지에서 벌목",
	"meal": "내 집 → 주방에서 민물고기 굽기",
}
const MAX_BOND := 2

var _duel_options_open := false


func reset_duel_options() -> void:
	_duel_options_open = false


func render(view: SimplifiedView, state: Dictionary, area: String, submit: Callable, close: Callable, locked: bool, animate_duel_impact: bool = false, reduced_motion: bool = false, continue_from_duel: Callable = Callable(), open_inn_supply: Callable = Callable()) -> void:
	view.set_pond_layout(false)
	view.set_local_map_state("", "", {}, false)
	view.set_combat_layout(false)
	view.set_combatants(false, "", &"", 0, 1, false)
	var actions: Array[Dictionary] = []
	var battle: Dictionary = state.get("battle") if state.get("battle") is Dictionary else {}
	var forest_battle := area == "forest" and not battle.is_empty()
	var duel_log: Array = state.get("duelLog") if area == "forest" and state.get("duelLog") is Array else []
	var latest: Variant = duel_log.back() if not duel_log.is_empty() else null
	var preview: Dictionary = battle.get("preview") if forest_battle and battle.get("preview") is Dictionary else {}
	var options: Array[Dictionary] = []
	if not forest_battle: options = actions
	var switches: Dictionary = preview.get("switches") if preview.get("switches") is Dictionary else {}
	if not forest_battle:
		reset_duel_options()
		view.set_duel_health()
	if state.is_empty():
		var place := "정령 터"
		if area == "home":
			place = "텃밭"
		elif area == "village":
			place = "마을 게시판"
		view.set_place_detail(place, "")
		view.set_scene("기록을 불러오고 있습니다.", "")
	elif area == "village":
		if open_inn_supply.is_valid():
			actions.append(_action("inn_supply", "마르텐의 생선 매입", "민물고기 납품 · 여관의 생선구이 재고", open_inn_supply))
		_render_village(view, state, actions, submit, locked)
	else:
		var party: Array = state.get("party", []) if state.get("party") is Array else []
		var active_id := str(state.get("active", ""))
		var spirit := _find_spirit(party, active_id)
		var chapter: Dictionary = state.get("chapter") if state.get("chapter") is Dictionary else {}
		var home_battle := area == "home" and not battle.is_empty()
		var showing_finish := false
		if area == "home":
			_render_garden(view, state, chapter, spirit, actions, submit, locked, home_battle)
			_append_care(actions, party, int(state.get("berries", 0)), submit, locked or home_battle, home_battle)
		elif battle.is_empty():
			if continue_from_duel.is_valid():
				showing_finish = _render_duel_finish(view, state, latest, actions, continue_from_duel)
			if not showing_finish:
				_render_forest(view, state, chapter, spirit, actions, submit, locked, _duel_context(state, locked, duel_log))
		else:
			_render_battle(view, state, chapter, battle, preview, party, spirit, actions, submit, locked, _duel_context(state, locked, duel_log), reduced_motion or not animate_duel_impact)
		if not showing_finish:
			if area == "forest":
				_append_treatment(options, state, spirit, forest_battle, preview.get("treat"), submit, locked)
			_append_switches(options, party, active_id, forest_battle, switches, submit, locked or home_battle, battle.get("skillTraitsEnabled") == true)
		if forest_battle:
			options.append(_action("retreat", "물러나기", "정령 대결 종료", submit.bind("retreat", {}), locked))
	options.append(_action("homestead_close", "지도로 돌아가기", "", close))
	if forest_battle:
		var options_hint := _duel_options_hint(preview, switches)
		_set_duel_actions(view, actions, options, options_hint, _duel_options_open)
	else:
		view.set_actions(actions)
	view.set_duel_log(duel_log)
	var impact: Dictionary = {}
	if latest is Dictionary and latest.get("result") == state.get("message") and latest.get("impact") is Dictionary:
		impact = latest["impact"]
	view.set_duel_impact(impact, int(state.get("revision", -1)), animate_duel_impact)


func _set_duel_actions(view: SimplifiedView, core_actions: Array[Dictionary], options: Array[Dictionary], hint: String, opened: bool) -> void:
	_duel_options_open = opened
	var actions := core_actions.duplicate()
	var label := "교대·회복·후퇴 접기" if opened else "교대·회복·후퇴 보기"
	var toggle := _set_duel_actions.bind(view, core_actions, options, hint, not opened)
	actions.append(_action("homestead_duel_options", label, hint, toggle))
	if opened:
		actions.append_array(options)
	view.set_actions(actions, false, false)


func _duel_options_hint(preview: Dictionary, switches: Dictionary) -> String:
	var strike: Variant = preview.get("strike")
	if not strike is Dictionary or not bool(strike.get("actorFainted", false)):
		return ""
	var skill: Variant = preview.get("skill")
	if skill is Dictionary and bool(skill.get("enemyDefeated", false)):
		return ""
	var treat: Variant = preview.get("treat")
	var can_treat := treat is Dictionary and not bool(treat.get("actorFainted", true))
	for outcome: Variant in switches.values():
		if outcome is Dictionary and not bool(outcome.get("actorFainted", true)):
			return "회복이나 교대로 이번 턴을 버틸 수 있습니다." if can_treat else "이번 턴을 버틸 수 있는 정령이 있습니다."
	return "회복하면 이번 턴을 버틸 수 있습니다." if can_treat else ""


func _render_village(view: SimplifiedView, state: Dictionary, actions: Array[Dictionary], submit: Callable, locked: bool) -> void:
	var village: Dictionary = state.get("village") if state.get("village") is Dictionary else {}
	var unlocked := bool(village.get("unlocked", false))
	var in_battle := state.get("battle") is Dictionary
	var completed := int(village.get("completed", 0))
	var total := int(village.get("total", 3))
	view.set_place_detail("마을 게시판", "%d일차 · 첫 의뢰 %d/%d" % [int(state.get("day", 1)), completed, total] if unlocked else "")
	var description := "숲의 오래된 참나무에서 수호 정령에게 이기면 마을 의뢰가 열립니다."
	if unlocked:
		if bool(village.get("nextDay", false)):
			description = "오늘 의뢰를 마쳤습니다. 텃밭에서 하루 쉬면 새 의뢰가 붙습니다."
		elif completed < total:
			description = "마을의 첫 의뢰입니다. 재료를 모은 것부터 납품하세요. 세 건을 마치면 하루에 한 건씩 새 의뢰가 열립니다."
		else:
			description = "오늘의 마을 의뢰입니다."
		var offers: Array = village.get("offers", []) if village.get("offers") is Array else []
		for value: Variant in offers:
			if not value is Dictionary:
				continue
			var offer: Dictionary = value
			var id := str(offer.get("id", ""))
			if id.is_empty():
				continue
			var title := str(offer.get("title", "마을 의뢰"))
			var detail := str(offer.get("detail", ""))
			var need := str(offer.get("need", "재료"))
			var owned := int(offer.get("owned", 0))
			var quantity := int(offer.get("quantity", 0))
			var reward := str(offer.get("reward", ""))
			var summary := "%s 필요 · 보유 %d · 보상 %s" % [need, owned, reward]
			if not detail.is_empty():
				summary += "\n" + detail
			var supply_hint := str(VILLAGE_SUPPLY_HINTS.get(id, ""))
			if owned < quantity and not supply_hint.is_empty():
				summary += "\n" + supply_hint
			var can_deliver := bool(offer.get("canDeliver", false))
			var deliver := submit.bind("deliver", {"requestId": id})
			actions.append(_action("homestead_deliver_" + id, title + " 납품", summary, deliver, locked or in_battle or not can_deliver))
	var context := "숲에서 진행 중인 정령 대결을 마치면 납품할 수 있습니다." if unlocked and in_battle else _context(state, locked)
	view.set_scene(description, context)


func _render_garden(view: SimplifiedView, state: Dictionary, chapter: Dictionary, spirit: Dictionary, actions: Array[Dictionary], submit: Callable, locked: bool, home_battle: bool) -> void:
	var seeds := int(state.get("seeds", 0))
	var herbs_unlocked := bool(chapter.get("herbsUnlocked", false))
	var supplies := _supply_summary(state, chapter)
	view.set_place_detail("텃밭", "%d일차   씨앗 %d   %s" % [int(state.get("day", 1)), seeds, supplies])
	var description := "씨앗을 심고 물을 준 뒤 쉬면 자랍니다. 두 번 자란 작물을 수확해 숲의 정령에게 줄 별열매를 얻으세요."
	if herbs_unlocked:
		description = _chapter_progress(chapter, true)
	if not spirit.is_empty():
		description += "\n함께할 정령 · %s" % _spirit_status(spirit)
		if spirit.has("bond"):
			description += "\n대결에서 이기거나 텃밭에서 별열매를 건네 유대를 쌓으세요. 유대 %d에 기술 효과가 열립니다." % MAX_BOND
	var quest: Dictionary = state.get("quest") if state.get("quest") is Dictionary else {}
	if not quest.is_empty() and not herbs_unlocked:
		description += "\n숲의 첫 약속 · %s" % _quest_progress(quest)
	var context := "숲의 정령 터에서 진행 중인 대결을 마치면 텃밭을 돌볼 수 있습니다." if home_battle else _context(state, locked)
	view.set_scene(description, context)
	var actions_locked := locked or home_battle
	var first_empty_plot := -1
	var plots: Array = state.get("plots", []) if state.get("plots") is Array else []
	for value: Variant in plots:
		if not value is Dictionary:
			continue
		var plot: Dictionary = value
		var index := int(plot.get("index", 0))
		var stage := str(plot.get("stage", "empty"))
		var id := "homestead_plot_%d" % index
		var label := "%d번 밭" % (index + 1)
		var watered := bool(plot.get("watered", false))
		var herb: bool = plot.get("crop") == "moonleaf"
		var detail := str(PLOT_STAGE_NAMES.get(stage, "빈 밭"))
		if herbs_unlocked:
			detail = "달숨풀" if herb else "별열매 · " + detail
		var target := {"plot": index}
		match stage:
			"empty":
				if first_empty_plot < 0 or index < first_empty_plot:
					first_empty_plot = index
				var plant_label := "별열매 심기" if herbs_unlocked else "씨앗 심기"
				actions.append(_action(id, label + " · " + plant_label, "씨앗 1개" if seeds > 0 else "정령을 이겨 씨앗 획득", submit.bind("plant", target), actions_locked or seeds <= 0))
			"seed", "sprout":
				if watered:
					var watered_detail := "달숨풀 · 쉬면 수확" if herb else "%s · 쉬면 성장" % detail
					actions.append(_action(id, label + " · 물 줌", watered_detail, Callable(), true))
				else:
					actions.append(_action(id, label + " · 물 주기", detail, submit.bind("water", target), actions_locked))
			"ready":
				var harvest_label := "달숨풀 수확" if herb else "수확하기"
				var yield_detail := "씨앗 +1 · 달숨풀 +1" if herb else "씨앗 +1 · 별열매 +2"
				actions.append(_action(id, label + " · " + harvest_label, yield_detail, submit.bind("harvest", target), actions_locked, true))
	if herbs_unlocked and first_empty_plot >= 0:
		var herb_detail := "%d번 밭 · 씨앗 1개" % (first_empty_plot + 1) if seeds > 0 else "씨앗 1개 필요"
		actions.append(_action("homestead_plant_herb", "달숨풀 심기", herb_detail, submit.bind("plant_herb", {"plot": first_empty_plot}), actions_locked or seeds <= 0))
	actions.append(_action("rest", "하루 쉬기", "다음 날 · 정령 모두 회복", submit.bind("rest", {}), actions_locked))
	if bool(quest.get("canClaim", false)):
		actions.append(_action("homestead_claim", "약속 보상 받기", "씨앗 +2 · 별열매 +1", submit.bind("claim", {}), actions_locked, true))


func _append_care(actions: Array[Dictionary], party: Array, berries: int, submit: Callable, locked: bool, home_battle: bool) -> void:
	for value: Variant in party:
		if not value is Dictionary:
			continue
		var spirit: Dictionary = value
		var id := str(spirit.get("id", ""))
		if id.is_empty() or not spirit.has("bond"):
			continue
		var bond := int(spirit.get("bond", 0))
		var can_care := bool(spirit.get("canCare", false))
		var name := str(spirit.get("name", "정령"))
		var label := "%s에게 별열매 주기" % name
		var status := "별열매 1개 · 하루 한 번"
		if bond >= MAX_BOND:
			label = name
			status = str(spirit.get("skillBonus", "기술 효과 해금"))
		elif home_battle:
			status = "대결을 마친 뒤 가능"
		elif berries <= 0:
			status = "별열매 1개 필요"
		elif not can_care:
			status = "오늘 돌봄 완료"
		var detail := "유대 %d/%d · %s" % [bond, MAX_BOND, status]
		var care := submit.bind("care", {"spiritId": id})
		actions.append(_action("homestead_care_" + id, label, detail, care, locked or not can_care or bond >= MAX_BOND))


func _quest_progress(quest: Dictionary) -> String:
	if bool(quest.get("claimed", false)):
		return "보상 받음"
	var remaining := PackedStringArray()
	if not bool(quest.get("harvested", false)):
		remaining.append("별열매 수확")
	if not bool(quest.get("recruited", false)):
		remaining.append("정령 영입")
	if not bool(quest.get("won", false)):
		remaining.append("대결에서 승리")
	return "조건 달성" if remaining.is_empty() else " / ".join(remaining)


func _render_forest(view: SimplifiedView, state: Dictionary, chapter: Dictionary, spirit: Dictionary, actions: Array[Dictionary], submit: Callable, locked: bool, context: String) -> void:
	view.set_place_detail("정령 터", _supply_summary(state, chapter))
	var unconscious := spirit.is_empty() or int(spirit.get("hp", 0)) <= 0
	var encounters: Array = state.get("encounters", []) if state.get("encounters") is Array else []
	for value: Variant in encounters:
		if not value is Dictionary:
			continue
		var encounter: Dictionary = value
		var id := str(encounter.get("id", ""))
		if id.is_empty():
			continue
		var name := str(encounter.get("name", "숲길 살피기"))
		var hint := str(encounter.get("hint", ""))
		var explore := submit.bind("explore", {"encounter": id})
		actions.append(_action("homestead_explore_" + id, name, hint, explore, locked or unconscious))
	var has_trails := not actions.is_empty()
	var description := "정령을 찾아갈 숲길을 고르세요."
	if not has_trails:
		description = "숲을 살피면 야생 정령을 만날 수 있습니다. 체력을 낮춘 뒤 텃밭에서 기른 별열매를 건네 보세요."
		var detail := "정령 교대 또는 집에서 휴식" if unconscious else "야생 정령과 조우"
		actions.append(_action("explore", "정령 찾기", detail, submit.bind("explore", {}), locked or unconscious, true))
	elif unconscious:
		description = "정령을 교대하거나 집에서 쉬세요."
	if bool(chapter.get("herbsUnlocked", false)):
		var progress := _chapter_progress(chapter, false)
		description = "%s\n%s" % [description, progress] if unconscious else progress
	if not spirit.is_empty():
		description += "\n함께할 정령 · %s" % _spirit_status(spirit)
		var bonus := _skill_bonus_status(spirit)
		if not bonus.is_empty():
			description += "\n%s" % bonus
	view.set_scene(description, context)


func _render_duel_finish(view: SimplifiedView, state: Dictionary, latest: Variant, actions: Array[Dictionary], continue_from_duel: Callable) -> bool:
	if not latest is Dictionary or latest.get("result") != state.get("message") or not latest.get("finish") is Dictionary:
		return false
	var finish: Dictionary = latest["finish"]
	var enemy_name: Variant = finish.get("enemyName")
	var turn: Variant = latest.get("turn")
	if not enemy_name is String or enemy_name.strip_edges().is_empty() or not (turn is int or turn is float) or turn < 1:
		return false
	var title: String
	var summary := PackedStringArray(["상대 정령 · %s" % enemy_name])
	match finish.get("kind"):
		"victory":
			title = "정령 대결 승리"
			var seeds: Variant = finish.get("seedsGained")
			if (seeds is int or seeds is float) and seeds > 0:
				summary.append("씨앗 %d개를 얻었습니다." % int(seeds))
			var bond: Variant = finish.get("bond")
			if bond is Dictionary:
				var bond_name: Variant = bond.get("name")
				var level: Variant = bond.get("level")
				if bond_name is String and not bond_name.is_empty() and (level is int or level is float):
					summary.append("%s · 유대 %d/%d 달성" % [bond_name, int(level), MAX_BOND])
			if finish.get("guardianRestored") == true:
				summary.append("오래된 참나무에 등불이 켜졌습니다. 분수 광장의 마을 게시판에서 의뢰를 확인하세요.")
		"defeat":
			title = "정령 대결 패배"
			summary.append("내 집의 텃밭에서 ‘하루 쉬기’를 고르면 다음 날 모든 동료 정령의 체력이 회복됩니다.")
		"recruit":
			title = "정령 영입"
			summary[0] = "새 동료 · %s" % enemy_name
			var berries: Variant = finish.get("berriesSpent")
			if (berries is int or berries is float) and berries > 0:
				summary.append("별열매 %d개를 건넸습니다." % int(berries))
		"retreat":
			title = "정령 대결 후퇴"
			summary.append("숲길을 다시 고를 수 있습니다. 체력이 부족하면 내 집의 텃밭에서 하루 쉬세요.")
		_:
			return false
	view.set_place_detail(title, "%d턴" % int(turn))
	view.set_scene("\n".join(summary), "")
	actions.append(_action("homestead_duel_continue", "숲길로 돌아가기", "", continue_from_duel))
	return true


func _render_battle(view: SimplifiedView, state: Dictionary, chapter: Dictionary, battle: Dictionary, preview: Dictionary, party: Array, spirit: Dictionary, actions: Array[Dictionary], submit: Callable, locked: bool, context: String, reduced_motion: bool) -> void:
	var enemy: Dictionary = battle.get("enemy") if battle.get("enemy") is Dictionary else {}
	var intent := str(battle.get("intentLabel", ""))
	var intent_kind := str(battle.get("intent", ""))
	var berries := int(state.get("berries", 0))
	var recruitable := bool(enemy.get("recruitable", true))
	var skill_ready := bool(battle.get("skillReady", true))
	var skill_traits_enabled: bool = battle.get("skillTraitsEnabled") == true
	var element := str(spirit.get("element", ""))
	var enemy_element := str(enemy.get("element", ""))
	view.set_place_detail("정령 대결", "%d턴   %s" % [int(battle.get("turn", 1)), _supply_summary(state, chapter)])
	view.set_duel_health(spirit, enemy, _element_name(element), _element_name(enemy_element), reduced_motion)
	var description := PackedStringArray()
	if not intent.is_empty():
		var intent_detail := "상대 예고 · %s" % intent
		if intent_kind == "guard":
			intent_detail += " · 주는 피해 반감"
			if skill_ready and spirit.get("id", "") == "ashwing":
				if int(spirit.get("bond", 0)) >= MAX_BOND:
					intent_detail += " · 재꽃 피우기는 관통"
				elif skill_traits_enabled:
					intent_detail += " · 재꽃 피우기는 일부 관통"
			var safe_options := PackedStringArray()
			if preview.get("treat") is Dictionary:
				safe_options.append("회복")
			var switches: Variant = preview.get("switches")
			if switches is Dictionary and not switches.is_empty():
				safe_options.append("교대")
			if not safe_options.is_empty():
				intent_detail += "\n%s 시 받는 피해 0" % "·".join(safe_options)
		description.append(intent_detail)
	if bool(battle.get("focused", false)):
		description.append("다음 공격 피해 +2")
	view.set_scene("\n".join(description), context)
	var matchup := "보통"
	if ELEMENT_ADVANTAGE.get(element) == enemy_element:
		matchup = "유리"
	elif ELEMENT_ADVANTAGE.get(enemy_element) == element:
		matchup = "불리"
	var skill := str(spirit.get("skillName", "정령 기술"))
	var skill_detail := "%s · 상성 %s" % [_element_name(element), matchup] if skill_ready else "준비 중 · 다른 행동 1회"
	if skill_traits_enabled and not _bond_replaces_skill_trait(spirit):
		var skill_trait := str(spirit.get("skillTrait", ""))
		if not skill_trait.is_empty():
			skill_detail += " · " + skill_trait
	var bonus := _skill_bonus_status(spirit)
	if not bonus.is_empty():
		skill_detail += "\n" + bonus
	var strike_outcome: Dictionary = preview.get("strike") if preview.get("strike") is Dictionary else {}
	var skill_outcome: Dictionary = preview.get("skill") if preview.get("skill") is Dictionary else {}
	var guard_outcome: Dictionary = preview.get("guard") if preview.get("guard") is Dictionary else {}
	if skill_ready:
		skill_detail = _with_outcome(skill_detail, preview.get("skill"))
	var strike_detail := _with_outcome("상성 영향 없음", preview.get("strike"))
	var guard_detail := _with_outcome("피해 반감 · 다음 공격 강화", preview.get("guard"))
	var strike_finishes := bool(strike_outcome.get("enemyDefeated", false)) and not bool(strike_outcome.get("actorFainted", true))
	var skill_survives := skill_ready and not bool(skill_outcome.get("actorFainted", true))
	var skill_finishes := skill_survives and bool(skill_outcome.get("enemyDefeated", false))
	var can_finish := strike_finishes or skill_finishes
	var guard_saves_damage := int(strike_outcome.get("received", 0)) - int(guard_outcome.get("received", 0)) >= 3
	var guard_survives := not bool(guard_outcome.get("actorFainted", true))
	var guard_helps := guard_survives and (guard_saves_damage or bool(strike_outcome.get("actorFainted", false)))
	var highlight_skill := skill_finishes or (not can_finish and skill_survives and matchup == "유리")
	actions.append(_action("strike", "기본 공격", strike_detail, submit.bind("strike", {}), locked, strike_finishes))
	actions.append(_action("skill", skill, skill_detail, submit.bind("skill", {}), locked or not skill_ready, highlight_skill))
	actions.append(_action("guard", "방어", guard_detail, submit.bind("guard", {}), locked, not can_finish and guard_helps))
	var can_befriend := bool(battle.get("canBefriend", false))
	var threshold := int(battle.get("befriendBelowHp", 0))
	var befriend_detail := "체력 %d 이하 · 별열매 1개" % threshold
	if not recruitable:
		befriend_detail = "수호 정령은 별열매를 받지 않습니다."
	elif not _find_spirit(party, str(enemy.get("id", ""))).is_empty():
		befriend_detail = "이미 함께하는 종류"
	elif int(enemy.get("hp", 0)) <= threshold and berries <= 0:
		befriend_detail = "별열매 1개 필요"
	actions.append(_action("befriend", "별열매 건네기", befriend_detail, submit.bind("befriend", {}), locked or not recruitable or not can_befriend, true))


func _append_treatment(actions: Array[Dictionary], state: Dictionary, spirit: Dictionary, in_battle: bool, outcome: Variant, submit: Callable, locked: bool) -> void:
	var hp := int(spirit.get("hp", 0))
	if int(state.get("herbs", 0)) <= 0 or hp <= 0 or hp >= int(spirit.get("maxHp", 0)):
		return
	var detail := "체력 최대 6 회복 · 상대 행동" if in_battle else "체력 최대 6 회복"
	var summary := _outcome_summary(outcome)
	if not summary.is_empty():
		detail = summary
	actions.append(_action("homestead_treat", "달숨풀 먹이기", detail, submit.bind("treat", {}), locked))


func _with_outcome(detail: String, outcome: Variant) -> String:
	var summary := _outcome_summary(outcome)
	return detail if summary.is_empty() else summary + "\n" + detail


func _outcome_summary(outcome: Variant) -> String:
	if not outcome is Dictionary:
		return ""
	var parts := PackedStringArray()
	var dealt := int(outcome.get("dealt", 0))
	var healed := int(outcome.get("healed", 0))
	if dealt > 0:
		parts.append("주는 피해 %d" % dealt)
	if healed > 0:
		parts.append("체력 %d 회복" % healed)
	if bool(outcome.get("enemyDefeated", false)):
		parts.append("승리 · 반격 없음")
	else:
		var received := int(outcome.get("received", 0))
		parts.append("받는 피해 %d" % received)
	if bool(outcome.get("actorFainted", false)):
		parts.append("쓰러짐")
	else:
		parts.append("체력 %d 남음" % int(outcome.get("remainingHp", 0)))
	return "예상 · " + " · ".join(parts)


func _supply_summary(state: Dictionary, chapter: Dictionary) -> String:
	var supplies := "별열매 %d" % int(state.get("berries", 0))
	if bool(chapter.get("herbsUnlocked", false)):
		supplies += "   달숨풀 %d" % int(state.get("herbs", 0))
	return supplies


func _chapter_progress(chapter: Dictionary, at_home: bool) -> String:
	if bool(chapter.get("guardianDefeated", false)):
		return "귀환의 불빛 배지 · 참나무의 등불을 되찾았습니다.\n분수 광장의 마을 게시판에서 납품 의뢰를 확인하세요."
	if bool(chapter.get("herbHarvested", false)):
		return "오래된 참나무 길이 열렸습니다. 숲에서 수호 정령에게 도전하세요."
	if at_home:
		return "달숨풀을 심고 물을 준 뒤 하루 쉬면 수확할 수 있습니다."
	return "텃밭에서 달숨풀을 수확하면 오래된 참나무 길이 열립니다."


func _append_switches(actions: Array[Dictionary], party: Array, active_id: String, in_battle: bool, previews: Dictionary, submit: Callable, locked: bool, skill_traits_enabled: bool) -> void:
	for value: Variant in party:
		if not value is Dictionary:
			continue
		var spirit: Dictionary = value
		var id := str(spirit.get("id", ""))
		if id.is_empty() or id == active_id:
			continue
		var hp := int(spirit.get("hp", 0))
		var name := str(spirit.get("name", "정령"))
		var detail := "쉬면 회복" if hp <= 0 else _spirit_status(spirit, false)
		if hp > 0 and in_battle:
			detail += " · 1턴"
			if skill_traits_enabled:
				var skill_trait := _skill_bonus_status(spirit) if _bond_replaces_skill_trait(spirit) else str(spirit.get("skillTrait", ""))
				if not skill_trait.is_empty():
					detail += " · " + skill_trait
			detail = _with_outcome(detail, previews.get(id))
		var switch_action := submit.bind("switch", {"spiritId": id})
		actions.append(_action("homestead_switch_" + id, "%s 교대" % name, detail, switch_action, locked or hp <= 0))


func _find_spirit(party: Array, id: String) -> Dictionary:
	for spirit: Variant in party:
		if spirit is Dictionary and str(spirit.get("id", "")) == id:
			return spirit
	return {}


func _spirit_status(spirit: Dictionary, include_name: bool = true) -> String:
	var element := _element_name(str(spirit.get("element", "")))
	var stats := "%s · 체력 %d/%d" % [element, int(spirit.get("hp", 0)), int(spirit.get("maxHp", 0))]
	return "%s · %s" % [str(spirit.get("name", "정령")), stats] if include_name else stats


func _skill_bonus_status(spirit: Dictionary) -> String:
	var bonus := str(spirit.get("skillBonus", ""))
	if bonus.is_empty():
		return ""
	var bond := int(spirit.get("bond", 0))
	return "유대 기술 · %s" % bonus if bond >= MAX_BOND else "유대 %d/%d · 해금 시 %s" % [bond, MAX_BOND, bonus]


func _bond_replaces_skill_trait(spirit: Dictionary) -> bool:
	return int(spirit.get("bond", 0)) >= MAX_BOND and spirit.get("id", "") != "embertail"


func _element_name(element: String) -> String:
	return str(ELEMENT_NAMES.get(element, "속성 미확인"))


func _context(state: Dictionary, locked: bool) -> String:
	if bool(state.get("actionPending", false)):
		return "행동 결과를 기다리고 있습니다…"
	return "현재 행동을 보낼 수 없습니다." if locked else str(state.get("message", ""))


func _duel_context(state: Dictionary, locked: bool, duel_log: Array) -> String:
	var context := _context(state, locked)
	if duel_log.is_empty():
		return context
	var latest: Variant = duel_log.back()
	if not latest is Dictionary or latest.get("result", "") != context:
		return context
	return "%d턴 결과 · %s\n%s" % [int(latest.get("turn", 0)), str(latest.get("action", "")), context]


func _action(id: String, label: String, detail: String, callback: Callable, disabled: bool = false, highlighted: bool = false) -> Dictionary:
	return {"id": id, "label": label, "detail": detail, "callback": callback, "disabled": disabled, "highlighted": highlighted}
