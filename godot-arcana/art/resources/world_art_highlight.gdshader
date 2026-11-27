shader_type canvas_item;

#include "res://art/resources/world_art_highlight.gdshaderinc"

uniform float highlight_strength : hint_range(0.0, 1.0);
varying vec4 art_modulate;

void vertex() {
	art_modulate = COLOR;
}

void fragment() {
	vec2 texel = TEXTURE_PIXEL_SIZE;
	// Sprite2D frames, AtlasTextures and individual tile draws supply their own region.
	// Its extent can be negative when the sprite is flipped, or larger than one for repeats.
	vec2 first = REGION_RECT.xy + 0.5 * texel;
	vec2 last = max(first, REGION_RECT.xy + abs(REGION_RECT.zw) - 0.5 * texel);
	// Camera zoom can place a sample exactly between two source texels.
	// Choose the same side of that boundary across raster translations.
	vec2 uv = clamp((floor(UV / texel + vec2(0.001)) + 0.5) * texel, first, last);
	vec4 center = textureLod(TEXTURE, uv, 0.0);
	vec4 left = textureLod(TEXTURE, max(first, uv - vec2(texel.x, 0.0)), 0.0);
	vec4 above = textureLod(TEXTURE, max(first, uv - vec2(0.0, texel.y)), 0.0);
	float weight = world_art_highlight_mask(center, left, above) * highlight_strength;
	// Keep CanvasItem's original filtered color and alpha for the actual surface.
	COLOR.rgb = mix(COLOR.rgb, art_modulate.rgb, weight);
}
