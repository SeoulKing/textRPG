extends SceneTree
func _initialize() -> void: call_deferred("run")
func run() -> void:
    var source=load("res://scenes/plaza.tscn").instantiate()
    var scene=load("res://scenes/native_2d/plaza.tscn").instantiate()
    if scene.has_node("Ground"):push_error("Native ground is already migrated");quit(1);return
    scene.set_script(load("res://scripts/native_2d_layout.gd"))
    scene.paved_areas=source.paved_areas;scene.garden_areas=source.garden_areas
    scene.plaza_radii=source.plaza_radii
    scene.wall_rectangles=source.wall_collision_rects()
    var old=source.placements()
    for prop in scene.get_node("Placements").get_children():
        for entry in old:
            if str(source.get_path_to(entry))!=prop.source_path:continue
            prop.registered_transform=entry.layout_transform(source)
            prop.entrance=entry.map_entrance(source)
            break
    var ground=load("res://scenes/ground/city_ground.tscn").instantiate()
    ground.name="Ground"
    scene.add_child(ground);ground.owner=scene
    var count=0
    for layer in ground.find_children("*","TileMapLayer",true,false):
        layer.owner=scene;layer.position=Vector2.ZERO;layer.scale=Vector2.ONE;layer.z_index=-40+count;count+=1
        var tiles=layer.tile_set.duplicate(true)
        tiles.tile_size=Vector2i(64,64)
        for i in range(tiles.get_source_count()):
            var atlas=tiles.get_source(tiles.get_source_id(i)) as TileSetAtlasSource
            if atlas==null:continue
            var texture=atlas.texture
            var image=texture.get_image();image.decompress()
            image.resize(image.get_width(),roundi(image.get_height()*64.0/45.0),Image.INTERPOLATE_NEAREST)
            var path="res://art/export/native-2d/ground-"+str(i)+".res"
            ResourceSaver.save(ImageTexture.create_from_image(image),path)
            atlas.texture=load(path);atlas.texture_region_size=Vector2i(64,64)
        layer.tile_set=tiles
    var packed=PackedScene.new();packed.pack(scene)
    ResourceSaver.save(packed,"res://scenes/native_2d/plaza.tscn")
    scene.free();source.free();quit()
