/* Room definitions use the same draft, history and publication as the writer. */
let selectedRoomEntityId = null;
function roomEntityKind(entity) {
  const c = entity.components;
  return c.container ? '보관함' : c.portal ? '문' : c.light ? '조명' : c.portable ? '수집 아이템' : '사물';
}
function roomEntityRows(room) {
  return room.entities.filter(e => e.components.position.zone === room.id).flatMap(e => [e, ...room.entities.filter(child => child.components.position.zone === e.id)]);
}
function syncRoomContents(room) {
  for (const entity of room.entities) if (entity.components.container) entity.components.container.items = room.entities.filter(e => e.components.position.zone === entity.id).map(e => e.id);
}
function renderTextRoom(room) {
  writer.activeAction = null;
  const entity = room.entities.find(e => e.id === selectedRoomEntityId) ?? roomEntityRows(room)[0];
  selectedRoomEntityId = entity?.id ?? null;
  ui.editorPanel.innerHTML = `<div class="writer-header"><div><span class="eyebrow">ROOM</span><h2>${esc(room.name)}</h2><p>방에 놓인 사물과 보관함 안의 물건을 편집합니다.</p></div></div>
    <div class="writer-single room-editor">
      <details class="advanced room-settings"><summary>방 소개와 밝기</summary><div id="roomInfo" class="field-grid">${field('방 이름','name',room.name)}${check('기본 조명 있음','light',room.light)}${area('방의 기본 배경','layout',room.layout)}${area('벽과 바닥을 살폈을 때','surface',room.surface)}</div><p class="muted">사물의 위치와 이름은 아래 엔티티 배치에서 함께 표시됩니다.</p></details>
      <section class="form-section"><div class="section-title"><h3>이 방의 엔티티 · ${room.entities.length}개</h3>${btn('엔티티 추가','addRoomEntity','secondary')}</div>
        <div class="room-entity-workspace"><div class="room-entity-list" aria-label="이 방의 엔티티">${roomEntityRows(room).map(e => `<button type="button" class="room-entity-row ${e.id===entity?.id?'active':''} ${e.components.position.zone!==room.id?'is-contained':''}" data-room-entity="${esc(e.id)}" aria-pressed="${e.id===entity?.id}"><strong>${esc(e.name)}</strong><small>${esc(roomEntityKind(e))}${e.components.position.zone!==room.id?' · 보관함 안':''}</small></button>`).join('') || '<p class="muted">배치된 엔티티가 없습니다.</p>'}</div>
        <div id="roomEntityDetail">${entity ? roomEntityForm(room,entity) : '<p class="muted">엔티티를 추가해 방을 구성해 보세요.</p>'}</div></div>
      </section><p class="muted">변경은 초안에 자동 저장됩니다. 검토 후 공개하면 새 게임부터 적용되며, 진행 중인 게임의 탐색 상태는 유지됩니다.</p>
    </div>`;
  bindWriter($('#roomInfo'),room);
  $$('[data-room-entity]').forEach(button => button.onclick = () => { selectedRoomEntityId=button.dataset.roomEntity; renderEditor(); });
  listen('addRoomEntity',()=>addRoomEntity(room));
  if (entity) bindRoomEntity(room,entity);
}
function roomEntityForm(room,entity) {
  const c=entity.components;
  const parents=[[room.id,'방에 배치'],...room.entities.filter(e=>e.id!==entity.id&&e.components.container).map(e=>[e.id,e.name+' 안'])];
  const placementOptions=c.portable&&!c.light ? parents : [[room.id,'방에 배치']];
  return `<div class="section-title"><h3>${esc(entity.name)}</h3><span class="badge">${esc(roomEntityKind(entity))}</span></div>
    <div id="roomEntityInfo" class="field-grid">${field('이름','name',entity.name)}${area('가까이 살폈을 때의 묘사','description',entity.description)}</div>
    <div id="roomEntityPosition" class="field-grid">${select('배치할 곳','zone',placementOptions,c.position.zone,false)}</div>
    <div id="roomEntityDetails" class="field-grid">${field('입구 기준 배치','placement',entity.details.placement)}${area('만졌을 때의 묘사','touch',entity.details.touch??'')}${c.container?area('보관함 내부 묘사','interior',entity.details.interior??''):''}</div>
    ${c.openable?`<div id="roomOpenable" class="room-component"><h4>처음 놓인 상태</h4>${check('열려 있음','isOpen',c.openable.isOpen)}${check('잠겨 있음','locked',c.openable.locked)}</div>`:''}
    ${c.openable?`<div class="field-grid">${select('잠금 해제에 쓸 열쇠','keyId',[["","열쇠 연결 없음"],...state.document.textRooms.flatMap(r=>r.entities).filter(e=>e.components.portable&&!e.components.light).map(e=>[e.id,e.name])],c.openable.keyId??'',false)}</div>`:''}
    ${c.portable&&!c.light?`<div class="field-grid">${select('자세히 살펴야 발견되는 위치','inspectTargetId',[["","처음부터 보임"],...room.entities.filter(e=>e.id!==entity.id&&e.components.position.zone===room.id&&!e.components.discovery).map(e=>[e.id,e.name])],c.discovery?.inspectTargetId??'',false)}</div>`:''}
    ${c.portal?`<div id="roomPortal" class="field-grid">${select('문 너머의 방','to',state.document.textRooms.filter(r=>room.neighbors.includes(r.id)).map(r=>[r.id,r.name]),c.portal.to,false)}</div>`:''}
    ${c.light?`<div id="roomLight" class="room-component"><h4>조명</h4>${check('처음부터 켜져 있음','on',c.light.on)}<label class="check-field"><input type="checkbox" id="roomLightPortable" ${c.portable?'checked':''}>휴대 가능</label></div>`:''}
    ${c.portable&&!c.light?`<div id="roomPortable" class="field-grid">${select('수집하면 얻는 아이템','itemId',[["","손에 드는 물건"],...state.document.items.map(i=>[i.id,i.name])],c.portable.itemId??'',false)}${field('수량','amount',c.portable.amount,'number')}</div>`:''}
    ${c.container?`<div class="room-component"><div class="section-title"><h4>보관함 내용물</h4>${btn('내용물 추가','addRoomContents')}</div><p class="muted">닫혀 있는 동안 게임에서는 내용물이 보이지 않습니다.</p>${c.container.items.map(id=>{const child=room.entities.find(e=>e.id===id);return child?`<button type="button" class="related-link" data-room-child="${esc(id)}">${esc(child.name)} · ${child.components.portable?.amount??1}개 →</button>`:'';}).join('')||'<p class="muted">비어 있습니다.</p>'}</div>`:''}
    <div class="room-component">${btn('엔티티 삭제','deleteRoomEntity')}<p class="muted">삭제한 엔티티는 실행 취소로 복원할 수 있습니다.${c.container?' 보관함을 삭제하면 내용물은 방으로 옮겨집니다.':''}</p></div>`;
}
function bindRoomEntity(room,entity) {
  const c=entity.components;
  bindWriter($('#roomEntityInfo'),entity,(key,value)=>{
    if(key==='description')entity.details.surface=value;
    if(key==='name'){
      $('#roomEntityDetail h3').textContent=value;
      const row=$('[data-room-entity="'+entity.id+'"] strong');if(row)row.textContent=value;
    }
  });
  bindWriter($('#roomEntityDetails'),entity.details,(key,value)=>{if(key==='placement')entity.details.anchor=value||entity.id;});
  bindWriter($('#roomEntityPosition'),c.position,()=>{
    const parent=room.entities.find(e=>e.id===c.position.zone);
    entity.details.placement=parent?parent.name+' 안':'입구 기준 정면';
    entity.details.anchor=parent?.id??entity.id;
    syncRoomContents(room);renderEditor();
  });
  if(c.openable) bindWriter($('#roomOpenable'),c.openable,(key,value)=>{
    if(value){const other=key==='locked'?'isOpen':'locked';c.openable[other]=false;$(`[data-w="${other}"]`,$('#roomOpenable')).checked=false;}
  });
  if(c.openable) $('[data-w="keyId"]').onchange=e=>{if(e.target.value)c.openable.keyId=e.target.value;else delete c.openable.keyId;markDirty();};
  if(c.portable&&!c.light) $('[data-w="inspectTargetId"]').onchange=e=>{if(e.target.value)c.discovery={inspectTargetId:e.target.value};else delete c.discovery;markDirty();};
  if(c.portal) bindWriter($('#roomPortal'),c.portal);
  if(c.light){
    bindWriter($('#roomLight'),c.light);
    $('#roomLightPortable').onchange=e=>{if(e.target.checked)c.portable={itemId:null,amount:1};else delete c.portable;markDirty();};
  }
  if(c.portable&&!c.light){
    const amount=$('[data-w="amount"]',$('#roomPortable'));amount.min='1';amount.required=true;
    bindWriter($('#roomPortable'),c.portable,(key,value)=>{if(key==='itemId'&&!value)c.portable.itemId=null;});
  }
  $$('[data-room-child]').forEach(button=>button.onclick=()=>{selectedRoomEntityId=button.dataset.roomChild;renderEditor();});
  listen('addRoomContents',()=>addRoomEntity(room,entity.id));
  listen('deleteRoomEntity',()=>{
    for(const child of room.entities.filter(e=>e.components.position.zone===entity.id)){
      child.components.position.zone=room.id;child.details.placement=entity.details.placement;
    }
    room.entities=room.entities.filter(e=>e.id!==entity.id);syncRoomContents(room);selectedRoomEntityId=null;markDirty();renderShell();
  });
}
function addRoomEntity(room=selectedEntity(),parentId=null) {
  if(state.tab!=='textRooms'||!room)return;
  const draft={name:'',kind:parentId?'item':'object',itemId:state.document.items[0]?.id??''};
  modal(parentId?'보관함 내용물 추가':'방에 엔티티 추가',`<div id="newRoomEntity" class="field-grid">${field('이름','name','')}${select('종류','kind',parentId?[['item','수집 아이템']]:[['object','사물'],['container','보관함'],['item','수집 아이템'],['light','손전등·조명'],['door','문']],draft.kind,false)}${select('수집 아이템일 때 지급할 아이템','itemId',state.document.items.map(i=>[i.id,i.name]),draft.itemId,false)}</div>${btn('추가','createRoomEntity','primary')}`,dialog=>{
    bindWriter($('#newRoomEntity',dialog),draft,()=>{},false);
    listen('createRoomEntity',()=>{
      if(!draft.name.trim())return showToast('이름을 입력해 주세요.',true);
      const id=makeId('entity'), parent=room.entities.find(e=>e.id===parentId), components={position:{zone:parentId??room.id}};
      if(draft.kind==='container'){components.openable={isOpen:false,locked:false};components.container={items:[]};}
      if(draft.kind==='item')components.portable={itemId:draft.itemId||null,amount:1};
      if(draft.kind==='light'){components.light={on:false};components.portable={itemId:null,amount:1};}
      if(draft.kind==='door'){
        const to=room.neighbors.find(next=>!state.document.textRooms.flatMap(r=>r.entities).some(e=>e.components.portal&&[e.components.portal.from,e.components.portal.to].includes(room.id)&&[e.components.portal.from,e.components.portal.to].includes(next)));
        if(!to)return showToast('연결된 방 사이에 이미 문이 있습니다. 기존 문을 편집해 주세요.',true);
        components.openable={isOpen:false,locked:false};components.portal={from:room.id,to};
      }
      room.entities.push({id,name:draft.name.trim(),description:'',details:{anchor:id,placement:parent?parent.name+' 안':'입구 기준 정면',outline:draft.name.trim(),surface:'',touch:'',interior:''},components});
      syncRoomContents(room);selectedRoomEntityId=id;dialog.close();markDirty();renderShell();
    },dialog);
  });
}
