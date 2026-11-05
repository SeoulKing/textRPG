@tool
extends "res://scripts/native_2d_placement.gd"
## Existing traveler art, with independent local routes and no server rewards/state.
const FRAMES = preload("res://art/resources/traveler.tres")
var native_texture: Texture2D
@export var route: PackedVector2Array = PackedVector2Array()
@export_range(4.0, 16.0) var stroll_speed: float = 9.0
@export var pause_seconds: float = 3.0
var art: Sprite2D
var route_index: int = 0
var walking_path: PackedVector2Array = PackedVector2Array()
var wait_left: float = 0.0
var gait: float = 0.0
var facing: String = "south"
var initialized: bool = false

func _ready() -> void:
    if native_texture == null:
        var frame: AtlasTexture = FRAMES.get_frame_texture("idle_south", 0)
        var image: Image = frame.atlas.get_image()
        image.resize(image.get_width() * 2, image.get_height() * 2, Image.INTERPOLATE_NEAREST)
        native_texture = ImageTexture.create_from_image(image)
    art = Sprite2D.new()
    art.name = "Visual"
    art.texture = native_texture
    art.centered = false
    art.offset = Vector2(-32, -92)
    art.region_enabled = true
    add_child(art)
    _pose(false, 0.0, false)

func sync_city(world: Node2D, delta: float, neighbors: Array[Node2D]) -> void:
    if not initialized:
        position = world.nearest_walkable(position / 4.0) * 4.0
        wait_left = pause_seconds
        initialized = true
    var before: Vector2 = position / 4.0
    var moving: bool = false
    # Wait for an approaching interaction instead of walking away from its path.
    var approached: bool = world.clicked_interaction_id == gameplay_id
    if world.enabled and not approached and world.effects_enabled and not world.reduced_motion and route.size() > 1:
        wait_left = maxf(0.0, wait_left - delta)
        if wait_left <= 0.0:
            if walking_path.is_empty():
                route_index = (route_index + 1) % route.size()
                _route_to(world, route[route_index] / 4.0)
            var budget: float = stroll_speed * minf(delta, 0.05)
            while not walking_path.is_empty() and budget > 0.001:
                var point: Vector2 = position / 4.0
                var step: Vector2 = point.move_toward(walking_path[0], minf(budget, 1.5))
                # Never cut a corner or push through the player/another resident.
                var blocked: bool = not world._can_stand(step)
                if step.distance_to(world.player_position) < 12.0 and step.distance_to(world.player_position) < point.distance_to(world.player_position):
                    blocked = true
                for other in neighbors:
                    if other == self: continue
                    var other_point: Vector2 = other.position / 4.0
                    if step.distance_to(other_point) < 9.0 and step.distance_to(other_point) < point.distance_to(other_point):
                        blocked = true
                if blocked:
                    walking_path.clear()
                    wait_left = 1.5
                    break
                var distance: float = step.distance_to(point)
                position = step * 4.0
                budget -= distance
                if step.distance_to(walking_path[0]) < 0.01:
                    walking_path.remove_at(0)
                if distance < 0.001: break
            if walking_path.is_empty() and wait_left <= 0.0:
                wait_left = pause_seconds
    var motion: Vector2 = position / 4.0 - before
    moving = motion.length_squared() > 0.0001
    if moving:
        facing = ("east" if motion.x > 0 else "west") if absf(motion.x) > absf(motion.y) else ("south" if motion.y > 0 else "north")
        gait += motion.length() * 0.2
    if approached:
        var toward_player: Vector2 = world.player_position - position / 4.0
        if toward_player.length_squared() > 0.01:
            facing = ("east" if toward_player.x > 0 else "west") if absf(toward_player.x) > absf(toward_player.y) else ("south" if toward_player.y > 0 else "north")
    _pose(moving, world.time, world.effects_enabled and not world.reduced_motion)
    # Match interaction and click picking to the currently displayed feet.
    for entity in world.entities:
        if entity.id == gameplay_id:
            entity.pos = position / 4.0
            break

func _route_to(world: Node2D, target: Vector2) -> void:
    var start: Vector2i = _nearest_cell(world, position / 4.0)
    var finish: Vector2i = _nearest_cell(world, target)
    if start.x < 0 or finish.x < 0:
        wait_left = pause_seconds
        return
    walking_path = world.grid.get_point_path(start, finish)
    # Keep the first cell center: skipping it can cut diagonally through a wall.
    if walking_path.is_empty(): wait_left = pause_seconds

func _nearest_cell(world: Node2D, point: Vector2) -> Vector2i:
    var cell: Vector2i = Vector2i(point / 16.0)
    for radius in range(5):
        for y in range(-radius, radius + 1):
            for x in range(-radius, radius + 1):
                var candidate: Vector2i = cell + Vector2i(x, y)
                if world.grid.is_in_boundsv(candidate) and not world.grid.is_point_solid(candidate):
                    return candidate
    return Vector2i(-1, -1)

func _pose(moving: bool, time: float, animate: bool) -> void:
    var clip: String = ("walk_" if moving else "idle_") + facing
    var index: int = 0
    if animate:
        index = int(gait if moving else time * FRAMES.get_animation_speed(clip)) % FRAMES.get_frame_count(clip)
    var frame: AtlasTexture = FRAMES.get_frame_texture(clip, index)
    art.region_rect = Rect2(frame.region.position * 2.0, frame.region.size * 2.0)