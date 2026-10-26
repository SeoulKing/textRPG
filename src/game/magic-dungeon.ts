import type { ActionChoice, GameAction, GameState, SceneCard } from "./schemas";
import { MagicDungeonStateSchema, type MagicDungeonRun } from "./schemas/magic-dungeon";
import { appendLogEntry } from "./state-utils";

type DungeonAction = Extract<GameAction, { type: "magic_dungeon" }>;
type ClassId = MagicDungeonRun["classId"];
type Skill = { name: string; cost: number; cooldown: number; damage: number; effect: "damage" | "interrupt" | "shield" | "heal" | "mark" | "poison" | "smoke"; hint: string };
export const DUNGEON_CLASSES: Record<ClassId, { name: string; description: string; skills: Skill[] }> = {
  guardian: { name: "가디언", description: "방패로 버티고 상처를 회복하며 싸운다.", skills: [
    { name: "방패 강타", cost: 12, cooldown: 4, damage: 26, effect: "damage", hint: "피해 26" },
    { name: "수호의 벽", cost: 20, cooldown: 10, damage: 0, effect: "shield", hint: "7초간 보호막 35" },
    { name: "충격 강타", cost: 18, cooldown: 11, damage: 15, effect: "interrupt", hint: "피해 15 · 시전 중단" },
    { name: "응급 처치", cost: 22, cooldown: 13, damage: 0, effect: "heal", hint: "HP 35 회복" },
  ] },
  archer: { name: "아처", description: "표식으로 약점을 드러내고 충격 화살로 시전을 끊는다.", skills: [
    { name: "관통 화살", cost: 15, cooldown: 4, damage: 32, effect: "damage", hint: "피해 32" },
    { name: "사냥꾼 표식", cost: 15, cooldown: 11, damage: 0, effect: "mark", hint: "8초간 피해 +25%" },
    { name: "충격 화살", cost: 20, cooldown: 11, damage: 16, effect: "interrupt", hint: "피해 16 · 시전 중단" },
    { name: "바람의 가호", cost: 20, cooldown: 12, damage: 0, effect: "shield", hint: "7초간 보호막 35" },
  ] },
  rogue: { name: "로그", description: "독과 기습으로 공격하며 급소 차기로 위험을 끊는다.", skills: [
    { name: "기습", cost: 12, cooldown: 3.5, damage: 28, effect: "damage", hint: "피해 28" },
    { name: "맹독 칼날", cost: 18, cooldown: 10, damage: 10, effect: "poison", hint: "피해 10 · 8초간 초당 독 피해 4" },
    { name: "급소 차기", cost: 20, cooldown: 11, damage: 16, effect: "interrupt", hint: "피해 16 · 시전 중단" },
    { name: "연막", cost: 18, cooldown: 12, damage: 0, effect: "smoke", hint: "6초간 받는 피해 −40%" },
  ] },
  mage: { name: "메이지", description: "화염으로 공격하고 빙결과 보호막으로 위험에 대응한다.", skills: [
    { name: "화염구", cost: 16, cooldown: 4, damage: 36, effect: "damage", hint: "피해 36" },
    { name: "빙결", cost: 20, cooldown: 11, damage: 14, effect: "interrupt", hint: "피해 14 · 시전 중단" },
    { name: "연쇄 번개", cost: 24, cooldown: 8, damage: 52, effect: "damage", hint: "피해 52" },
    { name: "비전 보호막", cost: 20, cooldown: 12, damage: 0, effect: "shield", hint: "7초간 보호막 35" },
  ] },
};
const INTENTS = { strike: "몸을 웅크린 채 당신에게 달려들 준비를 한다.", wave: "바닥의 룬이 붉게 물든다. 마력 파동이 터지려 한다.", drain: "몸에서 마력을 끌어내려 한다. 이 시전을 허용하면 마나를 잃는다." };
const ENTRY_LOCATIONS = ["arcana_plaza", "arcana_hunting_ground"];
const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value));
function addParagraph(run: MagicDungeonRun, text: string) { run.paragraphs.push(text); run.paragraphs = run.paragraphs.slice(-3); run.revision++; }
function syncHp(state: GameState, run: MagicDungeonRun) { state.stats.hp = clamp(Math.ceil(run.hp / run.maxHp * 10), 1, 10); }
function enemyFor(floor: number): MagicDungeonRun["enemy"] {
  const boss = floor % 5 === 0;
  const hp = boss ? 330 + floor * 18 : 100 + floor * 18;
  return { name: boss ? "공허의 감시자" : ["별빛 슬라임", "길 잃은 룬 정령", "회랑의 그림자", "균열 늑대"][(floor - 1) % 4], boss, hp, maxHp: hp,
    attack: boss ? 15 + floor : 3 + floor * 1.5, attackSeconds: floor === 1 ? 7 : 4.5, casting: false, castSeconds: 0, castMax: 3,
    cycle: 0, intent: "strike", mark: 0, poison: 0, smoke: 0 };
}
function makeRun(state: GameState): MagicDungeonRun {
  const level = state.magicDungeon.level, maxHp = 120 + (level - 1) * 10, maxMp = 85 + (level - 1) * 3;
  return { phase: "prepare", classId: "mage", floor: 1, hp: maxHp * state.stats.hp / 10, maxHp, mp: maxMp, maxMp,
    shield: 0, shieldSeconds: 0, damageBonus: 0, cooldownBonus: 0, cooldowns: [0, 0, 0, 0], ultimate: 0, autoSeconds: 2, elapsed: 0, lastTick: Date.now(), paused: false, revision: 0,
    coins: 0, shards: 0, dust: 0, relics: [], purchased: [], paragraphs: ["아르카나 광장 아래, 별빛이 새어 나오는 문턱을 넘는다. 계단 끝에는 오래된 회랑이 이어져 있다.", "혼자 내려가는 탐험이다. 이번 원정에서 사용할 전투 방식을 정한다. 원정 중에는 바꿀 수 없다."], enemy: enemyFor(1) };
}
function beginFloor(run: MagicDungeonRun) {
  run.phase = "battle"; run.paused = false; run.enemy = enemyFor(run.floor); run.lastTick = Date.now(); run.autoSeconds = 2;
  run.shield = 0; run.shieldSeconds = 0; run.cooldowns = [0, 0, 0, 0];
  run.paragraphs = [run.floor === 1 ? "계단을 내려오자 작은 별빛 슬라임 한 마리가 길을 막는다. 느린 몸짓을 보니 처음 힘을 시험하기에 알맞은 상대다." : run.enemy.boss ? "다섯 갈래 계단이 하나로 합쳐진다. 닫힌 문 앞에서 공허의 감시자가 긴 지팡이를 들어 올린다." : `회랑 ${run.floor}층. ${run.enemy.name}이 어둠 속에서 모습을 드러낸다.`];
  addParagraph(run, "기본 공격은 자동으로 이어진다. 적의 움직임을 읽고 필요한 순간에 스킬을 사용한다.");
}
function dealDamage(state: GameState, run: MagicDungeonRun, base: number, describe?: string) {
  const scaled = base * (1 + run.damageBonus + (state.magicDungeon.level - 1) * .04) * (run.enemy.mark > 0 ? 1.25 : 1);
  const damage = base < 1 ? scaled : Math.round(scaled);
  run.enemy.hp = Math.max(0, run.enemy.hp - damage); run.ultimate = Math.min(100, run.ultimate + damage * .16);
  if (describe) addParagraph(run, describe);
  if (run.enemy.hp > 0) return;
  run.phase = "reward"; run.enemy.casting = false; run.enemy.castSeconds = 0;
  const gain = 12 + run.floor * 4; state.magicDungeon.xp += gain;
  while (state.magicDungeon.level < 50 && state.magicDungeon.xp >= 40 + (state.magicDungeon.level - 1) * 15) {
    state.magicDungeon.xp -= 40 + (state.magicDungeon.level - 1) * 15; state.magicDungeon.level++;
    run.maxHp += 10; run.maxMp += 3; run.hp = Math.min(run.maxHp, run.hp + 10);
    addParagraph(run, "회랑의 마력에 몸이 익숙해진다. 탐험 레벨이 오르고 더 많은 힘을 다룰 수 있게 됐다.");
  }
  state.magicDungeon.bestFloor = Math.max(state.magicDungeon.bestFloor, run.floor);
  run.coins += 18 + run.floor * 4; run.shards += run.enemy.boss ? 3 : 1; if (run.enemy.boss) run.dust++;
  run.hp = Math.min(run.maxHp, run.hp + 8); run.mp = Math.min(run.maxMp, run.mp + 18); syncHp(state, run);
  addParagraph(run, `${run.enemy.name}이 사라진 자리에서 마력 조각을 챙긴다. 벽에 새겨진 세 개의 룬 중 하나가 당신의 손길을 기다린다.`);
}

// Server owns resources and combat outcomes. Long request gaps pause rather than simulating offline deaths.
export function syncMagicDungeon(state: GameState, now = Date.now()) {
  const run = state.magicDungeon.run;
  if (!run || run.phase !== "battle") return;
  if (state.activeClock.paused) { run.lastTick = now; run.paused = true; return; }
  const gap = Math.max(0, (now - run.lastTick) / 1000); run.lastTick = now;
  if (run.paused) return;
  if (gap > 5) { run.paused = true; addParagraph(run, "잠시 전투를 멈추고 숨을 고른다. 준비되면 다시 맞선다."); return; }
  const e = run.enemy;
  for (let elapsed = 0; elapsed < gap && run.phase === "battle"; elapsed += .1) {
    const dt = Math.min(.1, gap - elapsed);
    run.elapsed += dt; run.mp = Math.min(run.maxMp, run.mp + dt * 3.5);
    run.cooldowns = run.cooldowns.map(v => Math.max(0, v - dt)); run.ultimate = Math.min(100, run.ultimate + dt * .4);
    run.shieldSeconds = Math.max(0, run.shieldSeconds - dt); if (run.shieldSeconds === 0) run.shield = 0;
    e.mark = Math.max(0, e.mark - dt); e.smoke = Math.max(0, e.smoke - dt);
    if (e.poison > 0) { e.poison = Math.max(0, e.poison - dt); dealDamage(state, run, 4 * dt); }
    if (run.phase !== "battle") break;
    run.autoSeconds = Math.max(0, run.autoSeconds - dt);
    if (run.autoSeconds === 0) { run.autoSeconds = 2; dealDamage(state, run, run.classId === "guardian" ? 6 : 8); }
    if (run.phase !== "battle") break;
    if (!e.casting) {
      e.attackSeconds = Math.max(0, e.attackSeconds - dt);
      if (e.attackSeconds === 0) {
        e.intent = e.boss ? (["strike", "wave", "drain"] as const)[e.cycle % 3] : "strike"; e.cycle++;
        e.casting = true; e.castMax = e.boss ? 3.2 : run.floor === 1 ? 4 : 3; e.castSeconds = e.castMax;
        addParagraph(run, `${e.name}이 움직인다. ${INTENTS[e.intent]}`);
      }
    } else {
      e.castSeconds = Math.max(0, e.castSeconds - dt);
      if (e.castSeconds === 0) {
        let damage = Math.round(e.attack * (e.intent === "wave" ? 1.3 : 1) * (e.smoke > 0 ? .6 : 1) * (run.classId === "guardian" ? .8 : 1));
        const absorb = Math.min(run.shield, damage); run.shield -= absorb; damage -= absorb; run.hp = Math.max(0, run.hp - damage);
        if (e.intent === "drain") run.mp = Math.max(0, run.mp - 15);
        addParagraph(run, damage === 0 ? "적의 공격이 보호막에 막힌다. 흐트러짐 없이 다시 맞선다." : "공격을 완전히 피하지 못했다. 한 발 물러나 자세를 바로잡는다.");
        e.casting = false; e.attackSeconds = e.boss ? 4 : 6; syncHp(state, run);
        if (run.hp === 0) { run.phase = "defeat"; addParagraph(run, "더는 회랑을 버틸 수 없다. 귀환 룬을 붙잡고 마지막 힘을 모은다. 탐험 경험은 남지만 전리품 일부는 놓치게 된다."); }
      }
    }
  }
}

export function canEnterMagicDungeon(state: GameState) {
  return ENTRY_LOCATIONS.includes(state.location) && !state.isGameOver && !state.magicDungeon.run && !state.subwayExpedition.active && !state.npcDialogue.active && !state.flags.arcana_slime_encounter_active && !state.arcanaCombat.battle;
}
export function performMagicDungeonAction(state: GameState, action: DungeonAction) {
  if (state.isGameOver) throw new Error("현재 상태에서는 던전을 탐험할 수 없습니다.");
  if (action.command === "start") {
    if (!canEnterMagicDungeon(state)) throw new Error("아르카나 광장 또는 도시 앞 평원에서 진행 중인 상황을 마친 뒤 던전에 들어갈 수 있습니다.");
    state.magicDungeon.runNumber++; state.magicDungeon.run = makeRun(state); state.activeEventId = null; state.activeStockNodeId = null;
    state.flags.arcana_workbench_open = false; return;
  }
  const run = state.magicDungeon.run; if (!run) throw new Error("진행 중인 마법도시 던전 탐험이 없습니다.");
  syncMagicDungeon(state);
  const e = run.enemy;
  if (action.command === "class") {
    if (run.phase !== "prepare" || !action.classId) throw new Error("원정 준비 중에만 전투 방식을 정할 수 있습니다.");
    run.classId = action.classId; beginFloor(run); return;
  }
  if (action.command === "pause" || action.command === "resume") {
    if (run.phase !== "battle") throw new Error("전투 중에만 숨을 고를 수 있습니다.");
    run.paused = action.command === "pause"; run.lastTick = Date.now(); run.revision++; return;
  }
  if (action.command === "skill") {
    if (run.phase !== "battle" || run.paused || action.skillIndex === undefined) throw new Error("진행 중인 전투에서 스킬을 사용할 수 있습니다.");
    const i = action.skillIndex, s = DUNGEON_CLASSES[run.classId].skills[i];
    if (!s || run.cooldowns[i] > 0 || run.mp < s.cost) throw new Error("아직 스킬이 준비되지 않았거나 마나가 부족합니다.");
    run.mp -= s.cost; run.cooldowns[i] = s.cooldown * (1 - run.cooldownBonus); run.ultimate = Math.min(100, run.ultimate + 4);
    if (s.effect === "interrupt" && e.casting) { e.casting = false; e.castSeconds = 0; e.attackSeconds = 4; addParagraph(run, `${s.name}이 적의 움직임을 끊어 낸다. 모이던 마력이 흩어진다.`); }
    else if (s.effect === "shield") { run.shield = Math.min(90, run.shield + 35); run.shieldSeconds = 7; addParagraph(run, `${s.name}을 펼친다. 희미한 빛의 장벽이 몸을 감싼다.`); }
    else if (s.effect === "heal") { run.hp = Math.min(run.maxHp, run.hp + 35); syncHp(state, run); addParagraph(run, "상처를 빠르게 처치한다. 다시 버틸 힘이 돌아온다."); }
    else if (s.effect === "mark") { e.mark = 8; addParagraph(run, "희미하게 드러난 균열에 표식을 남긴다. 다음 공격이 더 깊이 파고들 것이다."); }
    else if (s.effect === "poison") { e.poison = 8; addParagraph(run, "칼날의 독이 적의 몸속으로 스며든다."); }
    else if (s.effect === "smoke") { e.smoke = 6; addParagraph(run, "연막 속으로 몸을 숨긴다. 적이 정확한 위치를 놓친다."); }
    else addParagraph(run, `${s.name}으로 적에게 맞선다.`);
    if (s.damage > 0) dealDamage(state, run, s.damage); return;
  }
  if (action.command === "ultimate") {
    if (run.phase !== "battle" || run.paused || run.ultimate < 100) throw new Error("궁극기를 사용할 힘이 아직 모이지 않았습니다.");
    run.ultimate = 0;
    if (run.classId === "guardian") { run.hp = Math.min(run.maxHp, run.hp + 55); run.shield = 70; run.shieldSeconds = 9; syncHp(state, run); addParagraph(run, "불멸의 서약을 새긴다. 굳건한 빛이 상처와 두려움을 밀어낸다."); }
    else { e.casting = false; e.castSeconds = 0; e.attackSeconds = 4; dealDamage(state, run, run.classId === "rogue" && e.hp / e.maxHp < .5 ? 170 : 130, "모아 둔 힘을 한꺼번에 풀어낸다. 회랑의 어둠이 크게 흔들린다."); } return;
  }
  if (action.command === "reward") {
    if (run.phase !== "reward" || !["fang", "hourglass", "heart"].includes(action.optionId || "")) throw new Error("전투를 마친 뒤 세 룬 중 하나를 선택해야 합니다.");
    if (action.optionId === "fang") { run.damageBonus += .18; run.relics.push("사냥의 룬"); }
    if (action.optionId === "hourglass") { run.cooldownBonus = Math.min(.45, run.cooldownBonus + .1); run.relics.push("시간의 룬"); }
    if (action.optionId === "heart") { run.maxHp += 20; run.maxMp += 10; run.hp = Math.min(run.maxHp, run.hp + 35); run.mp = Math.min(run.maxMp, run.mp + 25); syncHp(state, run); run.relics.push("생명의 룬"); }
    run.phase = "route"; run.paragraphs = ["선택한 룬이 몸 안으로 스며든다. 이 힘은 이번 원정이 끝날 때까지 함께한다.", "앞으로 세 갈래 길이 갈라진다. 깊은 회랑을 향할지, 잠시 정비할지 정한다. 지금 귀환하면 확보한 재료를 광장으로 가져갈 수 있다."]; run.revision++; return;
  }
  if (action.command === "route") {
    if (run.phase !== "route" || !["battle", "event", "shop"].includes(action.optionId || "")) throw new Error("갈림길에서 다음 경로를 선택해야 합니다.");
    run.floor++; run.purchased = [];
    if (action.optionId === "battle") beginFloor(run);
    else { run.phase = action.optionId as "event" | "shop"; run.paragraphs = run.phase === "event" ? ["다음 층 입구에서 작은 샘을 발견한다. 은빛 물결이 상처를 어루만지지만, 바닥에는 무언가를 바치라는 문양도 남아 있다."] : ["회랑의 틈에 상인이 천막을 펼쳐 놓았다. 그는 바깥세상의 돈 대신 회랑에서 얻은 주화를 받는다."]; run.revision++; } return;
  }
  if (action.command === "event") {
    if (run.phase !== "event" || !["spring", "offering"].includes(action.optionId || "")) throw new Error("샘 앞에서 선택해야 합니다.");
    if (action.optionId === "spring") { run.hp = Math.min(run.maxHp, run.hp + run.maxHp * .35); run.mp = Math.min(run.maxMp, run.mp + 35); }
    else { run.hp = Math.max(1, run.hp * .8); run.coins += 35; }
    syncHp(state, run); beginFloor(run); addParagraph(run, action.optionId === "spring" ? "샘물 덕분에 숨이 한결 편안해진다." : "힘의 일부를 바치자 회랑의 주화가 모습을 드러낸다."); return;
  }
  if (action.command === "shop") {
    if (run.phase !== "shop") throw new Error("상인의 천막에서 거래할 수 있습니다.");
    if (action.optionId === "leave") { beginFloor(run); return; }
    const prices: Record<string, number> = { potion: 18, whetstone: 30 };
    const id = action.optionId || "", price = prices[id];
    if (!price || run.purchased.includes(id) || run.coins < price) throw new Error("이미 구매했거나 회랑 주화가 부족합니다.");
    run.coins -= price; run.purchased.push(id);
    if (id === "potion") { run.hp = Math.min(run.maxHp, run.hp + 45); run.mp = Math.min(run.maxMp, run.mp + 35); syncHp(state, run); }
    else { run.damageBonus += .12; run.relics.push("별빛 숫돌"); }
    addParagraph(run, id === "potion" ? "상인의 물약을 마시고 몸을 정비한다." : "무기에 별빛 숫돌의 힘이 스며든다."); return;
  }
  if (action.command === "return") {
    if (run.phase === "settled") throw new Error("이미 전리품을 정산했습니다.");
    const lost = run.phase === "defeat";
    const shards = lost ? Math.floor(run.shards / 2) : run.shards, dust = lost ? 0 : run.dust;
    if (shards) state.inventory.manaShard = (state.inventory.manaShard || 0) + shards;
    if (dust) state.inventory.arcaneDust = (state.inventory.arcaneDust || 0) + dust;
    state.stats.hp = Math.max(1, Math.ceil(run.hp / run.maxHp * 10));
    run.phase = "settled"; run.paragraphs = ["귀환 룬을 붙잡자 아르카나 광장의 종소리가 다시 가까워진다.", `이번 탐험에서 마력 조각 ${shards}개와 비전 가루 ${dust}개를 가져왔다. 확보한 재료는 가방에 들어가며 광장의 비전 작업대에서 사용할 수 있다.`, `탐험 레벨 ${state.magicDungeon.level} · 경험치 ${state.magicDungeon.xp}/${40 + (state.magicDungeon.level - 1) * 15}. 익힌 힘은 다음 탐험에도 남는다. 원정의 룬과 회랑 주화는 이곳에 남겨 둔다.`];
    appendLogEntry(state, `별빛 회랑 원정에서 돌아왔다. 마력 조각 ${shards}개, 비전 가루 ${dust}개를 가져왔다.`); run.revision++; return;
  }
  if (action.command === "exit") {
    if (run.phase !== "settled") throw new Error("전리품을 정산한 뒤 광장으로 돌아갈 수 있습니다.");
    state.magicDungeon.run = null; state.location = "arcana_plaza"; state.flags.visited_arcana_plaza = true; state.activeEventId = null; return;
  }
  throw new Error("알 수 없는 던전 행동입니다.");
}

function choice(command: DungeonAction["command"], id: string, label: string, hint = "", available = true, extra: Partial<DungeonAction> = {}): ActionChoice {
  return { id: `magic-dungeon:${id}`, label, outcomeHint: hint, showOutcomeHint: Boolean(hint), isAvailable: available, action: { type: "magic_dungeon", command, ...extra } };
}
export function buildMagicDungeonEntranceActions(state: GameState): ActionChoice[] {
  return canEnterMagicDungeon(state) ? [choice("start", "enter", "별빛 회랑 던전에 들어간다", `탐험 Lv.${state.magicDungeon.level} · 최고 ${state.magicDungeon.bestFloor}층 · 솔로 원정`)] : [];
}
export function buildMagicDungeonActions(state: GameState): ActionChoice[] {
  const run = state.magicDungeon.run; if (!run) return [];
  const finish = choice("return", "return", run.phase === "defeat" ? "귀환 룬을 붙잡고 전리품을 정산한다" : "귀환해 전리품을 정산한다", `마력 조각 ${run.shards} · 비전 가루 ${run.dust}`);
  switch (run.phase) {
    case "prepare": return [...Object.entries(DUNGEON_CLASSES).map(([id, c]) => choice("class", `class:${id}`, `${c.name}의 방식으로 싸운다`, c.description, true, { classId: id as ClassId })), finish];
    case "battle": return run.paused ? [choice("resume", "resume", "다시 전투에 맞선다"), finish] : [
      ...DUNGEON_CLASSES[run.classId].skills.map((s, i) => choice("skill", `skill:${i}`, s.name, `${s.hint} · MP ${s.cost}`, run.cooldowns[i] <= 0 && run.mp >= s.cost, { skillIndex: i })),
      choice("ultimate", "ultimate", run.classId === "guardian" ? "궁극기 · 불멸의 서약" : "궁극기 · 모은 힘을 해방한다", `${Math.floor(run.ultimate)}% 충전`, run.ultimate >= 100)];
    case "reward": return [choice("reward", "fang", "사냥의 룬을 새긴다", "이번 원정 피해 +18%", true, { optionId: "fang" }), choice("reward", "hourglass", "시간의 룬을 새긴다", "이번 원정 쿨타임 −10% (최대 −45%)", true, { optionId: "hourglass" }), choice("reward", "heart", "생명의 룬을 새긴다", "최대 HP +20 · 최대 MP +10 · 일부 회복", true, { optionId: "heart" }), finish];
    case "route": return [choice("route", "battle", "몬스터의 흔적을 따라 내려간다", `${run.floor + 1}층 전투`, true, { optionId: "battle" }), choice("route", "event", "은빛 샘이 있는 길을 고른다", "회복 또는 대가를 치르는 사건", true, { optionId: "event" }), choice("route", "shop", "불빛이 보이는 야영지로 간다", `회랑 주화 ${run.coins} · 상점`, true, { optionId: "shop" }), finish];
    case "event": return [choice("event", "spring", "샘물을 마시고 상처를 씻는다", "HP 35% · MP 35 회복", true, { optionId: "spring" }), choice("event", "offering", "힘의 일부를 제단에 바친다", "현재 HP 20% 소모 · 회랑 주화 +35", true, { optionId: "offering" }), finish];
    case "shop": return [choice("shop", "potion", "회복 물약을 산다", "18 주화 · HP 45 · MP 35 회복", !run.purchased.includes("potion") && run.coins >= 18, { optionId: "potion" }), choice("shop", "whetstone", "별빛 숫돌을 산다", "30 주화 · 이번 원정 피해 +12%", !run.purchased.includes("whetstone") && run.coins >= 30, { optionId: "whetstone" }), choice("shop", "leave", "정비를 마치고 회랑으로 나아간다", "이 층의 몬스터와 전투", true, { optionId: "leave" }), finish];
    case "defeat": return [finish];
    case "settled": return [choice("exit", "exit", "아르카나 광장으로 돌아간다")];
  }
}
export function buildMagicDungeonScene(state: GameState): SceneCard | null {
  const run = state.magicDungeon.run; if (!run) return null;
  const actions = buildMagicDungeonActions(state);
  const title = run.phase === "prepare" ? "별빛 회랑의 문턱" : run.phase === "settled" ? "원정에서 가져온 것들" : `별빛 회랑 ${run.floor}층 · ${run.phase === "battle" ? run.enemy.name : { reward: "힘의 선택", route: "갈림길", event: "은빛 샘", shop: "회랑의 상인", defeat: "귀환의 순간" }[run.phase]}`;
  return { id: `magic-dungeon:${state.magicDungeon.runNumber}:${run.floor}:${run.phase}:${run.revision}`, locationId: state.location, title,
    paragraphs: [...run.paragraphs], choices: actions.map(c => ({ id: c.id, label: c.label, outcomeHint: c.outcomeHint, showOutcomeHint: c.showOutcomeHint, isAvailable: c.isAvailable, serverActionHint: c.action })),
    materialIds: { locationIds: [state.location], personIds: [], itemIds: ["manaShard", "arcaneDust"] }, source: "template", generatedAt: new Date().toISOString() };
}
export function normalizeMagicDungeon(raw: unknown) {
  const parsed = MagicDungeonStateSchema.safeParse(raw);
  return parsed.success ? parsed.data : MagicDungeonStateSchema.parse(undefined);
}
