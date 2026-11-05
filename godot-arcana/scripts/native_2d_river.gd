@tool
extends "res://scripts/river_fishing_geometry.gd"
## Fixed painted water with discrete PixelPen ripple/reflection frames, no UV warp.
@export_range(1.0,12.0,1.0) var ripple_fps: float = 8.0
@export_range(1.0,12.0,1.0) var highlight_fps: float = 8.0
@export_range(0.0,1.0,.05) var highlight_strength: float = .85
const FRAME_COUNT := 24
const HIGHLIGHT_FRAMES := 16
var ripple_cells: Array[Vector2i] = []
var ripple_seeds: Dictionary = {}
var ripple_variants: Dictionary = {}
var last_frame: int = -1
var highlight_cells: Array[Vector2i] = []
var highlight_tiles: Dictionary = {}
var last_highlight_frame: int = -1
func visual_frame_count() -> int:
    return HIGHLIGHT_FRAMES if get_node_or_null("HighlightFlow") != null else FRAME_COUNT
func visual_fps() -> float:
    return highlight_fps if get_node_or_null("HighlightFlow") != null else ripple_fps
func _sync_highlights(world: Node2D, layer: TileMapLayer) -> void:
    # This is part of the water art; reduced effects freeze it instead of
    # removing the approved bright crests from the surface.
    layer.visible = true
    layer.modulate.a = highlight_strength
    var animate: bool = world.effects_enabled and not world.reduced_motion
    var frame: int = int(floor(world.time*highlight_fps))%HIGHLIGHT_FRAMES if animate else 0
    if highlight_cells.is_empty():
        highlight_cells.assign(layer.get_used_cells())
        for cell in highlight_cells:
            var tile: Vector2i = layer.get_cell_atlas_coords(cell)
            highlight_tiles[cell] = Vector2i(posmod(tile.x,7),posmod(tile.y,7))
    if frame == last_highlight_frame: return
    last_highlight_frame = frame
    var origin := Vector2i(frame%4*7,int(frame/4)*7)
    for cell in highlight_cells:
        layer.set_cell(cell,0,origin+Vector2i(highlight_tiles[cell]))
func sync_river(world: Node2D) -> void:
    var dots := get_node_or_null("RippleDots") as TileMapLayer
    var lights := get_node_or_null("LanternReflections") as Node2D
    if dots == null or lights == null: return
    var highlights := get_node_or_null("HighlightFlow") as TileMapLayer
    dots.visible = world.effects_enabled and highlights == null
    if highlights != null: _sync_highlights(world,highlights)
    lights.visible = world.effects_enabled
    var animate: bool = world.effects_enabled and not world.reduced_motion
    var frame: int = int(floor(world.time*ripple_fps))%FRAME_COUNT if animate else 0
    if highlights == null and ripple_cells.is_empty():
        ripple_cells.assign(dots.get_used_cells())
        for cell in ripple_cells:
            var painted: Vector2i = dots.get_cell_atlas_coords(cell)
            ripple_seeds[cell] = posmod(painted.x,FRAME_COUNT)
            ripple_variants[cell] = painted.y
    if highlights == null and frame != last_frame:
        last_frame = frame
        for cell in ripple_cells:
            var phase: int = int(ripple_seeds[cell])
            var variant: int = int(ripple_variants[cell])
            dots.set_cell(cell,0,Vector2i((frame+phase)%FRAME_COUNT,variant))
    var i := 0
    for node in lights.get_children():
        var sprite := node as Sprite2D
        if sprite == null: continue
        sprite.frame = (frame+i*3)%FRAME_COUNT
        sprite.modulate.a = .68 if world.dusk else .24
        i += 1
