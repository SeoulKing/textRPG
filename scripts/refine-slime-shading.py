"""Refine existing slime pixel layers without changing silhouette or pose contracts."""
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'godot-arcana/art/source/monsters/slime.pixel.json'

def main():
    data = json.loads(SOURCE.read_text(encoding='utf-8'))
    body = [list(row) for row in data['layers']['body']]
    # Fixed source-space surface: curved bands, no dithering or straight splits.
    for y, row in enumerate(body):
        for x, symbol in enumerate(row):
            if symbol in '.o':
                continue
            nx = (x - 31.5) / 27.5
            ny = (55.0 - y) / 22.5
            nz = math.sqrt(max(0.0, 1.0 - nx * nx - ny * ny))
            light = -.48 * nx + .58 * ny + .65 * nz
            row[x] = 'd' if light < .08 else 's' if light < .34 else 'g' if light < .70 else 'l'
    shine = [list('.' * 64) for _ in range(80)]
    for y in range(80):
        for x in range(64):
            if body[y][x] in '.o':
                continue
            # A compact upper-left gloss patch with a nested curved white cap.
            outer = ((x - 20.0) / 7.0) ** 2 + ((y - 43.5) / 4.5) ** 2
            cap = ((x - 18.5) / 4.8) ** 2 + ((y - 41.5) / 1.6) ** 2
            if outer <= 1:
                shine[y][x] = 'w' if cap <= 1 else 'h'
            # Short reflected light hugging the lower-right curved edge.
            rim = ((x - 32.0) / 25.0) ** 2 + ((y - 55.0) / 17.5) ** 2
            if 41 <= x <= 51 and 63 <= y <= 69 and .77 <= rim <= 1.02:
                shine[y][x] = 'g'
    data['layers']['body'] = [''.join(row) for row in body]
    data['layers']['shine'] = [''.join(row) for row in shine]
    SOURCE.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('Updated shared body/shine pixel coordinates; silhouette, faces, poses and patches preserved.')

if __name__ == '__main__':
    main()
