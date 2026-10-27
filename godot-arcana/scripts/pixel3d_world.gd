extends Node3D
# Native 3D -> small orthographic viewport -> nearest-neighbor presentation.
# Gameplay remains in world.gd; screen ray picking maps back to its world units.
const Models = preload("res://scripts/pixel3d_models.gd")
const CityLayout = preload("res://scripts/plaza_layout.gd")
const Actor = preload("res://scripts/pixel3d_actor.gd")
const Hero = preload("res://scripts/blender_hero.gd")
const PIXELS_PER_UNIT = 16.0
const CAMERA_ZOOM = 1.35
const PITCH_SINE = CityLayout.CAMERA_PITCH_SINE
var world: Node2D
var pixelated = true
var quarter_view = true
var display_height = 824.0
var pixels_per_unit = 16.0
var camera: Camera3D
var sunshine: DirectionalLight3D
var environment: Environment
var outside: Node3D
var inside: Node3D
var hero: Node3D
var resident: Node3D
var slime: Node3D
var marker: Node3D
var target_marker: Node3D
var fountain_anchor = Vector3(36,0,28.625)
var fountain_transform = Transform3D(Basis.IDENTITY,Vector3(36,0,28.625))
var droplets: Array[MeshInstance3D] = []
var effect_pool: Array[MeshInstance3D] = []
var lantern_lights: Array[OmniLight3D] = []
var interior_people: Array[Node3D] = []
var previous_player = Vector2.ZERO
var previous_resident = Vector2.ZERO
var camera_center = Vector3.ZERO
var last_interior = "__boot__"
var damage_label: Label3D
var enemy_hp: MeshInstance3D
var attack_bar: MeshInstance3D
var ground_mat: ShaderMaterial
var water_material: ShaderMaterial
var transient_material: ShaderMaterial
var last_dusk = -1
var layout: Node3D
var _layout_poll = 0.0
var _layout_stamp = 0
var _layout_hash = ""
var _resident_enabled = true

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
	hero = Hero.new()
	add_child(hero)
	resident = Actor.new()
	resident.traveler = true
	outside.add_child(resident)
	_apply_actor_transforms()
	previous_player = world.player_position
	previous_resident = world.traveler_position
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
	damage_label.font = preload("res://fonts/KoPubBatangMedium.ttf")
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

func _place(kind: String, point: Vector2, parent: Node3D = null) -> Node3D:
	var node = Models.model(kind)
	node.position = map_point(point)
	(parent if parent != null else outside).add_child(node)
	return node

func _build_outdoors() -> void:
	_floor(outside,Vector2(72,90),Vector3(36,0,45),true)
	# City wall segments are fully modeled, with the original southern opening.
	for entry in [[32,510],[610,510]]:
		var root = Node3D.new()
		root.position = map_point(Vector2(entry[0]+entry[1]/2.0,752))
		outside.add_child(root)
		Models.box(root,Vector3(entry[1]/16.0,1.1,.7),Vector3(0,.55,0),"e0d1b9")
		Models.box(root,Vector3(entry[1]/16.0,.08,.76),Vector3(0,1.03,0),"d5a44f")
		for x in range(int(entry[1]/16.0)):
			Models.box(root,Vector3(.62,.3,.75),Vector3(-entry[1]/32.0+x+.5,1.2,0),"eee0c8")
			if x%4==0:
				Models.box(root,Vector3(.36,.65,.05),Vector3(-entry[1]/32.0+x+.5,.65,.38),"304f9c")
				Models.box(root,Vector3(.12,.12,.06),Vector3(-entry[1]/32.0+x+.5,.73,.40),"f2cf79",Vector3(0,0,PI/4))
		Models._merge(root)
	for x in [535,618]:
		var tower = Node3D.new()
		tower.position = map_point(Vector2(x,751))
		outside.add_child(tower)
		Models._spire(tower,Vector3.ZERO,.80,3.6)
		Models._merge(tower)
	_sync_lantern_lights()
	# East river is an actual recessed plane, bounded by physical bank rocks.
	var river = Models.box(outside,Vector3(13.25,.10,22.375),Vector3(65.375,-.08,63.8125),"579da0")
	river.material_override = Models.material("579da0",0,.10)
	for i in range(26):
		var rock = Node3D.new()
		rock.position = Vector3(58.8,.0,52.8+i*.85)
		outside.add_child(rock)
		Models.sphere(rock,Vector3(.7,.48,.85),Vector3(0,.12,0),"8f9780" if i%3 else "b6ab8e")
		Models._merge(rock)
	water_material = Models.material("9cdbd3",0,.25).duplicate()
	water_material.set_shader_parameter("entity_anchor_enabled",true)
	water_material.set_shader_parameter("entity_anchor",fountain_anchor+Vector3(0,0,.08))
	for i in range(18):
		var drop = Models.box(outside,Vector3(.0625,.13,.0625),Vector3.ZERO,"9cdbd3")
		drop.material_override = water_material
		drop.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		droplets.append(drop)
	slime = Node3D.new()
	slime.position = map_point(Vector2(600,1054))
	outside.add_child(slime)
	Models.sphere(slime,Vector3(1.3,.85,1.05),Vector3(0,.38,0),"75b5b2")
	Models.sphere(slime,Vector3(.80,.42,.70),Vector3(-.1,.57,.05),"9acac0")
	for x in [-.22,.22]: Models.sphere(slime,Vector3(.08,.13,.07),Vector3(x,.44,.47),"253c40")
	Models.sphere(slime,Vector3(.23,.09,.16),Vector3(-.22,.72,.22),"d6eee1")
	Models._merge(slime,true,true)
	enemy_hp = Models.box(outside,Vector3(1.8,.07,.05),slime.position+Vector3(0,1.25,0),"c78a68")
	enemy_hp.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	attack_bar = Models.box(outside,Vector3(1.8,.045,.05),slime.position+Vector3(0,1.14,0),"c7a0ab")
	attack_bar.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF

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
	for child in inside.get_children():
		inside.remove_child(child)
		child.queue_free()
	interior_people.clear()
	if id.is_empty(): return
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
	if id == "dungeon":
		_place("portal",Vector2(192,140),inside)
		return
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
	if id not in ["arcana_academy","dungeon"]:
		_place("workbench",Vector2(192,114),inside).scale = Vector3(4,1,2)
		for x in [70,302]: _place("bench",Vector2(x,204),inside)

func view_yaw() -> float:
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
	if world.indoor != last_interior:
		last_interior = world.indoor
		outside.visible = last_interior.is_empty()
		inside.visible = not outside.visible
		_interior(last_interior)
		environment.background_color = Color("78ad72") if outside.visible else Color("283452")
		camera_center = map_point(world.player_position)
	var motion = world.player_position-previous_player
	hero.position = _snap_ground(map_point(world.player_position))
	hero.pose(world.time,world.player_gait,world.walking,motion,pixelated,world.effects_enabled and not world.reduced_motion)
	previous_player = world.player_position
	resident.visible = _resident_enabled
	resident.position = _snap_ground(map_point(world.traveler_position))
	var resident_motion = world.traveler_position-previous_resident
	resident.pose(world.time,world.traveler_gait,resident_motion.length_squared()>.0001,resident_motion,pixelated,world.effects_enabled and not world.reduced_motion)
	previous_resident = world.traveler_position
	for npc in interior_people: npc.pose(world.time,0,false,Vector2.ZERO,pixelated,world.effects_enabled and not world.reduced_motion)
	var target = map_point(world.player_position)
	var view_height = display_height / (32.0 * CAMERA_ZOOM)
	if not world.indoor.is_empty():
		var half_width = view_height*get_viewport().size.x/get_viewport().size.y/2.0
		target.x = clampf(target.x,minf(12.0,1.5+half_width),maxf(12.0,22.5-half_width))
		target.z = 10.75
	if world.reduced_motion or camera_center.distance_to(target)>7: camera_center = target
	else:
		camera_center.x = clampf(camera_center.x,target.x-.45,target.x+.45)
		camera_center.z = clampf(camera_center.z,target.z-.7,target.z+.7)
	camera.size = view_height
	pixels_per_unit = get_viewport().size.y/camera.size
	var center = _snap_ground(camera_center)
	var ground_distance = 24*sqrt(1-PITCH_SINE*PITCH_SINE)/PITCH_SINE
	var yaw = view_yaw()
	camera.position = center+Vector3(sin(yaw)*ground_distance,24,cos(yaw)*ground_distance)
	camera.look_at(center)
	camera.h_offset = (get_viewport().size.x%2)*.5/pixels_per_unit if pixelated else 0.0
	camera.v_offset = (get_viewport().size.y%2)*.5/pixels_per_unit if pixelated else 0.0
	for mat in Models.materials.values(): mat.set_shader_parameter("motion_time",world.time if world.effects_enabled and not world.reduced_motion else 0.0)
	if last_dusk != int(world.dusk):
		last_dusk = int(world.dusk)
		sunshine.light_color = Color("f9d4a2") if world.dusk else Color("fff0db")
		sunshine.light_energy = .38 if world.dusk else .48
		environment.ambient_light_color = Color("6c92df") if world.dusk else Color("afc5cf")
		environment.ambient_light_energy = .32 if world.dusk else .18
	for light in lantern_lights: light.visible = world.dusk and world.effects_enabled
	for i in range(droplets.size()):
		var drop = droplets[i]
		drop.visible = outside.visible and world.effects_enabled and not world.reduced_motion and fountain_anchor.y > -100
		var t = fmod(world.time*.8+(i%6)/6.0,1.0)
		var angle = (i/6)*TAU/3.0
		var radial = Vector3(cos(angle),0,sin(angle))
		# Small crown jets feed the upper pool; the four falling streams are
		# attached to the editable fountain model itself, including its transform.
		drop.position = fountain_transform*(radial*(.18+t*.45)+Vector3(0,1.67+sin(t*PI)*.47-t*.08,0))
		drop.scale = fountain_transform.basis.get_scale()
		if pixelated: drop.position = drop.position.snapped(Vector3.ONE/16)
	marker.visible = not world.nearest.is_empty()
	if marker.visible: marker.position = map_point(world.nearest.pos)
	target_marker.visible = not world.path.is_empty()
	if target_marker.visible: target_marker.position = map_point(world.path[world.path.size()-1])
	var living = world.battle.get("phase","") not in ["victory","defeat"] or world.impact_remaining>0
	slime.visible = living
	var pulse = sin(world.time*2.5)*.035 if world.effects_enabled and not world.reduced_motion else 0.0
	slime.scale = Vector3(1+pulse,1-pulse,1+pulse)
	enemy_hp.visible = not world.battle.is_empty() and living
	enemy_hp.scale.x = maxf(.001,float(world.enemy_visual_hp)/30)
	enemy_hp.position.x = slime.position.x-.9+.9*enemy_hp.scale.x
	attack_bar.visible = enemy_hp.visible and float(world.battle.get("attackIn",6))<=3
	attack_bar.scale.x = maxf(.001,clampf(float(world.battle.get("attackIn",6))/3,0,1))
	attack_bar.position.x = slime.position.x-.9+.9*attack_bar.scale.x
	_effects()

func _activate_follow_camera() -> void:
	# A layout camera can become current before the scene is reparented here.
	# Keep composition cameras available in the editor, but use the player camera in game.
	for preview_camera in layout.find_children("*","Camera3D",true,false):
		preview_camera.clear_current(false)
	camera.make_current()

func _sync_layout_anchors() -> void:
	if ground_mat != null:
		layout.configure_ground(ground_mat)
		_sync_lantern_lights()
	fountain_anchor = Vector3(0,-1000,0)
	_resident_enabled = false
	for entry in layout.placements():
		if entry.model_kind == "fountain" and fountain_anchor.y < -100:
			fountain_transform = entry.layout_transform(layout)
			fountain_anchor = fountain_transform.origin
		if entry.gameplay_id in ["player_spawn","resident"]:
			entry.hide()
			if entry.gameplay_id == "resident": _resident_enabled = true

func _apply_actor_transforms() -> void:
	var seen: Dictionary = {}
	for entry in layout.placements():
		if seen.has(entry.gameplay_id): continue
		seen[entry.gameplay_id] = true
		var actor = hero if entry.gameplay_id == "player_spawn" else resident if entry.gameplay_id == "resident" else null
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
	if water_material != null: water_material.set_shader_parameter("entity_anchor",fountain_anchor+Vector3(0,0,.08))
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

func pick(screen_point: Vector2) -> Vector2:
	var origin = camera.project_ray_origin(screen_point)
	var normal = camera.project_ray_normal(screen_point)
	var point = Plane(Vector3.UP,0).intersects_ray(origin,normal)
	if point == null: return world.player_position
	return Vector2(point.x,point.z)*16.0

func _exit_tree() -> void:
	Models.clear_templates()
