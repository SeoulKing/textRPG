extends RefCounted
## Pixel frames use one small nearest-filtered texture per style so corners stay crisp.

const INK := Color("303832")
const MUTED := Color("545e54")
const ALLOWED := Color("2e654a")
const BLOCKED := Color("963b32")
const PAPER := Color("f1e6cb")
const BORDER := Color("475145")
const FOCUS := Color("ac661f")

const FRAME_PIXELS := [
	"  xxxxx  ",
	" xhhhhhx ",
	"xh.....sx",
	"xh.....sx",
	"xh.....sx",
	"xh.....sx",
	"xh.....sx",
	" xsssssx ",
	"  xxxxx  ",
]

const GLYPHS := {
	"list": ["........", ".##.###.", ".##.....", "....###.", ".##.....", ".##.###.", "........", "........"],
	"exit": ["..####..", "..#..#..", "..#....#", "..#.####", "..#....#", "..#..#..", "..####..", "........"],
	"turn": [".....#..", "..####..", ".#...##.", ".#...###", ".#......", ".#....#.", "..####..", "........"],
	"check": ["........", ".......#", "......#.", ".....#..", "#...#...", ".#.#....", "..#.....", "........"],
	"store": ["........", "########", "#......#", "########", "#..##..#", "#......#", "########", "........"],
	"cancel": ["........", ".#....#.", "..#..#..", "...##...", "...##...", "..#..#..", ".#....#.", "........"],
}


static func create(base: Theme) -> Theme:
	var theme := base.duplicate() as Theme
	theme.set_stylebox("panel", "PanelContainer", _frame(PAPER, BORDER, Color("fff5d9"), Color("b9ad88"), Vector2(10, 7)))
	theme.set_constant("h_separation", "Button", 5)
	theme.set_font_size("font_size", "Button", 14)
	_buttons(theme, "Button", Color("eadbb8"), Color("f9edcd"), Color("d6c59b"), INK)
	theme.set_type_variation("FurnitureConfirm", "Button")
	_buttons(theme, "FurnitureConfirm", Color("42634b"), Color("4a6c53"), Color("35533f"), Color("fff6dd"))
	theme.set_stylebox("scroll", "VScrollBar", _frame(Color("d9cba8"), Color("b1a57e"), Color("b1a57e"), Color("b1a57e"), Vector2(5, 0)))
	var grabber := _frame(Color("81794f"), BORDER, Color("baa36c"), BORDER, Vector2(5, 3))
	for state: String in ["grabber", "grabber_highlight", "grabber_pressed"]:
		theme.set_stylebox(state, "VScrollBar", grabber)
	return theme


static func icon(id: String) -> ImageTexture:
	var pattern: Array = GLYPHS[id]
	var image := Image.create_empty(16, 16, false, Image.FORMAT_RGBA8)
	for y in range(8):
		for x in range(8):
			if pattern[y][x] == "#":
				image.fill_rect(Rect2i(x * 2, y * 2, 2, 2), Color.WHITE)
	return ImageTexture.create_from_image(image)


static func _buttons(theme: Theme, type: String, fill: Color, hover: Color, pressed: Color, text: Color) -> void:
	var margin := Vector2(6, 4)
	for state: String in ["normal", "hover", "pressed"]:
		var color := fill
		if state == "hover":
			color = hover
		elif state == "pressed":
			color = pressed
		theme.set_stylebox(state, type, _frame(color, BORDER, color.lightened(0.24), color.darkened(0.22), margin))
	theme.set_stylebox("disabled", type, _frame(Color("ded5be"), Color("9b9b85"), Color("e7dfc6"), Color("beb49a"), margin))
	theme.set_stylebox("focus", type, _frame(Color.TRANSPARENT, FOCUS, Color.TRANSPARENT, Color.TRANSPARENT, margin))
	for state: String in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color"]:
		theme.set_color(state, type, text)
	theme.set_color("font_disabled_color", type, MUTED)
	theme.set_color("icon_normal_color", type, text)
	theme.set_color("icon_hover_color", type, text)
	theme.set_color("icon_pressed_color", type, text)
	theme.set_color("icon_focus_color", type, text)
	theme.set_color("icon_disabled_color", type, MUTED)


static func _frame(fill: Color, edge: Color, highlight: Color, shade: Color, margin: Vector2) -> StyleBoxTexture:
	var image := Image.create_empty(9, 9, false, Image.FORMAT_RGBA8)
	var colors := {".": fill, "x": edge, "h": highlight, "s": shade}
	for y in range(9):
		for x in range(9):
			var color: Color = colors.get(FRAME_PIXELS[y][x], Color.TRANSPARENT)
			image.set_pixel(x, y, color)
	var style := StyleBoxTexture.new()
	style.texture = ImageTexture.create_from_image(image)
	for side in [SIDE_LEFT, SIDE_TOP, SIDE_RIGHT, SIDE_BOTTOM]:
		style.set_texture_margin(side, 4.0)
		style.set_content_margin(side, margin.x if side in [SIDE_LEFT, SIDE_RIGHT] else margin.y)
	return style
