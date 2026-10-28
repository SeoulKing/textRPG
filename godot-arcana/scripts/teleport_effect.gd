extends Node3D
## Independent skill overlay. Never edits heroine frames, materials, or animation state.
const ATLAS=preload("res://art/export/effects/teleport-v1/teleport-effect.png")
const SHADER=preload("res://art/resources/teleport_effect.gdshader")
var departure: MeshInstance3D
var arrival: MeshInstance3D
func _ready() -> void:
    departure=_make_sprite("TeleportDeparture")
    arrival=_make_sprite("TeleportArrival")
func _make_sprite(label: String) -> MeshInstance3D:
    var node=MeshInstance3D.new()
    node.name=label
    var quad=QuadMesh.new()
    quad.size=Vector2(96,136)/64.0
    node.mesh=quad
    node.custom_aabb=AABB(Vector3(-1,0,-1),Vector3(2,2.8,2))
    node.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
    var material=ShaderMaterial.new()
    material.shader=SHADER
    material.set_shader_parameter("effect_texture",ATLAS)
    node.material_override=material
    node.visible=false
    add_child(node)
    return node
func update_pose(age: float,direction: int,origin: Vector3,destination: Vector3,effects: bool,reduced: bool) -> void:
    var active=age>=0 and age<.16 and effects and not reduced
    var frame=clampi(int(age/.02),0,7)
    departure.visible=active and frame<4
    arrival.visible=active and frame>=4
    departure.position=origin
    arrival.position=destination
    for sprite in [departure,arrival]:sprite.material_override.set_shader_parameter("frame_cell",Vector2(frame,posmod(direction,8)))
static func hides_character(age: float,effects: bool,reduced: bool) -> bool:
    return effects and not reduced and age>=.02 and age<.12
