extends SceneTree
## Standalone native GPU art capture; no character dependencies or saved game/API calls.
const Fountain = preload("res://scripts/fountain_sprite.gd")
const DIR = "D:/BANG/project/textRPG/godot-arcana/art/reference/fountain/"
func _initialize() -> void:
    call_deferred("capture")
func capture() -> void:
    DirAccess.make_dir_recursive_absolute(DIR)
    root.position = Vector2i(-32000,-32000)
    var output = SubViewport.new()
    output.size = Vector2i(768,768)
    output.disable_3d = true
    output.render_target_update_mode = SubViewport.UPDATE_ALWAYS
    root.add_child(output)
    var small = SubViewport.new()
    small.size = Vector2i(384,384)
    small.render_target_update_mode = SubViewport.UPDATE_ALWAYS
    output.add_child(small)
    var present = TextureRect.new()
    present.texture = small.get_texture()
    present.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
    present.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
    present.size = Vector2(768,768)
    var palette = ShaderMaterial.new()
    palette.shader = load("res://art/resources/pixel3d_palette.gdshader")
    palette.set_shader_parameter("palette_lut",load("res://art/export/arcana-palette-lut.png"))
    present.material = palette
    output.add_child(present)
    var scene = Node3D.new()
    small.add_child(scene)
    var camera = Camera3D.new()
    camera.projection = Camera3D.PROJECTION_ORTHOGONAL
    camera.keep_aspect = Camera3D.KEEP_WIDTH
    camera.size = 6.0
    camera.far = 300.0
    scene.add_child(camera)
    var target = Vector3(0,1.624,0)
    camera.position = target+Vector3(0,20,20)
    camera.look_at(target)
    var environment = WorldEnvironment.new()
    environment.environment = Environment.new()
    environment.environment.background_mode = Environment.BG_COLOR
    environment.environment.background_color = Color("718399")
    scene.add_child(environment)
    var fountain = Fountain.new()
    scene.add_child(fountain)
    for f in range(16):
        fountain.sync_water(float(f)/12.0,true)
        assert(fountain.water_frame==f,"Fountain frame must follow world clock")
        assert(fountain.sprite_material.get_shader_parameter("frame_cell")==fountain.fade_material.get_shader_parameter("frame_cell"),"Opaque/fade frames must match")
        for i in range(2): await process_frame
        await RenderingServer.frame_post_draw
        output.get_texture().get_image().save_png(DIR+"asset-flow-%02d.png"%f)
    fountain.sync_water(1.0,false)
    assert(fountain.water_frame==0,"Effects off must freeze water")
    print("FOUNTAIN_GPU_OK: 16 animated frames; opaque/fade synchronized; effects-off frame 0")
    quit()
