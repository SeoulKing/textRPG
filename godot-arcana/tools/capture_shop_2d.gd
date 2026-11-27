extends SceneTree
var viewport: SubViewport
var shop: Node2D
func _initialize() -> void: call_deferred("run")
func run() -> void:
	root.position = Vector2i(-32000,-32000)
	viewport = SubViewport.new()
	viewport.disable_3d = true
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	viewport.canvas_item_default_texture_filter = Viewport.DEFAULT_CANVAS_ITEM_TEXTURE_FILTER_NEAREST
	root.add_child(viewport)
	shop = load("res://scenes/shop_2d.tscn").instantiate()
	viewport.add_child(shop)
	for entry in [{"file":"shop-2d-overview.png","size":Vector2i(1280,800),"zoom":1.0},{"file":"shop-2d-portrait.png","size":Vector2i(384,824),"zoom":1.0},{"file":"shop-2d-close.png","size":Vector2i(960,720),"zoom":1.6}]:
		viewport.size = entry.size
		shop.zoom_ratio = entry.zoom
		if is_instance_valid(shop.avatar): shop.avatar.position = shop.Data.canvas(Vector2(192,140))
		shop._frame_camera()
		for n in range(4): await process_frame
		await RenderingServer.frame_post_draw
		var image = viewport.get_texture().get_image()
		image.save_png(OS.get_environment("ARCANA_SHOP_EVIDENCE").path_join(entry.file))
		print("SHOP_2D_CAPTURE ",entry.file," ",image.get_size())
	viewport.queue_free()
	await process_frame
	quit()
