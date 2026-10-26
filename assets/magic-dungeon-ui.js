/* Dungeon decisions use server snapshots; only displayed countdowns are interpolated. */
(() => {
  const classNames = { guardian: '가디언', archer: '아처', rogue: '로그', mage: '메이지' };
  const roles = {
    guardian: ['공격', '보호막', '시전 차단', '회복'],
    archer: ['공격', '약점 표식', '시전 차단', '보호막'],
    rogue: ['공격', '독 공격', '시전 차단', '피해 감소'],
    mage: ['공격', '시전 차단', '공격', '보호막'],
  };
  const intentNames = { strike: '강타', wave: '마력 파동', drain: '마나 흡수' };
  const stages = {
    prepare: ['원정 준비', '이번 원정에서 사용할 전투 방식을 선택하세요.'],
    battle: ['전투 중', '기본 공격은 자동입니다. 적의 예고를 보고 스킬로 대응하세요.'],
    reward: ['전투 승리', '룬 하나를 선택하세요. 효과는 이번 원정이 끝날 때까지 유지됩니다.'],
    route: ['다음 경로 선택', '바로 전투하거나, 샘과 상점에서 정비한 뒤 다음 층에 도전하세요.'],
    event: ['은빛 샘', '체력을 회복하거나, 체력을 바쳐 주화를 얻으세요.'],
    shop: ['회랑의 상인', '주화로 정비하세요. 구매를 마치면 이 층의 전투가 시작됩니다.'],
    defeat: ['전투 불능', '귀환해 남은 전리품을 정산하세요. 탐험 경험은 유지됩니다.'],
    settled: ['귀환 정산 완료', '전리품을 가방에 보관했습니다. 광장으로 돌아갈 수 있습니다.'],
  };
  let latest = null, previous = null, receivedAt = 0, status, support, statusKey = '', feedback = '', feedbackNegative = false;
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const number = value => String(Math.round(value * 10) / 10);
  const percent = value => number(value * 100);
  function write(selector, text) {
    const node = status.querySelector(selector) || support.querySelector(selector);
    if (node && node.textContent !== text) node.textContent = text;
  }
  function meter(selector, value, max) {
    const node = status.querySelector(selector) || support.querySelector(selector);
    if (node) { node.max = max; node.value = Math.max(0, value); }
  }
  function ensureStatus() {
    if (status) return status;
    status = document.createElement('section');
    status.className = 'magic-dungeon-status';
    status.setAttribute('aria-label', '던전 진행과 전투 상태');
    status.hidden = true;
    const surface = document.querySelector('.scene-copy');
    surface.prepend(status);
    support = document.createElement('section'); support.className = 'dungeon-support';
    support.setAttribute('aria-label', '전리품과 원정 관리'); support.hidden = true;
    surface.append(support); return status;
  }
  function remember(state, run) {
    const identity = `${state.magicDungeon.runNumber}:${run.floor}`;
    if (previous?.identity === identity && previous.phase === 'battle') {
      const changes = [], damage = previous.enemyHp - run.enemy.hp;
      const lostHp = previous.hp - run.hp, healed = run.hp - previous.hp, shield = run.shield - previous.shield;
      if (damage > .05) changes.push(`적에게 ${number(damage)} 피해`);
      if (lostHp > .05) changes.push(`내 HP −${number(lostHp)}`);
      if (healed > .05) changes.push(`내 HP +${number(healed)}`);
      if (shield > .05) changes.push(`보호막 +${number(shield)}`);
      const lastLine = run.paragraphs.at(-1) || '';
      if (lastLine !== previous.lastLine && lastLine.includes('움직임을 끊어 낸다')) changes.unshift('시전 차단 성공');
      if (run.phase === 'reward') changes.unshift('적 처치');
      if (run.phase === 'defeat') changes.unshift('전투 불능');
      if (changes.length) { feedback = changes.join(' · '); feedbackNegative = lostHp > .05 || run.phase === 'defeat'; }
    } else if (previous?.identity !== identity || previous.phase !== run.phase) feedback = '';
    previous = { identity, phase: run.phase, enemyHp: run.enemy.hp, hp: run.hp, shield: run.shield, lastLine: run.paragraphs.at(-1) };
  }
  function render(state) {
    const run = state?.magicDungeon?.run;
    const el = ensureStatus(); el.hidden = !run; support.hidden = !run;
    document.body.classList.toggle('in-magic-dungeon', Boolean(run));
    if (!run) { latest = null; previous = null; statusKey = ''; feedback = ''; feedbackNegative = false; delete document.body.dataset.dungeonPhase; return; }
    if (latest !== state) { remember(state, run); latest = state; receivedAt = performance.now(); }
    document.body.dataset.dungeonPhase = run.phase;
    const dungeon = state.magicDungeon, combat = run.phase === 'battle';
    const key = `${dungeon.runNumber}:${run.floor}:${run.phase}:${run.classId}`;
    if (statusKey !== key) {
      statusKey = key;
      el.innerHTML = `<div class="dungeon-heading"><div><p class="dungeon-kicker">별빛 회랑 · ${run.floor}층</p><h2>${stages[run.phase][0]}</h2></div><span class="dungeon-class">${classNames[run.classId]}</span></div>
        <p class="dungeon-objective">${stages[run.phase][1]}</p>
        ${combat ? `<section class="dungeon-opponent" aria-label="상대와 공격 예고"><div class="dungeon-enemy"><strong>${escape(run.enemy.name)}${run.enemy.boss ? ' · 보스' : ''}</strong><span data-enemy-hp></span></div><progress class="enemy" data-enemy-meter aria-label="적 체력"></progress>
          <div class="dungeon-intent"><div class="dungeon-threat-line"><strong data-intent-title></strong><b data-dungeon-countdown></b></div><progress class="cast" data-cast-meter aria-label="적 시전 진행"></progress><p data-intent-advice></p></div></section>` : ''}
        <div class="dungeon-resources"><div><div class="dungeon-resource"><span>내 HP</span><strong data-hp></strong></div><progress data-hp-meter aria-label="내 체력"></progress></div><div><div class="dungeon-resource"><span>내 MP</span><strong data-mp></strong></div><progress class="mana" data-mp-meter aria-label="내 마나"></progress></div></div>
        <p class="dungeon-protection" data-protection hidden></p>
        <p class="dungeon-feedback" role="status" aria-live="polite" aria-atomic="true" hidden></p>`;
      support.innerHTML = `<details class="dungeon-pack"><summary><span data-pack-summary></span></summary><p data-growth></p><p data-build></p><p data-relics></p></details>
        ${combat ? '<div class="dungeon-utilities"><button type="button" data-pause></button><button type="button" data-return>귀환하고 정산</button></div><div data-dungeon-history></div>' : ''}`;
      if (combat) {
        support.querySelector('[data-pause]').addEventListener('click', () => window.MagicDungeonUI.onAction?.({ type: 'magic_dungeon', command: latest.magicDungeon.run.paused ? 'resume' : 'pause' }));
        support.querySelector('[data-return]').addEventListener('click', () => window.MagicDungeonUI.onAction?.({ type: 'magic_dungeon', command: 'return' }));
      }
    }
    write('[data-hp]', `${Math.ceil(run.hp)} / ${run.maxHp}`);
    write('[data-mp]', `${Math.floor(run.mp)} / ${run.maxMp}`);
    meter('[data-hp-meter]', run.hp, run.maxHp); meter('[data-mp-meter]', run.mp, run.maxMp);
    write('[data-pack-summary]', `전리품 · 조각 ${run.shards} · 가루 ${run.dust} · 주화 ${run.coins}`);
    write('[data-growth]', dungeon.level === 50 ? '탐험 Lv.50 · 최고 레벨' : `탐험 Lv.${dungeon.level} · 다음 레벨까지 ${40 + (dungeon.level - 1) * 15 - dungeon.xp} XP`);
    write('[data-build]', `원정 피해 +${percent(run.damageBonus)}% · 쿨타임 −${percent(run.cooldownBonus)}%`);
    write('[data-relics]', run.relics.length ? `보유 룬 · ${run.relics.join(' / ')}` : '아직 원정 룬이 없습니다.');
    el.querySelector('[data-protection]').hidden = run.shield <= 0;
    write('[data-protection]', `보호막 ${Math.ceil(run.shield)} · ${run.shieldSeconds.toFixed(1)}초 남음`);
    el.querySelector('.dungeon-feedback').hidden = !feedback || !['battle', 'reward', 'defeat'].includes(run.phase);
    write('.dungeon-feedback', feedback ? '최근 결과 · ' + feedback : '');
    el.querySelector('.dungeon-feedback').classList.toggle('is-damage', feedbackNegative);
    if (combat) {
      write('[data-enemy-hp]', `${Math.ceil(run.enemy.hp)} / ${run.enemy.maxHp}`);
      meter('[data-enemy-meter]', run.enemy.hp, run.enemy.maxHp);
      el.querySelector('.dungeon-intent').classList.toggle('is-casting', run.enemy.casting && !run.paused);
      write('[data-intent-title]', run.paused ? '전투 일시정지' : run.enemy.casting ? `${intentNames[run.enemy.intent]} 시전 중` : '다음 공격 준비');
      write('[data-intent-advice]', run.paused ? '준비되시면 다시 전투를 시작하세요.' : run.enemy.casting ? `${run.enemy.intent === 'drain' ? '발동하면 피해와 함께 MP 15를 잃습니다. ' : ''}시전 차단으로 막거나 방어 스킬로 피해에 대비하세요.` : '공격 예고가 나타나면 차단 또는 방어를 준비하세요.');
      el.querySelector('[data-cast-meter]').hidden = run.paused || !run.enemy.casting;
      write('[data-pause]', run.paused ? '전투 재개' : '잠시 멈춤'); updateTimers();
    }
  }
  function preview(action, run) {
    const id = action.optionId;
    if (action.command === 'reward') {
      if (id === 'fang') return ['사냥의 룬', `원정 피해 +${percent(run.damageBonus)}% → +${percent(run.damageBonus + .18)}%`, '모든 공격의 피해가 증가합니다. 이번 원정 동안 유지됩니다.'];
      if (id === 'hourglass') return ['시간의 룬', `쿨타임 감소 ${percent(run.cooldownBonus)}% → ${percent(Math.min(.45, run.cooldownBonus + .1))}%`, run.cooldownBonus >= .45 ? '이미 감소 한도 45%에 도달했습니다. 추가 효과가 없습니다.' : '스킬을 더 자주 사용할 수 있습니다. 감소 한도 45%. 이번 원정 동안 유지됩니다.'];
      if (id === 'heart') return ['생명의 룬', `최대 HP ${run.maxHp} → ${run.maxHp + 20} · MP ${run.maxMp} → ${run.maxMp + 10}`, `선택 후 HP ${Math.ceil(Math.min(run.maxHp + 20, run.hp + 35))} · MP ${Math.floor(Math.min(run.maxMp + 10, run.mp + 25))}. 이번 원정 동안 유지됩니다.`];
    }
    if (action.command === 'route') {
      const floor = run.floor + 1, boss = floor % 5 === 0 ? ' · 보스 전투' : '';
      if (id === 'battle') return ['바로 전투', `${floor}층${boss}`, '현재 HP·MP로 다음 전투에 진입합니다.'];
      if (id === 'event') return ['은빛 샘 경유', `정비 후 ${floor}층${boss}`, 'HP·MP 회복 또는 체력을 바쳐 주화를 얻습니다.'];
      if (id === 'shop') return ['상점 경유', `보유 ${run.coins}주화 · 정비 후 ${floor}층${boss}`, '물약 18주화 · 피해 강화 30주화'];
    }
    if (action.command === 'event') {
      if (id === 'spring') return ['샘물로 회복', `HP ${Math.ceil(run.hp)} → ${Math.ceil(Math.min(run.maxHp, run.hp + run.maxHp * .35))} · MP ${Math.floor(run.mp)} → ${Math.floor(Math.min(run.maxMp, run.mp + 35))}`, '회복 후 이 층의 전투가 시작됩니다.'];
      if (id === 'offering') return ['체력을 바쳐 주화 획득', `HP ${Math.ceil(run.hp)} → ${Math.ceil(Math.max(1, run.hp * .8))} · 주화 +35`, '현재 HP의 20%를 바칩니다. 이후 이 층의 전투가 시작됩니다.'];
    }
    if (action.command === 'shop') {
      if (id === 'potion') return ['회복 물약', `18주화 · HP ${Math.ceil(run.hp)} → ${Math.ceil(Math.min(run.maxHp, run.hp + 45))} · MP ${Math.floor(run.mp)} → ${Math.floor(Math.min(run.maxMp, run.mp + 35))}`, run.purchased.includes(id) ? '이 층에서 구매 완료' : '이 층에서 한 번 구매할 수 있습니다.'];
      if (id === 'whetstone') return ['별빛 숫돌', `30주화 · 원정 피해 +${percent(run.damageBonus)}% → +${percent(run.damageBonus + .12)}%`, run.purchased.includes(id) ? '이 층에서 구매 완료' : '피해 강화는 이번 원정 동안 유지됩니다.'];
    }
    if (action.command === 'return') return ['귀환하고 전리품 정산', `마력 조각 ${run.phase === 'defeat' ? Math.floor(run.shards / 2) : run.shards} · 비전 가루 ${run.phase === 'defeat' ? 0 : run.dust}`, run.phase === 'defeat' ? '조각은 절반만 보관하고 비전 가루는 잃습니다. 탐험 경험은 유지됩니다.' : '재료를 가방에 보관합니다. 원정 룬과 주화는 사라집니다.'];
    return null;
  }
  function updateChoices(snapshot, inFlight) {
    window.MagicDungeonUI.inFlight = inFlight;
    const run = snapshot?.state?.magicDungeon?.run;
    if (!run) return false;
    const buttons = [...document.querySelectorAll('#choices .choice-button')], actions = snapshot.availableActions;
    if (buttons.length !== actions.length || buttons.some((b, i) => b.dataset.dungeonChoice !== actions[i].id)) return false;
    buttons.forEach((button, i) => {
      const c = actions[i], action = c.action, skill = action.command === 'skill' ? action.skillIndex : undefined;
      button.disabled = inFlight || c.isAvailable === false;
      button.classList.toggle('dungeon-secondary', ['return', 'pause', 'resume'].includes(action.command));
      const role = skill !== undefined ? roles[run.classId][skill] : action.command === 'ultimate' ? '궁극기' : '';
      button.classList.toggle('dungeon-ready-response', role === '시전 차단' && run.enemy.casting && !run.paused && !button.disabled);
      let roleNode = button.querySelector('.dungeon-role');
      if (!roleNode) { roleNode = document.createElement('span'); roleNode.className = 'dungeon-role'; button.querySelector('.choice-side').append(roleNode); }
      roleNode.textContent = role; roleNode.hidden = !role;
      const details = preview(action, run);
      button.querySelector('.choice-label').textContent = details?.[0] || c.label;
      const meta = button.querySelector('.choice-meta');
      meta.textContent = details?.[2] || c.outcomeHint || ''; meta.hidden = !meta.textContent;
      let effect = button.querySelector('.dungeon-choice-effect');
      if (!effect) { effect = document.createElement('span'); effect.className = 'dungeon-choice-effect'; meta.before(effect); }
      effect.textContent = details?.[1] || ''; effect.hidden = !details;
      const label = button.querySelector('.choice-status');
      const text = inFlight ? '처리 중' : skill !== undefined && run.cooldowns[skill] > 0 ? `대기 ${run.cooldowns[skill].toFixed(1)}초` : skill !== undefined && !c.isAvailable ? '마나 부족' : role === '시전 차단' && run.enemy.casting && !run.paused ? '지금 차단 가능' : action.command === 'ultimate' ? `${Math.floor(run.ultimate)}% 충전` : action.command === 'shop' && c.isAvailable === false ? run.purchased.includes(action.optionId) ? '구매 완료' : '주화 부족' : '';
      label.textContent = text; label.hidden = !text;
      button.setAttribute('aria-label', [details?.[0] || c.label, role, details?.[1], meta.textContent, text].filter(Boolean).join('. '));
    });
    support?.querySelectorAll('.dungeon-utilities button').forEach(button => { button.disabled = inFlight; });
    return true;
  }
  function renderNarrative(snapshot, target) {
    const run = snapshot.state.magicDungeon.run, lines = snapshot.currentScene.paragraphs;
    const historyTarget = run.phase === 'battle' ? support.querySelector('[data-dungeon-history]') : target;
    const wasOpen = historyTarget.querySelector('details')?.open || false;
    const history = `<details class="dungeon-history"><summary>최근 전투 기록</summary>${lines.map(line => `<p>${escape(line)}</p>`).join('')}</details>`;
    if (run.phase === 'battle') { target.innerHTML = ''; historyTarget.innerHTML = history; }
    else if (run.phase === 'reward') target.innerHTML = `<p class="dungeon-summary">${escape(run.enemy.name)}을 처치했습니다. 아래에서 다음 전투에 가져갈 힘을 고르세요.</p>${history}`;
    else if (run.phase === 'defeat') target.innerHTML = `<p class="dungeon-summary">${run.floor}층에서 원정이 끝났습니다. 마력 조각 ${Math.floor(run.shards / 2)}개를 가져갈 수 있습니다.</p>${history}`;
    else if (run.phase === 'route') target.innerHTML = `<p class="dungeon-summary">다음은 ${run.floor + 1}층${(run.floor + 1) % 5 === 0 ? ' 보스 전투' : ''}입니다. 지금 귀환하면 확보한 전리품을 보관할 수 있습니다.</p>`;
    else target.innerHTML = lines.map(line => `<p>${escape(line)}</p>`).join('');
    if (wasOpen && historyTarget.querySelector('details')) historyTarget.querySelector('details').open = true;
  }
  function updateTimers() {
    const run = latest?.magicDungeon?.run;
    if (!run || run.phase !== 'battle' || !status) return;
    const dt = run.paused ? 0 : Math.min(1.5, (performance.now() - receivedAt) / 1000);
    const seconds = Math.max(0, (run.enemy.casting ? run.enemy.castSeconds : run.enemy.attackSeconds) - dt);
    write('[data-dungeon-countdown]', run.paused ? '' : seconds > 0 ? `${seconds.toFixed(1)}초` : '결과 확인 중');
    meter('[data-cast-meter]', Math.min(run.enemy.castMax, run.enemy.castMax - run.enemy.castSeconds + dt), run.enemy.castMax);
    if (window.MagicDungeonUI.inFlight) return;
    document.querySelectorAll('#choices [data-dungeon-choice]').forEach(button => {
      if (!button.dataset.dungeonChoice.startsWith('magic-dungeon:skill:')) return;
      const index = Number(button.dataset.dungeonChoice.split(':').at(-1));
      if (run.cooldowns[index] <= 0) return;
      const label = button.querySelector('.choice-status'), remaining = Math.max(0, run.cooldowns[index] - dt);
      label.textContent = remaining > 0 ? `대기 ${remaining.toFixed(1)}초` : '준비 확인 중'; label.hidden = false;
    });
  }
  window.MagicDungeonUI = { render, updateChoices, renderNarrative, inFlight: false };
  window.setInterval(() => { if (!document.hidden) updateTimers(); }, 200);
})();
