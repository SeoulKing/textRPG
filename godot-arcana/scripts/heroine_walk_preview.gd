extends Node2D
## Standalone native SpriteFrames + TileSet authoring view. No server or saves.
const FRAMES = preload("res://art/resources/heroine_frames.tres")
const TILES = preload("res://art/resources/heroine_preview_tiles.tres")
const SPEC = preload("res://art/resources/heroine_reference_spec.gd")
const HEADINGS = ["s","se","e","ne","n","nw","w","sw"]
var actor: AnimatedSprite2D
var floor_layer: TileMapLayer
var camera: Camera2D
var moving: CheckButton
var speed: HSlider
var headings: OptionButton
var last_cell = Vector2i(99999,99999)
var label: Label
func _ready() -> void:
    floor_layer = TileMapLayer.new()
    floor_layer.tile_set = TILES
    floor_layer.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
    floor_layer.z_index = -2
    add_child(floor_layer)
    actor = AnimatedSprite2D.new()
    actor.sprite_frames = FRAMES
    actor.centered = false
    actor.offset = -Vector2(SPEC.FOOT)
    actor.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
    add_child(actor)
    actor.animation_finished.connect(func():
        if str(actor.animation).begins_with("stop_"): actor.play("idle_"+HEADINGS[headings.selected]))
    camera = Camera2D.new()
    camera.zoom = Vector2(2,2)
    camera.position = actor.position-Vector2(0,SPEC.SOURCE_HEIGHT*.5)
    add_child(camera)
    var ui = CanvasLayer.new()
    add_child(ui)
    var panel = VBoxContainer.new()
    panel.position = Vector2(12,12)
    ui.add_child(panel)
    label = Label.new()
    panel.add_child(label)
    headings = OptionButton.new()
    for h in HEADINGS: headings.add_item(h)
    panel.add_child(headings)
    moving = CheckButton.new()
    moving.text = "걷기"
    moving.button_pressed = true
    moving.toggled.connect(func(value):
        if not value: actor.play("stop_left_"+HEADINGS[headings.selected]))
    panel.add_child(moving)
    speed = HSlider.new()
    speed.min_value = .1
    speed.max_value = 3
    speed.step = .1
    speed.value = 1.5
    speed.custom_minimum_size = Vector2(220,24)
    panel.add_child(speed)
    var help = Label.new()
    help.text = "위: 방향 · 속도: 0.1~3칸/초\n바닥 한 칸: 원본 64×45 / 월드 1칸\nF6 단독 미리보기 · 저장/서버 변경 없음"
    panel.add_child(help)
func _process(delta: float) -> void:
    if actor==null: return
    var heading = HEADINGS[headings.selected]
    if moving.button_pressed:
        var angle = float(headings.selected)*TAU/8.0
        var projection = Vector2(sin(angle),cos(angle)*sqrt(.5))
        actor.position += projection*speed.value*64.0*minf(delta,.05)
        actor.speed_scale = speed.value*16.0/(SPEC.WALK_DISTANCE_MAP_UNITS/WALK_SECONDS())
        actor.play("walk_"+heading)
    elif not str(actor.animation).begins_with("stop_"): actor.play("idle_"+heading)
    camera.position = (actor.position-Vector2(0,SPEC.SOURCE_HEIGHT*.5)).round()
    label.text = "주인공 정면 기준 · %.1f칸/초" % speed.value
    var cell = Vector2i((actor.position/Vector2(64,45)).floor())
    if cell!=last_cell:
        floor_layer.clear()
        for y in range(cell.y-12,cell.y+13):
            for x in range(cell.x-8,cell.x+9): floor_layer.set_cell(Vector2i(x,y),0,Vector2i(posmod(x,2),posmod(y,2)))
        last_cell = cell
func WALK_SECONDS() -> float:
    return float(SPEC.WALK_FRAMES)/FRAMES.get_animation_speed("walk_s")
