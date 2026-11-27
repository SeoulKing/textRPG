extends SceneTree
func _initialize() -> void:call_deferred("run")
func run() -> void:
    var folder="res://art/export/native-2d/"
    for file in DirAccess.get_files_at(folder):
        if file.ends_with(".res"):
            var resource=load(folder+file)
            var error=ResourceSaver.save(resource,folder+file,ResourceSaver.FLAG_COMPRESS)
            if error!=OK:push_error("Native image compression failed: "+file);quit(1);return
    print("Native 2D image resources compressed")
    quit()
