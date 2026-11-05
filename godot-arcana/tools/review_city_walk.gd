extends SceneTree
var failures: Array[String] = []
func _initialize() -> void: call_deferred("review")
func check(value: bool, message: String) -> void:
    if not value: failures.append(message)
func review() -> void:
    var viewport = SubViewport.new()
    viewport.size = Vector2i(800,600)
    root.add_child(viewport)
    var main = load("res://main.tscn").instantiate()
    var authored = main.get_node("Plaza")
    main.remove_child(authored)
    main.free()
    var world = load("res://scripts/world.gd").new()
    world.layout = authored
    viewport.add_child(world)
    world.set_process(false)
    world.set_physics_process(false)
    world.enabled = true
    world.camera.enabled = false
    var renderer = load("res://scripts/native_2d_world.gd").new()
    renderer.world = world
    viewport.add_child(renderer)
    renderer.set_process(false)
    var life = renderer.city_life
    var traveled: Dictionary = {}
    var invalid: Dictionary = {}
    for actor in life.residents:
        traveled[actor.gameplay_id] = 0.0
        invalid[actor.gameplay_id] = 0
    for frame in range(3600):
        world.time += 0.05
        for actor in life.residents:
            var before: Vector2 = actor.position
            actor.sync_city(world,0.05,life.residents)
            traveled[actor.gameplay_id] += actor.position.distance_to(before) / 4.0
            if not world._can_stand(actor.position/4.0): invalid[actor.gameplay_id] += 1
    for actor in life.residents:
        check(traveled[actor.gameplay_id] > 80.0,"Resident stuck: "+actor.gameplay_id)
        check(invalid[actor.gameplay_id] == 0,"Resident in collision: "+actor.gameplay_id)
        for entity in world.entities:
            if entity.id == actor.gameplay_id:
                check(entity.pos.is_equal_approx(actor.position/4.0),"Stale interaction: "+entity.id)
    var routes: Dictionary = {}
    for id in life.CORNERS:
        var target: Vector2 = life.CORNERS[id].target
        world.walk_to(target)
        routes[id] = world.path.size()
        check(not world.path.is_empty() or world.player_position.distance_to(target)<16.0,"No route to corner target: "+id)
    var approaches: Dictionary = {}
    for entity in world.entities:
        if entity.kind not in ["building","bench","city_corner"]: continue
        var target: Vector2 = entity.pos
        if entity.kind == "building": target -= entity.inward*12.0
        approaches[entity.id] = world._can_stand(target)
        check(world._can_stand(target),"Blocked approach: "+entity.id)
    var approached_actor = life.residents[0]
    approached_actor.wait_left = 0.0
    approached_actor._route_to(world,approached_actor.route[(approached_actor.route_index+1)%approached_actor.route.size()]/4.0)
    check(not approached_actor.walking_path.is_empty(),"Interaction fixture has no active route")
    var waiting_position: Vector2 = approached_actor.position
    world.clicked_interaction_id = approached_actor.gameplay_id
    approached_actor.sync_city(world,0.05,life.residents)
    check(approached_actor.position.is_equal_approx(waiting_position),"Clicked resident walked away")
    world.clicked_interaction_id = ""
    approached_actor.sync_city(world,0.05,life.residents)
    check(not approached_actor.position.is_equal_approx(waiting_position),"Resident did not resume after interaction")
    var arrivals: Dictionary = {}
    for id in life.CORNERS:
        world.player_position = world.spawn_position
        world.path.clear()
        world.entered_door_id = ""
        var target: Vector2 = life.CORNERS[id].target
        world.walk_to(target)
        for frame in range(1200):
            if world.player_position.distance_to(target)<18.0: break
            world._process(0.05)
        arrivals[id] = world.player_position.distance_to(target)
        check(float(arrivals[id])<18.0,"Walking failed to arrive: "+id)
    var seats: Dictionary = {}
    for entity in world.entities:
        if entity.kind != "bench": continue
        world.player_position = world.spawn_position
        world.clear_bench()
        check(world.sit_on_bench(entity),"Could not approach bench: "+entity.id)
        for frame in range(1200):
            world._process(0.05)
            if world.bench_state=="seated": break
        seats[entity.id] = world.bench_state
        check(world.bench_state=="seated","Could not sit: "+entity.id)
        world.stand_from_bench()
        for frame in range(30): world._process(0.05)
        check(world.bench_state.is_empty(),"Could not stand: "+entity.id)
    world.player_position = world.spawn_position
    world.reduced_motion = true
    var actor = life.residents[0]
    var before: Vector2 = actor.position
    life.sync_city_life(world,1.0)
    check(actor.position.is_equal_approx(before),"Reduced motion did not stop resident")
    check(life.clock == 0.0,"Reduced motion did not stop ambience")
    world.reduced_motion = false
    world.effects_enabled = false
    life.sync_city_life(world,1.0)
    check(actor.position.is_equal_approx(before),"Effects off did not stop resident")
    check(life.pools.brightness == 0.0,"Effects off left light pools")
    var report = {"simulatedSeconds":180,"residentDistance":traveled,"invalidFeet":invalid,"cornerRoutes":routes,"approaches":approaches,"walkingArrivalDistance":arrivals,"benchStates":seats,"failures":failures}
    var file = FileAccess.open("res://../city-review.json",FileAccess.WRITE)
    file.store_string(JSON.stringify(report,"  "))
    file.close()
    print("CITY_REVIEW ",JSON.stringify(report))
    renderer.queue_free()
    world.queue_free()
    await process_frame
    quit(0 if failures.is_empty() else 1)