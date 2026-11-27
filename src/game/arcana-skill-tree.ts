import type { GameState } from "./schemas";
import { canChangeArcanaBuild } from "./arcana-skill-training";

// Shared topology; each spell owns its vocabulary and specialization effects.
export type TreeNode = { id: string; name: string; maxRank: number; row: number; column: number; parents: string[]; level: number; effect: string; amount: number; specialization?: string; pointCost?: number; automatic?: boolean };
const names: Record<string, string[]> = {
  fireball: ["위력 강화", "사거리 강화", "불꽃 응축", "응축된 불꽃", "멀리 타는 불꽃", "폭렬탄", "관통탄", "폭발 강화", "연쇄 화력", "관통 강화", "잔열", "화염 폭풍", "유성 관통"],
  flame_wave: ["화력 강화", "마나 절약", "빠른 시전", "응축된 열기", "안정된 시전", "집중 화염", "넓은 불길", "열기 강화", "화력 증폭", "확산 강화", "잔불", "화염 해일", "불길의 대지"],
  flame_guard: ["보호 강화", "마나 절약", "빠른 시전", "응축된 장막", "안정된 시전", "단단한 장막", "오래가는 장막", "보호 증폭", "불굴의 장막", "지속 강화", "안정된 장막", "화염 성채", "영원의 불꽃"],
};
export const FIREBALL_THRESHOLDS = [100,200,300,500,800,1200,1800,2600,3500];
export function fireballProgress(xp: number) {
  let remaining = Math.max(0,xp), level = 1, required = FIREBALL_THRESHOLDS[0];
  while (remaining >= required) {
    remaining -= required; level++;
    required = level<=9 ? FIREBALL_THRESHOLDS[level-1] : Math.ceil(required*1.25);
  }
  return {level,xp:remaining,xpRequired:required};
}
export function skillLevel(xp: number) { return 1 + Math.floor(xp / 400); }
export function fireballLevel(state: GameState) { return fireballProgress(state.arcanaCombat.skillTraining.fireball?.xp ?? 0).level; }
export function fireballMaster(state: GameState) { return fireballLevel(state) >= 10; }
export function fireballSpecialization(state: GameState, key: string) { return state.arcanaCombat.skillTraining.fireball?.specializations.includes(key) ?? false; }
export function normalizeFireballTraining(combat: GameState["arcanaCombat"]) {
  const entry = combat.skillTraining.fireball ??= {xp:0,specializations:[],activeSpecialization:null};
  if (entry.treeVersion !== 3) {
    entry.treeRanks = {}; entry.activeSpecialization = null; entry.specializations = []; entry.ultimate = null; entry.ultimates=[]; entry.treeVersion = 3;
  }
  const nodes = fireballNodes(), level = fireballProgress(entry.xp).level;
  entry.treeRanks = Object.fromEntries(Object.entries(entry.treeRanks ?? {}).filter(([key]) => nodes.some(node => node.id===key && !node.automatic)));
  entry.specializations = [...new Set(entry.specializations)].filter(key => ["burst","reach"].includes(key)).slice(0,level>=6 ? 2 : level>=5 ? 1 : 0);
  entry.activeSpecialization = entry.specializations[0] ?? null;
  entry.ultimates = [...new Set(entry.ultimates ?? [])].filter(key => ["meteor","giant_fireball","flame_barrage"].includes(key)).slice(0,Math.max(0,Math.min(3,level-6)));
  entry.ultimate=entry.ultimates[0] ?? null;
  combat.learnedSpells = (combat.learnedSpells ?? ["fireball"]).filter(id => !["meteor","giant_fireball","flame_barrage"].includes(id) || entry.ultimates!.some(key => key===id));
  for (const id of entry.ultimates) if (!combat.learnedSpells.includes(id)) combat.learnedSpells.push(id);

}
function fireballNodes(): TreeNode[] {
  const node = (id:string,name:string,row:number,column:number,level:number,effect:string,amount:number,maxRank=1,pointCost=0,specialization?:string,automatic=false):TreeNode => ({id,name,row,column,level,effect,amount,maxRank,pointCost,parents:[],...(specialization?{specialization}:{}),...(automatic?{automatic}: {})});
  return [node("power","위력 강화",1,.2,1,"power",30,1,1),node("range","사거리 강화",1,.5,1,"range",30,1,1),node("haste","쿨타임 감소",1,.8,1,"haste",30,1,1),
    node("burst","폭발형",2,.28,5,"burst",0,1,0,"style"),node("reach","관통형",2,.72,5,"reach",0,1,0,"style"),
    node("meteor","메테오",3,.2,7,"ultimate",0,1,0,"ultimate"),node("giant_fireball","거대화염구",3,.5,7,"ultimate",0,1,0,"ultimate"),node("flame_barrage","화염난사",3,.8,7,"ultimate",0,1,0,"ultimate"),node("master","화염의 마스터",4,.5,10,"master",0,1,0,undefined,true)].map(value=>({...value,parents:value.row===2?["power","range","haste"]:value.row===3?["burst","reach"]:value.row===4?["meteor","giant_fireball","flame_barrage"]:[]}));
}
export function skillTreeNodes(id: string): TreeNode[] {
  if (id === "fireball") return fireballNodes();
  const labels = names[id];
  if (!labels) return [];
  const guard = id === "flame_guard";
  const shape: [string, number, number, number, string[], number, string, number, string?][] = [
    ["power",3,1,.22,[],1,"power",5], ["economy",2,1,.5,[],1,"economy",10], ["haste",2,1,.78,[],1,"haste",8],
    ["focus",2,2,.32,["power"],3,"power",5], ["control",2,2,.68,["economy"],3,"haste",5],
    ["burst",1,3,.26,["focus"],5,"power",25,"style"], ["reach",1,3,.74,["control"],5,guard?"duration":"range",25,"style"],
    ["burst_power",2,4,.14,["burst"],8,"power",8], ["burst_haste",1,4,.38,["burst"],8,"haste",10],
    ["reach_power",2,4,.62,["reach"],8,"power",8], ["reach_economy",1,4,.86,["reach"],8,"economy",10],
    ["burst_final",1,5,.26,["burst_power","burst_haste"],15,"power",20],
    ["reach_final",1,5,.74,["reach_power","reach_economy"],15,guard?"duration":"range",25],
  ];
  return shape.map(([key,maxRank,row,column,parents,level,effect,amount,specialization],i) => {
    return {id:key,name:labels[i],maxRank,row,column,parents,level,effect,amount,...(specialization?{specialization}:{})};
  });
}
export function treeRanks(state: GameState, id: string): Record<string, number> { return state.arcanaCombat.skillTraining[id]?.treeRanks ?? {}; }
export function treeBonus(state: GameState, id: string, effect: string) {
  const ranks = treeRanks(state,id);
  return skillTreeNodes(id).reduce((sum,node) => sum + (node.effect === effect ? (ranks[node.id] ?? 0)*node.amount : 0),0);
}
function description(node: TreeNode, rank: number) {
  const unique: Record<string,string> = {burst:"명중 시 주변 1칸의 다른 적에게 50% 폭발 피해",reach:"최대 3명의 적을 관통하며 각각 피해",master:"마스터 칭호 · 이후 레벨마다 위력 10% 성장",ultimate: node.id === "meteor" ? "1초 뒤 반경 2칸에 파이어볼 피해의 10배 · MP 30 · 60초" : node.id === "giant_fireball" ? "거대한 화염구 · 단일 적에게 파이어볼 피해의 15배 · MP 30 · 60초" : "체력이 적은 적부터 0.2초 간격 12발 · 한 발당 파이어볼 피해 · MP 30 · 60초"};
  if (unique[node.effect]) return unique[node.effect];
  const label: Record<string,string> = {power:"효과량",economy:"MP 소모",haste:"재사용 시간",range:"사거리",duration:"장막 지속 시간"};
  return `${label[node.effect]} ${rank*node.amount}%${node.effect === "economy" || node.effect === "haste" ? " 감소" : " 증가"}`;
}
export function buildSkillTree(state: GameState, id: string) {
  if (id === "fireball") normalizeFireballTraining(state.arcanaCombat);
  const xp = state.arcanaCombat.skillTraining[id]?.xp ?? 0, progress = id === "fireball" ? fireballProgress(xp) : {level:skillLevel(xp),xp:xp%400,xpRequired:400}, level = progress.level, ranks = treeRanks(state,id), nodes = skillTreeNodes(id);
  const entry = state.arcanaCombat.skillTraining[id];
  const spent = nodes.reduce((sum,node) => sum+(ranks[node.id] ?? 0)*(node.pointCost ?? 1),0), points = Math.max(0,(id === "fireball" ? Math.min(3,level-1) : level-1)-spent);
  const editable = canChangeArcanaBuild(state) && !!state.arcanaCombat.learnedSpells?.some(learned => learned === id);
  return {...progress, master:id === "fireball" && level>=10, selectedUltimates:entry?.ultimates ?? [], selectedUltimate:entry?.ultimate ?? null, points, spent, editable, nodes:nodes.map(node => {
    const rank = node.automatic ? Number(level>=node.level) : node.specialization === "style" && id === "fireball" ? Number(entry?.specializations.includes(node.id)) : node.specialization === "ultimate" ? Number(entry?.ultimates?.some(key => key===node.id)) : ranks[node.id] ?? 0;
    if (id === "fireball" && node.specialization === "style" && !rank) node.level = (entry?.specializations.length ?? 0)>0 ? 6 : 5;
    if (node.specialization === "ultimate" && !rank) node.level = 7+(entry?.ultimates?.length ?? 0);
    const excluded = id === "fireball" ? false : !!node.specialization && nodes.some(other => other.id !== node.id && other.specialization === node.specialization && (ranks[other.id] ?? 0)>0);
    const reason = node.automatic ? (rank ? "마스터 달성" : "스킬 레벨 10에 자동 획득") : !editable ? "전투와 대화를 마친 뒤 변경해 주세요." : excluded ? "다른 전문화를 선택했습니다." : level<node.level ? `스킬 레벨 ${node.level} 필요` : id !== "fireball" && node.parents.some(parent => !(ranks[parent]>0)) ? "선행 노드에 먼저 투자해 주세요." : rank>=node.maxRank ? "최대 단계입니다." : points<(node.pointCost ?? 1) ? "포인트가 부족합니다." : "";
    return {...node,rank,pointCost:node.pointCost ?? 1,available:!reason,reason,current:description(node,rank),next:description(node,Math.min(rank+1,node.maxRank))};
  })};
}
export function investSkillTree(state: GameState, id: string, nodeId: string) {
  const node = buildSkillTree(state,id).nodes.find(value => value.id===nodeId);
  if (!node || !node.available) throw new Error(node?.reason || "강화 노드를 선택해 주세요.");
  const entry = state.arcanaCombat.skillTraining[id] ??= {xp:0,specializations:[],activeSpecialization:null,treeRanks:{}};
  entry.treeRanks ??= {};
  if (id === "fireball") entry.treeVersion=3;
  if (node.specialization === "ultimate") {
    const ultimate = node.id as "meteor" | "giant_fireball" | "flame_barrage";
    entry.ultimates ??= []; entry.ultimates.push(ultimate); entry.ultimate=entry.ultimates[0];
    state.arcanaCombat.learnedSpells ??= ["fireball"];
    if (!state.arcanaCombat.learnedSpells.includes(ultimate)) state.arcanaCombat.learnedSpells.push(ultimate);
  } else entry.treeRanks[nodeId] = node.rank+1;
  if (node.specialization && node.specialization !== "ultimate") { entry.activeSpecialization ??= nodeId; entry.specializations = [...new Set([...entry.specializations,nodeId])]; }
}
export function resetSkillTree(state: GameState, id: string) {
  if (!canChangeArcanaBuild(state) || !state.arcanaCombat.learnedSpells?.some(learned => learned === id)) throw new Error("전투와 대화를 마친 뒤 변경해 주세요.");
  const entry = state.arcanaCombat.skillTraining[id];
  if (entry) { entry.treeRanks={}; entry.activeSpecialization=null; entry.specializations=[];
    if (id === "fireball") {
      entry.ultimate=null; entry.ultimates=[];
      const ultimateIds = ["meteor","giant_fireball","flame_barrage"];
      state.arcanaCombat.learnedSpells = state.arcanaCombat.learnedSpells?.filter(skill => !ultimateIds.includes(skill));
      state.arcanaCombat.activeSkills = state.arcanaCombat.activeSkills?.map(skill => skill && ultimateIds.includes(skill) ? null : skill);
    }
  }
}
