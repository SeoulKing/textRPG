import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(root, ".server-dist");
const runtimePublicDir = path.join(distDir, "public");

function replaceRequired(source, pattern, replacement, label) {
  if (typeof pattern === "string") {
    if (source.includes(replacement)) return source;
    if (!source.includes(pattern)) throw new Error(`Runtime performance patch target not found: ${label}`);
    return source.replace(pattern, replacement);
  }
  if (pattern.test(source)) return source.replace(pattern, replacement);
  if (typeof replacement === "string" && source.includes(replacement)) return source;
  throw new Error(`Runtime performance patch target not found: ${label}`);
}

async function buildRuntimeClient() {
  const sourcePath = path.join(root, "app-api.js");
  let source = await readFile(sourcePath, "utf8");

  const oldSceneImageSource = `function sceneImageSource(location) {
  // Use the same address for prediction, preloading, and display of old saves.
  const source = location?.imagePath || "assets/scenes/camp.svg";
  return source.replace(/^\\/?assets\\/scenes\\/forest\\.svg$/, "assets/scenes/forest-pencil-charcoal.png");
}`;
  const newSceneImageSource = `function sceneImageSource(location) {
  // Keep legacy save paths working while serving compressed scene art.
  const source = (location?.imagePath || "assets/scenes/camp.svg").replace(/^\\/+/, "");
  const optimized = {
    "assets/scenes/convenience.png": "assets/scenes/convenience.webp",
    "assets/scenes/kitchen.png": "assets/scenes/kitchen.webp",
    "assets/scenes/shelter.png": "assets/scenes/shelter.webp",
    "assets/scenes/forest.svg": "assets/scenes/forest-pencil-charcoal.webp",
    "assets/scenes/forest-pencil-charcoal.png": "assets/scenes/forest-pencil-charcoal.webp",
  };
  return optimized[source] || source;
}`;
  source = replaceRequired(source, oldSceneImageSource, newSceneImageSource, "scene image WebP mapping");

  const blockingAssets = `        const assetsReady = preloadNextSceneAssets(snapshot);
        prepareScenePresentation(snapshot);
        mark("preparedMs");
        await assetsReady;
        mark("assetsMs");
        return { snapshot, error: null };`;
  const nonBlockingAssets = `        const assetsReady = preloadNextSceneAssets(snapshot);
        prepareScenePresentation(snapshot);
        mark("preparedMs");
        // Scene art is presentation-only: never hold text/choices behind image decode or transfer.
        void assetsReady.then(() => mark("assetsMs")).catch(() => undefined);
        return { snapshot, error: null };`;
  source = replaceRequired(source, blockingAssets, nonBlockingAssets, "non-blocking scene asset preload");

  await mkdir(runtimePublicDir, { recursive: true });
  await writeFile(path.join(runtimePublicDir, "app-api.js"), source, "utf8");
}

async function patchCompiledServer() {
  const serverPath = path.join(distDir, "server.js");
  let source = await readFile(serverPath, "utf8");

  const appApiPathPattern = /([A-Za-z0-9_$.]+\.join\()webRoot, "app-api\.js"\)/;
  if (!appApiPathPattern.test(source)) {
    throw new Error("Runtime performance patch target not found: compiled app-api route");
  }
  source = source.replace(appApiPathPattern, `$1webRoot, ".server-dist", "public", "app-api.js")`);

  const cacheHeaderPattern = /reply\.header\("Cache-Control", isStaticAsset && reply\.statusCode < 400\s*\?\s*"public, max-age=0, must-revalidate"\s*:\s*isNarrativeStream\s*\?\s*"no-store, no-transform"\s*:\s*"no-store"\);/;
  if (!cacheHeaderPattern.test(source)) {
    throw new Error("Runtime performance patch target not found: static cache header");
  }
  source = source.replace(cacheHeaderPattern, `const isOptimizedSceneImage = /^\\/assets\\/scenes\\/(?:convenience|kitchen|shelter|forest-pencil-charcoal)\\.webp$/.test(pathname);
        reply.header("Cache-Control", isOptimizedSceneImage && reply.statusCode < 400
            ? "public, max-age=86400, stale-while-revalidate=604800"
            : isStaticAsset && reply.statusCode < 400
                ? "public, max-age=0, must-revalidate"
                : isNarrativeStream ? "no-store, no-transform" : "no-store");`);

  await writeFile(serverPath, source, "utf8");
}

await buildRuntimeClient();
await patchCompiledServer();
console.log("runtime scene performance patch applied");
