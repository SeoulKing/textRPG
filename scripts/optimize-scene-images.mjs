import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import wawoff2 from "wawoff2";

const root = process.cwd();
const outDir = path.join(root, "assets/optimized");
const publicDir = path.join(root, ".server-dist/public");
await mkdir(outDir, { recursive: true });
await mkdir(publicDir, { recursive: true });
const manifest = {};
async function emit(source, buffer, extension) {
  const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 16);
  const name = path.basename(source, path.extname(source)) + "-" + hash + "." + extension;
  await writeFile(path.join(outDir, name), buffer);
  manifest[source] = "/assets/optimized/" + name;
  const original = (await readFile(path.join(root, source))).length;
  console.log(source + ": " + Math.round(original / 1024) + " -> " + Math.round(buffer.length / 1024) + " KiB");
}
for (const folder of ["assets/scenes", "assets/monsters", "assets/arcana-map/sprites"]) {
  for (const file of (await readdir(path.join(root, folder))).sort()) {
    if (!file.endsWith(".png")) continue;
    const source = folder + "/" + file;
    // Preserve sprite atlas dimensions; its crop coordinates are part of the map.
    const width = folder.includes("monsters") ? 480 : folder.includes("sprites") ? undefined : 1280;
    let pipeline = sharp(path.join(root, source)).rotate();
    if (width) pipeline = pipeline.resize({ width, withoutEnlargement: true });
    await emit(source, await pipeline.webp({ quality: 82, effort: 5, alphaQuality: 100 }).toBuffer(), "webp");
  }
}
for (const file of ["map-terrain-v1.png", "map-landmarks-v2.png", "map-arcana-downtown-v2.png"]) {
  const source = "assets/" + file;
  // Atlas dimensions must stay unchanged.
  await emit(source, await sharp(path.join(root, source)).webp({ quality: 85, effort: 5, alphaQuality: 100 }).toBuffer(), "webp");
}
for (const file of ["KoPubBatangLight.ttf", "KoPubBatangMedium.ttf"]) {
  const source = "assets/fonts/" + file;
  await emit(source, Buffer.from(await wawoff2.compress(await readFile(path.join(root, source)))), "woff2");
}
await writeFile(path.join(publicDir, "asset-manifest.json"), JSON.stringify(manifest, null, 2));
await writeFile(path.join(publicDir, "asset-manifest.mjs"), "export default " + JSON.stringify(manifest) + ";\n");
