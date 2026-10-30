@tool
extends Sprite2D
## Authored sprites share the room origin; offset records the visible placement.
const Data = preload("res://scripts/shop_layout_2d.gd")
@export var asset_id: String = ""
func _ready() -> void:
	if Engine.is_editor_hint():
		set_notify_transform(true)
	else:
		# Restore the contact point at runtime for Godot Y sorting.
		var contact = contact_point()
		offset -= contact - position
		position = contact
func contact_point() -> Vector2:
	var spec: Dictionary = Data.definitions().get(asset_id,{})
	var foot: Array = spec.get("foot", [0,0])
	return position + offset + Vector2(foot[0],foot[1])
func placement_start() -> Vector2:
	var spec: Dictionary = Data.definitions().get(asset_id,{})
	var point = contact_point() + Data.CANVAS_ORIGIN
	var at = Vector2(point.x/Data.PPU,point.y/(Data.PPU*Data.PITCH))
	if spec.get("anchor","minimum") == "front-center": at -= Vector2(spec.footprint[0]*.5,spec.footprint[1])
	if spec.has("offset"): at -= Vector2(spec.offset[0],spec.offset[1])
	return at
func _notification(what: int) -> void:
	if what == NOTIFICATION_TRANSFORM_CHANGED and Engine.is_editor_hint():
		var shop = get_parent().get_parent() if get_parent() != null else null
		if shop != null and shop.has_method("_request_rebuild"): shop._request_rebuild()
