extends SceneTree
const Mei = preload("res://scripts/mei_sprite.gd")
var output = ""
func _initialize() -> void:
    call_deferred("run")
func run() -> void:
    root.position = Vector2i(-32000,-32000)
    output = OS.get_cmdline_user_args()[0]
    DirAccess.make_dir_recursive_absolute(output)
    var viewport = SubViewport.new()
    viewport.size = Vector2i(192,272)
    viewport.transparent_bg = true
    viewport.own_world_3d = true
    viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
    root.add_child(viewport)
    var camera = Camera3D.new()
    camera.projection = Camera3D.PROJECTION_ORTHOGONAL
    camera.size = 2.125
    camera.near = .1
    camera.far = 250
    viewport.add_child(camera)
    camera.position = Vector3(0,10,10)
    camera.look_at(Vector3(0,.75,0))
    var mei = Mei.new()
    viewport.add_child(mei)
    var report: Array[Dictionary] = []
    for tick in range(96):
        mei.sync_idle((float(tick)+.1)/12.0,true)
        await process_frame
        await RenderingServer.frame_post_draw
        var image = viewport.get_texture().get_image()
        var visible = 0
        for y in range(image.get_height()):
            for x in range(image.get_width()):
                if image.get_pixel(x,y).a>.9: visible += 1
        report.append({"tick":tick,"cell":str(mei.current_cell),"opaquePixels":visible})
        if visible<100:
            push_error("Mei missing at tick %d"%tick)
            quit(1)
            return
        image.save_png(output+"/tick-%02d.png"%tick)
    mei.sync_idle(8.01,true)
    await process_frame
    await RenderingServer.frame_post_draw
    var wrapped = viewport.get_texture().get_image()
    wrapped.save_png(output+"/loop-start.png")
    mei.sync_idle(3.0,false)
    await process_frame
    await RenderingServer.frame_post_draw
    viewport.get_texture().get_image().save_png(output+"/reduced-motion.png")
    var file = FileAccess.open(output+"/gpu-audit.json",FileAccess.WRITE)
    file.store_string(JSON.stringify(report,"  "))
    file.close()
    print("MEI_GPU_AUDIT: all 96 cells rendered; loop and reduced-motion captured")
    quit()
