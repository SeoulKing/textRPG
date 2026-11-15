extends SceneTree
## Offline stills from saved native TileMapLayer scenes and the active plaza
## renderer. Does not start main.gd, networking, saves or gameplay input.
const OUTPUT = "res://art/source/walls/assembled-v1/renders/"
const ORIGINAL = "res://scenes/native_2d/wall_assembled_demo.tscn"
const EXPANDED = "res://scenes/native_2d/wall_assembled_expanded_demo.tscn"
var viewport: SubViewport
var stage: Node2D
var camera: Camera2D

func _initialize() -> void:
    call_deferred("capture_all")

func setup(size: Vector2i) -> void:
    viewport=SubViewport.new()
    viewport.size=size
    viewport.disable_3d=true
    viewport.transparent_bg=false
    viewport.render_target_update_mode=SubViewport.UPDATE_ALWAYS
    viewport.canvas_item_default_texture_filter=Viewport.DEFAULT_CANVAS_ITEM_TEXTURE_FILTER_NEAREST
    root.add_child(viewport)
    stage=Node2D.new()
    stage.texture_filter=CanvasItem.TEXTURE_FILTER_NEAREST
    viewport.add_child(stage)
    camera=Camera2D.new()
    stage.add_child(camera)
    camera.make_current()

func clear_stage() -> void:
    if is_instance_valid(viewport):
        viewport.queue_free()
        await process_frame

func save_still(name: String) -> bool:
    for frame in range(5):
        await process_frame
    await RenderingServer.frame_post_draw
    var image: Image=viewport.get_texture().get_image()
    if image==null or image.is_empty():
        push_error("Empty assembled wall render: "+name)
        return false
    var error: Error=image.save_png(OUTPUT+name+".png")
    if error!=OK:
        push_error("Cannot save assembled wall render: "+error_string(error))
        return false
    print("ASSEMBLED_WALL_STILL ",name," ",image.get_size())
    return true

func saved_scene(path: String,size: Vector2i,center: Vector2,zoom: float,name: String) -> bool:
    if not ResourceLoader.exists(path):
        push_error("Missing authored assembled wall scene: "+path)
        return false
    setup(size)
    var layout: Node2D=load(path).instantiate() as Node2D
    stage.add_child(layout)
    for node in layout.find_children("*","Camera2D",true,false):
        node.enabled=false
    # Source layers remain enabled. No runtime bridge is needed for this static
    # composition, so this renders Godot's actual editable native tilemap.
    camera.position=center
    camera.zoom=Vector2.ONE*zoom
    camera.make_current()
    camera.force_update_scroll()
    var result: bool=await save_still(name)
    await clear_stage()
    return result

func actual_plaza() -> bool:
    setup(Vector2i(1024,768))
    var logic: Node2D=load("res://scripts/world.gd").new()
    logic.layout=load("res://scenes/native_2d/plaza.tscn").instantiate()
    logic.enabled=false
    stage.add_child(logic)
    logic.hide()
    logic.set_process(false)
    logic.set_physics_process(false)
    logic.camera.enabled=false
    logic.player_position=Vector2(524,780)
    logic.effects_enabled=false
    var renderer: Node2D=load("res://scripts/native_2d_world.gd").new()
    renderer.world=logic
    stage.add_child(renderer)
    renderer.set_process(false)
    renderer.set_display_size(Vector2(1024,768))
    renderer.set_render_pixel_scale(1.0)
    renderer.previous_player=logic.player_position
    renderer._process(0.0)
    renderer.camera.position=renderer.map_point(logic.player_position)-Vector2(0,96)
    renderer.camera.zoom=Vector2.ONE
    renderer.camera.make_current()
    renderer.camera.force_update_scroll()
    var result: bool=await save_still("actual-plaza")
    await clear_stage()
    return result

func capture_all() -> void:
    root.position=Vector2i(-32000,-32000)
    if DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(OUTPUT))!=OK:
        push_error("Cannot create assembled wall still directory")
        quit(1)
        return
    if not await saved_scene(ORIGINAL,Vector2i(1100,900),Vector2(528,424),1.0,"original"):
        quit(1)
        return
    if not await saved_scene(EXPANDED,Vector2i(1280,900),Vector2(768,504),0.75,"expanded"):
        quit(1)
        return
    if not await actual_plaza():
        quit(1)
        return
    print("ASSEMBLED_WALL_STILLS_COMPLETE")
    quit()

