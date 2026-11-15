@tool
extends Node3D
## Approved 2D academy modules. Logical navigation uses 16px/world unit;
## source art uses 64px/world unit and the shared illustrated prop renderer.
const Prop = preload("res://scripts/illustrated_prop.gd")
const FLOOR = preload("res://art/resources/inn_floor.gdshader")
const DATA = "res://art/export/academy-interior/manifest.json"
@export_range(1,2) var floor_number: int = 1
var assets: Dictionary = {}
var light_sources: Array[Dictionary] = []

static func room_floor(id: String) -> int:
	return 2 if id in ["headmaster","garden","observatory"] else 1

static func rooms(level: int) -> Array[Dictionary]:
	if level == 2:
		return [{"id":"headmaster","name":"교장실","kind":"academy_room","pos":Vector2(96,170)},
			{"id":"garden","name":"별빛 정원","kind":"academy_room","pos":Vector2(96,258)},
			{"id":"observatory","name":"천문 관측탑","kind":"academy_room","pos":Vector2(280,166)}]
	return [{"id":"courtyard","name":"학교 앞뜰","kind":"academy_room","pos":Vector2(192,276)},
		{"id":"hall","name":"중앙 회랑","kind":"academy_room","pos":Vector2(192,222)},
		{"id":"library","name":"도서관","kind":"academy_room","pos":Vector2(88,151)},
		{"id":"classroom","name":"기초 강의실","kind":"academy_room","pos":Vector2(284,171)},
		{"id":"practice","name":"수정 실습실","kind":"academy_room","pos":Vector2(284,239)}]

static func stair_point(level: int) -> Vector2:
	return Vector2(192,112) if level == 1 else Vector2(192,230)

static func arrival_point(level: int) -> Vector2:
	return Vector2(192,152) if level == 1 else Vector2(192,194)

## Ground footprints are shared by the wall renderer and navigation.
## Library enters from the south; classroom and practice enter from the hall.
static func partition_rects() -> Array[Rect2]:
	return [Rect2(46,64,4,176),Rect2(150,64,4,176),
		Rect2(48,238,32,4),Rect2(120,238,32,4),
		Rect2(334,64,4,200),Rect2(238,64,4,56),
		Rect2(238,168,4,32),Rect2(238,248,4,16),
		Rect2(240,182,96,4),Rect2(240,262,96,4)]

static func collision_rects(level: int) -> Array[Rect2]:
	var result: Array[Rect2] = [Rect2(0,0,48,344),Rect2(336,0,48,344),Rect2(48,0,288,64),
		Rect2(48,310,288,34),Rect2(48,300,110,10),Rect2(226,300,110,10)]
	if level == 1:
		result.append_array(partition_rects())
		result.append_array([Rect2(156,64,72,33),Rect2(56,77,54,20),Rect2(72,117,36,17),
			Rect2(252,86,64,20),Rect2(266,137,38,17),Rect2(266,205,38,17),
			Rect2(172,166,40,22),Rect2(66,273,50,16),Rect2(268,273,50,16),
			Rect2(74,196,48,20),Rect2(55,165,18,12),Rect2(312,191,18,14),Rect2(132,153,8,8),Rect2(315,151,8,8),Rect2(55,215,14,14)])
	else:
		result.append_array([Rect2(70,67,52,24),Rect2(74,133,44,19),Rect2(258,112,46,24),
			Rect2(70,220,52,17),Rect2(52,202,16,22),Rect2(125,202,16,22),
			Rect2(163,244,58,23),Rect2(48,300,288,10),
			Rect2(261,231,48,22),Rect2(124,244,18,14),Rect2(55,252,8,8),Rect2(316,232,8,8)])
	return result

func _ready() -> void:
	var data = JSON.parse_string(FileAccess.get_file_as_string(DATA))
	if not data is Dictionary:
		push_error("Missing academy interior manifest")
		return
	assets = data.assets
	_ground("PaintedRoomFloor","floor-first-painted" if floor_number == 1 else "floor-second-painted",Vector3(12,0,11.5),Vector2(18,15))
	for x in [5.25,9.75,14.25,18.75]:
		_sprite("wall",Vector3(x,0,4),false)
	if floor_number == 1:
		_sprite("stairs-up",Vector3(12,0,6.6))
		_sprite("bookcase",Vector3(5.2,0,5.9))
		_sprite("desk",Vector3(5.5,0,8.4))
		_sprite("blackboard",Vector3(17.8,0,6.6))
		_sprite("desk",Vector3(17.8,0,9.6))
		_sprite("desk",Vector3(17.8,0,13.8))
		_sprite("orrery",Vector3(12,0,11.5))
		_sprite("reading-table",Vector3(6.1,0,13.2))
		_sprite("book-trolley",Vector3(4,0,11.0))
		_sprite("book-trolley",Vector3(20.1,0,12.4))
		_lamp(Vector3(8.5,0,9.8))
		_lamp(Vector3(20,0,9.7))
		for x in [5.7,18.3]: _sprite("bench",Vector3(x,0,18.1))
		_sprite("plant",Vector3(3.8,0,13.9))
		_sprite("plant",Vector3(20.2,0,14.7))
		_partitions()
	else:
		_sprite("office-door",Vector3(6,0,5.5))
		_sprite("desk",Vector3(6,0,9.5))
		_sprite("telescope",Vector3(17.5,0,8.5))
		_sprite("bookcase",Vector3(19.3,0,5.5))
		_sprite("bench",Vector3(6,0,14.9))
		for x in [3.8,8.3]: _sprite("plant",Vector3(x,0,13.9))
		_sprite("stairs-down",Vector3(12,0,17.1))
		_sprite("reading-table",Vector3(17.8,0,15.4))
		_sprite("book-trolley",Vector3(8.4,0,15.8))
		_lamp(Vector3(3.7,0,16.0))
		_lamp(Vector3(20,0,14.8))
		for x in [4.8,19.2]: _sprite("plant",Vector3(x,0,18.2))
	for x in [5,8,16,19]: _sprite("front-wall",Vector3(x,0,19.0))
	if floor_number == 2: _sprite("front-wall",Vector3(12,0,19.0))
	for point in [Vector3(5,2.4,4.1),Vector3(19,2.4,4.1),Vector3(5,.8,18.5),Vector3(19,.8,18.5)]:
		light_sources.append({"point":point,"range":6.0,"strength":.65,"color":Color("ffe0a3").srgb_to_linear()})
	# Broad ceiling fills keep the hall, rooms and stair landings evenly readable.
	for point in [Vector3(6,3.3,9),Vector3(18,3.3,9),Vector3(6,3.3,13),Vector3(18,3.3,14),Vector3(12,4,11.5),Vector3(12,3.2,6.5),Vector3(12,3,17)]:
		light_sources.append({"point":point,"range":6.8,"strength":.4,"color":Color("fff1d8").srgb_to_linear()})
	if floor_number == 1:
		light_sources.append({"point":Vector3(12,1.7,11.5),"range":3.5,"strength":.35,"color":Color("a9caff").srgb_to_linear()})

func _partitions() -> void:
	for rect in partition_rects():
		var vertical = rect.size.y > rect.size.x
		var start = rect.position.y if vertical else rect.position.x
		var length = rect.size.y if vertical else rect.size.x
		var progress = 0.0
		while progress < length:
			var end = minf(length,progress+16.0)
			if vertical:
				_partition_piece("partition-depth",Vector2(rect.position.x+2,start+end),false)
			else:
				_partition_piece("partition-horizontal",Vector2(start+progress+8,rect.position.y+2),true)
			progress = end
	for at in [Vector2(48,240),Vector2(152,240),Vector2(240,120),Vector2(240,168),Vector2(240,184),Vector2(240,200),Vector2(240,248),Vector2(240,264),Vector2(336,184),Vector2(336,264)]:
		_sprite("partition-pier",Vector3(at.x/16.0,0,at.y/16.0))
	_sprite("room-arch",Vector3(100.0/16.0,0,15.0))

func _partition_piece(id: String, at: Vector2, trim_horizontal: bool) -> void:
	var spec: Dictionary = assets[id]
	var prop = Prop.new()
	prop.name = "RoomWall"
	prop.position = Vector3(at.x/16.0,0,at.y/16.0)
	prop.asset = load(spec.file) as Texture2D
	prop.pixel_size = Vector2i(int(spec.size[0]),int(spec.size[1]))
	if trim_horizontal:
		# Crop the same pixel density instead of stretching a decorative wall bar.
		var strip = prop.asset.get_image().get_region(Rect2i((prop.pixel_size.x-64)/2,0,64,prop.pixel_size.y))
		prop.asset = ImageTexture.create_from_image(strip)
		prop.pixel_size.x = 64
	prop.foot = Vector2(float(prop.pixel_size.x)/2.0,float(prop.pixel_size.y)-4.0)
	prop.fade_for_player = true
	prop.shadow_size = Vector2.ZERO
	add_child(prop)

func _lamp(at: Vector3) -> void:
	_sprite("floor-lamp",at)
	light_sources.append({"point":at+Vector3(0,1.65,-.15),"range":5.4,"strength":.7,"color":Color("ffdb94").srgb_to_linear()})

func _sprite(id: String, at: Vector3, fade: bool = true) -> void:
	var spec: Dictionary = assets[id]
	var prop = Prop.new()
	prop.name = "Academy_"+id.replace("-","_")
	prop.position = at
	prop.asset = load(spec.file) as Texture2D
	prop.pixel_size = Vector2i(int(spec.size[0]),int(spec.size[1]))
	prop.foot = Vector2(float(spec.foot[0]),float(spec.foot[1]))
	prop.fade_for_player = fade
	prop.shadow_size = Vector2(float(spec.size[0])/64.0*.65,.35) if fade else Vector2.ZERO
	add_child(prop)

func _ground(label: String,id: String,at: Vector3,size: Vector2,repeats: Vector2 = Vector2.ONE) -> void:
	var visual = MeshInstance3D.new()
	visual.name = label
	visual.position = at
	visual.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var plane = PlaneMesh.new()
	plane.size = size
	visual.mesh = plane
	var material = ShaderMaterial.new()
	material.shader = FLOOR
	material.set_shader_parameter("art",load(assets[id].file))
	material.set_shader_parameter("repeats",repeats)
	visual.material_override = material
	add_child(visual)
