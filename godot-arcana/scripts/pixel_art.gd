extends RefCounted

# Small, original pixel sprites. Every texture uses the same limited palette.
static func image(w: int, h: int) -> Image:
	var img = Image.create(w, h, false, Image.FORMAT_RGBA8)
	img.fill(Color.TRANSPARENT)
	return img

static func box(img: Image, x: int, y: int, w: int, h: int, color: String) -> void:
	img.fill_rect(Rect2i(x, y, w, h), Color(color))

static func texture(img: Image) -> ImageTexture:
	return ImageTexture.create_from_image(img)

static func grass(seed_value: int) -> Texture2D:
	var img = image(16, 16)
	var rng = RandomNumberGenerator.new()
	rng.seed = seed_value + 527
	img.fill(Color("50784c" if seed_value % 3 else "527b4c"))
	for i in range(14):
		var x = rng.randi_range(0, 14)
		var y = rng.randi_range(1, 14)
		box(img, x, y, 1, 2, "648a53" if i % 2 else "436a45")
		if i % 3 == 0: box(img, x + 1, y, 1, 1, "769759")
	return texture(img)

static func paving(seed_value: int) -> Texture2D:
	var img = image(16, 16)
	img.fill(Color("71827c"))
	for row in range(4):
		for col in range(3):
			var x = col * 8 - (4 if row % 2 else 0)
			img.fill_rect(Rect2i(maxi(0, x), row * 4, mini(7, 16 - maxi(0, x)), 3), Color("89978b" if (row + col + seed_value) % 3 else "7e8e82"))
	return texture(img)

static func dirt(seed_value: int) -> Texture2D:
	var img = image(16, 16)
	img.fill(Color("a28e68"))
	for i in range(12):
		box(img, (i * 7 + seed_value * 3) % 16, (i * 11 + seed_value) % 16, 2, 1, "b3a17a" if i % 2 else "91815e")
	return texture(img)

static func tree(variant: int = 0) -> Texture2D:
	var img = image(40, 54)
	box(img, 17, 32, 7, 20, "374638")
	box(img, 18, 33, 3, 18, "7c6546")
	box(img, 16, 48, 11, 3, "756344")
	var colors = ["254b3d", "306047", "3d7350", "548555", "6a975c"]
	if variant == 1: colors = ["274b46", "346456", "427e65", "579376", "78a785"]
	for layer in range(4):
		var y = 4 + layer * 7
		var w = 16 + layer * 6
		var x = 20 - w / 2
		box(img, x, y, w, 12, colors[0])
		box(img, x + 2, y - 2, w - 4, 12, colors[1])
		box(img, x + 3, y - 3, w - 7, 9, colors[2])
		box(img, x + 4, y - 3, w - 12, 4, colors[3])
		box(img, x + 6, y - 3, 5, 2, colors[4])
	for i in range(18):
		var x = 9 + (i * 11) % 24
		var y = 8 + (i * 7) % 27
		box(img, x, y, 2, 1, colors[3] if i % 2 else colors[1])
	return texture(img)

static func building(kind: String) -> Texture2D:
	var academy = kind == "academy"
	var w = 112 if academy else 72
	var h = 108 if academy else 76
	var img = image(w, h)
	var roof = "52697d" if kind in ["inn", "academy"] else "81645e"
	var bright = "7c9baa" if kind in ["inn", "academy"] else "b08a72"
	box(img, 5, h - 39, w - 10, 35, "3a4542")
	box(img, 7, h - 39, w - 14, 31, "d5c7a0")
	box(img, 9, h - 36, w - 18, 27, "e1d3ac")
	box(img, 7, h - 13, w - 14, 7, "a99f81")
	for x in range(9, w - 8, 20):
		box(img, x, h - 37, 3, 28, "6a6353")
	for y in range(h - 34, h - 12, 7):
		box(img, 11 + (y % 3), y, 4, 1, "c2b58f")
	# Stepped roof silhouette, ridge highlights, individual tiles.
	for row in range(26):
		var inset = maxi(0, 16 - row)
		box(img, 2 + inset, h - 68 + row, w - 4 - inset * 2, 1, roof)
		if row % 4 == 0:
			for x in range(5 + inset, w - 6 - inset, 8):
				box(img, x + (4 if row % 8 else 0), h - 68 + row, 6, 1, bright)
	box(img, 2, h - 43, w - 4, 3, "354b50")
	box(img, 17, h - 69, w - 34, 2, bright)
	for x in [15, w - 24]:
		box(img, x, h - 34, 10, 14, "4d5b58")
		box(img, x + 1, h - 33, 8, 11, "cba65e")
		box(img, x + 2, h - 32, 3, 8, "f5dd9a")
		box(img, x, h - 28, 10, 1, "6e745f")
		box(img, x + 4, h - 34, 1, 14, "6e745f")
		box(img, x - 1, h - 20, 12, 2, "67715f")
	box(img, w / 2 - 7, h - 24, 14, 20, "62604f")
	box(img, w / 2 - 5, h - 22, 10, 18, "474e46")
	box(img, w / 2 - 3, h - 20, 6, 15, "765c45")
	box(img, w / 2 + 2, h - 13, 1, 1, "ecd191")
	box(img, w / 2 - 9, h - 5, 18, 3, "b6b69a")
	if kind in ["shop", "restaurant"]:
		for x in range(8, w - 8):
			box(img, x, h - 35, 1, 7, "d1c8a3" if (x / 6) % 2 == 0 else ("617c7d" if kind == "shop" else "a46f61"))
		box(img, 9, h - 28, w - 18, 2, "576754")
		box(img, w - 16, h - 16, 9, 11, "72553e")
		box(img, w - 15, h - 15, 7, 2, "b49563")
	if academy:
		for x in [5, w - 23]:
			box(img, x, 18, 18, 71, "b7b39a")
			box(img, x + 2, 17, 14, 65, "d7d0af")
			for row in range(18):
				var rw = 20 - row
				box(img, x + 9 - rw / 2, 18 - row, rw, 1, roof)
			box(img, x + 6, 28, 6, 14, "5c7c83")
			box(img, x + 7, 29, 3, 11, "9ed4cc")
		box(img, 49, 18, 14, 21, "9cbec2")
		box(img, 52, 21, 8, 15, "d2e6d4")
	return texture(img)

static func person(coat: String, hair: String, direction: int, frame: int) -> Texture2D:
	var img = image(16, 24)
	var step = 1 if frame == 1 else (-1 if frame == 3 else 0)
	box(img, 4, 18, 3, 5 - step, "34474b")
	box(img, 9, 18, 3, 5 + step, "34474b")
	box(img, 3, 22 - step, 4, 2, "26353d")
	box(img, 9, 22 + step, 4, 2, "26353d")
	box(img, 3, 10, 10, 10, "2c4048")
	box(img, 4, 10, 8, 9, coat)
	box(img, 5, 11, 3, 6, Color(coat).lightened(.16).to_html())
	box(img, 2, 12 + step, 2, 5, coat)
	box(img, 12, 12 - step, 2, 5, coat)
	box(img, 2, 17 + step, 2, 2, "d4ad85")
	box(img, 12, 17 - step, 2, 2, "d4ad85")
	box(img, 4, 2, 8, 8, "35423f")
	box(img, 5, 4, 6, 6, "e1bd94")
	box(img, 4, 1, 8, 4, hair)
	box(img, 3, 3, 2, 5, hair)
	box(img, 11, 3, 2, 4, hair)
	box(img, 5, 1, 5, 1, Color(hair).lightened(.18).to_html())
	if direction == 1:
		box(img, 4, 4, 8, 5, hair)
		box(img, 6, 9, 4, 3, "b7bda1")
	else:
		box(img, 6 if direction != 2 else 5, 6, 1, 1, "30414b")
		if direction != 2: box(img, 10, 6, 1, 1, "30414b")
		box(img, 6, 10, 5, 2, "c9b489")
	return texture(img)

static func fountain() -> Texture2D:
	var img = image(56, 58)
	box(img, 7, 30, 42, 21, "405e64")
	box(img, 3, 34, 50, 14, "536e70")
	box(img, 5, 32, 46, 13, "a8b4a0")
	box(img, 8, 34, 40, 12, "4e9caa")
	box(img, 11, 35, 34, 8, "78c2c6")
	box(img, 8, 46, 40, 5, "b0bba3")
	box(img, 13, 51, 30, 3, "71877d")
	box(img, 24, 17, 8, 26, "9eafa0")
	box(img, 26, 13, 4, 24, "cccfac")
	box(img, 17, 16, 22, 4, "bec5a5")
	box(img, 19, 13, 18, 4, "759d9a")
	box(img, 26, 4, 4, 9, "bcdfd0")
	box(img, 27, 1, 2, 8, "e0efc9")
	return texture(img)

static func portal() -> Texture2D:
	var img = image(42, 52)
	box(img, 4, 8, 7, 40, "667c7d")
	box(img, 31, 8, 7, 40, "667c7d")
	box(img, 8, 3, 26, 8, "8caaa3")
	box(img, 12, 0, 18, 6, "b2bdab")
	box(img, 2, 46, 38, 5, "a4b49d")
	box(img, 11, 9, 20, 37, "3e768f")
	box(img, 14, 9, 14, 35, "599fb1")
	box(img, 17, 13, 8, 27, "93d5cb")
	for y in range(12, 44, 8):
		box(img, 6, y, 2, 3, "b2dccd")
		box(img, 33, y, 2, 3, "b2dccd")
	return texture(img)

static func slime(frame: int) -> Texture2D:
	var img = image(24, 20)
	var up = 1 if frame % 2 else 0
	box(img, 4, 8 - up, 16, 9 + up, "315f55")
	box(img, 2, 12, 20, 5, "315f55")
	box(img, 5, 5 - up, 14, 11, "77b686")
	box(img, 7, 3 - up, 10, 10, "8bc597")
	box(img, 5, 11, 14, 5, "69a780")
	box(img, 7, 6 - up, 5, 2, "bad9a5")
	box(img, 7, 11 - up, 2, 2, "293f46")
	box(img, 15, 11 - up, 2, 2, "293f46")
	box(img, 11, 14 - up, 3, 1, "4b7766")
	return texture(img)
