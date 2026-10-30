extends SceneTree
var viewport: SubViewport
var world: Node2D
var renderer: Node2D
func _initialize() -> void:call_deferred("run")
func run() -> void:
    root.position=Vector2i(-32000,-32000)
    viewport=SubViewport.new();viewport.size=Vector2i(384,824);viewport.disable_3d=true
    viewport.render_target_update_mode=SubViewport.UPDATE_ALWAYS
    viewport.canvas_item_default_texture_filter=Viewport.DEFAULT_CANVAS_ITEM_TEXTURE_FILTER_NEAREST
    root.add_child(viewport)
    world=load("res://scripts/world.gd").new()
    world.layout=load("res://scenes/native_2d/plaza.tscn").instantiate()
    viewport.add_child(world);world.hide();world.camera.enabled=false
    renderer=load("res://scripts/native_2d_world.gd").new();renderer.world=world
    viewport.add_child(renderer);renderer.set_display_size(Vector2(384,824));renderer.set_render_pixel_scale(1.0)
    var folder="res://../.runtime/godot/native-2d-review"
    DirAccess.make_dir_recursive_absolute(folder)
    for entry in [{"name":"city","id":"","floor":1,"at":Vector2(576,500)}, {"name":"shop","id":"arcana_shop","floor":1,"at":Vector2(192,150)}, {"name":"inn","id":"arcana_inn","floor":1,"at":Vector2(192,185)}, {"name":"academy-first","id":"arcana_academy","floor":1,"at":Vector2(192,260)}, {"name":"academy-second","id":"arcana_academy","floor":2,"at":Vector2(192,176)}, {"name":"restaurant","id":"arcana_restaurant","floor":1,"at":Vector2(192,200)}]:
        world.change_interior(entry.id)
        world.academy_floor=entry.floor
        world.player_position=entry.at;world.enabled=false
        for frame in range(6):await process_frame
        await RenderingServer.frame_post_draw
        var image=viewport.get_texture().get_image()
        if image==null or image.is_empty():push_error("Empty render: "+entry.name);quit(1);return
        var nodes3d=viewport.find_children("*","Node3D",true,false).size()
        if nodes3d!=0:push_error("3D render nodes remain: "+entry.name);quit(1);return
        image.save_png(folder.path_join(entry.name+".png"))
        print("NATIVE_2D_REVIEW ",entry.name," image=",image.get_size()," nodes3d=",nodes3d)
    viewport.queue_free();await process_frame;quit()
