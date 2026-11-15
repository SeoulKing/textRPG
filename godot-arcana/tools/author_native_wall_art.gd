extends SceneTree
const BASE = "res://art/source/walls/native-v4/"
func _initialize() -> void: call_deferred("author")
func author() -> void:
    var target: String = BASE+"wall-kit.pxpen"
    var project: PixelPenProject
    var corrections: int = 0
    if FileAccess.file_exists(target):
        project=ProjectPacker.load_project(target)
    else:
        var source: Image = Image.load_from_file(BASE+"wall-atlas-prepared.png")
        if source==null: quit(1);return
        project=PixelPenProject.new()
        project.initialized(source.get_size(),"Arcana wall v4 - 12px thin perimeter")
        var palette: PackedColorArray=PackedColorArray([Color.TRANSPARENT])
        var indices: Dictionary={}
        for y in range(source.get_height()):
            for x in range(source.get_width()):
                var c: Color=source.get_pixel(x,y)
                if c.a<0.5: continue
                var key: int=c.to_rgba32()
                if not indices.has(key):
                    indices[key]=palette.size();palette.append(c)
        project.palette.color_index=palette
        var layer: IndexedColorImage=project.active_frame.layers[0]
        layer.label="Stone wall, narrow cap, consistent crenellations"
        for y in range(source.get_height()):
            for x in range(source.get_width()):
                var c: Color=source.get_pixel(x,y)
                layer.set_index_on_color_map(x,y,0 if c.a<0.5 else indices[c.to_rgba32()])
        # Only low-contrast isolated face pixels; silhouette and all joins locked.
        for y in range(80,source.get_height()-1):
            for x in range(1,source.get_width()-1):
                if x%64<3 or x%64>60 or y%256<80: continue
                var c: Color=source.get_pixel(x,y)
                var n: Color=source.get_pixel(x-1,y)
                if c.a<0.5 or n.a<0.5 or c==n: continue
                if source.get_pixel(x+1,y)!=n or source.get_pixel(x,y-1)!=n or source.get_pixel(x,y+1)!=n: continue
                if absf(c.r-n.r)+absf(c.g-n.g)+absf(c.b-n.b)<0.18:
                    layer.set_index_on_color_map(x,y,indices[n.to_rgba32()]);corrections+=1
        project.file_path=target
        if ProjectPacker.save(project,target)!=OK: quit(1);return
        project=ProjectPacker.load_project(target)
    if project==null: quit(1);return
    var frame: Frame=project.animation_timeline[0].frame
    var image: Image=project.get_layer_image(frame.layers[0].layer_uid)
    image.convert(Image.FORMAT_RGBA8)
    print("WALL_ALPHA: palette0=",project.palette.color_index[0],"; pixel0=",image.get_pixel(0,0))
    if image.save_png(BASE+"wall-atlas.png")!=OK: quit(1);return
    print("WALL_ART_V4_PIXELPEN saved/reopened/exported; face pixel corrections=",corrections)
    project=null
    if PixelPen.state!=null:
        PixelPen.state.free();PixelPen.state=null
    quit()

