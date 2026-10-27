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
		var ui = UI.new()
		output.add_child(ui)
		ui.zone_label.text = "분수 광장"
		ui.money_label.text = "6,500원"
		ui.hp_label.text = "HP 100 / 100"
		ui.mp_label.text = "MP 30 / 30"
		ui.hp_bar.value = 100
		ui.mp_bar.value = 100
		ui.xp_bar.value = 35
		ui.attack_bar.hide()
		ui.quickslot_counts[2].text = "3"
		ui.cooldown_bars[ui.quickslot_buttons[0]].visible = true
		ui.cooldown_bars[ui.quickslot_buttons[0]].value = 45
		for i in range(8): await process_frame
		await RenderingServer.frame_post_draw
		var path = "res://art/reference/hud-mobile.png" if dimensions.x==384 else "res://art/reference/hud-wide.png"
		var error = output.get_texture().get_image().save_png(path)
		if error!=OK:
			push_error("HUD image save failed: "+path)
			quit(1)
			return
		output.queue_free()
		await process_frame
		await process_frame
	quit(0)
