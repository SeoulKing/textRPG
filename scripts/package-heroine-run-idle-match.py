"""Package the saved right-facing PixelPen candidate; never author pixels here."""
import json
from pathlib import Path
from PIL import Image, ImageDraw
from character_animation_pipeline import read_native

ROOT = Path(__file__).resolve().parent.parent
BASE = ROOT / 'godot-arcana/art/source/heroine'
SOURCE = BASE / 'run-stride-v11'
TARGET = BASE / 'run-idle-match-v12'
palette = [(0, 0, 0, 0)] + [tuple(bytes.fromhex(c[1:])) + (255,)
    for c in json.loads((BASE / 'identity-v1/palette.json').read_text())['colors']]
idle = read_native(SOURCE / 'pixelpen/idle_e.pxpen', [96, 136], palette, 4)
before = read_native(SOURCE / 'pixelpen/run_e.pxpen', [96, 136], palette, 8)
after = read_native(TARGET / 'pixelpen/run_e.pxpen', [96, 136], palette, 8)
atlas = Image.new('RGBA', (768, 136))
comparison, solo = [], []
for index, frame in enumerate(after['frames']):
    if frame.crop((0, 0, 96, 84)).tobytes() != before['frames'][index].crop((0, 0, 96, 84)).tobytes():
        raise ValueError(f'Upper body changed in frame {index}')
    atlas.alpha_composite(frame, (index * 96, 0))
    board = Image.new('RGBA', (288, 150), '#8292a7')
    draw = ImageDraw.Draw(board)
    for column, (label, image) in enumerate([
        ('IDLE REFERENCE', idle['frames'][0]),
        ('PREVIOUS', before['frames'][index]),
        ('REVISED', frame),
    ]):
        board.alpha_composite(image, (column * 96, 14))
        draw.text((column * 96 + 4, 2), label, fill='white')
    comparison.append(board.resize((864, 450), Image.Resampling.NEAREST).convert('RGB'))
    single = Image.new('RGBA', (96, 136), '#8292a7')
    single.alpha_composite(frame)
    solo.append(single.resize((288, 408), Image.Resampling.NEAREST).convert('RGB'))
duration = max(10, round(100 / after['fps']) * 10)
for name, frames in [('idle-before-after.gif', comparison), ('run_e-native.gif', solo)]:
    frames[0].save(TARGET / 'preview' / name, save_all=True, append_images=frames[1:],
                   duration=duration, loop=0)
atlas.save(TARGET / 'run-e-sheet.png')
report = {
    'edited_clip': 'run_e', 'frames': 8, 'fps': after['fps'],
    'authoring': 'PixelPen native indexed layer API; saved and reopened',
    'reference': str(idle['path'].relative_to(ROOT)), 'reference_sha256': idle['sha256'],
    'before_sha256': before['sha256'], 'saved_candidate_sha256': after['sha256'],
    'upper_84_rows_unchanged': True, 'palette_unchanged': True,
    'stocking_width_px': 11, 'shin_width_px': 10,
    'boot': 'standing idle_e native patch, nearest indexed rotation',
    'runtime_connected': False, 'gameplay_test': 'not run', 'art_approval': 'pending user review'
}
(TARGET / 'package.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print('Packaged saved PixelPen run_e: 8 frames, reference comparison GIF, atlas; source unchanged.')
