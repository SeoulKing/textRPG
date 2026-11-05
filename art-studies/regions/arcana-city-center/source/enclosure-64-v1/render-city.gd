extends SceneTree
var viewport: SubViewport
var renderer: Node2D
func _initialize() -> void: call_deferred("capture")
func capture() -> void:
    root.position=Vector2i(-32000,-32000)
    viewport=SubViewport.new()
    viewport.size=Vector2i(1100,1100)
    viewport.disable_3d=true
    viewport.render_target_update_mode=SubViewport.UPDATE_ALWAYS
    viewport.canvas_item_default_texture_filter=Viewport.DEFAULT_CANVAS_ITEM_TEXTURE_FILTER_NEAREST
    root.add_child(viewport)
    var stage=Node2D.new()
    viewport.add_child(stage)
    var logic=load("res://scripts/world.gd").new()
    logic.layout=load("res://scenes/native_2d/plaza.tscn").instantiate()
    logic.enabled=false
    stage.add_child(logic)
    logic.hide();logic.set_process(false);logic.set_physics_process(false);logic.camera.enabled=false
    logic.effects_enabled=false
    renderer=load("res://scripts/native_2d_world.gd").new()
    renderer.world=logic
    stage.add_child(renderer)
    renderer.set_process(false)
    renderer.set_display_size(Vector2(1100,1100))
    renderer.set_render_pixel_scale(1.0)
    renderer._process(0.0)
    renderer.camera.position=Vector2(2048,2048)
    renderer.camera.zoom=Vector2.ONE*.25
    renderer.camera.force_update_scroll()
    await save_still("city-overview")
    viewport.size=Vector2i(1100,640)
    renderer.camera.position=Vector2(2304,3912)
    renderer.camera.zoom=Vector2.ONE
    renderer.camera.force_update_scroll()
    await save_still("south-gate")
    quit()
func save_still(name: String) -> void:
    for frame in range(5): await process_frame
    await RenderingServer.frame_post_draw
    var output=OS.get_environment("ARCANA_CITY_STILLS")+"/"+name+".png"
    viewport.get_texture().get_image().save_png(output)
    print("CITY_STILL ",output)