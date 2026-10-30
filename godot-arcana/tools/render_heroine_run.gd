extends SceneTree
# Offline art output only: disable gameplay, server calls, and save writes.
const World=preload("res://scripts/world.gd")
const Renderer=preload("res://scripts/pixel3d_world.gd")
func _initialize() -> void:call_deferred("capture")
func capture() -> void:
    root.position=Vector2i(-32000,-32000)
    var output=SubViewport.new();output.size=Vector2i(768,824);output.disable_3d=true;output.render_target_update_mode=SubViewport.UPDATE_ALWAYS;root.add_child(output)
    var small=SubViewport.new();small.size=Vector2i(384,412);small.render_target_update_mode=SubViewport.UPDATE_ALWAYS;output.add_child(small)
    var present=TextureRect.new();present.texture=small.get_texture();present.size=Vector2(768,824);present.expand_mode=TextureRect.EXPAND_IGNORE_SIZE;present.texture_filter=CanvasItem.TEXTURE_FILTER_NEAREST
    var palette=ShaderMaterial.new();palette.shader=load("res://art/resources/pixel3d_palette.gdshader");palette.set_shader_parameter("palette_lut",load("res://art/export/arcana-palette-lut.png"));present.material=palette;output.add_child(present)
    var entry=load("res://main.tscn").instantiate();var layout=entry.get_node("Plaza");entry.remove_child(layout);entry.free()
    var logic=World.new();logic.layout=layout;small.add_child(logic);logic.hide();logic.set_process(false);logic.set_physics_process(false);logic.enabled=false;logic.effects_enabled=false;logic.camera.enabled=false;logic.player_position=Vector2(36,40.25)*16.0;logic.traveler_position=logic.traveler_home
    var scene=Renderer.new();scene.world=logic;small.add_child(scene);scene.set_process(false);scene.display_height=824;scene.camera_center=scene.map_point(logic.player_position);scene.previous_player=logic.player_position;scene._process(0)
    scene.hero.set_preview_pose(0,"run",2);scene.hero.pose(0,0,false,Vector2.ZERO,true,false)
    for i in range(4):await process_frame
    await RenderingServer.frame_post_draw
    var output_path="res://art/reference/heroine-run-v1/"
    DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output_path))
    var error=output.get_texture().get_image().save_png(output_path+"game-scene.png")
    scene.hero.hide()
    for i in range(3):await process_frame
    await RenderingServer.frame_post_draw
    output.get_texture().get_image().save_png(output_path+"scene-without-hero.png")
    print("Heroine run art output: ",error_string(error))
    quit(0 if error==OK else 1)
