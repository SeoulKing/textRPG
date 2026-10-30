@tool
extends Node3D
## Native TileMapLayer is the only placement source. The 3D bridge adds no editor tools.
const Prop = preload("res://scripts/illustrated_prop.gd")
@export var map_scene: PackedScene = preload("res://scenes/walls/city_walls.tscn")
## A 192x136 editor cell corresponds to three X/Z world units. Row zero is the former south wall.
@export var grid_origin = Vector2(1.5,47)
var _visuals: Node3D
var _stamp = 0
var _poll = 0.0
static var _textures: Dictionary = {}
var _wall_parts: Array[Dictionary] = []
var _tower_parts: Array[Node3D] = []
var _masked_basis = Basis.IDENTITY
var _masks_dirty = true

func _ready() -> void:
	rebuild()
	_stamp = FileAccess.get_modified_time(map_scene.resource_path) if map_scene != null else 0

func _process(delta: float) -> void:
	_sync_tower_masks()
	if not Engine.is_editor_hint() or map_scene == null: return
	_poll += delta
	if _poll<.5: return
	_poll = 0
	var stamp = FileAccess.get_modified_time(map_scene.resource_path)
	if stamp != _stamp:
		_stamp = stamp
		map_scene = ResourceLoader.load(map_scene.resource_path,"PackedScene",ResourceLoader.CACHE_MODE_REPLACE)
		rebuild()

func entries() -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	if map_scene == null: return result
	var source = map_scene.instantiate()
	for layer in source.find_children("*","TileMapLayer",true,false):
		for cell in layer.get_used_cells():
			var atlas = layer.tile_set.get_source(layer.get_cell_source_id(cell)) as TileSetAtlasSource
			if atlas == null: continue
			var coords: Vector2i = layer.get_cell_atlas_coords(cell)
			var data: TileData = layer.get_cell_tile_data(cell)
			var at: Vector2 = layer.transform*layer.map_to_local(cell)
			var ground = grid_origin+Vector2(at.x/64.0,(at.y-68.0)*3.0/136.0)
			result.append({"point":ground,"atlas":atlas,"coords":coords,"data":data,"tower":layer.get_cell_source_id(cell)==1})
	source.free()
	return result

func rebuild() -> void:
	_wall_parts.clear()
	_tower_parts.clear()
	_masks_dirty = true
	if _visuals != null:
		remove_child(_visuals)
		_visuals.queue_free()
	_visuals = Node3D.new()
	_visuals.name = "WallSprites"
	add_child(_visuals)
	for entry in entries():
		var atlas: TileSetAtlasSource = entry.atlas
		var rect = atlas.get_tile_texture_region(entry.coords)
		var key = atlas.texture.resource_path+":"+str(rect)
		if not _textures.has(key):
			_textures[key] = ImageTexture.create_from_image(atlas.texture.get_image().get_region(rect))
		var prop = Prop.new()
		prop.asset = _textures[key]
		prop.pixel_size = rect.size
		prop.foot = Vector2(rect.size)*.5+Vector2(entry.data.texture_origin)
		prop.shadow_size = Vector2(.9,.45)
		prop.fade_for_player = true
		prop.position = Vector3(entry.point.x,0,entry.point.y)
		_visuals.add_child(prop)
		if entry.tower:
			_tower_parts.append(prop)
		else:
			var horizontal_mask: int = entry.coords.x & 5
			var terminal_side = -1 if horizontal_mask==4 else 1 if horizontal_mask==1 else 0
			_wall_parts.append({"prop":prop,"texture":prop.asset,"terminal_side":terminal_side})
	_sync_tower_masks()

func _sync_tower_masks() -> void:
	# Remove hidden wall pixels, rather than fading two stacked architectural layers.
	# Both billboards use the same 64px/unit registration, so this also works when
	# their shared tower anchor is viewed using the comparison camera.
	var camera = get_viewport().get_camera_3d() if is_inside_tree() else null
	if camera == null: return
	var view_basis: Basis = camera.global_basis.orthonormalized()
	if not _masks_dirty and view_basis.is_equal_approx(_masked_basis): return
	_masks_dirty = false
	_masked_basis = view_basis
	for part in _wall_parts:
		var prop: Node3D = part.prop
		var base_texture: Texture2D = part.texture
		var image: Image = base_texture.get_image()
		var cut: Image
		var wall_scale = Vector2(prop.global_basis.x.length(),prop.global_basis.y.length())
		for tower in _tower_parts:
			var difference: Vector3 = tower.global_position-prop.global_position
			# Walls closer to the camera still cover towers behind them normally.
			if difference.dot(view_basis.z)<-.001: continue
			var tower_scale = Vector2(tower.global_basis.x.length(),tower.global_basis.y.length())/wall_scale
			var offset = Vector2(difference.dot(view_basis.x),-difference.dot(view_basis.y))*64.0/wall_scale
			var top_left = Vector2(prop.foot)+offset-Vector2(tower.foot)*tower_scale
			var area = Rect2(top_left,Vector2(tower.pixel_size)*tower_scale)
			var intersection = area.intersection(Rect2(Vector2.ZERO,Vector2(prop.pixel_size)))
			if not intersection.has_area(): continue
			var mask: Image = tower.asset.get_image()
			var first = Vector2i(intersection.position.floor())
			var last = Vector2i(intersection.end.ceil()).min(prop.pixel_size)
			for y in range(maxi(0,first.y),last.y):
				for x in range(maxi(0,first.x),last.x):
					if image.get_pixel(x,y).a<.5: continue
					var sample = Vector2i(((Vector2(x+.5,y+.5)-top_left)/tower_scale).floor())
					if sample.x<0 or sample.y<0 or sample.x>=mask.get_width() or sample.y>=mask.get_height(): continue
					if mask.get_pixel(sample.x,sample.y).a<.5: continue
					if cut == null: cut = image.duplicate()
					cut.set_pixel(x,y,Color(0,0,0,0))
			if part.terminal_side != 0 and difference.length_squared()<.0001:
				cut = _finish_round_socket(image,cut,mask,top_left,tower_scale,int(part.terminal_side),Vector2(tower.foot))
		var texture: Texture2D = ImageTexture.create_from_image(cut) if cut != null else base_texture
		prop.asset = texture
		prop.sprite_material.set_shader_parameter("sprite_sheet",texture)
		if prop.fade_material != null:
			prop.fade_material.set_shader_parameter("sprite_sheet",texture)
			prop.occlusion_mask = cut if cut != null else image

func _finish_round_socket(source: Image, cut: Image, tower_mask: Image, top_left: Vector2, ratio: Vector2, side: int, tower_foot: Vector2) -> Image:
	# A terminal wall meets the outside of the cylinder, not its centre. Extend
	# that termination below the last opaque footing row as well, so no flat
	# strip projects out from under the circular base when the tower fades.
	if cut == null: cut = source.duplicate()
	var fallback_x = tower_foot.x+(-57.6 if side<0 else 57.6)
	for y in range(source.get_height()):
		var tower_y = floori((float(y)+.5-top_left.y)/ratio.y)
		var boundary = fallback_x
		if tower_y>=0 and tower_y<tower_mask.get_height():
			if side<0:
				for x in range(tower_mask.get_width()):
					if tower_mask.get_pixel(x,tower_y).a>=.5:
						boundary = float(x)
						break
			else:
				for x in range(tower_mask.get_width()-1,-1,-1):
					if tower_mask.get_pixel(x,tower_y).a>=.5:
						boundary = float(x+1)
						break
		var edge = clampi(roundi(top_left.x+boundary*ratio.x),0,source.get_width())
		var first = edge if side<0 else 0
		var last = source.get_width() if side<0 else edge
		for x in range(first,last): cut.set_pixel(x,y,Color(0,0,0,0))
		# Keep a narrow bevel/contact seam in the drawn stone itself; its course
		# colours and stepped footing are retained instead of a plain cutoff.
		for step in range(3):
			var x = edge-1-step if side<0 else edge+step
			if x<0 or x>=source.get_width(): continue
			var color = source.get_pixel(x,y)
			if color.a<.5: continue
			color = color.darkened(.24 if step==0 else .10) if step<2 else color.lightened(.06)
			cut.set_pixel(x,y,color)
	return cut

func collision_rects(layout: Node3D) -> Array[Rect2]:
	var result: Array[Rect2] = []
	var relative = transform
	var ancestor = get_parent()
	while ancestor != layout and ancestor is Node3D:
		relative = ancestor.transform*relative
		ancestor = ancestor.get_parent()
	var authored = entries()
	var tower_points: Dictionary = {}
	for entry in authored:
		if entry.tower: tower_points[entry.point] = true
	for entry in authored:
		# Painted cells, including towers, own their collision. Erasure leaves no invisible wall.
		var size = Vector2(1.8,1.6) if entry.tower else Vector2(1.92,1.92)
		var mask: int = entry.coords.x
		var low = -size*.5
		var high = size*.5
		if not entry.tower:
			if mask & 1: high.x = 1.5
			if mask & 2: high.y = 1.5
			if mask & 4: low.x = -1.5
			if mask & 8: low.y = -1.5
			if mask & 5:
				if not (mask & 1): high.x = -.9 if tower_points.has(entry.point) else 0.0
				if not (mask & 4): low.x = .9 if tower_points.has(entry.point) else 0.0
		var rect = Rect2()
		var first = true
		for corner in [low,Vector2(high.x,low.y),high,Vector2(low.x,high.y)]:
			var point: Vector3 = relative*Vector3(entry.point.x+corner.x,0,entry.point.y+corner.y)
			var flat = Vector2(point.x,point.z)*16.0
			if first:
				rect = Rect2(flat,Vector2.ZERO)
				first = false
			else: rect = rect.expand(flat)
		result.append(rect)
	return result
