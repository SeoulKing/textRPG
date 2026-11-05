@tool
extends RefCounted
## One authoring camera for the approved hybrid character and its comparisons.
const NATIVE := Vector2i(320, 180)

static func configure_camera(target: Camera3D) -> void:
	target.projection = Camera3D.PROJECTION_ORTHOGONAL
	target.size = 180.0
	target.near = 0.1
	target.far = 1000.0
	target.position = Vector3(0, 160, 260)
	target.look_at(Vector3(0, 42, 0), Vector3.UP)
	target.current = true

static func configure_viewport(target: SubViewport) -> void:
	target.size = NATIVE
	target.transparent_bg = true
	target.own_world_3d = true
	target.msaa_3d = Viewport.MSAA_DISABLED
	target.screen_space_aa = Viewport.SCREEN_SPACE_AA_DISABLED
