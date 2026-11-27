@tool
extends Polygon2D
## Uses the saved plaza layout in both the editor and the game.
const FountainGround = preload("res://art/resources/fountain_ground.generated.gd")
func _ready() -> void:
    material = material.duplicate()
    sync_layout()

func sync_layout() -> void:
    var layout = get_parent().get_parent()
    layout.refresh_plan()
    var floor_material = material as ShaderMaterial
    floor_material.set_shader_parameter("city_plaza", Vector4(layout.plaza_center.x, layout.plaza_center.y, layout.plaza_radii.x, layout.plaza_radii.y) * 16.0)
    floor_material.set_shader_parameter("city_mosaic_center", layout.mosaic_center * 16.0)
    # Native 2D needs the final screen ellipse, not the old 3D X/Z span.
    var mosaic_texture: Texture2D = floor_material.get_shader_parameter("fountain_paving")
    if mosaic_texture != null:
        var width: float = float(mosaic_texture.get_width()) / 64.0
        floor_material.set_shader_parameter("fountain_paving_span", Vector2(width, width * FountainGround.BASIN_RATIO))
    var paving = PackedVector4Array()
    paving.resize(24)
    for i in mini(layout.paved_areas.size(), 24):
        var rect: Rect2 = layout.paved_areas[i]
        paving[i] = Vector4(rect.position.x, rect.position.y, rect.size.x, rect.size.y) * 16.0
    floor_material.set_shader_parameter("city_paving", paving)
    floor_material.set_shader_parameter("city_paving_count", mini(layout.paved_areas.size(), 24))
    var gardens = PackedVector4Array()
    gardens.resize(8)
    for i in mini(layout.garden_areas.size(), 8):
        var rect: Rect2 = layout.garden_areas[i]
        gardens[i] = Vector4(rect.position.x, rect.position.y, rect.size.x, rect.size.y) * 16.0
    floor_material.set_shader_parameter("city_gardens", gardens)
    floor_material.set_shader_parameter("city_garden_count", mini(layout.garden_areas.size(), 8))
