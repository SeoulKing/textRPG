extends Node2D
signal camera_updated
const Hero=preload("res://scripts/native_2d_hero.gd")
const MeiFrames=preload("res://art/export/plaza-guide/mei-idle.tres")
const Slime=preload("res://scripts/native_2d_slime.gd")
const Blink=preload("res://scripts/native_2d_blink.gd")
const InnLighting=preload("res://scripts/native_2d_inn_lighting.gd")
const AcademyLighting=preload("res://scripts/native_2d_academy_lighting.gd")
const Sunlight=preload("res://scripts/native_2d_sunlight.gd")
const PlazaV2 = preload("res://scenes/plaza_3d_v2.tscn")
const WorldDisplay = preload("res://scripts/services/world_display_settings.gd")
const CAMERA_ZOOM=4.0
const MIN_ZOOM_RATIO=.44642857
const MAX_HERO_SCREEN_HEIGHT=.9
const ENEMY_BAR_WIDTH=.9
var world: Node2D
var hero: Node2D
var plaza_slime: Node2D
var hunting_slime: Node2D
var slime: Node2D
var shop3d: Node3D
var inn3d: Node3D
var plaza3d: Node3D
var camera: Camera2D
var outside: Node2D
var inside: Node2D
var blink: Node2D
var layout: Node2D
var ambience: CanvasModulate
var inn_lobby: Node2D
var academy_room: Node2D
var sunlight: Node2D
var city_life: Node2D
var river: Node2D
var fishing_view: bool = false
var render_pixel_scale=1.0
var presentation_minimum := 2
var presentation_pixel_size := 1
var camera_texel_offset := Vector2.ZERO
var _physical_size := Vector2i.ZERO
var _visible_raster := Vector2.ZERO
var camera_zoom=4.0
var base_camera_zoom=4.0
var pixelated=true
var quarter_view=false
var last_interior="__boot__"
var last_floor=0
var previous_player=Vector2.ZERO
var enemy_meter_visible=false
var enemy_trail_hp=30.0
var enemy_last_hp=30.0
var sprites: Array[Dictionary]=[]
var occlusion_masks: Dictionary={}
var remote_ids: Dictionary={}
var room_bounds=Rect2(0,0,1536,1312)
var display_size=Vector2(384,824)
static func shop_raster_size(physical_size: Vector2i, pixel_size: int = 2, padding: int = 0) -> Vector2i:
    var visible_size := Vector2i((Vector2(physical_size) / clampi(pixel_size, 1, 4)).ceil()).max(Vector2i(2, 2))
    return visible_size + Vector2i.ONE * (2 * padding)

static func shop_presentation_size(raster_size: Vector2i, pixel_size: int = 2) -> Vector2i:
    return raster_size * clampi(pixel_size, 1, 4)

static func shop_presentation_offset(texel_offset: Vector2, pixel_size: int, padding: int) -> Vector2:
    if padding == 0:
        return Vector2.ZERO
    # Align the translated image to physical pixels, with consistent rounding across texel boundaries.
    return ((texel_offset - Vector2.ONE * padding) * pixel_size + Vector2.ONE * 0.5).floor()

static func raster_to_display(presenter: TextureRect, raster_size: Vector2i, point: Vector2) -> Vector2:
    return presenter.get_global_transform() * (point * presenter.size / Vector2(raster_size))

static func display_to_raster(presenter: TextureRect, raster_size: Vector2i, point: Vector2) -> Vector2:
    return (presenter.get_global_transform().affine_inverse() * point) * Vector2(raster_size) / presenter.size

func set_zoom_ratio(value: float) -> void:
    # Limit only when the hero nearly fills this window; never at a fixed 200%.
    var hero_height=Hero.SPEC.SOURCE_HEIGHT*2.0*base_camera_zoom/CAMERA_ZOOM
    var maximum=maxf(MIN_ZOOM_RATIO,display_size.y*MAX_HERO_SCREEN_HEIGHT/hero_height)
    camera_zoom=base_camera_zoom*clampf(value,MIN_ZOOM_RATIO,maximum)
func get_zoom_ratio() -> float:return camera_zoom/base_camera_zoom
func set_display_size(size: Vector2) -> void:
    var ratio=get_zoom_ratio()
    display_size=size
    base_camera_zoom=2.0 if size.x<size.y else 4.0
    set_zoom_ratio(ratio)
func set_render_pixel_scale(value: float) -> void:render_pixel_scale=maxf(.01,value)
func set_quarter_view(_value: bool) -> void:quarter_view=false
func view_yaw() -> float:return 0.0
func map_point(point: Vector2,height: float=0.0) -> Vector2:return preload("res://scripts/native_2d_coordinates.gd").canvas(point,height)
func uses_plaza_v2() -> bool:
    return world.indoor.is_empty() and world.uses_plaza_v2() and is_instance_valid(plaza3d)

func set_physical_size(size: Vector2i) -> void:
    _physical_size = size

func _prepare_raster(plaza_active: bool) -> void:
    if _physical_size == Vector2i.ZERO:
        return
    var physical := Vector2(_physical_size)
    var aspect := physical.x / physical.y
    var projected_actor_pixel: float = render_pixel_scale
    if plaza_active:
        projected_actor_pixel = physical.y / (plaza3d.view_height(aspect, get_zoom_ratio()) * Hero.SPEC.PIXELS_PER_UNIT)
    elif is_instance_valid(shop3d):
        projected_actor_pixel = physical.y / (shop3d.view_height(aspect, get_zoom_ratio()) * shop3d.Layout.PPU)
    elif is_instance_valid(inn3d):
        projected_actor_pixel = physical.y / (inn3d.view_height(aspect, get_zoom_ratio()) * Hero.SPEC.PIXELS_PER_UNIT)
    presentation_pixel_size = WorldDisplay.camera_pixel_size(presentation_minimum, projected_actor_pixel)
    _visible_raster = physical / presentation_pixel_size
    var raster_size := WorldDisplay.padded_raster_size(_visible_raster)
    var viewport := get_viewport() as SubViewport
    if viewport.size != raster_size:
        viewport.size = raster_size

func _ready() -> void:
    texture_filter=CanvasItem.TEXTURE_FILTER_NEAREST
    layout=world.layout;outside=layout;add_child(outside)
    ambience=CanvasModulate.new();add_child(ambience)
    inside=Node2D.new();add_child(inside)
    camera=Camera2D.new();camera.position_smoothing_enabled=false;add_child(camera);camera.make_current()
    hero=Hero.new();add_child(hero)
    blink=Blink.new();add_child(blink)
    plaza_slime=Slime.new();add_child(plaza_slime)
    plaza_slime.position=outside.get_node("PlazaSlimeSpawn").position
    hunting_slime=Slime.new();add_child(hunting_slime);hunting_slime.position=map_point(world.CityMap.HUNTING_HOME)
    slime=hunting_slime
    previous_player=world.player_position
    _register(outside)
    sunlight=Sunlight.new();sunlight.name="OutdoorSunlight";add_child(sunlight)
    sunlight.configure(outside,outside.get_node_or_null("Sunlight"))
    city_life=outside.get_node_or_null("Placements/WalkingQuarter")
    if city_life!=null:city_life.configure(outside)
    river=outside.get_node_or_null("Placements/RiverQuarter")
func _register(source: Node) -> void:
    for node in source.get_children():
        if node is TileMapLayer and node.has_method("prepare_runtime_visuals"):
            node.prepare_runtime_visuals()
        if node is Sprite2D and node.texture!=null:
            var anchor=Vector2.ZERO
            if node.has_meta("foot"):
                anchor=to_local(node.to_global(node.get_meta("foot",Vector2.ZERO)))
            var parent=node.get_parent()
            if parent.get("logical_anchor")!=null:anchor=map_point(parent.map_position())
            if node.get_meta("native_wall",false):
                anchor=to_local(node.to_global(Vector2(0,float(node.get_meta("native_wall_sort_origin",0)))))
            if str(node.get_meta("interaction_id",""))=="innkeeper":
                var marker=preload("res://scripts/native_2d_quest_marker.gd").new()
                marker.quest_id="arcana_inn_slimes";marker.progress_flag="arcana_inn_slime_kills"
                source.add_child(marker);marker.position=anchor-Vector2(0,137)
            var entrance_approach := Rect2()
            if parent.has_method("map_entrance_approach"):
                entrance_approach = parent.map_entrance_approach()
            sprites.append({"sprite":node,"anchor":anchor,"kind":str(parent.get("model_kind")) if parent.get("model_kind")!=null else "","id":str(parent.get("gameplay_id")) if parent.get("gameplay_id")!=null else str(node.get_meta("interaction_id","")),"root":outside if outside.is_ancestor_of(node) else inside,"entrance_approach":entrance_approach})
        _register(node)
func _interior() -> void:
    if is_instance_valid(shop3d):
        remove_child(shop3d)
        shop3d.queue_free()
        shop3d=null
    if is_instance_valid(inn3d):
        remove_child(inn3d)
        inn3d.queue_free()
        inn3d=null
    inn_lobby=null
    academy_room=null
    for child in inside.get_children():
        if child is CanvasItem:child.hide()
        child.queue_free()
    sprites=sprites.filter(func(entry):return is_instance_valid(entry.sprite) and entry.root==outside)
    outside.visible=world.indoor.is_empty() and not world.uses_plaza_v2()
    if world.indoor.is_empty() and world.uses_plaza_v2():
        camera.enabled=false
        get_viewport().disable_3d=false
        if not is_instance_valid(plaza3d):
            plaza3d=PlazaV2.instantiate()
            plaza3d.set("live_mode", true)
            add_child(plaza3d)
        plaza3d.set_live_active(true)
        return
    if is_instance_valid(plaza3d):plaza3d.set_live_active(false)
    if world.indoor=="arcana_inn" and _open_inn():
        return
    if world.indoor=="arcana_shop":
        var shop_scene := load("res://scenes/shop_3d.tscn") as PackedScene
        if shop_scene == null:
            push_error("Missing interior scene: res://scenes/shop_3d.tscn")
            return
        camera.enabled=false
        get_viewport().canvas_transform=Transform2D.IDENTITY
        get_viewport().disable_3d=false
        shop3d=shop_scene.instantiate()
        shop3d.layout=world.shop_layout
        add_child(shop3d)
        shop3d.camera.make_current()
        return
    get_viewport().disable_3d=true
    camera.enabled=true;camera.make_current()
    if not world.indoor.is_empty():
        var registry = preload("res://scripts/region_registry.gd")
        var packed: PackedScene = registry.scene(world.indoor, world.academy_floor)
        if packed == null:
            push_error("Missing region scene: " + world.indoor)
            return
        var room = packed.instantiate()
        inside.add_child(room);_register(room)
        if world.indoor=="arcana_inn":inn_lobby=room
        elif world.indoor=="arcana_academy":academy_room=room
        room_bounds=registry.camera_bounds(world.indoor, world.academy_floor)

func _open_inn() -> bool:
    var registry = preload("res://scripts/region_registry.gd")
    var visual := load("res://scenes/inn_lobby_3d.tscn") as PackedScene
    var authored: PackedScene = registry.scene("arcana_inn")
    if visual == null or authored == null:
        return false
    var layout_root := authored.instantiate() as Node2D
    if layout_root == null:
        return false
    var candidate := visual.instantiate() as Node3D
    if candidate == null:
        layout_root.free()
        return false
    camera.enabled=false
    get_viewport().canvas_transform=Transform2D.IDENTITY
    get_viewport().disable_3d=false
    add_child(candidate)
    var ready: bool = candidate.configure(layout_root, registry.camera_bounds("arcana_inn"))
    layout_root.free()
    if not ready:
        candidate.free()
        return false
    inn3d=candidate
    inn3d.camera.make_current()
    var marker := preload("res://scripts/native_2d_quest_marker.gd").new()
    marker.quest_id="arcana_inn_slimes"
    marker.progress_flag="arcana_inn_slime_kills"
    inside.add_child(marker)
    marker.position=Vector2(inn3d.innkeeper.position.x, inn3d.innkeeper.position.z)*64.0-Vector2(0, 2.4*64.0*sqrt(2.0))
    marker.scale.y=sqrt(2.0)
    return true

func _process(delta: float) -> void:
    if world==null:return
    if world.indoor!=last_interior or world.academy_floor!=last_floor:
        last_interior=world.indoor;last_floor=world.academy_floor;_interior()
    var plaza_active := uses_plaza_v2()
    var inn_active := is_instance_valid(inn3d)
    _prepare_raster(plaza_active)
    camera_texel_offset = Vector2.ZERO
    if not plaza_active and is_instance_valid(city_life):city_life.sync_city_life(world,delta)
    if not plaza_active and is_instance_valid(river):river.sync_river(world)
    sunlight.visible=world.indoor.is_empty() and not plaza_active and world.effects_enabled
    world.input_projection=Transform2D(Vector2.RIGHT, Vector2.DOWN * sqrt(2.0), Vector2.ZERO) if plaza_active or inn_active else Transform2D.IDENTITY
    ambience.color=Color.WHITE
    if world.effects_enabled:
        if world.indoor=="arcana_inn" and not inn_active:ambience.color=InnLighting.AMBIENT
        elif world.indoor=="arcana_academy":ambience.color=AcademyLighting.AMBIENT
        elif world.indoor.is_empty():ambience.color=Color("929bb0") if world.dusk else Color("f5f1e9")
    if is_instance_valid(inn_lobby):
        inn_lobby.sync_lighting(world.time,world.effects_enabled,world.reduced_motion)
    if is_instance_valid(academy_room):
        academy_room.sync_lighting(world.time,world.effects_enabled,world.reduced_motion)
    var motion=world.player_position-previous_player;previous_player=world.player_position
    hero.show();hero.position=map_point(world.bench_visual_position())
    hero.art.scale.y = sqrt(2.0) if plaza_active else 1.0
    hero.set_bench_pose(world.bench_state,world.bench_age,world.reduced_motion)
    hero.dash_age=world.dash_age;hero.dash_yaw=atan2(world.dash_direction.x,world.dash_direction.y)
    hero.pose(world.time,world.player_gait,world.walking,motion,true,world.effects_enabled and not world.reduced_motion,true,world.last_move_direction)
    hero.apply_bench_pose()
    blink.set_projected_height(sqrt(2.0) if inn_active else 1.0)
    blink.update_pose(world.teleport_age,Hero.direction_for_yaw(atan2(world.teleport_direction.x,world.teleport_direction.y),0),map_point(world.teleport_origin),map_point(world.teleport_target),world.effects_enabled,world.reduced_motion)
    hero.visible=not Blink.hides_character(world.teleport_age,world.effects_enabled,world.reduced_motion)
    if world.indoor=="arcana_shop":
        if is_instance_valid(shop3d):
            shop3d.presentation_minimum=presentation_minimum
            shop3d.sync(world,hero,get_zoom_ratio(),pixelated,_visible_raster)
            camera_texel_offset = shop3d.camera_texel_offset
        blink.hide();hero.hide();plaza_slime.hide();hunting_slime.hide();camera_updated.emit();return
    if inn_active:
        inn3d.presentation_minimum=presentation_minimum
        inn3d.sync(world,hero,get_zoom_ratio(),pixelated,_visible_raster)
        camera_texel_offset=inn3d.camera_texel_offset
        get_viewport().canvas_transform=inn3d.canvas_projection()
        enemy_meter_visible=false
        hero.hide();plaza_slime.hide();hunting_slime.hide();blink.show()
        camera_updated.emit()
        return
    blink.show()
    var spatial=world.battle.has("spatial")
    slime=plaza_slime if spatial or world.spatial_selected else hunting_slime
    plaza_slime.sync(world.time,world.battle if spatial else {},world.enemy_visual_hp if spatial else 30.0,false,world.effects_enabled and not world.reduced_motion)
    hunting_slime.sync(world.time,{} if spatial else world.battle,30.0 if spatial else world.enemy_visual_hp,world.impact_remaining>0,world.effects_enabled and not world.reduced_motion)
    var plaza_slime_visible: bool = plaza_slime.visible and world.indoor.is_empty()
    plaza_slime.visible=plaza_slime_visible and not plaza_active
    hunting_slime.visible=hunting_slime.visible and world.indoor.is_empty() and not plaza_active
    enemy_meter_visible=world.indoor.is_empty() and not world.battle.is_empty() and world.battle.get("phase","") not in ["victory","defeat"]
    if world.enemy_visual_hp>enemy_last_hp:enemy_trail_hp=world.enemy_visual_hp
    else:enemy_trail_hp=move_toward(enemy_trail_hp,world.enemy_visual_hp,delta*15)
    enemy_last_hp=world.enemy_visual_hp
    var draws: Array[Dictionary]=[]
    var occupied_seats: Dictionary={}
    if world.bench_pose_active():occupied_seats[str(world.bench_entity.id)]=map_point(world.player_position).y-1.0
    for child in get_children():
        var seat_id: String=str(child.get_meta("seat_id",""))
        if not seat_id.is_empty():occupied_seats[seat_id]=minf(float(occupied_seats.get(seat_id,INF)),float(child.get_meta("seat_sort_y",0))-1.0)
    for entry in sprites:
        if not is_instance_valid(entry.sprite) or not entry.sprite.is_visible_in_tree():continue
        var sprite: Sprite2D=entry.sprite
        if entry.kind=="city-resident":
            entry.anchor=map_point(sprite.get_parent().map_position())
        var grid: Vector2i=sprite.get_meta("frame_grid",Vector2i.ONE)
        var frame_size: Vector2i=sprite.get_meta("frame_size",Vector2i.ZERO)
        if grid!=Vector2i.ONE and frame_size!=Vector2i.ZERO:
            var count=grid.x*grid.y
            var frame=int(world.time*(12 if entry.kind=="fountain" else 8))%count if world.effects_enabled and not world.reduced_motion else 0
            sprite.region_rect=Rect2(Vector2(frame%grid.x,floori(float(frame)/grid.x))*Vector2(frame_size),Vector2(frame_size))
            if entry.kind=="plaza-guide":
                var index=int(world.time*MeiFrames.get_animation_speed("idle"))%MeiFrames.get_frame_count("idle") if world.effects_enabled and not world.reduced_motion else 0
                var original: AtlasTexture=MeiFrames.get_frame_texture("idle",index)
                var factor=Vector2(sprite.texture.get_size())/Vector2(original.atlas.get_size())
                sprite.region_rect=Rect2(original.region.position*factor,original.region.size*factor)
        if sprite.z_index>-20:
            var anchor: Vector2=entry.anchor
            # L-shaped sofas extend past the central seat; keep the sitter in front.
            var sort_y := minf(anchor.y, float(occupied_seats.get(entry.id, anchor.y)))
            var on_approach: bool = entry.entrance_approach.has_point(world.player_position)
            if on_approach:
                sort_y = minf(sort_y, hero.position.y - 1.0)
            draws.append({"node":sprite,"y":sort_y})
            var body=Rect2(hero.position+Vector2(-24,-96),Vector2(48,84))
            var own_seat: bool=world.bench_pose_active() and entry.id==str(world.bench_entity.get("id",""))
            var covered=not on_approach and not own_seat and anchor.y>=hero.position.y and _sprite_covers_body(sprite,body)
            sprite.modulate.a=1.0 if on_approach else move_toward(sprite.modulate.a,.45 if covered else 1.0,delta*5)
    # Sort by the walkable floor anchor, not the boots lifted onto a cushion.
    draws.append({"node":hero,"y":map_point(world.player_position).y if world.bench_pose_active() else hero.position.y})
    for node in [plaza_slime,hunting_slime]:draws.append({"node":node,"y":node.position.y})
    for child in get_children():
        if child is Node2D and child.get_script()==Hero and child!=hero:
            child.art.scale.y = sqrt(2.0) if plaza_active else 1.0
            draws.append({"node":child,"y":float(child.get_meta("seat_sort_y",child.position.y))})
    for child in get_children():
        if child is Node2D and child.get_meta("campfire",false) and child.visible:draws.append({"node":child,"y":child.position.y})
    draws.sort_custom(func(a,b):return a.y<b.y)
    for i in draws.size():draws[i].node.z_index=i+1
    if plaza_active:
        plaza3d.sync_live_slime(plaza_slime.position / 4.0, plaza_slime_visible)
        plaza3d.sync_live(world.player_position, get_zoom_ratio(), _visible_raster, delta, world.teleport_age >= 0.0 or world.reduced_motion)
        camera_texel_offset = plaza3d.camera_texel_offset
        get_viewport().canvas_transform = plaza3d.canvas_projection()
        hero.position = snap_actor_position(hero.position)
        camera_updated.emit()
        return
    _camera()
    var sun_actors: Array[Node2D]=[hero,plaza_slime,hunting_slime]
    for child in get_children():
        if child is Node2D and child.get_script()==Hero and child!=hero:sun_actors.append(child)
    sunlight.sync(sprites,sun_actors,world.indoor.is_empty() and world.effects_enabled,world.dusk)
    camera_updated.emit()
func _sprite_covers_body(sprite: Sprite2D,body: Rect2) -> bool:
    # Transparent canvas margins must not trigger scenery fading.
    var local_body=Rect2(sprite.to_local(to_global(body.position)),Vector2.ZERO)
    for corner in [Vector2(body.end.x,body.position.y),body.end,Vector2(body.position.x,body.end.y)]:
        local_body=local_body.expand(sprite.to_local(to_global(corner)))
    var rect=sprite.get_rect()
    var overlap=rect.intersection(local_body)
    if not overlap.has_area():return false
    var texture: Texture2D=sprite.texture
    if not occlusion_masks.has(texture):
        var image=texture.get_image()
        if image==null:return false
        var new_mask=BitMap.new()
        new_mask.create_from_image_alpha(image,.5)
        occlusion_masks[texture]=new_mask
    var mask: BitMap=occlusion_masks[texture]
    var source_origin=sprite.region_rect.position if sprite.region_enabled else Vector2.ZERO
    source_origin+=Vector2(sprite.frame_coords)*rect.size
    var size=mask.get_size()
    for y in range(floori(overlap.position.y-rect.position.y),ceili(overlap.end.y-rect.position.y)):
        for x in range(floori(overlap.position.x-rect.position.x),ceili(overlap.end.x-rect.position.x)):
            var pixel=Vector2i(source_origin)+Vector2i(int(rect.size.x)-1-x if sprite.flip_h else x,int(rect.size.y)-1-y if sprite.flip_v else y)
            if pixel.x>=0 and pixel.y>=0 and pixel.x<size.x and pixel.y<size.y and mask.get_bitv(pixel):return true
    return false
func _camera() -> void:
    var viewport=get_viewport()
    var size := _visible_raster if _visible_raster != Vector2.ZERO else Vector2(viewport.size)
    var zoom: float = render_pixel_scale / presentation_pixel_size
    var target=hero.position-Vector2(0,50)
    if fishing_view:target.x+=size.x*.22/maxf(.01,zoom)
    # Camera scale comes from final presentation pixels, for every room and outdoors.
    # Fit a room only when it already fits at the player's chosen zoom.
    if not world.indoor.is_empty():
        var half=size/(2.0*zoom)
        target.x=room_bounds.get_center().x if room_bounds.size.x<=half.x*2 else clampf(target.x,room_bounds.position.x+half.x,room_bounds.end.x-half.x)
        target.y=room_bounds.get_center().y if room_bounds.size.y<=half.y*2 else clampf(target.y,room_bounds.position.y+half.y,room_bounds.end.y-half.y)
    camera.zoom=Vector2.ONE*zoom;camera.position=target;camera.force_update_scroll()
    var canvas=viewport.canvas_transform;var stretch=viewport.get_stretch_transform()
    var origin=stretch*canvas.origin
    camera_texel_offset = origin - (origin + Vector2.ONE * 0.5).floor()
    camera.position += stretch.affine_inverse().basis_xform(camera_texel_offset) / zoom
    camera.force_update_scroll()
    hero.position = snap_actor_position(hero.position)
    get_tree().call_group("native_slime_pixels","snap_to_pixels")
func snap_actor_position(point: Vector2) -> Vector2:
    var viewport := get_viewport()
    var to_raster := viewport.get_stretch_transform() * viewport.canvas_transform
    return to_raster.affine_inverse() * (to_raster * point).round()
func pick(point: Vector2) -> Vector2:
    if uses_plaza_v2():return plaza3d.pick(point)
    if is_instance_valid(inn3d):return inn3d.pick(point)
    if world.indoor=="arcana_shop":
        return shop3d.pick(point) if is_instance_valid(shop3d) else world.player_position
    return (get_viewport().canvas_transform.affine_inverse()*point)/4.0
func screen_point(point: Vector2,height: float=0.0) -> Vector2:
    if uses_plaza_v2():return plaza3d.screen_point(point,height)
    if is_instance_valid(inn3d):return inn3d.screen_point(point,height)
    if world.indoor=="arcana_shop" and is_instance_valid(shop3d):return shop3d.screen_point(point,height)
    return get_viewport().canvas_transform*map_point(point,height)
func pick_interaction(point: Vector2) -> Dictionary:
    if uses_plaza_v2():return plaza3d.pick_interaction(point,world)
    if is_instance_valid(inn3d):return inn3d.pick_interaction(point,world.entities)
    if world.indoor=="arcana_shop":
        return shop3d.pick_interaction(point,world) if is_instance_valid(shop3d) else {}
    var local=get_viewport().canvas_transform.affine_inverse()*point
    var found: Dictionary={}
    var best=-INF
    for entry in sprites:
        var sprite: Sprite2D=entry.sprite
        if entry.kind=="city-resident":
            entry.anchor=map_point(sprite.get_parent().map_position())
        if entry.id.is_empty() or not sprite.is_visible_in_tree():continue
        var area=Rect2(to_local(sprite.to_global(sprite.offset)),Vector2(sprite.region_rect.size if sprite.region_enabled else sprite.texture.get_size()))
        if area.has_point(local) and entry.anchor.y>best:
            for entity in world.entities:
                if entity.id==entry.id:found=entity;best=entry.anchor.y
    if found.is_empty() and world.indoor.is_empty():
        var map_position: Vector2 = pick(point)
        for entity in world.entities:
            if entity.kind in ["fishing","campfire"] and map_position.distance_to(entity.pos)<24:
                return entity
    return found
func _ring(radius: float,color: String) -> Line2D:
    var node=Line2D.new();node.width=2;node.default_color=Color(color);node.closed=true;node.z_index=3990
    for i in range(48):node.add_point(Vector2(cos(i*TAU/48),sin(i*TAU/48))*radius*64)
    return node
