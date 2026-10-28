extends SceneTree
func _initialize() -> void:call_deferred("refine")
func refine() -> void:
    var source="D:/BANG/project/textRPG/godot-arcana/art/source/heroine/motion-v2/"
    var audit=JSON.parse_string(FileAccess.get_file_as_string(source+"gait-audit.json"))
    var manifest=JSON.parse_string(FileAccess.get_file_as_string(source+"motion.json"))
    var changes=[]
    for clip in manifest.clips:
        var file=source+"pixelpen/"+clip.name+".pxpen"
        var project=ProjectPacker.load_project(file)
        if project==null:push_error("Cannot open "+file);quit(1);return
        PixelPen.state.current_project=project
        for record in audit:
            if record.clip!=clip.name:continue
            var layer=project.animation_timeline[int(record.frame)].frame.layers[0]
            for leg in record.legs:
                var x=int(round(float(leg.knee[0])))-1
                var y=int(round(float(leg.knee[1])))
                if x<0 or x>=96 or y<92 or y>=128:continue
                var previous=layer.get_index_on_color_map(x,y)
                if previous==0:continue
                # A small painted knee highlight follows the fixed joint, not the boot.
                var shade=4 if int(leg.leg)==0 else 5
                if previous==shade:continue
                layer.set_index_on_color_map(x,y,shade)
                changes.append({"clip":clip.name,"frame":record.frame,"pixel":[x,y],"before":previous,"after":shade})
        var error=ProjectPacker.save(project,file)
        if error!=OK:push_error("Cannot save "+file);quit(1);return
        PixelPen.state.current_project=null
    var file=FileAccess.open(source+"pixel-corrections.json",FileAccess.WRITE)
    file.store_string(JSON.stringify(changes,"  "));file.close()
    print("PixelPen native refinement saved: ",changes.size()," indexed joint pixels / ",manifest.clips.size()," clips")
    PixelPen.state.free();PixelPen.state=null
    quit()
