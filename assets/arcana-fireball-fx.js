/* Silent, cosmetic fireball effects. Combat outcomes remain server-owned. */
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const CHARGE_MS = 100, FLIGHT_MS = 200, AFTER_HIT_MS = 500;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let active = null, sequence = 0;
  function svgNode(tag, attrs = {}) {
    const node = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
    return node;
  }
  function cancel() {
    if (!active) return;
    window.cancelAnimationFrame(active.frame);
    active.shake?.cancel();
    active.layer.remove();
    active = null;
  }
  function play({ source, target, damage, onImpact }) {
    cancel();
    if (document.hidden || !target?.isConnected || !(damage > 0)) return null;
    const targetRect = target.getBoundingClientRect();
    if (!targetRect.width || !targetRect.height || targetRect.bottom < 0 || targetRect.top > window.innerHeight) return null;
    const sourceRect = source?.getBoundingClientRect() || targetRect;
    const start = { x: sourceRect.left + Math.min(40, sourceRect.width * .35), y: sourceRect.top + sourceRect.height * .5 };
    const end = { x: targetRect.left + targetRect.width * .5, y: targetRect.top + targetRect.height * .55 };
    const control = { x: Math.max(14, Math.min(start.x, end.x) - Math.min(75, window.innerWidth * .16)), y: (start.y + end.y) * .5 };
    const simple = reducedMotion.matches;
    const beganAt = performance.now();
    const impactDelay = simple ? 0 : CHARGE_MS + FLIGHT_MS;
    const impactAt = beganAt + impactDelay;
    const glowId = 'arcana-fire-glow-' + (++sequence);
    const layer = svgNode('svg', { class: 'arcana-fireball-fx', viewBox: '0 0 ' + window.innerWidth + ' ' + window.innerHeight, 'aria-hidden': 'true', focusable: 'false' });
    const defs = svgNode('defs');
    const glow = svgNode('radialGradient', { id: glowId });
    [['0%', '#fffce1', 1], ['40%', '#ffd679', .9], ['74%', '#ff8d32', .7], ['100%', '#f15d23', 0]].forEach(([offset, color, opacity]) => {
      glow.append(svgNode('stop', { offset, 'stop-color': color, 'stop-opacity': opacity }));
    });
    defs.append(glow); layer.append(defs);
    const charge = svgNode('g', { transform: 'translate(' + start.x + ' ' + start.y + ')' });
    const chargeGlow = svgNode('circle', { r: 18, fill: 'url(#' + glowId + ')' });
    const chargeRing = svgNode('circle', { r: 6, fill: 'none', stroke: '#e99039', 'stroke-width': 1.5 });
    charge.append(chargeGlow, chargeRing);
    const embers = [0, 1, 2].map(() => {
      const ember = svgNode('circle', { r: 2, fill: '#ffc664' }); charge.append(ember); return ember;
    });
    const projectile = svgNode('g', { opacity: 0 });
    projectile.append(
      svgNode('ellipse', { cx: -12, rx: 30, ry: 16, fill: 'url(#' + glowId + ')' }),
      svgNode('path', { d: 'M8 0C5-10-7-13-22-7L-37-12-28-3-46 2-27 5-31 12-15 8C-4 14 6 10 8 0Z', fill: '#ed6d28' }),
      svgNode('path', { d: 'M5 0C2-6-7-8-18-3L-29-5-20 2-25 6-13 5C-4 10 4 6 5 0Z', fill: '#ffc55e' }),
      svgNode('ellipse', { cx: -2, rx: 6, ry: 5, fill: '#fff8d8' })
    );
    const flash = svgNode('circle', { cx: end.x, cy: end.y, r: 28, fill: 'url(#' + glowId + ')', opacity: 0 });
    const ring = svgNode('circle', { cx: end.x, cy: end.y, r: 8, fill: 'none', stroke: '#ef8d35', 'stroke-width': 2.5, opacity: 0 });
    const sparks = Array.from({ length: 8 }, (_, index) => {
      const spark = svgNode('ellipse', { rx: index % 2 ? 2 : 3, ry: 1.5, fill: index % 2 ? '#ffbc54' : '#e9792d', opacity: 0 });
      return { node: spark, angle: index * Math.PI / 4 + .18, distance: 25 + (index % 3) * 9 };
    });
    const number = svgNode('text', { x: end.x, y: end.y - 22, class: 'arcana-fireball-damage', 'text-anchor': 'middle', opacity: 0 });
    number.textContent = '−' + Number(damage.toFixed(1));
    layer.append(charge, projectile, flash, ring, ...sparks.map(spark => spark.node), number);
    document.body.append(layer);
    const effect = { layer, frame: 0, shake: null, hit: false };
    active = effect;
    function frame(now) {
      if (active !== effect) return;
      if (document.hidden || !target.isConnected) { cancel(); return; }
      const age = Math.max(0, now - beganAt);
      const charging = !simple && age < CHARGE_MS;
      charge.setAttribute('opacity', charging ? 1 : 0);
      if (charging) {
        const progress = age / CHARGE_MS;
        chargeGlow.setAttribute('r', 8 + progress * 13);
        chargeRing.setAttribute('r', 16 - progress * 10);
        embers.forEach((ember, index) => {
          const angle = index * Math.PI * 2 / 3 + progress * 2;
          ember.setAttribute('cx', Math.cos(angle) * (18 - progress * 13));
          ember.setAttribute('cy', Math.sin(angle) * (18 - progress * 13));
        });
      }
      const flying = !simple && age >= CHARGE_MS && age < impactDelay;
      projectile.setAttribute('opacity', flying ? 1 : 0);
      if (flying) {
        const t = (age - CHARGE_MS) / FLIGHT_MS, inv = 1 - t;
        const x = inv * inv * start.x + 2 * inv * t * control.x + t * t * end.x;
        const y = inv * inv * start.y + 2 * inv * t * control.y + t * t * end.y;
        const dx = 2 * inv * (control.x - start.x) + 2 * t * (end.x - control.x);
        const dy = 2 * inv * (control.y - start.y) + 2 * t * (end.y - control.y);
        projectile.setAttribute('transform', 'translate(' + x + ' ' + y + ') rotate(' + Math.atan2(dy, dx) * 180 / Math.PI + ') scale(' + (.65 + t * .25) + ')');
      }
      if (age >= impactDelay) {
        if (!effect.hit) {
          effect.hit = true;
          if (!simple && typeof target.animate === 'function') effect.shake = target.animate([
            { transform: 'translateX(0) scale(1)' }, { transform: 'translateX(-3px) scale(.97,1.03)' },
            { transform: 'translateX(3px) scale(1.02,.98)' }, { transform: 'translateX(-1px) scale(1)' },
            { transform: 'translateX(0) scale(1)' },
          ], { duration: 150, easing: 'ease-out' });
          onImpact?.();
        }
        const hitAge = age - impactDelay, progress = Math.min(1, hitAge / AFTER_HIT_MS);
        if (!simple) {
          const burst = Math.min(1, hitAge / 160);
          flash.setAttribute('opacity', (1 - burst) * .85);
          flash.setAttribute('r', 15 + burst * 23);
          ring.setAttribute('opacity', (1 - burst) * .85);
          ring.setAttribute('r', 10 + burst * 27);
          const spread = Math.min(1, hitAge / 350);
          sparks.forEach(({ node, angle, distance }) => {
            node.setAttribute('opacity', (1 - spread) * .9);
            const x = end.x + Math.cos(angle) * (8 + spread * distance);
            const y = end.y + Math.sin(angle) * (8 + spread * distance) + spread * spread * 10;
            node.setAttribute('transform', 'translate(' + x + ' ' + y + ') rotate(' + angle * 180 / Math.PI + ')');
          });
          number.setAttribute('y', end.y - 22 - 30 * (1 - Math.pow(1 - progress, 2)));
        }
        number.setAttribute('opacity', Math.min(1, (1 - progress) * 2));
      }
      if (age >= impactDelay + AFTER_HIT_MS) { cancel(); return; }
      effect.frame = window.requestAnimationFrame(frame);
    }
    effect.frame = window.requestAnimationFrame(frame);
    return { impactAt };
  }
  window.ArcanaFireballFX = { play, cancel };
  window.addEventListener('resize', cancel);
  window.addEventListener('scroll', cancel, true);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); });
})();
