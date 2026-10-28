@tool
extends Node3D
## Hand-drawn 2D modules, registered to the existing inn navigation coordinates.
const Prop = preload("res://scripts/illustrated_prop.gd")
const FLOOR = preload("res://art/resources/inn_floor.gdshader")
const SOFA_POINT = Vector2(112,164)
# Boots below the central cushion; navigation remains in front of its collision.
const SOFA_SEAT_VISUAL = Vector2(112,158)
const COUNTER_POINT = Vector2(267,148)
const EXIT_POINT = Vector2(192,248)
const FRONT_EDGE = 16.5
const DATA = "res://art/export/inn-lobby/manifest.json"
var assets: Dictionary = {}
var light_sources: Array[Dictionary] = []
var fireplaces: Array[Node3D] = []
var fire_frame = -1
var preview_clock = 0.0

static func collision_rects() -> Array[Rect2]:
	# Feet in logical pixels (16/world unit). The return forms an L, not a solid sofa box.
	return [Rect2(68,119,92,39),Rect2(68,157,25,16),
		Rect2(101,195,42,21),Rect2(161,181,24,22),
		Rect2(64,55,54,28),Rect2(139,42,23,25),
		Rect2(165,75,54,18),Rect2(240,101,55,31),Rect2(299,44,36,81),
		Rect2(58,184,18,18),Rect2(157,127,18,18),
		Rect2(251,219,58,17),Rect2(307,152,26,19),Rect2(296,188,18,18),
		Rect2(46,208,15,14),Rect2(310,237,15,14),
		Rect2(48,0,288,64),Rect2(0,0,48,328),Rect2(336,0,48,328),Rect2(0,264,384,64),
		Rect2(48,256,120,12),Rect2(216,256,120,12)]

func _ready() -> void:
	var data = JSON.parse_string(FileAccess.get_file_as_string(DATA))
	if not data is Dictionary:
		push_error("Inn art manifest is missing: run scripts/build-inn-lobby-art.cjs")
		return
	assets = data.assets
	_ground("OakFloor","oak-floor",Vector3(12,0,10.25),Vector2(18,12.5),Vector2(9,6.25))
	_ground("LoungeRug","rug",Vector3(7.5,.025,11.6),Vector2(456,287)/64.0)
	_ground("EntranceRug","small-rug",Vector3(12,.025,15.5),Vector2(200,128)/64.0)
	_ground("ReceptionRug","small-rug",Vector3(16.7,.025,9.5),Vector2(200,128)/64.0)
	_ground("WindowRug","small-rug",Vector3(12,.025,7.0),Vector2(200,128)/64.0)
	for x in [5.1,9.3,13.5,17.7]:
		_sprite("wall",Vector3(x,0,4.0),false)
	_sprite("fireplace",Vector3(5.7,0,5.2))
	_sprite("bookcase",Vector3(9.4,0,4.2))
	_sprite("storage-bench",Vector3(12,0,5.8))
	_sprite("counter",Vector3(16.7,0,8.2))
	# Counter naturally occludes the legs; keep the shared character foot/scale.
	var innkeeper = Prop.new()
	innkeeper.name = "Innkeeper"
	innkeeper.position = Vector3(16.7,0,5.9)
	innkeeper.asset = load("res://art/export/innkeeper/innkeeper.png") as Texture2D
	innkeeper.pixel_size = Vector2i(96,136)
	innkeeper.foot = Vector2(48,116)
	innkeeper.shadow_size = Vector2(.6,.25)
	add_child(innkeeper)
	_sprite("stairs",Vector3(19.7,0,7.9))
	_sprite("lantern",Vector3(20.2,.45,7.7),false)
	_sprite("keys",Vector3(16.7,1.35,4.05),false)
	_sprite("corner-sofa",Vector3(7.1,0,10.8))
	_sprite("tea-table",Vector3(7.6,0,13.5))
	_sprite("armchair",Vector3(10.8,0,12.7))
	_sprite("lamp-table",Vector3(4.2,0,12.5))
	_sprite("lamp-table",Vector3(10.4,0,9.1))
	_sprite("storage-bench",Vector3(17.5,0,14.7))
	_sprite("luggage",Vector3(20,0,10.8))
	_sprite("lamp-table",Vector3(19,0,12.8))
	_sprite("plant",Vector3(3.5,0,14.0))
	_sprite("plant",Vector3(20,0,15.7))
	_sprite("plant",Vector3(13.8,0,5.7))
	_sprite("plant",Vector3(3.5,0,6.2))
	for x in [4.0,11.5,19.4]:
		_sprite("lantern",Vector3(x,1.8,4.1),false)
	# Low front cutaway. Keep the entrance and its path to reception open.
	for x in [6.75,17.25]:
		_sprite("front-wall",Vector3(x,0,FRONT_EDGE))
	var threshold = _ground("EntranceThreshold","oak-floor",Vector3(12,.03,FRONT_EDGE-.25),Vector2(3,.5),Vector2(1.5,.25))
	threshold.material_override.set_shader_parameter("art_tint",Vector3(.70,.61,.49))
	for x in [10.3,13.7]:
		_sprite("lantern",Vector3(x,.65,FRONT_EDGE))

	add_to_group("arcana_inn_fire")
	sync_fire(0.0,true)

func _process(delta: float) -> void:
	if Engine.is_editor_hint():
		preview_clock += delta
		sync_fire(preview_clock,true)

func sync_fire(time: float, animated: bool) -> void:
	var next = int(maxf(0.0,time)*12.0)%12 if animated else 0
	if next == fire_frame: return
	fire_frame = next
	for hearth in fireplaces:
		for material in [hearth.sprite_material,hearth.fade_material]:
			if material != null:
				material.set_shader_parameter("inn_fire_frame",next)

func _sprite(id: String, at: Vector3, fade: bool = true) -> Node3D:
	var spec: Dictionary = assets[id]
	var prop = Prop.new()
	prop.name = "Inn_"+id.replace("-","_")
	prop.position = at
	prop.asset = load(spec.file) as Texture2D
	prop.pixel_size = Vector2i(int(spec.size[0]),int(spec.size[1]))
	prop.foot = Vector2(float(spec.foot[0]),float(spec.foot[1]))
	if id != "front-wall" and spec.has("spatialMap"):
		prop.spatial_map = load(spec.spatialMap) as Texture2D
		prop.spatial_emission_mask = true
	if spec.has("light") and id != "front-wall":
		var bulb: Dictionary = spec.light
		var offset = Vector3(bulb.offset[0],bulb.offset[1],bulb.offset[2])
		light_sources.append({"point":at+offset,"range":bulb.range,"strength":bulb.strength,"color":Color(bulb.color).srgb_to_linear(),"fireplace":id=="fireplace","base_strength":bulb.strength})
	# The return reaches forward, but the open center remains in front of the back seats.
	if id == "corner-sofa": prop.depth_anchor_offset = Vector3(0,0,-.95)
	prop.fade_for_player = fade
	var width = float(spec.size[0])/64.0
	prop.shadow_size = Vector2(width*.70,width*.23) if fade and id != "front-wall" else Vector2.ZERO
	add_child(prop)
	if id == "fireplace":
		fireplaces.append(prop)
		for material in [prop.sprite_material,prop.fade_material]:
			if material != null: material.set_shader_parameter("inn_fire_enabled",true)
	return prop

func _ground(label: String, id: String, at: Vector3, size: Vector2, repeats: Vector2 = Vector2.ONE) -> MeshInstance3D:
	var visual = MeshInstance3D.new()
	visual.name = label
	visual.position = at
	visual.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var plane = PlaneMesh.new()
	plane.size = size
	visual.mesh = plane
	var mat = ShaderMaterial.new()
	mat.shader = FLOOR
	mat.set_shader_parameter("art",load(assets[id].file))
	mat.set_shader_parameter("repeats",repeats)
	visual.material_override = mat
	add_child(visual)
	return visual
