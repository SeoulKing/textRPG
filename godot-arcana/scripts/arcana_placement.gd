@tool
extends Node3D
## Move this node in X/Z. The model, door and footprint share its transform.
const Models = preload("res://scripts/pixel3d_models.gd")
const Actor = preload("res://scripts/pixel3d_actor.gd")
const Hero = preload("res://scripts/hero_actor.gd")

@export_enum("shop", "inn", "restaurant", "academy", "fountain", "oak", "birch", "spruce", "bench", "flowerbed", "flowers", "shrub", "flowerpot", "crate", "barrels", "basket", "sign", "lantern", "lamp-post", "handcart", "workbench", "canopy", "pennant", "portal", "hero", "traveler") var model_kind: String = "crate":
	set(value):
		model_kind = value
		if is_node_ready(): _refresh.call_deferred()
## Keep existing game IDs unique. Leave empty for decorative copies.
@export var gameplay_id: String = ""
@export var display_name: String = ""
@export_enum("decoration", "building", "portal", "workbench", "resident", "spawn", "gate", "dungeon", "slime", "city") var interaction_kind: String = "decoration"
## Ground footprint in local 3D units; X is horizontal, Y means ground Z.
@export var collision_footprint: Rect2 = Rect2():
	set(value):
		collision_footprint = value
		if is_inside_tree(): update_gizmos()
var preview: Node3D
var bounds = AABB(Vector3(-.4,0,-.4),Vector3(.8,1.8,.8))
var _preview_materials: Dictionary = {}

func _ready() -> void:
	_refresh()

func _refresh() -> void:
	if not is_inside_tree(): return
	if is_instance_valid(preview):
		remove_child(preview)
		preview.queue_free()
	if model_kind == "hero":
		preview = Hero.new()
	elif model_kind == "traveler":
		preview = Actor.new()
		preview.traveler = true
	else: preview = Models.model(model_kind)
	preview.name = "GeneratedModel"
	add_child(preview, false, Node.INTERNAL_MODE_BACK)
	if Engine.is_editor_hint():
		_preview_materials.clear()
		_editor_materials(preview)
	elif model_kind in ["hero","traveler"]:
		preview.pose(0,0,false,Vector2.ZERO,false,false)
	bounds = _bounds(preview,Transform3D.IDENTITY)
	update_gizmos()

func _editor_materials(node: Node3D) -> void:
	if node is MultiMeshInstance3D: node.hide() # Runtime pixel silhouettes are camera-specific.
	if node is MeshInstance3D and node.material_override is ShaderMaterial:
		var source = node.material_override
		if source.shader == Models.OUTLINE:
			node.hide()
		elif source.shader == Models.SURFACE:
			if not _preview_materials.has(source):
				# Keep the game's paint, stepped light and emission. Only disable
				# its fixed-camera depth flattening while freely orbiting in editor.
				var material: ShaderMaterial = source.duplicate()
				material.set_shader_parameter("editor_preview", true)
				_preview_materials[source] = material
			node.material_override = _preview_materials[source]
	for child in node.get_children():
		if child is Node3D: _editor_materials(child)

func _bounds(node: Node3D, parent_transform: Transform3D) -> AABB:
	var current = parent_transform * node.transform
	var result = AABB(current.origin,Vector3.ZERO)
	if node is MeshInstance3D and node.mesh != null: result = current * node.get_aabb()
	for child in node.get_children():
		if child is Node3D: result = result.merge(_bounds(child,current))
	return result

func layout_transform(layout: Node3D) -> Transform3D:
	var result = transform
	var ancestor = get_parent()
	while ancestor != null and ancestor != layout:
		if ancestor is Node3D: result = ancestor.transform * result
		ancestor = ancestor.get_parent()
	return result

func map_position(layout: Node3D) -> Vector2:
	var origin = layout_transform(layout).origin
	return Vector2(origin.x,origin.z)*16.0

func interaction_position(layout: Node3D) -> Vector2:
	var door = get_node_or_null("Interaction")
	var point = layout_transform(layout) * (door.position if door != null else Vector3.ZERO)
	return Vector2(point.x,point.z)*16.0

func map_collision(layout: Node3D) -> Rect2:
	if not collision_footprint.has_area(): return Rect2()
	var t = layout_transform(layout)
	var rect = Rect2()
	var first = true
	for point in [collision_footprint.position,Vector2(collision_footprint.end.x,collision_footprint.position.y),collision_footprint.end,Vector2(collision_footprint.position.x,collision_footprint.end.y)]:
		var at = t * Vector3(point.x,0,point.y)
		var projected = Vector2(at.x,at.z)*16.0
		if first:
			rect = Rect2(projected,Vector2.ZERO)
			first = false
		else: rect = rect.expand(projected)
	return rect

func _get_configuration_warnings() -> PackedStringArray:
	var result = PackedStringArray()
	if absf(position.y)>.001 or absf(rotation.x)>.001 or absf(rotation.z)>.001:
		result.append("배치는 지면 X/Z와 Y축 회전을 사용해 주세요. 이동·충돌은 지면 기준입니다.")
	if not gameplay_id.is_empty():
		var root = get_tree().edited_scene_root if Engine.is_editor_hint() else null
		if root != null:
			for other in root.find_children("*","Node3D",true,false):
				if other != self and other.get_script() == get_script() and other.gameplay_id == gameplay_id:
					result.append("같은 GamePlay ID가 두 개입니다. 장식용 복제는 ID를 비워 주세요.")
					break
	return result
