/* A scene pool changes narration; rewards remain on its owning choice/result. */
function studioScenePool(document, owner, locationId) {
  const all=document.stories.flatMap(story=>story.scenes.map(scene=>({story,scene})));
  const target=owner.effects.filter(effect=>['set_scene','set_random_scene'].includes(effect.type)).at(-1);
  const region=owner.effects.filter(effect=>effect.type==='travel').at(-1)?.locationId??locationId;
  const ids=owner.nextSceneId?[owner.nextSceneId]:target?.type==='set_scene'?[target.sceneId]:target?.sceneIds;
  const entries=ids?ids.map(id=>all.find(row=>row.scene.id===id)).filter(Boolean):target?.type==='set_random_scene'?all.filter(({scene})=>scene.locationId===region&&scene.tags?.includes(target.tag)):[];
  return {entries,target,locationId:entries[0]?.scene.locationId??region,avoidRepeat:target?.avoidRepeat??false,missing:(ids??[]).filter(id=>!all.some(row=>row.scene.id===id))};
}
function studioWriteScenePool(document,owner,locationId,sceneIds,avoidRepeat,returnToLocation) {
  const ids=[...new Set(sceneIds)],all=document.stories.flatMap(story=>story.scenes);
  const scenes=ids.map(id=>{const scene=all.find(row=>row.id===id);if(!scene)throw new Error('연결할 장면을 찾을 수 없습니다.');return scene;});
  if(new Set(scenes.map(scene=>scene.locationId)).size>1)throw new Error('한 장면 묶음에는 같은 지역의 원고를 넣어 주세요.');
  if(owner.nextStoryId||owner.nextEventId||owner.endsStory)throw new Error('다음 이벤트나 이야기 종료 연결을 먼저 변경해 주세요.');
  const previous=studioScenePool(document,owner,locationId);
  let effects=owner.effects.filter(effect=>!['set_scene','set_random_scene'].includes(effect.type));
  // Remove the old connection's travel only when changing its destination region.
  if(previous.locationId!==locationId&&previous.locationId!==scenes[0]?.locationId)effects=effects.filter(effect=>effect.type!=='travel'||effect.locationId!==previous.locationId);
  if(scenes.length){
    if(scenes[0].locationId!==locationId&&!effects.some(effect=>effect.type==='travel'&&effect.locationId===scenes[0].locationId))effects.push({type:'travel',locationId:scenes[0].locationId});
    const target={type:'set_random_scene',tag:previous.target?.tag??'studio:scene-pool',sceneIds:ids,avoidRepeat,...(typeof returnToLocation==='boolean'?{returnToLocation}:previous.target?.returnToLocation!==undefined?{returnToLocation:previous.target.returnToLocation}:{})};
    const oldIndex=owner.effects.findIndex(effect=>['set_scene','set_random_scene'].includes(effect.type));
    // Preserve effect order (in particular, travel before narration).
    const insert=oldIndex<0||effects.some(effect=>effect.type==='travel')?effects.length:Math.min(oldIndex,effects.length);
    effects.splice(insert,0,target);
  }
  owner.effects=effects;delete owner.nextSceneId;
}
function studioStockReward(document,effect) {
  if(!/^collect_stock_(item|money)(_all)?$/.test(effect.type))return null;
  const money=effect.type.includes('money');
  const location=document.locations.find(row=>row.id===effect.locationId),node=location?.stockNodes?.find(row=>row.id===effect.nodeId);
  const stockItem=money?null:node?.items.find(row=>row.itemId===effect.itemId);
  const item=money?null:document.items.find(row=>row.id===effect.itemId);
  const missing=!node||(!money&&(!stockItem||!item));
  return {effect,money,location,node,stockItem,item,all:effect.type.endsWith('_all'),initial:money?node?.money:stockItem?.initialQuantity,missing,
    name:money?'돈':item?.name??'연결이 끊어진 아이템',source:node?`${location.name} · ${node.name}`:'연결이 끊어진 보관 장소'};
}
function studioStockRewardSummary(document,effect) {
  const reward=studioStockReward(document,effect);if(!reward)return '';
  if(reward.missing)return `${reward.name} · 보관 장소 연결 확인 필요`;
  const unit=reward.money?'원':'개';
  return `${reward.name} · ${reward.node.name}에서 ${reward.all?(reward.money?'남은 금액 전부':'남은 수량 전부'):`최대 ${effect.amount.toLocaleString('ko-KR')}${unit}`} (처음 ${reward.initial.toLocaleString('ko-KR')}${unit})`;
}
function studioSetStockRewardMode(effect,mode,amount=1) {
  if(!/^collect_stock_(item|money)(_all)?$/.test(effect.type)||!['all','amount'].includes(mode))throw new Error('가져오기 방식을 확인해 주세요.');
  if(mode==='amount'&&(!Number.isInteger(amount)||amount<1))throw new Error('가져올 수량은 1 이상의 정수로 입력해 주세요.');
  const base=effect.type.includes('money')?'collect_stock_money':'collect_stock_item';
  effect.type=base+(mode==='all'?'_all':'');
  if(mode==='all')delete effect.amount;else effect.amount=amount;
}
function studioSetStockInitialQuantity(document,effect,quantity) {
  const reward=studioStockReward(document,effect);
  if(!reward||reward.missing)throw new Error('아이템과 보관 장소의 연결을 먼저 확인해 주세요.');
  if(!Number.isInteger(quantity)||quantity<0)throw new Error('처음 놓일 수량은 0 이상의 정수로 입력해 주세요.');
  if(reward.money)reward.node.money=quantity;else reward.stockItem.initialQuantity=quantity;
}
function studioAddItemReward(owner,type,itemId,amount=1) {
  const existing=owner.effects.find(effect=>effect.type===type&&effect.itemId===itemId)
    ??(type==='add_item'?owner.effects.find(effect=>['collect_stock_item','collect_stock_item_all'].includes(effect.type)&&effect.itemId===itemId):null);
  if(existing?.type==='collect_stock_item_all')return false;
  if(existing)existing.amount=(existing.amount??1)+amount;else owner.effects.push({type,itemId,amount});
  return true;
}
function studioChoiceResultSummary(document,owner) {
  const item=id=>document.items.find(row=>row.id===id)?.name??id;
  const describe=effects=>effects.flatMap(effect=>{
    const stock=studioStockRewardSummary(document,effect);if(stock)return stock;
    if(['add_item','remove_item'].includes(effect.type))return `${effect.type==='add_item'?'+':'−'}${effect.amount??1} ${item(effect.itemId)}`;
    if(effect.type==='change_money')return `돈 ${effect.amount>0?'+':''}${effect.amount}`;
    if(effect.type==='change_stat')return `${{hp:'체력',mind:'정신력',energy:'기력'}[effect.stat]} ${effect.value>0?'+':''}${effect.value}`;
    if(effect.type==='damage_tool')return `${item(effect.itemId)} 내구도 −${effect.amount}`;
    return [];
  }).join(' · ');
  const fixed=describe(owner.effects),random=owner.effects.filter(effect=>effect.type==='random_outcome');
  const pieces=fixed?[`${random.length?'공통':'기본'} 결과 ${fixed}`]:[];
  for(const effect of random){const total=effect.outcomes.reduce((sum,row)=>sum+row.weight,0);pieces.push(...effect.outcomes.map(row=>`${Number((100*row.weight/total).toFixed(1))}% ${describe(row.effects)||row.label||(row.result==='failure'?'획득 없음':'아이템 보상 없음')}`));}
  return pieces.join(' / ')||'아이템 보상 없음';
}
if(typeof module!=='undefined')module.exports={studioScenePool,studioWriteScenePool,studioChoiceResultSummary,studioStockReward,studioStockRewardSummary,studioSetStockRewardMode,studioSetStockInitialQuantity,studioAddItemReward};

function renderScenePool(owner,root,story,onChange) {
  if (studioStockDestinations(state.document,owner,story.locationId)) {
    root.innerHTML = `<p class="muted">이 선택은 남은 내용물에 따라 다른 상황으로 이어집니다. 연결된 상황에서 표시 조건을 확인하고 원고를 편집하세요.</p>${btn('연결된 상황 보기','showStockConnection')}`;
    listen('showStockConnection',()=>{
      const target=root.closest('[data-choice-card]')?.querySelector('[data-stock-connection]') ?? root.closest('#regionActionEditor,#nativeActionEditor')?.querySelector('[data-action-flow]');
      if(target)target.scrollIntoView({block:'start'});else renderStockDestinations(owner,root,story);
    },root);
    return;
  }
  let selectedId=root.dataset.selectedVariant;
  const draw=()=>{
    const pool=studioScenePool(state.document,owner,story.locationId),entries=pool.entries;
    if(!entries.some(row=>row.scene.id===selectedId))selectedId=entries[0]?.scene.id;
    root.dataset.selectedVariant=selectedId??'';
    const selected=entries.find(row=>row.scene.id===selectedId);
    const blocked=owner.nextStoryId||owner.nextEventId||owner.endsStory;
    if (blocked) {
      root.innerHTML = `<p class="scene-pool-unavailable">행동 묘사 원고: ${owner.endsStory?'이야기 종료':'다른 이벤트'} 연결을 사용 중입니다. 다음 진행 설정에서 변경할 수 있습니다.</p>${pool.missing.length?'<p class="field-error">연결된 원고를 찾을 수 없습니다. 연결 검사에서 확인해 주세요.</p>':''}`;
      return;
    }
    root.innerHTML=`<section class="scene-pool"><div class="section-title"><div><h3>행동 묘사 <span class="badge">원고 ${entries.length}개</span></h3><p class="muted">같은 행동을 다르게 묘사하는 원고입니다. 이 중 하나를 보여주고 설정한 결과를 한 번 적용합니다.</p></div></div>${blocked?'<p class="muted">다음 이벤트 또는 이야기 종료가 연결되어 있습니다. 다음 진행 설정에서 바꿀 수 있습니다.</p>':`<div class="pool-rule"><strong>${entries.length>1?`${entries.length}개 중 하나를 무작위로 표시`:entries.length?'원고 1개를 표시':'아직 연결된 원고가 없습니다.'}</strong><label class="check-field"><input type="checkbox" data-pool-repeat ${pool.avoidRepeat?'checked':''} ${entries.length<2?'disabled':''}> 같은 원고가 연속으로 나오지 않게</label></div><div class="pool-tabs" role="tablist" aria-label="장면 묶음 원고">${entries.map(({scene},i)=>`<button type="button" role="tab" aria-selected="${scene.id===selectedId}" data-pool-scene="${esc(scene.id)}"><strong>원고 ${i+1}</strong><small>${esc(resolveItemTextPreview((scene.blocks?.map(block=>block.text)??scene.paragraphs).join(' ')).slice(0,65)||'새 원고를 작성하세요.')}</small></button>`).join('')}</div><div data-pool-manuscript></div><label class="check-field pool-return"><input type="checkbox" data-pool-return ${pool.target?.returnToLocation?'checked':''} ${!entries.length||entries.some(row=>row.scene.choices.length)?'disabled':''}> 결과 확인 후 ${esc(state.document.locations.find(location=>location.id===pool.locationId)?.name??'장소')} 기본 화면으로 돌아가기</label><div class="writer-toolbar">${btn('원고 추가','poolNew','secondary')}${btn('기존 장면 가져오기','poolExisting')}${entries.length?btn('묶음에서 빼기','poolDetach'):''}</div>`}${pool.missing.length?'<p class="field-error">연결된 원고를 찾을 수 없습니다. 연결 검사에서 확인해 주세요.</p>':''}</section>`;
    if(blocked)return;
    const commit=(ids,avoidRepeat=pool.avoidRepeat,returnToLocation)=>{try{studioWriteScenePool(state.document,owner,story.locationId,ids,avoidRepeat,returnToLocation);onChange();draw();}catch(error){showToast(error.message,true);}};
    $('[data-pool-return]',root).onchange=event=>commit(entries.map(row=>row.scene.id),pool.avoidRepeat,event.target.checked);
    $('[data-pool-repeat]',root).onchange=event=>commit(entries.map(row=>row.scene.id),event.target.checked);
    $$('[data-pool-scene]',root).forEach(button=>button.onclick=()=>{selectedId=button.dataset.poolScene;draw();});
    if(selected){
      const {scene,story:source}=selected,manuscript=$('[data-pool-manuscript]',root);
      const otherUses=owner.id?studioContentLinks(state.document).filter(link=>link.to===scene.id&&link.choiceId!==owner.id):[];
      const conditions=scene.conditions.filter(condition=>condition.type!=='location');
      manuscript.innerHTML=`<div class="pool-manuscript"><label class="field"><span>장면 제목</span><input data-pool-title value="${esc(resolveItemTextPreview(scene.title))}"></label>${conditions.length?`<p class="muted">표시 조건: ${esc(conditions.map(conditionLabel).join(' · '))}</p>`:''}${(scene.blocks??scene.paragraphs.map(text=>({text}))).map((block,i)=>`<label class="field"><span>${block.speakerId?esc(state.document.people.find(person=>person.id===block.speakerId)?.name??'대사'):'설명문'} ${i+1}</span><textarea data-pool-text="${i}">${esc(resolveItemTextPreview(block.text))}</textarea></label>`).join('')}<div class="writer-toolbar">${btn('문단 추가','poolParagraph')}${btn('전체 장면 편집','poolFull')}</div>${otherUses.length?'<p class="muted">다른 선택지에서도 사용하는 원고입니다. 본문을 바꾸면 함께 반영됩니다.</p>':''}</div>`;
      $('[data-pool-title]',root).oninput=event=>{scene.title=event.target.value;onChange();};
      StudioItemTextEditor.mount($('[data-pool-title]',root),scene.title,{key:`${scene.id}:pool-title`});
      $$('[data-pool-text]',root).forEach(input=>{
        const i=Number(input.dataset.poolText);
        input.oninput=()=>{if(scene.blocks)scene.blocks[i].text=input.value;else scene.paragraphs[i]=input.value;const preview=$(`[data-pool-scene="${scene.id}"] small`,root);preview.textContent=resolveItemTextPreview((scene.blocks?.map(block=>block.text)??scene.paragraphs).join(' ')).slice(0,65);onChange();};
        StudioItemTextEditor.mount(input,scene.blocks?.[i]?.text??scene.paragraphs[i]??'',{key:`${scene.id}:pool-text:${i}`});
      });
      listen('poolParagraph',()=>{if(scene.blocks)scene.blocks.push({text:''});else scene.paragraphs.push('');onChange();draw();},root);
      listen('poolFull',()=>{go('stories',source.id,scene.id);$('#sceneInfo')?.scrollIntoView({block:'start'});},root);
    }
    listen('poolDetach',()=>commit(entries.filter(row=>row.scene.id!==selectedId).map(row=>row.scene.id)),root);
    listen('poolNew',()=>{
      const source=selected?.story??story;
      const next=selected?structuredClone(selected.scene):newScene(pool.locationId);
      next.id=makeId('scene');next.title=selected?.scene.title??'새 결과 장면';next.blocks=[{text:''}];next.paragraphs=[];next.tags=[];next.studioStoryId=source.id;
      delete next.introFlag;next.conditions=(next.conditions??[]).filter(condition=>condition.type==='location');
      source.scenes.push(next);selectedId=next.id;commit([...entries.map(row=>row.scene.id),next.id],entries.length?true:pool.avoidRepeat);
    },root);
    listen('poolExisting',()=>{
      const candidates=state.document.stories.flatMap(source=>source.scenes.map(scene=>({source,scene}))).filter(({scene})=>(!entries.length||scene.locationId===pool.locationId)&&!entries.some(row=>row.scene.id===scene.id));
      modal('장면 묶음에 원고 추가','<label class="field"><span>장면 이름이나 본문 검색</span><input data-pool-search type="search"></label><div data-pool-matches></div>',dialog=>{
        const render=()=>{const query=$('[data-pool-search]',dialog).value.toLowerCase();$('[data-pool-matches]',dialog).innerHTML=candidates.filter(({source,scene})=>studioSearchValue([source.title,scene],state.document).includes(query)).map(({source,scene})=>`<button class="item-result" type="button" data-pool-add="${esc(scene.id)}"><strong>${esc(resolveItemTextPreview(scene.title))}</strong><small>${esc(source.title)} · ${esc(resolveItemTextPreview((scene.blocks?.map(block=>block.text)??scene.paragraphs).join(' ')).slice(0,110))}</small></button>`).join('')||'<p>검색한 원고가 없습니다.</p>';$$('[data-pool-add]',dialog).forEach(button=>button.onclick=()=>{selectedId=button.dataset.poolAdd;commit([...entries.map(row=>row.scene.id),selectedId],entries.length?true:pool.avoidRepeat);dialog.close();});};
        $('[data-pool-search]',dialog).oninput=render;render();
      });
    },root);
  };
  draw();
}
function refreshRegionResultSummaries(){
  $$('[data-outcome-editor],[data-action-flow]').forEach(root=>root.studioRefresh?.());
  $$('[data-region-reward-summary]').forEach(node=>{const card=node.closest('[data-region-action]'),entry=studioRegionActions(state.document,card.dataset.actionLocation).find(row=>row.action.id===card.dataset.regionAction);if(entry)node.textContent=studioChoiceResultSummary(state.document,entry.action);});
}
function renderActivityFlow(action,root,story) {
  root.studioRefresh=()=>renderActivityFlow(action,root,story);
  if (studioStockDestinations(state.document,action,story.locationId)) { renderStockDestinations(action,root,story); return; }
  const location=state.document.locations.find(row=>row.id===story.locationId);
  const random=action.effects.filter(effect=>effect.type==='random_outcome');
  const owners=[action,...random.flatMap(effect=>effect.outcomes)];
  const pools=owners.map(owner=>({owner,pool:studioScenePool(state.document,owner,story.locationId)})).filter(row=>row.pool.entries.length);
  const returns=pools.length&&pools.every(row=>row.pool.target?.returnToLocation);
  const eligible=pools.length&&pools.every(row=>row.pool.entries.every(entry=>!entry.scene.choices.length));
  root.innerHTML=`<section class="activity-flow"><h3>이 선택의 게임 흐름</h3><div class="activity-steps"><div><small>시작</small><strong>${esc(location?.name??'장소')} 기본 화면</strong><span>${esc(resolveItemTextPreview(action.label))} 선택</span></div><div><small>1 · 행동 묘사</small><strong>${random.length?'결과에 맞는 원고':`원고 ${pools[0]?.pool.entries.length??0}개 중 하나`}</strong><span>장면들은 같은 행동의 다른 묘사입니다.</span></div><div><small>2 · 결과</small><strong>${random.length?`${random.reduce((sum,effect)=>sum+effect.outcomes.length,0)}가지 확률 결과`:'같은 결과를 한 번 적용'}</strong><span>${random.length?'아래 분기 카드에서 확률과 보상을 비교하세요.':esc(studioChoiceResultSummary(state.document,action))}</span></div><div><small>3 · 복귀</small><strong>${esc(location?.name??'장소')} 기본 화면</strong><span>${returns?'결과 확인 후 돌아가기':'현재는 결과 장면에서 장소 선택지를 표시합니다.'}</span></div></div>${!returns&&eligible?`<div class="flow-apply"><p>결과를 확인한 뒤 기본 화면으로 돌아가는 버튼을 사용합니다.</p>${btn('묘사 → 결과 → 기본 화면 복귀 적용','applyActivityReturn','secondary')}</div>`:''}</section>`;
  listen('applyActivityReturn',()=>{for(const {owner,pool} of pools)studioWriteScenePool(state.document,owner,story.locationId,pool.entries.map(row=>row.scene.id),pool.avoidRepeat,true);markDirty();renderEditor();},root);
}
