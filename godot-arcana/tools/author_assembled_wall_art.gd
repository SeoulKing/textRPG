extends SceneTree
const BASE = "res://art/source/walls/assembled-v1/"
func _initialize() -> void: call_deferred("author")
func author() -> void:
    var path: String=BASE+"wall-kit-final.pxpen"
    var project: PixelPenProject
    var corrections: int=0
    if FileAccess.file_exists(path):
        project=ProjectPacker.load_project(path)
    else:
        var image: Image=Image.load_from_file(BASE+"atlas-prepared.png")
        if image==null: quit(1);return
        project=PixelPenProject.new()
        project.initialized(image.get_size(),"Approved whole enclosure - extracted modular wall")
        var palette: PackedColorArray=PackedColorArray([Color.TRANSPARENT])
        var indices: Dictionary={}
        for y in range(image.get_height()):
            for x in range(image.get_width()):
                var c: Color=image.get_pixel(x,y)
                if c.a<0.5: continue
                var key: int=c.to_rgba32()
                if not indices.has(key): indices[key]=palette.size();palette.append(c)
        project.palette.color_index=palette
        var layer: IndexedColorImage=project.active_frame.layers[0]
        layer.label="Approved exact cuts + normalized repeat seams"
        for y in range(image.get_height()):
            for x in range(image.get_width()):
                var c: Color=image.get_pixel(x,y)
                layer.set_index_on_color_map(x,y,0 if c.a<0.5 else indices[c.to_rgba32()])
        var manifest: Dictionary=JSON.parse_string(FileAccess.get_file_as_string(BASE+"manifest.json"))
        for part in manifest.parts:
            if not part.get("repeat",false): continue
            var ax: int=int(part.atlas[0])*16
            var ay: int=int(part.atlas[1])*16
            var w: int=int(part.atlasSize[0])*16
            var h: int=int(part.atlasSize[1])*16
            if part.id=="north_repeat":
                # Two full matching piers overlap by 64px when extended.
                for yy in range(h):
                    for xx in range(64):
                        var c: Color=image.get_pixel(ax+xx,ay+yy)
                        layer.set_index_on_color_map(ax+w-64+xx,ay+yy,0 if c.a<0.5 else indices[c.to_rgba32()])
                        corrections+=1
                continue
            var vertical: bool=str(part.id).begins_with("left_") or str(part.id).begins_with("right_")
            var band: int=6
            var line: int=64 if vertical else 0
            var outer: int=w if vertical else h
            for i in range(outer):
                for j in range(band):
                    for edge in range(2):
                        var tx: int=ax+i if vertical else ax+(w-band+j if edge==0 else j)
                        var ty: int=ay+(h-band+j if edge==0 else j) if vertical else ay+i
                        var sx: int=ax+i if vertical else ax+line+edge*band+j
                        var sy: int=ay+line+edge*band+j if vertical else ay+i
                        var c: Color=image.get_pixel(sx,sy)
                        layer.set_index_on_color_map(tx,ty,0 if c.a<0.5 else indices[c.to_rgba32()])
                        corrections+=1
        # Remove sliver crenels left at cropped repeat seams; original artwork
        # pieces stay untouched. Full crenels are much wider than five pixels.
        for part in manifest.parts:
            if not part.get("repeat",false) or not str(part.id).begins_with("front_"): continue
            var ax: int=int(part.atlas[0])*16
            var ay: int=int(part.atlas[1])*16
            var w: int=int(part.atlasSize[0])*16
            for yy in range(50):
                var xx: int=0
                while xx<w:
                    if layer.colormap.get_pixel(ax+xx,ay+yy).r8==0: xx+=1;continue
                    var first: int=xx
                    while xx<w and layer.colormap.get_pixel(ax+xx,ay+yy).r8!=0: xx+=1
                    if xx-first<=5 and (first<16 or xx>w-16):
                        for clear_x in range(first,xx):
                            layer.set_index_on_color_map(ax+clear_x,ay+yy,0);corrections+=1
        project.file_path=path
        if ProjectPacker.save(project,path)!=OK: quit(1);return
        project=ProjectPacker.load_project(path)
    if project==null: quit(1);return
    var frame: Frame=project.animation_timeline[0].frame
    var output: Image=project.get_layer_image(frame.layers[0].layer_uid)
    output.convert(Image.FORMAT_RGBA8)
    if output.get_pixel(0,0).a!=0.0: push_error("Lost atlas alpha");quit(1);return
    if output.save_png(BASE+"atlas.png")!=OK: quit(1);return
    print("ASSEMBLED_WALL_PIXELPEN saved/reopened/exported; repeat seam pixels=",corrections)
    project=null
    if PixelPen.state!=null: PixelPen.state.free();PixelPen.state=null
    quit()

