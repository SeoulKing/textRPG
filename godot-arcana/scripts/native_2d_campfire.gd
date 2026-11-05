extends Node2D
## Existing PixelFX MIT campfire; source pixels and its original pivot are preserved.
const ATLAS = preload("res://art/export/effects/pixelfx-campfire.png")
var sprite: Sprite2D
var warm_light: PointLight2D
var ghost: bool = false
var elapsed: float = 0.0
var effects: bool = true
var reduced: bool = false

func _ready() -> void:
	set_meta("campfire", true)
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	sprite = Sprite2D.new()
	sprite.texture = ATLAS
	sprite.centered = false
	sprite.offset = Vector2(-64,-112)
	sprite.region_enabled = true
	sprite.region_rect = Rect2(0,0,128,128)
	add_child(sprite)
	warm_light = PointLight2D.new()
	warm_light.texture = preload("res://art/resources/fireball_light.tres")
	warm_light.color = Color("ffac48")
	warm_light.energy = .55
	warm_light.texture_scale = 1.4
	warm_light.position.y = -12
	add_child(warm_light)

func _process(delta: float) -> void:
	elapsed += delta
	var frame: int = int(elapsed*12.0)%36 if effects and not reduced else 0
	sprite.region_rect = Rect2((frame%6)*128,(frame/6)*128,128,128)
	warm_light.enabled = effects and not ghost and is_visible_in_tree()
	warm_light.energy = .55 if reduced else .55+.035*sin(elapsed*12.0)
	if ghost: queue_redraw()

func _draw() -> void:
	if ghost:
		draw_rect(Rect2(-32,-24,64,48),Color(1,1,1,.2),true)
		draw_rect(Rect2(-32,-24,64,48),Color.WHITE,false,2)