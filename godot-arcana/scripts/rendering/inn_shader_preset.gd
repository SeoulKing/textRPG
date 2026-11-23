extends Resource

## The lab's approved settings, shared by the gameplay renderers.
const APPROVED_PATH := "res://art/resources/inn_shader_approved.tres"
const REFERENCE_RASTER := Vector2i(1614, 1281)
# The lab's original 300% orthographic framing at the reference raster.
const REFERENCE_HEIGHT := 16.7 * 1281.0 / (1614.0 * 3.0)
const SHADOW_SIZE_SETTING := "rendering/lights_and_shadows/directional_shadow/size"
const SHADOW_DEPTH_SETTING := "rendering/lights_and_shadows/directional_shadow/16_bits"
const Coordinates := preload("res://scripts/native_2d_coordinates.gd")
const Regions := preload("res://scripts/region_registry.gd")
const HeroSpec := preload("res://art/resources/heroine_reference_spec.gd")
const LOBBY_MODEL_WIDTH := 15.0
# The reference lobby displays the captured actor on an upright, vertically scaled sprite.
const AVATAR_UPRIGHT_SCALE := 1.4142135
const AVATAR_HEIGHT := HeroSpec.SOURCE_HEIGHT / HeroSpec.PIXELS_PER_UNIT * AVATAR_UPRIGHT_SCALE
const PixelProfile := preload("res://scripts/rendering/camera_pixel_profile.gd")
const PixelEffect := preload("res://scripts/rendering/tutorial_pixel_effect.gd")

@export var approved_on := ""
@export var sliders: Dictionary = {}
@export var pan := Vector3.ZERO
@export var highlights_enabled := true
@export var shade_bands := true
@export var effect_enabled := true
@export var directional_shadow_size := 8192


var _gameplay_model_scale := lobby_width_scale(Regions.camera_bounds("arcana_inn").size.x)


static func lobby_width_scale(source_width: float) -> float:
	return source_width / (LOBBY_MODEL_WIDTH * Coordinates.SOURCE_UNIT)


static func load_approved() -> Resource:
	# Load after this script is initialized so the exported resource can attach it.
	return load(APPROVED_PATH)


func tile_world_variant() -> Resource:
	var preset: Resource = duplicate(true)
	preset.sliders.merge({
		"outline_strength": 52,
		"highlight_strength": 14,
		"specular_nonmetal": 8,
		"specular_metal": 60,
		"specular_width": 18,
	}, true)
	return preset


func pixel_size() -> int:
	return int(sliders["pixel_size"])


func presentation_scale(zoom_ratio: float) -> int:
	return maxi(1, roundi(float(pixel_size()) * float(sliders["zoom"]) / 100.0 * zoom_ratio))


func camera_texel_size(zoom_ratio: float) -> float:
	# Magnify the finished raster so a zoom step preserves the sampled world detail.
	var texel := REFERENCE_HEIGHT / REFERENCE_RASTER.y * pixel_size() * _gameplay_model_scale
	return texel if effect_enabled else texel / presentation_scale(zoom_ratio)


func avatar_screen_stretch() -> float:
	return AVATAR_UPRIGHT_SCALE * cos(deg_to_rad(float(sliders["pitch"])))


func fitted_presentation_scale(zoom_ratio: float, viewport_height: float) -> int:
	if not effect_enabled:
		return 1
	var scale := presentation_scale(zoom_ratio)
	if viewport_height > 0.0:
		var actor_height := HeroSpec.SOURCE_HEIGHT / HeroSpec.PIXELS_PER_UNIT * avatar_screen_stretch()
		var fitting_scale := floori(viewport_height * 0.9 * camera_texel_size(zoom_ratio) / actor_height)
		scale = mini(scale, maxi(1, fitting_scale))
	return scale


func camera_rotation_degrees() -> Vector3:
	return Vector3(-float(sliders["pitch"]), float(sliders["yaw"]), 0.0)


func attach_effect(scene: Node3D, camera: Camera3D) -> Node3D:
	var profile := PixelProfile.new()
	profile.pixel_size = pixel_size()
	profile.outline_width = int(sliders["outline_width"])
	profile.outline_strength = int(sliders["outline_strength"])
	profile.shade_bands = shade_bands
	var effect := PixelEffect.new()
	camera.add_child(effect)
	effect.configure(scene, camera)
	effect.apply_profile(profile)
	effect.set_highlights_enabled(highlights_enabled)
	effect.set_highlight_strength(float(sliders["highlight_strength"]) / 100.0)
	effect.set_specular_controls(float(sliders["specular_nonmetal"]) / 100.0,
		float(sliders["specular_metal"]) / 100.0, specular_cutoff(float(sliders["specular_width"])))
	effect.set_effect_enabled(effect_enabled)
	return effect


func projected_height_scale(camera: Camera3D) -> float:
	return 1.0 / sin(-camera.rotation.x)


func input_projection(camera: Camera3D) -> Transform2D:
	var right := camera.basis.x
	var up := camera.basis.y
	return Transform2D(Vector2(right.x, -up.x), Vector2(right.z, -up.z), Vector2.ZERO).affine_inverse()


static func specular_cutoff(percent: float) -> float:
	return lerpf(0.98, 0.35, percent / 100.0)
