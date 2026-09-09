import { access, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scenesDir = path.join(root, "assets", "scenes");

const targets = [
  ["convenience.png", "convenience.webp"],
  ["kitchen.png", "kitchen.webp"],
  ["shelter.png", "shelter.webp"],
  ["forest-pencil-charcoal.png", "forest-pencil-charcoal.webp"],
];

for (const [inputName, outputName] of targets) {
  const input = path.join(scenesDir, inputName);
  const output = path.join(scenesDir, outputName);
  await access(input);

  const before = await stat(input);
  await sharp(input)
    .rotate()
    .resize({ width: 1280, withoutEnlargement: true })
    .webp({ quality: 76, effort: 5, smartSubsample: true })
    .toFile(output);
  const after = await stat(output);
  const savedPercent = before.size > 0 ? Math.round((1 - after.size / before.size) * 100) : 0;
  console.log(`${inputName}: ${Math.round(before.size / 1024)}KB -> ${Math.round(after.size / 1024)}KB (${savedPercent}% smaller)`);
}
