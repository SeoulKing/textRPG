extends SceneTree
## Bake the saved PixelPen timelines. Pass -- --create to author missing timelines from the inventory masters.
const SOURCE := "res://art/source/cooking/"
const EXPORT := "res://art/export/cooking/"
const ITEMS := "res://art/source/items/"
const RECIPES := {
	"grilled-fish": ["inventory-v1/river-fish", "inventory-v1/grilled-fish"],
	"grilled-mushroom": ["cooking-food-v2/mushroom", "cooking-food-reference-v1/grilled-mushroom"],
	"roasted-potato": ["cooking-food-v2/potato", "cooking-food-reference-v1/roasted-potato"],
	"meat-skewer": ["cooking-food-v2/raw-meat", "cooking-food-reference-v1/meat-skewer"],
}
const SIZE := Vector2i(64, 64)
const FOOT := [45, 49, 53, 52, 49, 45, 44, 48, 52, 52, 52, 52]
const CENTER := [28, 30, 32, 32, 32, 32, 33, 33, 32, 32, 32, 32]
const WIDTH := [100, 100, 101, 100, 82, 47, 44, 82, 101, 100, 100, 100]
const STEAM := [Color("948c8a"), Color("d4c9ae"), Color("f8edd1")]

func _initialize() -> void:
	call_deferred("run")

func read_icon(master: String) -> Image:
	var project := ProjectPacker.load_project(ITEMS + master + ".pxpen")
	if project == null:
		return null
	PixelPen.state.current_project = project
	var image := project.get_image(project.animation_timeline[0].frame)
	image.convert(Image.FORMAT_RGBA8)
	return image.get_region(image.get_used_rect())

func sized_icon(icon: Image, extent: int, width_percent: int) -> Image:
	var ratio := float(extent) / maxi(icon.get_width(), icon.get_height())
	var copy: Image = icon.duplicate()
	copy.resize(maxi(1, roundi(icon.get_width() * ratio * width_percent / 100.0)), maxi(1, roundi(icon.get_height() * ratio)), Image.INTERPOLATE_NEAREST)
	return copy

func empty_layer() -> Image:
	return Image.create_empty(SIZE.x, SIZE.y, false, Image.FORMAT_RGBA8)

func place(canvas: Image, image: Image, center: int, bottom: int) -> void:
	var position := Vector2i(center - floori(image.get_width() / 2.0), bottom + 1 - image.get_height())
	canvas.blend_rect(image, Rect2i(Vector2i.ZERO, image.get_size()), position)

func curl(steam: Image, origin: Vector2i, age: int, mirror: int) -> void:
	# A short dither-free S curve. The upper tip drifts first and the tail detaches as it rises.
	var shape := [Vector2i(0, 0), Vector2i(1, -1), Vector2i(1, -2), Vector2i(0, -3), Vector2i(-1, -4), Vector2i(-1, -5), Vector2i(0, -6)]
	var begin := maxi(age - 4, 0)
	var end := mini(shape.size(), age + 2)
	for j in range(begin, end):
		var point: Vector2i = origin + Vector2i(shape[j].x * mirror, shape[j].y - maxi(age - 2, 0))
		if Rect2i(Vector2i.ONE, SIZE - Vector2i(2, 2)).has_point(point):
			steam.set_pixelv(point, STEAM[2 if j == 2 else (1 if j < 5 else 0)])

func layers_for(recipe: String, step: int, raw: Image, cooked: Image, branch: Image) -> Array[Image]:
	var food := empty_layer()
	var steam := empty_layer()
	var turning := step >= 6
	var ingredient := cooked if turning else raw
	var extent := 37 if turning else 34
	var pose := sized_icon(ingredient, extent, WIDTH[step])
	var bottom: int = FOOT[step]
	var center: int = CENTER[step]
	if recipe == "meat-skewer" and not turning:
		var stick := sized_icon(branch, 38, WIDTH[step])
		place(food, stick, center - 1, bottom)
		pose = sized_icon(raw, 25, WIDTH[step])
		place(food, pose, center + 2, bottom - 6)
	else:
		place(food, pose, center, bottom)
	var bounds := food.get_used_rect()
	if step >= 3:
		var age := (step - 3) % 7
		curl(steam, Vector2i(center - 5, bounds.position.y - 2), age, -1)
	if step >= 7:
		curl(steam, Vector2i(center + 6, bounds.position.y - 1), step - 7, 1)
	return [food, steam]

func add_layer(project: PixelPenProject, frame: Frame, image: Image, label: String, indices: Dictionary, palette: PackedColorArray) -> void:
	var layer := IndexedColorImage.new()
	layer.layer_uid = project.get_uid()
	layer.label = label
	layer.size = SIZE
	layer.visible = true
	for y in range(SIZE.y):
		for x in range(SIZE.x):
			var color := image.get_pixel(x, y)
			if color.a == 0:
				continue
			var key := color.to_rgba32()
			if not indices.has(key):
				indices[key] = palette.size()
				palette.append(color)
			layer.set_index_on_color_map(x, y, indices[key])
	frame.layers.append(layer)

func create_source(recipe: String, path: String, frames: Array[Image]) -> Error:
	var raw := read_icon(RECIPES[recipe][0])
	var cooked := read_icon(RECIPES[recipe][1])
	var branch: Image
	if recipe == "meat-skewer":
		branch = read_icon("cooking-food-v2/tree-branch")
	if raw == null or cooked == null or (recipe == "meat-skewer" and branch == null):
		return ERR_FILE_NOT_FOUND
	var project := PixelPenProject.new()
	project.initialized(SIZE, recipe)
	PixelPen.state.current_project = project
	project.pool_frames.clear()
	project.animation_timeline.clear()
	project.animation_fps = 5
	project.animation_loop = false
	project.show_timeline = true
	var palette := PackedColorArray([Color.TRANSPARENT])
	var indices := {}
	for step in range(FOOT.size()):
		var frame := Frame.create(project.get_uid())
		var layers := layers_for(recipe, step, raw, cooked, branch)
		add_layer(project, frame, layers[0], "Food", indices, palette)
		add_layer(project, frame, layers[1], "Steam", indices, palette)
		frame.layer_active_uid = frame.layers[0].layer_uid
		project.pool_frames.append(frame)
		var cell := AnimationCell.create(project.get_uid())
		cell.frame = frame
		project.animation_timeline.append(cell)
		var expected := layers[0]
		expected.blend_rect(layers[1], Rect2i(Vector2i.ZERO, SIZE), Vector2i.ZERO)
		frames.append(expected)
	project.palette.color_index = palette
	project.canvas_pool_frame_uid = project.pool_frames[0].frame_uid
	project.active_layer_uid = project.pool_frames[0].layer_active_uid
	project.animation_frame_index = 0
	project.file_path = path
	return ProjectPacker.save(project, path)

func bake(recipe: String, path: String, expected: Array[Image]) -> Error:
	var project := ProjectPacker.load_project(path)
	if project == null or project.animation_timeline.size() != 12:
		return ERR_FILE_CORRUPT
	PixelPen.state.current_project = project
	var atlas := Image.create_empty(SIZE.x * 4, SIZE.y * 3, false, Image.FORMAT_RGBA8)
	for step in range(12):
		var image := project.get_image(project.animation_timeline[step].frame)
		image.convert(Image.FORMAT_RGBA8)
		if not expected.is_empty() and image.get_data() != expected[step].get_data():
			push_error("Indexed pixel mismatch at frame %d" % step)
			return ERR_INVALID_DATA
		atlas.blit_rect(image, Rect2i(Vector2i.ZERO, SIZE), Vector2i(step % 4 * SIZE.x, floori(step / 4.0) * SIZE.y))
	return atlas.save_png(EXPORT + recipe + ".png")

func run() -> void:
	DirAccess.make_dir_recursive_absolute(SOURCE)
	DirAccess.make_dir_recursive_absolute(EXPORT)
	for recipe: String in RECIPES:
		var path := SOURCE + recipe + ".pxpen"
		var expected: Array[Image] = []
		var result := OK
		if OS.get_cmdline_user_args().has("--create") and not FileAccess.file_exists(path):
			result = create_source(recipe, path, expected)
		if result == OK:
			result = bake(recipe, path, expected)
		if result != OK:
			push_error(recipe + " " + error_string(result))
			quit(1)
			return
		print("PIXELPEN_COOKING ", recipe, " 12 frames at 64x64")
	PixelPen.state.current_project = null
	PixelPen.state.free()
	PixelPen.state = null
	quit()
