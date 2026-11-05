extends Node2D
const ATLAS=preload("res://art/export/effects/fireball-v1.png")
# The painted flight axis rises toward the head; rotate around HEAD_ANCHORS to level it.
const FLIGHT_ART_ANGLE_CORRECTION = PI / 15.0
const HEAD_ANCHORS=[Vector2(.807367,.471197),Vector2(.809930,.471440),Vector2(.804091,.472682),Vector2(.795913,.472696)]
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
    sprite.scale=Vector2(64.0/(ATLAS.get_width()/4.0),64.0/(ATLAS.get_height()/2.0))
    fire_light=PointLight2D.new();fire_light.texture=preload("res://art/resources/fireball_light.tres");fire_light.color=Color("ffac48");fire_light.energy=0.8;add_child(fire_light)
func advance_flight(reported_distance: float,speed: float,reach: float,delta: float,paused: bool) -> float:
    if not flight_started:flight_started=true;flight_distance=clampf(reported_distance,0,reach)
    elif not paused:flight_distance=minf(reach,maxf(flight_distance+speed*delta,reported_distance))
    return flight_distance
func update_pose(_camera: Camera2D,delta: float,paused: bool,reduced: bool) -> void:
    if not paused:elapsed+=delta
    var x=mini(3,2+int(elapsed/.16*2)) if dissipate else mini(3,int(elapsed/.32*4)) if burst else 1 if reduced else posmod(int(elapsed*16),4)
    var cell=Vector2(ATLAS.get_width()/4.0,ATLAS.get_height()/2.0)
    sprite.region_rect=Rect2(Vector2(x*cell.x,cell.y if burst else 0),cell)
    sprite.rotation=0 if burst else direction.angle()+FLIGHT_ART_ANGLE_CORRECTION
    sprite.offset=Vector2.ZERO if burst else (Vector2(.5,.5)-HEAD_ANCHORS[x])*cell
    var envelope=maxf(0.0,1.0-elapsed/(.16 if dissipate else .32)) if burst else 1.0
    fire_light.enabled=light_enabled and visible and envelope>0.01
    fire_light.energy=0.8*envelope*(1.0 if reduced else 1.0+0.06*sin(elapsed*17.0))
func finished() -> bool:return burst and elapsed>=(.16 if dissipate else .32)
