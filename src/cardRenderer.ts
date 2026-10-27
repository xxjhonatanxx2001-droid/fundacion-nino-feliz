export interface CardDesign {
  style: string;
  palette: string[];
  subtitle?: string;
}

import logoUrl from './assets/logo.png';

let logoImg: HTMLImageElement | null = null;
let logoPromise: Promise<HTMLImageElement | null> | null = null;

export function loadLogo(): Promise<HTMLImageElement | null> {
  if (logoImg) return Promise.resolve(logoImg);
  if (logoPromise) return logoPromise;
  logoPromise = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      logoImg = img;
      resolve(img);
    };
    img.onerror = () => resolve(null);
    img.src = logoUrl;
  });
  return logoPromise;
}

const STYLES = ['festivo', 'infantil', 'elegante', 'floral', 'clasico'];

function parseHex(hex: string) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgba(hex: string, alpha: number) {
  const { r, g, b } = parseHex(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

function shade(hex: string, f: number) {
  const { r, g, b } = parseHex(hex);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function fontFamily(style: string, weight: number, size: number) {
  const family =
    style === 'elegante' || style === 'floral'
      ? 'Georgia, "Times New Roman", serif'
      : style === 'infantil'
        ? '"Comic Sans MS", "Segoe UI", sans-serif'
        : '"Segoe UI", Arial, sans-serif';
  return `${weight} ${size}px ${family}`;
}

function drawFlower(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  for (let i = 0; i < 5; i++) {
    const a = (i * Math.PI * 2) / 5;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * s, y + Math.sin(a) * s, s * 0.75, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(x, y, s * 0.55, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
}

export async function drawCard(canvas: HTMLCanvasElement, rawBody: string, design: CardDesign, size = 1080) {
  const W = size;
  const H = size;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const logo = await loadLogo();

  const style = STYLES.includes(design.style) ? design.style : 'festivo';
  const palette = design.palette && design.palette.length >= 3 ? design.palette : ['#FF8A3D', '#FFD23F', '#2E86AB'];
  const [c1, c2, c3] = palette;
  const rand = mulberry32(style.length * 7919 + palette.join('').length * 31);
  const s = W / 1080;

  const bodyText = rawBody.split('{{nombre}}').join('amigo(a)').replace(/ ,/g, ',');
  const M = W * 0.07;

  // ---------- fondo y decoración ----------
  if (style === 'festivo') {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 80; i++) {
      const x = rand() * W;
      const y = rand() * H;
      const r = (4 + rand() * 10) * s;
      ctx.globalAlpha = 0.45 + rand() * 0.4;
      ctx.fillStyle = [c3, '#ffffff', shade(c2, 1.15)][Math.floor(rand() * 3)];
      if (rand() < 0.5) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rand() * Math.PI);
        ctx.fillRect(-r, -r * 0.4, r * 2, r * 0.8);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  } else if (style === 'infantil') {
    ctx.fillStyle = rgba(c3, 0.28);
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 42; i++) {
      ctx.globalAlpha = 0.14 + rand() * 0.12;
      ctx.fillStyle = rand() < 0.5 ? c1 : c2;
      ctx.beginPath();
      ctx.arc(rand() * W, rand() * H, (18 + rand() * 38) * s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else if (style === 'elegante') {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, shade(c1, 0.72));
    g.addColorStop(1, c1);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = c2;
    ctx.lineWidth = 5 * s;
    ctx.strokeRect(W * 0.035, W * 0.035, W * 0.93, W * 0.93);
    ctx.lineWidth = 1.8 * s;
    ctx.strokeRect(W * 0.05, W * 0.05, W * 0.9, W * 0.9);
    ctx.fillStyle = c2;
    for (const [x, y] of [[W * 0.035, W * 0.035], [W * 0.965, W * 0.035], [W * 0.035, W * 0.965], [W * 0.965, W * 0.965]]) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-9 * s, -9 * s, 18 * s, 18 * s);
      ctx.restore();
    }
  } else if (style === 'floral') {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, rgba(c2, 0.35));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const spots: [number, number][] = [
      [M, M], [W - M, M], [M, H - M], [W - M, H - M], [W / 2, H * 0.07], [W / 2, H * 0.93],
    ];
    spots.forEach(([x, y], i) => drawFlower(ctx, x, y, W * 0.042, [c1, c2, c3][i % 3]));
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = c1;
    ctx.fillRect(0, 0, W, H * 0.035);
    ctx.fillStyle = c3;
    ctx.fillRect(0, H * 0.035, W, H * 0.008);
    ctx.fillStyle = c1;
    ctx.fillRect(0, H * 0.957, W, H * 0.043);
    ctx.fillStyle = c3;
    ctx.fillRect(0, H * 0.949, W, H * 0.008);
  }

  // ---------- panel ----------
  const hasPanel = style === 'festivo' || style === 'infantil' || style === 'floral';
  if (hasPanel) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.18)';
    ctx.shadowBlur = 26 * s;
    ctx.shadowOffsetY = 8 * s;
    ctx.fillStyle = 'rgba(255,255,255,0.97)';
    roundRect(ctx, M, M, W - M * 2, H - M * 2, W * 0.05);
    ctx.fill();
    ctx.restore();
  }

  const dark = style === 'elegante';

  // ---------- marca de agua del logo (fondo) ----------
  if (logo) {
    const lw = W * 0.68;
    const lh = lw * (logo.height / logo.width);
    ctx.save();
    ctx.globalAlpha = dark ? 0.18 : 0.14;
    ctx.drawImage(logo, (W - lw) / 2, (H - lh) / 2, lw, lh);
    ctx.restore();
  }
  const pad = hasPanel ? M * 1.7 : M * 1.5;
  const textX = style === 'elegante' ? W * 0.12 : pad;
  const textMaxW = style === 'elegante' ? W * 0.76 : W - pad * 2;
  const alignCenter = style === 'elegante';

  const headColor = dark ? c2 : style === 'clasico' ? shade(c1, 0.85) : shade(c1, 0.9);
  const bodyColor = dark ? '#f3ecdc' : '#3a3a3a';

  // ---------- dividir encabezado ----------
  const paras: string[] = bodyText.split('\n').filter((l: string, i: number, arr: string[]) => l.trim() !== '' || (i > 0 && arr[i - 1].trim() !== ''));
  let heading = '';
  let restParas = paras;
  if (paras.length > 0 && paras[0].trim().length <= 48) {
    heading = paras[0].trim();
    restParas = paras.slice(1);
  }

  const footerH = W * 0.085;
  const topY = hasPanel ? M * 1.35 : W * 0.1;
  const bottomY = H - (hasPanel ? M * 1.1 : M * 0.9) - footerH;

  // ---------- medir ----------
  let headSize = W * (style === 'elegante' ? 0.052 : 0.058);
  let headLines: string[] = [];
  if (heading) {
    do {
      ctx.font = fontFamily(style, 800, headSize);
      headLines = wrapText(ctx, heading, textMaxW * (alignCenter ? 1 : 0.95));
      headSize -= W * 0.004;
    } while (headLines.length > 2 && headSize > W * 0.034);
  }

  let bodySize = W * 0.037;
  let blocks: string[][] = [];
  const measureBody = (bs: number): string[][] => {
    ctx.font = fontFamily(style, 400, bs);
    return restParas.map((p: string) => (p.trim() === '' ? [] : wrapText(ctx, p.trim(), textMaxW)));
  };
  do {
    blocks = measureBody(bodySize);
    const lineH = bodySize * 1.42;
    const gap = bodySize * 0.55;
    const headH = heading ? headLines.length * headSize * 1.25 + bodySize * 0.9 : 0;
    const total = headH + blocks.reduce((acc, b) => acc + b.length * lineH + gap, 0);
    if (total <= bottomY - topY) break;
    bodySize -= W * 0.002;
  } while (bodySize > W * 0.023);

  // ---------- dibujar ----------
  ctx.textBaseline = 'top';
  let y = topY;

  if (heading) {
    ctx.font = fontFamily(style, 800, headSize);
    ctx.fillStyle = headColor;
    ctx.textAlign = alignCenter ? 'center' : 'left';
    const hx = alignCenter ? W / 2 : textX;
    for (const line of headLines) {
      ctx.fillText(line, hx, y);
      y += headSize * 1.25;
    }
    y += bodySize * 0.9;
    if (style === 'elegante' || style === 'clasico') {
      ctx.strokeStyle = style === 'elegante' ? rgba(c2, 0.8) : rgba(c3, 0.9);
      ctx.lineWidth = 2.5 * s;
      const lx = alignCenter ? W * 0.32 : textX;
      const lw = alignCenter ? W * 0.36 : textMaxW * 0.4;
      ctx.beginPath();
      ctx.moveTo(lx, y);
      ctx.lineTo(lx + lw, y);
      ctx.stroke();
      y += bodySize * 0.7;
    }
  }

  ctx.font = fontFamily(style, 400, bodySize);
  ctx.fillStyle = bodyColor;
  ctx.textAlign = alignCenter ? 'center' : 'left';
  const bx = alignCenter ? W / 2 : textX;
  const lineH = bodySize * 1.42;
  for (const block of blocks) {
    for (const line of block) {
      ctx.fillText(line, bx, y);
      y += lineH;
    }
    y += bodySize * 0.55;
  }

  // ---------- pie ----------
  ctx.font = fontFamily(style, 700, W * 0.028);
  ctx.fillStyle = dark ? rgba(c2, 0.95) : style === 'clasico' ? c3 : rgba(shade(c1, 0.85), 0.95);
  ctx.textAlign = 'center';
  const footText = 'Fundación Niño Feliz 💛';
  const footSize = W * 0.05;
  if (logo) {
    const tw = ctx.measureText(footText).width;
    const gap2 = 12 * s;
    const logoW = footSize * (logo.width / logo.height);
    const totalW = logoW + gap2 + tw;
    const startX = W / 2 - totalW / 2;
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.drawImage(logo, startX, H - footerH * 0.62 + (W * 0.028 - footSize) / 2, logoW, footSize);
    ctx.restore();
    ctx.fillText(footText, startX + logoW + gap2 + tw / 2, H - footerH * 0.62);
  } else {
    ctx.fillText(footText, W / 2, H - footerH * 0.62);
  }
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png'): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo generar la imagen'))), type);
  });
}

export async function renderToDataUrl(body: string, design: CardDesign, size = 540): Promise<string> {
  const c = document.createElement('canvas');
  await drawCard(c, body, design, size);
  return c.toDataURL('image/png');
}
