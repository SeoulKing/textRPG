/* Item mentions are an editing surface for existing {{item:ID}} strings, never game effects. */
const StudioItemTextEditor = (() => {
  const tokenPattern = () => /\{\{item:([A-Za-z0-9_-]+)(?:\|([^{}]+))?\}\}/g;
  const clipboardType = 'application/x-textrpg-item-text';
  const controllers = new WeakMap();
  const kinds = {food:'음식',drink:'음료',medicine:'약품',trade:'거래품',ticket:'이용권',material:'재료',tool:'도구'};
  let sequence = 0, active = null, popup = null, itemSignature = '', items = new Map();
  const normalize = text => String(text).normalize('NFC').replace(/\s+/g, '').toLocaleLowerCase('ko');
  const pointBefore = node => ({node:node.parentNode, offset:[...node.parentNode.childNodes].indexOf(node)});
  const pointAfter = node => { const point=pointBefore(node); return {...point,offset:point.offset+1}; };

  function itemMap() {
    const rows = state.document?.items ?? [];
    const signature = JSON.stringify(rows.map(item => [item.id,item.name,item.kind]));
    if (signature !== itemSignature) { itemSignature=signature; items=new Map(rows.map(item=>[item.id,item])); }
    return items;
  }
  function decorateTag(tag,registry=itemMap()) {
    const match = [...tag.dataset.itemToken.matchAll(tokenPattern())][0];
    if (!match) return;
    const item=registry.get(match[1]);
    const text=item ? `${item.name}${previewParticle(item.name,match[2])}` : `삭제된 아이템 · ${match[1]}`;
    if(tag.textContent!==text)tag.textContent=text;
    tag.classList.toggle('is-missing',!item);
    tag.title=item?`아이템 연결: ${item.name} (${item.id})`:`연결한 아이템을 찾을 수 없습니다: ${match[1]}`;
    tag.setAttribute('aria-label',tag.title);
  }
  function fragment(value) {
    const result=document.createDocumentFragment(),registry=itemMap();let start=0;
    for(const match of String(value).matchAll(tokenPattern())) {
      result.append(document.createTextNode(value.slice(start,match.index)));
      const tag=document.createElement('span');tag.className='item-text-tag';
      tag.contentEditable='false';tag.draggable=false;tag.dataset.itemToken=match[0];
      decorateTag(tag,registry);result.append(tag);start=match.index+match[0].length;
    }
    result.append(document.createTextNode(String(value).slice(start)));
    return result;
  }
  function read(root) {
    let value='';const parts=[];
    const placeholder=[...root.childNodes].filter(node=>node.nodeType!==Node.TEXT_NODE||node.data.length);
    if(placeholder.length===1&&placeholder[0].nodeName==='BR')return {value,parts};
    const append=(text,node,atomic=false,start,end)=>{
      parts.push({text,node,atomic,from:value.length,to:value.length+text.length,
        start:start??{node,offset:0},end:end??{node,offset:text.length}});
      value+=text;
    };
    const visit=node=>{
      if(node.nodeType===Node.TEXT_NODE){append(node.data,node);return;}
      if(node.nodeType!==Node.ELEMENT_NODE && node.nodeType!==Node.DOCUMENT_FRAGMENT_NODE)return;
      if(node.dataset?.itemToken){append(node.dataset.itemToken,node,true,pointBefore(node),pointAfter(node));return;}
      if(node.nodeName==='BR'){
        // Browsers can leave one placeholder BR in an otherwise empty editable.
        if(root.childNodes.length===1 && node.parentNode===root)return;
        append('\n',node,true,pointBefore(node),pointAfter(node));return;
      }
      const block=node!==root && ['DIV','P'].includes(node.nodeName);
      if(block && value && !value.endsWith('\n'))append('\n',node,true,pointBefore(node),{node,offset:0});
      for(const child of node.childNodes)visit(child);
      if(block && node.nextSibling && !value.endsWith('\n'))append('\n',node,true,{node,offset:node.childNodes.length},pointAfter(node));
    };
    visit(root);return {value,parts};
  }
  function ownedRange(controller) {
    const selection=window.getSelection();if(!selection?.rangeCount)return null;
    const range=selection.getRangeAt(0).cloneRange(),root=controller.element;
    if(!root.contains(range.startContainer)||!root.contains(range.endContainer))return null;
    const tagAt=node=>(node.nodeType===Node.ELEMENT_NODE?node:node.parentElement)?.closest('[data-item-token]');
    const first=tagAt(range.startContainer),last=tagAt(range.endContainer);
    if(range.collapsed){if(first)range.setStartAfter(first);range.collapse(true);}
    else {if(first)range.setStartBefore(first);if(last)range.setEndAfter(last);}
    return range;
  }
  function offsets(controller,range) {
    const before=document.createRange();before.selectNodeContents(controller.element);before.setEnd(range.startContainer,range.startOffset);
    const from=read(before.cloneContents()).value.length;
    return {from,to:from+read(range.cloneContents()).value.length};
  }
  function pointAt(controller,index) {
    const root=controller.element,{value,parts}=read(root);index=Math.max(0,Math.min(index,value.length));
    for(const part of parts) {
      if(index>=part.from && index<=part.to) {
        if(!part.atomic)return {node:part.node,offset:index-part.from};
        return index===part.from?part.start:part.end;
      }
    }
    return {node:root,offset:root.childNodes.length};
  }
  function rangeAt(controller,from,to=from) {
    const start=pointAt(controller,from),end=pointAt(controller,to),range=document.createRange();
    range.setStart(start.node,start.offset);range.setEnd(end.node,end.offset);return range;
  }
  function selectRange(controller,range) {
    controller.element.focus({preventScroll:true});
    const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
    controller.lastRange=range.cloneRange();
  }
  function saveSelection(controller) {
    const range=ownedRange(controller);if(range)controller.lastRange=range.cloneRange();return range;
  }
  function currentRange(controller) {
    return ownedRange(controller) ?? (controller.lastRange && controller.element.contains(controller.lastRange.startContainer)?controller.lastRange.cloneRange():rangeAt(controller,read(controller.element).value.length));
  }
  function publish(controller,boundary=false) {
    const value=read(controller.element).value;
    controller.element.classList.toggle('is-empty',!value);
    controller.element.setAttribute('aria-invalid',String(Boolean(controller.element.querySelector('.is-missing'))));
    if(controller.source.value===value)return;
    controller.source.value=value;
    const event=new Event('input',{bubbles:true});event.studioHistoryBoundary=boundary;
    controller.source.dispatchEvent(event);
  }
  function insert(controller,text,range=currentRange(controller),boundary=true) {
    if(controller.composing)return;
    if(!read(controller.element).value && controller.element.querySelector('br')) {
      controller.element.replaceChildren(document.createTextNode(''));range=rangeAt(controller,0);
    }
    if(!controller.multiline)text=text.replace(/\r\n?|\n/g,' ');
    else text=text.replace(/\r\n?/g,'\n');
    const offset=offsets(controller,range).from;
    range.deleteContents();range.insertNode(fragment(text));
    selectRange(controller,rangeAt(controller,offset+text.length));
    controller.dismissed=null;close();publish(controller,boundary);
  }
  function queryAt(controller) {
    const range=ownedRange(controller);if(!range?.collapsed)return null;
    const end=offsets(controller,range).from,prefix=read(controller.element).value.slice(0,end);
    const match=prefix.match(/(?:^|[\s(\[\{「『“‘"'])\/([^\/\r\n{}]*)$/u);
    if(!match)return null;
    const text=match[1],start=end-text.length-1;
    // A space-separated phrase can contain spaces, but not a URL/path delimiter.
    if(/[\\:]/.test(text))return null;
    return {text,start,end,key:`${start}:${end}:${text}`};
  }
  function candidates(query) {
    const term=normalize(query);
    return [...itemMap().values()].map(item=>{
      const name=normalize(item.name);
      return {item,rank:name===term?0:name.startsWith(term)?1:name.includes(term)?2:3};
    }).filter(row=>row.rank<3).sort((a,b)=>a.rank-b.rank||a.item.name.localeCompare(b.item.name,'ko')||a.item.id.localeCompare(b.item.id)).slice(0,8).map(row=>row.item);
  }
  function menu() {
    if(popup)return popup;
    popup=document.createElement('div');popup.id='studioItemSuggestions';popup.className='item-suggestions';popup.hidden=true;
    popup.setAttribute('role','listbox');popup.setAttribute('aria-label','연결할 아이템');document.body.append(popup);
    popup.addEventListener('pointerdown',event=>event.preventDefault());
    popup.addEventListener('click',event=>{
      const option=event.target.closest('[data-item-option]');if(option && active)accept(active,Number(option.dataset.itemOption));
    });
    window.addEventListener('resize',position);
    document.addEventListener('scroll',position,true);
    document.addEventListener('pointerdown',event=>{if(active&&!active.element.contains(event.target)&&!popup.contains(event.target))close();},true);
    document.addEventListener('selectionchange',()=>{
      const editor=document.activeElement?.closest('.item-text-editor'),controller=editor?.studioItemController;
      if(controller){saveSelection(controller);suggest(controller);}else close();
    });
    return popup;
  }
  function position() {
    if(!active || !popup || popup.hidden)return;
    if(!active.element.isConnected){close();return;}
    const range=ownedRange(active),caret=range?.getBoundingClientRect(),field=active.element.getBoundingClientRect();
    const rect=caret && (caret.width||caret.height)?caret:field;
    const width=Math.max(160,Math.min(360,window.innerWidth-24));popup.style.width=`${width}px`;
    popup.style.left=`${Math.max(8,Math.min(rect.left,window.innerWidth-width-8))}px`;
    const height=popup.getBoundingClientRect().height;
    popup.style.top=`${Math.max(8,rect.bottom+height+8>window.innerHeight?rect.top-height-6:rect.bottom+6)}px`;
  }
  function close() {
    if(active){active.element.setAttribute('aria-expanded','false');active.element.removeAttribute('aria-activedescendant');active.menuKey=null;}
    active=null;if(popup)popup.hidden=true;
  }
  function highlight(controller) {
    for(const option of popup.querySelectorAll('[data-item-option]')){
      const selected=Number(option.dataset.itemOption)===controller.index;option.setAttribute('aria-selected',String(selected));
      if(selected){controller.element.setAttribute('aria-activedescendant',option.id);option.scrollIntoView({block:'nearest'});}
    }
  }
  function suggest(controller) {
    if(controller.composing || document.activeElement!==controller.element)return;
    const query=queryAt(controller);
    if(!query || query.key===controller.dismissed){if(active===controller)close();return;}
    const root=menu(),matches=candidates(query.text),key=`${query.key}:${matches.map(item=>item.id+':'+item.name).join('|')}`;
    if(active===controller && controller.menuKey===key){position();return;}
    close();active=controller;controller.menuKey=key;controller.query=query;controller.matches=matches;controller.index=matches.length?0:-1;
    root.replaceChildren();
    if(!matches.length){const empty=document.createElement('div');empty.className='item-suggestions-empty';empty.setAttribute('role','status');empty.textContent='등록된 아이템이 없습니다. 다른 이름으로 찾아보세요.';root.append(empty);}
    matches.forEach((item,index)=>{
      const option=document.createElement('button');option.type='button';option.tabIndex=-1;option.id=`studioItemOption${index}`;
      option.dataset.itemOption=String(index);option.setAttribute('role','option');
      const name=document.createElement('strong'),detail=document.createElement('small');name.textContent=item.name;detail.textContent=`${kinds[item.kind]??item.kind} · ${item.id}`;
      option.append(name,detail);root.append(option);
    });
    controller.element.setAttribute('aria-expanded','true');root.hidden=false;position();highlight(controller);
  }
  function accept(controller,index=controller.index) {
    if(controller.composing)return;
    const query=queryAt(controller),item=controller.matches[index];
    if(!query || query.key!==controller.query?.key || !item)return;
    const current=itemMap().get(item.id);if(!current){suggest(controller);return;}
    insert(controller,`{{item:${current.id}}}`,rangeAt(controller,query.start,query.end));
  }
  function deleteAtomic(controller,backward) {
    const range=ownedRange(controller);if(!range)return false;
    const {from,to}=offsets(controller,range),parts=read(controller.element).parts;
    if(!range.collapsed){
      if(parts.some(part=>part.node.dataset?.itemToken && part.from<to && part.to>from)){insert(controller,'',range);return true;}
      return false;
    }
    const tag=parts.find(part=>part.node.dataset?.itemToken && (backward?part.to===from:part.from===from));
    if(!tag)return false;
    insert(controller,'',rangeAt(controller,tag.from,tag.to));return true;
  }
  function clipboard(controller,event,cut=false) {
    const range=ownedRange(controller);if(!range || range.collapsed || !event.clipboardData)return;
    const text=read(range.cloneContents()).value;
    event.preventDefault();event.clipboardData.setData('text/plain',resolveItemTextPreview(text));
    try{event.clipboardData.setData(clipboardType,JSON.stringify({version:1,text}));}catch{/* Plain-text copying remains available. */}
    if(cut)insert(controller,'',range);
  }
  function pasteValue(data) {
    try{const parsed=JSON.parse(data.getData(clipboardType));if(parsed.version===1 && typeof parsed.text==='string')return parsed.text;}catch{}
    return data.getData('text/plain');
  }
  function mount(source,value,options={}) {
    if(!source)return null;
    if(controllers.has(source))return controllers.get(source);
    if(active && !active.element.isConnected)close();
    const wrapper=document.createElement('div');wrapper.className='item-text-control';
    const element=document.createElement('div');element.className='item-text-editor';element.contentEditable='true';element.spellcheck=false;
    element.id=`studioItemText${++sequence}`;element.setAttribute('role','textbox');
    const multiline=options.multiline??source.tagName==='TEXTAREA';element.setAttribute('aria-multiline',String(multiline));
    element.setAttribute('aria-autocomplete','list');element.setAttribute('aria-controls','studioItemSuggestions');element.setAttribute('aria-expanded','false');
    element.setAttribute('aria-label',source.getAttribute('aria-label')??source.closest('label')?.querySelector('span')?.textContent??'원고');
    element.dataset.placeholder=source.placeholder||'/아이템이름으로 아이템 연결';element.classList.toggle('is-multiline',multiline);
    source.before(wrapper);wrapper.append(source,element);source.hidden=true;source.tabIndex=-1;source.setAttribute('aria-hidden','true');
    const hint=document.createElement('small');hint.className='item-text-hint';hint.id=`${element.id}Hint`;hint.textContent='/아이템이름 · Enter/Tab으로 연결 · Esc로 닫기';wrapper.append(hint);element.setAttribute('aria-describedby',hint.id);
    const controller={source,element,multiline,key:options.key??'',composing:false,lastRange:null,dismissed:null,menuKey:null,index:-1,matches:[],
      focus:()=>{const range=currentRange(controller);selectRange(controller,range);},
      insert:text=>insert(controller,text),
    };
    controllers.set(source,controller);source.studioItemEditor=controller;element.studioItemController=controller;
    source.value=String(value??'');element.append(fragment(source.value));element.classList.toggle('is-empty',!source.value);
    element.setAttribute('aria-invalid',String(Boolean(element.querySelector('.is-missing'))));
    element.addEventListener('focus',()=>{saveSelection(controller);suggest(controller);});
    element.addEventListener('blur',()=>{saveSelection(controller);queueMicrotask(()=>{if(document.activeElement!==element && active===controller)close();});});
    element.addEventListener('input',()=>{saveSelection(controller);publish(controller);if(!controller.composing)suggest(controller);});
    element.addEventListener('compositionstart',()=>{controller.composing=true;close();});
    element.addEventListener('compositionend',()=>{controller.composing=false;publish(controller);queueMicrotask(()=>{refresh();suggest(controller);});});
    element.addEventListener('keydown',event=>{
      if(event.isComposing || controller.composing || event.keyCode===229)return;
      if(active===controller){
        if(event.key==='Escape'){event.preventDefault();controller.dismissed=queryAt(controller)?.key;close();return;}
        if(['ArrowDown','ArrowUp'].includes(event.key)&&controller.matches.length){event.preventDefault();controller.index=(controller.index+(event.key==='ArrowDown'?1:-1)+controller.matches.length)%controller.matches.length;highlight(controller);return;}
        if(['Enter','Tab'].includes(event.key)&&!event.shiftKey&&controller.matches.length){event.preventDefault();accept(controller);return;}
      }
      if(event.key==='Enter'&&!event.ctrlKey&&!event.metaKey){event.preventDefault();if(multiline)insert(controller,'\n',currentRange(controller),false);return;}
      if(['Backspace','Delete'].includes(event.key)&&!event.ctrlKey&&!event.metaKey&&deleteAtomic(controller,event.key==='Backspace'))event.preventDefault();
    });
    element.addEventListener('beforeinput',event=>{
      if(event.isComposing||controller.composing)return;
      if(event.inputType==='historyUndo'||event.inputType==='historyRedo'){event.preventDefault();restoreWriterHistory(event.inputType==='historyUndo'?-1:1);return;}
      if(event.inputType?.startsWith('format')||['insertOrderedList','insertUnorderedList'].includes(event.inputType)){event.preventDefault();return;}
      if(['insertParagraph','insertLineBreak'].includes(event.inputType)){event.preventDefault();if(multiline)insert(controller,'\n',currentRange(controller),false);return;}
      if(event.inputType==='insertText' && event.data!==null) {
        const range=ownedRange(controller);
        if(range&&!range.collapsed&&range.cloneContents().querySelector('[data-item-token]')){event.preventDefault();insert(controller,event.data,range);return;}
      }
      if(['deleteContentBackward','deleteContentForward'].includes(event.inputType)&&deleteAtomic(controller,event.inputType==='deleteContentBackward'))event.preventDefault();
    });
    element.addEventListener('copy',event=>clipboard(controller,event));
    element.addEventListener('cut',event=>clipboard(controller,event,true));
    element.addEventListener('paste',event=>{event.preventDefault();if(!controller.composing&&event.clipboardData)insert(controller,pasteValue(event.clipboardData));});
    element.addEventListener('dragstart',event=>event.preventDefault());
    element.addEventListener('dragover',event=>event.preventDefault());
    element.addEventListener('drop',event=>{
      event.preventDefault();if(controller.composing||!event.dataTransfer)return;
      const point=document.caretPositionFromPoint?.(event.clientX,event.clientY);
      let range=document.caretRangeFromPoint?.(event.clientX,event.clientY);
      if(point){range=document.createRange();range.setStart(point.offsetNode,point.offset);range.collapse(true);}
      if(range&&element.contains(range.startContainer)){selectRange(controller,range);range=ownedRange(controller);}else range=currentRange(controller);
      insert(controller,pasteValue(event.dataTransfer),range);
    });
    return controller;
  }
  function refresh() {
    const registry=itemMap();
    for(const editor of document.querySelectorAll('.item-text-editor')) {
      const controller=editor.studioItemController;if(!controller || controller.composing)continue;
      if(controller.itemSignature===itemSignature)continue;
      controller.itemSignature=itemSignature;
      editor.querySelectorAll('[data-item-token]').forEach(tag=>decorateTag(tag,registry));
      editor.setAttribute('aria-invalid',String(Boolean(editor.querySelector('.is-missing'))));
    }
  }
  function sourceFor(element){return element?.closest?.('.item-text-editor')?.studioItemController?.source??element;}
  function surface(source){return source?.studioItemEditor?.element??source;}
  function bookmark() {
    const controller=document.activeElement?.closest('.item-text-editor')?.studioItemController;
    const range=controller&&ownedRange(controller);
    return controller?.key && range ? {key:controller.key,...offsets(controller,range)} : null;
  }
  function restore(bookmark) {
    if(!bookmark)return;
    const controller=[...document.querySelectorAll('.item-text-editor')].map(node=>node.studioItemController).find(row=>row?.key===bookmark.key);
    if(controller)selectRange(controller,rangeAt(controller,bookmark.from,bookmark.to));
  }
  return {mount,close,refresh,sourceFor,surface,bookmark,restore};
})();
