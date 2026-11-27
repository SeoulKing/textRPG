extends SceneTree
## Load only the exported archive, with no source-project fallback.
func _initialize() -> void:call_deferred("verify_pack")
func verify_pack() -> void:
    var args=OS.get_cmdline_user_args()
    if args.is_empty() or not ProjectSettings.load_resource_pack(args[0]):
        push_error("Cannot mount exported game archive");quit(1);return
    print("ARCANA_WEB_PACK_MOUNTED")
    var tile_style := load("res://scripts/rendering/tile_world_style.gd") as Script
    if tile_style == null or tile_style.presentation_scale(1.0) != 2 \
            or not is_equal_approx(tile_style.world_texel_size(1.0), 1.0 / 32.0):
        push_error("Packaged regions did not include the shared 32-dot raster and 2x presentation")
        quit(1)
        return
    for path in ["res://scripts/main.gd","res://scripts/world.gd","res://scripts/native_2d_world.gd","res://scripts/native_2d_hero.gd","res://scripts/characters/hybrid_v1/reference_character_assembler.gd","res://scripts/native_2d_spatial.gd","res://scripts/native_2d_effect_pool.gd","res://scripts/native_2d_charge.gd","res://scripts/native_2d_flame.gd","res://scripts/native_2d_presence.gd","res://scripts/game_ui.gd"]:
        print("PACK_SCRIPT ",path)
        var script=load(path) as Script
        if script==null or not script.can_instantiate():
            push_error("Missing or invalid packaged script: "+path);quit(1);return
    var registry_script = load("res://scripts/region_registry.gd") as Script
    if registry_script == null or not registry_script.can_instantiate():
        push_error("Missing region registry");quit(1);return
    var regions: Dictionary = registry_script.all()
    if regions.is_empty():
        push_error("Empty packaged region registry");quit(1);return
    for entry in regions.values():
        var path: String = str(entry.scene)
        var scene=load(path) as PackedScene
        if scene==null or not scene.can_instantiate():
            push_error("Missing or invalid packaged scene: "+path);quit(1);return
    var meadow: Dictionary = regions.get("arcana_meadow_field", {})
    var meadow_scene := "res://scenes/native_2d/meadow_field.tscn"
    if meadow.get("scene", "") != meadow_scene or not ResourceLoader.exists(meadow_scene, "PackedScene"):
        push_error("Missing registered meadow scene in the web pack");quit(1);return
    if not ResourceLoader.exists("res://art/export/monsters/meadow-ox.png", "Texture2D"):
        push_error("Missing meadow monster art in the web pack");quit(1);return
    for path: String in ["res://scripts/simplified_play.gd", "res://scripts/simplified_view.gd"]:
        if not ResourceLoader.exists(path, "Script"):
            push_error("Missing packaged location map script: "+path);quit(1);return
    var city_grid := load("res://scripts/simplified_city_grid.gd") as Script
    if city_grid == null or not city_grid.can_instantiate():
        push_error("Missing packaged location grid");quit(1);return
    var meadow_places: Dictionary = city_grid.places_for("arcana_meadow_field")
    if not meadow_places.has("meadow_entrance") or not meadow_places.has("meadow_ox"):
        push_error("Packaged location grid is missing the meadow's entrance or monster");quit(1);return
    print("ARCANA_MEADOW_MAP_PACKAGED")
    var bundle_path := "res://art/characters/hybrid-v1/assembly/parts.json"
    var character: Variant = JSON.parse_string(FileAccess.get_file_as_string(bundle_path))
    if not character is Dictionary or character.get("character_id", "") != "hybrid-v1":
        push_error("Missing approved hybrid-v1 bundle");quit(1);return
    var run_library := load("res://art/characters/hybrid-v1/run-keyframes.tres") as AnimationLibrary
    if run_library == null or not run_library.has_animation("run"):
        push_error("Missing editable hybrid run keys");quit(1);return
    if run_library.get_animation("run").get_track_count() != 21:
        push_error("Hybrid run key channels are incomplete");quit(1);return
    for direction: String in ["s", "se", "e", "ne", "n", "nw", "w", "sw"]:
        for part: String in ["upper-body", "legs"]:
            var scene_path: String = "res://art/characters/hybrid-v1/rigs/"+part+"/"+direction+".tscn"
            var scene := load(scene_path) as PackedScene
            if scene == null or not scene.can_instantiate():
                push_error("Missing packaged hybrid rig: "+scene_path);quit(1);return
    if not FileAccess.file_exists("res://art/characters/hybrid-v1/shared-run.json"):
        push_error("Missing hybrid shared motion");quit(1);return
    print("ARCANA_HYBRID_V1_PACKAGED_8_DIRECTIONS")
    var shop_scene := load("res://scenes/shop_3d.tscn") as PackedScene
    if shop_scene == null or not shop_scene.can_instantiate():
        push_error("Missing packaged shop");quit(1);return
    var stage := Node3D.new()
    root.add_child(stage)
    var shop := shop_scene.instantiate()
    shop.use_approved_rendering = true
    stage.add_child(shop)
    var shop_geometry: Node3D = shop.get_node("Geometry")
    if not shop_geometry.authored_scene_active or shop_geometry.astra_active:
        push_error("Packaged shop did not load the previous Blender room");quit(1);return
    var crate := shop_geometry.find_child("WoodenCrate_Test", true, false)
    if crate == null or not crate.has_node("CratePixelModel"):
        push_error("Packaged shop did not load the Blender pixel crate");quit(1);return
    var preview_cube := shop_geometry.get_node_or_null("PixelTestCube") as Node3D
    if preview_cube != null and preview_cube.visible:
        push_error("Packaged shop displayed its material preview cube");quit(1);return
    var merchant := shop.get_node("Actors/Merchant") as Sprite3D
    if merchant.billboard != BaseMaterial3D.BILLBOARD_DISABLED:
        push_error("Packaged shop actors did not use upright depth");quit(1);return
    if not _verify_approved_rendering(shop.camera, "shop"):
        quit(1)
        return
    shop.free()

    var plaza_scene := load("res://scenes/plaza_3d_v2.tscn") as PackedScene
    if plaza_scene == null or not plaza_scene.can_instantiate():
        push_error("Missing packaged plaza")
        quit(1)
        return
    var plaza := plaza_scene.instantiate()
    plaza.live_mode = true
    stage.add_child(plaza)
    if not _verify_approved_rendering(plaza.camera, "plaza"):
        quit(1)
        return
    if not _verify_plaza_entrances(plaza):
        quit(1)
        return
    plaza.free()

    var inn_scene := load("res://scenes/inn_lobby_3d.tscn") as PackedScene
    if inn_scene == null or not inn_scene.can_instantiate():
        push_error("Missing packaged inn display");quit(1);return
    var inn: Node3D = inn_scene.instantiate()
    stage.add_child(inn)
    var inn_layout: Node2D = registry_script.scene("arcana_inn").instantiate()
    var inn_configured: bool = inn.configure(inn_layout, registry_script.camera_bounds("arcana_inn"))
    inn_layout.free()
    if not inn_configured:
        push_error("Packaged inn did not align with the authored layout");quit(1);return
    if not inn.apply_approved_rendering() or not _verify_approved_rendering(inn.camera, "inn"):
        quit(1)
        return
    var inn_grid := inn.get_node_or_null("Room/UnitInnStructure") as GridMap
    if inn_grid == null or not inn_grid.cell_size.is_equal_approx(Vector3.ONE):
        push_error("Packaged inn did not apply the approved unit tiles")
        quit(1)
        return
    inn.free()
    var home: Node3D = registry_script.scene("arcana_home").instantiate()
    var home_layout: Dictionary = home.collect_layout()
    stage.add_child(home)
    var home_ids: Array = home_layout.entities.map(func(entity: Dictionary): return entity.id)
    var required_home_ids := ["home_kitchen", "home_bed", "home_sofa", "home_table", "home_door"]
    if not required_home_ids.all(func(id: String): return home_ids.has(id)) \
            or home_layout.rectangles.is_empty() \
            or not home.configure(null, registry_script.camera_bounds("arcana_home")):
        push_error("Packaged player home layout or furniture is incomplete");quit(1);return
    var upper_walls := home.get_node_or_null("Room/UpperWalls") as Node3D
    if upper_walls == null or upper_walls.visible:
        push_error("Packaged player home must start with a clear cutaway");quit(1);return
    home.set_upper_walls_visible(true)
    if not upper_walls.visible:
        push_error("Packaged player home could not show the upper walls");quit(1);return
    home.set_upper_walls_visible(false)
    if not home.apply_approved_rendering() or not _verify_approved_rendering(home.camera, "player home"):
        quit(1)
        return
    var restaurant_scene := load("res://scenes/restaurant_3d.tscn") as PackedScene
    if restaurant_scene == null or not restaurant_scene.can_instantiate():
        push_error("Missing packaged restaurant display");quit(1);return
    var restaurant := restaurant_scene.instantiate()
    stage.add_child(restaurant)
    var restaurant_layout: Node2D = registry_script.scene("arcana_restaurant").instantiate()
    var restaurant_configured: bool = restaurant.configure(restaurant_layout, registry_script.camera_bounds("arcana_restaurant"))
    restaurant_layout.free()
    if not restaurant_configured or not restaurant.apply_approved_rendering() \
            or not _verify_approved_rendering(restaurant.camera, "restaurant"):
        push_error("Packaged restaurant could not align with its authored layout");quit(1);return
    var academy_scene: PackedScene = registry_script.scene("arcana_academy", 1)
    var academy := academy_scene.instantiate() as Node3D if academy_scene != null else null
    if academy == null:
        push_error("Packaged academy did not load the 3D first floor");quit(1);return
    stage.add_child(academy)
    var academy_layout: Dictionary = academy.collect_layout()
    if academy.get_node("Room").scene_file_path != "res://art/source/academy-first-floor-blender/academy-first-floor.glb" \
            or not academy_layout.markers.has("Arrival") or not academy_layout.markers.has("StairArrival") \
            or not academy.configure(null, registry_script.camera_bounds("arcana_academy", 1)) \
            or not academy.apply_approved_rendering() or not _verify_approved_rendering(academy.camera, "academy"):
        push_error("Packaged academy first floor is missing its model or layout");quit(1);return
    stage.free()
    print("ARCANA_WEB_PACK_VERIFIED")
    quit()


func _verify_plaza_entrances(plaza: Node3D) -> bool:
    var ground := plaza.get_node("Ground") as MeshInstance3D
    var plane := ground.mesh as PlaneMesh
    if plane == null or not plane.size.is_equal_approx(Vector2(64, 64)) \
            or not ground.position.is_equal_approx(Vector3(8, 0, -2)):
        push_error("Packaged plaza did not include the approved ground extent")
        return false
    if not _verify_academy_exterior(plaza):
        return false
    var layout_script := load("res://scripts/plaza_3d_game_layout.gd") as Script
    if layout_script == null:
        push_error("Missing packaged plaza layout")
        return false
    var layout := layout_script.new() as Node
    var doors := {}
    for placement in layout.placements():
        if placement.interaction_kind == "building":
            doors[placement.gameplay_id] = placement.interaction_position()
    layout.free()
    for id: String in ["arcana_inn", "arcana_shop", "arcana_home", "arcana_restaurant", "arcana_academy"]:
        if not doors.has(id):
            push_error("Packaged plaza did not register " + id)
            return false
    if not doors.arcana_restaurant.is_equal_approx(layout_script.to_logical(Vector3(-10.5, 0, -10.8))) \
            or not doors.arcana_academy.is_equal_approx(layout_script.to_logical(Vector3(24, 0, -15.3))):
        push_error("Packaged plaza entrances were moved away from the approved thresholds")
        return false
    return true


func _verify_academy_exterior(plaza: Node3D) -> bool:
    var exterior := plaza.get_node_or_null("Academy/Exterior") as Node3D
    if exterior == null or exterior.scene_file_path != "res://art/source/plaza-academy-blender/academy-exterior.glb":
        push_error("Packaged plaza did not instance the Blender academy exterior")
        return false
    var bounds := AABB()
    var local_from_world := exterior.global_transform.affine_inverse()
    for mesh: MeshInstance3D in exterior.find_children("*", "MeshInstance3D", true, false):
        var part := local_from_world * mesh.global_transform * mesh.get_aabb()
        bounds = bounds.merge(part) if bounds.has_volume() else part
    if bounds.size.x < 21.0 or bounds.size.x > 24.05 or bounds.size.y < 10.0 \
            or bounds.end.y > 13.55 or bounds.size.z > 10.05:
        push_error("Packaged Blender academy did not match the approved lot and scale: " + str(bounds))
        return false
    return true


func _verify_approved_rendering(camera: Camera3D, scene_name: String) -> bool:
    if not camera.rotation_degrees.is_equal_approx(Vector3(-30.0, 45.0, 0.0)):
        push_error("Packaged %s did not apply the approved camera angle" % scene_name)
        return false
    var effect := camera.get_node_or_null("TutorialPixelEffect")
    if effect == null:
        push_error("Packaged %s did not attach the approved pixel effect" % scene_name)
        return false
    var effect_stats: Dictionary = effect.get_stats()
    var lighting_stats: Dictionary = effect_stats.get("lighting", {})
    var normals_stats: Dictionary = effect_stats.get("normals", {})
    if not effect_stats.get("effect_enabled", false) \
            or not lighting_stats.get("enabled", false) or lighting_stats.get("converted_surfaces", 0) <= 0 \
            or normals_stats.get("surface_count", 0) <= 0:
        push_error("Packaged %s did not configure the approved lighting and normals passes" % scene_name)
        return false
    return true
