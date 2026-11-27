extends Node2D
## Crossed firewood with the flame animated above its fixed base.
const ATLAS = preload("res://art/export/effects/arcana-campfire.png")
const CookingAnimation := preload("res://scripts/cooking_animation.gd")
const FRAME_RATE := 12.0
var sprite: Sprite2D
var cooking_food: Sprite2D
var cooking_recipe := ""
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

func set_cooking_progress(recipe_id: String, fraction: float) -> void:
	if recipe_id.is_empty():
		if is_instance_valid(cooking_food): cooking_food.hide()
		return
	if not is_instance_valid(cooking_food):
		cooking_food = Sprite2D.new()
		cooking_food.centered = false
		cooking_food.offset = Vector2(-32, -52)
		cooking_food.position = Vector2(0, -25)
		cooking_food.hframes = 4
		cooking_food.vframes = 3
		sprite.add_child(cooking_food)
	if recipe_id != cooking_recipe:
		cooking_recipe = recipe_id
		cooking_food.texture = CookingAnimation.sheet_for(recipe_id)
	cooking_food.visible = cooking_food.texture != null
	if cooking_food.visible:
		cooking_food.frame = CookingAnimation.frame_for(fraction, reduced or not effects)

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
