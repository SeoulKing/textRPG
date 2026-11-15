extends Node3D
const SHADER=preload("res://art/resources/fireball_charge.gdshader")
var material: ShaderMaterial
var strength=0.0
var enabled=true
var fire_light: OmniLight3D
func _ready() -> void:
    var art=MeshInstance3D.new()
    var quad=QuadMesh.new();quad.size=Vector2(1.5,1.5);art.mesh=quad
    art.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
    material=ShaderMaterial.new();material.shader=SHADER;art.material_override=material;add_child(art)
    fire_light=OmniLight3D.new();fire_light.light_color=Color("ffac48");fire_light.omni_range=2.0;fire_light.shadow_enabled=false;add_child(fire_light)
    add_to_group("arcana_flame_lights")
func update_charge(age: float,reduced: bool) -> void:
    var progress=age/.32
    material.set_shader_parameter("progress",progress)
    material.set_shader_parameter("reduced",reduced)
    strength=(.25+1.3*minf(progress,1.0))*maxf(0,1-maxf(0,progress-1)/.45)
    fire_light.visible=enabled and visible
    fire_light.light_energy=strength*.65
func light_source() -> Dictionary:
    if not enabled or not is_visible_in_tree() or strength<.01:return {}
    return {"point":global_position,"range":2.0,"strength":strength,"color":Color("ffac48").srgb_to_linear(),"transient":true}
