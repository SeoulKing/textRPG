@tool
extends Node2D
## Common room origin; artwork offsets carry placement, never a stretched transform.
@export var gameplay_id: String = ""
@export var model_kind: String = ""
@export var display_name: String = ""
@export var interaction_kind: String = "decoration"
@export var logical_anchor = Vector2.ZERO
@export var interaction_point = Vector2.ZERO
@export var collision_parts: Array[Rect2] = []
@export var round_collision: Dictionary = {}
@export var entrance_id: String = ""
@export var entrance_target: String = ""
@export var entrance_enabled: bool = false
@export var registered_transform=Transform3D.IDENTITY
@export var entrance: Dictionary={}
@export var source_path: String = ""
func map_position(_layout: Node=null) -> Vector2:
    return logical_anchor + position / 4.0
func interaction_position(_layout: Node=null) -> Vector2:
    return interaction_point + position / 4.0
func map_collision_parts(_layout: Node=null) -> Array[Rect2]:
    var result: Array[Rect2] = []
    for box in collision_parts:
        result.append(Rect2(box.position + position / 4.0, box.size))
    return result

func layout_transform(_layout: Node=null) -> Transform3D:
    var result=registered_transform
    result.origin.x+=position.x/64.0;result.origin.z+=position.y/64.0
    return result
func map_collision(_layout: Node=null) -> Rect2:
    var result=Rect2()
    for part in map_collision_parts():result=result.merge(part) if result.has_area() else part
    return result
func map_round_collision(_layout: Node=null) -> Dictionary:
    var result=round_collision.duplicate(true)
    if result.has("center"):result.center+=position/4.0
    if result.has("inverse"):
        var inverse: Transform2D=result.inverse
        var forward=inverse.affine_inverse()
        forward.origin+=position/4.0
        result.inverse=forward.affine_inverse()
    return result
func map_entrance(_layout: Node=null) -> Dictionary:
    var result=entrance.duplicate(true)
    if result.has("area"):
        var area: Rect2=result.area
        result.area=Rect2(area.position+position/4.0,area.size)
    return result
