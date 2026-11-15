extends SceneTree
const Flame = preload("res://scripts/fireball_vfx.gd")
const Slime = preload("res://scripts/slime_sprite.gd")
const Lighting = preload("res://scripts/local_lighting.gd")
func _initialize() -> void:
	render.call_deferred()
func render() -> void:
	var viewport = SubViewport.new()
	viewport.size = Vector2i(960,640)
	viewport.own_world_3d = true
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	root.add_child(viewport)
	var stage = Node3D.new()
	viewport.add_child(stage)
	var environment = WorldEnvironment.new()
	environment.environment = Environment.new()
	environment.environment.background_mode = Environment.BG_COLOR
	environment.environment.background_color = Color("7e807d")
	environment.environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.environment.ambient_light_color = Color.WHITE
	environment.environment.ambient_light_energy = .4
	stage.add_child(environment)
	var camera = Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 4.8
	camera.position = Vector3(0,4,6)
	stage.add_child(camera)
	camera.look_at(Vector3.ZERO)
	camera.make_current()
	var floor = MeshInstance3D.new()
	var plane = PlaneMesh.new()
	plane.size = Vector2(12,12)
	floor.mesh = plane
	var shader = Shader.new()
	shader.code = "shader_type spatial; render_mode unshaded;\n#include \"res://art/resources/local_lighting.gdshaderinc\"\nvarying vec3 point; void vertex(){ point=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;} void fragment(){vec2 p=floor(point.xz*64.0)/64.0; float tile=mod(floor(p.x*2.0)+floor(p.y*2.0),2.0); vec3 color=mix(vec3(.42,.37,.28),vec3(.49,.44,.34),tile); ALBEDO=color*(vec3(1.0)+local_irradiance(vec3(p.x,0,p.y),vec3(0,1,0)));}"
	var material = ShaderMaterial.new()
	material.shader = shader
	floor.material_override = material
	stage.add_child(floor)
	var block = MeshInstance3D.new()
	var mesh = BoxMesh.new()
	mesh.size = Vector3(.55,.55,.55)
	block.mesh = mesh
	block.position = Vector3(.75,.275,.3)
	var stone = StandardMaterial3D.new()
	stone.albedo_color = Color("a99b82")
	block.material_override = stone
	stage.add_child(block)
	var slime = Slime.new()
	slime.standalone_preview = true
	stage.add_child(slime)
	slime.position = Vector3(-.7,0,.05)
	var flame = Flame.new()
	stage.add_child(flame)
	flame.position = Vector3(0,.6,0)
	flame.elapsed = .10
	flame.update_pose(camera,0,false,false)
	var lighting = Lighting.new()
	lighting.update(stage,Vector3.ZERO,false,true,1)
	await RenderingServer.frame_post_draw
	await RenderingServer.frame_post_draw
	var directory = "D:/BANG/project/textRPG/godot-arcana/art/reference/fireball-v1"
	DirAccess.make_dir_recursive_absolute(directory)
	viewport.get_texture().get_image().save_png(directory+"/lighting.png")
	print("Rendered fireball lighting: ",directory)
	quit()
