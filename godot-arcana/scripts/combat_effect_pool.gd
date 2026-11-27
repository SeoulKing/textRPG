extends Node
## Prepare the first-use render work before combat, then reuse the same nodes.
const Flame = preload("res://scripts/fireball_vfx.gd")
const Charge = preload("res://scripts/fireball_charge.gd")
const FONT = preload("res://fonts/NotoSansKR-SemiBold.tres")
var prepared: bool = false
var free_flames: Array[Node3D] = []
var free_labels: Array[Label3D] = []
var renderer: Node3D
var created_flames: int = 0
var created_labels: int = 0
var charge: Node3D
var cast_material_prepared: bool = false
var gpu_warmup_completed: bool = false

func _new_flame(parent: Node) -> Node3D:
	var flame = Flame.new()
	parent.add_child(flame)
	created_flames += 1
	return flame

func _new_label(parent: Node) -> Label3D:
	var label = Label3D.new()
	label.font = FONT
	label.font_size = 22
	label.pixel_size = .035
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	label.no_depth_test = true
	label.outline_size = 4
	parent.add_child(label)
	created_labels += 1
	return label

func prepare(target: Node3D, caster: Node3D = null) -> void:
	renderer = target
	# Hidden nodes are culled and do not warm shaders or font glyphs. Render once
	# in a tiny, independent world whose texture is never displayed to the player.
	var warmup = SubViewport.new()
	warmup.size = Vector2i(128,128)
	warmup.own_world_3d = true
	warmup.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	add_child(warmup)
	var camera = Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 3.0
	camera.position.z = 4.0
	warmup.add_child(camera)
	camera.make_current()
	# Charging has its own shader: warming flight/impact alone misses the first cast.
	charge = Charge.new()
	warmup.add_child(charge)
	charge.enabled = false
	charge.update_charge(.20,false)
	var cast_mesh: MeshInstance3D
	if is_instance_valid(caster):
		cast_mesh = caster.make_cast_warmup_mesh()
		warmup.add_child(cast_mesh)
	for i in range(6):
		var flame = _new_flame(warmup)
		flame.burst = i%2==1
		flame.light_enabled = false
		flame.update_pose(camera,0,false,false)
		free_flames.append(flame)
	for i in range(6):
		var label = _new_label(warmup)
		# Warm the exact font size, outline, numerals and combat words used on hit.
		label.text = "0123456789−회피흡수"
		label.modulate = Color("df596c") if i%2==0 else Color("f9e7a6")
		free_labels.append(label)
	for i in range(3): await get_tree().process_frame
	await RenderingServer.frame_post_draw
	# Complete the actual GPU draw before allowing the first shot (also on WebGL).
	var rendered = warmup.get_texture().get_image()
	gpu_warmup_completed = rendered != null and not rendered.is_empty()
	cast_material_prepared = gpu_warmup_completed and is_instance_valid(cast_mesh)
	if not is_instance_valid(renderer):
		warmup.queue_free()
		return
	for flame in free_flames:
		flame.hide()
		warmup.remove_child(flame)
		renderer.add_child(flame)
	for label in free_labels:
		label.hide()
		warmup.remove_child(label)
		renderer.add_child(label)
	charge.hide()
	charge.strength = 0.0
	charge.fire_light.hide()
	warmup.remove_child(charge)
	renderer.add_child(charge)
	charge.enabled = true
	warmup.queue_free()
	prepared = gpu_warmup_completed

func take_flame(burst: bool = false, dissipate: bool = false) -> Node3D:
	var flame: Node3D = free_flames.pop_back() if prepared and not free_flames.is_empty() else _new_flame(renderer)
	flame.elapsed = 0.0
	flame.burst = burst
	flame.dissipate = dissipate
	flame.flight_distance = 0.0
	flame.flight_started = false
	flame.direction = Vector3.RIGHT
	flame.light_enabled = true
	flame.fire_strength = 0.0
	flame.show()
	return flame

func take_label(text: String, color: Color) -> Label3D:
	var label: Label3D = free_labels.pop_back() if prepared and not free_labels.is_empty() else _new_label(renderer)
	label.text = text
	label.modulate = color
	label.show()
	return label

func release_flame(flame: Node3D) -> void:
	flame.hide()
	flame.light_enabled = false
	flame.fire_strength = 0.0
	flame.fire_light.hide()
	free_flames.append(flame)

func release_label(label: Label3D) -> void:
	label.hide()
	free_labels.append(label)
