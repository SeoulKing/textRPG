const navigationChoices = new Set([
  "academy_visit_headmaster", "academy_visit_stella", "academy_visit_stella_again", "academy_open_curriculum",
  "academy_return_courtyard", "academy_return_headmaster", "academy_return_curriculum", "academy_visit_library",
  "academy_return_library", "academy_return_stella", "academy_resume_observatory", "academy_view_observatory",
]);
export function academyVisibleChoices(snapshot) {
  if (!snapshot.academyMap || snapshot.state.npcDialogue?.active) return snapshot.availableActions;
  return snapshot.availableActions.filter(choice => {
    const id = choice.action?.choiceId ?? choice.id, room = snapshot.academyMap.currentRoomId;
    if (navigationChoices.has(id)) return false;
    if (id === "academy_attend_theory") return room === "classroom";
    if (id === "academy_open_practical") return room === "practice";
    if (id === "academy_share_stella_success") return room === "garden";
    return true;
  });
}
const escape = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const hex = radius => Array.from({ length: 6 }, (_, i) => {
  const angle = (i * 60 - 30) * Math.PI / 180;
  return `${(Math.cos(angle) * radius).toFixed(2)},${(Math.sin(angle) * radius).toFixed(2)}`;
}).join(" ");
function position(room) { return { x: 250 + Math.sqrt(3) * 44 * (room.q + room.r / 2), y: 190 + 66 * room.r }; }
function roomArt(icon) {
  const wall = '<path d="M-27 1V-18L0-31 27-18V1L0-12Z" fill="#e9e0d0" stroke="#b9ad94" stroke-width=".8"/><path d="M0-31V-12L27 1V-18Z" fill="#d1d1c7" stroke="#b9ad94" stroke-width=".8"/>';
  const floor = '<path d="M-27 1 0-12 27 1 0 15Z" fill="#eee2c9" stroke="#c7b99b" stroke-width=".8"/>';
  const desk = (x, y) => `<g transform="translate(${x} ${y})"><path d="M-7 0V5M6 0V5" stroke="#766348" stroke-width="1.5"/><path d="M-8-4 0-8 8-4 0 0Z" fill="#b88f5c" stroke="#8e714f" stroke-width=".7"/></g>`;
  if (icon === "gate") return '<path d="M-24 8-5-3 22 9 4 20Z" fill="#d5ddcf"/><ellipse cy="4" rx="15" ry="8" fill="#acbcbc" stroke="#7f9fa5"/><ellipse cy="2" rx="12" ry="5" fill="#8dced2"/><path d="M0 0V-12" stroke="#c1baa2" stroke-width="5"/><ellipse cy="-12" rx="7" ry="3" fill="#e5ddc3"/><path d="M-25 0V-19Q-13-31-2-19V-12M-25-19-20-16M-2-19-7-16" fill="none" stroke="#b4b6a7" stroke-width="4"/><circle cx="23" cy="-5" r="6" fill="#809783"/>';
  if (icon === "garden") return '<path d="M-27 2 0-13 27 2 0 18Z" fill="#a3b596"/><path d="M-22 5 15-15M-7 14 26-4" stroke="#e0d8ba" stroke-width="6"/><path d="M-10-4 3-11 17-4 4 3Z" fill="#c1b59c" stroke="#928b75"/><path d="M-9-4V2M15-4V3" stroke="#8b836d" stroke-width="2"/><g fill="#688d76"><circle cx="-18" cy="-10" r="7"/><circle cx="16" cy="10" r="6"/><circle cx="-7" cy="15" r="4"/></g><g fill="#eee4b4"><circle cx="-19" cy="-12" r="2"/><circle cx="16" cy="8" r="2"/><circle cx="-6" cy="14" r="1.5"/></g>';
  if (icon === "telescope") return '<ellipse cy="4" rx="26" ry="14" fill="#b6c4c7" stroke="#8c9da1"/><path d="M-24 2V-11Q-24-33 0-33T24-11V2L0-10Z" fill="#738f9a" stroke="#537681"/><path d="M0-33V-11L18 0V-15Q17-27 0-33" fill="#d6d5c3"/><path d="M-2 8 2-6 12 11M2-6-11 6" fill="none" stroke="#9b8152" stroke-width="2.5"/><path d="M-2-7 15-19 20-12 4 0Z" fill="#bca270" stroke="#81734f"/><ellipse cx="18" cy="-16" rx="3" ry="4" transform="rotate(-35 18 -16)" fill="#a4d4dc" stroke="#e1cea0"/>';
  if (icon === "arch") return wall + floor + '<path d="M-15-5V-17Q-8-26-2-20V-11M7-10V-23Q14-26 21-18V-3" fill="none" stroke="#aaa58f" stroke-width="4"/><path d="M-16 5 0-4 16 5 0 13Z" fill="#879cac"/><path d="M-7 5 0 1 7 5 0 9Z" fill="#d4c39d"/>';
  if (icon === "desk") return wall + floor + '<path d="M-20-12V-20L-9-25V-17Z" fill="#99bdc5" stroke="#a08f72"/><path d="M5-11V-23L21-15V-3Z" fill="#7d765e"/><path d="M7-19 18-13M7-15 18-9" stroke="#b3a784" stroke-width="1.4"/>' + desk(-4, 4) + '<path d="M-4-4 2-1-3 1-9-2Z" fill="#f8f0dc"/><circle cx="7" cy="0" r="2" fill="#b4a279"/>';
  if (icon === "classroom") return wall + floor + '<path d="M-22-14V-24L-3-33V-22Z" fill="#617b71" stroke="#ac9972" stroke-width="2"/><path d="M-18-22-7-27M-18-18-11-21" stroke="#e8e2c7" stroke-width=".7"/>' + desk(-12, 1) + desk(4, -6) + desk(3, 10) + desk(18, 3);
  if (icon === "books") return wall + floor + '<path d="M-24-11V-25L-5-34V-20ZM5-23V-9L24 1V-13Z" fill="#887b60" stroke="#665e4d" stroke-width="1"/><path d="M-22-20-7-27M-22-15-7-22M7-18 21-11M7-12 21-5" stroke="#bfa77a" stroke-width="1.3"/><g stroke-width="2"><path d="M-19-20V-25M-12-23V-29M10-12V-18M18-7V-13" stroke="#9ea49a"/><path d="M-16-21V-27M-9-24V-30M14-9V-16" stroke="#baa080"/></g>' + desk(-2, 7) + '<path d="M-6 0 0-3 6 0 0 4Z" fill="#f0ead6" stroke="#aa987a" stroke-width=".5"/>';
  return wall + floor + '<ellipse cy="3" rx="17" ry="9" fill="#a9aaa0" stroke="#818c87"/><ellipse cy="0" rx="15" ry="7" fill="#c4c7b3"/><path d="M0-25 9-12 0 1-9-12Z" fill="#8bc8ce" stroke="#59969f" stroke-width="1"/><path d="M0-25V1L9-12Z" fill="#629cae"/><path d="M-21 0Q0 18 21 0" fill="none" stroke="#c5ac73" stroke-width="2"/><circle cx="-21" r="2" fill="#a78957"/><circle cx="21" r="2" fill="#a78957"/>';
}
export function createAcademyMap(host, onMove, { onOpenWorldMap = () => {} } = {}) {
  let model = null, gameId = null, selectedId = null, signature = "", busy = false;
  function update() {
    if (!model) return;
    const selected = model.rooms.find(room => room.id === selectedId) ?? model.rooms.find(room => room.isCurrent);
    if (!selected) return;
    for (const tile of host.querySelectorAll("[data-academy-room]")) {
      const selectedTile = tile.dataset.academyRoom === selected.id;
      tile.classList.toggle("is-selected", selectedTile);
      tile.setAttribute("aria-pressed", String(selectedTile));
      tile.setAttribute("aria-disabled", String(busy));
    }
    const path = new Set(selected.route.flatMap((id, i) => i ? [[id, selected.route[i - 1]].sort().join(":")] : []));
    for (const line of host.querySelectorAll("[data-academy-edge]")) line.classList.toggle("is-route", path.has(line.dataset.academyEdge));
    host.querySelector("[data-academy-name]").textContent = selected.name;
    const current = model.rooms.find(room => room.id === model.currentRoomId);
    host.querySelector("[data-academy-current]").textContent = current?.name ?? "마법학교";
    host.querySelector("[data-academy-world]").disabled = busy;
    const reason = model.blockedReason || selected.lockedReason;
    const route = selected.route.map(id => model.rooms.find(room => room.id === id)?.name).join(" → ");
    host.querySelector("[data-academy-description]").textContent = reason || (selected.isCurrent ? selected.summary : `${route} · ${selected.minutes}분`);
    const button = host.querySelector("[data-academy-enter]");
    button.disabled = busy || !selected.action;
    button.textContent = busy ? "진행 중…" : selected.lockedReason ? "입장 조건" : selected.isCurrent ? selected.action ? "둘러보기" : "현재 위치" : "이동";
    host.classList.toggle("is-busy", busy);
  }
  function select(id) {
    if (busy || !model?.rooms.some(room => room.id === id)) return;
    selectedId = id; update();
  }
  host.addEventListener("click", event => {
    const parent = event.target.closest("[data-academy-world]");
    if (parent && host.contains(parent)) { event.stopPropagation(); if (!busy) onOpenWorldMap(); return; }
    const tile = event.target.closest("[data-academy-room]");
    if (tile && host.contains(tile)) { select(tile.dataset.academyRoom); return; }
    const button = event.target.closest("[data-academy-enter]");
    if (!button || !host.contains(button) || busy) return;
    const room = model?.rooms.find(room => room.id === selectedId);
    if (room?.action) onMove(room.action, button);
  });
  host.addEventListener("keydown", event => {
    const tile = event.target.closest("[data-academy-room]");
    if (!tile || !["Enter", " "].includes(event.key)) return;
    event.preventDefault(); select(tile.dataset.academyRoom);
  });
  return {
    render(snapshot, disabled = false) {
      const next = snapshot.academyMap;
      if (!next) { this.clear(); return; }
      if (gameId !== snapshot.gameId || model?.currentRoomId !== next.currentRoomId) selectedId = next.currentRoomId;
      gameId = snapshot.gameId; model = next; busy = disabled; host.hidden = false;
      const nextSignature = JSON.stringify([gameId, next]);
      if (signature === nextSignature) { update(); return; }
      signature = nextSignature;
      const edges = new Set();
      const paths = next.rooms.flatMap(room => room.neighbors.flatMap(id => {
        const key = [room.id, id].sort().join(":");
        if (edges.has(key)) return [];
        edges.add(key); const other = next.rooms.find(candidate => candidate.id === id);
        if (!other) return [];
        const a = position(room), b = position(other);
        return [`<path class="academy-map-path" data-academy-edge="${escape(key)}" d="M${a.x},${a.y} ${b.x},${b.y}" fill="none"/>`];
      })).join("");
      const tiles = next.rooms.map(room => {
        const p = position(room);
        return `<g class="academy-room${room.isCurrent ? " is-current" : ""}${room.lockedReason ? " is-locked" : ""}"
          data-academy-room="${escape(room.id)}" transform="translate(${p.x} ${p.y})" role="button" tabindex="0" aria-label="${escape(room.name + (room.isCurrent ? " · 현재 위치" : "") + (room.lockedReason ? " · " + room.lockedReason : ""))}">
          <title>${escape(room.name)}</title>
          <polygon points="${hex(44)}" fill="transparent"/>
          <polygon class="academy-room-base" points="${hex(39)}" fill="#e9e1cc" stroke="#b5b39f"/>
          <g class="academy-room-art" aria-hidden="true" pointer-events="none">${roomArt(room.icon)}</g>
          <polygon class="academy-room-current" points="${hex(39)}" fill="none" stroke="#c99a3e" stroke-width="2.5" pointer-events="none"/>
          <polygon class="academy-room-selected" points="${hex(35)}" fill="none" stroke="#428bbc" stroke-width="2.5" pointer-events="none"/>
          ${room.lockedReason ? '<g class="academy-room-lock" aria-hidden="true" pointer-events="none"><rect x="14" y="17" width="10" height="8" rx="2" fill="#6e756c"/><path d="M16 18V15a3 3 0 0 1 6 0v3" fill="none" stroke="#6e756c" stroke-width="1.7"/></g>' : ""}
        </g>`;
      }).join("");
      host.innerHTML = `<div class="academy-map-heading"><nav class="academy-map-breadcrumb" aria-label="현재 지도 위치">
        <button type="button" data-academy-world aria-controls="panel-content" aria-expanded="false">월드맵</button><span aria-hidden="true">›</span>
        <span>마법학교</span><span aria-hidden="true">›</span><strong data-academy-current aria-current="location"></strong>
        </nav><span class="academy-map-legend"><i class="is-current"></i>현재 <i class="is-selected"></i>선택</span></div>
        <svg class="academy-map-board" viewBox="110 0 280 305" role="group" aria-label="마법학교 내부 타일 지도"><defs><pattern id="academy-building-floor" patternUnits="userSpaceOnUse" width="12" height="12"><rect width="12" height="12" fill="#eae4d3"/><path d="M12 0H0V12" fill="none" stroke="#d9d1bc" stroke-width=".6"/></pattern></defs>
        <g class="academy-building-shell" aria-hidden="true" pointer-events="none"><path d="M209 12H291V78L366 122V258L289 302H173L134 258V151L209 107Z" fill="url(#academy-building-floor)" stroke="#b6b1a1" stroke-width="4" stroke-linejoin="round"/>
        <path d="M209 12H291M366 122V258L289 302H253M207 302H173L134 258V151" fill="none" stroke="#f7f4e8" stroke-width="1.2"/>
        <path d="M207 302H253" fill="none" stroke="#b79d72" stroke-width="4"/></g>${paths}${tiles}</svg>
        <div class="academy-map-selection"><div class="academy-map-detail" aria-live="polite"><strong data-academy-name></strong><small data-academy-description></small></div><button data-academy-enter type="button">이동</button></div>`;
      update();
    },
    setBusy(value) { busy = value; if (model) update(); },
    clear() { host.hidden = true; host.replaceChildren(); model = null; signature = ""; selectedId = null; },
  };
}