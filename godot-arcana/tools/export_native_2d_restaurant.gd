extends SceneTree
const Models=preload("res://scripts/pixel3d_models.gd")
var pieces: Array[Dictionary]=[]
func _initialize() -> void:call_deferred("run")
func run() -> void:
    var path="res://scenes/native_2d/restaurant.tscn"
    if ResourceLoader.exists(path):push_error("Refusing to overwrite the edited restaurant scene");quit(1);return
    var source=Node3D.new()
    Models.box(source,Vector3(21,.01,19.5),Vector3(12,0,10.75),"cbbd9d")
    Models.box(source,Vector3(21,3.1,.35),Vector3(12,1.55,1.4),"e0d1b9")
    Models.box(source,Vector3(21,.16,.44),Vector3(12,3.15,1.4),"eee0c8")
    Models.box(source,Vector3(21,.07,.46),Vector3(12,.30,1.4),"d5a44f")
    for x in [-8,-4,0,4,8]:
        Models._window(source,Vector3(12+x,1,1.63),1.15,1.76)
        Models.box(source,Vector3(.25,2.8,.15),Vector3(12+x+1.6,1.65,1.2),"eee0c8")
        Models.box(source,Vector3(.58,1.12,.08),Vector3(12+x-1.30,2.10,1.15),"7657a6")
    for x in range(42,330,46):
        var shelf=Models.model("shelf");shelf.position=Vector3(x/16.0,0,66.0/16);source.add_child(shelf)
    var work=Models.model("workbench");work.position=Vector3(12,0,114.0/16);work.scale=Vector3(4,1,2);source.add_child(work)
    for x in [70,302]:
        var bench=Models.model("bench");bench.position=Vector3(x/16.0,0,204.0/16);source.add_child(bench)
    collect(source,Transform3D.IDENTITY)
    pieces.sort_custom(func(a,b):return a.depth<b.depth)
    var output=Node2D.new();output.name="Restaurant2D"
    var image=Image.create(1536,1600,false,Image.FORMAT_RGBA8)
    for item in pieces:
        var points: PackedVector2Array=item.points
        var top=maxi(0,floori(minf(points[0].y,minf(points[1].y,points[2].y)))+256)
        var bottom=mini(1599,ceili(maxf(points[0].y,maxf(points[1].y,points[2].y)))+256)
        for y in range(top,bottom+1):
            var scan=float(y)-256+.5
            var xs: Array[float]=[]
            for edge in range(3):
                var a=points[edge];var b=points[(edge+1)%3]
                if (a.y<=scan and b.y>scan) or (b.y<=scan and a.y>scan):xs.append(a.x+(scan-a.y)*(b.x-a.x)/(b.y-a.y))
            if xs.size()<2:continue
            xs.sort()
            var left=maxi(0,ceili(xs[0]-.5));var right=mini(1535,floori(xs[-1]-.5))
            if right>=left:image.fill_rect(Rect2i(left,y,right-left+1,1),item.color)
    var texture_path="res://art/export/native-2d/restaurant-surfaces.res"
    ResourceSaver.save(ImageTexture.create_from_image(image),texture_path)
    var visual=Sprite2D.new();visual.name="RestaurantSurfaces";visual.centered=false
    visual.offset=Vector2(0,-256);visual.texture=load(texture_path);visual.z_index=-25
    output.add_child(visual);visual.owner=output
    var packed=PackedScene.new();packed.pack(output);ResourceSaver.save(packed,path)
    print("NATIVE_RESTAURANT polygons=",pieces.size())
    output.free();source.free();await process_frame;quit()
func collect(node: Node,parent: Transform3D) -> void:
    var t=parent*node.transform if node is Node3D else parent
    if node is MeshInstance3D and node.mesh!=null:
        for surface in node.mesh.get_surface_count():
            var data=node.mesh.surface_get_arrays(surface)
            var vertices: PackedVector3Array=data[Mesh.ARRAY_VERTEX]
            var indices: PackedInt32Array=data[Mesh.ARRAY_INDEX] if data[Mesh.ARRAY_INDEX]!=null else PackedInt32Array()
            var material=node.material_override if node.material_override!=null else node.mesh.surface_get_material(surface)
            var color=Color("cbbd9d")
            if material is ShaderMaterial:
                var value=material.get_shader_parameter("base_color")
                if value is Color:color=value
            for offset in range(0,indices.size() if not indices.is_empty() else vertices.size(),3):
                var a=t*vertices[indices[offset] if not indices.is_empty() else offset]
                var b=t*vertices[indices[offset+1] if not indices.is_empty() else offset+1]
                var c=t*vertices[indices[offset+2] if not indices.is_empty() else offset+2]
                var normal=(b-a).cross(c-a).normalized()
                if normal.dot(Vector3(0,1,1))<=0:continue
                var points=PackedVector2Array()
                for v in [a,b,c]:points.append((Vector2(v.x,v.z-v.y)*64).round())
                var shade=.70+.30*maxf(0,normal.dot(Vector3(-.3,.8,.5).normalized()))
                pieces.append({"points":points,"depth":(a.z+b.z+c.z-a.y-b.y-c.y)/3,"color":color*Color(shade,shade,shade,1)})
    for child in node.get_children():collect(child,t)
