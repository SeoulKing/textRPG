/* Painted object sprites share one 2:1 orthographic world projection.
   Art is registered at the lowest opaque foundation pixel, never skewed or mirrored. */
(() => {
  "use strict";
  const W=1200,H=740,U=40;
  const places=[
    {id:"shop",name:"상점",label:[34,43],bounds:[270,60,310,300],actionId:"enter_arcana_shop",description:"푸른 지붕 아래 물약과 마도구가 놓인 가게입니다."},
    {id:"inn",name:"여관",label:[26,70],bounds:[210,215,340,345],actionId:"enter_arcana_inn",description:"광장 가장자리에 자리한 따뜻한 불빛의 여관입니다."},
    {id:"restaurant",name:"식당",label:[74,70],bounds:[640,200,350,365],actionId:"enter_arcana_restaurant",description:"차양 아래 테라스와 작은 식탁이 놓인 식당입니다."},
    {id:"hunting",name:"사냥터로 가는 길",label:[73,43],bounds:[705,30,235,300],description:"광장 밖 별빛 초원으로 이어지는 성문입니다."},
    {id:"fountain",name:"중앙 분수",label:[50,62],bounds:[480,225,240,215],description:"분수를 중심으로 상점과 여관, 식당으로 가는 길이 나뉩니다. 지도에서 목적지를 골라 주세요."},
    {id:"portal",name:"귀환 포탈",label:[50,91],bounds:[540,400,155,235],actionId:"return_through_arcana_portal",description:"방금 건너온 문입니다. 푸른 빛 너머로 현실의 들판이 보입니다."}
  ];
  const mappedActions=new Set(places.map(d=>d.actionId).filter(Boolean));
  const p=(x,y,z=0)=>[600+(x-y)*U,105+(x+y)*U/2-z];
  const SPRITE_DEFS={"shop":{"crop":[101,85,1207,1139],"foot":[654,1138],"width":300,"ground":[4,8.2]},"inn":{"crop":[91,70,1188,1162],"foot":[730,1161],"width":330,"ground":[8.7,13.5]},"restaurant":{"crop":[70,50,1184,1216],"foot":[561,1215],"width":330,"ground":[13.5,8.7]},"hunting":{"crop":[177,20,1163,1227],"foot":[961,1226],"width":226,"ground":[9.05,1.59]},"fountain":{"crop":[24,85,1229,1139],"foot":[628,1138],"width":235,"ground":[8.25,8.25]},"portal":{"crop":[262,47,1065,1207],"foot":[895,1206],"width":145,"ground":[13.5,12.5]},"garden":{"crop":[181,48,1093,1182],"foot":[763,1181],"width":70}};
  const spriteRoot=new URL("arcana-map/sprites/",document.currentScript?.src||new URL("/assets/arcana-map.js",location.href));
  const DRAW_ORDER=[["hunting",10.64],["shop",12.2],["fountain",16.5],["inn",22.2],["restaurant",22.2],["portal",26]];
  const sprites=new Map(),mapInstances=new Set();
  let started=false;
  function ensureSprites(){
    if(started)return;started=true;
    for(const [id,spec]of Object.entries(SPRITE_DEFS)){
      const image=new Image(),entry={image,spec,ready:false,failed:false};sprites.set(id,entry);
      image.onload=()=>{
        entry.ready=true;
        if(id!=="garden"){
          const [l,top,r,b]=spec.crop,c=document.createElement("canvas");c.width=Math.ceil((r-l)/4);c.height=Math.ceil((b-top)/4);
          const ctx=c.getContext("2d",{willReadFrequently:true});ctx.drawImage(image,l,top,r-l,b-top,0,0,c.width,c.height);
          const data=ctx.getImageData(0,0,c.width,c.height).data,alpha=new Uint8Array(c.width*c.height);
          for(let i=0;i<alpha.length;i++)alpha[i]=data[i*4+3];
          entry.hitMask={width:c.width,height:c.height,alpha};
        }
        for(const map of mapInstances){map.updateAssets();map.paint();}
      };
      image.onerror=()=>{entry.failed=true;for(const map of mapInstances){map.updateAssets();map.paint();}};
      image.src=new URL(id+".png",spriteRoot).href;
    }
  }
  function poly(g,points,fill,stroke="#b6ad97",width=1){
    g.beginPath();points.forEach((q,i)=>i?g.lineTo(...q):g.moveTo(...q));g.closePath();
    if(fill){g.fillStyle=fill;g.fill();}if(stroke){g.strokeStyle=stroke;g.lineWidth=width;g.stroke();}
  }
  function line(g,points,color,width=1){g.beginPath();points.forEach((q,i)=>i?g.lineTo(...q):g.moveTo(...q));g.strokeStyle=color;g.lineWidth=width;g.stroke();}
  const floor=(g,x,y,w,d,fill,stroke)=>poly(g,[p(x,y),p(x+w,y),p(x+w,y+d),p(x,y+d)],fill,stroke);
  function oval(g,x,y,rx,ry,fill,stroke,width=1){
    g.beginPath();g.ellipse(x,y,rx,ry,0,0,Math.PI*2);
    if(fill){g.fillStyle=fill;g.fill();}if(stroke){g.strokeStyle=stroke;g.lineWidth=width;g.stroke();}
  }
  function spriteRect(spec,ground,width){
    const [l,top,r,b]=spec.crop,scale=(width||spec.width)/(r-l),[gx,gy]=p(...(ground||spec.ground));
    return{x:gx-(spec.foot[0]-l)*scale,y:gy-(spec.foot[1]-top)*scale,width:(r-l)*scale,height:(b-top)*scale};
  }
  function sprite(g,id,ground,width,highlight=false){
    const entry=sprites.get(id);if(!entry?.ready)return;
    const spec=entry.spec,[l,top,r,b]=spec.crop,rect=spriteRect(spec,ground,width);
    g.save();g.imageSmoothingEnabled=true;g.imageSmoothingQuality="high";
    if(highlight){g.shadowColor="#f3c66d";g.shadowBlur=17;}
    g.drawImage(entry.image,l,top,r-l,b-top,rect.x,rect.y,rect.width,rect.height);g.restore();
  }
  function effects(g,id,t){
    if(!sprites.get(id)?.ready)return;
    if(id==="fountain"){
      const [x,y]=p(7,7);
      for(const side of [-1,1]){const r=5+(t*5%13);oval(g,x+side*50,y-13,r,r/2,null,"#e8fcff88",1.2);}
      for(let k=0;k<5;k++){const a=k*1.26+t*.25;oval(g,x+Math.cos(a)*66,y-13+Math.sin(a)*30,1.2,1.2,"#eeffffaa");}
    }else{
      const [x,y]=p(12.7,12.7);
      for(let k=0;k<5;k++){const a=k*1.26+t*.3;oval(g,x+Math.cos(a)*36+20,y-84+Math.sin(a)*61,1.4,1.4,"#cbd0ffbb");}
    }
  }
  function ground(g){
    const bg=g.createLinearGradient(0,0,0,H);bg.addColorStop(0,"#f5f2e9");bg.addColorStop(1,"#e1e6d9");g.fillStyle=bg;g.fillRect(0,0,W,H);
    g.save();g.shadowColor="#3b493120";g.shadowBlur=24;g.shadowOffsetY=12;
    poly(g,[p(0,0),p(14,0),p(14,14),p(0,14)],"#dad8c5",null);g.restore();
    poly(g,[p(0,14),p(14,14),p(14,14,-13),p(0,14,-13)],"#b7b6a4","#adae9a");
    poly(g,[p(14,0),p(14,14),p(14,14,-13),p(14,0,-13)],"#cec4ae","#bcb19a");
    for(let x=0;x<14;x++)for(let y=0;y<14;y++){
      const path=(x>=5&&x<=8)||(y>=5&&y<=8);
      const tones=path?["#ece1c6","#e6dbc0","#f1e6cc","#e8ddc3"]:["#d6dac5","#d0d5bd","#dadcc8","#d4d8c2"];
      const seed=(x*7+y*13)%4;
      floor(g,x,y,1,1,tones[seed],path?"#bcae8c55":"#b4b89b44");
      const [sx,sy]=p(x+.46,y+.52);
      line(g,[[sx-8,sy-1],[sx+5,sy+1]],path?"#bfae8a18":"#9da58b18",.8);
    }
    const [cx,cy]=p(7,7);
    oval(g,cx,cy,211,105.5,"#eadfc6","#c7b694",2);
    oval(g,cx,cy,194,97,"#efe3ca","#ddc9a3",3);
    oval(g,cx,cy,172,86,"#e5d6b9","#c3ad7f",1);
    oval(g,cx,cy,154,77,"#ede0c5","#d2bb91",2);
    for(let k=0;k<16;k++){const a=k*Math.PI/8;line(g,[[cx+Math.cos(a)*174,cy+Math.sin(a)*87],[cx+Math.cos(a)*191,cy+Math.sin(a)*95.5]],"#c5b38b",1);}
    floor(g,6.5,-2.7,2,3,"#c9ceb0","#a7b38e");for(let i=0;i<5;i++)floor(g,7,-2.4+i*.55,.95,.34,"#dfd4b4","#b3b695");
    for(const x of [0,14])for(let y=0;y<14;y+=2)floor(g,x-.08,y,.16,.8,"#d1bd94","#bcae8e");
  }
  function draw(g,t,selected,hover){
    g.clearRect(0,0,W,H);ground(g);
    const objects=[],add=(depth,fn)=>objects.push({depth,fn});
    for(const [id,depth]of DRAW_ORDER){
      add(depth,()=>{sprite(g,id,null,null,selected===id||hover===id);if(id==="portal"||id==="fountain")effects(g,id,t);});
    }
    const gardens=[[.5,2.8,72],[.5,9.4,74],[3.2,13.4,72],[10,13.4,72],[13.5,10,72],[13.5,3.3,72],[4,.4,68],[10.3,.5,72],[4.8,5,45],[5,9.5,45],[9.2,5,45],[9.7,9.3,45]];
    for(const [x,y,width]of gardens)add(x+y,()=>sprite(g,"garden",[x,y],width));
    objects.sort((a,b)=>a.depth-b.depth).forEach(object=>object.fn());
  }
  class ArcanaMap{
    constructor(host,onActivate){
      this.host=host;this.onActivate=onActivate;this.selected="fountain";this.hover=null;this.frame=0;this.time=0;this.last=0;
      host.className="arcana-map";host.setAttribute("aria-label","아르카나 광장 안내 지도");
      host.innerHTML='<div class="arcana-map-heading"><div><span class="arcana-map-eyebrow">마법도시</span><h2>아르카나 광장</h2></div><span class="arcana-map-guide">장소를 골라 둘러보세요</span></div><div class="arcana-map-board"><canvas width="1200" height="740" role="img" aria-label="중앙 분수를 둘러싼 상점, 여관, 식당, 사냥터 입구와 귀환 포탈. 각 장소 버튼으로 선택할 수 있습니다."></canvas><div class="arcana-map-pins" role="group" aria-label="광장의 장소"></div></div><div class="arcana-map-detail"><div><h3></h3><p aria-live="polite"></p></div><button type="button" class="arcana-map-enter">들어가기 ↗</button></div>';
      this.canvas=host.querySelector("canvas");this.g=this.canvas.getContext("2d");this.title=host.querySelector(".arcana-map-detail h3");this.desc=host.querySelector(".arcana-map-detail p");this.enter=host.querySelector(".arcana-map-enter");this.buttons=new Map();
      for(const d of places){const b=document.createElement("button");b.type="button";b.className="arcana-map-pin";b.style.left=d.label[0]+"%";b.style.top=d.label[1]+"%";b.textContent=d.name;b.setAttribute("aria-pressed","false");b.setAttribute("aria-label",d.name+" 선택");
        b.addEventListener("click",()=>this.select(d.id));b.addEventListener("pointerenter",()=>{this.hover=d.id;this.paint();});b.addEventListener("pointerleave",()=>{this.hover=null;this.paint();});b.addEventListener("focus",()=>{this.hover=d.id;this.paint();});b.addEventListener("blur",()=>{this.hover=null;this.paint();});
        host.querySelector(".arcana-map-pins").append(b);this.buttons.set(d.id,b);
      }
      this.canvas.addEventListener("pointermove",e=>{const d=this.hit(e);if(this.hover!==(d?.id||null)){this.hover=d?.id||null;this.canvas.style.cursor=d?"pointer":"default";this.paint();}});
      this.canvas.addEventListener("pointerleave",()=>{this.hover=null;this.paint();});
      this.canvas.addEventListener("click",e=>{const d=this.hit(e);if(d&&!this.busy)this.select(d.id);});
      this.enter.addEventListener("click",()=>{const d=places.find(v=>v.id===this.selected),choice=this.actionFor(d);if(!this.busy&&choice)this.onActivate?.(choice,this.enter);});
      this.reduced=window.matchMedia("(prefers-reduced-motion: reduce)");this.resize=new ResizeObserver(()=>this.paint());this.resize.observe(this.canvas);
      this.assetStatus=document.createElement("p");this.assetStatus.className="arcana-map-asset-status";this.assetStatus.setAttribute("role","status");
      host.querySelector(".arcana-map-board").before(this.assetStatus);mapInstances.add(this);this.updateAssets();ensureSprites();
    }
    updateAssets(){
      const entries=[...sprites.values()],failed=entries.filter(entry=>entry.failed).length;
      const pending=Object.keys(SPRITE_DEFS).length-entries.filter(entry=>entry.ready||entry.failed).length;
      this.assetStatus.hidden=!pending&&!failed;
      this.assetStatus.textContent="";
      if(failed)this.assetStatus.textContent="일부 장소 그림을 불러오지 못했습니다. 다시 열어 주세요.";
      else if(pending)this.assetStatus.textContent="광장을 불러오는 중…";
      this.host.querySelector(".arcana-map-board").setAttribute("aria-busy",String(pending>0));
    }
    hit(e){
      const r=this.canvas.getBoundingClientRect(),x=(e.clientX-r.left)*W/r.width,y=(e.clientY-r.top)*H/r.height;
      for(const [id]of [...DRAW_ORDER].reverse()){
        const entry=sprites.get(id);if(!entry?.hitMask)continue;
        const rect=spriteRect(entry.spec),mask=entry.hitMask;
        if(x<rect.x||x>=rect.x+rect.width||y<rect.y||y>=rect.y+rect.height)continue;
        const mx=Math.floor((x-rect.x)/rect.width*mask.width),my=Math.floor((y-rect.y)/rect.height*mask.height);
        if(mask.alpha[my*mask.width+mx]>=48)return places.find(place=>place.id===id);
      }
      return null;
    }
    actionFor(d){
      if(!d||!this.snapshot)return null;
      if(d.id==="hunting"){const entry=this.snapshot.mapEntries?.find(e=>e.locationId==="arcana_hunting_ground");return entry?.isReachable?{action:{type:"travel",targetId:"arcana_hunting_ground"},label:d.name}:null;}
      return(this.snapshot.availableActions||[]).find(a=>a.id===d.actionId&&a.isAvailable!==false)||null;
    }
    select(id){this.selected=id;this.updateDetail();this.paint();}
    updateDetail(){
      const d=places.find(v=>v.id===this.selected)||places[4];this.title.textContent=d.name;this.desc.textContent=d.description;const choice=this.actionFor(d);
      this.enter.hidden=d.id==="fountain"||!this.snapshot;this.enter.disabled=this.busy||!choice;this.enter.textContent=d.id==="portal"?"들판으로 돌아가기 ↗":d.id==="hunting"?"사냥터로 이동 ↗":"들어가기 ↗";
      for(const[id,b]of this.buttons){b.disabled=this.busy;b.setAttribute("aria-pressed",String(id===d.id));}
    }
    update(snapshot,busy=false){this.snapshot=snapshot;this.busy=busy||Boolean(snapshot?.state?.isGameOver);this.updateDetail();this.paint();this.start();}
    paint(){
      const ratio=Math.min(window.devicePixelRatio||1,2),r=this.canvas.getBoundingClientRect(),width=Math.max(1,Math.round((r.width||W)*ratio)),height=Math.round(width*H/W);
      if(this.canvas.width!==width||this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height;}
      this.g.setTransform(width/W,0,0,height/H,0,0);draw(this.g,this.time,this.selected,this.hover);
    }
    start(){
      if(this.frame||this.reduced.matches)return;
      const tick=now=>{if(this.host.hidden||!this.host.isConnected||!this.host.getClientRects().length){this.frame=0;return;}if(!document.hidden&&now-this.last>50){this.time+=Math.min((now-(this.last||now))/1000,.1);this.last=now;this.paint();}this.frame=requestAnimationFrame(tick);};
      this.frame=requestAnimationFrame(tick);
    }
    hide(){this.host.hidden=true;cancelAnimationFrame(this.frame);this.frame=0;this.last=0;}
    show(){this.host.hidden=false;this.start();}
    state(){return{projection:"2:1 orthographic quarter view",camera:{yaw:45,elevation:30},people:0,spriteAssets:[...sprites].map(([id,entry])=>({id,ready:entry.ready,failed:entry.failed})),selected:this.selected,places:places.map(d=>({id:d.id,name:d.name})),coordinates:"origin at rear corner; x down-right, y down-left, z up"};}
  }
  let mainMap=null,active=false;
  window.ArcanaMapUI={
    create(host,onActivate){return new ArcanaMap(host,onActivate);},
    update(snapshot,busy,onActivate){
      active=Boolean(snapshot?.state?.location==="arcana_plaza"&&!snapshot.state.magicDungeon?.run&&!snapshot.state.npcDialogue?.active&&["arcana_plaza_first_intro","arcana_plaza_repeat_intro"].includes(snapshot.currentScene?.id));
      document.querySelector(".scene-frame")?.classList.toggle("has-arcana-map",active);
      if(!active){mainMap?.hide();return;}
      if(!mainMap){const host=document.createElement("section");host.id="arcana-map";document.querySelector(".scene-copy").before(host);mainMap=new ArcanaMap(host,onActivate);}
      mainMap.onActivate=onActivate;mainMap.show();mainMap.update(snapshot,busy);
    },
    handles(choice){return active&&mappedActions.has(choice.id);},
    state(){return active?mainMap?.state()||null:null;}
  };
})();
