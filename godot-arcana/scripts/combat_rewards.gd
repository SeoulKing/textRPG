extends Node
## Visual delivery of rewards already committed by the server. Never grants money.
const Coin = preload("res://scripts/combat_reward_coin.gd")
const FONT = preload("res://fonts/NotoSansKR-SemiBold.tres")
var main: Node
var drops: Array[Dictionary] = []
var texts: Array[Dictionary] = []
var seen: Dictionary = {}
var pending_money = 0
func _label(text: String, color: Color) -> Label:
	var label = Label.new()
	label.text = text
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.add_theme_font_override("font",FONT)
	label.add_theme_font_size_override("font_size",17)
	label.add_theme_color_override("font_color",color)
	label.add_theme_color_override("font_outline_color",Color("253442"))
	label.add_theme_constant_override("outline_size",3)
	label.z_index = 20
	main.ui.root.add_child(label)
	return label
func show_reward(key: String, at: Vector2, xp: int, money: int) -> void:
	if seen.has(key): return
	seen[key] = true
	if xp>0: texts.append({"node":_label("+%dxp" % xp,Color("d0efad")),"age":0.0})
	if money>0:
		pending_money += money
		var coins: Array[Control] = []
		for i in range(3):
			var coin = Coin.new()
			coin.z_index = 19
			main.ui.root.add_child(coin)
			coins.append(coin)
		drops.append({"coins":coins,"at":at,"age":0.0,"money":money})
	main._update_hud()
func show_slime_loot(key: String, amount: int) -> void:
	if seen.has(key) or amount <= 0: return
	seen[key] = true
	texts.append({"node":_label("+%d 슬라임의 점액질" % amount,Color("d0efad")),"age":0.0})

func _process(delta: float) -> void:
	if not is_instance_valid(main) or not is_instance_valid(main.ui): return
	var visible = main.page_active and main.world.indoor.is_empty()
	var paused = not main.page_active or main.ui.overlay.visible
	for entry in texts:
		if not paused: entry.age += delta
		var label: Label = entry.node
		label.visible = visible
		label.position = main.spatial_combat._screen(main.world.player_position,1.8)-Vector2(label.size.x*.5,entry.age*24.0)
		label.modulate.a = minf(1.0,maxf(0,(1.4-entry.age)*2.5))
		if entry.age>=1.4: label.queue_free()
	texts = texts.filter(func(entry): return entry.age<1.4)
	for drop in drops:
		if not paused: drop.age += delta
		var origin: Vector2 = main.spatial_combat._screen(drop.at,.1)
		var target: Vector2 = main.spatial_combat._screen(main.world.player_position,.6)
		for i in range(drop.coins.size()):
			var coin: Control = drop.coins[i]
			var age = maxf(0,drop.age-float(i)*.07)
			var scatter = Vector2((float(i)-1)*13.0,absf(float(i)-1)*4.0)
			var point = origin+scatter*minf(1,age/.3)
			if age<.3: point.y -= sin(age/.3*PI)*16
			var flight = clampf((age-.55)/.42,0,1)
			point = point.lerp(target,flight*flight)
			coin.position = point-Vector2(6,6)
			coin.visible = visible and flight<1.0
		if drop.age>=1.15:
			pending_money = maxi(0,pending_money-int(drop.money))
			for coin in drop.coins: coin.queue_free()
			texts.append({"node":_label("+%d골드" % int(drop.money),Color("ffe5a0")),"age":0.0})
			main._update_hud()
	drops = drops.filter(func(drop): return drop.age<1.15)
