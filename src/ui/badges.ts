import { BADGE_CAT, type Badge } from '../data/badges';
import { mulberry32 } from '../core/rng';
import { blob, ctx2d, darken, inkLine, makeCanvas, wash } from '../paint/brush';
import { doodleCanvas, type DoodleKind } from './doodles';

// 마음 배지 그림: 리본 달린 동그란 메달 가운데 손그림. 아직 못 받은 배지는 CSS로 흐리게 보여요
const cache = new Map<string, string>();
export function badgeSrc(b: Badge, size = 128): string {
  const key = b.id + size;
  const hit = cache.get(key);
  if (hit) return hit;
  const S = 128, cv = makeCanvas(size, size), g = ctx2d(cv);
  g.scale(size / S, size / S);
  const c = BADGE_CAT[b.cat], rnd = mulberry32(b.id.length * 977 + b.id.charCodeAt(2));
  // 리본 두 갈래
  for (const s of [-1, 1]) {
    wash(g, () => { g.beginPath(); g.moveTo(64 + s * 6, 70); g.lineTo(64 + s * 30, 124); g.lineTo(64 + s * 18, 116); g.lineTo(64 + s * 12, 126); g.lineTo(64 + s * -6, 76); g.closePath(); }, darken(c.color, 0.12), rnd, { layers: 4, alpha: 0.6, edge: 0.5, edgeWidth: 2 });
  }
  // 메달
  wash(g, () => { g.beginPath(); g.arc(64, 54, 46, 0, Math.PI * 2); }, c.color, rnd, { layers: 5, alpha: 0.7, edge: 0.6, edgeWidth: 2.6 });
  blob(g, 64, 54, 37, 37, c.soft, rnd, { layers: 4, alpha: 0.9, edge: 0.3 });
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; blob(g, 64 + Math.cos(a) * 42, 54 + Math.sin(a) * 42, 2.2, 2.2, '#FFFFFF', rnd, { layers: 2, alpha: 0.7, edge: 0.1 }); }
  inkLine(g, Array.from({ length: 25 }, (_, i) => { const a = (i / 24) * Math.PI * 2; return [64 + Math.cos(a) * 46, 54 + Math.sin(a) * 46] as [number, number]; }), darken(c.color, 0.35), 2.4, rnd, 0.6);
  g.drawImage(doodleCanvas(b.icon as DoodleKind, 96), 64 - 30, 54 - 30, 60, 60);
  const src = cv.toDataURL('image/png');
  cache.set(key, src);
  return src;
}
export function badgeImg(b: Badge, cls = 'badge-img'): HTMLImageElement {
  const img = document.createElement('img');
  img.className = cls; img.src = badgeSrc(b); img.alt = ''; img.draggable = false;
  return img;
}
