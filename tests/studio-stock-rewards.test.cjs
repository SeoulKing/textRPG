const test=require('node:test');
const assert=require('node:assert/strict');
const {studioStockReward,studioChoiceResultSummary,studioSetStockRewardMode,studioSetStockInitialQuantity,studioAddItemReward}=require('../content-scene-pool');
const {getEffectiveContentStudioDocument,buildWorldRegistryFromStudio,applyPreparedContentStudioRegistry,validateRegistry}=require('../.server-dist/game/data/registry');
const {parseContentStudioDocument}=require('../.server-dist/game/content-studio');
const {registerContentVersion}=require('../.server-dist/game/content-versions');
const {createInitialGameState,performAction,syncScene}=require('../.server-dist/game/rules');
const {getStockQuantity,getStockMoney}=require('../.server-dist/game/state-utils');
function fixture(){const document=getEffectiveContentStudioDocument(),story=document.stories.find(row=>row.id==='native_region_convenience'),choice=story.scenes.flatMap(scene=>scene.choices).find(choice=>choice.id==='collect_canned_food_from_shelf');return {document,story,choice,effect:choice.effects.find(effect=>effect.type==='collect_stock_item_all')};}
function publish(document){const parsed=parseContentStudioDocument(JSON.parse(JSON.stringify(document))),registry=buildWorldRegistryFromStudio(parsed);validateRegistry(registry);registerContentVersion(registry,true);applyPreparedContentStudioRegistry(registry);return registry;}
function atShelf(){const state=createInitialGameState();state.flags.opening_seen=true;state.flags.intro_seen_convenience=true;state.location='convenience';state.activeStockNodeId='convenience_shelf';state.sceneId='convenience_shelf_three';state.inventory={};syncScene(state);return state;}
function collect(state,id='collect_canned_food_from_shelf'){performAction(state,{type:'content_choice',choiceId:id},{rng:()=>0.999});}

test('imported shelf reward is canned food from finite stock, and adding the same item cannot create a second payout',()=>{
 const {document,choice,effect}=fixture(),before=JSON.stringify(document),reward=studioStockReward(document,effect);
 assert.equal(reward.item.id,'cannedFood');assert.equal(reward.node.name,'진열대');assert.equal(reward.initial,3);assert.equal(reward.all,true);
 assert.match(studioChoiceResultSummary(document,choice),/캔 음식.*진열대.*남은 수량 전부.*처음 3개/);
 assert.equal(studioAddItemReward(choice,'add_item','cannedFood'),false);assert.equal(JSON.stringify(document),before);
 assert(!choice.effects.some(effect=>effect.type==='add_item'));
});

test('all and limited pickups preserve depletion, survive serialization and never grant items from an empty shelf',()=>{
 const {document,story}=fixture();publish(document);const all=atShelf();collect(all);assert.equal(all.inventory.cannedFood,3);assert.equal(getStockQuantity(all,'convenience','convenience_shelf','cannedFood'),0);assert.throws(()=>collect(all));assert.equal(all.inventory.cannedFood,3);
 // A shared choice can occur in several shelf scenes; edit every saved reference as the editor does.
 for(const scene of story.scenes)for(const choice of scene.choices.filter(choice=>choice.id==='collect_canned_food_from_shelf'))studioSetStockRewardMode(choice.effects.find(effect=>effect.type==='collect_stock_item_all'),'amount',2);
 publish(document);const limited=atShelf();collect(limited);assert.equal(limited.inventory.cannedFood,2);assert.equal(getStockQuantity(limited,'convenience','convenience_shelf','cannedFood'),1);collect(limited);assert.equal(limited.inventory.cannedFood,3);assert.throws(()=>collect(limited));assert.equal(limited.inventory.cannedFood,3);
});

test('initial stock editing applies to new versions while an existing game keeps its original stock',()=>{
 const {document,effect}=fixture();publish(document);const oldGame=atShelf();
 studioSetStockInitialQuantity(document,effect,5);publish(document);const newGame=atShelf();collect(oldGame);collect(newGame);assert.equal(oldGame.inventory.cannedFood,3);assert.equal(newGame.inventory.cannedFood,5);
 studioSetStockInitialQuantity(document,effect,0);publish(document);const empty=atShelf();assert.throws(()=>collect(empty));assert.equal(empty.inventory.cannedFood??0,0);
 for(const value of [-1,1.5,NaN])assert.throws(()=>studioSetStockInitialQuantity(document,effect,value));
 assert.throws(()=>studioSetStockRewardMode(effect,'amount',0));assert.throws(()=>studioSetStockRewardMode(effect,'amount',1.5));
});

test('cash rewards use the same finite source rules and missing sources are visible',()=>{
 const {document,story}=fixture(),choice=story.scenes.flatMap(scene=>scene.choices).find(choice=>choice.id==='collect_cash_from_register'),effect=choice.effects.find(effect=>effect.type==='collect_stock_money_all');
 const reward=studioStockReward(document,effect);assert.equal(reward.money,true);assert.equal(reward.initial,1800);assert.match(studioChoiceResultSummary(document,choice),/계산대/);
 studioSetStockInitialQuantity(document,effect,2400);publish(document);const state=atShelf();state.activeStockNodeId='convenience_register';state.sceneId='convenience_register_full';syncScene(state);const money=state.money;collect(state,choice.id);assert.equal(state.money-money,2400);assert.equal(getStockMoney(state,'convenience','convenience_register'),0);
 const missing={...effect,nodeId:'missing'};assert.equal(studioStockReward(document,missing).missing,true);assert.match(studioChoiceResultSummary(document,{effects:[missing]}),/연결 확인/);assert.throws(()=>studioSetStockInitialQuantity(document,missing,3));
});
