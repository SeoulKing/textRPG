@tool
extends Node2D
## Position is the contact point in native pixels; geometry is local to it.
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
## Cast the shared outdoor sun shadow. Disable only for flat decals/ground effects.
@export var casts_sun_shadow: bool = true

func _process(_delta: float) -> void:
	if not Engine.is_editor_hint():
		return
	var visual := get_node_or_null("Visual") as Sprite2D
	if visual:
		# Match the runtime's foot-anchor ordering while editing the layout.
		visual.z_index = clampi(roundi(map_position().y * 4.0), 0, RenderingServer.CANVAS_ITEM_Z_MAX)

# Include the visible child's displacement so a directly moved sprite keeps its
# gameplay geometry, and include intermediate group translations in the layout.
func _placement_offset(layout: Node = null) -> Vector2:
	var offset := Vector2.ZERO
	var visual := get_node_or_null("Visual") as Node2D
	if visual != null:
		offset = visual.position
	var current: Node = self
	while current != null and current != layout:
		if current is Node2D:
			offset = current.transform * offset
		if layout == null and current.name == "Placements":
			break
		current = current.get_parent()
	return offset

func map_position(layout: Node = null) -> Vector2:
	return logical_anchor + _placement_offset(layout) / 4.0
func interaction_position(layout: Node = null) -> Vector2:
	return interaction_point + _placement_offset(layout) / 4.0
func map_collision_parts(layout: Node = null) -> Array[Rect2]:
	var result: Array[Rect2] = []
	var offset := _placement_offset(layout) / 4.0
	for box in collision_parts:
		result.append(Rect2(box.position + offset, box.size))
	return result

func layout_transform(layout: Node = null) -> Transform3D:
	var result = registered_transform
	var offset := _placement_offset(layout) / 64.0
	result.origin.x += offset.x
	result.origin.z += offset.y
	return result
func map_collision(_layout: Node=null) -> Rect2:
	var result=Rect2()
	for part in map_collision_parts(_layout):result=result.merge(part) if result.has_area() else part
	return result
func map_round_collision(layout: Node=null) -> Dictionary:
	var result=round_collision.duplicate(true)
	if result.has("center"):result.center+=_placement_offset(layout)/4.0
	if result.has("inverse"):
		var inverse: Transform2D=result.inverse
		var forward=inverse.affine_inverse()
		forward.origin+=_placement_offset(layout)/4.0
		result.inverse=forward.affine_inverse()
	return result
func map_entrance(layout: Node=null) -> Dictionary:
	var result=entrance.duplicate(true)
	if result.has("area"):
		var area: Rect2=result.area
		result.area=Rect2(area.position+_placement_offset(layout)/4.0,area.size)
	return result
