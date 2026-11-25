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
const MeadowField := preload("res://scenes/native_2d/meadow_field.tscn")
const MeadowOx := preload("res://scripts/native_2d_meadow_ox.gd")
const WorldDisplay = preload("res://scripts/services/world_display_settings.gd")
const ScenePreset := preload("res://scripts/rendering/inn_shader_preset.gd")
const TileStyle := preload("res://scripts/rendering/tile_world_style.gd")
const Coordinates := preload("res://scripts/native_2d_coordinates.gd")
const ROOM_VISUALS := {
    "arcana_inn": "res://scenes/inn_lobby_3d.tscn",
    "arcana_restaurant": "res://scenes/restaurant_3d.tscn",
}
const CAMERA_ZOOM=4.0
const MIN_ZOOM_RATIO = 0.25
const MAX_HERO_SCREEN_HEIGHT=.9
const ENEMY_BAR_WIDTH=.9
var world: Node2D
var hero: Node2D
var plaza_slime: Node2D
var hunting_slime: Node2D
var slime: Node2D
var meadow_ox: Node2D
var meadow_field: Node2D
var shop3d: Node3D
var room3d: Node3D
var show_home_upper_walls: bool = false:
    set(value):
        show_home_upper_walls = value
        if is_instance_valid(room3d) and room3d.has_method("set_upper_walls_visible"):
            room3d.set_upper_walls_visible(value)
var plaza3d: Node3D
var _plaza_area: Node
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
var presentation_minimum := WorldDisplay.pixel_size(TileStyle.REFERENCE_PIXEL_SIZE)
var presentation_pixel_size := 1
var camera_texel_offset := Vector2.ZERO
var _approved_preset := ScenePreset.load_approved() as ScenePreset
var _approved_shadows_active := false
var _physical_size := Vector2i.ZERO
var _capture_zoom_ratio := 1.0
var _visible_raster := Vector2.ZERO
var camera_zoom=4.0
var base_camera_zoom=4.0
var pixelated=true
var quarter_view=false
var last_interior="__boot__"
var last_floor=0
var last_meadow_active := false
var previous_player=Vector2.ZERO
var enemy_meter_visible=false
var enemy_trail_hp=30.0
var enemy_last_hp=30.0
var sprites: Array[Dictionary]=[]
var occlusion_masks: Dictionary={}
var remote_ids: Dictionary={}
var room_bounds=Rect2(0,0,1536,1312)
var display_size=Vector2(824,384)
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

func maximum_zoom_ratio() -> float:
    var hero_height: float = Hero.SPEC.SOURCE_HEIGHT * 2.0 * base_camera_zoom / CAMERA_ZOOM
    return display_size.y * MAX_HERO_SCREEN_HEIGHT / hero_height

func set_zoom_ratio(value: float) -> void:
    camera_zoom = base_camera_zoom * clampf(value, MIN_ZOOM_RATIO, maxf(MIN_ZOOM_RATIO, maximum_zoom_ratio()))
func get_zoom_ratio() -> float:return camera_zoom/base_camera_zoom
func set_display_size(size: Vector2) -> void:
    var ratio=get_zoom_ratio()
    display_size=size
    base_camera_zoom=2.0 if size.x<size.y else 4.0
    set_zoom_ratio(ratio)
func set_render_pixel_scale(value: float) -> void:render_pixel_scale=maxf(.01,value)
func set_quarter_view(_value: bool) -> void:quarter_view=false
func view_yaw() -> float:
    if is_instance_valid(room3d):
        return room3d.camera.rotation.y
    if is_instance_valid(shop3d):
        return shop3d.camera.rotation.y
    return plaza3d.camera.rotation.y if uses_plaza_v2() else 0.0
func map_point(point: Vector2, height: float = 0.0) -> Vector2:
    var active_camera: Camera3D = room3d.camera if is_instance_valid(room3d) else null
    if uses_plaza_v2() and is_instance_valid(plaza3d.camera):
        active_camera = plaza3d.camera
        height += plaza3d.ground_height_at(point) * absf(active_camera.basis.y.y)
    if is_zero_approx(height): return Coordinates.canvas(point)
    if active_camera == null:
        return Coordinates.canvas(point, height)
    var basis := active_camera.basis
    var ground_projection := Transform2D(Vector2(basis.x.x, -basis.y.x),
        Vector2(basis.x.z, -basis.y.z), Vector2.ZERO)
    # Raised effects move up on screen while their ground coordinates stay fixed.
    return Coordinates.canvas(point) + ground_projection.affine_inverse().basis_xform(
        Vector2.UP * height * Coordinates.SOURCE_UNIT)
func uses_plaza_v2() -> bool:
    return world.indoor.is_empty() and not world.meadow_active and world.uses_plaza_v2() and is_instance_valid(plaza3d)

func set_slime_target_outline(enabled: bool) -> void:
    var plaza_active := uses_plaza_v2()
    plaza_slime.set_target_outline(enabled and not plaza_active and not world.meadow_active)
    meadow_ox.set_target_outline(enabled and world.meadow_active)
    if is_instance_valid(plaza3d):
        plaza3d.set_slime_target_outline(enabled and plaza_active)

func set_physical_size(size: Vector2i, capture_zoom_ratio: float = 1.0) -> void:
    _physical_size = size
    _capture_zoom_ratio = capture_zoom_ratio

func uses_approved_3d() -> bool:
    return uses_plaza_v2() or is_instance_valid(shop3d) or is_instance_valid(room3d)

func _update_directional_shadows(active: bool) -> void:
    if active == _approved_shadows_active:
        return
    _approved_shadows_active = active
    var base_size := int(ProjectSettings.get_setting(ScenePreset.SHADOW_SIZE_SETTING, 4096))
    var use_16_bits := bool(ProjectSettings.get_setting(ScenePreset.SHADOW_DEPTH_SETTING, false))
    var atlas_size := _approved_preset.directional_shadow_size if active else base_size
    RenderingServer.directional_shadow_atlas_set_size(atlas_size, use_16_bits)

func _exit_tree() -> void:
    _update_directional_shadows(false)

func _prepare_raster() -> void:
    if _physical_size == Vector2i.ZERO:
        return
    var physical := Vector2(_physical_size)
    if uses_plaza_v2():
        presentation_pixel_size = plaza3d.prepare_presentation_scale(get_zoom_ratio(), physical.y)
    elif is_instance_valid(room3d):
        presentation_pixel_size = room3d.presentation_pixel_size(get_zoom_ratio(), physical.y)
    elif is_instance_valid(shop3d):
        presentation_pixel_size = TileStyle.presentation_scale(get_zoom_ratio())
    elif _uses_tile_canvas_scale():
        presentation_pixel_size = maxi(presentation_minimum, TileStyle.presentation_scale(get_zoom_ratio()))
    else:
        presentation_pixel_size = WorldDisplay.camera_pixel_size(presentation_minimum, render_pixel_scale)
    _visible_raster = physical / presentation_pixel_size
    # Keep the camera's follow bounds at the normal framing and capture extra world around it.
    var raster_size := WorldDisplay.padded_raster_size(_visible_raster / _capture_zoom_ratio)
    var viewport := get_viewport() as SubViewport
    if viewport.size != raster_size:
        viewport.size = raster_size

func _ready() -> void:
    texture_filter=CanvasItem.TEXTURE_FILTER_NEAREST
    layout=world.layout;outside=layout;add_child(outside)
    meadow_field = MeadowField.instantiate() as Node2D
    meadow_field.hide()
    add_child(meadow_field)
    meadow_ox = MeadowOx.new()
    meadow_ox.hide()
    add_child(meadow_ox)
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

var _world_art_material: ShaderMaterial

func _highlight_world_art(art: CanvasItem) -> void:
    if art.material != null or art.use_parent_material:
        return
    if world.uses_plaza_v2() and outside.is_ancestor_of(art):
        return
    if _world_art_material == null:
        _world_art_material = ShaderMaterial.new()
        _world_art_material.shader = preload("res://art/resources/world_art_highlight.gdshader")
        _world_art_material.set_shader_parameter("highlight_strength", TileStyle.HIGHLIGHT_STRENGTH)
    art.material = _world_art_material

func _register(source: Node) -> void:
    for node in source.get_children():
        if node is TileMapLayer:
            if node.has_method("prepare_runtime_visuals"):
                node.prepare_runtime_visuals()
            elif source.name == &"Ground":
                _highlight_world_art(node)
        if node is Sprite2D and node.texture!=null:
            var placed_visual := node.name == &"Visual" and source.has_method("map_position")
            if placed_visual or node.has_meta("foot") or node.has_meta("native_wall") or str(node.name).begins_with("PaintedRoomFloor"):
                _highlight_world_art(node)
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
func _add_region_3d(scene: Node3D) -> void:
    if not world.uses_plaza_v2():
        add_child(scene)
        return
    if not is_instance_valid(_plaza_area):
        # The plaza owns both views, so hiding the exterior leaves interiors visible.
        _plaza_area = Node.new()
        _plaza_area.name = "Plaza"
        add_child(_plaza_area)
    _plaza_area.add_child(scene)

func _interior() -> void:
    if is_instance_valid(shop3d):
        shop3d.get_parent().remove_child(shop3d)
        shop3d.queue_free()
        shop3d=null
    if is_instance_valid(room3d):
        room3d.get_parent().remove_child(room3d)
        room3d.queue_free()
        room3d=null
    inn_lobby=null
    academy_room=null
    for child in inside.get_children():
        if child is CanvasItem:child.hide()
        child.queue_free()
    sprites=sprites.filter(func(entry):return is_instance_valid(entry.sprite) and entry.root==outside)
    var in_meadow: bool = world.indoor.is_empty() and world.meadow_active
    meadow_field.visible = in_meadow
    meadow_ox.hide()
    if in_meadow:
        meadow_ox.position = (meadow_field.get_node("MeadowOxSpawn") as Marker2D).position
    outside.visible=world.indoor.is_empty() and not in_meadow and not world.uses_plaza_v2()
    if world.indoor.is_empty() and not in_meadow and world.uses_plaza_v2():
        camera.enabled=false
        get_viewport().disable_3d=false
        if not is_instance_valid(plaza3d):
            plaza3d=PlazaV2.instantiate()
            plaza3d.set("live_mode", true)
            _add_region_3d(plaza3d)
        plaza3d.set_live_active(true)
        return
    if is_instance_valid(plaza3d):plaza3d.set_live_active(false)
    if ROOM_VISUALS.has(world.indoor) and _open_3d_room(world.indoor):
        return
    if world.indoor=="arcana_home" or world.uses_academy_first_floor_layout():
        if not _open_3d_room(world.indoor):
            push_error("Could not open the 3D region: " + world.indoor)
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
        shop3d.use_approved_rendering = true
        _add_region_3d(shop3d)
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

func _open_3d_room(location: String) -> bool:
    var registry = preload("res://scripts/region_registry.gd")
    var floor_number: int = world.academy_floor if location == "arcana_academy" else 1
    var visual: PackedScene = load(ROOM_VISUALS[location]) if ROOM_VISUALS.has(location) else registry.scene(location, floor_number)
    if visual == null:
        return false
    var layout_root: Node2D
    if ROOM_VISUALS.has(location):
        var authored: PackedScene = registry.scene(location)
        if authored == null:
            return false
        layout_root = authored.instantiate() as Node2D
        if layout_root == null:
            return false
    var candidate := visual.instantiate() as Node3D
    if candidate == null:
        if layout_root != null: layout_root.free()
        return false
    camera.enabled=false
    get_viewport().canvas_transform=Transform2D.IDENTITY
    get_viewport().disable_3d=false
    _add_region_3d(candidate)
    var ready: bool = candidate.configure(layout_root, registry.camera_bounds(location, floor_number))
    if layout_root != null: layout_root.free()
    if not ready or not candidate.apply_approved_rendering():
        candidate.free()
        return false
    room3d=candidate
    room3d.camera.make_current()
    if location == "arcana_home":
        room3d.set_upper_walls_visible(show_home_upper_walls)
    elif location == "arcana_inn":
        var marker := preload("res://scripts/native_2d_quest_marker.gd").new()
        marker.quest_id="arcana_inn_slimes"
        marker.progress_flag="arcana_inn_slime_kills"
        inside.add_child(marker)
        marker.transform=room3d.innkeeper_marker_transform()
    return true

func _process(delta: float) -> void:
    if world==null:return
    if world.indoor!=last_interior or world.academy_floor!=last_floor or world.meadow_active!=last_meadow_active:
        last_interior=world.indoor;last_floor=world.academy_floor
        last_meadow_active=world.meadow_active
        _interior()
        set_zoom_ratio(get_zoom_ratio())
        _update_directional_shadows(uses_approved_3d())
    var plaza_active := uses_plaza_v2()
    var room_3d_active := is_instance_valid(room3d)
    var in_meadow := meadow_field.visible
    _prepare_raster()
    camera_texel_offset = Vector2.ZERO
    if not plaza_active and not in_meadow and is_instance_valid(city_life):city_life.sync_city_life(world,delta)
    if not plaza_active and not in_meadow and is_instance_valid(river):river.sync_river(world)
    sunlight.visible=world.indoor.is_empty() and not plaza_active and not in_meadow and world.effects_enabled
    world.input_projection = Transform2D.IDENTITY
    if plaza_active:
        world.input_projection = plaza3d.input_projection()
    elif room_3d_active:
        world.input_projection = room3d.input_projection()
    elif is_instance_valid(shop3d):
        world.input_projection = shop3d.input_projection()
    ambience.color=Color.WHITE
    if world.effects_enabled:
        if world.indoor=="arcana_inn" and not room_3d_active:ambience.color=InnLighting.AMBIENT
        elif world.indoor=="arcana_academy" and not room_3d_active:ambience.color=AcademyLighting.AMBIENT
        elif world.indoor.is_empty():ambience.color=Color("929bb0") if world.dusk else Color("f5f1e9")
    if is_instance_valid(inn_lobby):
        inn_lobby.sync_lighting(world.time,world.effects_enabled,world.reduced_motion)
    if is_instance_valid(academy_room):
        academy_room.sync_lighting(world.time,world.effects_enabled,world.reduced_motion)
    var motion=world.player_position-previous_player;previous_player=world.player_position
    var foot: Vector2 = world.bench_visual_position()
    hero.show();hero.position=map_point(foot)
    if plaza_active: hero.set_meta("plaza_foot", foot)
    hero.set_contact_shadow_enabled(not plaza_active)
    hero.set_bench_pose(world.bench_state,world.bench_age,world.reduced_motion)
    hero.set_camera_yaw(view_yaw())
    hero.dash_age=world.dash_age;hero.dash_yaw=atan2(world.dash_direction.x,world.dash_direction.y)
    hero.move_strength = world.player_move_strength
    hero.pose(world.time,world.player_gait,world.walking,motion,true,world.effects_enabled and not world.reduced_motion,true,world.last_move_direction)
    hero.apply_bench_pose()
    blink.update_pose(world.teleport_age,Hero.direction_for_yaw(atan2(world.teleport_direction.x,world.teleport_direction.y),view_yaw()),map_point(world.teleport_origin),map_point(world.teleport_target),world.effects_enabled,world.reduced_motion)
    hero.visible=not Blink.hides_character(world.teleport_age,world.effects_enabled,world.reduced_motion)
    if world.indoor=="arcana_shop":
        if is_instance_valid(shop3d):
            shop3d.presentation_minimum=presentation_minimum
            shop3d.sync(world,hero,get_zoom_ratio(),pixelated,_visible_raster)
            camera_texel_offset = shop3d.camera_texel_offset
        blink.hide();hero.hide();plaza_slime.hide();hunting_slime.hide();camera_updated.emit();return
    if room_3d_active:
        room3d.presentation_minimum=presentation_minimum
        room3d.sync(world,hero,get_zoom_ratio(),pixelated,_visible_raster)
        camera_texel_offset=room3d.camera_texel_offset
        get_viewport().canvas_transform=room3d.canvas_projection()
        update_blink_projection(blink)
        enemy_meter_visible=false
        hero.hide();plaza_slime.hide();hunting_slime.hide();blink.show()
        camera_updated.emit()
        return
    blink.show()
    var spatial=world.battle.has("spatial")
    slime=plaza_slime if spatial or world.spatial_selected else hunting_slime
    var plaza_slime_visible := false
    if in_meadow:
        plaza_slime.hide()
        hunting_slime.hide()
        meadow_ox.visible = world.battle.is_empty() or (world.enemy_visual_hp > 0.0 and world.battle.get("phase", "") not in ["victory", "defeat"])
        if meadow_ox.visible:
            meadow_ox.sync_combat_pose(world.battle.get("spatial", {}))
    else:
        plaza_slime.sync(world.time,world.battle if spatial else {},world.enemy_visual_hp if spatial else 30.0,false,world.effects_enabled and not world.reduced_motion)
        hunting_slime.sync(world.time,{} if spatial else world.battle,30.0 if spatial else world.enemy_visual_hp,world.impact_remaining>0,world.effects_enabled and not world.reduced_motion)
        plaza_slime_visible = plaza_slime.visible and world.indoor.is_empty()
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
    var actors: Array[Node2D] = [hero]
    if in_meadow:
        draws.append({"node":meadow_ox,"y":meadow_ox.position.y})
    elif not plaza_active:
        actors.append(plaza_slime)
        actors.append(hunting_slime)
    for child in get_children():
        if child is Node2D and child.get_script()==Hero and child!=hero:
            child.set_contact_shadow_enabled(not plaza_active)
            actors.append(child)
            draws.append({"node":child,"y":float(child.get_meta("seat_sort_y",child.position.y))})
    for child in get_children():
        if child is Node2D and child.get_meta("campfire",false) and child.visible:draws.append({"node":child,"y":child.position.y})
    if plaza_active:
        var depth_axis := Vector2(sin(view_yaw()), cos(view_yaw()))
        for entry: Dictionary in draws:
            entry.y = depth_axis.dot(Vector2(entry.node.position.x, entry.y))
    draws.sort_custom(func(a,b):return a.y<b.y)
    for i in draws.size():draws[i].node.z_index=i+1
    if plaza_active:
        var jump_progress: float = plaza_slime.spatial_action_progress(world.battle.get("spatial", {}))
        plaza3d.sync_live_slime(plaza_slime.position / 4.0, plaza_slime_visible, world.battle,
            jump_progress, world.effects_enabled and not world.reduced_motion, delta)
        plaza3d.sync_live(world.player_position, get_zoom_ratio(), _visible_raster, delta, world.teleport_age >= 0.0 or world.reduced_motion, world.effects_enabled and not world.reduced_motion)
        camera_texel_offset = plaza3d.camera_texel_offset
        get_viewport().canvas_transform = plaza3d.canvas_projection()
        var avatar_stretch := TileStyle.AVATAR_UPRIGHT_SCALE * absf(plaza3d.camera.basis.y.y)
        var avatar_scale := TileStyle.AVATAR_PIXEL_SIZE * Coordinates.SOURCE_UNIT
        _sync_canvas_actor_art(_upright_canvas_basis(avatar_stretch, avatar_scale))
        update_blink_projection(blink)
        hero.position = snap_actor_position(hero.position)
        # Online presence updates the other actors later in this frame.
        _sync_plaza_actor_shadows.call_deferred(actors)
        camera_updated.emit()
        return
    _sync_canvas_actor_art(Transform2D.IDENTITY)
    update_blink_projection(blink)
    _camera()
    sunlight.sync(sprites,actors,sunlight.visible,world.dusk)
    camera_updated.emit()

func _sync_plaza_actor_shadows(actors: Array[Node2D]) -> void:
    if uses_plaza_v2():
        plaza3d.sync_actor_shadows(actors, world.effects_enabled)
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
func _upright_canvas_basis(height_scale: float = 1.0, avatar_scale: float = 1.0) -> Transform2D:
    var projection := get_viewport().canvas_transform
    var ground := Transform2D(projection.x, projection.y, Vector2.ZERO)
    var raster_scale := Vector2(projection.x.x, projection.y.x).length() * avatar_scale
    return ground.affine_inverse() * Transform2D(Vector2.RIGHT * raster_scale,
        Vector2.DOWN * raster_scale * height_scale, Vector2.ZERO)

func _sync_canvas_actor_art(basis: Transform2D) -> void:
    # Keep the actor's ground anchor in world coordinates.
    for child in get_children():
        if child is Node2D and child.get_script() == Hero:
            child.art.transform = Transform2D(basis.x, basis.y, child.art.position)

func update_blink_projection(effect: Node2D) -> void:
    var upright := _upright_canvas_basis() if uses_plaza_v2() or is_instance_valid(room3d) else Transform2D.IDENTITY
    effect.set_art_transform(upright)

func _uses_tile_canvas_scale() -> bool:
    return world.indoor == "arcana_academy" or world.indoor == "arcana_restaurant"

func _camera() -> void:
    var viewport=get_viewport()
    var size := _visible_raster if _visible_raster != Vector2.ZERO else Vector2(viewport.size)
    var display_scale: float = render_pixel_scale
    if _uses_tile_canvas_scale():
        # Match 3D world-unit width while keeping the 2D drawings' projection.
        display_scale = TileStyle.DOTS_PER_TILE * TileStyle.REFERENCE_PIXEL_SIZE / Coordinates.SOURCE_UNIT * get_zoom_ratio()
    var zoom := display_scale / presentation_pixel_size
    var target=hero.position-Vector2(0,50)
    if fishing_view:target.x+=size.x*.22/maxf(.01,zoom)
    # Camera scale comes from final presentation pixels, for every room and outdoors.
    # Fit a room only when it already fits inside the camera's framing.
    if meadow_field.visible or not world.indoor.is_empty():
        var bounds: Rect2 = room_bounds
        if meadow_field.visible: bounds = Rect2(Vector2.ZERO, world.MEADOW_BOUNDS.size * Coordinates.SOURCE_PER_LOGICAL)
        var half=size/(2.0*zoom)
        target.x=bounds.get_center().x if bounds.size.x<=half.x*2 else clampf(target.x,bounds.position.x+half.x,bounds.end.x-half.x)
        target.y=bounds.get_center().y if bounds.size.y<=half.y*2 else clampf(target.y,bounds.position.y+half.y,bounds.end.y-half.y)
    camera.zoom=Vector2.ONE*zoom;camera.position=target;camera.force_update_scroll()
    var canvas=viewport.canvas_transform;var stretch=viewport.get_stretch_transform()
    var origin=stretch*canvas.origin
    camera_texel_offset = origin - (origin + Vector2.ONE * 0.5).floor()
    camera.position += stretch.affine_inverse().basis_xform(camera_texel_offset) / zoom
    camera.force_update_scroll()
    hero.position = snap_actor_position(hero.position)
    get_tree().call_group("native_slime_pixels","snap_to_pixels")
    if meadow_field.visible and meadow_ox.visible:
        meadow_ox.snap_to_pixels()
func snap_actor_position(point: Vector2) -> Vector2:
    var viewport := get_viewport()
    var to_raster := viewport.get_stretch_transform() * viewport.canvas_transform
    return to_raster.affine_inverse() * (to_raster * point).round()
func pick(point: Vector2) -> Vector2:
    if uses_plaza_v2():return plaza3d.pick(point)
    if is_instance_valid(room3d):return room3d.pick(point)
    if world.indoor=="arcana_shop":
        return shop3d.pick(point) if is_instance_valid(shop3d) else world.player_position
    return (get_viewport().canvas_transform.affine_inverse()*point)/4.0
func screen_point(point: Vector2,height: float=0.0) -> Vector2:
    if uses_plaza_v2():return plaza3d.screen_point(point,height)
    if is_instance_valid(room3d):return room3d.screen_point(point,height)
    if world.indoor=="arcana_shop" and is_instance_valid(shop3d):return shop3d.screen_point(point,height)
    return get_viewport().canvas_transform*map_point(point,height)
func actor_label_point(point: Vector2) -> Vector2:
    var active_camera: Camera3D
    if uses_plaza_v2():
        active_camera = plaza3d.camera
    elif is_instance_valid(room3d):
        active_camera = room3d.camera
    elif is_instance_valid(shop3d):
        active_camera = shop3d.camera
    else:
        return screen_point(point, 2.1)
    var offset := active_camera.unproject_position(Vector3.UP * TileStyle.AVATAR_HEIGHT) \
        - active_camera.unproject_position(Vector3.ZERO)
    return screen_point(point) + offset
func pick_interaction(point: Vector2) -> Dictionary:
    if uses_plaza_v2():return plaza3d.pick_interaction(point,world)
    if is_instance_valid(room3d):return room3d.pick_interaction(point,world.entities)
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
        var sprite_point: Vector2 = sprite.to_local(to_global(local))
        if sprite.get_rect().has_point(sprite_point) and entry.anchor.y>best:
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
