# HUD typography

- NotoSansKR-VF.ttf: Noto Sans KR variable font, copied from the existing Windows font installation. Runtime embeds this file; clients do not need a system font.
- Medium (weight 500): body text and secondary labels.
- SemiBold (weight 600): menus, headings, HP/MP, currency, item counts, key hints and combat damage.
- Both FontVariation resources enable tabular numerals (tnum).
- Original font and redistribution terms: https://github.com/google/fonts/tree/main/ofl/notosanskr
- SIL Open Font License: NotoSansKR-OFL.txt. Included in Web export.
- KoPubBatangMedium.ttf is retained for the preserved 2D renderer.

Godot 4.5.1 FontVariation: use integer OpenType tags (wght = 2003265652, tnum = 1953396077). String keys left the weight unresolved in the running renderer; this font defaults to weight 100.
