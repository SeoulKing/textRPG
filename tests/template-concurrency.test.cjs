const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { FileGameRepository } = require('../.server-dist/game/repository');
const { baseItems } = require('../.server-dist/game/data/registry');

test('concurrent games and repository instances preserve every template without temporary-file collisions', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'textrpg-template-race-'));
  const previousRuntime = process.env.RUNTIME_DIR;
  delete process.env.RUNTIME_DIR;
  try {
    const repositories=[new FileGameRepository(root),new FileGameRepository(root)];
    await repositories[0].init();
    const cards=Object.values(baseItems).slice(0,20).map(item=>({...item,source:'template',generatedAt:new Date().toISOString()}));
    await Promise.all(cards.map((card,i)=>repositories[i%2].saveTemplate('itemCards',card.id,card)));
    const stored=await repositories[0].loadTemplates();
    for (const card of cards) assert.equal(stored.itemCards[card.id].name,card.name);
    assert(!(await fs.readdir(path.join(root,'.runtime'))).some(name=>name.endsWith('.tmp')));
  } finally {
    if (previousRuntime === undefined) delete process.env.RUNTIME_DIR;
    else process.env.RUNTIME_DIR=previousRuntime;
    assert(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep) && path.basename(root).startsWith('textrpg-template-race-'));
    await fs.rm(root,{recursive:true,force:true});
  }
});
