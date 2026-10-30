@tool
extends Node3D
## F6 art preview only; no world, server, collision or save state.
const Actor=preload("res://scripts/heroine_blender.gd")
@export var show_real_3d_mesh=false
@export_range(0.0,3.0) var speed=1.0
@export var turntable=true
var hero:Node3D
var elapsed=0.0
func _ready() -> void:
    hero=Actor.new();hero.render_as_sprite=not show_real_3d_mesh;add_child(hero)
    var camera=Camera3D.new();add_child(camera);camera.projection=Camera3D.PROJECTION_ORTHOGONAL;camera.size=3.1
    camera.position=Vector3(0,5,5);camera.look_at(Vector3(0,1.1,0));camera.current=true
    var environment=WorldEnvironment.new();environment.environment=Environment.new();environment.environment.background_mode=Environment.BG_COLOR;environment.environment.background_color=Color("77869b");add_child(environment)
    if show_real_3d_mesh:
        for mat in hero.toon_materials:mat.set_shader_parameter("editor_preview",true)
        hero.ink_material.set_shader_parameter("editor_preview",true)
func _process(delta:float) -> void:
    if Engine.is_editor_hint() or hero==null:return
    elapsed+=delta
    var angle=elapsed*.5 if turntable else 0.0
    hero.last_yaw=angle
    hero.pose(elapsed,0,speed>0,Vector2(sin(angle),cos(angle))*speed*16.0*delta,true,true)
