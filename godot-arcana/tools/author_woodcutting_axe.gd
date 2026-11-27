extends SceneTree
## PixelPen authoring for the 64px inventory icon. Hand grip is at (20, 46).

const SOURCE_DIR := "res://art/source/items/woodcutting-axe-v1/"
const SOURCE := SOURCE_DIR + "woodcutting-axe.pxpen"
const OUTPUT := "res://art/export/items/woodcutting-axe.png"
const SIZE := 64
const MARGIN := 8

enum Ink {
	CLEAR, OUTLINE, WOOD_SHADOW, WOOD, WOOD_LIGHT, WOOD_GRAIN, BARK,
	STEEL_DARK, STEEL, STEEL_LIGHT, STEEL_EDGE, STEEL_GLEAM, PIN,
}

var pixels := PackedByteArray()


func _initialize() -> void:
	call_deferred("_author")


func _plane(points: Array, color: Ink, paint_over: Array = []) -> void:
	var polygon := PackedVector2Array()
	for point: Vector2 in points:
		polygon.append(point)
	for y in range(MARGIN + 1, SIZE - MARGIN - 1):
		for x in range(MARGIN + 1, SIZE - MARGIN - 1):
			var index := y * SIZE + x
			if (paint_over.is_empty() or pixels[index] in paint_over) and Geometry2D.is_point_in_polygon(Vector2(x + 0.5, y + 0.5), polygon):
				pixels[index] = color


func _marks(points: Array, color: Ink) -> void:
	for point: Vector2i in points:
		pixels[point.y * SIZE + point.x] = color


func _draw_axe() -> void:
	pixels.resize(SIZE * SIZE)
	var wood_colors := [Ink.WOOD_SHADOW, Ink.WOOD, Ink.WOOD_LIGHT, Ink.WOOD_GRAIN, Ink.BARK]
	_plane([
		Vector2(12, 49), Vector2(18, 43), Vector2(26, 36), Vector2(33, 28),
		Vector2(38, 22), Vector2(41, 17), Vector2(45, 16), Vector2(48, 20),
		Vector2(46, 24), Vector2(39, 30), Vector2(32, 37), Vector2(26, 44),
		Vector2(21, 51), Vector2(17, 54), Vector2(13, 53),
	], Ink.WOOD)
	_plane([
		Vector2(17, 52), Vector2(23, 45), Vector2(31, 36), Vector2(37, 28),
		Vector2(48, 18), Vector2(53, 30), Vector2(21, 55),
	], Ink.WOOD_SHADOW, wood_colors)
	_plane([
		Vector2(12, 49), Vector2(21, 40), Vector2(31, 30), Vector2(39, 23),
		Vector2(45, 17), Vector2(37, 27), Vector2(28, 36), Vector2(22, 43),
		Vector2(15, 51), Vector2(13, 52),
	], Ink.WOOD_LIGHT, wood_colors)
	_marks([
		Vector2i(16, 49), Vector2i(17, 49), Vector2i(18, 48), Vector2i(19, 47),
		Vector2i(23, 40), Vector2i(24, 39), Vector2i(25, 38),
		Vector2i(27, 39), Vector2i(28, 38), Vector2i(29, 37),
		Vector2i(30, 36), Vector2i(34, 31), Vector2i(35, 29),
	], Ink.WOOD_GRAIN)
	_marks([Vector2i(16, 52), Vector2i(17, 52), Vector2i(18, 51)], Ink.BARK)

	var steel_colors := [Ink.STEEL_DARK, Ink.STEEL, Ink.STEEL_LIGHT, Ink.STEEL_EDGE, Ink.STEEL_GLEAM]
	_plane([
		Vector2(20, 10), Vector2(24, 11), Vector2(31, 14), Vector2(37, 15),
		Vector2(42, 14), Vector2(45, 13), Vector2(49, 15), Vector2(52, 18),
		Vector2(50, 23), Vector2(47, 26), Vector2(43, 27), Vector2(37, 25),
		Vector2(33, 25), Vector2(29, 28), Vector2(25, 34), Vector2(22, 33),
		Vector2(19, 30), Vector2(17, 26), Vector2(16, 20), Vector2(17, 15),
	], Ink.STEEL)
	_plane([
		Vector2(19, 29), Vector2(23, 28), Vector2(29, 24), Vector2(33, 22),
		Vector2(37, 22), Vector2(43, 23), Vector2(48, 22), Vector2(52, 17),
		Vector2(55, 20), Vector2(51, 28), Vector2(36, 27), Vector2(25, 36),
	], Ink.STEEL_DARK, steel_colors)
	_plane([
		Vector2(20, 10), Vector2(28, 13), Vector2(37, 16), Vector2(46, 14),
		Vector2(51, 17), Vector2(46, 17), Vector2(40, 19), Vector2(34, 18),
		Vector2(28, 16), Vector2(23, 15),
	], Ink.STEEL_LIGHT, steel_colors)
	_plane([
		Vector2(20, 10), Vector2(23, 11), Vector2(21, 15), Vector2(20, 20),
		Vector2(21, 25), Vector2(23, 28), Vector2(27, 31), Vector2(26, 34),
		Vector2(21, 35), Vector2(16, 30), Vector2(14, 22), Vector2(16, 14),
	], Ink.STEEL_EDGE, steel_colors)
	_plane([
		Vector2(20, 10), Vector2(21, 11), Vector2(19, 15), Vector2(18, 21),
		Vector2(19, 25), Vector2(21, 29), Vector2(24, 32), Vector2(22, 34),
		Vector2(17, 29), Vector2(15, 20), Vector2(17, 13),
	], Ink.STEEL_GLEAM, steel_colors)
	_marks([
		Vector2i(23, 19), Vector2i(24, 18), Vector2i(25, 18),
		Vector2i(24, 25), Vector2i(25, 25), Vector2i(26, 24),
		Vector2i(30, 20), Vector2i(31, 20), Vector2i(33, 19),
		Vector2i(45, 16), Vector2i(46, 16), Vector2i(47, 17),
	], Ink.STEEL_LIGHT)
	_marks([
		Vector2i(42, 19), Vector2i(43, 18), Vector2i(44, 19),
		Vector2i(42, 20), Vector2i(43, 20),
	], Ink.STEEL_DARK)
	_marks([Vector2i(43, 19)], Ink.PIN)

	var silhouette := pixels.duplicate()
	for y in range(MARGIN, SIZE - MARGIN):
		for x in range(MARGIN, SIZE - MARGIN):
			var index := y * SIZE + x
			if silhouette[index] == Ink.CLEAR and (
				silhouette[index - 1] != Ink.CLEAR or silhouette[index + 1] != Ink.CLEAR
				or silhouette[index - SIZE] != Ink.CLEAR or silhouette[index + SIZE] != Ink.CLEAR
			):
				pixels[index] = Ink.OUTLINE


func _author() -> void:
	DirAccess.make_dir_recursive_absolute(SOURCE_DIR)
	var project: PixelPenProject
	if not FileAccess.file_exists(SOURCE):
		project = PixelPenProject.new()
		project.initialized(Vector2i(SIZE, SIZE), "Woodcutting axe – inventory icon")
		PixelPen.state.current_project = project
		project.palette.color_index = PackedColorArray([
			Color.TRANSPARENT, Color("000000"), Color("74452f"), Color("a06842"),
			Color("d5a36b"), Color("865337"), Color("56362c"), Color("495e65"),
			Color("7e9396"), Color("b2c6c3"), Color("ccd7c9"), Color("f1eee0"),
			Color("e2b875"),
		])
		_draw_axe()
		var layer: IndexedColorImage = project.active_frame.layers[0]
		layer.label = "Hickory handle, forged steel and sharpened edge"
		for y in range(MARGIN, SIZE - MARGIN):
			for x in range(MARGIN, SIZE - MARGIN):
				var index := int(pixels[y * SIZE + x])
				if index != Ink.CLEAR:
					layer.set_index_on_color_map(x, y, index)
		project.file_path = SOURCE
		if ProjectPacker.save(project, SOURCE) != OK:
			_error("Could not save the axe PixelPen source")
			return
	project = ProjectPacker.load_project(SOURCE)
	if project == null or project.canvas_size != Vector2i(SIZE, SIZE):
		_error("Could not reopen the 64 px axe source")
		return
	PixelPen.state.current_project = project
	var image := project.get_image(project.animation_timeline[0].frame)
	image.convert(Image.FORMAT_RGBA8)
	for y in SIZE:
		for x in SIZE:
			var alpha := image.get_pixel(x, y).a
			if alpha != 0.0 and alpha != 1.0:
				_error("The axe thumbnail must use binary alpha")
				return
			if alpha > 0.0 and (x < MARGIN or x >= SIZE - MARGIN or y < MARGIN or y >= SIZE - MARGIN):
				_error("The axe thumbnail is outside its 8 px margin")
				return
	if image.save_png(OUTPUT) != OK:
		_error("Could not export the axe PNG")
		return
	var arguments := OS.get_cmdline_user_args()
	if not arguments.is_empty():
		_save_review(image, arguments[0])
	print("PIXELPEN_AXE_EXPORTED ", image.get_used_rect(), " | grip (20, 46)")
	_finish(0)


func _save_review(image: Image, path: String) -> void:
	var review := Image.create(300, 204, false, Image.FORMAT_RGBA8)
	review.fill(Color("faf2df"))
	review.fill_rect(Rect2i(204, 0, 96, 204), Color("2e2937"))
	var large := image.duplicate() as Image
	large.resize(192, 192, Image.INTERPOLATE_NEAREST)
	review.blend_rect(large, large.get_used_rect(), large.get_used_rect().position + Vector2i(6, 6))
	review.blend_rect(image, image.get_used_rect(), image.get_used_rect().position + Vector2i(220, 24))
	var small := image.duplicate() as Image
	small.resize(40, 40, Image.INTERPOLATE_NEAREST)
	review.blend_rect(small, small.get_used_rect(), small.get_used_rect().position + Vector2i(232, 120))
	review.save_png(path)


func _error(message: String) -> void:
	push_error(message)
	_finish(1)


func _finish(status: int) -> void:
	PixelPen.state.current_project = null
	PixelPen.state.free()
	PixelPen.state = null
	quit(status)
