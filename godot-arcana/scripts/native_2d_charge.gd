extends Sprite2D
var enabled=true
var strength=0.0
var fire_light: PointLight2D
func _ready() -> void:
    z_index=4000
    var image=Image.create(96,96,false,Image.FORMAT_RGBA8);image.fill(Color.WHITE)
    texture=ImageTexture.create_from_image(image)
    material=ShaderMaterial.new();material.shader=preload("res://art/resources/native_charge.gdshader")
    fire_light=PointLight2D.new();fire_light.enabled=false;add_child(fire_light)
func update_charge(age: float,reduced: bool) -> void:
    strength=clampf(age/.32,0,1)
    material.set_shader_parameter("progress",age/.32)
    material.set_shader_parameter("reduced",reduced)
