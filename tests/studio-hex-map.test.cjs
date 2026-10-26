const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const writerSource = fs.readFileSync(path.join(__dirname, '../content-writer.js'), 'utf8');
const gameSource = fs.readFileSync(path.join(__dirname, '../app-api.js'), 'utf8');
function functionSource(source, name) {
  const match = source.match(new RegExp(`function ${name}\\([^]*?\\n\\}`));
  assert.ok(match, `${name} exists`);
  return match[0];
}
const layoutSource = functionSource(writerSource, 'regionHexLayout');
const context = vm.createContext({});
vm.runInContext(`${layoutSource}\nconst SQRT_3 = Math.sqrt(3);\n${functionSource(gameSource, 'hexToPixel')}`, context);

test('Studio uses the game projection at positive and negative axial coordinates', () => {
  for (const center of [{ q: 0, r: 0 }, { q: -12, r: 8 }, { q: 20, r: -30 }]) {
    const layout = context.regionHexLayout(center);
    const origin = context.hexToPixel(center.q, center.r, 46);
    assert.equal(layout.cells.length, 37);
    assert.equal(new Set(layout.cells.map(c => `${c.q},${c.r}`)).size, 37);
    for (const cell of layout.cells) {
      const game = context.hexToPixel(cell.q, cell.r, 46);
      assert.ok(Math.abs(cell.x - layout.width / 2 - (game.x - origin.x)) < 1e-9);
      assert.ok(Math.abs(cell.y - layout.height / 2 - (game.y - origin.y)) < 1e-9);
      assert.ok(cell.x >= layout.tileWidth / 2 && cell.x <= layout.width - layout.tileWidth / 2);
      assert.ok(cell.y >= layout.tileHeight / 2 && cell.y <= layout.height - layout.tileHeight / 2);
    }
    const neighbors = layout.cells.filter(c => Math.max(Math.abs(c.q - center.q), Math.abs(c.r - center.r), Math.abs(c.q + c.r - center.q - center.r)) === 1);
    assert.equal(neighbors.length, 6);
    for (const cell of neighbors) assert.ok(Math.abs(Math.hypot(cell.x - layout.width / 2, cell.y - layout.height / 2) - layout.tileHeight) < 1e-9);
  }
});

test('map preserves realm occupancy and selection, and clicking moves exact q/r coordinates', () => {
  const location = { id: 'home', name: '거처', tags: [], mapPosition: { q: 0, r: 0 } };
  const occupied = { id: 'forest', name: '숲', tags: [], mapPosition: { q: 1, r: 0 } };
  const otherRealm = { id: 'magic', name: '다른 세계', tags: ['realm:magic'], mapPosition: { q: -1, r: 0 } };
  const buttons = [];
  const root = { clientWidth: 300, clientHeight: 460, setAttribute() {}, innerHTML: '' };
  let dirty = 0, rendered = 0, focused = 0;
  const ctx = vm.createContext({
    state: { document: { locations: [location, occupied, otherRealm] } },
    $: selector => selector === '#regionMap' ? root : { focus() { focused++; } },
    $$: () => {
      buttons.length = 0;
      for (const match of root.innerHTML.matchAll(/<button\b([^]*?)<\/button>/g)) {
        const html = match[1];
        buttons.push({
          html, disabled: html.includes(' disabled'),
          dataset: { q: html.match(/data-q="([^"]+)"/)[1], r: html.match(/data-r="([^"]+)"/)[1] },
          getAttribute: () => html.match(/aria-pressed="([^"]+)"/)[1],
        });
      }
      return buttons;
    },
    esc: String, markDirty: () => dirty++, renderEditor: () => rendered++,
  });
  vm.runInContext(`${layoutSource}\n${functionSource(writerSource, 'drawRegionMap')}`, ctx);
  ctx.drawRegionMap(location);
  const cell = (q, r) => buttons.find(b => Number(b.dataset.q) === q && Number(b.dataset.r) === r);
  assert.equal(buttons.length, 37);
  assert.equal(cell(1, 0).disabled, true);
  assert.equal(cell(-1, 0).disabled, false);
  assert.equal(cell(0, 0).getAttribute('aria-pressed'), 'true');
  cell(1, 0).onclick();
  cell(0, 0).onclick();
  assert.equal(dirty, 0);
  cell(-1, 0).onclick();
  assert.equal(location.mapPosition.q, -1);
  assert.equal(location.mapPosition.r, 0);
  assert.equal(dirty, 1);
  assert.equal(rendered, 1);
  assert.equal(focused, 1);
  assert.ok(root.scrollLeft > 0 && root.scrollTop > 0);
});
