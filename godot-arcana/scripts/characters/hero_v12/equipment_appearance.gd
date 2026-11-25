extends RefCounted

const DEFAULTS := {"top": "travelShirt", "bottom": "travelTrousers", "feet": "travelBoots"}
const SHIRT_TILES := [
	Rect2i(0, 64, 128, 64),
	Rect2i(128, 128, 128, 64),
	Rect2i(192, 192, 64, 64),
]
static var _apprentice_texture: Texture2D

var _skeleton: Skeleton3D
var _mesh: MeshInstance3D
var _clothing_surface := -1
var _apprentice_material: StandardMaterial3D
var _attached: Dictionary[String, BoneAttachment3D] = {}
var _items: Dictionary = {}


func setup(model: Node3D, skeleton: Skeleton3D) -> void:
	_skeleton = skeleton
	_mesh = model.find_child("Hero Model", true, false) as MeshInstance3D
	if _mesh == null:
		return
	for index in range(_mesh.get_surface_override_material_count()):
		var material := _mesh.get_active_material(index) as StandardMaterial3D
		if material != null and material.albedo_texture != null and "Pixel albedo" in material.resource_name:
			_clothing_surface = index
			_apprentice_material = material.duplicate()
			if _apprentice_texture == null:
				_apprentice_texture = _tinted_shirt(material.albedo_texture)
			_apprentice_material.albedo_texture = _apprentice_texture
			break


func apply(items: Dictionary) -> void:
	if not is_instance_valid(_skeleton) or items == _items:
		return
	if _clothing_surface >= 0 and items.get("top") != _items.get("top"):
		_mesh.set_surface_override_material(_clothing_surface, _apprentice_material if items.get("top") == "apprenticeShirt" else null)
	for slot: String in ["necklace", "earrings", "ringLeft", "ringRight"]:
		var item := str(items.get(slot, ""))
		if item == str(_items.get(slot, "")):
			continue
		if _attached.has(slot):
			var previous: BoneAttachment3D = _attached[slot]
			_skeleton.remove_child(previous)
			previous.queue_free()
			_attached.erase(slot)
		match item:
			"silverPendant", "moonlightNecklace":
				_add_necklace(slot, item == "moonlightNecklace")
			"silverEarrings":
				_add_earrings(slot)
			"bronzeRing", "silverRing":
				_add_ring(slot, item == "bronzeRing")
	_items = items.duplicate()


static func _tinted_shirt(texture: Texture2D) -> Texture2D:
	var image := texture.get_image()
	if image == null or image.get_size() != Vector2i(256, 256):
		return texture
	if image.is_compressed() and image.decompress() != OK:
		return texture
	image.convert(Image.FORMAT_RGBA8)
	for region: Rect2i in SHIRT_TILES:
		for y in range(region.position.y, region.end.y):
			for x in range(region.position.x, region.end.x):
				var pixel := image.get_pixel(x, y)
				# Keep seams, leather edging and transparent texels from the approved atlas.
				if pixel.r > 0.61 and pixel.g > 0.48 and pixel.r - pixel.b < 0.34:
					image.set_pixel(x, y, Color(pixel.r * 0.67, pixel.g * 0.85, minf(1.0, pixel.b * 1.13), pixel.a))
	image.generate_mipmaps()
	return ImageTexture.create_from_image(image)


func _attach(slot: String, bone: String) -> BoneAttachment3D:
	var index := _skeleton.find_bone(bone)
	var attachment := BoneAttachment3D.new()
	attachment.bone_idx = index
	_skeleton.add_child(attachment)
	_attached[slot] = attachment
	return attachment


func _add_necklace(slot: String, moonlight: bool) -> void:
	var attachment := _attach(slot, "Chest")
	var to_bone := _skeleton.get_bone_global_rest(attachment.bone_idx).affine_inverse()
	var chain := [Vector3(-0.061, 1.151, 0.077), Vector3(-0.044, 1.103, 0.129),
		Vector3(0, 1.057, 0.144), Vector3(0.044, 1.103, 0.129), Vector3(0.061, 1.151, 0.077)]
	for index in range(chain.size() - 1):
		var start: Vector3 = to_bone * chain[index]
		var end: Vector3 = to_bone * chain[index + 1]
		var mesh := CylinderMesh.new()
		mesh.top_radius = 0.004
		mesh.bottom_radius = mesh.top_radius
		mesh.height = start.distance_to(end)
		mesh.radial_segments = 6
		var segment := _piece(attachment, mesh, (start + end) * 0.5, Color("a7b8c9"))
		segment.quaternion = Quaternion(Vector3.UP, (end - start).normalized())
	var gem := _bead(attachment, to_bone * Vector3(0, 1.038, 0.148),
		0.022, Color("426ca2") if moonlight else Color("bfcede"))
	gem.scale = Vector3(0.88, 1.25, 0.55)


func _add_earrings(slot: String) -> void:
	var attachment := _attach(slot, "Head")
	var to_bone := _skeleton.get_bone_global_rest(attachment.bone_idx).affine_inverse()
	for side in [-1.0, 1.0]:
		_bead(attachment, to_bone * Vector3(side * 0.181, 1.229, 0.054), 0.015, Color("b9cadc"))


func _add_ring(slot: String, bronze: bool) -> void:
	var attachment := _attach(slot, "Hand.L" if slot == "ringLeft" else "Hand.R")
	var band := TorusMesh.new()
	band.inner_radius = 0.010
	band.outer_radius = 0.017
	band.rings = 8
	band.ring_segments = 6
	_piece(attachment, band, Vector3(0.0, 0.058, 0.0), Color("be8548") if bronze else Color("bfcddd"))


func _bead(parent: Node3D, at: Vector3, radius: float, color: Color) -> MeshInstance3D:
	var gem := SphereMesh.new()
	gem.radial_segments = 8
	gem.rings = 4
	gem.radius = radius
	gem.height = radius * 2.0
	return _piece(parent, gem, at, color)


func _piece(parent: Node3D, mesh: PrimitiveMesh, at: Vector3, color: Color) -> MeshInstance3D:
	var material := StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.albedo_color = color
	mesh.material = material
	var piece := MeshInstance3D.new()
	piece.mesh = mesh
	piece.position = at
	parent.add_child(piece)
	return piece
