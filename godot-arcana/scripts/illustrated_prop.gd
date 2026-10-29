@tool
extends Node3D
## Camera-facing, foot-registered 2D art on the unchanged 3D layout.
const SHADER = preload("res://art/resources/heroine_sprite.gdshader")
const TREE_FADE = preload("res://art/resources/tree_fade.gdshader")
const OUTDOOR_ART = preload("res://art/resources/outdoor_art.gd")
var use_outdoor_art = false
var _world_grid = Vector2.ZERO
const PROP_GROUP = "arcana_prop_occluders"
static var occlusion_masks: Dictionary = {}
const OCCLUDED_OPACITY = .45
var fade_for_player = false
var tree_opacity = 1.0
var uncover_delay = 0.0
var occlusion_mask: Image
var opaque_visual: MeshInstance3D
var faded_visual: MeshInstance3D
var fade_material: ShaderMaterial
const SHADOW = preload("res://art/resources/heroine_shadow.gdshader")
var interaction_id: String = ""
var interaction_region = Rect2()
var interaction_arch_ratio = .25
var interaction_highlighted = false
var hit_image: Image
var asset: Texture2D
var pixel_size = Vector2i(64,80)
var foot = Vector2(32,78)
var shadow_size = Vector2(.7,.35)
var shadow_offset = Vector2.ZERO
var depth_anchor_offset = Vector3.ZERO
var opaque_walkable_area = Rect2()
var spatial_map: Texture2D
var spatial_emission_mask = false
var sprite_material: ShaderMaterial
var contact_material: ShaderMaterial
func _ready() -> void:
    # Keep the original logical canvas, pivot and transforms; replace only outdoor paint.
    if use_outdoor_art and OUTDOOR_ART.ITEMS.has(asset.resource_path):
        asset = OUTDOOR_ART.ITEMS[asset.resource_path]
    else:
        use_outdoor_art = false
    if not Engine.is_editor_hint(): add_to_group("arcana_interaction_art")
    var visual = MeshInstance3D.new()
    var quad = QuadMesh.new()
    quad.size = Vector2(pixel_size)/64.0
    opaque_visual = visual
    visual.mesh = quad
    visual.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
    # Billboard vertices move in the shader; include full art for every camera yaw.
    var radius = maxf(3.0,float(pixel_size.x)/128.0+1.0)
    var height = maxf(7.0,float(pixel_size.y)/64.0+1.0)
    visual.custom_aabb = AABB(Vector3(-radius,-1,-radius),Vector3(radius*2,height+1,radius*2))
    sprite_material = ShaderMaterial.new()
    sprite_material.shader = SHADER
    sprite_material.set_shader_parameter("sprite_sheet",asset)
    sprite_material.set_shader_parameter("sheet_grid",Vector2.ONE)
    sprite_material.set_shader_parameter("frame_cell",Vector2.ZERO)
    sprite_material.set_shader_parameter("foot_offset",(foot.y-float(pixel_size.y)*.5)/64.0)
    sprite_material.set_shader_parameter("editor_preview",Engine.is_editor_hint())
    sprite_material.set_shader_parameter("interaction_region",Vector4(interaction_region.position.x,interaction_region.position.y,interaction_region.size.x,interaction_region.size.y))
    sprite_material.set_shader_parameter("interaction_arch_ratio",interaction_arch_ratio)
    sprite_material.set_shader_parameter("depth_anchor_offset",global_basis*depth_anchor_offset)
    if spatial_map != null:
        sprite_material.set_shader_parameter("spatial_map_enabled",true)
        sprite_material.set_shader_parameter("spatial_emission_mask",spatial_emission_mask)
        sprite_material.set_shader_parameter("spatial_map",spatial_map)
    visual.material_override = sprite_material
    add_child(visual)
    if fade_for_player and not Engine.is_editor_hint():
        # Keep the original opaque depth path for every unaffected prop.
        faded_visual = MeshInstance3D.new()
        faded_visual.name = "OcclusionFade"
        faded_visual.mesh = quad
        faded_visual.custom_aabb = visual.custom_aabb
        faded_visual.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
        fade_material = sprite_material.duplicate()
        fade_material.shader = TREE_FADE
        for parameter in ["sprite_sheet","sheet_grid","frame_cell","foot_offset","editor_preview","spatial_map_enabled","spatial_map","spatial_emission_mask","depth_anchor_offset","interaction_region","interaction_arch_ratio"]:
            fade_material.set_shader_parameter(parameter,sprite_material.get_shader_parameter(parameter))
        faded_visual.material_override = fade_material
        faded_visual.visible = false
        add_child(faded_visual)
        if not occlusion_masks.has(asset): occlusion_masks[asset] = asset.get_image()
        occlusion_mask = occlusion_masks[asset]
        add_to_group(PROP_GROUP)
    var contact = MeshInstance3D.new()
    var disk = PlaneMesh.new()
    disk.size = shadow_size
    contact.mesh = disk
    contact.position = Vector3(shadow_offset.x,.012,shadow_offset.y)
    contact.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
    contact_material = ShaderMaterial.new()
    contact_material.shader = SHADOW
    # Contact shadows sort behind the same depth anchor as their owning sprite.
    # Otherwise a recessed sprite (the academy facade) is shaded by its own disk.
    contact_material.set_shader_parameter("entity_anchor",global_position+global_basis*depth_anchor_offset)
    contact_material.set_shader_parameter("editor_preview",Engine.is_editor_hint())
    contact.material_override = contact_material
    add_child(contact)
    _sync_world_pixel_grid()

func _sync_world_pixel_grid() -> void:
    if not use_outdoor_art: return
    var art_scale = Vector2(global_basis.x.length(),global_basis.y.length())
    var grid = (Vector2(pixel_size)*art_scale).max(Vector2.ONE)
    if grid.is_equal_approx(_world_grid): return
    _world_grid = grid
    for material in [sprite_material,fade_material]:
        if material == null: continue
        material.set_shader_parameter("world_pixel_grid_enabled",true)
        material.set_shader_parameter("world_pixel_grid",grid)
        material.set_shader_parameter("authored_pixel_size",Vector2(pixel_size))
        material.set_shader_parameter("world_pixel_foot_y",foot.y*art_scale.y)

func _process(_delta: float) -> void:
    _sync_world_pixel_grid()
    if contact_material != null: contact_material.set_shader_parameter("entity_anchor",global_position+global_basis*depth_anchor_offset)


func update_player_occlusion(camera: Camera3D, player_anchor: Vector3, player_size: Vector2, delta: float, enabled: bool, immediate: bool = false) -> void:
    if faded_visual == null: return
    var on_walkable_area = _on_walkable_area(player_anchor)
    var blocked = enabled and not on_walkable_area and _covers_player(camera,player_anchor,player_size)
    # A short release delay prevents flicker along isolated leaf-edge pixels.
    if blocked: uncover_delay = .12
    elif on_walkable_area: uncover_delay = 0.0
    else: uncover_delay = maxf(0,uncover_delay-maxf(0,delta)) if enabled else 0.0
    var target = OCCLUDED_OPACITY if blocked or uncover_delay>0 else 1.0
    var speed = 4.0 if target<tree_opacity else 3.0
    var previous_opacity = tree_opacity
    tree_opacity = target if immediate or on_walkable_area else move_toward(tree_opacity,target,maxf(0,delta)*speed)
    if is_equal_approx(tree_opacity,previous_opacity): return
    opaque_visual.visible = tree_opacity>=.999
    faded_visual.visible = not opaque_visual.visible
    fade_material.set_shader_parameter("tree_opacity",tree_opacity)

func set_interaction_highlight(active: bool) -> void:
    if interaction_highlighted == active: return
    interaction_highlighted = active
    for material in [sprite_material,fade_material]:
        if material != null: material.set_shader_parameter("interaction_highlight",active)

func hit_test(camera: Camera3D, screen_point: Vector2, interaction_only: bool = false) -> bool:
    if not is_visible_in_tree() or camera.is_position_behind(global_position): return false
    var ppu = float(camera.get_viewport().size.y)/camera.size
    var scale_xy = Vector2(global_basis.x.length(),global_basis.y.length())*ppu/64.0
    var top_left = camera.unproject_position(global_position)-Vector2(pixel_size.x*.5,foot.y)*scale_xy
    var rect = Rect2(top_left,Vector2(pixel_size)*scale_xy)
    if not rect.has_point(screen_point): return false
    if hit_image == null: hit_image = asset.get_image()
    if hit_image == null or hit_image.is_empty(): return false
    var grid: Vector2 = sprite_material.get_shader_parameter("sheet_grid")
    var cell: Vector2 = sprite_material.get_shader_parameter("frame_cell")
    var uv = (cell+(screen_point-top_left)/rect.size)/grid
    var texel = Vector2i((uv*Vector2(hit_image.get_size())).floor())
    if interaction_only and interaction_region.has_area():
        var pixel = (screen_point-top_left)/rect.size*Vector2(pixel_size)
        if not interaction_region.has_point(pixel): return false
        var p = pixel-interaction_region.position
        var cap = interaction_region.size.y*interaction_arch_ratio
        if p.y < cap:
            var arc = Vector2((p.x-interaction_region.size.x*.5)/(interaction_region.size.x*.5),(p.y-cap)/cap)
            if arc.length_squared() > 1.0: return false
    return hit_image.get_pixel(texel.x,texel.y).a >= .5

func _on_walkable_area(player_anchor: Vector3) -> bool:
    if not opaque_walkable_area.has_area(): return false
    var point = to_local(player_anchor)
    return opaque_walkable_area.grow(.2).has_point(Vector2(point.x,point.z))

func _covers_player(camera: Camera3D, player_anchor: Vector3, player_size: Vector2) -> bool:
    # Match the shader's foot-depth order, including the camera's comparison yaw.
    var toward_camera = Vector2(camera.global_basis.z.x,camera.global_basis.z.z).normalized()
    var depth_anchor = global_transform*depth_anchor_offset
    var separation = Vector2(depth_anchor.x-player_anchor.x,depth_anchor.z-player_anchor.z)
    if separation.dot(toward_camera)<=.015: return false
    if camera.is_position_behind(global_position): return false
    var ppu = float(camera.get_viewport().size.y)/camera.size
    var scale_xy = Vector2(global_basis.x.length(),global_basis.y.length())
    var dot_scale = scale_xy*ppu/64.0
    var tree_rect = Rect2(camera.unproject_position(global_position)-foot*dot_scale,Vector2(pixel_size)*dot_scale)
    var player_foot = camera.unproject_position(player_anchor)
    var player_rect = Rect2(player_foot-Vector2(player_size.x*.5,player_size.y)*ppu,player_size*ppu)
    if not tree_rect.intersects(player_rect): return false
    # Probe the body, not the transparent margins of either sprite rectangle.
    for height in [.15,.40,.65,.90]:
        for side in [-.35,0.0,.35]:
            var point = player_foot+Vector2(float(side)*player_size.x,-float(height)*player_size.y)*ppu
            if not tree_rect.has_point(point): continue
            var mask_uv = (point-tree_rect.position)/tree_rect.size
            var texel = Vector2i((mask_uv*Vector2(occlusion_mask.get_size())).floor())
            if occlusion_mask.get_pixel(texel.x,texel.y).a>=.5: return true
    return false
