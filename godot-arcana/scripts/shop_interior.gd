@tool
extends Node3D
## The whole 14x9 room is authored at 64px/world unit, with no repeating ground.
const Prop = preload("res://scripts/illustrated_prop.gd")
const FLOOR = preload("res://art/resources/shop_floor.gdshader")
const COUNTER_POINT = Vector2(192,141)
const EXIT_POINT = Vector2(192,205)
const ARRIVAL_POINT = Vector2(192,189)
const LAYOUT = [
	{"asset":"herb-cabinet","x":7.5,"z":5,"w":2,"d":1},
	{"asset":"herb-cabinet","x":9.5,"z":5,"w":2,"d":1},
	{"asset":"potion-arch","x":11.5,"z":5,"w":2,"d":1},
	{"asset":"travel-cabinet","x":13.75,"z":5,"w":2.5,"d":1},
	{"asset":"travel-cabinet","x":16.25,"z":5,"w":2.5,"d":1},
	{"asset":"merchant","x":12,"z":6.65,"w":0.75,"d":0.5,"fade":false},
	{"asset":"counter","x":12,"z":7.75,"w":4.5,"d":1},
	{"asset":"apothecary-bench-v2","x":7,"z":8.5,"w":3,"d":1},
	{"asset":"potion-island","x":6.5,"z":10,"w":1.5,"d":1},
	{"asset":"travel-island","x":17.5,"z":11,"w":1.5,"d":1},
	{"asset":"travel-stock-v2","x":17.5,"z":12,"w":2,"d":1},
	{"asset":"luggage","x":7,"z":11.5,"w":1.5,"d":1,"shared":true},
	{"asset":"plant","x":6,"z":11.5,"w":0.75,"d":0.75,"shared":true},
	{"asset":"plant","x":18,"z":9.5,"w":0.75,"d":0.75,"shared":true},
]
var light_sources: Array[Dictionary] = []
var assets: Dictionary = {}
var shared_assets: Dictionary = {}

static func collision_rects() -> Array[Rect2]:
	var result: Array[Rect2] = [Rect2(0,0,384,74),Rect2(0,0,87,344),Rect2(297,0,87,344),
		Rect2(0,212,384,132),Rect2(80,204,96,10),Rect2(208,204,96,10)]
	for entry in LAYOUT:
		var size = Vector2(float(entry.w),float(entry.d))
		var front = Vector2(float(entry.x),float(entry.z))
		result.append(Rect2((front-Vector2(size.x*.5,size.y))*16.0,size*16.0))
	return result

func _ready() -> void:
	var data = JSON.parse_string(FileAccess.get_file_as_string("res://art/export/shop-interior/manifest.json"))
	var shared = JSON.parse_string(FileAccess.get_file_as_string("res://art/export/inn-lobby/manifest.json"))
	if not data is Dictionary or not shared is Dictionary:
		push_error("Shop room art manifest is missing.")
		return
	assets = data.assets
	shared_assets = shared.assets
	_ground()
	_sprite("back-wall-solid",Vector3(12,0,4),false)
	# Artwork, footprints and collisions share this grid-registered layout.
	for entry in LAYOUT:
		var at = Vector3(float(entry.x),0,float(entry.z))
		var fade = bool(entry.get("fade",true))
		if entry.get("shared",false): _shared(str(entry.asset),at,fade)
		else: _sprite(str(entry.asset),at,fade)
	# One finished outline joins the low walls, beveled corners and capped doorway.
	_sprite("room-boundary-v3",Vector3(12,0,12.5))
	for x in [5.7,8.2,15.8,18.3]:
		_shared("lantern",Vector3(x,2.0,4.1),false)
		light_sources.append({"point":Vector3(x,2.4,4.8),"range":5.0,"strength":.30,"color":Color("ffdba0").srgb_to_linear(),"fireplace":false,"base_strength":.30})
	# A small warm pool lights the workbench without lighting the whole floor equally.
	light_sources.append({"point":Vector3(6.9,1.1,8.6),"range":3.0,"strength":.12,"color":Color("ffdba0").srgb_to_linear(),"fireplace":false,"base_strength":.12})

func _sprite(id: String, at: Vector3, fade: bool = true) -> Node3D:
	return _prop(id,assets[id],at,fade)

func _shared(id: String, at: Vector3, fade: bool = true) -> Node3D:
	return _prop(id,shared_assets[id],at,fade)

func _prop(id: String, spec: Dictionary, at: Vector3, fade: bool) -> Node3D:
	var prop = Prop.new()
	if id == "merchant": prop.interaction_id = "merchant"
	prop.name = "Shop_"+id.replace("-","_")
	prop.position = at
	prop.asset = load(spec.file) as Texture2D
	prop.pixel_size = Vector2i(int(spec.size[0]),int(spec.size[1]))
	prop.foot = Vector2(float(spec.foot[0]),float(spec.foot[1]))
	prop.fade_for_player = fade
	var is_frame = id == "room-boundary-v3" or id.begins_with("side-wall") or id.begins_with("front-wall")
	prop.shadow_size = Vector2(float(spec.size[0])/64.0*.65,.25) if fade and not is_frame else Vector2.ZERO
	add_child(prop)
	return prop

func _ground() -> void:
	var visual = MeshInstance3D.new()
	visual.name = "AuthoredRoomFloor"
	visual.position = Vector3(12,0,8.5)
	visual.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var plane = PlaneMesh.new()
	plane.size = Vector2(14,9)
	visual.mesh = plane
	var mat = ShaderMaterial.new()
	mat.shader = FLOOR
	mat.set_shader_parameter("art",load(assets["floor-room-v2"].file))
	visual.material_override = mat
	add_child(visual)
