extends SceneTree
## Compare the visible silhouette of each rear home with the same shot of the home alone.
const TileStyle := preload("res://scripts/rendering/tile_world_style.gd")
const Layout := preload("res://data/plaza-terraces.json")
const SCALE := 32.0  # Internal pixels per world unit at the native 1x raster.
const OUT_SIZE := Vector2i(272, 240)

var view := SubViewport.new()
var cam := Camera3D.new()
var models := Node3D.new()
var owners: Dictionary = {}
var white := StandardMaterial3D.new()
var stone := StandardMaterial3D.new()


func _initialize() -> void:
	call_deferred("capture")


func capture() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 2 or DirAccess.make_dir_recursive_absolute(args[1]) != OK:
		push_error("Pass a res:// plaza scene and an absolute scratch output directory.")
		quit(1)
		return
	root.position = Vector2i(-32000, -32000)
	view.size = OUT_SIZE
	view.own_world_3d = true
	view.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	root.add_child(view)
	view.add_child(models)
	view.add_child(cam)
	cam.projection = Camera3D.PROJECTION_ORTHOGONAL
	cam.size = OUT_SIZE.y / SCALE
	cam.rotation_degrees = TileStyle.CAMERA_ROTATION_DEGREES
	cam.environment = Environment.new()
	cam.environment.background_mode = Environment.BG_COLOR
	cam.environment.background_color = Color("18212b")
	white.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	white.albedo_color = Color.WHITE
	stone.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	stone.albedo_color = Color("556071")
	var scene := load(args[0]) as PackedScene
	if not scene:
		quit(1)
		return
	var plaza := scene.instantiate()
	# Read the packed architecture, independent of post-processing and runtime actors.
	for name in ["TerracedMarket", "Restaurant", "Shop", "Inn", "Academy", "PlayerHome", "River", "Fountain"]:
		var part := plaza.get_node(NodePath(name)) as Node3D
		if part == null:
			plaza.free()
			quit(1)
			return
		copy_meshes(part, Transform3D.IDENTITY, name)
	plaza.free()
	for spec: Dictionary in Layout.data["buildings"]:
		var label := str(spec["id"])
		if not owners.has(label):
			push_error("Missing mesh group " + label)
			quit(1)
			return
		var rect: Array = spec["rect"]
		var center := Vector3((rect[0]+rect[2])*0.5, spec["base"]+(spec["wall"]+spec["roof"])*0.48, (rect[1]+rect[3])*0.5)
		cam.position = center + cam.basis.z * 80.0
		for isolated in [true, false]:
			for group_name: String in owners:
				var target: bool = group_name == label
				for mesh: MeshInstance3D in owners[group_name]:
					mesh.visible = target or not isolated
					mesh.material_override = white if target else stone
			await process_frame
			await RenderingServer.frame_post_draw
			await process_frame
			await RenderingServer.frame_post_draw
			var picture := view.get_texture().get_image()
			if picture == null or picture.save_png(args[1].path_join(label + ("-single" if isolated else "-full") + ".png")) != OK:
				quit(1)
				return
	quit()


func copy_meshes(node: Node3D, parent_pose: Transform3D, group_name: String) -> void:
	if not node.visible:
		return
	var pose := parent_pose * node.transform
	if group_name == "TerracedMarket" and Layout.data["buildings"].any(func(spec): return spec["id"] == str(node.name)):
		group_name = str(node.name)
	if node is MeshInstance3D and node.mesh != null:
		var copy := MeshInstance3D.new()
		copy.mesh = node.mesh
		copy.transform = pose
		copy.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		models.add_child(copy)
		if not owners.has(group_name):
			owners[group_name] = []
		owners[group_name].append(copy)
	for child in node.get_children():
		if child is Node3D:
			copy_meshes(child, pose, group_name)
