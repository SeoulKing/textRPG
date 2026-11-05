extends Sprite2D
var enabled=true
var strength=0.0
var fire_light: PointLight2D
func _ready() -> void:
    z_index=4000
    var image=Image.create(96,96,false,Image.FORMAT_RGBA8);image.fill(Color.WHITE)
    texture=ImageTexture.create_from_image(image)
    material=ShaderMaterial.new();material.shader=preload("res://art/resources/native_charge.gdshader")
    fire_light=PointLight2D.new();fire_light.texture=preload("res://art/resources/fireball_light.tres");fire_light.color=Color("ffac48");add_child(fire_light)
func update_charge(age: float,reduced: bool) -> void:
    var progress=age/.32
    strength=(.25+1.3*minf(progress,1.0))*maxf(0,1-maxf(0,progress-1)/.45)
    fire_light.enabled=enabled and visible and strength>0.01
    fire_light.energy=strength*.65
    material.set_shader_parameter("progress",progress)
    material.set_shader_parameter("reduced",reduced)