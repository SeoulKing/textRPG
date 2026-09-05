import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

const filePath = new URL(
  "../assets/scenes/cooking/survivor-cooking-cycle-v2.png",
  import.meta.url,
);
const png = readFileSync(filePath);
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

if (!png.subarray(0, 8).equals(signature)) {
  throw new Error("Cooking sprite sheet is not a valid PNG.");
}

let offset = 8;
let header = null;
const imageData = [];
while (offset < png.length) {
  const length = png.readUInt32BE(offset);
  const type = png.toString("ascii", offset + 4, offset + 8);
  const data = png.subarray(offset + 8, offset + 8 + length);
  offset += length + 12;

  if (type === "IHDR") {
    header = {
      width: data.readUInt32BE(0),
      height: data.readUInt32BE(4),
      bitDepth: data[8],
      colorType: data[9],
      interlace: data[12],
    };
  } else if (type === "IDAT") {
    imageData.push(data);
  } else if (type === "IEND") {
    break;
  }
}

if (!header) {
  throw new Error("Cooking sprite sheet has no IHDR chunk.");
}
if (
  header.width !== 1152 ||
  header.height !== 128 ||
  header.bitDepth !== 8 ||
  header.colorType !== 6 ||
  header.interlace !== 0
) {
  throw new Error(`Unexpected cooking sprite format: ${JSON.stringify(header)}`);
}

const bytesPerPixel = 4;
const stride = header.width * bytesPerPixel;
const filtered = inflateSync(Buffer.concat(imageData));
const pixels = Buffer.alloc(stride * header.height);

function paeth(left, up, upperLeft) {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const diagonalDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= diagonalDistance) return left;
  if (upDistance <= diagonalDistance) return up;
  return upperLeft;
}

let sourceOffset = 0;
for (let y = 0; y < header.height; y += 1) {
  const filter = filtered[sourceOffset];
  sourceOffset += 1;
  const rowOffset = y * stride;
  for (let x = 0; x < stride; x += 1) {
    const raw = filtered[sourceOffset + x];
    const left = x >= bytesPerPixel ? pixels[rowOffset + x - bytesPerPixel] : 0;
    const up = y > 0 ? pixels[rowOffset - stride + x] : 0;
    const upperLeft = y > 0 && x >= bytesPerPixel
      ? pixels[rowOffset - stride + x - bytesPerPixel]
      : 0;
    let value = raw;
    if (filter === 1) value = raw + left;
    else if (filter === 2) value = raw + up;
    else if (filter === 3) value = raw + Math.floor((left + up) / 2);
    else if (filter === 4) value = raw + paeth(left, up, upperLeft);
    else if (filter !== 0) throw new Error(`Unsupported PNG filter: ${filter}`);
    pixels[rowOffset + x] = value & 255;
  }
  sourceOffset += stride;
}

const frameWidth = 96;
const frameCount = 12;
const frames = [];
for (let frame = 0; frame < frameCount; frame += 1) {
  let minX = frameWidth;
  let minY = header.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < header.height; y += 1) {
    for (let x = 0; x < frameWidth; x += 1) {
      const globalX = frame * frameWidth + x;
      const alpha = pixels[(y * header.width + globalX) * bytesPerPixel + 3];
      if (alpha <= 8) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < 0) {
    throw new Error(`Cooking sprite frame ${frame} is empty.`);
  }
  const bounds = {
    frame,
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    baseline: maxY + 1,
  };
  if (
    bounds.baseline !== 124 ||
    bounds.height < 119 ||
    bounds.height > 121 ||
    bounds.y + bounds.height !== 124
  ) {
    throw new Error(`Cooking sprite frame ${frame} is misaligned: ${JSON.stringify(bounds)}`);
  }
  if (bounds.width > 88 || bounds.x < 4 || bounds.x + bounds.width > 92) {
    throw new Error(`Cooking sprite frame ${frame} exceeds safe padding: ${JSON.stringify(bounds)}`);
  }
  frames.push(bounds);
}

const silhouetteHeights = frames.map((frame) => frame.height);
if (Math.max(...silhouetteHeights) - Math.min(...silhouetteHeights) > 1) {
  throw new Error(`Cooking sprite silhouette heights vary: ${silhouetteHeights.join(", ")}`);
}

console.log(
  `cooking sprites ok: ${frameCount} frames, 96x128 cells, baseline 124, ` +
  `silhouette ${Math.min(...silhouetteHeights)}-${Math.max(...silhouetteHeights)}px`,
);
