/* Authoring uses the same outcome weights and effects that the game executes. */
function studioOutcomeProbabilities(outcomes, level=1, perLevel=0, maxLevel=5) {
  const total=outcomes.reduce((sum,outcome)=>sum+outcome.weight,0);
  if(total<=0)return outcomes.map(()=>0);
  const success=outcomes.filter(outcome=>outcome.result==='success').reduce((sum,outcome)=>sum+outcome.weight,0);
  const failure=outcomes.filter(outcome=>outcome.result==='failure').reduce((sum,outcome)=>sum+outcome.weight,0);
  if(!success||!failure||outcomes.some(outcome=>!['success','failure'].includes(outcome.result)))return outcomes.map(outcome=>outcome.weight/total);
  const rate=Math.min(1,success/total+(Math.max(1,Math.min(maxLevel,level))-1)*perLevel/100);
  return outcomes.map(outcome=>outcome.result==='success'?rate*outcome.weight/success:(1-rate)*outcome.weight/failure);
}
function studioSetSuccessPercent(effect, percent) {
  if(!Number.isFinite(percent)||percent<0||percent>100)throw new Error('확률은 0~100%로 입력해 주세요.');
  if(effect.outcomes.some(outcome=>!['success','failure'].includes(outcome.result)))throw new Error('각 결과를 성공 또는 실패로 지정해 주세요.');
  for(const kind of ['success','failure'])if(!effect.outcomes.some(outcome=>outcome.result===kind))throw new Error('성공과 실패 결과가 각각 하나 이상 필요합니다.');
  for(const kind of ['success','failure']) {
    const rows=effect.outcomes.filter(outcome=>outcome.result===kind),sum=rows.reduce((n,row)=>n+row.weight,0),target=kind==='success'?percent:100-percent;
    rows.forEach(row=>row.weight=target*(sum?row.weight/sum:1/rows.length));
  }
}
function studioSetOutcomePercent(effect, index, percent) {
  if(!Number.isFinite(percent)||percent<0||percent>100)throw new Error('확률은 0~100%로 입력해 주세요.');
  if(effect.outcomes.length===1&&percent!==100)throw new Error('결과가 하나일 때는 확률이 100%입니다.');
  const others=effect.outcomes.filter((_,i)=>i!==index),sum=others.reduce((n,row)=>n+row.weight,0);
  others.forEach(row=>row.weight=(100-percent)*(sum?row.weight/sum:1/others.length));
  effect.outcomes[index].weight=percent;
}
function studioReplaceEffects(owner, types, replacement) {
  const first=owner.effects.findIndex(effect=>types.includes(effect.type));
  const remaining=owner.effects.filter(effect=>!types.includes(effect.type));
  remaining.splice(first<0?remaining.length:Math.min(first,remaining.length),0,...replacement);
  owner.effects=remaining;
}
function studioCreateRegionAction(document, locationId, id, label='새 선택지') {
  const location=document.locations.find(row=>row.id===locationId);
  const story=document.stories.find(row=>row.locationId===locationId&&row.native==='region');
  if(!location||!story)throw new Error('지역 기본 원고를 먼저 만들어 주세요.');
  const action={id,label,type:'search',outcomeHint:'',showOutcomeHint:true,visibility:'scene',presentationMode:'when_conditions_met',locationIds:[locationId],conditions:[],effects:[{type:'advance_time',minutes:15}],failureEffects:[],tags:['studio-authored-action'],riskHint:'low'};
  story.actions.push(action);location.interactionChoices.push(action);return {action,story,locationId};
}
if(typeof module!=='undefined')module.exports={studioOutcomeProbabilities,studioSetSuccessPercent,studioSetOutcomePercent,studioReplaceEffects,studioCreateRegionAction};

function studioPercent(value){return Number((value*100).toFixed(2));}
function outcomeTitle(outcome,index){return outcome.label||`${outcome.result==='success'?'성공':outcome.result==='failure'?'실패':'일반'} 결과 ${index+1}`;}
function addRegionAction(locationId) {
  try{const entry=studioCreateRegionAction(state.document,locationId,makeId('action'));writer.selectedActionId=entry.action.id;writer.activeAction=entry.action;markDirty();openRegionAction(locationId,entry.action.id);}catch(error){showToast(error.message,true);}
}
function renderOutcomeEditor(owner,root,story) {
  const groups=owner.effects.map((effect,index)=>({effect,index})).filter(row=>row.effect.type==='random_outcome');
  const rules=state.catalogs.probabilityRules;
  const bonus=rules?.[owner.skillUse?.skillId]??0;
  const maxLevel=rules?.maxLevel??1;
  writer.outcomeSelection??={};
  root.dataset.outcomeEditor="true"; root.studioRefresh=()=>refreshOdds();
  root.innerHTML=`${groups.length&&!owner.effects.some(effect=>!['random_outcome','advance_time','advance_to_daybreak'].includes(effect.type))?'<details class="advanced"><summary>모든 확률 결과에 공통 보상 추가</summary><div data-fixed-body></div></details>':`<section class="fixed-result-block"><div class="section-title"><div><h3>${groups.length?'항상 적용되는 공통 결과':'행동 묘사와 결과'}</h3><p class="muted">${groups.length?'모든 성공·실패 결과에 공통으로 적용합니다.':'어떤 원고가 나와도 아래 보상을 한 번 지급합니다.'}${owner.skillUse?.skillId==='collection'?' 수집 숙련도에 따른 추가 획득은 게임 규칙대로 적용됩니다.':''}</p></div></div><div data-fixed-body></div></section>`}${groups.length?`<div class="section-title"><div><h3>성공·실패와 확률 결과</h3><p class="muted">결과마다 보상을 정하고, 그 결과를 표현하는 원고를 묶습니다.</p></div>${btn('판정 추가','addRandom')}</div>`:`<details class="advanced"><summary>성공·실패에 따라 보상이 달라지는 선택 만들기</summary>${btn('확률 결과 만들기','addRandom')}</details>`}${groups.map(({effect,index},groupIndex)=>{
    const odds=studioOutcomeProbabilities(effect.outcomes),classified=effect.outcomes.every(row=>['success','failure'].includes(row.result))&&effect.outcomes.some(row=>row.result==='success')&&effect.outcomes.some(row=>row.result==='failure');
    const selected=Math.min(writer.outcomeSelection[`${owner.id}:${index}`]??0,effect.outcomes.length-1);
    const outcome=effect.outcomes[selected];
    return `<section class="outcome-group" data-random="${index}"><div class="section-title"><h4>${groups.length>1?`판정 ${groupIndex+1}`:'기본 확률 설정'}</h4>${btn('판정 삭제',`deleteRandom_${index}`)}</div>${classified?`<label class="success-rate"><span>기본 성공률${bonus?' · 숙련도 1레벨':''}</span><div><input aria-label="기본 성공률${groups.length>1?' '+(groupIndex+1):''}" type="number" min="0" max="100" step="any" data-success-rate value="${studioPercent(odds.reduce((sum,value,i)=>sum+(effect.outcomes[i].result==='success'?value:0),0))}"><b>%</b></div></label>`:'<p class="muted">아래에서 각 결과의 종류와 확률을 지정하세요.</p>'}<div data-odds-summary class="odds-summary" aria-live="polite"></div>${bonus?`<p class="muted">${owner.skillUse.skillId==='fishing'?'낚시':'탐색'} 레벨마다 성공률 +${bonus}%p · 최대 100%. 기본 0%와 100%는 결과를 고정합니다.</p><div data-level-rates class="level-rates"></div>`:''}
      <div class="outcome-tabs">${effect.outcomes.map((row,i)=>`<button type="button" class="pill-button outcome-branch-card ${i===selected?'active':''}" data-select-outcome="${i}"><span data-outcome-name="${i}">${esc(outcomeTitle(row,i))}</span> <b data-outcome-rate="${i}">${studioPercent(odds[i])}%</b><span class="branch-rewards">${esc(studioChoiceResultSummary(state.document,row).replace(/^기본 결과 /,''))}</span><small>행동 묘사 ${studioScenePool(state.document,row,story.locationId).entries.length}개 중 하나 · 클릭해서 편집</small></button>`).join('')}</div><div class="writer-toolbar">${btn('성공 결과 추가',`addSuccess_${index}`)}${btn('실패 결과 추가',`addFailure_${index}`)}</div>
      <article class="outcome-detail" data-detail="${selected}"><div class="field-grid"><label class="field"><span>결과 이름</span><input aria-label="결과 이름" data-outcome-label value="${esc(outcome.label??'') }" placeholder="${esc(outcomeTitle(outcome,selected))}"></label><label class="field"><span>결과 종류</span><select aria-label="결과 종류" data-outcome-kind>${options([['success','성공'],['failure','실패'],['','일반 결과']],outcome.result??'')}</select></label><label class="field"><span>이 결과의 기본 확률 (%)</span><input aria-label="이 결과의 기본 확률" type="number" min="0" max="100" step="any" data-outcome-percent ${effect.outcomes.length===1?'readonly':''} value="${studioPercent(odds[selected])}"></label></div><div data-result-body></div>${btn('이 결과 삭제',`deleteOutcome_${index}`)}</article></section>`;
  }).join('')}`;
  const change=()=>{markDirty();refreshOdds();const container=root.closest('#regionActionEditor,#nativeActionEditor,#choiceEditor');for(const {index,effect} of groups){const raw=container?.querySelector(`textarea[data-raw-array="effects"][data-index="${index}"]`);if(raw)raw.value=JSON.stringify(effect,null,2);}};
  function refreshOdds(){for(const {effect,index}of groups){const panel=$(`[data-random="${index}"]`,root);const odds=studioOutcomeProbabilities(effect.outcomes);const success=odds.reduce((sum,value,i)=>sum+(effect.outcomes[i].result==='success'?value:0),0);const base=$('[data-success-rate]',panel);if(base&&base!==document.activeElement)base.value=studioPercent(success);$$('[data-outcome-rate]',panel).forEach(node=>node.textContent=`${studioPercent(odds[Number(node.dataset.outcomeRate)])}%`);const input=$('[data-outcome-percent]',panel);if(input&&input!==document.activeElement)input.value=studioPercent(odds[Number($('.outcome-detail',panel).dataset.detail)]);$('[data-odds-summary]',panel).textContent=effect.outcomes.map((row,i)=>`${outcomeTitle(row,i)} ${studioPercent(odds[i])}%`).join(' · ');$$('[data-select-outcome]',panel).forEach(button=>{const outcome=effect.outcomes[Number(button.dataset.selectOutcome)];$('.branch-rewards',button).textContent=studioChoiceResultSummary(state.document,outcome).replace(/^기본 결과 /,'');$('small',button).textContent=`행동 묘사 ${studioScenePool(state.document,outcome,story.locationId).entries.length}개 중 하나 · 클릭해서 편집`;});const levels=$('[data-level-rates]',panel);if(levels)levels.innerHTML=Array.from({length:maxLevel},(_,i)=>{const rates=studioOutcomeProbabilities(effect.outcomes,i+1,bonus,maxLevel);const success=rates.reduce((sum,rate,j)=>sum+(effect.outcomes[j].result==='success'?rate:0),0);return `<span>Lv.${i+1}<strong>${studioPercent(success)}%</strong></span>`;}).join('');}}
  listen('addRandom',()=>{if(owner.skillUse&&['fishing','exploration'].includes(owner.skillUse.skillId)&&groups.length)return showToast('이 숙련도를 사용하는 선택지에는 판정 하나만 사용할 수 있습니다. 기존 판정에 결과를 추가하세요.',true);owner.effects.push({type:'random_outcome',outcomes:[{weight:50,result:'success',label:'성공',effects:[]},{weight:50,result:'failure',label:'실패',effects:[]}]});markDirty();renderEditor();},root);
  for(const {effect,index}of groups){const panel=$(`[data-random="${index}"]`,root),selected=Number($('.outcome-detail',panel).dataset.detail),outcome=effect.outcomes[selected];
    const base=$('[data-success-rate]',panel);if(base)base.oninput=()=>{if(!base.value||!base.validity.valid)return;studioSetSuccessPercent(effect,Number(base.value));change();};
    const percent=$('[data-outcome-percent]',panel);percent.oninput=()=>{if(!percent.value||!percent.validity.valid)return;try{studioSetOutcomePercent(effect,selected,Number(percent.value));change();}catch(error){showToast(error.message,true);}};
    $('[data-outcome-label]',panel).oninput=e=>{outcome.label=e.target.value;$(`[data-outcome-name="${selected}"]`,panel).textContent=outcomeTitle(outcome,selected);change();};
    $('[data-outcome-kind]',panel).onchange=e=>{if(e.target.value)outcome.result=e.target.value;else delete outcome.result;markDirty();renderEditor();};
    $$('[data-select-outcome]',panel).forEach(button=>button.onclick=()=>{writer.outcomeSelection[`${owner.id}:${index}`]=Number(button.dataset.selectOutcome);renderOutcomeEditor(owner,root,story);});
    for(const kind of ['success','failure'])listen(`${kind==='success'?'addSuccess':'addFailure'}_${index}`,()=>{effect.outcomes.push({weight:10,result:kind,label:kind==='success'?'새 성공 결과':'새 실패 결과',effects:[]});writer.outcomeSelection[`${owner.id}:${index}`]=effect.outcomes.length-1;markDirty();renderEditor();},root);
    listen(`deleteOutcome_${index}`,()=>{if(effect.outcomes.length===1)return showToast('마지막 결과는 판정 삭제로 제거해 주세요.',true);if(owner.skillUse&&['fishing','exploration'].includes(owner.skillUse.skillId)&&effect.outcomes.filter(row=>row.result===outcome.result).length===1)return showToast('숙련도 판정에는 성공과 실패 결과가 각각 하나 이상 필요합니다.',true);effect.outcomes.splice(selected,1);if(!effect.outcomes.some(row=>row.weight>0))effect.outcomes.forEach(row=>row.weight=1);writer.outcomeSelection[`${owner.id}:${index}`]=0;markDirty();renderEditor();},root);
    listen(`deleteRandom_${index}`,()=>{if(owner.skillUse&&['fishing','exploration'].includes(owner.skillUse.skillId))return showToast('판정을 없애려면 먼저 적용 숙련도를 ‘없음’으로 바꿔 주세요.',true);owner.effects.splice(owner.effects.indexOf(effect),1);markDirty();renderEditor();},root);
    renderResultBody(outcome,$('[data-result-body]',panel),story,{onChange:change,connection:true,rewards:true});
  }
  renderResultBody(owner,$('[data-fixed-body]',root),story,{onChange:change,connection:!groups.length||owner.effects.some(effect=>effect.type==='set_scene'||effect.type==='set_random_scene')||!!owner.nextSceneId,rewards:true});refreshOdds();
}
function renderResultBody(owner,root,story,{onChange,connection,rewards}) {
  const logs=owner.effects.filter(effect=>effect.type==='log');
  root.innerHTML=`${connection?'<div data-scene-pool></div>':''}${rewards?'<div class="result-reward-block" data-result-rewards></div>':''}<details class="advanced result-numbers"><summary>능력치·돈·추가 안내 문장</summary><div class="field-grid">${['hp','mind','energy','money'].map(stat=>{const value=owner.effects.filter(effect=>stat==='money'?effect.type==='change_money':effect.type==='change_stat'&&effect.stat===stat).reduce((sum,effect)=>sum+(stat==='money'?effect.amount:effect.value),0);return `<label class="field"><span>${{hp:'체력',mind:'정신력',energy:'기력',money:'돈'}[stat]} 변화</span><input type="number" step="1" data-result-stat="${stat}" aria-label="${{hp:'체력',mind:'정신력',energy:'기력',money:'돈'}[stat]} 변화" value="${value}"></label>`;}).join('')}</div><label class="field"><span>추가 결과 안내</span><textarea aria-label="결과 문장" data-result-text placeholder="원고와 별도로 남길 짧은 안내를 작성하세요.">${esc(resolveItemTextPreview(logs.map(effect=>effect.message).join('\n\n')))}</textarea></label><p class="muted">이 안내는 매번 같게 표시됩니다. 매번 다르게 보여 줄 본문은 장면 묶음에서 작성하세요.</p></details><details class="advanced"><summary>이야기 상태·이동 등 추가 결과</summary><div data-other-result-effects></div></details>`;
  const extra=$('[data-other-result-effects]',root),details=extra.closest('details');
  details.ontoggle=()=>{if(!details.open)return;extra.innerHTML=arrayEditorHtml(owner,'effects','effect','전체 결과','문장·보상과 같은 데이터를 사용합니다. 이야기 상태, 이동, 퀘스트 결과도 설정할 수 있습니다.');bindArrayEditors(extra,owner);enableReferenceSearch(extra);};
  root.onfocusin=event=>{if(!details.contains(event.target))details.open=false;};
  extra.addEventListener('change',event=>{if(event.target.matches('[data-array][data-key]'))renderResultBody(owner,root,story,{onChange,connection,rewards});});
  $('[data-result-text]',root).oninput=e=>{studioReplaceEffects(owner,['log'],e.target.value.trim()?[{type:'log',message:e.target.value}]:[]);onChange();};
  $$('[data-result-stat]',root).forEach(input=>input.oninput=()=>{if(!input.value||!input.validity.valid)return;const stat=input.dataset.resultStat;owner.effects=owner.effects.filter(effect=>stat==='money'?effect.type!=='change_money':!(effect.type==='change_stat'&&effect.stat===stat));const value=Number(input.value);if(value)owner.effects.push(stat==='money'?{type:'change_money',amount:value}:{type:'change_stat',stat,value});onChange();});
  if(rewards)renderRewards(owner,$('[data-result-rewards]',root));
  if(connection)renderScenePool(owner,$('[data-scene-pool]',root),story,onChange);
}

function installOutcomeEditors() {
  const names={set_random_scene:'결과 장면 중 무작위 선택',discover_stock_node:'보관함 발견',focus_stock_node:'보관함 열기',clear_stock_node_focus:'보관함 닫기',collect_stock_item:'보관함 아이템 가져오기',collect_stock_item_all:'보관함 아이템 모두 가져오기',collect_stock_money:'보관함 돈 가져오기',collect_stock_money_all:'보관함 돈 모두 가져오기',advance_to_daybreak:'다음 날 아침까지 진행',random_outcome:'성공·실패 확률 판정'};
  for(const [type,name]of Object.entries(names))if(!EFFECT_TYPES.some(([id])=>id===type))EFFECT_TYPES.push([type,name]);
  const baseParams=effectParams;
  effectParams=function(effect,index,arrayName){
    const attr=key=>`data-array="${arrayName}" data-index="${index}" data-key="${key}"`;
    const nodes=state.document.locations.flatMap(location=>location.stockNodes.map(node=>[node.id,`${location.name} / ${node.name}`]));
    if(effect.type==='random_outcome')return baseParams(effect,index,arrayName);
    if(['clear_stock_node_focus','advance_to_daybreak'].includes(effect.type))return '<span class="muted">추가 입력 없음</span>';
    if(effect.type==='set_random_scene'&&effect.sceneIds)return '<p class="muted">위 장면 묶음에서 연결 원고와 반복 방식을 편집하세요.</p>';
    if(effect.type==='set_random_scene'){const groups=[...new Set(state.document.stories.flatMap(story=>story.scenes.flatMap(scene=>scene.tags??[])))];return `<select ${attr('tag')}>${options(groups.map(tag=>[tag,state.document.stories.flatMap(story=>story.scenes).filter(scene=>scene.tags?.includes(tag)).map(scene=>resolveItemTextPreview(scene.title)).join(' / ')]),effect.tag)}</select>`;}
    if(['discover_stock_node','focus_stock_node'].includes(effect.type))return `<select ${attr('nodeId')}>${options(nodes,effect.nodeId)}</select>`;
    if(effect.type.startsWith('collect_stock_'))return `<select ${attr('locationId')}>${locationOptions(effect.locationId)}</select><select ${attr('nodeId')}>${options(nodes,effect.nodeId)}</select>${effect.type.includes('item')?`<select ${attr('itemId')}>${itemOptions(effect.itemId)}</select>`:''}${effect.type.endsWith('_all')?'':`<input type="number" min="1" step="1" ${attr('amount')} data-mode="number" value="${effect.amount??1}">`}`;
    return baseParams(effect,index,arrayName);
  };
  const baseDefault=defaultEffect;
  defaultEffect=function(type){
    const location=state.document.locations.find(row=>row.stockNodes.length)??state.document.locations[0],node=location?.stockNodes[0];
    if(type==='random_outcome')return {type,outcomes:[{weight:50,result:'success',effects:[]},{weight:50,result:'failure',effects:[]}]};
    if(['clear_stock_node_focus','advance_to_daybreak'].includes(type))return {type};
    if(type==='set_random_scene')return {type,tag:state.document.stories.flatMap(story=>story.scenes.flatMap(scene=>scene.tags??[]))[0]??''};
    if(['discover_stock_node','focus_stock_node'].includes(type))return {type,nodeId:node?.id??''};
    if(type?.startsWith('collect_stock_'))return {type,locationId:location?.id??'',nodeId:node?.id??'',...(type.includes('item')?{itemId:node?.items[0]?.itemId??state.document.items[0]?.id??''}:{}),...(type.endsWith('_all')?{}:{amount:1})};
    return baseDefault(type);
  };
}
