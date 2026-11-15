extends RefCounted

# Keep the settings file used by the shop rendering preview and previous game builds.
const SETTINGS_PATH = "user://shop-pixel-settings.cfg"
const DEFAULT_PIXEL_SIZE = 2
const RASTER_BORDER := 1

static func pixel_size() -> int:
	var settings := ConfigFile.new()
	if settings.load(SETTINGS_PATH) != OK:
		return DEFAULT_PIXEL_SIZE
	return clampi(int(settings.get_value("shop", "pixel_size", DEFAULT_PIXEL_SIZE)), 1, 4)

static func save_pixel_size(value: int) -> Error:
	var settings := ConfigFile.new()
	settings.set_value("shop", "pixel_size", clampi(value, 1, 4))
	return settings.save(SETTINGS_PATH)

static func camera_pixel_size(minimum_size: int, projected_actor_pixel: float) -> int:
	return maxi(minimum_size, ceili(projected_actor_pixel - 0.001))

static func padded_raster_size(visible_raster: Vector2) -> Vector2i:
	return Vector2i(visible_raster.ceil()).max(Vector2i(2, 2)) + Vector2i.ONE * (2 * RASTER_BORDER)

static func presentation_offset(expanded_size: Vector2, physical_size: Vector2, residual: Vector2, pixel_step: int) -> Vector2:
	var crop := (expanded_size - physical_size) * 0.5
	return (residual * pixel_step - crop + Vector2.ONE * 0.5).floor()

static func snap_orthographic_camera(camera: Camera3D, desired_position: Vector3, texel_size: float, raster_size: Vector2) -> Vector2:
	# Anchor the camera's sample grid at the scene origin, including for odd raster sizes.
	var right := camera.basis.x.normalized()
	var up := camera.basis.y.normalized()
	var origin := raster_size * 0.5 + Vector2(-right.dot(desired_position), up.dot(desired_position)) / texel_size
	var residual := origin - (origin + Vector2.ONE * 0.5).floor()
	camera.position = desired_position + (right * residual.x - up * residual.y) * texel_size
	return residual

static func attach_screen_presentation(scene: Node) -> ShaderMaterial:
	var layer := CanvasLayer.new()
	layer.name = "WorldPresentation"
	layer.layer = 1
	scene.add_child(layer)
	var copy := BackBufferCopy.new()
	copy.copy_mode = BackBufferCopy.COPY_MODE_VIEWPORT
	layer.add_child(copy)
	var screen := ColorRect.new()
	screen.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var material := ShaderMaterial.new()
	material.shader = preload("res://art/resources/world_screen_presentation.gdshader")
	screen.material = material
	layer.add_child(screen)
	screen.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	return material
