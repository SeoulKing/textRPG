extends Node3D
signal camera_updated
# Native 3D -> small orthographic viewport -> nearest-neighbor presentation.
# Gameplay remains in world.gd; screen ray picking maps back to its world units.
const Models = preload("res://scripts/pixel3d_models.gd")
const CityLayout = preload("res://scripts/plaza_layout.gd")
const Actor = preload("res://scripts/pixel3d_actor.gd")
const Illustrated = preload("res://scripts/illustrated_art.gd")
const BlinkEffect = preload("res://scripts/teleport_effect.gd")
const Hero = preload("res://scripts/heroine_run.gd")
const Occlusion = preload("res://scripts/environment_occlusion.gd")
var environment_occlusion = Occlusion.new()
var occlusion_dirty = true
var inn_lighting = preload("res://scripts/local_lighting.gd").new()
var local_lighting = preload("res://scripts/local_lighting.gd").new()
const Slime = preload("res://scripts/slime_sprite.gd")
const PIXELS_PER_UNIT = 16.0
const CAMERA_ZOOM = Hero.SPEC.PIXELS_PER_UNIT / 16.0
var camera_zoom = CAMERA_ZOOM
var base_camera_zoom = CAMERA_ZOOM
const PORTRAIT_ZOOM_SCALE = .5
const MIN_ZOOM_RATIO = .5 / 1.12
## User-approved one-dot inner silhouette at the former 50% size or smaller.
var experimental_min_zoom_outline = true
const MAX_ZOOM_RATIO = 2.0
var center_on_character = true
const PITCH_SINE = CityLayout.CAMERA_PITCH_SINE
var shop2d: Node2D
var world: Node2D
var pixelated = true
var quarter_view = false
var display_height = 824.0
var pixels_per_unit = 16.0
var camera: Camera3D
var sunshine: DirectionalLight3D
var environment: Environment
var outside: Node3D
var inside: Node3D
var teleport_effect: Node3D
var hero: Node3D
var slime: Node3D
var plaza_slime: Node3D
var hunting_slime: Node3D
var marker: Node3D
var target_marker: Node3D
var tile_reference: MeshInstance3D
var height_reference: MeshInstance3D
var fountain_anchor = Vector3(36,0,28.625)
var fountain_transform = Transform3D(Basis.IDENTITY,Vector3(36,0,28.625))
var effect_pool: Array[MeshInstance3D] = []
var lantern_lights: Array[OmniLight3D] = []
var interior_people: Array[Node3D] = []
var previous_player = Vector2.ZERO
var camera_center = Vector3.ZERO
const TELEPORT_CAMERA_HOLD = .12
const TELEPORT_CAMERA_CATCHUP = .28
var teleport_camera_age = -1.0
var teleport_camera_from = Vector3.ZERO
var previous_blink_age = -1.0
var last_academy_floor: int = 0
var last_interior = "__boot__"
var damage_label: Label3D
const ENEMY_BAR_WIDTH = 0.9
var enemy_meter_visible = false
var enemy_trail_hp = 30.0
var enemy_last_hp = 30.0
var enemy_trail_hold = 0.0
var enemy_meter_id = "__boot__"
var reference_ground_mat: ShaderMaterial
var ground_mat: ShaderMaterial
var transient_material: ShaderMaterial
var last_dusk = -1
var layout: Node3D
var _layout_poll = 0.0
var _layout_stamp = 0
var _layout_hash = ""

func set_zoom_ratio(ratio: float) -> void:
	camera_zoom = base_camera_zoom * clampf(ratio,MIN_ZOOM_RATIO,MAX_ZOOM_RATIO)

func get_zoom_ratio() -> float:
	return camera_zoom / base_camera_zoom

func set_display_size(size: Vector2) -> void:
	var ratio = get_zoom_ratio()
	display_height = size.y
	# Portrait 100% uses the former 50% framing; preserve user zoom on resize.
	base_camera_zoom = CAMERA_ZOOM * (PORTRAIT_ZOOM_SCALE if size.x < size.y else 1.0)
	set_zoom_ratio(ratio)

func map_point(point: Vector2, height: float = 0.0) -> Vector3:
	return Vector3(point.x/16.0,height,point.y/16.0)

func _ready() -> void:
	camera = Camera3D.new()
	camera.name = "PlayerFollowCamera"
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.near = .1
	camera.far = 250
	camera.current = true
	add_child(camera)
	set_quarter_view(quarter_view)
	environment = Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("78ad72")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("afc5cf")
	environment.ambient_light_energy = .18
	environment.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	var settings = WorldEnvironment.new()
	settings.environment = environment
	add_child(settings)
	sunshine = DirectionalLight3D.new()
	sunshine.rotation_degrees = Vector3(-48,-32,0)
	sunshine.light_color = Color("fff0db")
	sunshine.light_energy = .48
	sunshine.shadow_enabled = true
	sunshine.shadow_blur = 0
	sunshine.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL
	# Camera is 32 units above the ground along its view axis. Keep the
	# visible ground outside the distance-fade band and preserve thin shadows.
	sunshine.directional_shadow_max_distance = 60
	sunshine.directional_shadow_fade_start = 1.0
	sunshine.shadow_normal_bias = .6
	add_child(sunshine)
	outside = Node3D.new()
	add_child(outside)
	inside = Node3D.new()
	add_child(inside)
	layout = world.layout
	outside.add_child(layout)
	_activate_follow_camera()
	_layout_stamp = FileAccess.get_modified_time("res://scenes/plaza.tscn")
	_layout_hash = FileAccess.get_sha256("res://scenes/plaza.tscn") if OS.has_feature("editor") else ""
	_sync_layout_anchors()
	_build_outdoors()
	teleport_effect=BlinkEffect.new()
	add_child(teleport_effect)
	hero = Hero.new()
	add_child(hero)
	_apply_actor_transforms()
	previous_player = world.player_position
	camera_center = map_point(world.player_position)
	marker = _ring(.42,"f2cf79")
	add_child(marker)
	target_marker = _ring(.32,"beddd0")
	add_child(target_marker)
	transient_material = Models.material("f2cf79",0,.8).duplicate()
	transient_material.set_shader_parameter("entity_anchor_enabled",true)
	transient_material.set_shader_parameter("entity_anchor",Vector3(0,0,110))
	for i in range(40):
		var node = Models.box(self,Vector3(.10,.10,.10),Vector3.ZERO,"f2cf79")
		node.material_override = transient_material
		node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		node.visible = false
		effect_pool.append(node)
	damage_label = Label3D.new()
	damage_label.font = preload("res://fonts/NotoSansKR-SemiBold.tres")
	damage_label.font_size = 22
	damage_label.pixel_size = .035
	damage_label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	damage_label.no_depth_test = true
	damage_label.modulate = Color("f9e7a6")
	damage_label.outline_modulate = Color("574735")
	damage_label.outline_size = 5
	add_child(damage_label)

func _floor(parent: Node3D, size: Vector2, at: Vector3, terrain: bool = false) -> void:
	var mesh = PlaneMesh.new()
	mesh.size = size
	var node = MeshInstance3D.new()
	node.mesh = mesh
	node.position = at
	var mat = Models.material("cbbd9d").duplicate()
	mat.set_shader_parameter("ground",true)
	mat.set_shader_parameter("terrain",terrain)
	if terrain:
		mat.set_shader_parameter("grass_tex",Models.terrain_texture(0))
		mat.set_shader_parameter("dirt_tex",Models.terrain_texture(1))
		mat.set_shader_parameter("stone_tex",Models.terrain_texture(2))
		layout.configure_ground(mat)
		ground_mat = mat
	node.material_override = mat
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	if not terrain:
		var pattern = Image.create(32,32,false,Image.FORMAT_RGBA8)
		for y in range(32):
			for x in range(32):
				var seam = y%8==0 or (x+(8 if y/8%2 else 0))%16==0
				var color = Color("958a91") if seam else Color("e0d1b9") if y/8%2 else Color("cdbeb0")
				if not seam and y%8==2 and x%11<3: color = Color("eee0c8")
				pattern.set_pixel(x,y,color)
		mat.set_shader_parameter("floor_pattern",true)
		mat.set_shader_parameter("stone_tex",ImageTexture.create_from_image(pattern))
	parent.add_child(node)
	if terrain: reference_ground_mat = Illustrated.add_ground(parent,size,at,layout)

func _place(kind: String, point: Vector2, parent: Node3D = null) -> Node3D:
	var node = Illustrated.make(kind) if Illustrated.supports(kind) else Models.model(kind)
	node.position = map_point(point)
	if parent == inside and node.get_script() == preload("res://scripts/illustrated_prop.gd"):
		node.use_outdoor_art = false
	(parent if parent != null else outside).add_child(node)
	return node

func _build_outdoors() -> void:
	_floor(outside,Vector2(72,90),Vector3(36,0,45),true)
	# Walls are authored in scenes/walls/city_walls.tscn and displayed by Plaza.
	_sync_lantern_lights()
	# Keep the river surface; legacy 3D bank rocks have been removed.
	var river = Models.box(outside,Vector3(13.25,.10,22.375),Vector3(65.375,-.08,63.8125),"579da0")
	river.material_override = Models.material("579da0",0,.10)
	for node in layout.find_children("*","Node3D",true,false):
		if node.get_meta("encounter_id","") == "plaza_slime":
			plaza_slime = node
			plaza_slime.ambient_preview = false
	hunting_slime = Slime.new()
	hunting_slime.position = map_point(Vector2(600,1054))
	outside.add_child(hunting_slime)
	slime = hunting_slime

func _sync_lantern_lights() -> void:
	for light in lantern_lights:
		outside.remove_child(light)
		light.queue_free()
	lantern_lights.clear()
	for entry in layout.placements():
		if entry.model_kind not in ["lamp-post","lantern"]: continue
		var light = OmniLight3D.new()
		light.position = entry.layout_transform(layout)*Vector3(0,2.4,0)
		light.light_color = Color("f2cf79")
		light.omni_range = 4
		light.light_energy = .65
		outside.add_child(light)
		lantern_lights.append(light)

func _ring(radius: float, color: String) -> Node3D:
	var root = Node3D.new()
	var torus = TorusMesh.new()
	torus.inner_radius = radius-.035
	torus.outer_radius = radius
	torus.rings = 16
	torus.ring_segments = 4
	Models.part(root,torus,Vector3(0,.05,0),color).cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return root

func _interior(id: String) -> void:
	get_viewport().disable_3d = id == "arcana_shop"
	if is_instance_valid(shop2d):
		shop2d.visible = id == "arcana_shop"
		shop2d.follow_camera.enabled = id == "arcana_shop"
	if id != "arcana_shop":
		get_viewport().canvas_transform = Transform2D.IDENTITY
		set_quarter_view(quarter_view)
	for child in inside.get_children():
		inside.remove_child(child)
		child.queue_free()
	interior_people.clear()
	if id.is_empty(): return
	if id == "arcana_academy":
		var school = (preload("res://scenes/academy_second_floor.tscn") if world.academy_floor == 2 else preload("res://scenes/academy_first_floor.tscn")).instantiate()
		inside.add_child(school)
		inn_lighting.configure_inn(school.light_sources,.98)
		return
	if id == "arcana_shop":
		if not is_instance_valid(shop2d):
			shop2d = load("res://scenes/shop_2d.tscn").instantiate()
			add_child(shop2d)
		shop2d.visible = true
		shop2d.follow_camera.enabled = true
		return
	if id == "arcana_inn":
		var lobby = preload("res://scenes/inn_lobby.tscn").instantiate()
		inside.add_child(lobby)
		inn_lighting.configure_inn(lobby.light_sources)
		return
	_floor(inside,Vector2(21,19.5),Vector3(12,0,10.75))
	var back_wall = Node3D.new()
	back_wall.position = Vector3(12,0,1.4)
	inside.add_child(back_wall)
	Models.box(back_wall,Vector3(21,3.1,.35),Vector3(0,1.55,0),"e0d1b9")
	Models.box(back_wall,Vector3(21,.16,.44),Vector3(0,3.15,0),"eee0c8")
	Models.box(back_wall,Vector3(21,.07,.46),Vector3(0,.30,0),"d5a44f")
	for x in [-8,-4,0,4,8]:
		Models._window(back_wall,Vector3(x,1.0,.23),1.15,1.76)
		Models.box(back_wall,Vector3(.25,2.8,.15),Vector3(x+1.6,1.65,.20),"eee0c8")
		Models.box(back_wall,Vector3(.58,1.12,.08),Vector3(x-1.30,2.10,.25),"7657a6")
		Models.box(back_wall,Vector3(.17,.17,.10),Vector3(x-1.30,2.25,.29),"f2cf79",Vector3(0,0,PI/4))
	Models._merge(back_wall)
	for x in range(42,330,46): _place("shelf",Vector2(x,66),inside)
	for entity in world.entities:
		if entity.kind == "exit": continue
		if id == "arcana_academy":
			var room = Node3D.new()
			room.position = map_point(entity.pos)
			inside.add_child(room)
			Models.box(room,Vector3(4.2,.10,2.5),Vector3(0,.06,0),"dccdad")
			Models.box(room,Vector3(4.2,.65,.13),Vector3(0,.33,-1.3),"a4977e")
			Models._merge(room)
		if entity.id == "courtyard": continue
		var npc = Actor.new()
		npc.traveler = true
		npc.position = map_point(entity.pos-Vector2(0,14))
		inside.add_child(npc)
		interior_people.append(npc)
	if id != "arcana_academy":
		_place("workbench",Vector2(192,114),inside).scale = Vector3(4,1,2)
		for x in [70,302]: _place("bench",Vector2(x,204),inside)

func view_yaw() -> float:
	if world != null and world.indoor == "arcana_shop": return 0.0
	return PI/4.0 if quarter_view else 0.0

func set_quarter_view(value: bool) -> void:
	quarter_view = value
	var yaw = view_yaw()
	# Screen right/down mapped onto the camera's projected ground axes.
	world.input_projection = Transform2D(Vector2(cos(yaw),-sin(yaw)),Vector2(sin(yaw),cos(yaw))/PITCH_SINE,Vector2.ZERO)

func _snap_ground(point: Vector3) -> Vector3:
	if not pixelated: return point
	# Snap on camera axes, not map axes, so a diagonal view keeps whole pixels.
	var ground = Vector2(point.x,point.z).rotated(view_yaw())
	ground.x = snappedf(ground.x,1.0/pixels_per_unit)
	ground.y = snappedf(ground.y,1.0/(pixels_per_unit*PITCH_SINE))
	ground = ground.rotated(-view_yaw())
	return Vector3(ground.x,point.y,ground.y)

func _process(_delta: float) -> void:
	_poll_layout(_delta)
	if world == null or not is_instance_valid(world.player): return
	if world.indoor != last_interior or (world.indoor == "arcana_academy" and world.academy_floor != last_academy_floor):
		last_interior = world.indoor
		last_academy_floor = world.academy_floor
		outside.visible = last_interior.is_empty()
		inside.visible = not outside.visible
		_interior(last_interior)
		last_dusk = -1
		occlusion_dirty = true
		environment.background_color = Color("78ad72") if outside.visible else (Color.BLACK if world.indoor == "arcana_shop" else Color("283452"))
		camera_center = map_point(world.player_position)
		teleport_camera_age = -1.0
		previous_blink_age = world.teleport_age
	var motion = world.player_position-previous_player
	hero.position = _snap_ground(map_point(world.bench_visual_position()))
	hero.set_bench_pose(world.bench_state,world.bench_age,world.reduced_motion or not world.effects_enabled)
	if hero.material != null:
		hero.material.set_shader_parameter("minimum_zoom_outline",experimental_min_zoom_outline and pixelated and camera_zoom<=CAMERA_ZOOM*.5+.0001)
	if hero.has_method("set_camera_yaw"): hero.set_camera_yaw(view_yaw())
	hero.dash_age=world.dash_age
	hero.dash_yaw=atan2(world.dash_direction.x,world.dash_direction.y)
	hero.pose(world.time,world.player_gait,world.walking,motion,pixelated,world.effects_enabled and not world.reduced_motion)
	hero.apply_bench_pose()
	# Independent overlay/presentation only; the original pose keeps advancing.
	var blink_age: float=world.teleport_age
	var blink_direction=Hero.direction_for_yaw(atan2(world.teleport_direction.x,world.teleport_direction.y),view_yaw())
	teleport_effect.update_pose(blink_age,blink_direction,_snap_ground(map_point(world.teleport_origin)),_snap_ground(map_point(world.teleport_target)),world.effects_enabled,world.reduced_motion)
	hero.visible=not BlinkEffect.hides_character(blink_age,world.effects_enabled,world.reduced_motion)
	if blink_age>=0 and blink_age<.02 and world.effects_enabled and not world.reduced_motion:
		hero.position=_snap_ground(map_point(world.teleport_origin))
	previous_player = world.player_position
	if world.indoor == "arcana_shop" and is_instance_valid(shop2d):
		world.input_projection = Transform2D(Vector2(1,0),Vector2(0,1.0/PITCH_SINE),Vector2.ZERO)
		shop2d.sync(world,hero,get_zoom_ratio(),_delta)
		camera_updated.emit()
		return
	for npc in interior_people: npc.pose(world.time,0,false,Vector2.ZERO,pixelated,world.effects_enabled and not world.reduced_motion)
	var indoor_follow: float = 0.0
	var target = map_point(world.player_position)
	var view_height = display_height / (32.0 * camera_zoom)
	if not world.indoor.is_empty():
		var room_center = Vector3(12,0,9.5)
		var room_height = 17.0
		var room_width = 22.0
		match world.indoor:
			"arcana_shop":
				room_center.z = 5.85
				room_height = 11.5
				room_width = 15.0
			"arcana_inn":
				room_center.z = 7.85
				room_height = 13.5
				room_width = 19.0
			"arcana_academy":
				room_center.z = 9.0
				room_height = 15.0
				room_width = 22.0
		var aspect = float(get_viewport().size.x)/float(get_viewport().size.y)
		var fit_height = maxf(room_height,room_width/aspect)
		if aspect >= 1.0: room_height = fit_height
		view_height = maxf(display_height/(32.0*base_camera_zoom),room_height)/get_zoom_ratio()
		# Follow whenever either room dimension exceeds the visible viewport.
		indoor_follow = 1.0 if view_height < fit_height - 0.0001 else 0.0
		target = room_center.lerp(map_point(world.player_position),indoor_follow)
	var blink_started = blink_age>=0 and (previous_blink_age<0 or blink_age<previous_blink_age)
	previous_blink_age = blink_age
	if not world.indoor.is_empty() or world.reduced_motion or camera_center.distance_to(target)>7:
		camera_center = target
		teleport_camera_age = -1.0
	else:
		if blink_started:
			teleport_camera_from = camera_center
			teleport_camera_age = 0.0
		if teleport_camera_age>=0:
			# Let the character arrive first, then catch up with a finite ease.
			# Normal walking keeps its existing dead zone and pixel snapping.
			if world.enabled: teleport_camera_age += maxf(0.0,_delta)
			var progress = clampf((teleport_camera_age-TELEPORT_CAMERA_HOLD)/TELEPORT_CAMERA_CATCHUP,0.0,1.0)
			var weight = progress*progress*(3.0-2.0*progress)
			camera_center = teleport_camera_from.lerp(target,weight)
			if progress>=1.0: teleport_camera_age = -1.0
		else:
			camera_center.x = clampf(camera_center.x,target.x-.45,target.x+.45)
			camera_center.z = clampf(camera_center.z,target.z-.7,target.z+.7)
	camera.size = view_height
	pixels_per_unit = get_viewport().size.y/camera.size
	var yaw = view_yaw()
	var aim = camera_center
	if center_on_character:
		var half_body = float(Hero.SPEC.SOURCE_HEIGHT)/(2.0*Hero.SPEC.PIXELS_PER_UNIT*PITCH_SINE)
		var follow_weight = indoor_follow if not world.indoor.is_empty() else 1.0
		aim -= Vector3(sin(yaw),0,cos(yaw))*half_body*follow_weight
	var center = _snap_ground(aim)
	var ground_distance = 24*sqrt(1-PITCH_SINE*PITCH_SINE)/PITCH_SINE
	camera.position = center+Vector3(sin(yaw)*ground_distance,24,cos(yaw)*ground_distance)
	camera.look_at(center)
	_update_object_occlusion(_delta)
	camera.h_offset = (get_viewport().size.x%2)*.5/pixels_per_unit if pixelated else 0.0
	camera.v_offset = (get_viewport().size.y%2)*.5/pixels_per_unit if pixelated else 0.0
	# Screen overlays must use this frame's final snapped camera.
	camera_updated.emit()
	for mat in Models.materials.values(): mat.set_shader_parameter("motion_time",world.time if world.effects_enabled and not world.reduced_motion else 0.0)
	if last_dusk != int(world.dusk):
		last_dusk = int(world.dusk)
		sunshine.light_color = Color("f9d4a2") if world.dusk else Color("fff0db")
		sunshine.light_energy = .38 if world.dusk else .48
		environment.ambient_light_color = Color("6c92df") if world.dusk else Color("afc5cf")
		environment.ambient_light_energy = .32 if world.dusk else .18
	if world.indoor in ["arcana_inn","arcana_academy"]:
		environment.background_color = Color("352c38")
		environment.ambient_light_color = Color("ead3ad")
		environment.ambient_light_energy = .36
		sunshine.light_color = Color("ffe3b1")
		sunshine.light_energy = .42
	if world.indoor == "arcana_academy":
		environment.ambient_light_color = Color("fff3dc")
		environment.ambient_light_energy = .48
		sunshine.light_color = Color("fff1d8")
		sunshine.light_energy = .47
	for light in lantern_lights: light.visible = world.dusk and world.effects_enabled
	if world.indoor == "arcana_inn":
		var animate_fire = world.effects_enabled and not world.reduced_motion
		for hearth in get_tree().get_nodes_in_group("arcana_inn_fire"):
			hearth.sync_fire(world.time,animate_fire)
		inn_lighting.set_fireplace_time(world.time,animate_fire)
		inn_lighting.update(self,hero.global_position,true,world.effects_enabled,_delta)
	elif world.indoor in ["arcana_academy","arcana_shop"]:
		inn_lighting.update(self,hero.global_position,true,world.effects_enabled,_delta)
	else:
		local_lighting.update(self,hero.global_position,world.dusk,world.effects_enabled and world.indoor.is_empty(),_delta)
	for fountain in get_tree().get_nodes_in_group("arcana_fountain_water"):
		fountain.sync_water(world.time,world.effects_enabled and not world.reduced_motion)
	for npc in get_tree().get_nodes_in_group("arcana_npc_idle"):
		npc.sync_idle(world.time,world.effects_enabled and not world.reduced_motion)
	for portal in get_tree().get_nodes_in_group("arcana_portal_animation"):
		portal.sync_portal(world.time,world.effects_enabled and not world.reduced_motion)
	var highlighted_id = str(world.nearest.get("id","")) if world.enabled else ""
	var has_object = false
	for prop in get_tree().get_nodes_in_group("arcana_interaction_art"):
		var active = prop.is_visible_in_tree() and not prop.interaction_id.is_empty() and prop.interaction_id == highlighted_id
		prop.set_interaction_highlight(active)
		if active: has_object = true
	marker.visible = not world.nearest.is_empty() and not has_object
	if marker.visible: marker.position = map_point(world.nearest.pos)
	target_marker.visible = not world.path.is_empty()
	if target_marker.visible: target_marker.position = map_point(world.path[world.path.size()-1])
	var spatial = world.battle.has("spatial")
	slime = plaza_slime if spatial or (world.spatial_selected and world.battle.is_empty()) else hunting_slime
	plaza_slime.sync(world.time,world.battle if spatial else {},world.enemy_visual_hp if spatial else 30.0,false,world.effects_enabled and not world.reduced_motion)
	hunting_slime.sync(world.time,{} if spatial else world.battle,30.0 if spatial else world.enemy_visual_hp,world.impact_remaining>0,world.effects_enabled and not world.reduced_motion)
	var hp = clampf(float(world.enemy_visual_hp),0,30)
	var meter_id = str(world.battle.get("id",""))
	if meter_id != enemy_meter_id or hp > enemy_last_hp:
		enemy_meter_id = meter_id
		enemy_trail_hp = hp
		enemy_trail_hold = 0
	elif hp < enemy_last_hp:
		enemy_trail_hp = maxf(enemy_trail_hp,enemy_last_hp)
		enemy_trail_hold = .25
	enemy_last_hp = hp
	if world.enabled:
		enemy_trail_hold = maxf(0,enemy_trail_hold-_delta)
		if enemy_trail_hold<=0: enemy_trail_hp = move_toward(enemy_trail_hp,hp,_delta*22)
	var living = slime.visible and world.battle.get("phase","") != "defeat" and (hp>0 or enemy_trail_hp>0)
	var show_meter = (not world.battle.is_empty() or world.spatial_selected) and living
	enemy_meter_visible = show_meter
	_effects()

func _update_object_occlusion(delta: float) -> void:
	if occlusion_dirty:
		environment_occlusion.rebuild([outside,inside])
		occlusion_dirty = false
	var body_size = Vector2(float(Hero.SPEC.FRAME_SIZE.x)*.55,float(Hero.SPEC.SOURCE_HEIGHT))/Hero.SPEC.PIXELS_PER_UNIT
	body_size *= Vector2(hero.global_basis.x.length(),hero.global_basis.y.length())
	for tree in get_tree().get_nodes_in_group("arcana_prop_occluders"):
		if outside.is_ancestor_of(tree) or inside.is_ancestor_of(tree):
			tree.update_player_occlusion(camera,hero.global_position,body_size,delta,tree.is_visible_in_tree(),world.reduced_motion)
	environment_occlusion.update(camera,hero.global_position,body_size,delta,world.reduced_motion)

func _activate_follow_camera() -> void:
	# A layout camera can become current before the scene is reparented here.
	# Keep composition cameras available in the editor, but use the player camera in game.
	for preview_camera in layout.find_children("*","Camera3D",true,false):
		preview_camera.clear_current(false)
	camera.make_current()

func _sync_layout_anchors() -> void:
	local_lighting.configure(layout,outside)
	occlusion_dirty = true
	Illustrated.build_verges(outside,layout)
	if reference_ground_mat != null: layout.configure_ground(reference_ground_mat)
	if ground_mat != null:
		layout.configure_ground(ground_mat)
		_sync_lantern_lights()
	fountain_anchor = Vector3(0,-1000,0)
	for entry in layout.placements():
		if entry.model_kind == "fountain" and fountain_anchor.y < -100:
			fountain_transform = entry.layout_transform(layout)
			fountain_anchor = fountain_transform.origin
		if entry.gameplay_id in ["player_spawn","resident"]:
			entry.hide()

	_sync_tile_reference()

func _sync_tile_reference() -> void:
	if tile_reference == null:
		tile_reference = MeshInstance3D.new()
		tile_reference.name = "OneTileReference"
		var plane = PlaneMesh.new()
		# World.TILE (16 logical coordinates) equals exactly one 3D ground unit.
		plane.size = Vector2.ONE
		tile_reference.mesh = plane
		tile_reference.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		var material = ShaderMaterial.new()
		material.shader = preload("res://art/resources/tile_reference.gdshader")
		tile_reference.material_override = material
		outside.add_child(tile_reference)
	tile_reference.visible = layout.show_scale_reference and fountain_anchor.y > -100
	if tile_reference.visible:
		var basin_radius = 2.25*maxf(fountain_transform.basis.x.length(),fountain_transform.basis.z.length())
		# Align the outline to a real grid cell immediately south of the basin.
		tile_reference.position = Vector3(floorf(fountain_anchor.x)+.5,.04,
			floorf(fountain_anchor.z+basin_radius+.4)+.5)
	_sync_height_reference()

func _sync_height_reference() -> void:
	if height_reference == null:
		height_reference = MeshInstance3D.new()
		height_reference.name = "OneByOneByThreeReference"
		var box = BoxMesh.new()
		box.size = Vector3(1,3,1)
		height_reference.mesh = box
		var material = ShaderMaterial.new()
		material.shader = preload("res://art/resources/pixel3d.gdshader")
		material.set_shader_parameter("base_color",Color("9cdbd3"))
		material.set_shader_parameter("entity_anchor_enabled",true)
		height_reference.material_override = material
		outside.add_child(height_reference)
	height_reference.visible = tile_reference.visible
	if height_reference.visible:
		# Same grid column, three ground cells south; base sits on the floor.
		var base = Vector3(tile_reference.position.x,0,tile_reference.position.z+3)
		height_reference.position = base+Vector3(0,1.5,0)
		height_reference.material_override.set_shader_parameter("entity_anchor",base)

func _apply_actor_transforms() -> void:
	var seen: Dictionary = {}
	for entry in layout.placements():
		if seen.has(entry.gameplay_id): continue
		seen[entry.gameplay_id] = true
		var actor = hero if entry.gameplay_id == "player_spawn" else null
		if actor != null:
			var authored = entry.layout_transform(layout)
			actor.scale = authored.basis.get_scale()
			actor.last_yaw = authored.basis.get_euler().y

func _poll_layout(delta: float) -> void:
	# Native editor runs read the same file that Ctrl+S writes. Web exports are immutable.
	if not OS.has_feature("editor") or OS.has_feature("web"): return
	_layout_poll += delta
	if _layout_poll < .5: return
	_layout_poll = 0.0
	var path = "res://scenes/plaza.tscn"
	var stamp = FileAccess.get_modified_time(path)
	_layout_stamp = stamp
	var digest = FileAccess.get_sha256(path)
	if digest == _layout_hash: return
	_layout_hash = digest
	var packed = ResourceLoader.load(path,"PackedScene",ResourceLoader.CACHE_MODE_IGNORE)
	if not packed is PackedScene: return
	var replacement = packed.instantiate()
	if not replacement.has_method("placements"):
		replacement.queue_free()
		return
	var previous = layout
	outside.add_child(replacement)
	layout = replacement
	_activate_follow_camera()
	world.apply_layout(layout)
	_sync_layout_anchors()
	_apply_actor_transforms()
	outside.remove_child(previous)
	previous.queue_free()
	print("광장 배치 갱신: ",layout.placements().size(),"개 · 저장한 장면을 적용했습니다.")

func _effects() -> void:
	for node in effect_pool: node.visible = false
	damage_label.visible = false
	var count = 0
	for p in world.particles:
		var age = 1.0-p.life
		var end = map_point(Vector2(600,1054),.65) if world.indoor.is_empty() else map_point(Vector2(192,130),.65)
		if p.kind == "fireball":
			if age>=.3 or world.reduced_motion or not world.effects_enabled:
				damage_label.visible = not p.text.is_empty()
				damage_label.text = "−"+p.text
				damage_label.position = end+Vector3(0,1.1+maxf(0,age-.3)*1.2,0)
				damage_label.modulate.a = clampf((1-age)*2,0,1)
			if world.reduced_motion or not world.effects_enabled: continue
			if age<.3:
				var start = map_point(p.pos,.9)
				var t = age/.3
				var point = start.lerp(end,t)+Vector3(sin(t*PI)*-.45,sin(t*PI)*.7,0)
				for i in range(7):
					if count>=effect_pool.size(): break
					var node = effect_pool[count]
					count+=1
					node.position = point-(end-start).normalized()*i*.09
					node.scale = Vector3.ONE*(2.5-i*.25)
					node.visible = true
			else:
				var burst = clampf((age-.3)/.55,0,1)
				for i in range(10):
					if count>=effect_pool.size(): break
					var node = effect_pool[count]
					count+=1
					node.position = end+Vector3(cos(i*TAU/10)*burst,burst*(1-burst)*1.1,sin(i*TAU/10)*burst)
					node.scale = Vector3.ONE*(1-burst)*1.7
					node.visible = true
		elif p.kind == "dodge" and world.effects_enabled and not world.reduced_motion:
			for i in range(8):
				if count>=effect_pool.size(): break
				var node = effect_pool[count]
				count+=1
				node.position = map_point(p.pos,.15)+Vector3(cos(i*TAU/8),0,sin(i*TAU/8))*(.4+age*.8)
				node.scale = Vector3.ONE*(1-age)
				node.visible = true

func pick_interaction(screen_point: Vector2) -> Dictionary:
	if world.indoor == "arcana_shop" and is_instance_valid(shop2d): return shop2d.pick_interaction(screen_point,world)
	var picked: Variant = null
	var closest_depth = -INF
	var toward_camera = Vector2(camera.global_basis.z.x,camera.global_basis.z.z).normalized()
	for prop in get_tree().get_nodes_in_group("arcana_interaction_art"):
		if not prop.hit_test(camera,screen_point): continue
		var anchor: Vector3 = prop.global_transform*prop.depth_anchor_offset
		var depth = Vector2(anchor.x,anchor.z).dot(toward_camera)
		if depth > closest_depth:
			closest_depth = depth
			picked = prop
	if picked != null and picked.hit_test(camera,screen_point,true):
		for entity in world.entities:
			if entity.id == picked.interaction_id: return entity
	return {}

func pick(screen_point: Vector2) -> Vector2:
	if world.indoor == "arcana_shop" and is_instance_valid(shop2d): return shop2d.pick(screen_point)
	var origin = camera.project_ray_origin(screen_point)
	var normal = camera.project_ray_normal(screen_point)
	var point = Plane(Vector3.UP,0).intersects_ray(origin,normal)
	if point == null: return world.player_position
	return Vector2(point.x,point.z)*16.0

func _exit_tree() -> void:
	Models.clear_templates()

func screen_point(point: Vector2, height: float = 0.0) -> Vector2:
	if world.indoor == "arcana_shop" and is_instance_valid(shop2d): return shop2d.screen_point(point,height)
	return camera.unproject_position(map_point(point,height))
