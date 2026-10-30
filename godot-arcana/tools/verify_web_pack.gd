extends SceneTree
## Load only the exported archive, with no source-project fallback.
func _initialize() -> void:call_deferred("verify_pack")
func verify_pack() -> void:
    var args=OS.get_cmdline_user_args()
    if args.is_empty() or not ProjectSettings.load_resource_pack(args[0]):
        push_error("Cannot mount exported game archive");quit(1);return
    print("ARCANA_WEB_PACK_MOUNTED")
    for path in ["res://scripts/main.gd","res://scripts/world.gd","res://scripts/native_2d_world.gd","res://scripts/native_2d_hero.gd","res://scripts/native_2d_spatial.gd","res://scripts/native_2d_presence.gd","res://scripts/game_ui.gd"]:
        print("PACK_SCRIPT ",path)
        var script=load(path) as Script
        if script==null or not script.can_instantiate():
            push_error("Missing or invalid packaged script: "+path);quit(1);return
    for path in ["res://scenes/native_2d/plaza.tscn","res://scenes/native_2d/inn_lobby.tscn","res://scenes/native_2d/academy_first_floor.tscn","res://scenes/native_2d/academy_second_floor.tscn","res://scenes/native_2d/restaurant.tscn","res://scenes/shop_2d.tscn"]:
        var scene=load(path) as PackedScene
        if scene==null or not scene.can_instantiate():
            push_error("Missing or invalid packaged scene: "+path);quit(1);return
    print("ARCANA_WEB_PACK_VERIFIED")
    quit()
