import { mulberry32, type Rnd } from '../core/rng';
import { blob, ctx2d, inkLine, makeCanvas, softGlow } from '../paint/brush';

// 손그림 마음 얼굴: 시스템 이모지 대신 수채 물감 얼굴을 그려 써요 (기기마다 이모지 모양이 달라서)
export type FaceKind =
  | 'worried' | 'flat' | 'slight' | 'smile'                       // 마음 온도계
  | 'proud' | 'happy' | 'excited' | 'tired' | 'sad' | 'lonely' | 'angry' | 'soso' | 'skip'; // 나의 마음

const INK = '#5B3A29';
const SKIN: Partial<Record<FaceKind, string>> = { angry: '#F7AE8C', tired: '#F1DCA6', skip: '#EDE3D1', lonely: '#FFE29A', sad: '#FFE29A' };
type P = [number, number];

const arc = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 10): P[] =>
  Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * (i / n); return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] as P; });

function dotEye(g: CanvasRenderingContext2D, x: number, y: number, r = 6.6, shine = true) {
  g.fillStyle = INK; g.beginPath(); g.ellipse(x, y, r * 0.85, r, 0, 0, 7); g.fill();
  if (shine) { g.fillStyle = '#fff'; g.beginPath(); g.arc(x + r * 0.3, y - r * 0.35, r * 0.32, 0, 7); g.fill(); }
}
function bigEye(g: CanvasRenderingContext2D, x: number, y: number) {
  g.fillStyle = INK; g.beginPath(); g.ellipse(x, y, 8, 9.5, 0, 0, 7); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(x + 2.6, y - 3.4, 3.2, 0, 7); g.fill();
  g.beginPath(); g.arc(x - 2.4, y + 3, 1.6, 0, 7); g.fill();
}
function star(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  g.fillStyle = color; g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, k = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * k, y + Math.sin(a) * k); }
  g.closePath(); g.fill();
  g.strokeStyle = INK; g.lineWidth = 1.6; g.globalAlpha = 0.6; g.stroke(); g.globalAlpha = 1;
}
function drop(g: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  g.fillStyle = color; g.beginPath();
  g.moveTo(x, y - s * 1.4); g.quadraticCurveTo(x + s, y, x, y + s * 0.9); g.quadraticCurveTo(x - s, y, x, y - s * 1.4); g.fill();
  g.strokeStyle = '#4A7BB0'; g.lineWidth = 1.4; g.globalAlpha = 0.7; g.stroke(); g.globalAlpha = 1;
}
function openMouth(g: CanvasRenderingContext2D, rnd: Rnd, w: number, y: number, h: number) {
  g.fillStyle = '#9A3B33'; g.beginPath(); g.moveTo(64 - w, y); g.quadraticCurveTo(64, y + h * 2, 64 + w, y); g.closePath(); g.fill();
  g.save(); g.clip(); g.fillStyle = '#F07C82'; g.beginPath(); g.ellipse(64, y + h * 1.05, w * 0.55, h * 0.45, 0, 0, 7); g.fill(); g.restore();
  inkLine(g, [[64 - w, y], [64, y + 1], [64 + w, y]], INK, 3, rnd);
  inkLine(g, arc(64, y, w, h, 0, Math.PI, 12), INK, 3, rnd);
}

function paint(kind: FaceKind, size: number): HTMLCanvasElement {
  const S = 128, cv = makeCanvas(size, size), g = ctx2d(cv);
  g.scale(size / S, size / S);
  const rnd = mulberry32(kind.length * 97 + kind.charCodeAt(0));
  const skin = SKIN[kind] ?? '#FFD872';
  // 얼굴: 물감 덩어리 + 떨리는 테두리
  blob(g, 64, 66, 50, 48, skin, rnd, { layers: 6, alpha: 0.32, jitter: 1.6, edge: 0.5, edgeWidth: 2.2, wobble: 0.05 });
  inkLine(g, arc(64, 66, 51, 49, 0, Math.PI * 2, 40), INK, 4, rnd, 0.75);
  const cheeks = !['angry', 'skip', 'tired'].includes(kind);
  if (cheeks) { softGlow(g, 34, 80, 13, '#F28C96', 0.55); softGlow(g, 94, 80, 13, '#F28C96', 0.55); }
  const L = 46, R = 82, E = 60;
  const brow = (pts: P[]) => inkLine(g, pts, INK, 4.2, rnd);
  switch (kind) {
    case 'smile': case 'proud':
      inkLine(g, arc(L, E + 4, 8, 7, Math.PI * 1.1, Math.PI * 1.9), INK, 4.4, rnd);
      inkLine(g, arc(R, E + 4, 8, 7, Math.PI * 1.1, Math.PI * 1.9), INK, 4.4, rnd);
      inkLine(g, arc(64, 78, 16, 12, 0.15, Math.PI - 0.15), INK, 4.4, rnd);
      if (kind === 'proud') { star(g, 104, 30, 9, '#FFE07A'); star(g, 22, 34, 6, '#FFE07A'); }
      break;
    case 'slight': case 'soso':
      dotEye(g, L, E); dotEye(g, R, E);
      inkLine(g, arc(64, 80, 13, 6, 0.3, Math.PI - 0.3), INK, 4.2, rnd);
      break;
    case 'flat':
      dotEye(g, L, E); dotEye(g, R, E);
      inkLine(g, [[50, 86], [64, 85], [78, 86]], INK, 4.2, rnd);
      break;
    case 'happy':
      inkLine(g, arc(L, E + 4, 8, 7, Math.PI * 1.1, Math.PI * 1.9), INK, 4.4, rnd);
      inkLine(g, arc(R, E + 4, 8, 7, Math.PI * 1.1, Math.PI * 1.9), INK, 4.4, rnd);
      openMouth(g, rnd, 20, 76, 13);
      break;
    case 'excited':
      star(g, L, E, 11, '#FFB347'); star(g, R, E, 11, '#FFB347');
      openMouth(g, rnd, 18, 78, 12);
      star(g, 108, 26, 6, '#FFE07A');
      break;
    case 'tired':
      inkLine(g, [[L - 9, E + 2], [L, E + 5], [L + 9, E + 2]], INK, 4.2, rnd);
      inkLine(g, [[R - 9, E + 2], [R, E + 5], [R + 9, E + 2]], INK, 4.2, rnd);
      inkLine(g, [[50, 88], [56, 84], [64, 88], [72, 84], [78, 88]], INK, 4, rnd);
      drop(g, 102, 44, 7, '#BFE0FA');
      break;
    case 'worried':
      dotEye(g, L, E + 2); dotEye(g, R, E + 2);
      brow([[L - 9, E - 9], [L + 6, E - 14]]); brow([[R + 9, E - 9], [R - 6, E - 14]]);
      inkLine(g, [[50, 88], [57, 84], [64, 87], [71, 84], [78, 88]], INK, 4, rnd);
      break;
    case 'sad':
      dotEye(g, L, E + 2); dotEye(g, R, E + 2);
      brow([[L - 9, E - 8], [L + 6, E - 13]]); brow([[R + 9, E - 8], [R - 6, E - 13]]);
      inkLine(g, arc(64, 92, 12, 7, Math.PI * 1.15, Math.PI * 1.85), INK, 4.2, rnd);
      drop(g, L - 2, E + 18, 6, '#9CCBF2');
      break;
    case 'lonely':
      bigEye(g, L, E + 2); bigEye(g, R, E + 2);
      brow([[L - 9, E - 11], [L + 6, E - 15]]); brow([[R + 9, E - 11], [R - 6, E - 15]]);
      inkLine(g, arc(64, 90, 8, 4, Math.PI * 1.15, Math.PI * 1.85), INK, 4, rnd);
      break;
    case 'angry':
      dotEye(g, L, E + 4, 6, false); dotEye(g, R, E + 4, 6, false);
      brow([[L - 10, E - 10], [L + 7, E - 3]]); brow([[R + 10, E - 10], [R - 7, E - 3]]);
      inkLine(g, arc(64, 93, 13, 8, Math.PI * 1.15, Math.PI * 1.85), INK, 4.4, rnd);
      for (const [x, y] of [[18, 28], [110, 28]] as P[]) { g.fillStyle = '#FFE3D8'; g.strokeStyle = '#C9705A'; g.lineWidth = 1.8; for (const [dx, dy, r] of [[0, 0, 7], [x < 64 ? -6 : 6, -8, 5]]) { g.beginPath(); g.arc(x + dx, y + dy, r, 0, 7); g.fill(); g.stroke(); } }
      break;
    case 'skip': {
      dotEye(g, L, E); dotEye(g, R, E);
      inkLine(g, [[46, 84], [82, 84]], INK, 4.2, rnd);
      for (let x = 50; x <= 78; x += 6) inkLine(g, [[x, 79], [x, 89]], INK, 2, rnd);
      g.fillStyle = '#C9C2B6'; g.beginPath(); g.roundRect(82, 79, 9, 11, 3); g.fill();
      break;
    }
  }
  return cv;
}

const cache = new Map<string, string>();
export function faceSrc(kind: FaceKind, size = 96): string {
  const k = kind + size;
  let s = cache.get(k);
  if (!s) { s = paint(kind, size).toDataURL('image/png'); cache.set(k, s); }
  return s;
}
export function faceImg(kind: FaceKind, alt = '', cls = 'hface'): HTMLImageElement {
  const img = document.createElement('img');
  img.className = cls; img.src = faceSrc(kind); img.alt = alt; img.draggable = false;
  return img;
}
