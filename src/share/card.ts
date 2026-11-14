import { eulReul, gwaWa, listKo } from '../core/korean';
import { FAMILY, FX } from '../data/effects';
import { ING } from '../data/ingredients';
import type { Customer, Picks, RamenRecord } from '../data/types';
import { paperCanvas, heartCanvas } from '../paint/textures';

const ACC = '#C2560E', INK = '#2B2A28', SUB = '#6B5A4E', CREAM = '#FFF4E6';
const H = '"Jua", sans-serif', B = '"Gowun Dodum", sans-serif';

export const ingName = (id: string | null) => (id ? ING.get(id)?.name ?? '' : '');

export function methodLines(p: Picks): string[] {
  const tops = p.toppings.map(ingName);
  const fin = p.finish.map((f) => `${ingName(f.id)} ${f.amount}`);
  return [
    `${eulReul(ingName(p.broth))} 냄비에 붓고 보글보글 끓여요.`,
    `${gwaWa(ingName(p.noodle))} ${eulReul(ingName(p.soup))} 넣어요.`,
    `${eulReul(listKo(tops))} 올려요.`,
    fin.length ? `마지막으로 ${eulReul(fin.join(', '))} 넣으면 완성!` : '그릇에 소복이 옮겨 담으면 완성!',
  ];
}

function wrap(g: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(' ');
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (g.measureText(test).width <= maxW) { line = test; continue; }
      if (line) out.push(line);
      if (g.measureText(w).width <= maxW) { line = w; continue; }
      let part = '';
      for (const ch of w) { if (g.measureText(part + ch).width > maxW) { out.push(part); part = ch; } else part += ch; }
      line = part;
    }
    out.push(line);
  }
  return out;
}

function box(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill = '#FFFFFF', stroke = '#EADBC8', r = 20) {
  g.beginPath(); g.roundRect(x, y, w, h, r);
  g.fillStyle = fill; g.fill();
  g.lineWidth = 3; g.strokeStyle = stroke; g.stroke();
}
function label(g: CanvasRenderingContext2D, t: string, x: number, y: number) {
  g.font = `22px ${H}`; g.fillStyle = ACC; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(t, x, y);
}
function starRow(g: CanvasRenderingContext2D, n: number, x: number, y: number, s = 30) {
  for (let i = 0; i < 3; i++) {
    const cx = x + i * (s + 6) + s / 2, cy = y + s / 2;
    g.beginPath();
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2 - Math.PI / 2, r = k % 2 ? s * 0.22 : s * 0.5; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
    g.closePath(); g.fillStyle = i < n ? '#F2B72D' : '#E6D6C2'; g.fill();
  }
}

let paper: HTMLCanvasElement | null = null;
export interface CardInput { rec: RamenRecord; customer: Customer; photo: CanvasImageSource | null; reason: string; who: string; author: string }

export function drawCard(d: CardInput): HTMLCanvasElement {
  const W = 720, Ht = 1080;
  const c = document.createElement('canvas'); c.width = W; c.height = Ht;
  const g = c.getContext('2d')!;
  g.fillStyle = CREAM; g.fillRect(0, 0, W, Ht);
  if (!paper) paper = paperCanvas(512);
  g.globalCompositeOperation = 'multiply';
  for (let x = 0; x < W; x += 512) for (let y = 0; y < Ht; y += 512) g.drawImage(paper, x, y);
  g.globalCompositeOperation = 'source-over';
  g.lineWidth = 6; g.strokeStyle = '#F1D9BC'; g.beginPath(); g.roundRect(12, 12, W - 24, Ht - 24, 28); g.stroke();

  // 머리띠
  g.beginPath(); g.roundRect(30, 28, W - 60, 76, 38); g.fillStyle = ACC; g.fill();
  g.font = `42px ${H}`; g.fillStyle = '#FFFFFF'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('친구라면 레시피 카드', W / 2, 68);

  // 누구에게 / 손님의 마음
  const fx = FX.get(d.customer.needs.effect)!, fam = FAMILY.get(fx.family)!;
  box(g, 30, 124, 320, 92); label(g, '누구에게', 50, 136);
  g.font = `30px ${H}`; g.fillStyle = INK; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.fillText(wrap(g, d.customer.name, 280)[0], 50, 198);
  box(g, 370, 124, 320, 92, fam.soft, fam.color); label(g, '손님에게 필요한 마음', 390, 136);
  g.font = `30px ${H}`; g.fillStyle = INK; g.fillText(fx.name, 390, 198);
  g.font = `20px ${B}`; g.fillStyle = SUB; g.textAlign = 'right'; g.fillText(fam.name, 672, 198);

  // 라면 이름
  g.font = `46px ${H}`; g.fillStyle = ACC; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  const nl = wrap(g, d.rec.name, 640).slice(0, 2);
  nl.forEach((l, i) => g.fillText(l, W / 2, 280 + i * 54 - (nl.length - 1) * 20));

  // 그릇 사진
  const py = 332, pr = 148, pcx = 40 + pr, pcy = py + pr;
  g.save(); g.beginPath(); g.arc(pcx, pcy, pr, 0, Math.PI * 2); g.closePath(); g.clip();
  g.fillStyle = '#F6EBDD'; g.fillRect(pcx - pr, pcy - pr, pr * 2, pr * 2);
  if (d.photo) g.drawImage(d.photo, pcx - pr, pcy - pr, pr * 2, pr * 2);
  g.restore();
  g.lineWidth = 6; g.strokeStyle = '#FFFFFF'; g.beginPath(); g.arc(pcx, pcy, pr, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 2; g.strokeStyle = '#EADBC8'; g.beginPath(); g.arc(pcx, pcy, pr + 4, 0, Math.PI * 2); g.stroke();
  if (d.rec.heart) g.drawImage(heartCanvas(), pcx + pr - 70, py - 6, 84, 84);

  // 재료와 양
  const p = d.rec.picks;
  box(g, 356, py - 4, 334, 304); label(g, '재료와 양', 374, py + 8);
  const rows: [string, string][] = [
    ['국물', ingName(p.broth)], ['면', ingName(p.noodle)], ['스프', ingName(p.soup)],
    ['건더기', p.toppings.map(ingName).join(', ')],
    ['마무리', p.finish.length ? p.finish.map((f) => `${ingName(f.id)} ${f.amount}`).join(', ') : '넣지 않았어요'],
  ];
  let y = py + 44;
  for (const [k, v] of rows) {
    g.font = `18px ${H}`; g.fillStyle = ACC; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(k, 374, y + 2);
    g.font = `19px ${B}`; g.fillStyle = INK;
    const ls = wrap(g, v, 238).slice(0, 3);
    ls.forEach((l, i) => g.fillText(l, 440, y + i * 25));
    y += Math.max(1, ls.length) * 25 + 10;
  }

  // 끓이는 방법
  const my = 652;
  box(g, 30, my, 660, 196); label(g, '끓이는 방법', 50, my + 12);
  g.font = `19px ${B}`; g.fillStyle = INK; g.textBaseline = 'top';
  let yy = my + 46;
  methodLines(p).forEach((l, i) => {
    const ls = wrap(g, l, 590);
    g.font = `19px ${H}`; g.fillStyle = ACC; g.fillText(`${i + 1}.`, 50, yy);
    g.font = `19px ${B}`; g.fillStyle = INK;
    ls.slice(0, 2).forEach((t, k) => g.fillText(t, 78, yy + k * 24));
    yy += Math.min(2, ls.length) * 24 + 6;
  });

  // 고른 까닭
  const ry = 862;
  box(g, 30, ry, 660, 132, '#FFFDF6'); label(g, '내가 고른 까닭', 50, ry + 12);
  g.font = `20px ${B}`; g.fillStyle = INK; g.textBaseline = 'top';
  const why = d.reason.trim() ? `내가 이 라면을 고른 까닭은 ${d.reason.trim()} 때문이에요.` : '내가 이 라면을 고른 까닭은 ________ 때문이에요.';
  const lines = wrap(g, why, 620).slice(0, d.who.trim() ? 2 : 3);
  if (d.who.trim()) lines.push(...wrap(g, `${d.who.trim()}에게 이 라면을 끓여 주고 싶어요.`, 620).slice(0, 1));
  lines.forEach((l, i) => g.fillText(l, 50, ry + 46 + i * 27));

  // 아랫줄
  starRow(g, d.rec.stars, 40, 1012, 34);
  g.font = `24px ${H}`; g.fillStyle = INK; g.textAlign = 'right'; g.textBaseline = 'middle';
  const dt = new Date(d.rec.createdAt);
  g.fillText(`만든 사장님 ${d.author}`, 680, 1018);
  g.font = `17px ${B}`; g.fillStyle = SUB;
  g.fillText(`${dt.getFullYear()}. ${dt.getMonth() + 1}. ${dt.getDate()}. · 후루룩 친구라면 가게`, 680, 1048);
  return c;
}

export function dataURLtoBlob(url: string): Blob {
  const [head, body] = url.split(',');
  const mime = head.match(/:(.*?);/)?.[1] ?? 'image/png';
  const bin = atob(body);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
