(() => {
  "use strict";
  const storageKey = "textrpg-state-world-v1";
  const el = id => document.getElementById(id);
  let state = null;
  let busy = false;
  let pending = null;
  let gameId = null;
  try { gameId = localStorage.getItem(storageKey); } catch { /* Play also works without browser storage. */ }
  function setBusy(value) {
    busy = value;
    document.querySelectorAll("button").forEach(button => { button.disabled = value; });
    el("choices").setAttribute("aria-busy", String(value));
  }
  async function request(path, body) {
    const response = await fetch(path, { method: body ? "POST" : "GET", headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
    const data = await response.json();
    if (!response.ok) { const error = new Error(data.message || "요청을 처리하지 못했습니다."); error.status = response.status; throw error; }
    return data;
  }
  function button(label, detail, action) {
    const node = document.createElement("button"); node.type = "button";
    const text = document.createElement("span"); text.textContent = label;
    const hint = document.createElement("small"); hint.textContent = detail;
    node.append(text, hint); node.addEventListener("click", action); return node;
  }
  function show(next) {
    state = next; gameId = next.gameId;
    try { localStorage.setItem(storageKey, gameId); } catch { /* The server still saves each action. */ }
    el("room").textContent = state.roomName;
    el("position").textContent = "현재 자리 · " + state.nodeName;
    el("clock").textContent = Math.floor(state.elapsedSeconds / 60) + "분 " + state.elapsedSeconds % 60 + "초 경과";
    el("story").replaceChildren(...state.paragraphs.map(text => { const p = document.createElement("p"); p.textContent = text; return p; }));
    el("choices").replaceChildren(...state.choices.map(choice => button(choice.label, choice.seconds ? choice.seconds + "초" : "시간 정지", () => act(choice))));
    if (state.pageCount > 1) el("choices").append(button("다른 대상과 행동 보기", (state.page + 1) + " / " + state.pageCount, () => load((state.page + 1) % state.pageCount)));
    el("inventory").replaceChildren(...(state.inventory.length ? state.inventory.map(item => item.name.replace(/^.* 안 /, "") + " · " + item.quantity + (item.unit || "개")) : ["아직 없습니다."]).map(text => { const li = document.createElement("li"); li.textContent = text; return li; }));
    el("memory").replaceChildren(...state.memory.map(memory => { const li = document.createElement("li"); li.textContent = memory.observedAt + "초 · " + memory.text; return li; }));
  }
  async function run(operation) {
    if (busy) return;
    setBusy(true); el("status").textContent = "";
    try { await operation(); }
    catch (error) { el("status").textContent = error.message; }
    finally { setBusy(false); }
  }
  async function sendPending() {
    try { const next = await request("/api/state-world/games/" + gameId + "/actions", pending); pending = null; show(next); }
    catch (error) {
      if (error.status === 409) { pending = null; show(await request("/api/state-world/games/" + gameId)); }
      else {
        // A lost response can be retried with exactly the same request ID; never resubmit as a new action.
        el("choices").replaceChildren(button("행동 결과를 다시 확인한다", "", () => run(sendPending)));
      }
      throw error;
    }
  }
  function act(choice) {
    return run(async () => {
      pending = { requestId: crypto.randomUUID(), revision: choice.revision, command: choice.command };
      await sendPending();
    });
  }
  function load(page = 0) { return run(async () => show(await request("/api/state-world/games/" + gameId + "?page=" + page))); }
  el("new-game").addEventListener("click", () => run(async () => { const next = await request("/api/state-world/games", {}); pending = null; show(next); }));
  if (gameId) load();
  else el("choices").append(button("창고에 들어간다", "시작", () => el("new-game").click()));
})();
