const test=require('node:test'),assert=require('node:assert/strict');
const {GameService}=require('../.server-dist/game/service');
const {GameStateSchema}=require('../.server-dist/game/schemas');
const {fallbackNarration}=require('../.server-dist/game/text-world/narrator');
process.env.ENABLE_LLM_WORLD_PLANNER='false';process.env.ENABLE_LLM_BACKGROUND_GENERATION='false';
test.beforeEach(t=>t.mock.method(global,'fetch',async()=>{throw Error('No real Gemini calls in survival audits')}));
async function game(){
 let stored,snapshot;const history=[];
 const repo={withGameLock:async(_id,fn)=>fn(),loadGame:async()=>structuredClone(stored),saveGame:async s=>{stored=JSON.parse(JSON.stringify(s));stored.state=GameStateSchema.parse(stored.state)},getTemplate:async()=>undefined,saveTemplate:async()=>{},saveProtagonistTemplate:async()=>{},appendGenerationLog:async()=>{},appendActionLog:async()=>{}};
 const service=new GameService(repo,undefined,undefined,undefined,undefined,async c=>fallbackNarration(c));snapshot=await service.createGame();
 const offered=id=>[...snapshot.availableActions,...(snapshot.exploration?.generalActions??[]),...(snapshot.exploration?.targets??[]).flatMap(t=>t.actions)].find(c=>[c.id,c.action.optionId,c.action.actionId,c.action.choiceId,c.action.optionId?.replace(/^(trade|work|delivery|information):/,'')].includes(id)&&c.isAvailable);
 async function choose(id){if(id.startsWith('explore:')&&!offered(id)&&offered('defocus'))await choose('defocus');const selected=offered(id),action=id.startsWith('travel:')?{type:'travel',targetId:id.slice(7)}:id.startsWith('use:')?{type:'use_item',itemId:id.slice(4)}:selected?.action;
  assert(action,'Not offered '+id+' at '+snapshot.state.location+': '+snapshot.availableActions.map(c=>`${c.action.optionId||c.action.actionId||c.action.choiceId} (${c.isAvailable})`).join(', '));
  const before=snapshot.state; snapshot=await service.performAction(stored.id,action);const after=snapshot.state;
  history.push({id,day:after.day,minutes:after.worldElapsedMs/625,energy:after.stats.energy,exhaustion:after.exhaustionLevel,gainedFish:(after.inventory.riverFish??0)-(before.inventory.riverFish??0)});assert(history.length<1000);return snapshot;
 }
 return {get state(){return snapshot.state},get snapshot(){return snapshot},offered,choose,history,sequence:async ids=>{for(const id of ids)await choose(id)},reload:async()=>{snapshot=await service.getState(stored.id)}};
}
const radioRoute=['opening_commit','accept_first_canned_food_quest','travel:convenience','travel:hospital','explore:hospital_cabinet','collect:hospital_cabinet','travel:convenience','travel:shelter','travel:subway','text-world:enter','explore:subway_signal_box','collect:subway_signal_box','leave','travel:checkpoint','explore:checkpoint_radio_truck','collect:checkpoint_radio_truck','travel:subway','travel:shelter','open_shelter_crafting','assemble_rescue_radio','leave_shelter_crafting'];
async function passEvening(g){while(!g.state.isGameOver&&!g.state.stageClear&&!g.offered('sleep_at_shelter'))await g.choose(g.offered('rest_until_evening_at_shelter')?'rest_until_evening_at_shelter':'rest_light_at_shelter');if(!g.state.isGameOver&&!g.state.stageClear)await g.choose('sleep_at_shelter')}

test('preparing the radio and repeating rest without eating cannot survive ten days',async()=>{
 const g=await game();await g.sequence(radioRoute);assert(g.state.flags.rescue_signal_ready);
 while(!g.state.isGameOver&&!g.state.stageClear)await passEvening(g);
 assert(g.state.isGameOver);assert(!g.state.stageClear);assert.equal(g.state.day,3);assert.match(g.state.gameOverReason,/탈진/);assert(!g.history.some(a=>a.id.startsWith('use:')));
});

for(const fishRoll of [0,.99])test(`exploration, cooking and a paid fallback survive ten days with fishing roll ${fishRoll}`,async t=>{
 t.mock.method(Math,'random',()=>fishRoll);
 const g=await game();await g.sequence(radioRoute);
 await g.sequence(['travel:convenience','explore:convenience_food_crate','collect:convenience_food_crate','explore:convenience_shelf','collect:convenience_shelf','defocus','explore:convenience_register','collect:convenience_register','explore:convenience_supply_pile','collect:convenience_supply_pile','travel:kitchen','inspect:kitchen_old_cook','deliver_canned_food_to_old_cook','explore:kitchen_scrap_heap','collect:kitchen_scrap_heap','explore:kitchen_ingredient_crate','collect:kitchen_ingredient_crate','inspect:kitchen_serving_counter','exchange_ration_ticket_at_kitchen','travel:forest','harvest:chop_wood_at_forest','harvest:chop_wood_at_forest','travel:shelter','open_shelter_crafting_repeat','craft_shelter_brazier','craft_dented_pot','craft_firewood','leave_shelter_crafting','open_shelter_cooking']);
 while(g.offered('cook_at_shelter'))await g.choose('cook_at_shelter');
 while(g.offered('cook_rice_porridge'))await g.choose('cook_rice_porridge');
 await g.choose('leave_shelter_cooking');
 assert(g.state.flags.shelter_brazier);assert(g.state.inventory.hotMeal>=1);
 const food=()=>['grilledFish','ricePorridge','staleBread','emergencySnack','cannedFood','hotMeal'].find(id=>(g.state.inventory[id]??0)>0);
 async function eat(){const id=food();assert(id,'No food to eat');await g.choose('use:'+id)}
 async function menu(kind){await g.choose(g.offered('open_shelter_'+kind)?'open_shelter_'+kind:'open_shelter_'+kind+'_repeat')}
 async function approach(target){for(let i=0;i<3;i++){const id=['inspect:','focus:'].map(p=>p+target).find(id=>g.offered(id));if(!id)return;await g.choose(id)}}
 while(!g.state.isGameOver&&!g.state.stageClear){
  if(food()&&g.state.stats.energy<=6)await eat();
  await g.choose('travel:river');await approach('river_fishing');
  for(let i=0;i<4&&g.offered('harvest:fish_at_river');i++)await g.choose('harvest:fish_at_river');
  const fish=g.state.inventory.riverFish??0;
  if((g.state.inventory.firewood??0)+(g.state.inventory.wood??0)*4<fish){await g.choose('travel:forest');await approach('forest_timber');if(g.offered('harvest:chop_wood_at_forest'))await g.choose('harvest:chop_wood_at_forest')}
  await g.choose('travel:shelter');
  if(fish>0){
   await menu('crafting');while((g.state.inventory.firewood??0)<fish&&g.offered('craft_firewood'))await g.choose('craft_firewood');await g.choose('leave_shelter_crafting');
   await menu('cooking');while(g.offered('cook_grilled_fish'))await g.choose('cook_grilled_fish');await g.choose('leave_shelter_cooking');
  }
  // Keep a meal that can reduce accumulated exhaustion, even after several empty fishing trips.
  if(!(g.state.inventory.hotMeal>0)&&!(g.state.inventory.cannedFood>0)){
   await g.choose('travel:kitchen');await approach('kitchen_serving_counter');if(g.state.money<(g.state.day===1?4500:5200))await g.choose('help_kitchen_queue');
   await g.choose(g.state.day===1?'buy_meal_at_kitchen':'buy_crowded_meal_at_kitchen');await g.choose('travel:shelter');
  }
  while(!g.state.isGameOver&&!g.state.stageClear&&!g.offered('sleep_at_shelter')){
   if(g.state.stats.energy<=3&&food())await eat();
   if(g.offered('sleep_at_shelter'))break;
   await g.choose(g.offered('rest_until_evening_at_shelter')?'rest_until_evening_at_shelter':'rest_light_at_shelter');
  }
  if(g.state.isGameOver||g.state.stageClear)break;
  if(g.state.exhaustionLevel>=1){const recovery=['hotMeal','cannedFood'].find(id=>g.state.inventory[id]>0);if(recovery)await g.choose('use:'+recovery)}
  await g.choose('sleep_at_shelter');
  assert(!g.state.isGameOver,`${g.state.gameOverReason}; day ${g.state.day}; food ${JSON.stringify(g.state.inventory)}`);
 }
 assert(g.state.stageClear);assert.equal(g.state.day,10);assert(g.history.some(a=>a.id==='cook_at_shelter'));assert(g.history.some(a=>a.id==='harvest:fish_at_river'));assert(g.history.some(a=>a.id==='rest_until_evening_at_shelter'));assert(g.history.filter(a=>a.id==='rest_light_at_shelter').length<30);
 if(fishRoll===0){assert(g.history.some(a=>a.id==='buy_crowded_meal_at_kitchen'));assert(g.history.some(a=>a.id==='help_kitchen_queue'));}
 else {assert(!g.history.some(a=>a.id.startsWith('buy_')));assert(!g.history.some(a=>a.id==='help_kitchen_queue'));}
 if(fishRoll===0)assert.equal(g.history.reduce((sum,a)=>sum+Math.max(0,a.gainedFish),0),0);else assert(g.history.some(a=>a.id==='cook_grilled_fish'));
 const before=structuredClone(g.state);await g.reload();assert.deepEqual(g.state.inventory,before.inventory);assert.equal(g.state.worldElapsedMs,before.worldElapsedMs);assert(g.state.stageClear);
 t.diagnostic(JSON.stringify({days:g.state.day,actions:g.history.length,longRests:g.history.filter(a=>a.id==='rest_until_evening_at_shelter').length,shortRests:g.history.filter(a=>a.id==='rest_light_at_shelter').length,fish:g.history.reduce((sum,a)=>sum+Math.max(0,a.gainedFish),0),meals:g.history.filter(a=>a.id.startsWith('use:')).length,paidMeals:g.history.filter(a=>a.id.startsWith('buy_')).length,work:g.history.filter(a=>a.id==='help_kitchen_queue').length,money:g.state.money,exhaustion:g.state.exhaustionLevel}));
});
