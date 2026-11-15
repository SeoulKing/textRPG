extends SceneTree
## Artwork export only; no game scene, API, save, input or browser session.
const Prop = preload("res://scripts/illustrated_prop.gd")
var view: SubViewport
func _initialize() -> void:
    call_deferred("run")
func add_art(file: String,size: Vector2i,foot: Vector2,at: Vector3) -> void:
    var prop = Prop.new()
    prop.asset = ImageTexture.create_from_image(Image.load_from_file(file))
    prop.pixel_size = size
    prop.foot = foot
    prop.shadow_size = Vector2.ZERO
    prop.position = at
    view.add_child(prop)
    prop.set_process(false)
    prop.sprite_material.set_shader_parameter("editor_preview",true)
func run() -> void:
    root.position = Vector2i(-32000,-32000)
    view = SubViewport.new()
    view.size = Vector2i(384,352)
    view.own_world_3d = true
    view.render_target_update_mode = SubViewport.UPDATE_ALWAYS
    root.add_child(view)
    var environment := WorldEnvironment.new()
    environment.environment = Environment.new()
    environment.environment.background_mode = Environment.BG_COLOR
    environment.environment.background_color = Color("34414c")
    view.add_child(environment)
    var camera := Camera3D.new()
    camera.projection = Camera3D.PROJECTION_ORTHOGONAL
    camera.size = 5.5
    camera.position = Vector3(0.7,12.9,10.6)
    view.add_child(camera)
    camera.look_at(Vector3(0.7,.9,-1.4))
    add_art("res://art/export/bed-stardew-v1/bed.png",Vector2i(176,272),Vector2(88,250),Vector3.ZERO)
    # Fixed 320x180 authoring capture; floor projects to (160,152).
    add_art("res://art/characters/hybrid-v1/assembly/review/neutral/s.png",Vector2i(320,180),Vector2(160,152),Vector3(2,0,-.15))
    for i in range(4): await process_frame
    await RenderingServer.frame_post_draw
    var picture := view.get_texture().get_image()
    picture.resize(768,704,Image.INTERPOLATE_NEAREST)
    var error := picture.save_png("res://art/source/props/bed-stardew-v1/scale-comparison.png")
    if error!=OK:
        push_error("Bed comparison PNG save failed")
        quit(1)
        return
    print("BED_ART_EXPORT camera yaw=0 pitch=45, source density 64px/world unit, bed+Hybrid version 1")
    quit()
