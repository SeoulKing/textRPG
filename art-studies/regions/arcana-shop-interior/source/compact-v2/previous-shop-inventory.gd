@tool
extends Node3D
## Independent 2D sprites at 64 source pixels per world unit.
const Prop = preload("res://scripts/illustrated_prop.gd")
const FLOOR = preload("res://art/resources/inn_floor.gdshader")
const COUNTER_POINT = Vector2(192,160)
const EXIT_POINT = Vector2(192,256)
var light_sources: Array[Dictionary] = []
var assets: Dictionary = {}

static func collision_rects() -> Array[Rect2]:
	return [Rect2(48,0,288,68),Rect2(0,0,48,328),Rect2(336,0,48,328),
		Rect2(0,268,384,76),Rect2(48,256,120,12),Rect2(216,256,120,12),
		Rect2(154,128,76,14),Rect2(185,113,14,14),
		Rect2(90,198,28,16),Rect2(266,198,28,16),
		Rect2(77,70,32,18),Rect2(126,70,32,18),Rect2(176,70,32,18),
		Rect2(224,70,36,18),Rect2(273,70,36,18),
		Rect2(50,108,12,12),Rect2(322,108,12,12),Rect2(50,242,12,12),Rect2(322,242,12,12)]

func _ready() -> void:
	var data = JSON.parse_string(FileAccess.get_file_as_string("res://art/export/shop-interior/manifest.json"))
	if not data is Dictionary:
		push_error("Shop art manifest is missing.")
		return
	assets = data.assets
	_ground("OakFloor","res://art/export/inn-lobby/oak-floor.png",Vector3(12,0,10.25),Vector2(18,12.5),Vector2(9,6.25))
	_ground("CelestialRug","res://art/export/inn-lobby/small-rug.png",Vector3(12,.025,12.1),Vector2(3,6.6))
	for x in [5.1,9.3,13.5,17.7]:
		_shared("wall",Vector3(x,0,4),false)
	_sprite("potion-arch",Vector3(12,0,5.3),false)
	_sprite("herb-cabinet",Vector3(5.8,0,5.3),false)
	_sprite("herb-cabinet",Vector3(8.9,0,5.3),false)
	_sprite("travel-cabinet",Vector3(18.2,0,5.3),false)
	_sprite("travel-cabinet",Vector3(15.1,0,5.3),false)
	_sprite("merchant",Vector3(12,0,7.6),false)
	_sprite("counter",Vector3(12,0,8.8))
	_sprite("potion-island",Vector3(6.5,0,13.25))
	_sprite("travel-island",Vector3(17.5,0,13.25))
	for at in [Vector3(3.5,0,7.2),Vector3(20.5,0,7.2),Vector3(3.5,0,15.5),Vector3(20.5,0,15.5)]:
		_shared("plant",at)
	for x in [4.0,9.2,14.8,20.0]:
		_shared("lantern",Vector3(x,1.8,4.1),false)
		light_sources.append({"point":Vector3(x,2.4,4.6),"range":6.0,"strength":.22,"color":Color("ffdba0").srgb_to_linear(),"fireplace":false,"base_strength":.22})
	for x in [6.75,17.25]:
		_shared("front-wall",Vector3(x,0,16.5))
	_ground("EntranceThreshold","res://art/export/inn-lobby/oak-floor.png",Vector3(12,.03,16.25),Vector2(3,.5))

func _sprite(id: String, at: Vector3, fade: bool = true) -> Node3D:
	return _prop(id,assets[id],at,fade)

func _shared(id: String, at: Vector3, fade: bool = true) -> Node3D:
	var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://art/export/inn-lobby/manifest.json"))
	return _prop(id,data.assets[id],at,fade)

func _prop(id: String, spec: Dictionary, at: Vector3, fade: bool) -> Node3D:
	var prop = Prop.new()
	prop.name = "Shop_"+id.replace("-","_")
	prop.position = at
	prop.asset = load(spec.file) as Texture2D
	prop.pixel_size = Vector2i(int(spec.size[0]),int(spec.size[1]))
	prop.foot = Vector2(float(spec.foot[0]),float(spec.foot[1]))
	prop.fade_for_player = fade
	prop.shadow_size = Vector2(float(spec.size[0])/64.0*.65,.30) if fade else Vector2.ZERO
	add_child(prop)
	return prop

func _ground(label: String, file: String, at: Vector3, size: Vector2, repeats: Vector2 = Vector2.ONE) -> void:
	var visual = MeshInstance3D.new()
	visual.name = label
	visual.position = at
	visual.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var plane = PlaneMesh.new()
	plane.size = size
	visual.mesh = plane
	var mat = ShaderMaterial.new()
	mat.shader = FLOOR
	mat.set_shader_parameter("art",load(file))
	mat.set_shader_parameter("repeats",repeats)
	visual.material_override = mat
	add_child(visual)
