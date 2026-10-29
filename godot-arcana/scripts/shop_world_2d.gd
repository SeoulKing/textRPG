@tool
extends Node2D
## Architecture uses painted tiles; furniture uses editable scene instances.
const Data = preload("res://scripts/shop_layout_2d.gd")
var layout: Dictionary = {}
var backdrop: Polygon2D
var sorted: Node2D
var follow_camera: Camera2D
var avatar: Sprite2D
var remote_sprites: Dictionary = {}
var occluders: Array[Sprite2D] = []
var bounds = Rect2(320,0,896,600)
var queued = false
var connected_world: Node
var zoom_ratio = 1.0
var pick_items: Array[Dictionary] = []
func _ready() -> void:
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	if not Engine.is_editor_hint():
		backdrop = Polygon2D.new()
		backdrop.color = Color.BLACK
		backdrop.z_index = -100
		add_child(backdrop)
	for layer in get_children():
		if layer is TileMapLayer: layer.changed.connect(_request_rebuild)
	var furniture_root = get_node_or_null("Furniture")
	if furniture_root != null and not furniture_root is TileMapLayer:
		furniture_root.child_order_changed.connect(_request_rebuild)
	_rebuild()
	if not Engine.is_editor_hint():
		follow_camera = Camera2D.new()
		follow_camera.position_smoothing_enabled = false
		add_child(follow_camera)
		follow_camera.enabled = not get_parent() is Node3D
		if not is_instance_valid(avatar): avatar = _actor()
		avatar.position = Data.canvas(layout.markers.get("arrival",Vector2(192,189)))
		var frames = load("res://art/export/heroine-run-reference-v15/heroine-run.tres") as SpriteFrames
		if frames != null:
			avatar.texture = frames.get_frame_texture("idle_s",0)
		_frame_camera()
func _request_rebuild() -> void:
	if queued: return
	queued = true
	call_deferred("_rebuild")
func _rebuild() -> void:
	queued = false
	layout = Data.collect(self)
	y_sort_enabled = true
	sorted = get_node("Actors")
	occluders.clear()
	pick_items.clear()
	for layer in get_children():
		if layer is TileMapLayer:
			layer.update_internals()
			for tile in layer.get_children():
				if tile.has_node("Visual"): _register_visual(tile.get_node("Visual"),str(tile.asset_id))
	var furniture = get_node("Furniture")
	for prop in furniture.get_children():
		if prop is Sprite2D and prop.has_method("placement_start"): _register_visual(prop,str(prop.asset_id))
	_clip_wall_joints()
	var merchant = sorted.get_node("Merchant") as Sprite2D
	merchant.visible = layout.markers.has("actor")
	if merchant.visible:
		if Engine.is_editor_hint():
			merchant.position = Vector2.ZERO
			merchant.offset = Data.canvas(layout.markers.actor).round() + Vector2(-48,-116)
		else:
			merchant.position = Data.canvas(layout.markers.actor).round()
			merchant.offset = Vector2(-48,-116)
		pick_items.append({"sprite":merchant,"id":"merchant"})
	bounds = Rect2(Data.canvas(Data.ORIGIN*Data.UNIT)-Vector2(0,160),Vector2(896,736))
	if Engine.is_editor_hint(): update_configuration_warnings()
func _register_visual(sprite: Sprite2D, id: String) -> void:
	sprite.set_meta("shop_asset",id)
	if id.begins_with("wall-") and not id.begins_with("wall-back"): occluders.append(sprite)
	var spec: Dictionary = Data.definitions().get(id,{})
	if spec.get("kind","") == "furniture": occluders.append(sprite)
	if spec.has("interaction"): pick_items.append({"sprite":sprite,"id":spec.interaction.id})
	if spec.get("kind","") == "door": pick_items.append({"sprite":sprite,"id":"exit"})
func _sprite_point(sprite: Sprite2D) -> Vector2:
	if sprite.has_method("contact_point"):
		return to_local(sprite.get_parent().to_global(sprite.contact_point()))
	return to_local(sprite.to_global(Vector2.ZERO))
func _sprite_area(sprite: Sprite2D) -> Rect2:
	var size = sprite.region_rect.size if sprite.region_enabled else Vector2(sprite.texture.get_size())
	return Rect2(to_local(sprite.to_global(sprite.offset)),size)
func _actor() -> Sprite2D:
	var sprite = Sprite2D.new()
	sprite.centered = false
	sprite.offset = Vector2(-48,-116)
	sprite.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	sorted.add_child(sprite)
	return sprite
func sync_actor(sprite: Sprite2D, source: Node, point: Vector2) -> void:
	var material: ShaderMaterial = source.get("material")
	if material == null: return
	var texture: Texture2D = material.get_shader_parameter("avatar_texture")
	if texture == null: return
	var grid: Variant = material.get_shader_parameter("sheet_grid")
	var cell: Variant = material.get_shader_parameter("frame_cell")
	var columns = Vector2(grid) if grid is Vector2 else Vector2.ONE
	var frame = Vector2(cell) if cell is Vector2 else Vector2.ZERO
	sprite.texture = texture
	sprite.region_enabled = columns != Vector2.ONE
	sprite.region_filter_clip_enabled = true
	if sprite.region_enabled:
		var size = Vector2(texture.get_size())/columns
		sprite.region_rect = Rect2(frame*size,size)
	sprite.position = Data.canvas(point)
	sprite.visible = source.visible
func sync(world: Node, source: Node, ratio: float, delta: float) -> void:
	connected_world = world
	zoom_ratio = ratio
	if not is_instance_valid(avatar): avatar = _actor()
	sync_actor(avatar,source,world.player_position)
	_frame_camera()
	_snap_actor(avatar)
	for remote in remote_sprites.values():
		if is_instance_valid(remote): _snap_actor(remote)
	# Uniform alpha, never holes, on foreground art that actually covers the player.
	var body = Rect2(avatar.position+Vector2(-24,-96),Vector2(48,84))
	for sprite in occluders:
		var wall = str(sprite.get_meta("shop_asset","")).begins_with("wall-")
		var covered = (wall or _sprite_point(sprite).y >= avatar.position.y) and _sprite_area(sprite).intersects(body)
		sprite.modulate.a = move_toward(sprite.modulate.a,.4 if covered else 1.0,delta*5)
func sync_remote(id: String, source: Node, point: Vector2) -> void:
	if not remote_sprites.has(id) or not is_instance_valid(remote_sprites[id]): remote_sprites[id] = _actor()
	sync_actor(remote_sprites[id],source,point)
	_snap_actor(remote_sprites[id])
func remove_remote(id: String) -> void:
	if remote_sprites.has(id):
		remote_sprites[id].queue_free()
		remote_sprites.erase(id)
func _snap_actor(sprite: Sprite2D) -> void:
	# Quantize after camera zoom and window stretch, in rendered screen pixels.
	var screen_transform = get_viewport().get_stretch_transform() * get_viewport().get_canvas_transform()
	var screen_point = screen_transform * sprite.position
	sprite.position = screen_transform.affine_inverse() * screen_point.round()
func _frame_camera() -> void:
	if follow_camera == null: return
	var size = Vector2(get_viewport_rect().size)
	var fit = minf(size.x/(bounds.size.x+48),size.y/(bounds.size.y+48))
	var zoom = fit*zoom_ratio
	follow_camera.zoom = Vector2.ONE*zoom
	var fits = bounds.size.x*zoom <= size.x and bounds.size.y*zoom <= size.y
	follow_camera.position = bounds.get_center() if fits or not is_instance_valid(avatar) else avatar.position-Vector2(0,50)
	follow_camera.force_update_scroll()
	# An integer world position is still fractional on screen at a non-integer zoom.
	# Keep the background sampling phase fixed by snapping its screen translation.
	var viewport = get_viewport()
	var stretch = viewport.get_stretch_transform()
	var canvas = viewport.get_canvas_transform()
	var screen_origin = stretch * canvas.origin
	var snapped_origin = stretch.affine_inverse() * screen_origin.round()
	follow_camera.position -= (snapped_origin - canvas.origin) / zoom
	follow_camera.force_update_scroll()
	if backdrop != null:
		var inverse = get_viewport().get_canvas_transform().affine_inverse()
		backdrop.polygon = PackedVector2Array([inverse*Vector2.ZERO,inverse*Vector2(size.x,0),inverse*size,inverse*Vector2(0,size.y)])
func pick(point: Vector2) -> Vector2:
	var canvas_point = get_viewport().get_canvas_transform().affine_inverse()*point + Data.CANVAS_ORIGIN
	return Vector2(canvas_point.x/4.0,canvas_point.y/(4.0*Data.PITCH))
func screen_point(point: Vector2, height: float = 0.0) -> Vector2:
	return get_viewport().get_canvas_transform()*Data.canvas(point,height)
func pick_interaction(point: Vector2, world: Node) -> Dictionary:
	var local = get_viewport().get_canvas_transform().affine_inverse()*point
	for i in range(pick_items.size()-1,-1,-1):
		var item: Dictionary = pick_items[i]
		var sprite: Sprite2D = item.sprite
		if not _sprite_area(sprite).has_point(local): continue
		for entity in world.entities:
			if entity.id == item.id: return entity
	return {}

func _get_configuration_warnings() -> PackedStringArray:
	return PackedStringArray(layout.get("errors",[]))

func _clip_wall_joints() -> void:
	var front_top = INF
	var groups = {"left":[],"right":[]}
	for sprite in occluders:
		var name = str(sprite.get_meta("shop_asset","")).replace("-","_")
		if name.begins_with("wall_front"):
			front_top = minf(front_top,_sprite_point(sprite).y+sprite.offset.y)
		elif name.begins_with("wall_left"): groups.left.append(sprite)
		elif name.begins_with("wall_right"): groups.right.append(sprite)
	# Shared boundary pixels belong to one strip only, including during alpha fade.
	for group in groups.values():
		group.sort_custom(func(a,b): return _sprite_point(a).y+a.offset.y < _sprite_point(b).y+b.offset.y)
		for index in range(group.size()):
			var sprite: Sprite2D = group[index]
			var start = _sprite_point(sprite).y+sprite.offset.y
			var stop = minf(front_top,start+float(sprite.texture.get_height()))
			if index+1<group.size(): stop = minf(stop,_sprite_point(group[index+1]).y+group[index+1].offset.y)
			var height = clampi(roundi(stop-start),0,sprite.texture.get_height())
			sprite.region_enabled = true
			sprite.region_filter_clip_enabled = true
			sprite.region_rect = Rect2(0,0,sprite.texture.get_width(),height)
