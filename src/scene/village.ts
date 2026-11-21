import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../core/rng';
import type { ChibiSpec } from '../data/types';
import { blob, ctx2d, darken, lighten, makeCanvas, mix } from '../paint/brush';
import { tex } from '../paint/textures';
import { Chibi } from './chibi';
import { glowTex, makeGlow, makeShadow } from './fx';
import { boxG, coneG, cylG, disposeTree, M, Mu, mesh, sphereG } from './geo';
import { bakeSpec, placeProps, planProps } from './villageProps';

// 3D 마음 골목: 동화 속 마을처럼 언덕과 냇가가 있고, 묶음마다 작은 마을이 있어요.
// 라면을 끓여 준 손님 집에 불이 켜지고, 집을 누르면 손님이 문을 열고 나와요.
const PI = Math.PI;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export interface VHouse { id: string; name: string; family: string; lit: boolean; stars: number; spec?: ChibiSpec | ChibiSpec[] }
export interface VTown { family: string; name: string; color: string }
export interface VHouseSpot { h: VHouse; hit: THREE.Mesh; door: THREE.Vector3; out: THREE.Vector3; yaw: number; town: number }
// 동네 주민: hold이면 멈춰 서고, faceTo가 있으면 그쪽을 봐요
export interface VNpc { ch: Chibi; hit: THREE.Mesh; hold: boolean; faceTo: THREE.Vector3 | null }
export interface VShopSpot { hit: THREE.Mesh; kind: VShop['kind']; name: string; front: THREE.Vector3; yaw: number }
export interface Village {
  root: THREE.Group; ground: THREE.Mesh; hits: THREE.Mesh[]; shopHits: THREE.Mesh[]; shops: VShopSpot[]; npcs: VNpc[];
  houses: VHouseSpot[]; towns: { center: THREE.Vector3; t: VTown; lit: number; total: number }[];
  shopDoor: THREE.Vector3; bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  heightAt: (x: number, z: number) => number; walkY: (x: number, z: number) => number; inWater: (x: number, z: number) => boolean; blocked: (x: number, z: number) => boolean;
  update: (dt: number, eye?: THREE.Vector3) => void; dispose: () => void;
  bakeSpec: () => unknown; baked: boolean;
}

// ── 땅 모양 ─────────────────────────────
const X0 = -100, X1 = 100, Z0 = -80, Z1 = 66;
const RIVER: [number, number][] = [[-250, -44], [-190, -30], [-140, -40], [-112, -36], [-86, -22], [-66, -30], [-44, -16], [-22, -26], [-4, -14], [16, -22], [36, -10], [58, -20], [80, -6], [112, -14], [150, -4], [200, -20], [250, -12]];
const SHOP = V(0, 0, 6);
// 마을마다 구불구불한 골목 하나: 가운데 자리와 골목 방향(라디안)
const LANES: [number, number, number][] = [[-70, -58, 0.45], [-30, -62, -0.25], [10, -58, 0.35], [54, -56, -0.4], [-70, 20, -0.6], [-34, 44, 0.2], [10, 50, -0.3], [58, 30, 0.55]];
const WATER = -0.55;
// 마을 바깥: 산과 숲이 둘러싸요 (지도 끝이 잘려 보이지 않게)
const BX0 = -240, BX1 = 240, BZ0 = -210, BZ1 = 196;
// 땅 그림은 마을 안을 촘촘하게, 바깥은 성기게 그려요 (한 장에 함께)
const IN = 0.82, OUTU = (1 - IN) / 2;
const mapU = (x: number) => (x < X0 ? OUTU * (x - BX0) / (X0 - BX0) : x > X1 ? 1 - OUTU + OUTU * (x - X1) / (BX1 - X1) : OUTU + IN * (x - X0) / (X1 - X0));
const mapV = (z: number) => (z < Z0 ? OUTU * (z - BZ0) / (Z0 - BZ0) : z > Z1 ? 1 - OUTU + OUTU * (z - Z1) / (BZ1 - Z1) : OUTU + IN * (z - Z0) / (Z1 - Z0));
function mountains(x: number, z: number) {
  const dx = Math.max(X0 - x, 0, x - X1), dz = Math.max(Z0 - z, 0, z - Z1), d = Math.hypot(dx, dz);
  if (d <= 0) return 0;
  const k = smooth(0, 95, d);
  return k * (16 + 9 * Math.sin(x * 0.031 + 0.7) * Math.cos(z * 0.027 - 1.2) + 6 * Math.sin(x * 0.083 + z * 0.061) + 3 * Math.cos(x * 0.17 - z * 0.13)) + smooth(0, 30, d) * 2;
}

function hills(x: number, z: number) {
  return 4.6 * Math.sin(x * 0.05 + 1.1) * Math.cos(z * 0.055 - 0.4) + 2.4 * Math.sin(x * 0.11 + z * 0.08) + 1.4 * Math.cos(z * 0.14 - x * 0.05) + 2.6;
}
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function sign(text: string, w = 320, h = 96, bg = '#FFF8EC', ink = '#5B3A29', fs0 = 46) {
  const cv = makeCanvas(w, h), g = ctx2d(cv);
  g.fillStyle = bg; g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 20); g.fill();
  g.strokeStyle = darken(bg, 0.3); g.lineWidth = 5; g.stroke();
  g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
  let fs = fs0; g.font = `${fs}px Jua, sans-serif`;
  while (g.measureText(text).width > w - 34 && fs > 18) { fs -= 2; g.font = `${fs}px Jua, sans-serif`; }
  g.fillText(text, w / 2, h / 2 + 3);
  return tex(cv);
}

// 집 한 채 (앞이 +z). 불 켜진 집은 지붕이 묶음 색이고 창문이 노랗게 빛나요. 동화처럼 뾰족 지붕·둥근 탑 지붕을 섞어요
function makeHouse(h: VHouse, roofColor: string, seed: number): THREE.Group {
  const o = new THREE.Group();
  const rnd = mulberry32(seed * 7919 + 13);
  const S = 1.6, w = (1.45 + rnd() * 0.3) * S, d = 1.3 * S, ht = (1.05 + rnd() * 0.25) * S;
  const walls = ['#FBF1DE', '#F6E3C8', '#F3E9D6', '#FCEBDD', '#EEF0DE', '#F8E6E6'];
  const wall = h.lit ? walls[seed % walls.length] : '#E2DED8';
  const roof = h.lit ? roofColor : '#B9B4AE';
  const tower = rnd() < 0.3;
  if (tower) {
    mesh(cylG(w * 0.42, w * 0.46, ht, 14), M(wall, { noise: 0.6 }), [0, ht / 2, 0], 1, [0, 0, 0], o);
    mesh(coneG(w * 0.56, ht * 0.95, 14), M(roof, { noise: 2, rim: 0.4 }), [0, ht + ht * 0.47, 0], 1, [0, 0, 0], o);
  } else {
    mesh(boxG(w, ht, d), M(wall, { noise: 0.6 }), [0, ht / 2, 0], 1, [0, 0, 0], o);
    const r = mesh(coneG(1, ht * 0.75, 4), M(roof, { noise: 2, rim: 0.4 }), [0, ht + ht * 0.37, 0], 1, [0, PI / 4, 0], o);
    r.scale.set((w / Math.SQRT2) * 1.2, 1, (d / Math.SQRT2) * 1.2);
    if (rnd() < 0.6) mesh(boxG(0.28, 0.6, 0.28), M(h.lit ? '#C9785A' : '#A8A39D'), [w * 0.25, ht + 0.6, -d * 0.15], 1, [0, 0, 0], o);
  }
  const fz = tower ? w * 0.44 : d / 2;
  mesh(boxG(0.58, 1.0, 0.06), M(h.lit ? '#A86F4C' : '#8F8984'), [0, 0.5, fz + 0.02], 1, [0, 0, 0], o);
  mesh(sphereG(0.04, 8, 6), M('#F6CF3E'), [0.18, 0.5, fz + 0.07], 1, [0, 0, 0], o);
  const winM = h.lit ? M('#FFD873', { flat: 0.9, rim: 0 }) : M('#6E7A88', { spec: 0.3 });
  for (const x of tower ? [0] : [-w * 0.3, w * 0.3]) {
    const y = tower ? ht * 0.78 : ht * 0.62;
    mesh(boxG(0.5, 0.46, 0.06), winM, [x, y, fz + (tower ? -0.04 : 0.02)], 1, [0, 0, 0], o);
    mesh(boxG(0.6, 0.07, 0.1), M('#FFFFFF'), [x, y - 0.26, fz + 0.05], 1, [0, 0, 0], o);
  }
  for (const x of [-w / 2 - 0.25, w / 2 + 0.25]) mesh(sphereG(0.36, 10, 8), M(h.lit ? '#9CC77A' : '#B5BDA8', { noise: 4 }), [x, 0.26, fz + 0.15], [1, 0.8, 1], [0, 0, 0], o);
  o.userData.front = fz;
  o.userData.tall = ht * 1.8;
  return o;
}

// 동화풍 알록달록 나무: 벚꽃·은행·단풍·연두·라벤더·하늘꽃·살구빛. 마을마다 주인공 색이 조금씩 달라요
export const TREE_PAL: Record<string, string[]> = {
  cherry: ['#F4A9BE', '#F8C0CF', '#FCD6E1'],
  ginkgo: ['#F2C94C', '#F7D96E', '#FBE79A'],
  maple: ['#EE8B47', '#F3A464', '#F7BD84'],
  red: ['#E8736A', '#F08C80', '#F6A99C'],
  mint: ['#93D07C', '#AEDD93', '#C6E9AA'],
  lav: ['#B39DE8', '#C6B5F0', '#D9CDF6'],
  sky: ['#93BFEC', '#AECFF2', '#C7DFF6'],
  peach: ['#F7A98A', '#F9BEA3', '#FCD3BF'],
  green: ['#8CC26A', '#A2CE7A', '#B8DA8C'],
};
const COLORFUL = ['cherry', 'ginkgo', 'maple', 'red', 'lav', 'sky', 'peach', 'mint'];
export const TOWN_PAL = ['cherry', 'maple', 'mint', 'ginkgo', 'sky', 'lav', 'red', 'mint'];
function tree(seed: number, s = 1, pal = 'green') {
  const o = new THREE.Group(), rnd = mulberry32(seed);
  const pine = rnd() < (pal === 'green' ? 0.35 : 0.12);
  mesh(cylG(0.13 * s, 0.18 * s, 1.3 * s, 7), M(pal === 'cherry' || pal === 'lav' ? '#7E5A44' : '#8A5E3C'), [0, 0.65 * s, 0], 1, [0, 0, 0], o);
  if (pine) {
    const pc = seed % 3 === 0 ? ['#5FAE8C', '#74BC9B'] : ['#6FA35E', '#7FB06A'];
    for (let i = 0; i < 3; i++) mesh(coneG((1.1 - i * 0.25) * s, 1.3 * s, 9), M(pc[i % 2], { noise: 3 }), [0, (1.3 + i * 0.7) * s, 0], 1, [0, rnd(), 0], o);
  } else {
    const c = TREE_PAL[pal] ?? TREE_PAL.green;
    for (let i = 0; i < 3; i++) mesh(sphereG((0.75 - i * 0.1) * s, 10, 8), M(c[i], { noise: 4 }), [(rnd() - 0.5) * 0.5 * s, (1.55 + i * 0.42) * s, (rnd() - 0.5) * 0.5 * s], 1, [0, 0, 0], o);
    if (pal === 'green' && rnd() < 0.3) for (let i = 0; i < 4; i++) mesh(sphereG(0.09 * s, 6, 5), M('#E3645A'), [Math.cos(i * 1.7) * 0.6 * s, (1.5 + rnd() * 0.6) * s, Math.sin(i * 1.7) * 0.6 * s], 1, [0, 0, 0], o);
    // 꽃잎·낙엽이 나무 밑에 떨어져 있어요
    if (pal !== 'green') for (let i = 0; i < 7; i++) { const a = rnd() * PI * 2, r = (0.35 + rnd() * 0.75) * s; mesh(cylG(0.09 + rnd() * 0.06, 0.09, 0.02, 6), M(c[(i % 2) + 1], { flat: 0.3 }), [Math.cos(a) * r, 0.08, Math.sin(a) * r], 1, [0, rnd() * 3, 0], o); }
  }
  return o;
}
function mushroom(seed: number) {
  const o = new THREE.Group(), rnd = mulberry32(seed);
  const s = 0.6 + rnd() * 0.5;
  mesh(cylG(0.12 * s, 0.16 * s, 0.5 * s, 8), M('#FFF6E6'), [0, 0.25 * s, 0], 1, [0, 0, 0], o);
  mesh(sphereG(0.38 * s, 12, 8), M(rnd() < 0.5 ? '#E3645A' : '#F0974A'), [0, 0.45 * s, 0], [1, 0.7, 1], [0, 0, 0], o);
  return o;
}
function well() {
  const o = new THREE.Group();
  mesh(cylG(0.9, 1.0, 0.8, 14), M('#C9C2B6', { noise: 3 }), [0, 0.4, 0], 1, [0, 0, 0], o);
  mesh(cylG(0.72, 0.72, 0.05, 14), M('#7FB8DA', { flat: 0.5 }), [0, 0.78, 0], 1, [0, 0, 0], o);
  for (const x of [-0.8, 0.8]) mesh(boxG(0.12, 1.5, 0.12), M('#8A5E3C'), [x, 1.3, 0], 1, [0, 0, 0], o);
  const r = mesh(coneG(1, 0.7, 4), M('#C2563A', { noise: 2 }), [0, 2.3, 0], 1, [0, PI / 4, 0], o);
  r.scale.set(1.0, 1, 0.75);
  return o;
}

// 라면 가게 겉모습 (골목이 시작하는 곳)
function shopFront(): THREE.Group {
  const o = new THREE.Group();
  mesh(boxG(5.2, 3.4, 4), M('#F4E2C4', { noise: 0.8 }), [0, 1.7, 0], 1, [0, 0, 0], o);
  mesh(boxG(5.6, 0.25, 4.4), M('#C2563A'), [0, 3.5, 0], 1, [0, 0, 0], o);
  const r = mesh(coneG(1, 1.5, 4), M('#D9694A', { noise: 3 }), [0, 4.35, 0], 1, [0, PI / 4, 0], o);
  r.scale.set(4.1, 1, 3.2);
  mesh(boxG(1.4, 2.3, 0.08), M('#A86F4C'), [-1.0, 1.15, 2.02], 1, [0, 0, 0], o);
  for (let i = 0; i < 3; i++) mesh(boxG(0.44, 0.8, 0.03), M(i === 1 ? '#C2563A' : '#D9694A'), [-1.45 + i * 0.46, 2.05, 2.1], 1, [0, 0, 0], o);
  mesh(boxG(1.6, 1.1, 0.06), M('#FFD873', { flat: 0.85 }), [1.2, 1.6, 2.03], 1, [0, 0, 0], o);
  return o;
}

// 마을 가게들: 줄무늬 차양, 간판, 가게마다 진열 소품
export interface VShop { name: string; wall: string; awn: [string, string]; line: string; kind: 'bread' | 'flower' | 'pencil' | 'book' | 'icecream' }
export const SHOPS: VShop[] = [
  { name: '폭신 빵집', wall: '#FCE3D6', awn: ['#E98BA3', '#FFFFFF'], line: '🥐 폭신 빵집: 갓 구운 빵 냄새가 골목까지 퍼져요.', kind: 'bread' },
  { name: '방긋 꽃집', wall: '#E7F3DD', awn: ['#47AE7A', '#FFFFFF'], line: '🌷 방긋 꽃집: 오늘 고마운 사람에게 꽃 한 송이 어때요?', kind: 'flower' },
  { name: '알록 문구점', wall: '#DDEFFA', awn: ['#6FB3E0', '#FFFFFF'], line: '✏️ 알록 문구점: 친구에게 쓸 편지지가 가득해요.', kind: 'pencil' },
  { name: '소곤 책방', wall: '#ECE5F7', awn: ['#A68BD6', '#FFFFFF'], line: '📚 소곤 책방: 마음이 궁금할 때 읽는 책이 있어요.', kind: 'book' },
  { name: '사르르 아이스크림', wall: '#FFF4D6', awn: ['#F0974A', '#FFFFFF'], line: '🍦 사르르 아이스크림: 화가 날 땐 시원하게 한 숟가락!', kind: 'icecream' },
];
function shopBuilding(sh: VShop): THREE.Group {
  const o = new THREE.Group();
  const W = 4.2, H = 2.8, D = 3.4;
  mesh(boxG(W, H, D), M(sh.wall, { noise: 0.6 }), [0, H / 2, 0], 1, [0, 0, 0], o);
  const r = mesh(coneG(1, 1.2, 4), M(darken(sh.awn[0], 0.12), { noise: 2 }), [0, H + 0.6, 0], 1, [0, PI / 4, 0], o);
  r.scale.set(W / Math.SQRT2 * 1.15, 1, D / Math.SQRT2 * 1.15);
  // 줄무늬 차양
  for (let i = 0; i < 8; i++) mesh(boxG(W / 8, 0.06, 1.1), M(sh.awn[i % 2]), [-W / 2 + W / 16 + (i * W) / 8, H - 0.55, D / 2 + 0.45], 1, [0.42, 0, 0], o);
  mesh(boxG(1.0, 1.8, 0.06), M('#A86F4C'), [-1.1, 0.9, D / 2 + 0.03], 1, [0, 0, 0], o);
  mesh(boxG(1.6, 1.1, 0.06), M('#FFE9A8', { flat: 0.8 }), [0.9, 1.25, D / 2 + 0.03], 1, [0, 0, 0], o);
  // 가게 앞 진열대
  mesh(boxG(1.6, 0.6, 0.6), M('#C9A36E'), [0.9, 0.3, D / 2 + 0.55], 1, [0, 0, 0], o);
  const top = D / 2 + 0.55;
  const rnd = mulberry32(sh.name.length * 31);
  if (sh.kind === 'bread') for (let i = 0; i < 5; i++) mesh(sphereG(0.16, 10, 8), M(i % 2 ? '#D9A066' : '#C98A4E', { noise: 3 }), [0.3 + i * 0.3, 0.68, top], [1.3, 0.8, 1], [0, rnd(), 0], o);
  if (sh.kind === 'flower') for (let i = 0; i < 5; i++) { mesh(cylG(0.12, 0.09, 0.2, 8), M('#C2563A'), [0.3 + i * 0.3, 0.7, top], 1, [0, 0, 0], o); mesh(sphereG(0.13, 8, 6), M(['#F7B3C2', '#FFE08A', '#E3645A', '#C9B6F0', '#FFFFFF'][i]), [0.3 + i * 0.3, 0.9, top], 1, [0, 0, 0], o); }
  if (sh.kind === 'pencil') for (let i = 0; i < 7; i++) mesh(cylG(0.05, 0.05, 0.6, 6), M(['#E3645A', '#F0974A', '#E9B92A', '#47AE7A', '#6FB3E0', '#A68BD6', '#E98BA3'][i]), [0.25 + i * 0.22, 0.88, top], 1, [0.2, 0, (i - 3) * 0.06], o);
  if (sh.kind === 'book') for (let i = 0; i < 6; i++) mesh(boxG(0.22, 0.32, 0.4), M(['#A68BD6', '#6FB3E0', '#E9B92A', '#E3645A', '#47AE7A', '#F0974A'][i]), [0.3 + i * 0.24, 0.76, top], 1, [0, 0, (rnd() - 0.5) * 0.2], o);
  if (sh.kind === 'icecream') { mesh(coneG(0.5, 1.3, 12), M('#E3B37A', { noise: 3 }), [0, H + 1.35, 0], 1, [PI, 0, 0], o); for (const [c, y] of [['#F7B3C2', 2.15], ['#FFF4D6', 2.6]] as const) mesh(sphereG(0.6, 14, 10), M(c), [0, H + y, 0], 1, [0, 0, 0], o); }
  return o;
}

// 겹쳐 그리는 정적인 물체는 재질별로 한 덩어리로 합쳐서 그려요 (태블릿이 버벅이지 않게)
function mergeStatic(src: THREE.Group, into: THREE.Group) {
  src.updateMatrixWorld(true);
  const inv = into.matrixWorld.clone().invert();
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  src.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material)) return;
    let g = m.geometry.clone();
    if (!g.index) g = g.toNonIndexed();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const list = byMat.get(m.material) ?? [];
    list.push(g); byMat.set(m.material, list);
  });
  for (const [mat, list] of byMat) {
    const ix = list.filter((g) => g.index), nx = list.filter((g) => !g.index);
    for (const part of [ix, nx]) {
      if (!part.length) continue;
      const geo = mergeGeometries(part, false);
      part.forEach((g) => g.dispose());
      if (!geo) continue;
      const mm = new THREE.Mesh(geo, mat);
      mm.userData.ownGeo = true;
      into.add(mm);
    }
  }
}

export function buildVillage(houses: VHouse[], towns: VTown[], villagers: ChibiSpec[]): Village {
  const root = new THREE.Group();
  const stat = new THREE.Group(); // 합칠 것들
  const own: THREE.Object3D[] = [];
  const rnd = mulberry32(77);
  // 냇물 곡선과 거리표
  const river = new THREE.CatmullRomCurve3(RIVER.map(([x, z]) => V(x, 0, z)), false, 'centripetal');
  const rp = river.getSpacedPoints(700);
  const riverD = (x: number, z: number) => { let m = 1e9; for (const p of rp) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < m) m = d; } return Math.sqrt(m); };
  const GR = 2, gw = Math.ceil((BX1 - BX0) / GR) + 1, gd = Math.ceil((BZ1 - BZ0) / GR) + 1;
  const rgrid = new Float32Array(gw * gd);
  for (let j = 0; j < gd; j++) for (let i = 0; i < gw; i++) rgrid[j * gw + i] = riverD(BX0 + i * GR, BZ0 + j * GR);
  const rdist = (x: number, z: number) => {
    const fx = Math.max(0, Math.min(gw - 1.001, (x - BX0) / GR)), fz = Math.max(0, Math.min(gd - 1.001, (z - BZ0) / GR));
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const a = rgrid[j * gw + i], b = rgrid[j * gw + i + 1], c = rgrid[(j + 1) * gw + i], d = rgrid[(j + 1) * gw + i + 1];
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  };
  const base = (x: number, z: number) => hills(x, z) + mountains(x, z);

  // ── 골목과 집 자리 (먼저 평면에서 정해요) ──
  const lanes = towns.map((_, k) => {
    const [cx, cz, a] = LANES[k];
    const d = V(Math.cos(a), 0, Math.sin(a)), n = V(-d.z, 0, d.x);
    const w = () => (rnd() - 0.5) * 7;
    const pts = [-18, -7, 5, 17].map((t, i) => V(cx, 0, cz).addScaledVector(d, t).addScaledVector(n, i % 2 ? 3.5 + w() * 0.4 : -3.5 + w() * 0.4));
    return new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  });
  const pads: { x: number; z: number; y: number }[] = [];
  const plan: { h: VHouse; k: number; x: number; z: number; yaw: number }[] = [];
  towns.forEach((t, k) => {
    const list = houses.filter((h) => h.family === t.family);
    const lane = lanes[k], L = lane.getLength();
    list.forEach((h, i) => {
      // 골목 양쪽에 번갈아, 조금씩 들쭉날쭉하게
      const u = Math.min(0.97, 0.06 + (i / Math.max(1, list.length - 1)) * 0.9 + (rnd() - 0.5) * 0.02);
      const p = lane.getPointAt(u), tg = lane.getTangentAt(u), n = V(-tg.z, 0, tg.x);
      const side = i % 2 ? 1 : -1, off = 4.6 + rnd() * 1.4;
      const x = p.x + n.x * side * off, z = p.z + n.z * side * off;
      const yaw = Math.atan2(p.x - x, p.z - z) + (rnd() - 0.5) * 0.3;
      plan.push({ h, k, x, z, yaw });
      pads.push({ x, z, y: base(x, z) });
      void L;
    });
  });
  const shopY = Math.max(1, base(SHOP.x, SHOP.z));
  const heightAt = (x: number, z: number) => {
    let h = base(x, z);
    // 집 자리는 조금씩 평평하게 (계단처럼 높낮이가 생겨요)
    for (const p of pads) {
      const dd = (x - p.x) ** 2 + (z - p.z) ** 2;
      if (dd > 36) continue;
      const s = smooth(2.6, 6, Math.sqrt(dd));
      h = p.y * (1 - s) + h * s;
    }
    { const s = smooth(6, 12, Math.hypot(x - SHOP.x, z - SHOP.z)); h = shopY * (1 - s) + h * s; }
    const s = smooth(2.6, 8, rdist(x, z));
    return -1.6 * (1 - s) + h * s;
  };

  // ── 큰길: 가게에서 마을 골목 어귀까지 구불구불, 이웃 골목끼리도 이어요 ──
  const door = V(SHOP.x - 1, 0, SHOP.z + 3.2);
  const roads: THREE.CatmullRomCurve3[] = [];
  const near = (c: THREE.CatmullRomCurve3, p: THREE.Vector3) => { const a = c.getPointAt(0), b = c.getPointAt(1); return a.distanceTo(p) < b.distanceTo(p) ? a : b; };
  const far = (c: THREE.CatmullRomCurve3, p: THREE.Vector3) => { const a = c.getPointAt(0), b = c.getPointAt(1); return a.distanceTo(p) < b.distanceTo(p) ? b : a; };
  // 냇물의 어느 쪽인지 (+1 / -1)
  const riverSide = (p: THREE.Vector3) => {
    let bi = 0, bd = 1e18;
    for (let i = 0; i < rp.length; i++) { const d = (rp[i].x - p.x) ** 2 + (rp[i].z - p.z) ** 2; if (d < bd) { bd = d; bi = i; } }
    const a = rp[Math.max(0, bi - 1)], b = rp[Math.min(rp.length - 1, bi + 1)];
    return Math.sign((b.x - a.x) * (p.z - rp[bi].z) - (b.z - a.z) * (p.x - rp[bi].x)) || 1;
  };
  const wind = (a: THREE.Vector3, b: THREE.Vector3, k: number, amt = 0.16) => {
    const dir = V().subVectors(b, a), len = dir.length(), n = V(-dir.z, 0, dir.x).normalize(), w = (k % 2 ? 1 : -1) * Math.min(10, len * amt);
    if (riverSide(a) !== riverSide(b)) {
      // 냇물을 건너는 길: 냇물과 직각으로 짧게 건너요 (냇물을 따라 길게 놓인 다리가 생기지 않게)
      let bi = 0, bd = 1e18;
      for (let i = 1; i < rp.length - 1; i++) {
        const q = rp[i], u = Math.max(0, Math.min(1, ((q.x - a.x) * dir.x + (q.z - a.z) * dir.z) / (len * len)));
        const d = (a.x + dir.x * u - q.x) ** 2 + (a.z + dir.z * u - q.z) ** 2;
        if (d < bd) { bd = d; bi = i; }
      }
      const c = rp[bi], t = V().subVectors(rp[bi + 1], rp[bi - 1]).normalize(), rn = V(-t.z, 0, t.x);
      if ((a.x - c.x) * rn.x + (a.z - c.z) * rn.z < 0) rn.negate();
      const pa = c.clone().addScaledVector(rn, 10), pb = c.clone().addScaledVector(rn, -10);
      const wa = Math.min(6, a.distanceTo(pa) * amt), wb = Math.min(6, b.distanceTo(pb) * amt);
      const na = V(-(pa.z - a.z), 0, pa.x - a.x).normalize(), nb = V(-(b.z - pb.z), 0, b.x - pb.x).normalize();
      const mid = (p: THREE.Vector3, q: THREE.Vector3, nn: THREE.Vector3, ww: number) => p.clone().lerp(q, 0.5).addScaledVector(nn, ww);
      const ctrl = [a.clone()];
      if (a.distanceTo(pa) > 14) ctrl.push(mid(a, pa, na, wa));
      ctrl.push(pa, pb);
      if (b.distanceTo(pb) > 14) ctrl.push(mid(pb, b, nb, -wb));
      ctrl.push(b.clone());
      return new THREE.CatmullRomCurve3(ctrl, false, 'centripetal');
    }
    return new THREE.CatmullRomCurve3([a.clone(), a.clone().lerp(b, 0.33).addScaledVector(n, w), a.clone().lerp(b, 0.66).addScaledVector(n, -w * 0.9), b.clone()], false, 'centripetal');
  };
  lanes.forEach((ln, k) => roads.push(wind(door, near(ln, door), k)));
  const half = Math.floor(lanes.length / 2);
  for (const [i, j] of [[0, 1], [1, 2], [2, 3], [4, 5], [5, 6], [6, 7]]) {
    if (i >= lanes.length || j >= lanes.length || (i < half) !== (j < half)) continue;
    const a = far(lanes[i], door), b = near(lanes[j], a);
    roads.push(wind(a, b, i + j, 0.12));
  }
  const allPaths = [...roads, ...lanes];
  const pathPtsEarly = allPaths.flatMap((p) => p.getSpacedPoints(90));
  // 다리: 큰길이 냇물을 건너는 곳
  const bridges: { a: THREE.Vector3; b: THREE.Vector3; ya: number; yb: number }[] = [];
  for (const p of roads) {
    const pts = p.getSpacedPoints(Math.ceil(p.getLength() / 0.5));
    let s0 = -1;
    for (let i = 0; i < pts.length; i++) {
      const wet = rdist(pts[i].x, pts[i].z) < 6.2;
      if (wet && s0 < 0) s0 = i;
      if ((!wet || i === pts.length - 1) && s0 >= 0) {
        const a = pts[Math.max(0, s0 - 1)], b = pts[i];
        // 냇물을 정말 건널 때만 다리를 놓아요 (냇가를 스치기만 하면 놓지 않아요)
        if (riverSide(a) !== riverSide(b) && a.distanceTo(b) < 22) bridges.push({ a: a.clone(), b: b.clone(), ya: heightAt(a.x, a.z), yb: heightAt(b.x, b.z) });
        s0 = -1;
      }
    }
  }
  const bridgeAt = (x: number, z: number): number | null => {
    for (const br of bridges) {
      const ab = V().subVectors(br.b, br.a), L = ab.length(), u = ((x - br.a.x) * ab.x + (z - br.a.z) * ab.z) / (L * L);
      if (u < -0.02 || u > 1.02) continue;
      const lat = Math.abs((x - br.a.x) * ab.z - (z - br.a.z) * ab.x) / L;
      if (lat > 1.5) continue;
      const k = Math.max(0, Math.min(1, u));
      return br.ya * (1 - k) + br.yb * k + Math.sin(k * PI) * 0.9 + 0.12;
    }
    return null;
  };
  const walkY = (x: number, z: number) => bridgeAt(x, z) ?? heightAt(x, z);
  const inWater = (x: number, z: number) => rdist(x, z) < 3.4 && bridgeAt(x, z) === null;

  // ── 땅 그림: 풀밭, 냇가 모래, 큰길과 골목, 꽃 ──
  const TW = 2400, TH = Math.round(TW * (Z1 - Z0) / (X1 - X0));
  const cv = makeCanvas(TW, TH), g = ctx2d(cv);
  const px = (x: number) => mapU(x) * TW, pz = (z: number) => mapV(z) * TH, pm = (IN * TW) / (X1 - X0);
  g.fillStyle = '#CDEAA6'; g.fillRect(0, 0, TW, TH);
  // 바깥 산: 높을수록 짙은 숲빛, 꼭대기는 바위빛
  {
    const step = 6;
    for (let yy = 0; yy < TH; yy += step) for (let xx = 0; xx < TW; xx += step) {
      const u = (xx + step / 2) / TW, v = (yy + step / 2) / TH;
      if (u > OUTU && u < 1 - OUTU && v > OUTU && v < 1 - OUTU) continue;
      const x = u < OUTU ? BX0 + (u / OUTU) * (X0 - BX0) : u > 1 - OUTU ? X1 + ((u - 1 + OUTU) / OUTU) * (BX1 - X1) : X0 + ((u - OUTU) / IN) * (X1 - X0);
      const z = v < OUTU ? BZ0 + (v / OUTU) * (Z0 - BZ0) : v > 1 - OUTU ? Z1 + ((v - 1 + OUTU) / OUTU) * (BZ1 - Z1) : Z0 + ((v - OUTU) / IN) * (Z1 - Z0);
      const hm = mountains(x, z);
      g.fillStyle = hm > 22 ? mix('#A9C595', '#D6CFC4', Math.min(1, (hm - 22) / 8)) : mix('#CFE6A0', '#9DC583', Math.min(1, hm / 18));
      g.fillRect(xx, yy, step, step);
    }
  }
  for (let i = 0; i < 360; i++) blob(g, rnd() * TW, rnd() * TH, 30 + rnd() * 90, 20 + rnd() * 60, rnd() < 0.5 ? '#E6F4BE' : '#C3DF94', rnd, { layers: 2, alpha: 0.16, edge: 0 });
  const stroke = (pts: THREE.Vector3[], color: string, width: number, alpha = 1, dash?: number[]) => {
    g.save(); g.globalAlpha = alpha; g.strokeStyle = color; g.lineWidth = width * pm; g.lineCap = 'round'; g.lineJoin = 'round';
    if (dash) g.setLineDash(dash.map((x) => x * pm));
    g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(px(p.x), pz(p.z)) : g.moveTo(px(p.x), pz(p.z)))); g.stroke(); g.restore();
  };
  stroke(rp, '#E8DDB6', 13, 0.7); stroke(rp, '#E2D3A6', 9.5);
  for (const p of roads) { const pts = p.getSpacedPoints(140); stroke(pts, '#E3CFA6', 3.4, 0.45); stroke(pts, '#E9D7B0', 2.4); }
  for (const p of lanes) { const pts = p.getSpacedPoints(80); stroke(pts, '#DCC8A0', 4.2, 0.4); stroke(pts, '#EADBBE', 3.2); stroke(pts, '#D9C59C', 0.35, 0.8, [0.7, 0.6]); }
  // 집 앞 작은 마당
  for (const q of plan) { g.fillStyle = '#E6D5B2'; g.globalAlpha = 0.55; g.beginPath(); g.ellipse(px(q.x), pz(q.z), 3.2 * pm, 3.2 * pm, 0, 0, 7); g.fill(); }
  g.globalAlpha = 1;
  // 들꽃: 더 많이, 더 화사하게 (색은 따로 골라 다른 자리는 그대로)
  const flRnd = mulberry32(777);
  for (let i = 0; i < 900; i++) {
    const x = X0 + flRnd() * (X1 - X0), z = Z0 + flRnd() * (Z1 - Z0);
    if (rdist(x, z) < 8) continue;
    g.fillStyle = ['#FF9FB7', '#FFD95E', '#FFFFFF', '#B9A2F2', '#FFB27A', '#8FD3F5'][i % 6];
    g.globalAlpha = 0.85;
    for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(px(x) + (flRnd() - 0.5) * 12, pz(z) + (flRnd() - 0.5) * 12, 2.2 + flRnd() * 2.4, 0, 7); g.fill(); }
  }
  for (let i = 0; i < 1100; i++) {
    const x = X0 + rnd() * (X1 - X0), z = Z0 + rnd() * (Z1 - Z0);
    if (rdist(x, z) < 8) continue;
    g.fillStyle = ['#F7B3C2', '#FFE08A', '#FFFFFF', '#C9B6F0', '#F9C38E'][i % 5];
    g.globalAlpha = 0.9;
    for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(px(x) + (rnd() - 0.5) * 14, pz(z) + (rnd() - 0.5) * 14, 2 + rnd() * 2.2, 0, 7); g.fill(); }
  }
  g.globalAlpha = 1;
  const groundTex = tex(cv);
  groundTex.anisotropy = 4;
  const axis = (b0: number, a0: number, a1: number, b1: number) => {
    const out: number[] = [];
    for (let v = b0; v < a0 - 0.01; v += 5) out.push(v);
    for (let v = a0; v < a1 - 0.01; v += 1.4) out.push(v);
    for (let v = a1; v < b1 - 0.01; v += 5) out.push(v);
    out.push(b1);
    return out;
  };
  const xs = axis(BX0, X0, X1, BX1), zs = axis(BZ0, Z0, Z1, BZ1);
  const gv: number[] = [], guv: number[] = [], gix: number[] = [];
  for (const z of zs) for (const x of xs) { gv.push(x, heightAt(x, z), z); guv.push(mapU(x), 1 - mapV(z)); }
  for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) {
    const a = j * xs.length + i, b = a + 1, c = a + xs.length, d = c + 1;
    gix.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(gv, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(guv, 2));
  geo.setIndex(gix);
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, Mu('#FFFFFF', { map: groundTex, rim: 0 }));
  ground.userData.ownGeo = true;
  root.add(ground); own.push(ground);
  const skyCv = makeCanvas(8, 256), sg = ctx2d(skyCv), gr = sg.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#8FCBF2'); gr.addColorStop(0.36, '#CDE8F8'); gr.addColorStop(0.47, '#FFF0D6'); gr.addColorStop(0.5, '#FFE9C8'); gr.addColorStop(0.52, '#CDEAA6'); gr.addColorStop(1, '#CDEAA6');
  sg.fillStyle = gr; sg.fillRect(0, 0, 8, 256);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(520, 32, 16), Mu('#FFFFFF', { map: tex(skyCv), flat: 1, rim: 0, side: THREE.BackSide }));
  sky.userData.ownGeo = true; root.add(sky); own.push(sky);
  // 아주 먼 산줄기 (땅 끝 너머)
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * PI * 2, r = 330 + rnd() * 40;
    mesh(sphereG(1, 20, 10), M(i % 2 ? '#A8C7A0' : '#9DBDA0', { flat: 0.6, rim: 0 }), [Math.cos(a) * r, 0, Math.sin(a) * r], [70 + rnd() * 40, 40 + rnd() * 20, 50], [0, a, 0], stat);
  }

  // 냇물
  {
    const pts = river.getSpacedPoints(560), vs: number[] = [], ix: number[] = [];
    pts.forEach((p, i) => {
      const t = river.getTangentAt(i / (pts.length - 1)), n = V(-t.z, 0, t.x).normalize();
      for (const s2 of [-1, 1]) vs.push(p.x + n.x * s2 * 3.8, WATER, p.z + n.z * s2 * 3.8);
      if (i) { const b0 = (i - 1) * 2; ix.push(b0, b0 + 2, b0 + 1, b0 + 1, b0 + 2, b0 + 3); }
    });
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(vs, 3)); wg.setIndex(ix); wg.computeVertexNormals();
    const water = new THREE.Mesh(wg, Mu('#86CDF0', { flat: 0.5, spec: 0.9, rim: 0.2, alpha: 0.9, side: THREE.DoubleSide }));
    water.userData.ownGeo = true; root.add(water);
    for (let i = 0; i < 46; i++) { const p = river.getPointAt(rnd()); mesh(boxG(0.9 + rnd(), 0.02, 0.12), M('#FFFFFF', { flat: 1, alpha: 0.8 }), [p.x + (rnd() - 0.5) * 3, WATER + 0.03, p.z + (rnd() - 0.5) * 3], 1, [0, rnd() * 3, 0], stat); }
    for (let i = 0; i < 80; i++) { const p = river.getPointAt(rnd()), a = rnd() * PI * 2, r = 3.6 + rnd() * 1.6; const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r; mesh(sphereG(0.3 + rnd() * 0.35, 8, 6), M(rnd() < 0.5 ? '#C9C2B6' : '#B6AEA2', { noise: 3 }), [x, heightAt(x, z) + 0.05, z], [1, 0.55, 0.8], [0, rnd() * 3, 0], stat); }
  }
  for (const br of bridges) {
    const ab = V().subVectors(br.b, br.a), L = ab.length(), yaw = Math.atan2(ab.x, ab.z);
    const n = Math.ceil(L / 0.45);
    for (let i = 0; i <= n; i++) {
      const k = i / n, x = br.a.x + ab.x * k, z = br.a.z + ab.z * k, y = br.ya * (1 - k) + br.yb * k + Math.sin(k * PI) * 0.9;
      const pl = mesh(boxG(2.6, 0.14, 0.4), M(i % 2 ? '#B98A5E' : '#A87B52', { noise: 2 }), [x, y, z], 1, [0, 0, 0], stat);
      pl.rotation.set(-Math.cos(k * PI) * 0.18, yaw, 0, 'YXZ');
      if (i % 3 === 0) for (const s2 of [-1, 1]) mesh(boxG(0.12, 0.8, 0.12), M('#8A5E3C'), [x + Math.cos(yaw) * 1.25 * s2, y + 0.4, z - Math.sin(yaw) * 1.25 * s2], 1, [0, yaw, 0], stat);
    }
    // 난간: 기둥 꼭대기를 따라 아치 모양으로
    const rail = (k: number) => { const x = br.a.x + ab.x * k, z = br.a.z + ab.z * k; return V(x, br.ya * (1 - k) + br.yb * k + Math.sin(k * PI) * 0.9 + 0.78, z); };
    for (let i = 0; i < n; i++) for (const s2 of [-1, 1]) {
      const a = rail(i / n), b = rail((i + 1) / n), off = V(Math.cos(yaw) * 1.25 * s2, 0, -Math.sin(yaw) * 1.25 * s2);
      a.add(off); b.add(off);
      const len = a.distanceTo(b), mid = a.clone().add(b).multiplyScalar(0.5);
      const r = mesh(boxG(0.09, 0.09, len + 0.02), M('#9A6B45'), [mid.x, mid.y, mid.z], 1, [0, 0, 0], stat);
      r.lookAt(b.x, b.y, b.z);
      // 다리 밑 받침보 (널빤지가 계단처럼 떠 보이지 않게)
      const lo = V(0, -0.9, 0).addScaledVector(off, 0.84 - 1);
      const sa = a.clone().add(lo), sb = b.clone().add(lo), sm = sa.clone().add(sb).multiplyScalar(0.5);
      const st = mesh(boxG(0.16, 0.2, len + 0.04), M('#8A5E3C', { noise: 2 }), [sm.x, sm.y, sm.z], 1, [0, 0, 0], stat);
      st.lookAt(sb.x, sb.y, sb.z);
    }
  }

  // 라면 가게
  const shop = shopFront(); shop.position.set(SHOP.x, shopY, SHOP.z); stat.add(shop);
  const shopSign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.7), Mu('#FFFFFF', { map: sign('마음라면 가게', 360, 100, '#FFF6E6', '#C2563A'), flat: 0.9, rim: 0 }));
  shopSign.position.set(SHOP.x, shopY + 2.9, SHOP.z + 2.06); shopSign.userData.ownGeo = true; root.add(shopSign); own.push(shopSign);
  const sgl = makeGlow('#FFD27A', 3, 0.35); sgl.position.set(SHOP.x + 1.2, shopY + 1.6, SHOP.z + 2.3); root.add(sgl);

  // ── 마을 가게들: 라면 가게에서 가까운 큰길 가 ──
  const shopHits: VShopSpot[] = [];
  const shopSpots: [number, number][] = [];
  SHOPS.forEach((sh, i) => {
    for (let tries = 0; tries < 12; tries++) {
      const road = roads[(i * 3 + tries) % lanes.length], u = 0.12 + (tries % 4) * 0.06 + i * 0.015;
      const p = road.getPointAt(Math.min(0.6, u)), tg = road.getTangentAt(Math.min(0.6, u)), n = V(-tg.z, 0, tg.x);
      const side = (i + tries) % 2 ? 1 : -1;
      const x = p.x + n.x * side * 6.5, z = p.z + n.z * side * 6.5;
      if (Math.hypot(x - SHOP.x, z - SHOP.z) < 12 || rdist(x, z) < 11) continue;
      if (plan.some((q) => Math.hypot(q.x - x, q.z - z) < 8) || shopSpots.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 9)) continue;
      if (pathPtsEarly.some((q) => (q.x - x) ** 2 + (q.z - z) ** 2 < 3.6 ** 2)) continue;
      const yaw = Math.atan2(p.x - x, p.z - z);
      const y = heightAt(x, z);
      const b = shopBuilding(sh); b.position.set(x, y, z); b.rotation.y = yaw; stat.add(b);
      const fwd = V(Math.sin(yaw), 0, Math.cos(yaw));
      // 간판은 지붕 앞에 세워요 (위에서 내려다봐도 보이게 살짝 뒤로 눕혀요)
      const sg2 = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.8), Mu('#FFFFFF', { map: sign(sh.name, 420, 112, '#FFFDF6', darken(sh.awn[0], 0.35), 52), flat: 0.9, rim: 0, side: THREE.DoubleSide }));
      sg2.userData.ownGeo = true; sg2.position.set(x, y + 3.25, z).addScaledVector(fwd, 2.1); sg2.rotation.set(-0.35, yaw, 0, 'YXZ'); root.add(sg2); own.push(sg2);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(4.6, 4, 4.4), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.set(x, y + 2, z); hit.rotation.y = yaw; hit.userData.shopLine = sh.line; hit.userData.shopKind = sh.kind; hit.userData.ownGeo = true;
      root.add(hit);
      const front = V(x, y, z).addScaledVector(fwd, 3.4); front.y = heightAt(front.x, front.z);
      shopHits.push({ hit, kind: sh.kind, name: sh.name, front, yaw });
      shopSpots.push([x, z]);
      break;
    }
  });

  // ── 집 ──
  const spots: VHouseSpot[] = [];
  const hits: THREE.Mesh[] = [];
  const solids: [number, number, number][] = shopSpots.map(([x, z]) => [x, z, 3.0] as [number, number, number]);
  const hitGeo = new THREE.BoxGeometry(3.2, 4.4, 3.0);
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  plan.forEach((q, i) => {
    const { h, k, x, z, yaw } = q;
    const y = heightAt(x, z);
    const obj = makeHouse(h, towns[k].color, i + k * 3);
    obj.position.set(x, y, z); obj.rotation.y = yaw;
    stat.add(obj);
    const front = obj.userData.front as number;
    const fwd = V(Math.sin(yaw), 0, Math.cos(yaw));
    const doorP = V(x, y, z).addScaledVector(fwd, front + 0.1);
    const out = doorP.clone().addScaledVector(fwd, 1.6); out.y = heightAt(out.x, out.z);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.42), Mu('#FFFFFF', { map: sign(h.lit ? h.name : '?', 320, 90, h.lit ? '#FFF8EC' : '#EDEAE6', h.lit ? '#5B3A29' : '#9A948E'), flat: 0.9, rim: 0 }));
    plate.userData.ownGeo = true;
    plate.position.copy(doorP).addScaledVector(fwd, 0.04).setY(y + 1.32); plate.rotation.y = yaw;
    root.add(plate); own.push(plate);
    const ns = Math.min(3, h.stars);
    for (let s2 = 0; s2 < ns; s2++) mesh(sphereG(0.09, 8, 6), M('#F6B93B', { flat: 0.6 }), [doorP.x + Math.cos(yaw) * (s2 - (ns - 1) / 2) * 0.24, y + 1.68, doorP.z - Math.sin(yaw) * (s2 - (ns - 1) / 2) * 0.24], 1, [0, 0, 0], stat);
    if (h.lit) { const gl = makeGlow('#FFD27A', 2.2, 0.32); gl.position.copy(doorP).setY(y + 1.4).addScaledVector(fwd, 0.3); root.add(gl); }
    // 우편함
    mesh(boxG(0.1, 0.9, 0.1), M('#8A5E3C'), [doorP.x + Math.cos(yaw) * 1.3 + fwd.x * 0.9, y + 0.45, doorP.z - Math.sin(yaw) * 1.3 + fwd.z * 0.9], 1, [0, yaw, 0], stat);
    mesh(boxG(0.32, 0.24, 0.4), M(h.lit ? towns[k].color : '#B9B4AE'), [doorP.x + Math.cos(yaw) * 1.3 + fwd.x * 0.9, y + 0.98, doorP.z - Math.sin(yaw) * 1.3 + fwd.z * 0.9], 1, [0, yaw, 0], stat);
    const hit = new THREE.Mesh(hitGeo, hitMat);
    hit.position.set(x, y + 2.1, z); hit.rotation.y = yaw; hit.userData.house = spots.length;
    root.add(hit); hits.push(hit);
    spots.push({ h, hit, door: doorP, out, yaw, town: k });
    solids.push([x, z, 2.0]);
  });
  // 마을 팻말 (골목 어귀)과 골목 끝 우물
  const townInfo: Village['towns'] = [];
  const entries: THREE.Vector3[] = [];
  towns.forEach((t, k) => {
    const ln = lanes[k], entry = near(ln, door), endP = far(ln, door);
    entries.push(entry.clone());
    const fromStart = ln.getPointAt(0).distanceTo(door) < ln.getPointAt(1).distanceTo(door);
    const list = houses.filter((h) => h.family === t.family), lit = list.filter((h) => h.lit).length;
    const tg = V().subVectors(ln.getPointAt(fromStart ? 0.04 : 0.96), entry).normalize();
    const yaw = Math.atan2(-tg.x, -tg.z);
    const side = V(-tg.z, 0, tg.x);
    const sp = entry.clone().addScaledVector(side, 2.6).addScaledVector(tg, -1.5); sp.y = heightAt(sp.x, sp.z);
    const post = new THREE.Group();
    mesh(boxG(0.18, 2.4, 0.18), M('#8A5E3C'), [-1.4, 1.2, 0], 1, [0, 0, 0], post);
    mesh(boxG(0.18, 2.4, 0.18), M('#8A5E3C'), [1.4, 1.2, 0], 1, [0, 0, 0], post);
    post.position.copy(sp); post.rotation.y = yaw; stat.add(post);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 0.98), Mu('#FFFFFF', { map: sign(`${t.name} 마을  ${lit}/${list.length}`, 420, 130, lighten(t.color, 0.72), darken(t.color, 0.45), 56), flat: 0.9, rim: 0 }));
    board.userData.ownGeo = true; board.position.copy(sp).setY(sp.y + 1.9).add(V(Math.sin(yaw) * 0.12, 0, Math.cos(yaw) * 0.12)); board.rotation.y = yaw;
    root.add(board); own.push(board);
    const wp = endP.clone().addScaledVector(V().subVectors(endP, ln.getPointAt(fromStart ? 0.9 : 0.1)).normalize(), 3.2); wp.y = heightAt(wp.x, wp.z);
    const mid = k % 2 ? well() : tree(k * 11 + 3, 1.5, TOWN_PAL[k % TOWN_PAL.length]);
    mid.position.copy(wp); stat.add(mid);
    solids.push([wp.x, wp.z, 1.5]);
    const c = ln.getPointAt(0.5); c.y = heightAt(c.x, c.z);
    townInfo.push({ center: c, t, lit, total: list.length });
  });

  // ── 소품: 자리는 여기서 정하고, 놓이는 모양은 블렌더 물리로 구운 값을 써요 ──
  const props = planProps({
    rnd, heightAt, rdist, river: rp, paths: pathPtsEarly,
    houses: plan.map((q) => ({ x: q.x, z: q.z, yaw: q.yaw })),
    shops: shopHits.map((sh, i) => ({ x: shopSpots[i][0], z: shopSpots[i][1], yaw: sh.yaw })),
    entries, solids, shop: SHOP, rect: { x0: X0, x1: X1, z0: Z0, z1: Z1 },
  });
  const placed0 = placeProps(props, stat, root, heightAt);
  solids.push(...props.solids);
  // 나무, 버섯: 길·냇물·집·소품을 피해서
  const pathPts = allPaths.flatMap((p) => p.getSpacedPoints(90));
  const clear = (x: number, z: number, pad: number) => {
    if (rdist(x, z) < 7) return false;
    for (const sp of props.spots) if ((sp.x - x) ** 2 + (sp.z - z) ** 2 < (sp.r + 1.6 + pad) ** 2) return false;
    for (const [lx, , lz] of props.lamps) if ((lx - x) ** 2 + (lz - z) ** 2 < (1.4 + pad) ** 2) return false;
    if (Math.hypot(x - SHOP.x, z - SHOP.z) < 10 + pad) return false;
    for (const q of plan) if ((q.x - x) ** 2 + (q.z - z) ** 2 < (4.2 + pad) ** 2) return false;
    for (const p of pathPts) if ((p.x - x) ** 2 + (p.z - z) ** 2 < (2.8 + pad) ** 2) return false;
    return true;
  };
  // 나무 색: 가까운 마을의 주인공 색 → 그 밖의 알록달록한 색 → 초록 (자리는 그대로, 색만 따로 골라요)
  const palRnd = mulberry32(9090);
  const nearTown = (x: number, z: number) => { let bk = 0, bd = 1e9; townInfo.forEach((t, k) => { const d = (t.center.x - x) ** 2 + (t.center.z - z) ** 2; if (d < bd) { bd = d; bk = k; } }); return bk; };
  const pickPal = (x: number, z: number, colorful: number) => {
    const r = palRnd();
    if (r < colorful * 0.5) return TOWN_PAL[nearTown(x, z) % TOWN_PAL.length];
    if (r < colorful) return COLORFUL[Math.floor(palRnd() * COLORFUL.length)];
    return 'green';
  };
  let placed = 0;
  for (let i = 0; i < 1400 && placed < 230; i++) {
    const x = X0 + 2 + rnd() * (X1 - X0 - 4), z = Z0 + 2 + rnd() * (Z1 - Z0 - 4);
    if (!clear(x, z, 0.4)) continue;
    const t = tree(i, 0.9 + rnd() * 0.6, pickPal(x, z, 0.85)); t.position.set(x, heightAt(x, z) - 0.05, z); stat.add(t); placed++;
    solids.push([x, z, 0.8]);
  }
  // 마을 바깥 숲: 산자락으로 갈수록 소나무가 많아요
  for (let i = 0, n = 0; i < 2600 && n < 520; i++) {
    const x = BX0 + 6 + rnd() * (BX1 - BX0 - 12), z = BZ0 + 6 + rnd() * (BZ1 - BZ0 - 12);
    const dx = Math.max(X0 - x, 0, x - X1), dz = Math.max(Z0 - z, 0, z - Z1), d = Math.hypot(dx, dz);
    if (d < 3 || rdist(x, z) < 9 || rnd() > 0.35 + smooth(0, 40, d) * 0.65) continue;
    const t = tree(1000 + i, 1.1 + rnd() * 0.9, pickPal(x, z, 0.38 - smooth(0, 60, d) * 0.2)); t.position.set(x, heightAt(x, z) - 0.1, z); stat.add(t); n++;
  }
  for (let i = 0, n = 0; i < 500 && n < 50; i++) {
    const x = X0 + rnd() * (X1 - X0), z = Z0 + rnd() * (Z1 - Z0);
    if (!clear(x, z, -1.2)) continue;
    const m = mushroom(i); m.position.set(x, heightAt(x, z), z); stat.add(m); n++;
  }
  // ── 빛: 냇물 위 반짝임과 불 켜진 집 둘레를 떠도는 빛 알갱이 ──
  const fxRnd = mulberry32(5150);
  const glints: { s: THREE.Sprite; ph: number; sp: number }[] = [];
  for (let i = 0; i < 70; i++) {
    const p = river.getPointAt(fxRnd());
    if (p.x < X0 - 20 || p.x > X1 + 20) continue;
    const sm = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: '#FFFFFF', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    sm.position.set(p.x + (fxRnd() - 0.5) * 5, WATER + 0.12, p.z + (fxRnd() - 0.5) * 5);
    sm.scale.setScalar(0.5 + fxRnd() * 0.6); sm.renderOrder = 6;
    root.add(sm); glints.push({ s: sm, ph: fxRnd() * 10, sp: 1.5 + fxRnd() * 2 });
  }
  const moteSrc: THREE.Vector3[] = [];
  for (const sp of spots) if (sp.h.lit) for (let k = 0; k < 5; k++) moteSrc.push(V(sp.door.x + (fxRnd() - 0.5) * 4, sp.door.y + 0.4 + fxRnd() * 1.8, sp.door.z + (fxRnd() - 0.5) * 4));
  for (let k = 0; k < 24; k++) moteSrc.push(V(SHOP.x + (fxRnd() - 0.5) * 12, shopY + 0.5 + fxRnd() * 2.5, SHOP.z + 2 + (fxRnd() - 0.5) * 10));
  const moteGeo = new THREE.BufferGeometry();
  const motePos = new Float32Array(Math.max(1, moteSrc.length) * 3);
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({ map: glowTex(), color: '#FFE7A6', size: 0.34, sizeAttenuation: true, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
  motes.renderOrder = 7; motes.frustumCulled = false;
  root.add(motes);
  const merged = new THREE.Group();
  root.add(merged);
  mergeStatic(stat, merged);
  disposeTree(stat);

  // 동네 사람들: 길과 골목을 따라 천천히 오가요
  const npcHitGeo = new THREE.CylinderGeometry(0.75, 0.75, 2.2, 10);
  const npcs = villagers.map((s2, i) => {
    const ch = new Chibi(s2);
    const p = allPaths[(i * 5 + 1) % allPaths.length];
    const sh = makeShadow(0.7, 0.6, 0.45);
    root.add(ch.root); root.add(sh);
    ch.setMood(i % 3 ? 'happy' : 'neutral');
    const hit = new THREE.Mesh(npcHitGeo, hitMat);
    hit.position.y = 1.0; hit.userData.npc = i;
    ch.root.add(hit);
    return { ch, sh, p, hit, t: rnd(), dir: rnd() < 0.5 ? 1 : -1, speed: (0.9 + rnd() * 0.4) / p.getLength(), rest: 0, hold: false, faceTo: null as THREE.Vector3 | null };
  });
  const blocked = (x: number, z: number) => {
    if (inWater(x, z)) return true;
    if (Math.abs(x - SHOP.x) < 3.1 && Math.abs(z - SHOP.z) < 2.5) return true;
    for (const [sx, sz, r] of solids) if ((x - sx) ** 2 + (z - sz) ** 2 < r * r) return true;
    return x < X0 + 2 || x > X1 - 2 || z < Z0 + 2 || z > Z1 - 2;
  };
  const tmp = V();
  let clock = 0;
  const update = (dt: number, eye?: THREE.Vector3) => {
    clock += dt;
    for (const g2 of glints) { const k = Math.sin(clock * g2.sp + g2.ph); g2.s.material.opacity = Math.max(0, k) ** 6 * 0.85; }
    moteSrc.forEach((p, i) => {
      motePos[i * 3] = p.x + Math.sin(clock * 0.5 + i * 1.7) * 0.5;
      motePos[i * 3 + 1] = p.y + Math.sin(clock * 0.8 + i) * 0.35;
      motePos[i * 3 + 2] = p.z + Math.cos(clock * 0.45 + i * 2.3) * 0.5;
    });
    moteGeo.attributes.position.needsUpdate = true;
    for (const L of placed0.lines) {
      if (eye && (L.group.position.x - eye.x) ** 2 + (L.group.position.z - eye.z) ** 2 > 90 * 90) continue;
      L.update(clock);
    }
    for (const n of npcs) {
      // 멀리 있는 주민은 몸짓을 쉬어요 (태블릿이 버벅이지 않게)
      const far = !!eye && (n.ch.root.position.x - eye.x) ** 2 + (n.ch.root.position.z - eye.z) ** 2 > 75 * 75;
      if (n.hold) {
        n.ch.walking = 0;
        if (n.faceTo) {
          const want = Math.atan2(n.faceTo.x - n.ch.root.position.x, n.faceTo.z - n.ch.root.position.z);
          let d = want - n.ch.root.rotation.y; while (d > PI) d -= 2 * PI; while (d < -PI) d += 2 * PI;
          n.ch.root.rotation.y += d * Math.min(1, dt * 8);
        }
        n.ch.update(dt); continue;
      }
      if (n.rest > 0) { n.rest -= dt; n.ch.walking = 0; if (!far) n.ch.update(dt); continue; }
      n.t += n.dir * n.speed * dt;
      if (n.t > 1 || n.t < 0) { n.dir *= -1; n.t = Math.max(0, Math.min(1, n.t)); n.rest = 2 + Math.random() * 3; }
      n.p.getPointAt(n.t, tmp);
      const ahead = n.p.getPointAt(Math.max(0, Math.min(1, n.t + n.dir * 0.002)));
      n.ch.root.position.set(tmp.x, walkY(tmp.x, tmp.z), tmp.z);
      n.ch.root.rotation.y = Math.atan2(ahead.x - tmp.x, ahead.z - tmp.z);
      n.sh.position.set(tmp.x, n.ch.root.position.y + 0.05, tmp.z);
      n.ch.walking = 1;
      if (!far) n.ch.update(dt);
    }
  };
  const dispose = () => {
    hitGeo.dispose(); hitMat.dispose(); npcHitGeo.dispose(); moteGeo.dispose();
    (motes.material as THREE.Material).dispose(); glints.forEach((g2) => g2.s.material.dispose());
    placed0.lines.forEach((L) => L.dispose());
    for (const o of own) { const m = (o as THREE.Mesh).material as THREE.ShaderMaterial; m.uniforms?.uMap?.value?.dispose?.(); }
    disposeTree(root);
  };
  void mix;
  return {
    root, ground, hits, shopHits: shopHits.map((x) => x.hit), shops: shopHits, npcs: npcs as VNpc[], houses: spots, towns: townInfo, shopDoor: V(door.x, walkY(door.x, door.z), door.z),
    bounds: { minX: X0, maxX: X1, minZ: Z0, maxZ: Z1 }, heightAt, walkY, inWater, blocked, update, dispose,
    bakeSpec: () => bakeSpec(props, heightAt), baked: placed0.baked,
  };
}
