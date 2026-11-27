extends SceneTree
## Offline art output: no network, combat simulation, or player save writes.
const World=preload("res://scripts/world.gd")
const Renderer=preload("res://scripts/pixel3d_world.gd")
const Charge=preload("res://scripts/fireball_charge.gd")
const Flame=preload("res://scripts/fireball_vfx.gd")
func _initialize() -> void:call_deferred("capture")
func capture() -> void:
    root.position=Vector2i(-32000,-32000)
    var output=SubViewport.new();output.size=Vector2i(768,824);output.disable_3d=true;output.render_target_update_mode=SubViewport.UPDATE_ALWAYS;root.add_child(output)
    var small=SubViewport.new();small.size=Vector2i(384,412);small.render_target_update_mode=SubViewport.UPDATE_ALWAYS;output.add_child(small)
    var present=TextureRect.new();present.texture=small.get_texture();present.size=Vector2(768,824);present.expand_mode=TextureRect.EXPAND_IGNORE_SIZE;present.texture_filter=CanvasItem.TEXTURE_FILTER_NEAREST
    var palette=ShaderMaterial.new();palette.shader=load("res://art/resources/pixel3d_palette.gdshader");palette.set_shader_parameter("palette_lut",load("res://art/export/arcana-palette-lut.png"));present.material=palette;output.add_child(present)
    var entry=load("res://main.tscn").instantiate();var layout=entry.get_node("Plaza");entry.remove_child(layout);entry.free()
    var logic=World.new();logic.layout=layout;small.add_child(logic);logic.hide();logic.set_process(false);logic.set_physics_process(false);logic.enabled=false;logic.camera.enabled=false;logic.player_position=Vector2(36,40.25)*16.0;logic.traveler_position=logic.traveler_home
    var scene=Renderer.new();scene.world=logic;small.add_child(scene);scene.set_process(false);scene.display_height=824;scene.camera_center=scene.map_point(logic.player_position);scene.previous_player=logic.player_position
    var charge=Charge.new();scene.add_child(charge)
    var flame=Flame.new();scene.add_child(flame)
    var directory="D:/BANG/project/textRPG/godot-arcana/art/reference/fireball-cast-v1/"
    DirAccess.make_dir_recursive_absolute(directory)
    for i in range(14):
        var age=float(i)*.05
        var direction=Vector2.RIGHT
        scene.hero.begin_cast(direction);scene.hero.cast_age=age
        charge.visible=age<.464;charge.position=scene.map_point(logic.player_position+direction*7,1.25);charge.update_charge(age,false)
        var distance=maxf(7,(age-.32)*160.0)
        flame.visible=age>=.32;flame.position=scene.map_point(logic.player_position+direction*distance,lerpf(1.25,.6,clampf(distance/48.0,0,1)));flame.direction=Vector3.RIGHT;flame.update_pose(scene.camera,.05,false,false)
        scene._process(0)
        for frame in range(3):await process_frame
        await RenderingServer.frame_post_draw
        output.get_texture().get_image().save_png(directory+"cast-%02d.png"%i)
    charge.hide();flame.hide()
    for d in range(8):
        var yaw=float(d)*TAU/8
        scene.hero.begin_cast(Vector2(sin(yaw),cos(yaw)));scene.hero.cast_age=.35;scene._process(0)
        for frame in range(2):await process_frame
        await RenderingServer.frame_post_draw
        output.get_texture().get_image().save_png(directory+"facing-%d.png"%d)
    print("Saved cast sequence and eight attack facings: ",directory)
    quit()
