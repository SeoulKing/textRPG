@tool
extends RefCounted
const CITY = preload("res://art/resources/city_center_assets.gd")
const Prop = preload("res://scripts/illustrated_prop.gd")
const GROUND = preload("res://art/resources/illustrated_ground.gdshader")
const STONE = preload("res://art/export/reference/stone-a.png")
const GRASS = preload("res://art/export/reference/grass.png")
const SOIL = preload("res://art/export/reference/soil.png")
const TEXTURES = {
 "plaza-guide":preload("res://art/export/plaza-guide/plaza-guide.png"),
 "portal":preload("res://art/export/reference/portal-2d.png"),
 "lamp-post":preload("res://art/export/reference/lamp-post-2d.png"),
 "shop":preload("res://art/export/reference/shop-2d.png"),
 "inn":preload("res://art/export/reference/inn-2d.png"),
 "restaurant":preload("res://art/export/reference/restaurant-2d.png"),
 "academy-2d":preload("res://art/export/reference/academy-2d.png"),
 "bench":preload("res://art/export/reference/bench.png"),
 "barrels":preload("res://art/export/reference/barrels.png"),
 "basket":preload("res://art/export/reference/basket.png"),
 "flowerbed":preload("res://art/export/reference/planter.png"),
 "flowerpot":preload("res://art/export/reference/flowerpot.png"),
 "shrub":preload("res://art/export/reference/shrub.png"),
 "flowers":preload("res://art/export/reference/flowers.png"),
 "grass-clump":preload("res://art/export/reference/grass-clump.png"),
 "crate":preload("res://art/export/reference/crate.png"),
 "oak":preload("res://art/export/reference/oak.png"),
 "birch":preload("res://art/export/reference/birch.png"),
 "spruce":preload("res://art/export/reference/spruce.png")
}
static func supports(kind: String) -> bool:
    return kind == "fountain" or TEXTURES.has(kind) or CITY.ITEMS.has(kind)
static func make(kind: String) -> Node3D:
    if kind == "plaza-guide": return preload("res://scripts/mei_sprite.gd").new()
    if kind == "fountain": return preload("res://scripts/fountain_sprite.gd").new()
    if kind == "portal": return preload("res://scripts/portal_sprite.gd").new()
    var node = Prop.new()
    node.asset = CITY.ITEMS[kind].texture if CITY.ITEMS.has(kind) else TEXTURES[kind]
    node.fade_for_player = true
    node.use_outdoor_art = true
    node.pixel_size = node.asset.get_size()
    node.foot = Vector2(node.pixel_size.x*.5,node.pixel_size.y-2)
    var width = float(node.pixel_size.x)/64.0
    node.shadow_size = Vector2(width*.65,width*.28)
    if CITY.ITEMS.has(kind):
        node.foot = CITY.ITEMS[kind].foot
        node.shadow_size = CITY.ITEMS[kind].shadow
        node.shadow_offset = Vector2(0,-.5)
    if kind in ["shop","inn","restaurant"]:
        node.foot = Vector2(node.pixel_size.x*.5,node.pixel_size.y-4)
        node.shadow_size = Vector2(5.2,1.8)
        node.shadow_offset = Vector2(0,-.8)
    if kind == "plaza-guide":
        node.foot = Vector2(48,116)
        node.shadow_size = Vector2(.60,.36)
        node.fade_for_player = false
    if kind == "lamp-post":
        node.foot = Vector2(node.pixel_size.x*.5,node.pixel_size.y-4)
        node.shadow_size = Vector2(.45,.28)
        node.fade_for_player = false
    if kind == "academy-2d":
        node.spatial_map = load("res://art/export/reference/academy-spatial.png")
        node.foot = Vector2(640,1088)
        # Sort behind the reachable porch, while keeping the image's foot fixed.
        node.depth_anchor_offset = Vector3(0,0,-2.0)
        node.shadow_size = Vector2(17,4)
        node.shadow_offset = Vector2(0,-2)
    return node
static func add_ground(parent: Node3D, size: Vector2, at: Vector3, layout: Node3D) -> ShaderMaterial:
    var node = MeshInstance3D.new()
    var plane = PlaneMesh.new()
    plane.size = size
    node.mesh = plane
    node.position = at+Vector3(0,.005,0)
    node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
    var mat = ShaderMaterial.new()
    mat.shader = GROUND
    mat.set_shader_parameter("ground",true)
    mat.set_shader_parameter("terrain",true)
    mat.set_shader_parameter("editor_preview",Engine.is_editor_hint())
    mat.set_shader_parameter("fountain_paving",preload("res://art/export/fountain-paving/mosaic-ring.png"))
    mat.set_shader_parameter("stone_tex",STONE)
    mat.set_shader_parameter("grass_tex",GRASS)
    mat.set_shader_parameter("dirt_tex",SOIL)
    mat.set_shader_parameter("city_painted_ground",true)
    mat.set_shader_parameter("city_ground_paint",preload("res://art/export/regions/arcana-city-center/magic-ground-left.svg"))
    mat.set_shader_parameter("city_ground_paint_split",true)
    mat.set_shader_parameter("city_ground_paint_right",preload("res://art/export/regions/arcana-city-center/magic-ground-right.svg"))
    mat.set_shader_parameter("city_ground_paint_bounds",Vector4(0,8,72,48))
    layout.configure_ground(mat)
    preload("res://scripts/ground_tilemap.gd").bind(mat)
    node.material_override = mat
    parent.add_child(node)
    return mat

## Walk-through foliage stays on existing grass outside saved paving. No solid
## decoration is placed on a path and no gameplay collision/source scene is edited.
static func build_verges(parent: Node3D, layout: Node3D) -> void:
    var previous = parent.get_node_or_null("IllustratedVerges")
    if previous != null:
        parent.remove_child(previous)
        previous.queue_free()
    var group = Node3D.new()
    group.name = "IllustratedVerges"
    parent.add_child(group)
    var count = 0
    var seen: Dictionary = {}
    var clear_approaches: Array[Rect2] = []
    for entry in layout.placements():
        if entry.walkable_cutout.has_area():
            var mapped = entry._map_rect(layout,entry.walkable_cutout)
            clear_approaches.append(Rect2(mapped.position/16.0,mapped.size/16.0).grow(.6))
    for rect in layout.paved_areas:
        var horizontal = rect.size.x > rect.size.y
        var length = rect.size.x if horizontal else rect.size.y
        var steps = maxi(1,int(length/1.6))
        for i in range(steps):
            for side in [-1,1]:
                var fraction = (float(i)+.45)/float(steps)
                var point = rect.position+Vector2(rect.size.x*fraction,rect.size.y*.5) if horizontal else rect.position+Vector2(rect.size.x*.5,rect.size.y*fraction)
                if horizontal: point.y += float(side)*(rect.size.y*.5+.65)
                else: point.x += float(side)*(rect.size.x*.5+.65)
                var key = Vector2i((point*2).round())
                if seen.has(key) or layout.material_at(point*16.0)!=0: continue
                if point.x<1 or point.x>71 or point.y<1 or point.y>78: continue
                var on_approach = false
                for approach in clear_approaches:
                    if approach.has_point(point):
                        on_approach = true
                        break
                if on_approach: continue
                seen[key] = true
                var clump = make("grass-clump" if i%4 else "flowers")
                clump.position = Vector3(point.x,0,point.y)
                group.add_child(clump)
                count += 1
                if count>=120: return
