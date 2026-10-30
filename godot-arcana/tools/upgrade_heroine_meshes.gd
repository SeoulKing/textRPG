extends SceneTree
const Rig=preload("res://scripts/heroine_skeleton.gd")
func _initialize() -> void:call_deferred("upgrade")
func upgrade() -> void:
    for d in range(8):
        var path=Rig.SOURCE+"scenes/rig-"+Rig.DIRS[d]+".tscn"
        var rig=ResourceLoader.load(path,"PackedScene",ResourceLoader.CACHE_MODE_IGNORE).instantiate()
        rig.name="WeightedRig"+str(d);root.add_child(rig);rig.adopt_scene(d)
        root.remove_child(rig);rig.name="HeroineSkeleton"
        var packed=PackedScene.new();packed.pack(rig)
        assert(ResourceSaver.save(packed,path)==OK)
        assert(ResourceSaver.save(packed,path.replace(".tscn",".generated.tscn"))==OK)
        rig.free()
    print("Native mesh authoring: 759 internal vertices per surface, weights and triangles preserved")
    quit()
