extends SceneTree
## Isolated GPU/engine review. No Main, HTTP API, account, or save loading.
## Movement runs actual World methods in fixed simulation steps, not real-time input.
const STEP: float = 1.0 / 60.0
const MAX_STEPS: int = 1200
var viewport: SubViewport
var world: Node2D
var renderer: Node2D
var folder: String
var received: Array[String] = []
var report: Dictionary = {"pass":true, "routes":[], "captures":[], "floor_round_trip":{}, "scope":"Isolated World + native_2d_world, actual runtime collision/pathfinding and GPU rendering. Fixed engine method calls at 1/60 simulated seconds; no real-time input, Main UI, API or saves. Visual framing may reposition actor; route checks always reset via authored Arrival."}

func _initialize() -> void:
    call_deferred("run")

func run() -> void:
    root.position = Vector2i(-32000, -32000)
    folder = OS.get_environment("ARCANA_ACADEMY_REVIEW_OUTPUT")
    if folder.is_empty(): folder = ProjectSettings.globalize_path("res://../.runtime/godot/academy-review")
    DirAccess.make_dir_recursive_absolute(folder)
    viewport = SubViewport.new()
    viewport.size = Vector2i(384, 824)
    viewport.disable_3d = true
    viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
    viewport.canvas_item_default_texture_filter = Viewport.DEFAULT_CANVAS_ITEM_TEXTURE_FILTER_NEAREST
    root.add_child(viewport)
    world = load("res://scripts/world.gd").new()
    world.layout = load("res://scenes/native_2d/plaza.tscn").instantiate()
    viewport.add_child(world)
    world.hide()
    world.camera.enabled = false
    world.set_process(false)
    world.enabled = true
    world.developer_speed_boost = true
    world.interacted.connect(_on_interacted)
    renderer = load("res://scripts/native_2d_world.gd").new()
    renderer.world = world
    viewport.add_child(renderer)
    renderer.set_process(false)
    renderer.set_render_pixel_scale(1.0)
    for floor_number in [1, 2]:
        _reset_arrival(floor_number)
        var targets: Array = world.entities.duplicate(true)
        for entity: Dictionary in targets:
            if str(entity.get("kind", "")) in ["academy_room", "academy_stairs", "exit"]:
                _review_route(floor_number, entity)
        _reset_arrival(floor_number)
        await _capture("floor-%d-overview" % floor_number, Vector2i(1536, 1664), true)
        await _capture("floor-%d-mobile-arrival" % floor_number, Vector2i(384, 824), true)
        # Framing only. These positions do not contribute to navigation pass/fail.
        for entity: Dictionary in targets:
            if str(entity.get("kind", "")) == "academy_room":
                world.player_position = world.nearest_walkable(entity.pos)
                await _capture("floor-%d-mobile-%s" % [floor_number, str(entity.id)], Vector2i(384, 824), true)
        world.player_position = world.nearest_walkable(Vector2(285, 150) if floor_number == 1 else Vector2(285, 220))
        await _capture("floor-%d-mobile-lamp-effects-on" % floor_number, Vector2i(384, 824), true)
        await _capture("floor-%d-mobile-lamp-effects-off" % floor_number, Vector2i(384, 824), false)
    _reset_arrival(1)
    world.change_academy_floor(2)
    var up_position: Vector2 = world.player_position
    var up_ok: bool = world.academy_floor == 2 and world._can_stand(up_position)
    world.change_academy_floor(1)
    var down_position: Vector2 = world.player_position
    var down_ok: bool = world.academy_floor == 1 and world._can_stand(down_position)
    report.floor_round_trip = {"pass":up_ok and down_ok, "up_floor":2, "up_arrival":_point(up_position), "up_walkable":up_ok, "down_floor":world.academy_floor, "down_arrival":_point(down_position), "down_walkable":down_ok, "method":"actual change_academy_floor(2), change_academy_floor(1); isolated signal observers do not invoke Main"}
    report.pass = bool(report.pass) and up_ok and down_ok
    var output: FileAccess = FileAccess.open(folder.path_join("report.json"), FileAccess.WRITE)
    if output == null:
        push_error("Cannot write academy review report: " + folder)
        quit(2)
        return
    output.store_string(JSON.stringify(report, "  "))
    output.close()
    print("ACADEMY_REVIEW_REPORT ", folder.path_join("report.json"), " pass=", report.pass)
    viewport.queue_free()
    await process_frame
    quit(0 if report.pass else 1)

func _reset_arrival(floor_number: int) -> void:
    world.change_interior("arcana_academy")
    world.academy_floor = floor_number
    # change_interior uses authored Arrival for this floor, without test teleporting.
    world.change_interior("arcana_academy")
    world.enabled = true
    world.set_process(false)
    world.effects_enabled = true
    received.clear()

func _review_route(floor_number: int, entity: Dictionary) -> void:
    _reset_arrival(floor_number)
    var start: Vector2 = world.player_position
    var target: Vector2 = entity.pos
    var moved_distance: float = 0.0
    var steps: int = 0
    var collisions_valid: bool = world._can_stand(start)
    world.interact_with(entity)
    var initial_path_points: int = world.path.size()
    while not received.has(str(entity.id)) and steps < MAX_STEPS:
        var before: Vector2 = world.player_position
        world._process(STEP)
        moved_distance += before.distance_to(world.player_position)
        collisions_valid = collisions_valid and world._can_stand(world.player_position)
        steps += 1
        if world.path.is_empty() and world.clicked_interaction_id.is_empty(): break
    var actual: Vector2 = world.player_position
    var signaled: bool = received.has(str(entity.id))
    var radius: float = float(entity.get("interaction_radius", 34.0))
    var passed: bool = signaled and actual.distance_to(target) < radius and collisions_valid
    report.routes.append({"floor":floor_number, "id":str(entity.id), "kind":str(entity.kind), "pass":passed, "interacted_received":signaled, "start":_point(start), "target":_point(target), "actual_endpoint":_point(actual), "distance_to_target":actual.distance_to(target), "interaction_radius":radius, "traveled_distance":moved_distance, "initial_path_points":initial_path_points, "remaining_path_points":world.path.size(), "steps":steps, "simulated_seconds":steps * STEP, "timeout_simulated_seconds":MAX_STEPS * STEP, "all_sampled_positions_walkable":collisions_valid, "method":"interact_with -> walk_to if outside radius -> actual World._process(1/60), developer speed 3x, no route teleport"})
    report.pass = bool(report.pass) and passed
    print("ACADEMY_ROUTE floor=", floor_number, " id=", entity.id, " pass=", passed, " steps=", steps, " end=", actual)

func _capture(label: String, size: Vector2i, effects: bool) -> void:
    viewport.size = size
    renderer.set_display_size(Vector2(size))
    world.effects_enabled = effects
    renderer._process(0.0)
    # Camera/lighting are updated once; world simulation remains frozen during draw.
    await process_frame
    await RenderingServer.frame_post_draw
    var image: Image = viewport.get_texture().get_image()
    var valid: bool = image != null and not image.is_empty()
    var nodes3d: int = renderer.academy_room.find_children("*", "Node3D", true, false).size()
    var viewport_nodes3d: int = viewport.find_children("*", "Node3D", true, false).size()
    var save_error: int = ERR_CANT_CREATE
    if valid: save_error = image.save_png(folder.path_join(label + ".png"))
    var passed: bool = valid and save_error == OK and nodes3d == 0
    report.captures.append({"name":label, "pass":passed, "size":[size.x, size.y], "effects":effects, "floor":world.academy_floor, "player_logical":_point(world.player_position), "world_time":world.time, "nodes3d":nodes3d, "nodes3d_scope":"active renderer.academy_room subtree", "viewport_nodes3d_reference_only":viewport_nodes3d, "save_error":save_error, "path":folder.path_join(label + ".png"), "framing_only":true})
    report.pass = bool(report.pass) and passed
    print("ACADEMY_CAPTURE ", label, " pass=", passed)

func _on_interacted(entity: Dictionary) -> void:
    received.append(str(entity.get("id", "")))

func _point(value: Vector2) -> Array:
    return [value.x, value.y]