extends SceneTree
## Hand-authored indexed PixelPen sprite; no image sampling or resizing into source.
var project: PixelPenProject
var layer: IndexedColorImage
var palette = ["#551325", "#861927", "#b72320", "#e33c13", "#f65d0e", "#ff8511", "#ffaa16", "#ffd32a", "#fff057", "#fff8a0", "#ffffe5", "#ffffff"]
func _initialize() -> void: call_deferred("run")
func dot(x:int,y:int,c:int) -> void:
    if x>=8 and x<56 and y>=8 and y<56:layer.set_index_on_color_map(x,y,c)
func poly(points:Array,c:int) -> void:
    var p=PackedVector2Array()
    for v in points:p.append(Vector2(v[0],v[1]))
    for y in range(8,56):
        for x in range(8,56):
            if Geometry2D.is_point_in_polygon(Vector2(x+0.5,y+0.5),p):dot(x,y,c)
func oval(cx:float,cy:float,rx:float,ry:float,c:int) -> void:
    for y in range(8,56):
        for x in range(8,56):
            if pow((x+0.5-cx)/rx,2)+pow((y+0.5-cy)/ry,2)<=1:dot(x,y,c)
func run() -> void:
    project=PixelPenProject.new()
    project.initialized(Vector2i(64,64),"Fireball - approved concept hand-pixelled")
    PixelPen.state.current_project=project
    var colors=PackedColorArray([Color.TRANSPARENT])
    for hex in palette:colors.append(Color(hex))
    project.palette.color_index=colors
    layer=project.active_frame.layers[0]
    layer.label="Fireball - 12-color pixel clusters"
    # Three unequal flame tongues flow into the round orb.
    poly([[8,8],[14,9],[16,12],[22,15],[26,20],[33,24],[39,25],[44,29],[48,35],[40,43],[30,36],[26,31],[22,28],[20,23],[16,21],[13,17],[12,13]],1)
    poly([[10,9],[15,11],[17,14],[23,17],[26,22],[33,26],[39,28],[44,33],[41,38],[33,35],[28,30],[24,27],[22,23],[17,21],[15,17],[14,13]],3)
    poly([[14,12],[19,16],[23,18],[26,23],[32,27],[38,30],[40,34],[35,33],[29,29],[25,26],[23,22],[19,20],[18,17]],5)
    poly([[18,17],[23,20],[25,24],[30,27],[34,30],[29,28],[24,25],[22,22]],8)
    poly([[11,24],[14,27],[18,27],[22,30],[28,32],[35,37],[34,44],[27,43],[22,39],[19,37],[17,33],[14,31]],2)
    poly([[13,27],[18,29],[21,33],[27,34],[32,38],[31,42],[26,40],[23,37],[19,35],[18,32],[15,31]],5)
    poly([[16,30],[21,34],[27,36],[29,39],[24,37],[20,35]],8)
    poly([[31,17],[35,19],[38,23],[43,25],[46,30],[49,34],[43,38],[37,32],[35,28],[35,23]],2)
    poly([[34,21],[37,24],[42,27],[44,31],[46,34],[42,34],[39,30],[38,27]],5)
    poly([[36,24],[40,28],[41,31],[39,30]],8)
    # Round high-energy core, stepped nested lobes.
    oval(39,39,16,16,1)
    poly([[47,31],[50,29],[50,35],[54,34],[53,39],[55,38],[55,45],[52,49],[48,53],[41,55],[34,54],[29,51],[25,47],[23,41],[24,35],[27,32],[27,28],[33,31],[39,28],[45,30]],2)
    oval(39,39,14.5,14.5,3)
    poly([[29,31],[33,32],[34,28],[38,31],[43,30],[46,33],[49,32],[49,38],[52,38],[51,44],[48,48],[44,51],[38,53],[33,51],[29,48],[27,43],[26,38]],4)
    oval(39,40,12,12.5,5)
    poly([[29,34],[34,36],[34,32],[39,34],[42,32],[45,36],[48,37],[47,42],[49,44],[45,48],[41,51],[36,49],[33,48],[30,43],[31,39]],6)
    oval(40,41,9.5,10,7)
    poly([[34,34],[37,37],[39,35],[41,38],[45,37],[47,41],[45,45],[46,47],[41,50],[37,48],[34,48],[32,43],[34,40]],8)
    # Yellow and white tongues curl over the core, not a smooth gradient.
    poly([[32,35],[35,39],[34,42],[36,45],[39,46],[37,43],[39,40],[38,37],[41,39],[42,42],[45,41],[46,44],[44,47],[41,49],[38,48],[35,46],[33,43],[33,39]],9)
    poly([[38,38],[40,40],[40,43],[43,43],[44,46],[41,48],[38,46],[39,44],[37,42]],10)
    poly([[39,41],[41,43],[42,43],[43,46],[40,47],[39,45]],12)
    poly([[29,39],[31,41],[30,44],[32,47],[35,49],[33,49],[30,47],[28,43]],8)
    poly([[43,33],[46,35],[48,39],[47,41],[45,38],[44,37]],9)
    poly([[44,35],[46,37],[46,39],[45,38]],11)
    poly([[38,50],[42,51],[47,48],[45,51],[41,53],[36,52]],7)
    poly([[27,34],[28,36],[27,39],[26,37]],6)
    # Broken hotter chips and embers keep the palette clustered.
    poly([[29,30],[31,31],[32,34],[30,34]],9)
    poly([[34,36],[36,37],[36,39],[35,38]],11)
    poly([[46,45],[47,44],[47,46],[46,47]],11)
    poly([[22,12],[25,13],[26,16],[23,16]],3)
    poly([[23,13],[25,14],[25,15],[24,15]],8)
    poly([[9,18],[12,19],[13,22],[11,23],[9,21]],3)
    dot(11,20,8);dot(11,21,6)
    poly([[16,37],[18,38],[19,41],[17,41],[16,39]],3)
    dot(17,39,8)
    poly([[26,19],[28,20],[29,23],[27,22]],4)
    dot(27,20,9)
    var base="res://art/source/spells/fireball-thumbnail-v2/"
    var path=base+"fireball.pxpen"
    project.file_path=path
    if ProjectPacker.save(project,path)!=OK:quit(1);return
    project=ProjectPacker.load_project(path)
    var image=project.get_image(project.animation_timeline[0].frame)
    image.convert(Image.FORMAT_RGBA8)
    if image.save_png(base+"fireball.png")!=OK:quit(2);return
    image.resize(512,512,Image.INTERPOLATE_NEAREST)
    image.save_png(base+"fireball-preview.png")
    print("NATIVE_PIXELPEN_FIREBALL: saved and reloaded; 64x64; 12 colors; transparent 8px margins")
    project=null
    PixelPen.state.current_project=null
    PixelPen.state.free()
    PixelPen.state=null
    quit()
