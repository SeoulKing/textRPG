/* Only immutable public art/fonts are cached. Game, account and save APIs always use the network. */
const CACHE_NAME = "textrpg-art-v1";
const MAX_BYTES = 64 * 1024 * 1024;
const MAX_ENTRIES = 80;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
let writes = Promise.resolve();
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
function eligible(request) {
  const url = new URL(request.url);
  return request.method === "GET" && !request.headers.has("range") && url.origin === self.location.origin &&
    !url.search && /^\/assets\/optimized\/[\w-]+-[a-f0-9]{16}\.(webp|woff2)$/.test(url.pathname);
}
async function remember(request, response) {
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_FILE_BYTES) return;
  const headers = new Headers(response.headers);
  // The stored body is decoded; its original transfer encoding/length no longer apply.
  headers.delete("content-encoding");
  headers.delete("content-length");
  headers.set("X-Asset-Bytes", String(buffer.byteLength));
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, new Response(buffer, { status: 200, headers }));
  const keys = await cache.keys();
  const sizes = await Promise.all(keys.map(async key => Number((await cache.match(key))?.headers.get("X-Asset-Bytes") || MAX_FILE_BYTES)));
  let bytes = sizes.reduce((sum, size) => sum + size, 0);
  let count = keys.length;
  for (let i = 0; i < keys.length && (bytes > MAX_BYTES || count > MAX_ENTRIES); i++) {
    await cache.delete(keys[i]);
    bytes -= sizes[i];
    count--;
  }
}
self.addEventListener("fetch", event => {
  if (!eligible(event.request)) return;
  let finish;
  const saved = new Promise(resolve => { finish = resolve; });
  event.waitUntil(saved);
  event.respondWith((async () => {
    try {
      let cached;
      try { cached = await (await caches.open(CACHE_NAME)).match(event.request); } catch { /* Storage may be unavailable. */ }
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.status === 200 && response.type !== "opaque") {
        const copy = response.clone();
        writes = writes.then(() => remember(event.request, copy)).catch(() => {});
        awaitPromise(writes, finish);
        finish = null;
      }
      return response;
    } finally {
      if (finish) finish();
    }
  })());
});
function awaitPromise(promise, done) { promise.finally(done); }
