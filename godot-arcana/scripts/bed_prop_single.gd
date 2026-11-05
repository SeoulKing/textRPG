@tool
extends "res://scripts/illustrated_prop.gd"
## Standalone reusable art; the room owns gameplay collision/navigation registration.
func _init() -> void:
    asset = load("res://art/export/bed-single-v3/bed.png")
    pixel_size = Vector2i(112,192)
    foot = Vector2(56,174)
    shadow_size = Vector2(.85,2.75)
    shadow_offset = Vector2(0,-1.5)
    depth_anchor_offset = Vector3(0,0,-1.5)
