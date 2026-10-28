// Read-only checks for the active sprite pipeline; never regenerates artwork.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const sharp = require('sharp');

async function main() {
  const root = path.resolve(__dirname, '..');
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  const contract = JSON.parse(read('godot-arcana/art/source/heroine/animation-pipeline.json'));
  assert.equal(contract.version, 1, 'Unsupported pipeline version');
  assert.deepEqual(contract.directions, ['s', 'se', 'e', 'ne', 'n', 'nw', 'w', 'sw']);
  const [width, height] = contract.frameSize;
  assert.deepEqual(contract.frameSize, [96, 136]);
  assert.deepEqual(contract.foot, [48, 116]);
  assert.equal(contract.pixelsPerUnit, 64);
  assert.equal(contract.cycleDistanceMapUnits, 20);
  const renderer = read(contract.renderer);
  assert(read(contract.world).includes('preload("res://scripts/heroine_run.gd")'), 'Active renderer changed; review pipeline registration');
  assert(renderer.includes('distance/20.0'), 'Review movement phase contract');
  const spec = read('godot-arcana/art/resources/heroine_reference_spec.gd');
  assert(spec.includes('Vector2i(96,136)') && spec.includes('Vector2i(48,116)'), 'Frame/foot registration differs from reference spec');
  let checked = 0;
  for (const atlas of contract.atlases) {
    const resource = 'res://' + atlas.path.replace(/^godot-arcana\//, '');
    assert(renderer.includes(`preload("${resource}")`), `${atlas.id}: atlas is not registered in renderer`);
    const {data, info} = await sharp(path.join(root, atlas.path)).ensureAlpha().raw().toBuffer({resolveWithObject: true});
    assert.equal(info.width, width * atlas.grid[0], `${atlas.id}: atlas width`);
    assert.equal(info.height, height * atlas.grid[1], `${atlas.id}: atlas height`);
    for (const clip of atlas.clips) {
      assert(['direction-rows', 'direction-columns'].includes(clip.layout), 'Unknown clip layout');
      assert(Number.isInteger(clip.frames) && clip.frames > 0, 'Invalid frame count');
      for (let direction = 0; direction < contract.directions.length; direction++) {
        for (let frame = 0; frame < clip.frames; frame++) {
          const col = clip.layout === 'direction-rows' ? frame : direction;
          const row = clip.layout === 'direction-rows' ? direction : clip.row + frame;
          assert(col >= 0 && col < atlas.grid[0] && row >= 0 && row < atlas.grid[1], 'Frame lies outside atlas');
          let visible = 0;
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const alpha = data[((row * height + y) * info.width + col * width + x) * 4 + 3];
              assert(alpha === 0 || alpha === 255, `${clip.name}/${direction}/${frame}: non-binary alpha`);
              if (alpha) visible++;
            }
          }
          assert(visible > 0, `${clip.name}/${direction}/${frame}: empty frame`);
          checked++;
        }
      }
    }
  }
  console.log(`Animation pipeline: ${checked} active frames OK (size, registration, alpha, nonempty cells).`);
  console.log('Pending: ' + contract.stages.filter(stage => stage.status !== 'active').map(stage => `${stage.id} (${stage.status})`).join(', '));
  console.log('Visual continuity, contact alignment and gameplay require separate review.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
