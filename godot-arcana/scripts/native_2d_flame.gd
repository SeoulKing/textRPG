extends Node2D
const ATLAS=preload("res://art/export/effects/fireball-v1.png")
var elapsed=0.0
var burst=false
var dissipate=false
var direction=Vector2.RIGHT
var flight_distance=0.0
var flight_started=false
var light_enabled=true
var fire_strength=0.0
var fire_light: PointLight2D
var sprite: Sprite2D
func _ready() -> void:
    z_index=4000
    sprite=Sprite2D.new();sprite.texture=ATLAS;sprite.region_enabled=true;add_child(sprite)
    fire_light=PointLight2D.new();add_child(fire_light);fire_light.enabled=false
func advance_flight(reported_distance: float,speed: float,reach: float,delta: float,paused: bool) -> float:
    if not flight_started:flight_started=true;flight_distance=clampf(reported_distance,0,reach)
    elif not paused:flight_distance=minf(reach,maxf(flight_distance+speed*delta,reported_distance))
    return flight_distance
func update_pose(_camera: Camera2D,delta: float,paused: bool,reduced: bool) -> void:
    if not paused:elapsed+=delta
    var x=mini(3,2+int(elapsed/.16*2)) if dissipate else mini(3,int(elapsed/.32*4)) if burst else 1 if reduced else posmod(int(elapsed*16),4)
    sprite.region_rect=Rect2(x*64,64 if burst else 0,64,64)
    sprite.rotation=0 if burst else direction.angle()
    sprite.offset=Vector2.ZERO if burst else Vector2(-20,0)
func finished() -> bool:return burst and elapsed>=(.16 if dissipate else .32)
