extends RefCounted

static var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://art/source/kit.json"))
const HERO = preload("res://art/resources/hero.tres")
const TRAVELER = preload("res://art/resources/traveler.tres")
const TERRAIN = preload("res://art/resources/terrain.tres")
const SCALE = 0.5
static var _textures: Dictionary = {}

static func definition(id: String) -> Dictionary:
	for item in data.assets:
		if item.id == id: return item
	return {}

static func texture(id: String) -> Texture2D:
	if not _textures.has(id): _textures[id] = load("res://art/export/" + id + ".png")
	return _textures[id]

static func place(id: String, at: Vector2, parent: Node2D) -> Sprite2D:
	var item = definition(id)
	var sprite = Sprite2D.new()
	sprite.texture = texture(id)
	sprite.centered = false
	sprite.offset = -Vector2(item.pivot[0], item.pivot[1])
	sprite.position = at
	sprite.scale = Vector2.ONE * SCALE
	parent.add_child(sprite)
	return sprite

static func actor(traveler: bool = false) -> AnimatedSprite2D:
	var sprite = AnimatedSprite2D.new()
	sprite.sprite_frames = TRAVELER if traveler else HERO
	sprite.centered = false
	sprite.offset = Vector2(-16, -46)
	sprite.scale = Vector2.ONE * SCALE
	sprite.play("idle_south")
	return sprite
