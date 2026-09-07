const test=require('node:test'),assert=require('node:assert/strict');
const {worldRegistry}=require('../.server-dist/game/data/registry');
const {createInitialGameState}=require('../.server-dist/game/rules');
const {materialSourceHints}=require('../.server-dist/game/material-guidance');
const {getStockStateKey}=require('../.server-dist/game/state-utils');
const {GameService}=require('../.server-dist/game/service');
const menus=['shelter_crafting_menu','shelter_crafting_menu_repeat','shelter_cooking_menu'];

test('material advice uses visited gathering places and keeps undiscovered contents and gated actions hidden',()=>{
 const s=createInitialGameState();assert.deepEqual(materialSourceHints(s,worldRegistry,'wood',menus),[]);assert.deepEqual(materialSourceHints(s,worldRegistry,'rawRice',menus),[]);
 s.flags.visited_forest=true;assert.match(materialSourceHints(s,worldRegistry,'wood',menus)[0],/숲.*12회/);
 const registry=structuredClone(worldRegistry);for(const a of registry.locations.forest.interactionChoices)a.conditions.push({type:'flag',flag:'hidden_camp_found'});
 registry.choices.secret_material={...structuredClone(registry.choices.craft_firewood),id:'secret_material',presentationMode:'when_conditions_met',conditions:[{type:'flag',flag:'hidden_camp_found'},{type:'has_item',itemId:'clothScrap',amount:1}],effects:[{type:'add_item',itemId:'wood',amount:1}]};registry.scenes.shelter_crafting_menu.choiceIds.push('secret_material');
 assert.deepEqual(materialSourceHints(s,registry,'wood',menus),[]);
 s.flags.visited_convenience=true;assert.deepEqual(materialSourceHints(s,worldRegistry,'rawRice',menus),[]);
 const node=worldRegistry.locations.convenience.stockNodes.find(n=>n.items.some(i=>i.itemId==='rawRice'));assert(node);s.discoveredStockNodeIds.push(node.id);
 assert.match(materialSourceHints(s,worldRegistry,'rawRice',menus)[0],/편의점.*남음/);
 s.stockState[getStockStateKey('convenience',node.id,'rawRice')]=0;assert.match(materialSourceHints(s,worldRegistry,'rawRice',menus)[0],/수집 완료/);
});

test('processing advice explains ingredient chains while finite and recoverable sources report their actual state',()=>{
 const s=createInitialGameState();s.flags.visited_forest=true;s.flags.visited_river=true;
 assert.match(materialSourceHints(s,worldRegistry,'firewood',menus)[0],/목재 1개로 제작/);
 assert.match(materialSourceHints(s,worldRegistry,'woodPlank',menus)[0],/목재 1개로 제작/);
 s.resourceState.forest={fallen_wood:{remaining:0,updatedAtMinutes:0,recoveryProgressMinutes:0}};
 assert.match(materialSourceHints(s,worldRegistry,'wood',menus)[0],/소진/);
 s.resourceState.river={fishing_pools:{remaining:0,updatedAtMinutes:0,recoveryProgressMinutes:120}};
 assert.match(materialSourceHints(s,worldRegistry,'riverFish',menus)[0],/240분 뒤/);
 const before=JSON.stringify(s);materialSourceHints(s,worldRegistry,'scrapMetal',menus);assert.equal(JSON.stringify(s),before);
});

test('a new recipe reaches the ingredient panel and guidance without adding its ID to the service effect map',async t=>{
 t.mock.method(global,'fetch',async()=>{throw Error('External providers disabled in recipe test')});
 const s=createInitialGameState();s.flags.opening_seen=true;s.flags.shelter_crafting_open=true;s.flags.shelter_crafting_intro_seen=true;s.flags.visited_forest=true;s.sceneId='shelter_crafting_menu_repeat';
 const recipe={...structuredClone(worldRegistry.choices.craft_firewood),id:'writer_fuel_bundle',label:'작은 땔감 묶음',conditions:[{type:'has_item',itemId:'wood',amount:2}],effects:[{type:'remove_item',itemId:'wood',amount:2},{type:'add_item',itemId:'firewood',amount:6},{type:'advance_time',minutes:20}]};
 s.dynamicContent.choices[recipe.id]=recipe;
 for(const sceneId of menus.slice(0,2))s.dynamicContent.scenes[sceneId]={...structuredClone(worldRegistry.scenes[sceneId]),choiceIds:[recipe.id,'leave_shelter_crafting']};
 let stored={id:'recipe-guidance',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),state:s,world:{locationCards:{},personCards:{},itemCards:{},eventCards:{},sceneCards:{},protagonistCard:null}};
 const repository={withGameLock:async(_id,fn)=>fn(),loadGame:async()=>structuredClone(stored),saveGame:async s=>{stored=structuredClone(s)},getTemplate:async()=>undefined,saveTemplate:async()=>{},saveProtagonistTemplate:async()=>{},appendGenerationLog:async()=>{},appendActionLog:async()=>{}};
 const snapshot=await new GameService(repository).getState(stored.id);
 const row=snapshot.availableActions.find(c=>c.id===recipe.id);assert(row?.craftingRecipe);assert(!row.isAvailable);
 const input=row.craftingRecipe.requirements[0];assert.equal(input.requiredAmount,2);assert.equal(input.ownedAmount,0);assert.match(input.sourceHints[0],/숲/);
 assert.match(row.craftingRecipe.effect,/6/);assert(!snapshot.availableActions.find(c=>c.id==='leave_shelter_crafting').craftingRecipe);
});
