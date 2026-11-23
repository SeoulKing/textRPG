extends Node2D
## Crossed firewood with the flame animated above its fixed base.
const ATLAS = preload("res://art/export/effects/arcana-campfire.png")
const RAW_FISH = preload("res://art/export/items/river-fish.png")
const GRILLED_FISH = preload("res://art/export/items/grilled-fish.png")
const FRAME_RATE := 12.0
var sprite: Sprite2D
var cooking_fish: Sprite2D
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
	sprite.hframes = 4
	sprite.vframes = 3
	add_child(sprite)
	warm_light = PointLight2D.new()
	warm_light.texture = preload("res://art/resources/fireball_light.tres")
	warm_light.color = Color("ffac48")
	warm_light.energy = .55
	warm_light.texture_scale = 1.4
	warm_light.position.y = -12
	add_child(warm_light)

# Negative progress clears the fish on completion, interruption or a new job.
func set_cooking_progress(progress: float) -> void:
	if progress < 0:
		if is_instance_valid(cooking_fish): cooking_fish.hide()
		return
	if not is_instance_valid(cooking_fish):
		cooking_fish = Sprite2D.new()
		cooking_fish.position = Vector2(0,-25)
		cooking_fish.rotation = PI / 4.0
		cooking_fish.scale = Vector2.ONE * 0.58
		sprite.add_child(cooking_fish)
	cooking_fish.texture = GRILLED_FISH if progress >= 0.75 else RAW_FISH
	cooking_fish.show()

func _process(delta: float) -> void:
	elapsed += delta
	sprite.frame = int(elapsed * FRAME_RATE) % (sprite.hframes * sprite.vframes) if effects and not reduced else 0
	warm_light.enabled = effects and not ghost and is_visible_in_tree()
	warm_light.energy = .55 if reduced else .55+.035*sin(elapsed*12.0)
	if ghost: queue_redraw()

func _draw() -> void:
	if ghost:
		draw_rect(Rect2(-32,-24,64,48),Color(1,1,1,.2),true)
		draw_rect(Rect2(-32,-24,64,48),Color.WHITE,false,2)
