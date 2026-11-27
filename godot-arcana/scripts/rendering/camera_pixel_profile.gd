extends Resource

## Rendering settings shared by cameras using the pixel effect.
@export_range(1, 24) var pixel_size := 4
@export_range(0, 12) var outline_width := 1
@export_range(0, 100) var outline_strength := 0
@export var preserve_lines := true
@export_range(0, 100) var line_sensitivity := 40
@export var shade_bands := true
