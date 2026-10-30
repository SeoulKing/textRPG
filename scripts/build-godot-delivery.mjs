import { cp, mkdir, readdir } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import path from "node:path";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";

// Build a matched raw/compressed snapshot. Never gzip large files per request.
const source = path.resolve("godot-web");
const output = path.resolve(".server-dist/godot");
await mkdir(output, { recursive: true });
const entries = await readdir(source, { withFileTypes: true });
for (const entry of entries) {
  if (!entry.isFile() || !/\.(html|js|wasm|pck|png|svg|ico)$/.test(entry.name)) continue;
  const target = path.join(output, entry.name);
  await cp(path.join(source, entry.name), target);
  if (/\.(js|wasm|pck)$/.test(entry.name)) {
    await pipeline(createReadStream(target), createGzip({ level: 6 }), createWriteStream(target + ".gz"));
  }
}
console.log("Godot deployment snapshot and gzip variants built.");
