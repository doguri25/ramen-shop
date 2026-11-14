// Canvas2D 수채 붓 도구
import { mulberry32, type Rnd } from '../core/rng';

export const makeCanvas = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
};
export const ctx2d = (c: HTMLCanvasElement) => c.getContext('2d', { willReadFrequently: false })!;

const hex = (c: string) => {
  const v = c.replace('#', '');
  const n = parseInt(v.length === 3 ? v.split('').map((x) => x + x).join('') : v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');
export const mix = (a: string, b: string, t: number) => {
  const A = hex(a), B = hex(b);
  return toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
};
export const darken = (c: string, k: number) => mix(c, '#3a2418', k);
export const lighten = (c: string, k: number) => mix(c, '#ffffff', k);
export const rgba = (c: string, a: number) => { const [r, g, b] = hex(c); return `rgba(${r},${g},${b},${a})`; };

// 울퉁불퉁한 물감 덩어리 경로
export function blobPath(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rnd: Rnd, wobble = 0.12, n = 18) {
  const ph = rnd() * 6.28, ph2 = rnd() * 6.28;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + wobble * (Math.sin(a * 3 + ph) * 0.6 + Math.sin(a * 5 + ph2) * 0.4) + (rnd() - 0.5) * wobble * 0.5;
    const px = x + Math.cos(a) * rx * k, py = y + Math.sin(a) * ry * k;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

// 같은 모양을 여러 번 옅게 겹쳐 칠하고, 가장자리를 진하게 남겨요
export function wash(ctx: CanvasRenderingContext2D, path: () => void, color: string, rnd: Rnd, o: { layers?: number; alpha?: number; jitter?: number; edge?: number; edgeWidth?: number } = {}) {
  const layers = o.layers ?? 5, alpha = o.alpha ?? 0.3, jitter = o.jitter ?? 2.5, edge = o.edge ?? 0.35;
  ctx.save();
  for (let i = 0; i < layers; i++) {
    ctx.save();
    ctx.translate((rnd() - 0.5) * jitter * 2, (rnd() - 0.5) * jitter * 2);
    path();
    ctx.globalAlpha = alpha * (0.7 + rnd() * 0.5);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }
  if (edge > 0) {
    path();
    ctx.globalAlpha = edge;
    ctx.strokeStyle = darken(color, 0.25);
    ctx.lineWidth = o.edgeWidth ?? 1.6;
    ctx.stroke();
  }
  ctx.restore();
}

export function blob(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string, rnd: Rnd, o: Parameters<typeof wash>[4] & { wobble?: number } = {}) {
  wash(ctx, () => blobPath(ctx, x, y, rx, ry, rnd, o.wobble ?? 0.1), color, rnd, o);
}

// 종이 위에 물감 알갱이가 가라앉은 느낌
export function granulate(ctx: CanvasRenderingContext2D, w: number, h: number, rnd: Rnd, color = '#5a3a28', count = 1500, alpha = 0.06) {
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    ctx.globalAlpha = alpha * rnd();
    const r = 0.4 + rnd() * 1.4;
    ctx.beginPath();
    ctx.arc(rnd() * w, rnd() * h, r, 0, 6.28);
    ctx.fill();
  }
  ctx.restore();
}

// 연필 같은 떨리는 선
export function inkLine(ctx: CanvasRenderingContext2D, pts: [number, number][], color: string, width: number, rnd: Rnd, alpha = 0.85) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let pass = 0; pass < 2; pass++) {
    ctx.globalAlpha = alpha * (pass ? 0.45 : 1);
    ctx.lineWidth = width * (pass ? 0.6 : 1);
    ctx.beginPath();
    pts.forEach(([x, y], i) => {
      const jx = (rnd() - 0.5) * width * 0.4, jy = (rnd() - 0.5) * width * 0.4;
      if (i === 0) ctx.moveTo(x + jx, y + jy); else ctx.lineTo(x + jx, y + jy);
    });
    ctx.stroke();
  }
  ctx.restore();
}

export function softGlow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, a = 0.5) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, a));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

export const seeded = (s: number) => mulberry32(s);
