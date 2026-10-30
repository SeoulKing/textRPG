/* Account data is rendered as text; no provider profile is exposed to the world. */
const element = id => document.getElementById(id);
async function api(route,body) {
  const response=await fetch(route,{method:body===undefined?"GET":"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await response.json();
  if(!response.ok)throw new Error(data.message || "요청을 처리하지 못했습니다.");
  return data;
}
function message(text) {element("status").textContent=text;}
async function refresh() {
  const info=await api("/api/auth/me");
  const registered=!!info.user;
  const developing=!!info.developmentAccess;
  if(developing && !info.user && !info.guest)await api("/api/auth/guest",{});
  element("identity").textContent=registered?(info.character?.name || "이름 미등록"):"방문자";
  element("description").textContent=registered?"연결한 로그인은 같은 캐릭터를 사용합니다.":"로그인하면 캐릭터 이름을 정하고 다른 기기에서도 진행을 이어갈 수 있습니다.";
  element("registration").hidden=(!registered && !developing) || !!info.characterChoices?.length;
  if(developing) {element("identity").textContent=info.character?.name || "개발용 캐릭터";element("description").textContent="개발 중에는 로그인 없이 이름을 정하고 입장하실 수 있습니다. 진행은 이 브라우저에 보관됩니다.";}
  element("logout").hidden=!registered;
  element("name").value=info.character?.name || "";
  for(const provider of ["kakao","google"]) {
    const link=element(provider),configured=info[provider+"Configured"],linked=info.linkedProviders?.includes(provider);
    link.hidden=!configured || developing;
    link.textContent=(provider==="kakao"?"카카오":"구글")+(linked?" 연결됨":registered?" 연결하기":" 로그인");
    link.href="/api/auth/"+provider+"/start"+(registered?"?link=1":"");
  }
  element("choices").hidden=!info.characterChoices?.length;
  element("play").hidden=!!info.characterChoices?.length;
  element("choice-list").replaceChildren();
  for(const character of info.characterChoices || []) {
    const button=document.createElement("button");button.type="button";button.className="choice";
    button.textContent=character.name+" · "+new Date(character.createdAt).toLocaleDateString("ko-KR");
    button.addEventListener("click",()=>run(async()=>{await api("/api/account/select-character",{characterId:character.id});await refresh();message("선택한 캐릭터로 이어갑니다.");}));
    element("choice-list").append(button);
  }
}
async function run(action) {try{await action();}catch(error){message(error.message);}}
element("name-form").addEventListener("submit",event=>{event.preventDefault();run(async()=>{await api("/api/account/register",{name:element("name").value});await refresh();message("캐릭터 이름을 등록했습니다.");});});
element("logout").addEventListener("click",()=>run(async()=>{await api("/api/auth/logout",{});await refresh();message("로그아웃했습니다.");}));
run(async()=>{await refresh();const result=new URLSearchParams(location.search).get("login");message(result==="failed"?"로그인하지 못했습니다. 다시 시도해 주세요.":result==="success"?"로그인했습니다.":result==="cancelled" || result==="expired"?"로그인을 다시 진행해 주세요.":"");});
