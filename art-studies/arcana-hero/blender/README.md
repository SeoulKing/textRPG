# Arcana hero · Blender source

`hero.blend` is the editable source. It contains the full mesh, packed painted textures, a 16-bone armature, Idle/Walk actions and a portrait studio. The reference is the approved B design in `../hero-proportions-v1.png` (relative to the parent arcana-hero directory).

- Project-local Blender: `.runtime/blender/runtime.json` records the official portable version and SHA-256. Runtime files stay outside Git.
- Rebuild: `pwsh -File scripts/build-blender-hero.ps1` from the repository root. `-SkipRender` skips the unchanged studio image when adjusting animation/export only.
- Rebuilding replaces generated source and export files. If making manual Blender edits, save a separate variant before using the generator. `hero.blend1` is a local rolling save backup.
- Game export: `godot-arcana/art/models/hero/hero.blender.glb`, with embedded textures and both actions. The export mesh is separately reduced; the editable high-detail source stays intact.
- Godot adapter: `godot-arcana/scripts/blender_hero.gd`, using painted materials, real skinning and the game's existing direction/gait interface. Placement remains in the shared `scenes/plaza.tscn`.
- Asset metrics: `production.json`. The studio render is `hero-blender-beauty.png`; the game uses its own light, palette, resolution and camera.

This is an original stylized model iteration toward the requested quality. It is not a copied League of Legends asset, and the studio render is not evidence of final in-game art approval or mobile performance.
