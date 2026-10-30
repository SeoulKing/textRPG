extends SceneTree
const Prop=preload("res://scripts/illustrated_prop.gd")
var output: Node2D
var count=0
func _initialize() -> void: call_deferred("run")
func run() -> void:
    for name in ["inn_lobby","academy_first_floor","academy_second_floor"]:
        var path="res://scenes/native_2d/"+name+".tscn"
        if ResourceLoader.exists(path): continue
        var source=load("res://scenes/"+name+".tscn").instantiate()
        root.add_child(source)
        output=Node2D.new();output.name=name.to_pascal_case()+"2D"
        output.texture_filter=CanvasItem.TEXTURE_FILTER_NEAREST
        visit(source,Transform3D.IDENTITY)
        var packed=PackedScene.new();packed.pack(output)
        var err=ResourceSaver.save(packed,path)
        print("ROOM_2D ",name," visuals=",output.get_child_count()," result=",err)
        output.free();source.free()
    quit()
func save_image(image: Image,key: String) -> Texture2D:
    var path="res://art/export/native-2d/"+key.sha256_text()+".res"
    if not ResourceLoader.exists(path): ResourceSaver.save(ImageTexture.create_from_image(image),path)
    return load(path)
func visit(node: Node,parent_transform: Transform3D) -> void:
    var t=parent_transform*node.transform if node is Node3D else parent_transform
    if node is Prop:
        var sprite=Sprite2D.new();sprite.name=str(node.name)+str(count);count+=1
        var asset: Texture2D=node.asset
        var image=asset.get_image();image.decompress()
        var scale_factor=t.basis.x.length()
        image.resize(maxi(1,roundi(image.get_width()*scale_factor)),maxi(1,roundi(image.get_height()*scale_factor)),Image.INTERPOLATE_NEAREST)
        sprite.texture=save_image(image,asset.resource_path+str(scale_factor)+str(image.get_size()))
        sprite.centered=false
        sprite.offset=(Vector2(t.origin.x,t.origin.z-t.origin.y)*64-node.foot*scale_factor).round()
        sprite.set_meta("foot",Vector2(t.origin.x,t.origin.z)*64)
        sprite.set_meta("interaction_id",node.interaction_id)
        output.add_child(sprite);sprite.owner=output
        return
    if node is MeshInstance3D and node.mesh is PlaneMesh and node.material_override is ShaderMaterial:
        var material: ShaderMaterial=node.material_override
        var texture: Texture2D=material.get_shader_parameter("art")
        if texture!=null:
            var size=Vector2i((node.mesh.size*64).round())
            var repeats: Variant=material.get_shader_parameter("repeats")
            var tiles=Vector2(repeats) if repeats is Vector2 else Vector2.ONE
            var tile=texture.get_image();tile.decompress()
            tile.resize(maxi(1,roundi(size.x/maxf(1,tiles.x))),maxi(1,roundi(size.y/maxf(1,tiles.y))),Image.INTERPOLATE_NEAREST)
            var image=Image.create(size.x,size.y,false,Image.FORMAT_RGBA8)
            for y in range(0,size.y,tile.get_height()):
                for x in range(0,size.x,tile.get_width()):image.blit_rect(tile,Rect2i(Vector2i.ZERO,tile.get_size()),Vector2i(x,y))
            var sprite=Sprite2D.new();sprite.name=str(node.name)+str(count);count+=1
            sprite.texture=save_image(image,texture.resource_path+str(size)+str(tiles));sprite.centered=false
            sprite.offset=(Vector2(t.origin.x,t.origin.z)*64-Vector2(size)*.5).round();sprite.z_index=-30+int(node.position.y*10)
            output.add_child(sprite);sprite.owner=output
            return
    for child in node.get_children():visit(child,t)
