extends SceneTree
const Rig=preload("res://scripts/heroine_skeleton.gd")
const DEST="res://art/source/heroine/skeletal/bake/"
var viewport:SubViewport
var instance_serial = 0
func _initialize() -> void:call_deferred("bake")
func bake() -> void:
    DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(DEST))
    DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(Rig.SOURCE+"scenes/"))
    root.position=Vector2i(-32000,-32000)
    viewport=SubViewport.new();viewport.size=Vector2i(96*Rig.LAYERS.size(),136);viewport.transparent_bg=true
    viewport.disable_3d=true;viewport.render_target_update_mode=SubViewport.UPDATE_ALWAYS;root.add_child(viewport)
    var atlases={}
    for layer in Rig.LAYERS:atlases[layer]=Image.create(1536,2448,false,Image.FORMAT_RGBA8)
    var turns={}
    for layer in Rig.LAYERS:turns[layer]=Image.create(1536,544,false,Image.FORMAT_RGBA8)
    for d in range(8):
        var rigs=[]
        for c in range(Rig.LAYERS.size()):
            var rig=make_rig(d);rig.position=Vector2(c*96,0);rig.set_layer(Rig.LAYERS[c]);rigs.append(rig)
        var author=make_rig(d)
        viewport.remove_child(author)
        author.name="HeroineSkeleton"
        var packed=PackedScene.new();packed.pack(author)
        var path=Rig.SOURCE+"scenes/rig-"+Rig.DIRS[d]+".tscn"
        ResourceSaver.save(packed,path.replace(".tscn",".generated.tscn"))
        if not FileAccess.file_exists(path) or not format_current() or author.upgraded:ResourceSaver.save(packed,path)
        author.free()
        for f in range(36):
            var clip="idle" if f<4 else "walk" if f<28 else "stop_left" if f<32 else "stop_right"
            var cf=f if f<4 else f-4 if f<28 else f-28 if f<32 else f-32
            for rig in rigs:rig.seek_pose(clip,cf)
            await process_frame;await process_frame;await RenderingServer.frame_post_draw
            var shot=viewport.get_texture().get_image()
            var index=d*36+f
            for c in range(Rig.LAYERS.size()):atlases[Rig.LAYERS[c]].blit_rect(shot,Rect2i(c*96,0,96,136),Vector2i(index%16*96,int(index/16)*136))
        for sign_index in range(2):
            for f in range(4):
                for rig in rigs:rig.seek_pose("turn_left" if sign_index==0 else "turn_right",f)
                await process_frame;await process_frame;await RenderingServer.frame_post_draw
                var shot=viewport.get_texture().get_image()
                var index=d*8+sign_index*4+f
                for c in range(Rig.LAYERS.size()):turns[Rig.LAYERS[c]].blit_rect(shot,Rect2i(c*96,0,96,136),Vector2i(index%16*96,int(index/16)*136))
        for rig in rigs:rig.free()
        print("Skeleton baked direction "+str(d))
    for layer in Rig.LAYERS:atlases[layer].save_png(DEST+"hero-"+layer+".png")
    for layer in Rig.LAYERS:turns[layer].save_png(DEST+"turn-hero-"+layer+".png")
    var stamp=FileAccess.open(Rig.SOURCE+"rig-format.json",FileAccess.WRITE)
    stamp.store_string("{\"version\":2}\n");stamp.close()
    print("Native Skeleton2D bake complete")
    quit()

func make_rig(d: int) -> Node2D:
    var path=Rig.SOURCE+"scenes/rig-"+Rig.DIRS[d]+".tscn"
    var rig:Node2D
    if FileAccess.file_exists(path) and format_current():
        rig=ResourceLoader.load(path,"PackedScene",ResourceLoader.CACHE_MODE_IGNORE).instantiate()
        instance_serial+=1;rig.name="BakeRig"+str(instance_serial)
        viewport.add_child(rig);rig.adopt_scene(d)
    else:
        rig=Rig.new();instance_serial+=1;rig.name="BakeRig"+str(instance_serial);viewport.add_child(rig);rig.build(d)
    return rig

func format_current() -> bool:
    if not FileAccess.file_exists(Rig.SOURCE+"rig-format.json"):return false
    return JSON.parse_string(FileAccess.get_file_as_string(Rig.SOURCE+"rig-format.json")).get("version",0)==2
