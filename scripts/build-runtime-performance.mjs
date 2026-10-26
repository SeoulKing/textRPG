import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const root = process.cwd();
const output = path.join(root, ".server-dist/public");
const manifest = JSON.parse(await readFile(path.join(output, "asset-manifest.json"), "utf8"));
let css = await readFile(path.join(root, "styles.css"), "utf8");
for (const [original, optimized] of Object.entries(manifest)) {
  css = css.replaceAll('url("/' + original + '")', 'url("' + optimized + '")');
}
css = css.replaceAll('format("truetype")', 'format("woff2")');
await writeFile(path.join(output, "styles.css"), css);
let html = await readFile(path.join(root, "index.html"), "utf8");
const client = await readFile(path.join(root, "app-api.js"));
const version = createHash("sha256").update(css).update(client).update(JSON.stringify(manifest)).digest("hex").slice(0, 16);
html = html.replace(/(styles\.css|app-api\.js)\?v=[^"]+/g, "$1?v=" + version);
html = html.replace("</head>", '  <link rel="preload" as="image" fetchpriority="high" href="' + manifest["assets/scenes/shelter.png"] + '">\n</head>');
await writeFile(path.join(output, "index.html"), html);
console.log("Versioned runtime styles, home preload and image manifest built.");
