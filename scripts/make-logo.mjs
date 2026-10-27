import { Jimp } from 'jimp';
import fs from 'node:fs';

const SRC = 'C:/Users/Hp/.verdent/storage/profiles/prod-s1/workspaces/crea-una-aplicacion-que--proj_432ac0bc9d5da280/shared/blobs/sha256/71/9d/719d23f16d18f889f84b636715f3eca7b3b29a57f0a993a6da27c5830d30b2ec';
const OUT = 'public/logo.png';

const img = await Jimp.read(SRC);
const { width, height } = img.bitmap;
const data = img.bitmap.data;

for (let i = 0; i < data.length; i += 4) {
  const r = data[i], g = data[i + 1], b = data[i + 2];
  const min = Math.min(r, g, b);
  const max = Math.max(r, g, b);
  const sat = max - min;
  // blanco o casi blanco -> transparente con borde suavizado
  if (min > 243 && sat < 10) {
    data[i + 3] = 0;
  } else if (min > 222 && sat < 14) {
    const t = (243 - min) / 21;
    data[i + 3] = Math.round(Math.max(0, Math.min(255, t * 255)));
  }
}

// bounding box de pixeles visibles
let minX = width, minY = height, maxX = -1, maxY = -1;
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] > 20) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}
if (maxX < 0) throw new Error('imagen quedó vacía');

const pad = 12;
minX = Math.max(0, minX - pad);
minY = Math.max(0, minY - pad);
maxX = Math.min(width - 1, maxX + pad);
maxY = Math.min(height - 1, maxY + pad);

img.crop({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 });
await img.write(OUT);
console.log('OK', img.bitmap.width, 'x', img.bitmap.height, '->', OUT);
