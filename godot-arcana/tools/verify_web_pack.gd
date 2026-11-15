extends SceneTree
## Load only the exported archive, with no source-project fallback.
func _initialize() -> void:call_deferred("verify_pack")
func verify_pack() -> void:
    var args=OS.get_cmdline_user_args()
    if args.is_empty() or not ProjectSettings.load_resource_pack(args[0]):
        push_error("Cannot mount exported game archive");quit(1);return
    print("ARCANA_WEB_PACK_MOUNTED")
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
    stage.add_child(shop)
    var shop_geometry: Node3D = shop.get_node("Geometry")
    if not shop_geometry.authored_scene_active or shop_geometry.astra_active:
        push_error("Packaged shop did not load the previous Blender room");quit(1);return
    var crate := shop_geometry.find_child("WoodenCrate_Test", true, false)
    if crate == null or not crate.has_node("CratePixelModel"):
        push_error("Packaged shop did not load the Blender pixel crate");quit(1);return
    var merchant := shop.get_node("Actors/Merchant") as Sprite3D
    if merchant.billboard != BaseMaterial3D.BILLBOARD_DISABLED:
        push_error("Packaged shop actors did not use upright depth");quit(1);return
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
    stage.free()
    print("ARCANA_WEB_PACK_VERIFIED")
    quit()
