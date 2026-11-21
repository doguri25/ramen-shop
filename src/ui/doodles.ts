import { mulberry32, type Rnd } from '../core/rng';
import { blob, ctx2d, darken, inkLine, makeCanvas, softGlow, wash } from '../paint/brush';

// 손그림 작은 그림: 시스템 이모지 대신 수채 물감으로 그려 써요 (마음 골목 단추, 주민 머리 위 표시, 심부름 물건)
export type DoodleKind =
  | 'village' | 'map' | 'walk' | 'news' | 'stamp' | 'talk' | 'bang' | 'worry' | 'heart' | 'me'
  | 'bread' | 'flower' | 'letter' | 'book' | 'icecream' | 'tea' | 'fruit' | 'music'
  | 'notebook' | 'party' | 'chain' | 'group' | 'shopsit';

const INK = '#5B3A29';
type P = [number, number];

function poly(g: CanvasRenderingContext2D, pts: P[], color: string, rnd: Rnd, edge = 0.5) {
  wash(g, () => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); }, color, rnd, { layers: 4, alpha: 0.38, jitter: 1.2, edge, edgeWidth: 2 });
}
const ring = (pts: P[]): P[] => [...pts, pts[0]];
const arc = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 14): P[] =>
  Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * (i / n); return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] as P; });

function house(g: CanvasRenderingContext2D, rnd: Rnd, x: number, y: number, w: number, hgt: number, wall: string, roof: string, lit: boolean) {
  poly(g, [[x, y], [x + w, y], [x + w, y - hgt], [x, y - hgt]], wall, rnd);
  poly(g, [[x - w * 0.14, y - hgt + 2], [x + w / 2, y - hgt - w * 0.62], [x + w * 1.14, y - hgt + 2]], roof, rnd, 0.6);
  inkLine(g, ring([[x, y], [x + w, y], [x + w, y - hgt], [x, y - hgt]]), INK, 2.6, rnd, 0.7);
  inkLine(g, [[x - w * 0.14, y - hgt + 2], [x + w / 2, y - hgt - w * 0.62], [x + w * 1.14, y - hgt + 2]], INK, 2.8, rnd, 0.75);
  const dw = w * 0.26;
  poly(g, [[x + w * 0.2, y], [x + w * 0.2 + dw, y], [x + w * 0.2 + dw, y - hgt * 0.55], [x + w * 0.2, y - hgt * 0.55]], '#B9835A', rnd, 0.4);
  if (lit) softGlow(g, x + w * 0.72, y - hgt * 0.55, w * 0.32, '#FFD873', 0.7);
  poly(g, [[x + w * 0.58, y - hgt * 0.4], [x + w * 0.86, y - hgt * 0.4], [x + w * 0.86, y - hgt * 0.68], [x + w * 0.58, y - hgt * 0.68]], lit ? '#FFE07A' : '#9DB4C8', rnd, 0.5);
}

function paint(kind: DoodleKind, size: number): HTMLCanvasElement {
  const S = 128, cv = makeCanvas(size, size), g = ctx2d(cv);
  g.scale(size / S, size / S);
  const rnd = mulberry32(kind.length * 131 + kind.charCodeAt(0) * 7 + kind.charCodeAt(kind.length - 1));
  switch (kind) {
    case 'village': {
      blob(g, 64, 104, 58, 14, '#CFE4A2', rnd, { layers: 4, alpha: 0.4, edge: 0 });
      inkLine(g, [[50, 118], [58, 106], [70, 100], [84, 96]], '#E2CFA6', 7, rnd, 0.9);
      house(g, rnd, 14, 102, 40, 34, '#FFF4E6', '#E8823C', true);
      house(g, rnd, 66, 94, 34, 28, '#F3F6E6', '#5BAE8C', true);
      blob(g, 112, 74, 11, 13, '#8FBF6A', rnd, { layers: 4, alpha: 0.45, edge: 0.4 });
      inkLine(g, [[112, 86], [112, 100]], '#8A5E3C', 3, rnd);
      break;
    }
    case 'map': {
      const F: P[] = [[14, 30], [48, 20], [80, 30], [114, 20], [114, 100], [80, 110], [48, 100], [14, 110]];
      poly(g, F, '#FFF1D2', rnd, 0.6);
      poly(g, [[48, 20], [80, 30], [80, 110], [48, 100]], '#F6E2B8', rnd, 0);
      inkLine(g, ring(F), INK, 2.6, rnd, 0.7);
      inkLine(g, [[48, 20], [48, 100]], INK, 2, rnd, 0.5); inkLine(g, [[80, 30], [80, 110]], INK, 2, rnd, 0.5);
      for (let i = 0; i < 6; i++) { const t = i / 5; g.fillStyle = '#E3645A'; g.beginPath(); g.arc(26 + t * 62, 88 - Math.sin(t * 3) * 26, 2.6, 0, 7); g.fill(); }
      blob(g, 96, 52, 11, 11, '#E3645A', rnd, { layers: 4, alpha: 0.5, edge: 0.5 });
      g.fillStyle = '#fff'; g.beginPath(); g.arc(96, 51, 4, 0, 7); g.fill();
      blob(g, 30, 50, 9, 7, '#9CC77A', rnd, { layers: 3, alpha: 0.5, edge: 0 });
      break;
    }
    case 'walk': {
      const foot = (x: number, y: number, a: number) => {
        g.save(); g.translate(x, y); g.rotate(a);
        blob(g, 0, 8, 13, 19, '#E8823C', rnd, { layers: 4, alpha: 0.42, edge: 0.6, wobble: 0.06 });
        for (let i = 0; i < 4; i++) blob(g, -9 + i * 6, -17 + Math.abs(i - 1.5) * 2.5, 3.6, 4.2, '#E8823C', rnd, { layers: 3, alpha: 0.5, edge: 0.4 });
        g.restore();
      };
      foot(44, 84, -0.25); foot(84, 46, 0.2);
      break;
    }
    case 'news': {
      poly(g, [[18, 38], [110, 38], [110, 98], [18, 98]], '#FFF8EC', rnd, 0.5);
      poly(g, [[18, 38], [64, 74], [110, 38]], '#F4E1C4', rnd, 0.4);
      inkLine(g, ring([[18, 38], [110, 38], [110, 98], [18, 98]]), INK, 3, rnd, 0.75);
      inkLine(g, [[18, 38], [64, 74], [110, 38]], INK, 2.8, rnd, 0.7);
      blob(g, 64, 78, 9, 9, '#E3645A', rnd, { layers: 4, alpha: 0.55, edge: 0.5 });
      break;
    }
    case 'stamp': {
      blob(g, 64, 64, 48, 48, '#F2A7A0', rnd, { layers: 3, alpha: 0.25, edge: 0 });
      inkLine(g, arc(64, 64, 46, 46, 0, Math.PI * 2, 36), '#D9483B', 5, rnd, 0.85);
      inkLine(g, arc(64, 64, 37, 37, 0, Math.PI * 2, 32), '#D9483B', 2.4, rnd, 0.7);
      heartShape(g, rnd, 64, 66, 22, '#D9483B');
      break;
    }
    case 'heart': heartShape(g, rnd, 64, 70, 46, '#F07C95'); softGlow(g, 50, 52, 12, '#FFFFFF', 0.6); break;
    case 'talk': case 'bang': case 'worry': {
      const col = kind === 'bang' ? '#FFE07A' : kind === 'worry' ? '#D7E6F5' : '#FFFFFF';
      if (kind === 'worry') { for (const [x, y, r] of [[40, 56, 30], [70, 46, 34], [92, 62, 26], [60, 70, 30]] as const) blob(g, x, y, r, r * 0.85, col, rnd, { layers: 4, alpha: 0.5, edge: 0.45, edgeWidth: 2.4 }); }
      else blob(g, 64, 56, 50, 40, col, rnd, { layers: 5, alpha: 0.5, edge: 0.55, edgeWidth: 2.6, wobble: 0.05 });
      poly(g, [[44, 86], [36, 112], [64, 90]], col, rnd, 0.5);
      if (kind === 'bang') {
        inkLine(g, [[64, 30], [64, 64]], '#C2560E', 10, rnd, 0.95);
        g.fillStyle = '#C2560E'; g.beginPath(); g.arc(64, 80, 6, 0, 7); g.fill();
      } else for (const x of [44, 64, 84]) { g.fillStyle = kind === 'worry' ? '#5B7FA8' : INK; g.beginPath(); g.arc(x, 58, 6.2, 0, 7); g.fill(); }
      break;
    }
    case 'me': {
      g.save();
      wash(g, () => { g.beginPath(); g.moveTo(64, 120); g.bezierCurveTo(30, 80, 22, 60, 26, 44); g.arc(64, 46, 38, Math.PI * 1.03, Math.PI * 1.97); g.bezierCurveTo(106, 60, 98, 80, 64, 120); g.closePath(); }, '#E8823C', rnd, { layers: 5, alpha: 0.5, edge: 0.7, edgeWidth: 3 });
      g.restore();
      blob(g, 64, 46, 20, 20, '#FFF8EC', rnd, { layers: 4, alpha: 0.7, edge: 0.3 });
      g.fillStyle = '#C2560E'; g.font = 'bold 22px Jua, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('나', 64, 48);
      break;
    }
    case 'bread': {
      blob(g, 64, 70, 48, 32, '#D9A066', rnd, { layers: 5, alpha: 0.5, edge: 0.6, edgeWidth: 2.4 });
      blob(g, 58, 62, 34, 18, '#F0C58A', rnd, { layers: 3, alpha: 0.35, edge: 0 });
      for (const x of [40, 60, 80]) inkLine(g, [[x - 6, 52], [x + 6, 80]], '#9A5F32', 3.2, rnd, 0.7);
      break;
    }
    case 'flower': {
      inkLine(g, [[64, 70], [62, 96], [64, 118]], '#47AE7A', 5, rnd);
      blob(g, 48, 100, 14, 7, '#7FC08F', rnd, { layers: 3, alpha: 0.5, edge: 0.4 });
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 - Math.PI / 2; blob(g, 64 + Math.cos(a) * 22, 50 + Math.sin(a) * 22, 15, 15, '#F7A7BA', rnd, { layers: 4, alpha: 0.45, edge: 0.5 }); }
      blob(g, 64, 50, 12, 12, '#FFD873', rnd, { layers: 4, alpha: 0.6, edge: 0.5 });
      break;
    }
    case 'letter': {
      poly(g, [[20, 36], [108, 36], [108, 96], [20, 96]], '#E9F3FB', rnd, 0.5);
      inkLine(g, ring([[20, 36], [108, 36], [108, 96], [20, 96]]), '#4A7BB0', 3, rnd, 0.7);
      inkLine(g, [[20, 36], [64, 70], [108, 36]], '#4A7BB0', 2.8, rnd, 0.7);
      heartShape(g, rnd, 64, 74, 13, '#F07C95');
      break;
    }
    case 'book': {
      poly(g, [[16, 34], [64, 44], [64, 108], [16, 98]], '#C9B6F0', rnd, 0.6);
      poly(g, [[112, 34], [64, 44], [64, 108], [112, 98]], '#B39AE6', rnd, 0.6);
      inkLine(g, [[16, 34], [64, 44], [112, 34]], INK, 2.6, rnd, 0.7); inkLine(g, [[64, 44], [64, 108]], INK, 2.6, rnd, 0.7);
      for (const y of [58, 70, 82]) { inkLine(g, [[26, y - 8], [54, y - 2]], '#FFFFFF', 3, rnd, 0.8); inkLine(g, [[74, y - 2], [102, y - 8]], '#FFFFFF', 3, rnd, 0.8); }
      break;
    }
    case 'icecream': {
      poly(g, [[40, 62], [88, 62], [64, 120]], '#E3B37A', rnd, 0.6);
      for (let i = 0; i < 3; i++) inkLine(g, [[46 + i * 10, 64], [62 + i * 4, 104]], '#B98450', 2, rnd, 0.6);
      blob(g, 64, 52, 28, 22, '#F7B3C2', rnd, { layers: 5, alpha: 0.5, edge: 0.5 });
      blob(g, 64, 30, 20, 16, '#FFF4D6', rnd, { layers: 5, alpha: 0.6, edge: 0.5 });
      g.fillStyle = '#E3645A'; g.beginPath(); g.arc(68, 16, 5, 0, 7); g.fill();
      break;
    }
    case 'tea': {
      // 김이 나는 찻잔과 받침
      blob(g, 64, 106, 46, 10, '#E9D6C0', rnd, { layers: 4, alpha: 0.5, edge: 0.5 });
      wash(g, () => { g.beginPath(); g.moveTo(26, 56); g.lineTo(102, 56); g.bezierCurveTo(100, 96, 84, 104, 64, 104); g.bezierCurveTo(44, 104, 28, 96, 26, 56); g.closePath(); }, '#9FD8B8', rnd, { layers: 5, alpha: 0.5, edge: 0.6, edgeWidth: 2.4 });
      blob(g, 64, 58, 36, 7, '#C49A5A', rnd, { layers: 3, alpha: 0.6, edge: 0.3 });
      inkLine(g, arc(106, 74, 12, 12, -Math.PI / 2, Math.PI / 2, 10), INK, 3, rnd, 0.7);
      for (const x of [50, 66, 82]) inkLine(g, [[x, 46], [x - 5, 36], [x + 3, 26], [x - 2, 16]], '#B9B4AE', 3, rnd, 0.6);
      break;
    }
    case 'fruit': {
      // 바구니에 담긴 사과·귤·포도
      blob(g, 46, 56, 18, 18, '#E5484D', rnd, { layers: 5, alpha: 0.5, edge: 0.5 });
      blob(g, 80, 54, 17, 17, '#F6A23C', rnd, { layers: 5, alpha: 0.5, edge: 0.5 });
      for (const [x, y] of [[62, 42], [70, 48], [56, 50], [64, 56]] as const) blob(g, x, y, 7, 7, '#8E6FC2', rnd, { layers: 3, alpha: 0.55, edge: 0.4 });
      inkLine(g, [[46, 40], [48, 30]], '#6E4A30', 3, rnd);
      blob(g, 54, 30, 7, 4, '#47AE7A', rnd, { layers: 3, alpha: 0.5, edge: 0.3 });
      poly(g, [[18, 66], [110, 66], [96, 110], [32, 110]], '#D9A066', rnd, 0.6);
      for (const y of [78, 92]) inkLine(g, [[22, y], [106, y]], '#9A5F32', 2.4, rnd, 0.6);
      inkLine(g, ring([[18, 66], [110, 66], [96, 110], [32, 110]]), INK, 2.6, rnd, 0.7);
      break;
    }
    case 'music': {
      // 작은 북과 음표
      wash(g, () => { g.beginPath(); g.ellipse(56, 84, 36, 12, 0, 0, Math.PI * 2); g.rect(20, 60, 72, 24); g.ellipse(56, 60, 36, 12, 0, 0, Math.PI * 2); }, '#E3645A', rnd, { layers: 4, alpha: 0.45, edge: 0.5, edgeWidth: 2.4 });
      blob(g, 56, 60, 34, 10, '#FFF4E6', rnd, { layers: 4, alpha: 0.7, edge: 0.4 });
      for (let i = 0; i < 4; i++) inkLine(g, [[26 + i * 20, 66], [36 + i * 20, 90]], '#F6CF3E', 2.6, rnd, 0.8);
      inkLine(g, [[98, 22], [98, 52]], INK, 3.4, rnd); inkLine(g, [[98, 22], [116, 28]], INK, 3.4, rnd);
      blob(g, 92, 54, 8, 6, INK, rnd, { layers: 3, alpha: 0.7, edge: 0.2 });
      break;
    }
    case 'notebook': {
      poly(g, [[28, 18], [104, 18], [104, 112], [28, 112]], '#FFE9A8', rnd, 0.6);
      poly(g, [[28, 18], [42, 18], [42, 112], [28, 112]], '#E8823C', rnd, 0.5);
      inkLine(g, ring([[28, 18], [104, 18], [104, 112], [28, 112]]), INK, 2.8, rnd, 0.7);
      for (const y of [44, 62, 80]) inkLine(g, [[52, y], [94, y]], '#C9A36E', 2.4, rnd, 0.6);
      heartShape(g, rnd, 84, 92, 9, '#E3645A');
      break;
    }
    case 'party': {
      // 깃발 줄과 색종이
      inkLine(g, [[10, 30], [40, 44], [64, 48], [88, 44], [118, 30]], INK, 2.4, rnd, 0.6);
      const flags = ['#E3645A', '#F6CF3E', '#47AE7A', '#6FB3E0', '#A68BD6'];
      [[22, 36], [44, 45], [64, 48], [84, 45], [106, 36]].forEach(([x, y], i) => poly(g, [[x - 8, y], [x + 8, y], [x, y + 18]], flags[i], rnd, 0.5));
      for (let i = 0; i < 16; i++) blob(g, 16 + rnd() * 96, 76 + rnd() * 40, 3 + rnd() * 3, 2 + rnd() * 3, flags[i % 5], rnd, { layers: 2, alpha: 0.7, edge: 0 });
      break;
    }
    case 'chain': {
      // 이어지는 심부름: 손에서 손으로 건너가는 선물 상자
      for (const [x, c] of [[30, '#F7B3C8'], [64, '#FFE07A'], [98, '#9FD8B8']] as const) { poly(g, [[x - 15, 52], [x + 15, 52], [x + 15, 82], [x - 15, 82]], c, rnd, 0.5); inkLine(g, [[x, 52], [x, 82]], '#E3645A', 3, rnd, 0.7); }
      inkLine(g, arc(47, 56, 15, 14, Math.PI * 1.1, Math.PI * 1.9, 10), '#C2560E', 3, rnd, 0.8);
      inkLine(g, arc(81, 56, 15, 14, Math.PI * 1.1, Math.PI * 1.9, 10), '#C2560E', 3, rnd, 0.8);
      poly(g, [[56, 44], [64, 40], [60, 50]], '#C2560E', rnd, 0.3); poly(g, [[90, 44], [98, 40], [94, 50]], '#C2560E', rnd, 0.3);
      break;
    }
    case 'group': {
      // 마음 모으기: 동그랗게 모인 세 얼굴
      for (const [x, y, c] of [[40, 70, '#F7B3C8'], [88, 70, '#9FD8B8'], [64, 40, '#FFE07A']] as const) {
        blob(g, x, y, 20, 20, c, rnd, { layers: 4, alpha: 0.55, edge: 0.55 });
        g.fillStyle = INK; for (const dx of [-6, 6]) { g.beginPath(); g.arc(x + dx, y - 2, 2.4, 0, 7); g.fill(); }
        inkLine(g, arc(x, y + 4, 6, 4, 0.2, Math.PI - 0.2, 6), INK, 2, rnd, 0.6);
      }
      heartShape(g, rnd, 64, 102, 11, '#E3645A');
      break;
    }
    case 'shopsit': {
      // 가게 봐 주기: 작은 가게와 '잠깐 비워요' 팻말
      poly(g, [[22, 58], [106, 58], [106, 108], [22, 108]], '#FFF4E6', rnd, 0.5);
      for (let i = 0; i < 6; i++) poly(g, [[22 + i * 14, 44], [36 + i * 14, 44], [36 + i * 14, 58], [22 + i * 14, 58]], i % 2 ? '#FFFFFF' : '#F0974A', rnd, 0.3);
      inkLine(g, ring([[22, 44], [106, 44], [106, 108], [22, 108]]), INK, 2.6, rnd, 0.7);
      poly(g, [[34, 72], [62, 72], [62, 108], [34, 108]], '#B9835A', rnd, 0.4);
      poly(g, [[72, 68], [100, 68], [100, 88], [72, 88]], '#FFE07A', rnd, 0.4);
      break;
    }
  }
  return cv;
}

function heartShape(g: CanvasRenderingContext2D, rnd: Rnd, x: number, y: number, r: number, color: string) {
  wash(g, () => {
    g.beginPath();
    g.moveTo(x, y + r * 0.9);
    g.bezierCurveTo(x - r * 1.3, y + r * 0.1, x - r * 0.95, y - r * 0.95, x, y - r * 0.38);
    g.bezierCurveTo(x + r * 0.95, y - r * 0.95, x + r * 1.3, y + r * 0.1, x, y + r * 0.9);
    g.closePath();
  }, color, rnd, { layers: 5, alpha: 0.5, jitter: 1, edge: 0.6, edgeWidth: 2.4 });
  void darken;
}

const cache = new Map<string, string>();
export function doodleCanvas(kind: DoodleKind, size = 96) { return paint(kind, size); }
export function doodleSrc(kind: DoodleKind, size = 96): string {
  const k = kind + size;
  let s = cache.get(k);
  if (!s) { s = paint(kind, size).toDataURL('image/png'); cache.set(k, s); }
  return s;
}
export function doodleImg(kind: DoodleKind, alt = '', cls = 'dicon'): HTMLImageElement {
  const img = document.createElement('img');
  img.className = cls; img.src = doodleSrc(kind); img.alt = alt; img.draggable = false;
  return img;
}
