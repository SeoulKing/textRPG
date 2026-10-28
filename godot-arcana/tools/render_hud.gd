extends SceneTree
## Offline composition previews of the real UI; no network or game actions.
const World = preload("res://scripts/world.gd")
const Painted = preload("res://scripts/pixel3d_world.gd")
const UI = preload("res://scripts/game_ui.gd")

func _initialize() -> void:
	call_deferred("_render")

func _render() -> void:
	root.position = Vector2i(-32000,-32000)
	for dimensions in [Vector2i(384,824),Vector2i(1280,824)]:
		var output = SubViewport.new()
		output.size = dimensions
		output.disable_3d = true
		output.render_target_update_mode = SubViewport.UPDATE_ALWAYS
		root.add_child(output)
		var world_view = SubViewport.new()
		world_view.size = dimensions/2
		world_view.render_target_update_mode = SubViewport.UPDATE_ALWAYS
		output.add_child(world_view)
		var presentation = TextureRect.new()
		presentation.texture = world_view.get_texture()
		presentation.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		presentation.size = Vector2(dimensions)
		presentation.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		var palette = ShaderMaterial.new()
		palette.shader = preload("res://art/resources/pixel3d_palette.gdshader")
		palette.set_shader_parameter("palette_lut",preload("res://art/export/arcana-palette-lut.png"))
		presentation.material = palette
		output.add_child(presentation)
		var logic = World.new()
		world_view.add_child(logic)
		logic.hide()
		logic.set_process(false)
		logic.set_physics_process(false)
		logic.player_position = Vector2(576,500)
		logic.enabled = false
		logic.camera.enabled = false
		var scene = Painted.new()
		scene.world = logic
		world_view.add_child(scene)
		# Static HUD composition does not exercise the runtime scenery fade collector.
		scene.occlusion_dirty = false
		var ui = UI.new()
		output.add_child(ui)
		ui.title_label.text = "ARCANA · 1"
		ui.zone_label.text = "분수 광장"
		ui.money_label.text = "6,500원"
		ui.hp_label.text = "HP 72 / 100"
		ui.mp_label.text = "MP 18 / 30"
		ui.hp_bar.value = 72
		ui.mp_bar.value = 60
		ui.quickslot_counts[2].text = "3"
		ui.cooldown_bars[ui.quickslot_buttons[0]].visible = true
		ui.cooldown_bars[ui.quickslot_buttons[0]].value = 45
		ui.quickslot_buttons[0].disabled = true
		ui.quickslot_icons[0].modulate.a = .70
		# Show the held joystick as a static composition sample, without game input.
		ui.joystick.origin = Vector2(86,dimensions.y-184)
		ui.joystick.touch_index = 0
		ui.joystick.knob_offset = Vector2(17,-11)
		ui.joystick.queue_redraw()
		for i in range(8): await process_frame
		await RenderingServer.frame_post_draw
		var path = "res://art/reference/hud-mobile.png" if dimensions.x==384 else "res://art/reference/hud-wide.png"
		var error = output.get_texture().get_image().save_png(path)
		if error!=OK:
			push_error("HUD image save failed: "+path)
			quit(1)
			return
		if dimensions.x == 384:
			ui.open_panel("소지품")
			ui.paragraph("소지금 6,500원",ui.GOLD)
			ui.choice("마나 포션 · 3개","마력을 회복합니다.",func(): pass)
			ui.choice("퀵슬롯 설정","스킬과 아이템을 배치합니다.",func(): pass)
			for i in range(3): await process_frame
			await RenderingServer.frame_post_draw
			output.get_texture().get_image().save_png("res://art/reference/hud-panel.png")
		output.queue_free()
		await process_frame
		await process_frame
	quit(0)
