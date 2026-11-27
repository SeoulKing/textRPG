const test=require("node:test");
const assert=require("node:assert/strict");
const {ArcanaWorld}=require("../.server-dist/online/world");
const {newWorld}=require("../.server-dist/online/combat");
const {createInitialGameState}=require("../.server-dist/game/rules");

function area(spawn,rectangle) {
  return {bounds:{x:0,y:0,w:300,h:200},spawn,rectangles:[rectangle],doors:[]};
}
const layouts={
  "arcana_academy:1":area({x:20,y:20},{x:90,y:90,w:20,h:20}),
  "arcana_academy:2":area({x:30,y:30},{x:190,y:90,w:20,h:20}),
  arcana_inn:area({x:40,y:40},{x:90,y:90,w:20,h:20}),
  arcana_restaurant:area({x:50,y:40},{x:90,y:90,w:20,h:20}),
};
function savedActor(interior,floor,position) {
  const id=interior+":"+floor;
  return {
    character:{id},game:{id,state:createInitialGameState("arcana"),world:{itemCards:{}}},
    place:{location:interior,interior,floor},position:{...position},previous:{x:70,y:70},
    walking:true,bench:"old-bench",direction:{x:0,y:1},gait:0,
  };
}
async function restore(actors,check) {
  // Isolated in-memory checkpoint: no account, API, or on-disk user save is accessed.
  const checkpoint={world:newWorld(),actors:structuredClone(actors)};
  const store={
    healthy:true,acquireWorld:async()=>true,
    transaction:async operation=>operation({
      get:async(kind,id)=>kind==="world" && id==="main"?structuredClone(checkpoint):null,
      put:async()=>{},saveGame:async()=>{},
    }),
  };
  const world=new ArcanaWorld(store,null,null,null);
  world.layouts=structuredClone(layouts);
  try {
    assert.equal(await world.start(),true);
    await check(world.actors);
  } finally {await world.stop();}
}

test("school checkpoints preserve valid positions on both floors",async()=>{
  // Each position lies inside the OTHER floor's furniture, so floor lookup matters.
  const actors=[savedActor("arcana_academy",1,{x:200,y:100}),savedActor("arcana_academy",2,{x:100,y:100})];
  await restore(actors,restored=>{
    for(const saved of actors) {
      const actor=restored.get(saved.character.id);
      assert.deepEqual(actor.position,saved.position);
      assert.deepEqual(actor.previous,saved.previous);
      assert.equal(actor.walking,true);
      assert.equal(actor.bench,"old-bench");
    }
  });
});

test("school checkpoints inside new furniture restore to their own floor spawn",async()=>{
  const actors=[savedActor("arcana_academy",1,{x:100,y:100}),savedActor("arcana_academy",2,{x:200,y:100})];
  await restore(actors,restored=>{
    for(const saved of actors) {
      const actor=restored.get(saved.character.id);
      assert.deepEqual(actor.position,layouts["arcana_academy:"+saved.place.floor].spawn);
      assert.deepEqual(actor.previous,actor.position);
      assert.equal(actor.walking,false);
      assert.equal(actor.bench,"");
      assert.deepEqual(actor.place,saved.place);
    }
  });
});

test("other indoor checkpoints retain their existing position behavior",async()=>{
  const actors=[savedActor("arcana_inn",0,{x:100,y:100}),savedActor("arcana_restaurant",0,{x:100,y:100})];
  await restore(actors,restored=>{
    for(const saved of actors) {
      const actor=restored.get(saved.character.id);
      assert.deepEqual(actor.position,saved.position);
      assert.deepEqual(actor.previous,saved.previous);
      assert.equal(actor.walking,true);
      assert.equal(actor.bench,"old-bench");
    }
  });
});
