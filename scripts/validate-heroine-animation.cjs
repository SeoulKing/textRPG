// Keep the existing npm entrypoint; native and PNG checks share the sync preflight.
// Uses the same local Python/Pillow runtime as sync-heroine-fullbody.py. No writes.
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const result = spawnSync(process.env.PYTHON || 'python', [
  path.join(__dirname, 'character_animation_pipeline.py'),
  ...process.argv.slice(2),
], {
  stdio: 'inherit',
  env: {...process.env, PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1'},
});
if (result.error) {
  console.error('Animation validator could not start Python:', result.error.message);
  console.error('Use the existing Python/Pillow environment, or set PYTHON to its executable path.');
}
process.exitCode = result.status ?? 1;
