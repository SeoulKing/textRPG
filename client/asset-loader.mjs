import manifest from "/asset-manifest.mjs";

export function assetUrl(source) {
  if (!source) return source;
  const key = source.replace(/^\//, "");
  // Studio uploads and query-versioned URLs retain their exact identity.
  return manifest[key] || source;
}
let queue = [];
let active = null;
let timer = 0;
let blocked = false;
const completed = new Set();
const attempts = new Map();
function constrained() {
  const connection = navigator.connection;
  return connection?.saveData || /^(slow-)?2g$/.test(connection?.effectiveType || "");
}
function schedule() {
  if (timer || active || blocked || document.hidden || !queue.length || constrained()) return;
  timer = setTimeout(pump, 300);
}
async function pump() {
  timer = 0;
  if (blocked || document.hidden || constrained()) return;
  const source = queue.shift();
  if (!source) return;
  const controller = new AbortController();
  active = { source, controller };
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(source, { signal: controller.signal, priority: "low", credentials: "same-origin" });
    if (!response.ok) throw new Error("asset download failed");
    await response.arrayBuffer();
    completed.add(source);
  } catch {
    if (controller.signal.aborted && (blocked || document.hidden)) queue.unshift(source);
    else attempts.set(source, (attempts.get(source) || 0) + 1);
  } finally {
    clearTimeout(timeout);
    active = null;
    schedule();
  }
}
export function queueAssets(sources, { replace = false } = {}) {
  if (replace) queue = [];
  for (const input of sources) {
    const source = assetUrl(input);
    if (!source || !source.startsWith("/assets/optimized/")) continue;
    if (!completed.has(source) && !queue.includes(source) && active?.source !== source && (attempts.get(source) || 0) < 2) queue.push(source);
  }
  schedule();
}
export function pauseAssetWarmup(value) {
  blocked = value;
  if (value) {
    clearTimeout(timer);
    timer = 0;
    active?.controller.abort();
  } else schedule();
}
export function prioritizeAsset(input) {
  const source = assetUrl(input);
  queue = queue.filter(entry => entry !== source);
  if (active?.source === source) active.controller.abort();
  return source;
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) active?.controller.abort();
  else schedule();
});
if ("serviceWorker" in navigator) {
  const register = () => navigator.serviceWorker.register("/service-worker.js").catch(() => {});
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
