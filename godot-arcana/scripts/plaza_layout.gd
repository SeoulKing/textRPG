@tool
extends Node3D
## This saved scene is the single layout source for editor and game.
const Illustrated = preload("res://scripts/illustrated_art.gd")
const Models = preload("res://scripts/pixel3d_models.gd")
const Placement = preload("res://scripts/arcana_placement.gd")
const FountainGround = preload("res://art/resources/fountain_ground.generated.gd")
const Fountain = preload("res://scripts/fountain_spec.gd")
const CAMERA_PITCH_DEGREES = 45.0
const CAMERA_PITCH_SINE = sin(deg_to_rad(CAMERA_PITCH_DEGREES))
const GroundTiles = preload("res://scripts/ground_tilemap.gd")
var _editor_context: Node3D
var _reference_ground: ShaderMaterial
var _editor_ground: ShaderMaterial
var _fountain_transform = Transform3D.IDENTITY
var _editor_plan_poll = 0.0
## Ground X/Z units, matching placement transforms. Roads and forecourts share
## this scene source in the editor, 3D game and preserved 2D terrain.
@export var plaza_radii = Vector2(9,8):
	set(value):
		plaza_radii = value.max(Vector2.ONE)
		if _editor_ground != null: configure_ground(_editor_ground)
		if _reference_ground != null: configure_ground(_reference_ground)
		if _editor_context != null: Illustrated.build_verges(_editor_context,self)
@export var paved_areas: Array[Rect2] = []:
	set(value):
		paved_areas = value
		if _editor_ground != null: configure_ground(_editor_ground)
var plaza_center = Vector2(36,28.925)
var mosaic_center = Vector2(36,28.925)

func normalize_coordinate_frame() -> void:
	# Placement coordinates are the gameplay world. A wrapper-instance transform
	# must never move only the meshes away from their paving, effects and collision.
	transform = Transform3D.IDENTITY

func refresh_plan() -> void:
	for entry in placements():
		if entry.model_kind == "fountain":
			_fountain_transform = entry.layout_transform(self)
			var center = _fountain_transform*Fountain.CENTER
			plaza_center = Vector2(center.x,center.z)
			mosaic_center = plaza_center
			return

func configure_ground(mat: ShaderMaterial) -> void:
	# Match the painted basin ellipse without moving the saved fountain origin.
	mat.set_shader_parameter("fountain_paving_span",Vector2(8.5,8.5*FountainGround.BASIN_RATIO/CAMERA_PITCH_SINE))
	refresh_plan()
	var rectangles = PackedVector4Array()
	rectangles.resize(24)
	var count = mini(paved_areas.size(),24)
	for i in range(count):
		var rect = paved_areas[i]
		rectangles[i] = Vector4(rect.position.x,rect.position.y,rect.size.x,rect.size.y)*16.0
	mat.set_shader_parameter("city_paving",rectangles)
	mat.set_shader_parameter("city_paving_count",count)
	mat.set_shader_parameter("city_plaza",Vector4(plaza_center.x,plaza_center.y,plaza_radii.x,plaza_radii.y)*16.0)
	mat.set_shader_parameter("city_mosaic_center",mosaic_center*16.0)

func _process(delta: float) -> void:
	if not Engine.is_editor_hint() or _editor_ground == null: return
	_editor_plan_poll += delta
	if _editor_plan_poll<.15: return
	_editor_plan_poll = 0.0
	if GroundTiles.refresh() and _reference_ground != null:
		GroundTiles.bind(_reference_ground)
		if _editor_context != null: Illustrated.build_verges(_editor_context,self)
	for entry in placements():
		if entry.model_kind == "fountain":
			if not entry.layout_transform(self).is_equal_approx(_fountain_transform):
				configure_ground(_editor_ground)
				if _reference_ground != null: configure_ground(_reference_ground)
				if _editor_context != null: Illustrated.build_verges(_editor_context,self)
			return

func material_at(point: Vector2) -> int:
	var authored = GroundTiles.surface_at(point/16.0)
	if authored >= 0: return authored
	var p = point/16.0
	var distance = ((p-plaza_center)/plaza_radii).length()-1.0
	distance *= minf(plaza_radii.x,plaza_radii.y)
	for rect in paved_areas:
		var q = (p-rect.get_center()).abs()-rect.size*.5
		var edge = q.max(Vector2.ZERO).length()+minf(maxf(q.x,q.y),0.0)
		distance = minf(distance,edge)
	if p.y<48.4375 and distance<0: return 2
	if p.y<48.4375 and distance<.35: return 1
	if p.y>=47 and p.y<78.75 and absf(p.x-36)<2.75: return 1
	return 0

func wall_collision_rects() -> Array[Rect2]:
	var rectangles: Array[Rect2] = []
	for node in find_children("*","Node3D",true,false):
		if node.has_method("collision_rects") and node.get_script() == preload("res://scripts/wall_tilemap.gd"):
			rectangles.append_array(node.collision_rects(self))
	return rectangles

func placements() -> Array:
	return find_children("*","Node3D",true,false).filter(func(node): return node.get_script() == Placement)

func _ready() -> void:
	if Engine.is_editor_hint():
		_build_editor_context()
	elif get_parent() == get_tree().root:
		# F6 on this scene boots the same game, using this very scene instance.
		_start_game.call_deferred()

func _start_game() -> void:
	var game = load("res://scripts/main.gd").new()
	game.authored_layout = self
	get_tree().root.add_child(game)

func _build_editor_context() -> void:
	_editor_context = Node3D.new()
	_editor_context.name = "EditorContext"
	add_child(_editor_context,false,Node.INTERNAL_MODE_BACK)
	var floor_node = MeshInstance3D.new()
	var plane = PlaneMesh.new()
	plane.size = Vector2(72,90)
	floor_node.mesh = plane
	floor_node.position = Vector3(36,-.015,45)
	var mat = Models.material("cbbd9d").duplicate()
	mat.set_shader_parameter("ground",true)
	mat.set_shader_parameter("terrain",true)
	mat.set_shader_parameter("editor_preview",true)
	mat.set_shader_parameter("grass_tex",Models.terrain_texture(0))
	mat.set_shader_parameter("dirt_tex",Models.terrain_texture(1))
	mat.set_shader_parameter("stone_tex",Models.terrain_texture(2))
	configure_ground(mat)
	_editor_ground = mat
	floor_node.material_override = mat
	_editor_context.add_child(floor_node)
	_reference_ground = Illustrated.add_ground(_editor_context,plane.size,floor_node.position,self)
	Illustrated.build_verges(_editor_context,self)
	# Use the game's daytime lighting alongside the same model materials.
	# The editor remains freely navigable; F6/F5 uses the game's pixel camera.
	var environment = Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("78ad72")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("afc5cf")
	environment.ambient_light_energy = .18
	environment.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	var settings = WorldEnvironment.new()
	settings.environment = environment
	_editor_context.add_child(settings)
	var light = DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-48,-32,0)
	light.light_color = Color("fff0db")
	light.light_energy = .48
	light.shadow_enabled = true
	light.shadow_blur = 0
	light.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL
	# Camera is 32 units above the ground along its view axis. Keep the
	# visible ground outside the distance-fade band and preserve thin shadows.
	light.directional_shadow_max_distance = 60
	light.directional_shadow_fade_start = 1.0
	light.shadow_normal_bias = .6
	_editor_context.add_child(light)
