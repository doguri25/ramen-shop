import * as THREE from 'three';
import { blob, blobPath, ctx2d, darken, granulate, inkLine, lighten, makeCanvas, mix, rgba, seeded, softGlow, wash } from './brush';

export const tex = (c: HTMLCanvasElement, repeat = false) => {
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.needsUpdate = true;
  return t;
};

const INK = '#5A3A28';
const FONT_H = '"Jua", "Gowun Dodum", sans-serif';

// 이어 붙여도 티 안 나게 가장자리를 넘겨 그리기
function wrapped(w: number, h: number, x: number, y: number, r: number, fn: (x: number, y: number) => void) {
  for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) {
    const px = x + dx, py = y + dy;
    if (px + r < 0 || px - r > w || py + r < 0 || py - r > h) continue;
    fn(px, py);
  }
}

export function paperCanvas(size = 512) {
  const c = makeCanvas(size, size), g = ctx2d(c), rnd = seeded(11);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 90; i++) {
    const x = rnd() * size, y = rnd() * size, r = 20 + rnd() * 90, a = 0.012 + rnd() * 0.02;
    wrapped(size, size, x, y, r, (px, py) => {
      const gr = g.createRadialGradient(px, py, 0, px, py, r);
      gr.addColorStop(0, `rgba(120,100,80,${a})`); gr.addColorStop(1, 'rgba(120,100,80,0)');
      g.fillStyle = gr; g.fillRect(px - r, py - r, r * 2, r * 2);
    });
  }
  g.lineCap = 'round';
  for (let i = 0; i < 900; i++) {
    const x = rnd() * size, y = rnd() * size, l = 3 + rnd() * 10, a = rnd() * 6.28;
    g.strokeStyle = `rgba(110,90,70,${0.04 + rnd() * 0.06})`; g.lineWidth = 0.6 + rnd() * 0.8;
    wrapped(size, size, x, y, l, (px, py) => { g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); g.stroke(); });
  }
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(90,70,55,${rnd() * 0.07})`;
    g.fillRect(rnd() * size, rnd() * size, 1, 1);
  }
  return c;
}

export function woodCanvas(base = '#C99A6B', seed = 3, planks = 6, w = 512, h = 512) {
  const c = makeCanvas(w, h), g = ctx2d(c), rnd = seeded(seed);
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  const ph = h / planks;
  for (let p = 0; p < planks; p++) {
    const y0 = p * ph;
    const tint = mix(base, p % 2 ? '#a8754a' : '#e2b88a', 0.25 + rnd() * 0.25);
    wash(g, () => { g.beginPath(); g.rect(-4, y0 + 2, w + 8, ph - 4); }, tint, rnd, { layers: 3, alpha: 0.35, jitter: 2, edge: 0 });
    for (let k = 0; k < 9; k++) {
      const yy = y0 + 6 + rnd() * (ph - 12), amp = 1 + rnd() * 3, fr = 0.004 + rnd() * 0.01, off = rnd() * 100;
      const pts: [number, number][] = [];
      for (let x = -10; x <= w + 10; x += 16) pts.push([x, yy + Math.sin((x + off) * fr * 6.28) * amp]);
      inkLine(g, pts, darken(base, 0.35), 0.8 + rnd() * 0.8, rnd, 0.18 + rnd() * 0.15);
    }
    if (rnd() < 0.6) {
      const kx = rnd() * w, ky = y0 + ph * (0.3 + rnd() * 0.4);
      blob(g, kx, ky, 6 + rnd() * 6, 3 + rnd() * 2, darken(base, 0.35), rnd, { layers: 2, alpha: 0.4, edge: 0.4 });
    }
    g.fillStyle = rgba(darken(base, 0.55), 0.5);
    g.fillRect(0, y0, w, 1.5);
  }
  granulate(g, w, h, rnd, INK, 2500, 0.07);
  return c;
}

export function wallCanvas() {
  const w = 512, h = 512, c = makeCanvas(w, h), g = ctx2d(c), rnd = seeded(5);
  g.fillStyle = '#F4E6D0'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) {
    const x = rnd() * w, y = rnd() * h, r = 40 + rnd() * 120;
    wrapped(w, h, x, y, r, (px, py) => blob(g, px, py, r, r * 0.7, rnd() < 0.5 ? '#EEDCC0' : '#FAF1E2', rnd, { layers: 2, alpha: 0.12, edge: 0.03, wobble: 0.2 }));
  }
  granulate(g, w, h, rnd, INK, 2000, 0.05);
  return c;
}

export function tileCanvas() {
  const w = 512, h = 512, c = makeCanvas(w, h), g = ctx2d(c), rnd = seeded(8);
  g.fillStyle = '#E9DCC8'; g.fillRect(0, 0, w, h);
  const n = 8, s = w / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const col = (i + j) % 2 ? '#E6D2B3' : '#F1E6D4';
    wash(g, () => { g.beginPath(); g.rect(i * s + 2, j * s + 2, s - 4, s - 4); }, col, rnd, { layers: 2, alpha: 0.6, jitter: 1.2, edge: 0.2 });
  }
  granulate(g, w, h, rnd, INK, 1800, 0.05);
  return c;
}

// 창문 밖 마을 풍경 (직접 그린 그림)
export function villageCanvas() {
  const w = 1024, h = 512, c = makeCanvas(w, h), g = ctx2d(c), rnd = seeded(21);
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#A9D3EE'); sky.addColorStop(0.55, '#DCEEF5'); sky.addColorStop(1, '#FBF1DE');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 7; i++) {
    const x = rnd() * w, y = 40 + rnd() * 120;
    for (let k = 0; k < 4; k++) blob(g, x + (k - 1.5) * 34, y + (rnd() - 0.5) * 12, 40 + rnd() * 20, 18 + rnd() * 8, '#FFFFFF', rnd, { layers: 3, alpha: 0.35, edge: 0.05 });
  }
  softGlow(g, 830, 90, 90, '#FFE9A8', 0.8);
  blob(g, 830, 90, 32, 32, '#FFD86B', rnd, { layers: 4, alpha: 0.45, edge: 0.2 });
  const hill = (y: number, col: string, amp: number, f: number) => {
    wash(g, () => {
      g.beginPath(); g.moveTo(0, h);
      for (let x = 0; x <= w; x += 12) g.lineTo(x, y + Math.sin(x * f + y) * amp + Math.sin(x * f * 2.7) * amp * 0.3);
      g.lineTo(w, h); g.closePath();
    }, col, rnd, { layers: 3, alpha: 0.4, edge: 0.2 });
  };
  hill(250, '#B9D7A6', 26, 0.006);
  hill(300, '#9FC98C', 18, 0.009);
  // 길
  wash(g, () => { g.beginPath(); g.moveTo(420, h); g.quadraticCurveTo(520, 360, 600, 330); g.lineTo(640, 332); g.quadraticCurveTo(600, 380, 640, h); g.closePath(); }, '#EAD7B5', rnd, { layers: 3, alpha: 0.5, edge: 0.2 });
  const house = (x: number, y: number, s: number, wall: string, roof: string) => {
    wash(g, () => { g.beginPath(); g.rect(x - s * 0.5, y - s * 0.7, s, s * 0.7); }, wall, rnd, { layers: 3, alpha: 0.55, edge: 0.4 });
    wash(g, () => { g.beginPath(); g.moveTo(x - s * 0.65, y - s * 0.68); g.lineTo(x, y - s * 1.15); g.lineTo(x + s * 0.65, y - s * 0.68); g.closePath(); }, roof, rnd, { layers: 3, alpha: 0.55, edge: 0.45 });
    wash(g, () => { g.beginPath(); g.rect(x - s * 0.12, y - s * 0.32, s * 0.24, s * 0.32); }, darken(wall, 0.35), rnd, { layers: 2, alpha: 0.5, edge: 0.3 });
    wash(g, () => { g.beginPath(); g.rect(x - s * 0.38, y - s * 0.55, s * 0.18, s * 0.16); g.rect(x + s * 0.2, y - s * 0.55, s * 0.18, s * 0.16); }, '#FCE7A8', rnd, { layers: 2, alpha: 0.7, edge: 0.4 });
  };
  const tree = (x: number, y: number, s: number) => {
    wash(g, () => { g.beginPath(); g.rect(x - s * 0.06, y - s * 0.5, s * 0.12, s * 0.5); }, '#9A6E4C', rnd, { layers: 2, alpha: 0.6 });
    blob(g, x, y - s * 0.75, s * 0.42, s * 0.38, rnd() < 0.5 ? '#7DB86A' : '#93C47D', rnd, { layers: 4, alpha: 0.4, edge: 0.3 });
  };
  const roofs = ['#E07A5F', '#6FA3D6', '#E9A84A', '#B07CC6', '#D86A6A', '#5FB08A'];
  const walls = ['#FFF3E0', '#F7E3C6', '#FBEAD8', '#F1E6D6'];
  for (let i = 0; i < 9; i++) {
    const x = 60 + i * 115 + (rnd() - 0.5) * 30;
    if (Math.abs(x - 530) < 70) continue;
    house(x, 330 + rnd() * 30, 80 + rnd() * 30, walls[i % walls.length], roofs[i % roofs.length]);
  }
  for (let i = 0; i < 10; i++) tree(30 + rnd() * w, 400 + rnd() * 40, 70 + rnd() * 40);
  hill(440, '#8CC07A', 10, 0.012);
  granulate(g, w, h, rnd, INK, 3000, 0.05);
  return c;
}

export function signCanvas() {
  const w = 1024, h = 320, c = makeCanvas(w, h), g = ctx2d(c), rnd = seeded(31);
  const wood = woodCanvas('#B9845A', 9, 3, w, h);
  g.drawImage(wood, 0, 0);
  wash(g, () => { g.beginPath(); g.roundRect(14, 14, w - 28, h - 28, 26); }, '#FFF4E6', rnd, { layers: 3, alpha: 0.55, edge: 0.4 });
  g.fillStyle = '#C2560E';
  g.font = `150px ${FONT_H}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.globalAlpha = 0.92; g.fillText('친구라면', w / 2 + 30, h / 2 + 18);
  g.globalAlpha = 1;
  g.fillStyle = '#5A3A28'; g.font = `54px ${FONT_H}`;
  g.fillText('후루룩', 170, h / 2 + 10);
  // 김 모양
  for (let i = 0; i < 3; i++) inkLine(g, [[110 + i * 40, 90], [120 + i * 40, 70], [105 + i * 40, 52], [118 + i * 40, 34]], '#C2560E', 6, rnd, 0.7);
  return c;
}

export function norenCanvas() {
  const w = 512, h = 512, c = makeCanvas(w, h), g = ctx2d(c), rnd = seeded(41);
  g.clearRect(0, 0, w, h);
  const cols = ['#E07A5F', '#E07A5F'];
  for (let i = 0; i < 2; i++) {
    const x0 = i * w / 2 + 6;
    wash(g, () => { g.beginPath(); g.rect(x0, 0, w / 2 - 12, h - 10); }, cols[i], rnd, { layers: 4, alpha: 0.5, edge: 0.35 });
  }
  g.fillStyle = '#FFF4E6'; g.font = `150px ${FONT_H}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('라', w * 0.25, h * 0.45); g.fillText('면', w * 0.75, h * 0.45);
  granulate(g, w, h, rnd, INK, 900, 0.06);
  return c;
}

export function plaqueCanvas(text: string, bg = '#FFF4E6', fg = '#5A3A28') {
  const w = 512, h = 160, c = makeCanvas(w, h), g = ctx2d(c), rnd = seeded(text.length * 13 + 7);
  wash(g, () => { g.beginPath(); g.roundRect(8, 8, w - 16, h - 16, 24); }, bg, rnd, { layers: 4, alpha: 0.6, edge: 0.4 });
  g.fillStyle = fg; g.font = `78px ${FONT_H}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 6);
  return c;
}

// 라면 그릇 바깥 무늬
export function bowlCanvas(band = '#C2560E') {
  const w = 512, h = 128, c = makeCanvas(w, h), g = ctx2d(c), rnd = seeded(51);
  g.fillStyle = '#FFF8EE'; g.fillRect(0, 0, w, h);
  wash(g, () => { g.beginPath(); g.rect(0, 10, w, 18); }, band, rnd, { layers: 3, alpha: 0.6, edge: 0.2 });
  for (let i = 0; i < 6; i++) {
    const x = 40 + i * 86, y = 76;
    blob(g, x, y + 6, 13, 11, band, rnd, { layers: 2, alpha: 0.5, edge: 0.2 });
    for (let k = 0; k < 4; k++) blob(g, x - 15 + k * 10, y - 12 - (k % 3 === 0 ? 0 : 5), 4.5, 5.5, band, rnd, { layers: 2, alpha: 0.5, edge: 0.15 });
  }
  return c;
}

export function steamCanvas() {
  const s = 128, c = makeCanvas(s, s), g = ctx2d(c), rnd = seeded(61);
  for (let i = 0; i < 6; i++) softGlow(g, 64 + (rnd() - 0.5) * 40, 64 + (rnd() - 0.5) * 40, 30 + rnd() * 20, '#ffffff', 0.35);
  return c;
}

export function sparkleCanvas() {
  const s = 128, c = makeCanvas(s, s), g = ctx2d(c);
  softGlow(g, 64, 64, 50, '#FFF2B3', 0.6);
  g.fillStyle = '#FFE16B';
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 14 : 40;
    g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
  }
  g.closePath(); g.fill();
  return c;
}

export function heartCanvas() {
  const s = 128, c = makeCanvas(s, s), g = ctx2d(c), rnd = seeded(71);
  wash(g, () => {
    g.beginPath(); g.moveTo(64, 104);
    g.bezierCurveTo(10, 70, 18, 22, 64, 42); g.bezierCurveTo(110, 22, 118, 70, 64, 104); g.closePath();
  }, '#E86B7F', rnd, { layers: 4, alpha: 0.55, edge: 0.4 });
  return c;
}

// 표정 묶음: 위쪽 256px 은 눈 8칸(256×128), 아래쪽 256px 은 입 16칸(128×128)
export const EYES = { neutral: 0, happy: 1, sad: 2, worried: 3, angry: 4, blink: 5, sparkle: 6, content: 7 } as const;
export const MOUTH = { smile: 0, grin: 1, frown: 2, wavy: 3, talkA: 4, talkB: 5, oh: 6, flat: 7, chew: 8, beakA: 9 } as const;

export function faceAtlas(blush = '#F29BA6', patch = '') {
  const c = makeCanvas(1024, 512), g = ctx2d(c), rnd = seeded(81);
  const ink = '#3A2A22';
  const eyeCell = (i: number, draw: (cx: number, cy: number) => void) => {
    const x = (i % 4) * 256, y = Math.floor(i / 4) * 128;
    g.save(); g.beginPath(); g.rect(x, y, 256, 128); g.clip();
    // 볼터치
    softGlow(g, x + 48, y + 92, 26, blush, 0.55);
    softGlow(g, x + 208, y + 92, 26, blush, 0.55);
    if (patch) {
      g.fillStyle = patch;
      for (const sd of [-1, 1]) { g.beginPath(); g.ellipse(x + 128 + sd * 62, y + 64, 34, 42, sd * -0.5, 0, 6.28); g.fill(); }
    }
    draw(x + 128, y + 58);
    g.restore();
  };
  const dot = (x: number, y: number, r = 15) => {
    if (patch) { g.fillStyle = '#FFFFFF'; g.beginPath(); g.ellipse(x, y, r * 0.85 + 5, r + 5, 0, 0, 6.28); g.fill(); }
    g.fillStyle = ink; g.beginPath(); g.ellipse(x, y, r * 0.85, r, 0, 0, 6.28); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.38, r * 0.32, 0, 6.28); g.fill();
  };
  const arc = (x: number, y: number, up: boolean, r = 15) => {
    g.strokeStyle = ink; g.lineWidth = 6; g.lineCap = 'round';
    g.beginPath(); if (up) g.arc(x, y + 6, r, Math.PI * 1.15, Math.PI * 1.85); else g.arc(x, y - 8, r, Math.PI * 0.15, Math.PI * 0.85); g.stroke();
  };
  const brow = (x: number, y: number, tilt: number) => {
    g.strokeStyle = ink; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x - 14, y + tilt); g.lineTo(x + 14, y - tilt); g.stroke();
  };
  const L = -58, R = 58;
  eyeCell(EYES.neutral, (cx, cy) => { dot(cx + L, cy); dot(cx + R, cy); });
  eyeCell(EYES.happy, (cx, cy) => { arc(cx + L, cy, true); arc(cx + R, cy, true); });
  eyeCell(EYES.sad, (cx, cy) => {
    dot(cx + L, cy + 4, 13); dot(cx + R, cy + 4, 13);
    brow(cx + L, cy - 26, 5); brow(cx + R, cy - 26, -5);
    g.fillStyle = 'rgba(140,200,240,0.85)'; g.beginPath(); g.ellipse(cx + L + 8, cy + 26, 5, 8, 0, 0, 6.28); g.fill();
  });
  eyeCell(EYES.worried, (cx, cy) => { dot(cx + L, cy + 2, 13); dot(cx + R, cy + 2, 13); brow(cx + L, cy - 28, 6); brow(cx + R, cy - 28, -6); });
  eyeCell(EYES.angry, (cx, cy) => { dot(cx + L, cy + 4, 13); dot(cx + R, cy + 4, 13); brow(cx + L, cy - 24, -7); brow(cx + R, cy - 24, 7); });
  eyeCell(EYES.blink, (cx, cy) => {
    g.strokeStyle = ink; g.lineWidth = 6; g.lineCap = 'round';
    for (const s of [L, R]) { g.beginPath(); g.moveTo(cx + s - 14, cy + 4); g.quadraticCurveTo(cx + s, cy + 10, cx + s + 14, cy + 4); g.stroke(); }
  });
  eyeCell(EYES.sparkle, (cx, cy) => {
    for (const s of [L, R]) {
      g.fillStyle = ink; g.beginPath(); g.ellipse(cx + s, cy, 16, 19, 0, 0, 6.28); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(cx + s - 5, cy - 7, 6.5, 0, 6.28); g.fill();
      g.beginPath(); g.arc(cx + s + 6, cy + 7, 3, 0, 6.28); g.fill();
    }
  });
  eyeCell(EYES.content, (cx, cy) => { arc(cx + L, cy, false); arc(cx + R, cy, false); });

  const mouthCell = (i: number, draw: (cx: number, cy: number) => void) => {
    const x = (i % 8) * 128, y = 256 + Math.floor(i / 8) * 128;
    g.save(); g.beginPath(); g.rect(x, y, 128, 128); g.clip();
    g.strokeStyle = ink; g.fillStyle = ink; g.lineWidth = 6; g.lineCap = 'round'; g.lineJoin = 'round';
    draw(x + 64, y + 52);
    g.restore();
  };
  const tongue = '#E8737D';
  mouthCell(MOUTH.smile, (x, y) => { g.beginPath(); g.moveTo(x - 16, y - 2); g.quadraticCurveTo(x - 8, y + 10, x, y); g.quadraticCurveTo(x + 8, y + 10, x + 16, y - 2); g.stroke(); });
  mouthCell(MOUTH.grin, (x, y) => {
    g.beginPath(); g.moveTo(x - 22, y - 6); g.quadraticCurveTo(x, y + 34, x + 22, y - 6); g.closePath(); g.fill();
    g.fillStyle = tongue; g.beginPath(); g.ellipse(x, y + 12, 10, 6, 0, 0, 6.28); g.fill();
  });
  mouthCell(MOUTH.frown, (x, y) => { g.beginPath(); g.moveTo(x - 14, y + 8); g.quadraticCurveTo(x, y - 6, x + 14, y + 8); g.stroke(); });
  mouthCell(MOUTH.wavy, (x, y) => { g.beginPath(); g.moveTo(x - 18, y + 2); g.quadraticCurveTo(x - 9, y - 6, x, y + 2); g.quadraticCurveTo(x + 9, y + 10, x + 18, y + 2); g.stroke(); });
  mouthCell(MOUTH.talkA, (x, y) => { g.beginPath(); g.ellipse(x, y + 4, 10, 9, 0, 0, 6.28); g.fill(); g.fillStyle = tongue; g.beginPath(); g.ellipse(x, y + 8, 6, 3.5, 0, 0, 6.28); g.fill(); });
  mouthCell(MOUTH.talkB, (x, y) => { g.beginPath(); g.ellipse(x, y + 2, 13, 6, 0, 0, 6.28); g.fill(); });
  mouthCell(MOUTH.oh, (x, y) => { g.beginPath(); g.ellipse(x, y + 4, 9, 12, 0, 0, 6.28); g.fill(); });
  mouthCell(MOUTH.flat, (x, y) => { g.beginPath(); g.moveTo(x - 13, y + 2); g.lineTo(x + 13, y + 2); g.stroke(); });
  mouthCell(MOUTH.chew, (x, y) => { g.beginPath(); g.moveTo(x - 18, y - 2); g.quadraticCurveTo(x - 9, y + 10, x, y); g.quadraticCurveTo(x + 9, y + 10, x + 18, y - 2); g.stroke(); });
  mouthCell(MOUTH.beakA, () => {});
  void rnd;
  return c;
}

// 스프 봉지 겉면
export function packetCanvas(name: string, color: string, seed: number) {
  const w = 256, h = 320, c = makeCanvas(w, h), g = ctx2d(c), rnd = seeded(seed);
  g.fillStyle = lighten(color, 0.2); g.fillRect(0, 0, w, h);
  wash(g, () => { g.beginPath(); g.rect(0, 0, w, h); }, color, rnd, { layers: 3, alpha: 0.5, edge: 0 });
  for (let x = 0; x < w; x += 16) { g.fillStyle = rgba(darken(color, 0.2), 0.5); g.fillRect(x, 0, 8, 14); g.fillRect(x + 8, h - 14, 8, 14); }
  blob(g, w / 2, 120, 74, 70, '#FFF8EC', rnd, { layers: 3, alpha: 0.75, edge: 0.3 });
  // 그릇과 김
  wash(g, () => { g.beginPath(); g.moveTo(w / 2 - 48, 120); g.quadraticCurveTo(w / 2, 190, w / 2 + 48, 120); g.closePath(); }, '#C2560E', rnd, { layers: 3, alpha: 0.6 });
  for (let i = 0; i < 3; i++) inkLine(g, [[w / 2 - 22 + i * 22, 108], [w / 2 - 16 + i * 22, 92], [w / 2 - 26 + i * 22, 78], [w / 2 - 18 + i * 22, 64]], '#C2560E', 5, rnd, 0.7);
  g.fillStyle = '#FFF8EC'; g.font = `44px ${FONT_H}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const words = name.replace(' 스프', '').split(' ');
  g.lineWidth = 8; g.strokeStyle = darken(color, 0.35);
  words.slice(0, 2).forEach((wd, i) => { g.strokeText(wd, w / 2, 236 + i * 46); g.fillText(wd, w / 2, 236 + i * 46); });
  granulate(g, w, h, rnd, INK, 500, 0.08);
  return c;
}

// 소품과 작은 물건 겉면에 쓰는 그림
export function labelCanvas(kind: string) {
  const w = 256, h = 256, c = makeCanvas(w, h), g = ctx2d(c), rnd = seeded(kind.length * 31 + 3);
  g.fillStyle = '#FFFDF8'; g.fillRect(0, 0, w, h);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (kind === 'ball') {
    g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 7; i++) blob(g, (i % 4) * 72 + 24 + (Math.floor(i / 4) % 2) * 36, Math.floor(i / 4) * 120 + 60, 22, 20, '#2E2E2E', rnd, { layers: 2, alpha: 0.85, edge: 0.2 });
  } else if (kind === 'timetable') {
    const cols = ['#F2A7B8', '#8EC5E8', '#F4C842', '#A8D08D', '#B9A3DB', '#F5A65B'];
    for (let i = 0; i < 5; i++) for (let j = 0; j < 6; j++) wash(g, () => { g.beginPath(); g.rect(14 + i * 46, 14 + j * 38, 40, 32); }, cols[(i + j * 2) % cols.length], rnd, { layers: 2, alpha: 0.75, edge: 0.3 });
  } else if (kind === 'award') {
    wash(g, () => { g.beginPath(); g.rect(14, 14, w - 28, h - 28); }, '#F4C842', rnd, { layers: 2, alpha: 0.5, edge: 0.5 });
    g.fillStyle = '#C2560E'; g.font = `64px ${FONT_H}`; g.fillText('상장', w / 2, 80);
    for (let i = 0; i < 4; i++) { g.fillStyle = rgba(INK, 0.4); g.fillRect(50, 130 + i * 22, w - 100, 6); }
  } else if (kind === 'photo') {
    g.fillStyle = '#CFE8F5'; g.fillRect(0, 0, w, h);
    blob(g, w / 2, 150, 60, 50, '#F0B878', rnd, { layers: 3, alpha: 0.8, edge: 0.4 });
    blob(g, w / 2 - 30, 108, 16, 16, '#F0B878', rnd, { layers: 2, alpha: 0.8 });
    blob(g, w / 2 + 30, 108, 16, 16, '#F0B878', rnd, { layers: 2, alpha: 0.8 });
    g.fillStyle = '#3A2A22'; g.beginPath(); g.arc(w / 2 - 18, 140, 5, 0, 6.28); g.arc(w / 2 + 18, 140, 5, 0, 6.28); g.fill();
    softGlow(g, w / 2 - 34, 160, 14, '#F29BA6', 0.7); softGlow(g, w / 2 + 34, 160, 14, '#F29BA6', 0.7);
  } else if (kind === 'letter' || kind === 'letterheart') {
    g.fillStyle = '#FFF4E6'; g.fillRect(0, 0, w, h);
    inkLine(g, [[10, 40], [w / 2, 150], [w - 10, 40]], '#C9A27A', 6, rnd, 0.8);
    if (kind === 'letterheart') {
      g.drawImage(heartCanvas(), w / 2 - 40, 120, 80, 80);
    } else {
      blob(g, w / 2, 160, 18, 18, '#E3645A', rnd, { layers: 2, alpha: 0.8 });
    }
  } else if (kind === 'ruler') {
    g.fillStyle = '#F7D98A'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) { g.fillStyle = INK; g.fillRect(i * 10, 0, 2, i % 5 === 0 ? 70 : 36); }
  } else if (kind === 'script' || kind === 'notebook' || kind === 'poster') {
    g.fillStyle = kind === 'poster' ? '#FFF2C9' : '#FFFFFF'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) { g.fillStyle = rgba('#6FB3E0', 0.5); g.fillRect(16, 30 + i * 28, w - 32, 3); }
    if (kind === 'poster') { blob(g, 80, 90, 34, 34, '#E98BA3', rnd, { alpha: 0.6 }); blob(g, 170, 150, 40, 30, '#8DC26F', rnd, { alpha: 0.6 }); }
    else for (let i = 0; i < 6; i++) { g.fillStyle = rgba(INK, 0.55); g.fillRect(24, 22 + i * 28, 60 + rnd() * 140, 6); }
  } else if (kind === 'nametag') {
    g.fillStyle = '#FFF4E6'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#47AE7A'; g.font = `70px ${FONT_H}`; g.fillText('창가', w / 2, h / 2);
  } else if (kind === 'gift') {
    g.fillStyle = '#F2A7B8'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 12; i++) blob(g, rnd() * w, rnd() * h, 10, 10, '#FFF4E6', rnd, { layers: 1, alpha: 0.8, edge: 0 });
  } else if (kind === 'box') {
    g.fillStyle = '#D8AE7E'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#EAD7A8'; g.fillRect(w / 2 - 22, 0, 44, h);
    g.fillStyle = INK; g.font = `40px ${FONT_H}`; g.fillText('이사', w / 2, 200);
  } else if (kind === 'ddakji') {
    g.fillStyle = '#6FB3E0'; g.fillRect(0, 0, w / 2, h); g.fillStyle = '#E3645A'; g.fillRect(w / 2, 0, w / 2, h);
    inkLine(g, [[0, 0], [w, h]], '#3A2A22', 4, rnd, 0.5); inkLine(g, [[w, 0], [0, h]], '#3A2A22', 4, rnd, 0.5);
  } else if (kind === 'bubblesign') {
    g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, w, h);
    g.fillStyle = INK; g.font = `120px ${FONT_H}`; g.fillText('…', w / 2, h / 2 - 20);
  } else if (kind === 'fishcake') {
    g.fillStyle = '#F5E6C8'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#EE8FA8'; g.lineWidth = 16; g.lineCap = 'round';
    g.beginPath();
    for (let a = 0; a < 18; a += 0.2) { const r = 8 + a * 5.5; g.lineTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r); }
    g.stroke();
  } else if (kind === 'stargim') {
    g.fillStyle = '#2B3628'; g.fillRect(0, 0, w, h);
    g.drawImage(sparkleCanvas(), w / 2 - 90, h / 2 - 90, 180, 180);
  }
  granulate(g, w, h, rnd, INK, 400, 0.06);
  return c;
}
