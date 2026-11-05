@tool
extends Node2D
@export var paved_areas: Array[Rect2]=[]
@export var garden_areas: Array[Rect2]=[]
@export var plaza_radii=Vector2(11,10)
@export var wall_rectangles: Array[Rect2]=[]
var plaza_center=Vector2(36,28.925)
var mosaic_center=Vector2(36,28.925)
func normalize_coordinate_frame() -> void: transform=Transform2D.IDENTITY
func refresh_plan() -> void:
    for entry in placements():
        if entry.model_kind=="fountain":
            plaza_center=entry.map_position(self)/16.0;mosaic_center=plaza_center
func placements() -> Array:
    var entries: Array = []
    _collect_placements(get_node("Placements"), entries)
    return entries
func _collect_placements(container: Node, entries: Array) -> void:
    for node in container.get_children():
        if node.has_method("map_position"):
            entries.append(node)
        else:
            _collect_placements(node, entries)
func wall_collision_rects() -> Array[Rect2]:
    var rectangles: Array[Rect2] = []
    var found: bool = false
    for layer in find_children("*", "TileMapLayer", true, false):
        if layer.get_script() == preload("res://scripts/native_2d_wall_layer.gd"):
            found = true
            rectangles.append_array(layer.map_collision_rects(self))
    # An empty painted wall layer means an open path, never stale collision.
    return rectangles if found else wall_rectangles.duplicate()
func material_at(point: Vector2) -> int:
    var p=point/16.0
    for rect in paved_areas:
        if rect.has_point(p):return 2
    if ((p-plaza_center)/plaza_radii).length()<1:return 2
    return 1 if absf(p.x-36)<2.75 and p.y>=47 else 0

func _ready() -> void:
    if not Engine.is_editor_hint() and get_parent()==get_tree().root:call_deferred("_start_game")
func _start_game() -> void:
    var game=load("res://scripts/main.gd").new()
    game.authored_layout=self
    get_tree().root.add_child(game)
