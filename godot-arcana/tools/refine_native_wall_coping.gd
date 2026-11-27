extends SceneTree
const BASE = "res://art/source/walls/native-v1/"
var project: PixelPenProject
var layer: IndexedColorImage
var palette: PackedColorArray
var start: int
var ox: int
var oy: int
func _initialize() -> void: call_deferred("author")
func inside(mask: int,x: int,y: int) -> bool:
    if x<0 or x>=64 or y<0 or y>=64: return false
    return (x>=16 and x<48 and y>=16 and y<48) or ((mask&1)!=0 and x>=48 and y>=16 and y<48) or ((mask&2)!=0 and y>=48 and x>=16 and x<48) or ((mask&4)!=0 and x<16 and y>=16 and y<48) or ((mask&8)!=0 and y<16 and x>=16 and x<48)
func dot(x: int,y: int,c: int) -> void:
    if x>=0 and x<64 and y>=0 and y<256:
        layer.set_index_on_color_map(ox+x,oy+y,start+c)
func block(x: int,y: int,w: int,d: int,h: int) -> void:
    # Low crenellation: visible stone top, bevel and shallow front face.
    for yy in range(y-h,y+d):
        for xx in range(x,x+w):
            var c: int = 6 if yy<y-h+d else 3
            if yy==y-h: c=7
            elif yy>=y+d-2: c=1
            elif xx==x+w-1: c=2
            elif xx==x: c=5
            elif yy==y-h+d: c=4
            dot(xx,yy,c)
func author() -> void:
    var output_path: String = BASE+"wall-coping-v3.pxpen"
    if FileAccess.file_exists(output_path):
        project=ProjectPacker.load_project(output_path)
    else:
        project=ProjectPacker.load_project(BASE+"wall-relief-v2.pxpen")
        if project==null: quit(1);return
        layer=project.active_frame.layers[0]
        layer.label="Thin coping, paved walk and crenellations v3"
        palette=project.palette.color_index
        start=palette.size()
        for color in ["8b7056","ad8d66","c9a979","d7ba86","e4c99a","ecd5a9","f1dcae","ffe8bb","b99b75","c7ad89"]:
            palette.append(Color(color))
        project.palette.color_index=palette
        for mask in range(16):
            ox=(mask%4)*64;oy=(mask/4)*256
            # Repaint only the exposed top plane. Its broad bright frame becomes
            # a subdued walkway with a 1–2px rim and inset course joints.
            for y in range(64):
                for x in range(64):
                    if not inside(mask,x,y): continue
                    var north: bool = not inside(mask,x,y-1) and not(y==0 and (mask&8)!=0)
                    var south: bool = not inside(mask,x,y+1) and not(y==63 and (mask&2)!=0)
                    var west: bool = not inside(mask,x-1,y) and not(x==0 and (mask&4)!=0)
                    var east: bool = not inside(mask,x+1,y) and not(x==63 and (mask&1)!=0)
                    var joint: int = (x+(y/8%2)*8)%16
                    var c: int = 8 if (x/16+y/8)%3==0 else 9
                    if y%8==7 or joint==15: c=2
                    if y%8==0: c=4
                    if north or west: c=6
                    if south or east: c=2
                    dot(x,y,c)
            # Discrete blocks on the far parapet leave the walkway visible.
            if (mask&8)==0:
                if (mask&5)==5:
                    block(10,17,12,5,9);block(42,17,12,5,9)
                else:
                    block(25,17,14,5,9)
            # North/south runs have their own side-facing crenellations. No
            # mirrored isometric corner art is introduced.
            if (mask&10)!=0:
                var ys: Array = [18,50] if (mask&10)==10 else [34]
                for y in ys:
                    if (mask&4)==0: block(17,y,6,8,8)
                    if (mask&1)==0: block(41,y,6,8,8)
        project.file_path=output_path
        if ProjectPacker.save(project,output_path)!=OK: quit(1);return
        project=ProjectPacker.load_project(output_path)
    if project==null: quit(1);return
    var image: Image=project.get_image(project.animation_timeline[0].frame)
    if image.save_png(BASE+"wall-atlas.png")!=OK: quit(1);return
    print("WALL_COPING_V3: 16 tiles; thin rim + paved walkway + low crenellations; PixelPen saved/reopened/exported")
    project=null
    PixelPen.state.current_project=null
    PixelPen.state.free();PixelPen.state=null
    quit()

