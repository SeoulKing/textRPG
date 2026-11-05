extends Node2D
const ATLAS=preload("res://art/export/effects/teleport-v1/teleport-effect.png")
var departure: Sprite2D
var arrival: Sprite2D
func _ready() -> void:
    departure=_sprite();arrival=_sprite()
func _sprite() -> Sprite2D:
    var sprite=Sprite2D.new();sprite.texture=ATLAS;sprite.centered=false
    sprite.offset=Vector2(-48,-116);sprite.region_enabled=true;add_child(sprite);sprite.hide()
    return sprite
func update_pose(age: float,direction: int,origin: Vector2,destination: Vector2,effects: bool,reduced: bool) -> void:
    var active=age>=0 and age<.16 and effects and not reduced
    var frame=clampi(int(age/.02),0,7)
    departure.visible=active and frame<4;arrival.visible=active and frame>=4
    departure.position=origin;arrival.position=destination
    for sprite in [departure,arrival]:sprite.region_rect=Rect2(frame*96,posmod(direction,8)*136,96,136)
static func hides_character(age: float,effects: bool,reduced: bool) -> bool:
    return effects and not reduced and age>=.02 and age<.12
