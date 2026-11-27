@tool
extends Node2D
## A small authored city quarter; all decoration stays editable in the scene.
const BREEZE = preload("res://art/resources/native_2d_city_breeze.gdshader")
const CORNERS = {
    "city_market_stall": {
        "text": "푸른 차양 아래에 과일 바구니와 작은 병들이 줄지어 있습니다. 상인이 병 하나를 햇빛에 비춰 본 뒤, 그늘진 선반으로 옮깁니다. 골목 끝에서는 분수의 금빛 고리가 지붕 사이로 보입니다.",
        "walk": "분수 쪽으로 걸어간다", "target": Vector2(576, 550)
    },
    "city_cafe_terrace": {
        "text": "파라솔 가장자리에 나뭇잎 그림자가 걸려 있습니다. 탁자 너머로 여관의 문이 보이고, 광장 쪽 길에는 꽃상자가 이어집니다. 그늘에 놓인 의자 옆으로는 사람이 지날 자리가 비어 있습니다.",
        "walk": "여관 입구로 걸어간다", "target": Vector2(296, 786)
    },
    "city_garden_corner": {
        "text": "학교 앞 화분 사이로 작은 나비가 날아듭니다. 낮은 생울타리 뒤에는 나무 그늘이 있고, 길 건너 벤치 앞은 비어 있습니다. 동쪽 길을 따라가면 정원 가장자리를 돌아 다시 광장으로 이어집니다.",
        "walk": "정원 벤치 쪽으로 걸어간다", "target": Vector2(992, 582)
    },
    "city_walker_market": {
        "text": "주민이 걸음을 멈추고 차양 쪽으로 몸을 돌립니다. “시장 보러 오셨어요? 상점과 여관 사이 골목으로 들어가 보세요. 분수만 보고 지나가면 놓치기 쉬워요.”",
        "walk": "시장 골목으로 걸어간다", "target": Vector2(364, 552)
    },
    "city_walker_fountain": {
        "text": "산책하던 주민이 분수 쪽을 가리킵니다. “저녁에는 등불이 켜져서 이 길이 또 달라 보여요. 낮에는 식당 앞 그늘이 걷기 좋고요.”",
        "walk": "식당 앞까지 걸어간다", "target": Vector2(608, 408)
    },
    "city_walker_inn": {
        "text": "여행자가 망토 끝을 정리하며 길 가장자리로 비켜섭니다. “여관은 저쪽이에요. 안에 들어가시면 벽난로 곁에서 쉴 수 있어요. 저는 남문까지 한 바퀴 더 돌려고요.”",
        "walk": "여관 앞 쉼터로 걸어간다", "target": Vector2(420, 788)
    },
    "city_walker_school": {
        "text": "학교를 향해 걷던 방문객이 잠시 멈춥니다. “정원 길로 돌아가 보셨어요? 광장에서는 나무에 가려 보이지 않는 자리가 있어요.”",
        "walk": "학교 정원을 둘러본다", "target": Vector2(812, 528)
    }
}
class LampPools extends Node2D:
    var lamps: PackedVector2Array = PackedVector2Array()
    var brightness: float = 0.0
    func _draw() -> void:
        if brightness <= 0.0: return
        for point in lamps:
            for ring in range(5, 0, -1):
                draw_circle(point, ring * 13.0, Color(1.0, 0.70, 0.31, brightness * 0.018))

var residents: Array[Node2D] = []
var tree_points: PackedVector2Array = PackedVector2Array()
var flower_points: PackedVector2Array = PackedVector2Array()
var lamp_points: PackedVector2Array = PackedVector2Array()
var lamp_heads: PackedVector2Array = PackedVector2Array()
var breeze_material: ShaderMaterial
var pools: LampPools
var clock: float = 0.0
var dusk: bool = false
var motion_enabled: bool = true
var effects: bool = true
var steps: Array = []
var configured: bool = false

func configure(layout: Node2D) -> void:
    if configured: return
    configured = true
    z_index = 3800
    breeze_material = ShaderMaterial.new()
    breeze_material.shader = BREEZE
    for placement in layout.placements():
        if placement.has_method("sync_city"):
            residents.append(placement)
        var sprite: Sprite2D = placement.get_node_or_null("Visual") as Sprite2D
        if sprite == null: continue
        var kind: String = placement.model_kind
        if kind in ["oak", "birch"] and placement.position.y < 3100.0:
            tree_points.append(placement.position)
        if kind in ["flowers", "flowerbed", "flowerpot"] and placement.position.y < 3000.0:
            flower_points.append(placement.position)
        if kind == "lamp-post":
            lamp_points.append(placement.position)
            lamp_heads.append(placement.position + sprite.offset + Vector2(sprite.texture.get_width() * 0.5, sprite.texture.get_height() * 0.27))
        if kind in ["oak", "birch", "spruce", "flowers", "flowerbed"] and sprite.material == null:
            sprite.material = breeze_material
    # Counter the atmosphere parent's overlay order for ordinary scene objects.
    for placement in get_children():
        if placement is Node2D: placement.z_as_relative = false
    pools = LampPools.new()
    pools.name = "EveningLampPools"
    pools.lamps = lamp_points
    pools.z_index = -18
    pools.z_as_relative = false
    add_child(pools)

func sync_city_life(world: Node2D, delta: float) -> void:
    if not configured: return
    var outdoors: bool = world.indoor.is_empty()
    for resident in residents:
        if outdoors: resident.sync_city(world, delta, residents)
    var active_effects: bool = outdoors and world.effects_enabled
    var animate: bool = active_effects and not world.reduced_motion
    clock = world.time if animate else 0.0
    breeze_material.set_shader_parameter("wind_time", clock)
    breeze_material.set_shader_parameter("wind_strength", 1.0 if animate else 0.0)
    if effects != active_effects or dusk != world.dusk or motion_enabled != animate or animate:
        effects = active_effects
        dusk = world.dusk
        motion_enabled = animate
        steps = world.footsteps if animate else []
        pools.brightness = 1.0 if active_effects and dusk else 0.0
        pools.queue_redraw()
        queue_redraw()

func _draw() -> void:
    if Engine.is_editor_hint() or not configured or not effects: return
    if motion_enabled:
        # Few tiny leaves at each canopy, never a screen-covering particle layer.
        for i in tree_points.size():
            var tree: Vector2 = tree_points[i]
            for leaf in range(2):
                var phase: float = fposmod(clock * 0.09 + i * 0.173 + leaf * 0.47, 1.0)
                var point: Vector2 = tree + Vector2(-48.0 + phase * 136.0 + sin(phase * TAU + i) * 16.0, -154.0 + phase * 174.0)
                var alpha: float = sin(phase * PI) * 0.62
                draw_rect(Rect2(point.round(), Vector2(3, 2)), Color(0.66, 0.75, 0.35, alpha))
                draw_rect(Rect2(point.round() + Vector2(2, -1), Vector2(2, 2)), Color(0.83, 0.83, 0.43, alpha))
        for i in range(0, flower_points.size(), 3):
            var center: Vector2 = flower_points[i] - Vector2(0, 25)
            var point: Vector2 = (center + Vector2(sin(clock * 0.8 + i) * 29.0, cos(clock * 1.1 + i) * 10.0 - 15.0)).round()
            var wing: float = 1.0 if sin(clock * 10.0 + i) > 0 else 3.0
            var color: Color = Color("f4dba2") if i % 2 == 0 else Color("b6d9ec")
            draw_rect(Rect2(point - Vector2(wing, 0), Vector2(wing, 2)), color)
            draw_rect(Rect2(point + Vector2(1, 0), Vector2(wing, 2)), color)
            draw_rect(Rect2(point, Vector2(1, 3)), Color("81725a"))
        for step in steps:
            var life: float = clampf(float(step.life) / 0.38, 0.0, 1.0)
            var at: Vector2 = step.pos * 4.0
            for i in range(3):
                var puff: Vector2 = (at + Vector2((i - 1) * (6.0 + (1.0 - life) * 12.0), -3.0 - (1.0 - life) * 9.0)).round()
                draw_rect(Rect2(puff, Vector2(2, 2)), Color(0.85, 0.79, 0.61, life * 0.24))
    if dusk:
        for i in lamp_points.size():
            var flicker: float = 0.96 + sin(clock * 2.4 + i) * 0.04
            var light: Vector2 = lamp_heads[i]
            for radius in range(3, 0, -1):
                draw_circle(light, radius * 9.0, Color(1.0, 0.72, 0.34, 0.035 * flicker))
            if motion_enabled:
                var phase: float = fposmod(clock * 0.15 + i * 0.27, 1.0)
                var spark: Vector2 = light + Vector2(sin(clock + i) * 15.0, -phase * 38.0)
                draw_rect(Rect2(spark.round(), Vector2(2, 2)), Color(1.0, 0.85, 0.48, sin(phase * PI) * 0.5))
