extends Node2D
signal camera_updated
const Hero=preload("res://scripts/native_2d_hero.gd")
const MeiFrames=preload("res://art/export/plaza-guide/mei-idle.tres")
const Slime=preload("res://scripts/native_2d_slime.gd")
const Blink=preload("res://scripts/native_2d_blink.gd")
const InnLighting=preload("res://scripts/native_2d_inn_lighting.gd")
const CAMERA_ZOOM=4.0
const MIN_ZOOM_RATIO=.44642857
const MAX_HERO_SCREEN_HEIGHT=.9
const ENEMY_BAR_WIDTH=.9
var world: Node2D
var hero: Node2D
var plaza_slime: Node2D
var hunting_slime: Node2D
var slime: Node2D
var shop2d: Node2D
var camera: Camera2D
var outside: Node2D
var inside: Node2D
var blink: Node2D
var layout: Node2D
var ambience: CanvasModulate
var inn_lobby: Node2D
var render_pixel_scale=1.0
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
var remote_ids: Dictionary={}
var room_bounds=Rect2(0,0,1536,1312)
var display_size=Vector2(384,824)
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
func map_point(point: Vector2,height: float=0.0) -> Vector2:return point*4.0-Vector2(0,height*64)
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
    hunting_slime=Slime.new();add_child(hunting_slime);hunting_slime.position=map_point(Vector2(600,1054))
    slime=hunting_slime
    previous_player=world.player_position
    _register(outside)
func _register(source: Node) -> void:
    for node in source.get_children():
        if node is Sprite2D and node.texture!=null:
            var anchor=node.get_meta("foot",Vector2.ZERO)
            var parent=node.get_parent()
            if parent.get("logical_anchor")!=null:anchor=map_point(parent.map_position())
            if str(node.get_meta("interaction_id",""))=="innkeeper":
                var marker=preload("res://scripts/native_2d_quest_marker.gd").new()
                marker.quest_id="arcana_inn_slimes";marker.progress_flag="arcana_inn_slime_kills"
                source.add_child(marker);marker.position=anchor-Vector2(0,137)
            sprites.append({"sprite":node,"anchor":anchor,"kind":str(parent.get("model_kind")) if parent.get("model_kind")!=null else "","id":str(parent.get("gameplay_id")) if parent.get("gameplay_id")!=null else str(node.get_meta("interaction_id","")),"root":outside if outside.is_ancestor_of(node) else inside})
        _register(node)
func _interior() -> void:
    inn_lobby=null
    for child in inside.get_children():
        if child is CanvasItem:child.hide()
        child.queue_free()
    sprites=sprites.filter(func(entry):return is_instance_valid(entry.sprite) and entry.root==outside)
    outside.visible=world.indoor.is_empty()
    if is_instance_valid(shop2d):shop2d.hide();shop2d.follow_camera.enabled=false
    var name=""
    match world.indoor:
        "arcana_shop":
            if not is_instance_valid(shop2d):shop2d=load("res://scenes/shop_2d.tscn").instantiate();add_child(shop2d)
            camera.enabled=false;shop2d.show();shop2d.follow_camera.enabled=true
            return
        "arcana_inn":name="inn_lobby"
        "arcana_restaurant":name="restaurant"
        "arcana_academy":name="academy_first_floor" if world.academy_floor==1 else "academy_second_floor"
    camera.enabled=true;camera.make_current()
    if not name.is_empty():
        var room=load("res://scenes/native_2d/"+name+".tscn").instantiate()
        inside.add_child(room);_register(room)
        if world.indoor=="arcana_inn":inn_lobby=room
        room_bounds=Rect2()
        for sprite in room.find_children("*","Sprite2D",true,false):
            if sprite.texture==null:continue
            var area=Rect2(sprite.position+sprite.offset,Vector2(sprite.texture.get_size()))
            room_bounds=room_bounds.merge(area) if room_bounds.has_area() else area
func _process(delta: float) -> void:
    if world==null:return
    if world.indoor!=last_interior or world.academy_floor!=last_floor:
        last_interior=world.indoor;last_floor=world.academy_floor;_interior()
    world.input_projection=Transform2D.IDENTITY
    ambience.color=Color.WHITE
    if world.effects_enabled:
        if world.indoor=="arcana_inn":ambience.color=InnLighting.AMBIENT
        elif world.dusk and world.indoor.is_empty():ambience.color=Color("c8c2df")
    if is_instance_valid(inn_lobby):
        inn_lobby.sync_lighting(world.time,world.effects_enabled,world.reduced_motion)
    var motion=world.player_position-previous_player;previous_player=world.player_position
    hero.show();hero.position=map_point(world.bench_visual_position())
    hero.set_bench_pose(world.bench_state,world.bench_age,world.reduced_motion)
    hero.dash_age=world.dash_age;hero.dash_yaw=atan2(world.dash_direction.x,world.dash_direction.y)
    hero.pose(world.time,world.player_gait,world.walking,motion,true,world.effects_enabled and not world.reduced_motion)
    hero.apply_bench_pose()
    blink.update_pose(world.teleport_age,Hero.direction_for_yaw(atan2(world.teleport_direction.x,world.teleport_direction.y),0),map_point(world.teleport_origin),map_point(world.teleport_target),world.effects_enabled,world.reduced_motion)
    hero.visible=not Blink.hides_character(world.teleport_age,world.effects_enabled,world.reduced_motion)
    if world.indoor=="arcana_shop":
        blink.hide();shop2d.sync(world,hero,get_zoom_ratio(),delta,render_pixel_scale);hero.hide();plaza_slime.hide();hunting_slime.hide();camera_updated.emit();return
    blink.show()
    var spatial=world.battle.has("spatial")
    slime=plaza_slime if spatial or world.spatial_selected else hunting_slime
    plaza_slime.sync(world.time,world.battle if spatial else {},world.enemy_visual_hp if spatial else 30.0,false,world.effects_enabled and not world.reduced_motion)
    hunting_slime.sync(world.time,{} if spatial else world.battle,30.0 if spatial else world.enemy_visual_hp,world.impact_remaining>0,world.effects_enabled and not world.reduced_motion)
    plaza_slime.visible=plaza_slime.visible and world.indoor.is_empty()
    hunting_slime.visible=hunting_slime.visible and world.indoor.is_empty()
    enemy_meter_visible=world.indoor.is_empty() and not world.battle.is_empty() and world.battle.get("phase","") not in ["victory","defeat"]
    if world.enemy_visual_hp>enemy_last_hp:enemy_trail_hp=world.enemy_visual_hp
    else:enemy_trail_hp=move_toward(enemy_trail_hp,world.enemy_visual_hp,delta*15)
    enemy_last_hp=world.enemy_visual_hp
    var draws: Array[Dictionary]=[]
    for entry in sprites:
        if not is_instance_valid(entry.sprite) or not entry.sprite.is_visible_in_tree():continue
        var sprite: Sprite2D=entry.sprite
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
            draws.append({"node":sprite,"y":anchor.y})
            var rect=Rect2(to_local(sprite.to_global(sprite.offset)),Vector2(sprite.region_rect.size if sprite.region_enabled else sprite.texture.get_size()))
            var body=Rect2(hero.position+Vector2(-24,-96),Vector2(48,84))
            var covered=anchor.y>=hero.position.y and rect.intersects(body)
            sprite.modulate.a=move_toward(sprite.modulate.a,.45 if covered else 1.0,delta*5)
    for node in [hero,plaza_slime,hunting_slime]:draws.append({"node":node,"y":node.position.y})
    for child in get_children():
        if child is Node2D and child.get_script()==Hero and child!=hero:draws.append({"node":child,"y":child.position.y})
    draws.sort_custom(func(a,b):return a.y<b.y)
    for i in draws.size():draws[i].node.z_index=i+1
    _camera()
    camera_updated.emit()
func _camera() -> void:
    var viewport=get_viewport();var size=Vector2(viewport.size)
    var zoom=render_pixel_scale
    var target=hero.position-Vector2(0,50)
    # Camera scale comes from final presentation pixels, for every room and outdoors.
    # Fit a room only when it already fits at the player's chosen zoom.
    if not world.indoor.is_empty():
        var half=size/(2.0*zoom)
        target.x=room_bounds.get_center().x if room_bounds.size.x<=half.x*2 else clampf(target.x,room_bounds.position.x+half.x,room_bounds.end.x-half.x)
        target.y=room_bounds.get_center().y if room_bounds.size.y<=half.y*2 else clampf(target.y,room_bounds.position.y+half.y,room_bounds.end.y-half.y)
    camera.zoom=Vector2.ONE*zoom;camera.position=target;camera.force_update_scroll()
    var canvas=viewport.canvas_transform;var stretch=viewport.get_stretch_transform()
    var origin=stretch*canvas.origin
    camera.position-=(stretch.affine_inverse()*origin.round()-canvas.origin)/zoom
    camera.force_update_scroll()
    var final=stretch*viewport.canvas_transform
    hero.position=final.affine_inverse()*(final*hero.position).round()
    get_tree().call_group("native_slime_pixels","snap_to_pixels")
func pick(point: Vector2) -> Vector2:
    if world.indoor=="arcana_shop":return shop2d.pick(point)
    return (get_viewport().canvas_transform.affine_inverse()*point)/4.0
func screen_point(point: Vector2,height: float=0.0) -> Vector2:
    if world.indoor=="arcana_shop":return shop2d.screen_point(point,height)
    return get_viewport().canvas_transform*map_point(point,height)
func pick_interaction(point: Vector2) -> Dictionary:
    if world.indoor=="arcana_shop":return shop2d.pick_interaction(point,world)
    var local=get_viewport().canvas_transform.affine_inverse()*point
    var found: Dictionary={}
    var best=-INF
    for entry in sprites:
        var sprite: Sprite2D=entry.sprite
        if entry.id.is_empty() or not sprite.is_visible_in_tree():continue
        var area=Rect2(to_local(sprite.to_global(sprite.offset)),Vector2(sprite.region_rect.size if sprite.region_enabled else sprite.texture.get_size()))
        if area.has_point(local) and entry.anchor.y>best:
            for entity in world.entities:
                if entity.id==entry.id:found=entity;best=entry.anchor.y
    return found
func _ring(radius: float,color: String) -> Line2D:
    var node=Line2D.new();node.width=2;node.default_color=Color(color);node.closed=true;node.z_index=3990
    for i in range(48):node.add_point(Vector2(cos(i*TAU/48),sin(i*TAU/48))*radius*64)
    return node
