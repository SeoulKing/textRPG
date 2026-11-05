extends SceneTree
## Isolated render diagnostic. No gameplay, HTTP calls, or player save access.
const Pool = preload("res://scripts/combat_effect_pool.gd")
const Hero = preload("res://scripts/heroine_run.gd")
func _initialize() -> void: call_deferred("measure")
func measure() -> void:
	root.position = Vector2i(-32000,-32000)
	var viewport = SubViewport.new()
	viewport.size = Vector2i(128,128)
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	root.add_child(viewport)
	var renderer = Node3D.new()
	viewport.add_child(renderer)
	var camera = Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 3.0
	camera.position.z = 4.0
	renderer.add_child(camera)
	camera.make_current()
	var pool = Pool.new()
	root.add_child(pool)
	var hero = Hero.new()
	renderer.add_child(hero)
	hero.hide()
	# This is the former first-contact allocation path, before any warmup.
	var started = Time.get_ticks_usec()
	var cold_flame = pool._new_flame(renderer)
	cold_flame.burst = true
	cold_flame.update_pose(camera,0,false,false)
	var cold_label = pool._new_label(renderer)
	cold_label.text = "5"
	var cold_setup_us = Time.get_ticks_usec()-started
	await RenderingServer.frame_post_draw
	cold_flame.queue_free()
	cold_label.queue_free()
	await process_frame
	await pool.prepare(renderer,hero)
	var flames_before: int = pool.created_flames
	var labels_before: int = pool.created_labels
	started = Time.get_ticks_usec()
	var first_flame = pool.take_flame(true)
	first_flame.update_pose(camera,0,false,false)
	var first_label = pool.take_label("5",Color("df596c"))
	var pooled_setup_us = Time.get_ticks_usec()-started
	var flame_id = first_flame.get_instance_id()
	var label_id = first_label.get_instance_id()
	pool.release_flame(first_flame)
	pool.release_label(first_label)
	var next_flame = pool.take_flame()
	var next_label = pool.take_label("회피",Color("f9e7a6"))
	var report = {"coldSetupUs":cold_setup_us,"pooledSetupUs":pooled_setup_us,"renderWarmupCompleted":pool.prepared,"extraFlamesAtContact":pool.created_flames-flames_before,"extraLabelsAtContact":pool.created_labels-labels_before,"flameReused":next_flame.get_instance_id()==flame_id,"labelReused":next_label.get_instance_id()==label_id,"flightStateReset":not next_flame.flight_started and next_flame.flight_distance==0 and next_flame.elapsed==0 and not next_flame.burst}
	report["chargePreparedBeforeCast"] = is_instance_valid(pool.charge) and not pool.charge.visible
	report["castAtlasRenderedBeforeCast"] = pool.cast_material_prepared
	report["gpuDrawCompleted"] = pool.gpu_warmup_completed
	var destination = "D:/BANG/project/textRPG/.runtime/godot/fireball-smooth-diagnostic.json"
	var file = FileAccess.open(destination,FileAccess.WRITE)
	file.store_string(JSON.stringify(report,"\t"))
	print(JSON.stringify(report))
	quit()
