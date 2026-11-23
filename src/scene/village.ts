import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../core/rng';
import type { ShopKind } from '../data/folk';
import type { ChibiSpec } from '../data/types';
import { blob, ctx2d, darken, lighten, makeCanvas, mix } from '../paint/brush';
import { tex } from '../paint/textures';
import { Chibi, LEG } from './chibi';
import { glowTex, makeGlow, makeShadow } from './fx';
import { buildGarden, GARDEN_D, GARDEN_W, type Garden } from './garden';
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
export interface VNpc { ch: Chibi; hit: THREE.Mesh; sh: THREE.Object3D; hold: boolean; faceTo: THREE.Vector3 | null; at: THREE.Vector3 | null; goHome?: boolean; pace?: number }
// 불 켜진 집 손님: 자기 마을 골목을 산책해요
export interface VWalker extends VNpc { house: number }
export interface VShopSpot { hit: THREE.Mesh; kind: VShop['kind']; name: string; front: THREE.Vector3; yaw: number }
export interface Village {
  root: THREE.Group; ground: THREE.Mesh; hits: THREE.Mesh[]; shopHits: THREE.Mesh[]; shops: VShopSpot[]; npcs: VNpc[];
  houses: VHouseSpot[]; towns: { center: THREE.Vector3; t: VTown; lit: number; total: number }[];
  shopDoor: THREE.Vector3; bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  walkers: VWalker[];
  // 시장 거리 광장: 마음 모으기 모임과 동네 잔치가 열리는 곳
  plaza: THREE.Vector3; plazaR: number; festival: THREE.Group;
  heightAt: (x: number, z: number) => number; walkY: (x: number, z: number) => number; inWater: (x: number, z: number) => boolean; blocked: (x: number, z: number) => boolean;
  // 캐릭터를 땅 위에 세울 높이: 다리 길이만큼 올려야 신발이 땅에 묻히지 않아요
  standY: (x: number, z: number, ch: Chibi) => number;
  update: (dt: number, eye?: THREE.Vector3) => void; dispose: () => void;
  // 시간대: 하늘, 별과 달(해), 등불·창문 빛무리, 떠도는 빛 알갱이를 바꿔요
  setTod: (t: 'day' | 'dusk' | 'night') => void;
  bakeSpec: () => unknown; baked: boolean;
  // 냇물을 건너는 다리 (양 끝 자리와 높이)
  bridges: { a: THREE.Vector3; b: THREE.Vector3; ya: number; yb: number }[];
  // 마음 텃밭 (텃밭 심부름): 자리를 못 찾으면 null
  garden: Garden | null;
  // 마을마다 골목 끝 우물·큰 나무 자리 (잃어버린 물건 찾기의 단서 자리)
  ends: { pos: THREE.Vector3; well: boolean }[];
}

// ── 땅 모양 ─────────────────────────────
const X0 = -125, X1 = 125, Z0 = -92, Z1 = 108;
const RIVER: [number, number][] = [[-250, -44], [-190, -30], [-140, -40], [-112, -36], [-86, -22], [-66, -30], [-44, -16], [-22, -26], [-4, -14], [16, -22], [36, -10], [58, -20], [80, -6], [112, -14], [150, -4], [200, -20], [250, -12]];
const SHOP = V(0, 0, 6);
// 마을마다 구불구불한 골목 하나: 가운데 자리와 골목 방향(라디안)
// (마을을 넓히면서 골목 사이를 조금씩 더 띄웠어요)
const LANES: [number, number, number][] = [[-83, -64, 0.45], [-35, -69, -0.25], [12, -64, 0.35], [64, -62, -0.4], [-83, 23, -0.6], [-41, 50, 0.2], [13, 57, -0.3], [69, 34, 0.55]];
// 시장 거리 광장 (마을 남쪽)
const PLAZA = V(-8, 0, 84), PLAZA_R = 10;
const WATER = -0.55;
// 마을 바깥: 산과 숲이 둘러싸요 (지도 끝이 잘려 보이지 않게)
const BX0 = -270, BX1 = 270, BZ0 = -230, BZ1 = 236;
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
export interface VShop { name: string; wall: string; awn: [string, string]; line: string; kind: ShopKind; market?: [number, number] }
export const SHOPS: VShop[] = [
  { name: '폭신 빵집', wall: '#FCE3D6', awn: ['#E98BA3', '#FFFFFF'], line: '🥐 폭신 빵집: 갓 구운 빵 냄새가 골목까지 퍼져요.', kind: 'bread' },
  { name: '방긋 꽃집', wall: '#E7F3DD', awn: ['#47AE7A', '#FFFFFF'], line: '🌷 방긋 꽃집: 오늘 고마운 사람에게 꽃 한 송이 어때요?', kind: 'flower' },
  { name: '알록 문구점', wall: '#DDEFFA', awn: ['#6FB3E0', '#FFFFFF'], line: '✏️ 알록 문구점: 친구에게 쓸 편지지가 가득해요.', kind: 'pencil' },
  { name: '소곤 책방', wall: '#ECE5F7', awn: ['#A68BD6', '#FFFFFF'], line: '📚 소곤 책방: 마음이 궁금할 때 읽는 책이 있어요.', kind: 'book' },
  { name: '사르르 아이스크림', wall: '#FFF4D6', awn: ['#F0974A', '#FFFFFF'], line: '🍦 사르르 아이스크림: 화가 날 땐 시원하게 한 숟가락!', kind: 'icecream' },
  // 시장 거리 (광장 남쪽에 나란히): market = 광장 가운데에서 떨어진 자리
  { name: '포근 찻집', wall: '#F3E6D6', awn: ['#A0765A', '#FFF8EC'], line: '🍵 포근 찻집: 따뜻한 차 한 잔에 마음이 느긋해져요.', kind: 'tea', market: [-17, 15] },
  { name: '딩동 악기점', wall: '#FFF6D6', awn: ['#E9B92A', '#FFFFFF'], line: '🥁 딩동 악기점: 기쁠 땐 쿵쿵, 슬플 땐 잔잔하게!', kind: 'music', market: [0, 17] },
  { name: '새콤 과일가게', wall: '#FDE4E0', awn: ['#E3645A', '#FFFFFF'], line: '🍎 새콤 과일가게: 나눠 먹으면 더 달콤해요.', kind: 'fruit', market: [17, 15] },
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
  if (sh.kind === 'tea') { mesh(sphereG(0.24, 12, 10), M('#9FD8B8', { noise: 2 }), [0.6, 0.82, top], [1, 0.8, 1], [0, 0, 0], o); mesh(cylG(0.03, 0.05, 0.3, 6), M('#9FD8B8'), [0.86, 0.86, top], 1, [0, 0, -0.9], o); for (let i = 0; i < 3; i++) mesh(cylG(0.1, 0.08, 0.14, 10), M(['#F7C3CC', '#FFF8EC', '#F6CF3E'][i]), [1.0 + i * 0.25, 0.68, top], 1, [0, 0, 0], o); }
  if (sh.kind === 'fruit') for (let i = 0; i < 3; i++) { mesh(boxG(0.48, 0.2, 0.5), M('#B9835A'), [0.4 + i * 0.5, 0.7, top], 1, [0, 0, 0], o); for (let k = 0; k < 4; k++) mesh(sphereG(0.1, 8, 6), M(['#E5484D', '#F6A23C', '#8E6FC2'][i]), [0.3 + i * 0.5 + (k % 2) * 0.18, 0.86, top - 0.1 + Math.floor(k / 2) * 0.2], 1, [0, 0, 0], o); }
  if (sh.kind === 'music') { mesh(cylG(0.32, 0.32, 0.36, 16), M('#E3645A'), [0.6, 0.78, top], 1, [0, 0, 0], o); mesh(cylG(0.33, 0.33, 0.04, 16), M('#FFF4E6'), [0.6, 0.97, top], 1, [0, 0, 0], o); mesh(coneG(0.12, 0.5, 10), M('#E9B92A', { spec: 0.6 }), [1.3, 0.8, top], 1, [0, 0, PI / 2], o); mesh(cylG(0.025, 0.025, 0.5, 6), M('#E9B92A', { spec: 0.6 }), [1.6, 0.8, top], 1, [0, 0, PI / 2], o); }
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
  const flowerGeos: THREE.BufferGeometry[] = [];
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
    const pts = [-21, -8, 6, 20].map((t, i) => V(cx, 0, cz).addScaledVector(d, t).addScaledVector(n, i % 2 ? 3.5 + w() * 0.4 : -3.5 + w() * 0.4));
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
      const side = i % 2 ? 1 : -1, off = 5.0 + rnd() * 1.4;
      const x = p.x + n.x * side * off, z = p.z + n.z * side * off;
      const yaw = Math.atan2(p.x - x, p.z - z) + (rnd() - 0.5) * 0.3;
      plan.push({ h, k, x, z, yaw });
      pads.push({ x, z, y: base(x, z) });
      void L;
    });
  });
  const shopY = Math.max(1, base(SHOP.x, SHOP.z));
  const plazaY = Math.max(0.6, base(PLAZA.x, PLAZA.z));
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
    // 시장 거리 광장과 가게 자리는 평평하게
    { const s = smooth(PLAZA_R + 9, PLAZA_R + 20, Math.hypot(x - PLAZA.x, (z - PLAZA.z) * 0.85)); h = plazaY * (1 - s) + h * s; }
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
  // 시장 거리: 라면 가게에서 광장까지 큰길 하나, 광장을 지나는 가게 거리 하나 (마을 골목 사이로 지나가요)
  const marketRoad = new THREE.CatmullRomCurve3([door.clone(), V(-6, 0, 24), V(-14, 0, 42), V(-14, 0, 60), V(PLAZA.x - 2, 0, PLAZA.z - PLAZA_R + 1)], false, 'centripetal');
  const marketStreet = new THREE.CatmullRomCurve3([V(PLAZA.x - 38, 0, PLAZA.z + 6), V(PLAZA.x - 18, 0, PLAZA.z + 8.5), V(PLAZA.x, 0, PLAZA.z + 9), V(PLAZA.x + 18, 0, PLAZA.z + 8.5), V(PLAZA.x + 36, 0, PLAZA.z + 5)], false, 'centripetal');
  roads.push(marketRoad, marketStreet);
  const half = Math.floor(lanes.length / 2);
  for (const [i, j] of [[0, 1], [1, 2], [2, 3], [4, 5], [5, 6], [6, 7]]) {
    if (i >= lanes.length || j >= lanes.length || (i < half) !== (j < half)) continue;
    const a = far(lanes[i], door), b = near(lanes[j], a);
    roads.push(wind(a, b, i + j, 0.12));
  }
  // 다리: 큰길이 냇물을 건너는 곳. 가까운 곳에서 건너는 길이 여럿이면 다리 하나로 모아요 (다리끼리 겹치지 않게).
  // 길은 다리 위에서 곧게 지나가요 (주민이 난간을 뚫고 걷거나 물에 빠지지 않게)
  const bridges: { a: THREE.Vector3; b: THREE.Vector3; ya: number; yb: number }[] = [];
  {
    type Cross = { r: number; s: number; e: number; a: THREE.Vector3; b: THREE.Vector3 };
    const crosses: Cross[] = [];
    const rpts = roads.map((p) => p.getSpacedPoints(Math.ceil(p.getLength() / 0.5)));
    rpts.forEach((pts, r) => {
      let s0 = -1;
      for (let i = 0; i < pts.length; i++) {
        const wet = rdist(pts[i].x, pts[i].z) < 6.2;
        if (wet && s0 < 0) s0 = i;
        if ((!wet || i === pts.length - 1) && s0 >= 0) {
          const a = pts[Math.max(0, s0 - 1)], b = pts[i];
          // 냇물을 정말 건널 때만 다리를 놓아요 (냇가를 스치기만 하면 놓지 않아요)
          if (riverSide(a) !== riverSide(b) && a.distanceTo(b) < 22) crosses.push({ r, s: Math.max(0, s0 - 1), e: i, a: a.clone(), b: b.clone() });
          s0 = -1;
        }
      }
    });
    // 두 건너는 자리(선분)가 이만큼 가까우면 한 다리로 (다리 폭 2.6m + 여유)
    const segD = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => {
      let m = Infinity;
      for (let i = 0; i <= 16; i++) for (let j = 0; j <= 16; j++) m = Math.min(m, Math.hypot(a.x + (b.x - a.x) * i / 16 - c.x - (d.x - c.x) * j / 16, a.z + (b.z - a.z) * i / 16 - c.z - (d.z - c.z) * j / 16));
      return m;
    };
    const groups: Cross[][] = [];
    for (const c of crosses) { const gr = groups.find((g2) => g2.some((o) => segD(o.a, o.b, c.a, c.b) < 4.5)); if (gr) gr.push(c); else groups.push([c]); }
    const ends = new Map<Cross, [THREE.Vector3, THREE.Vector3]>();
    for (const gr of groups) {
      const side0 = riverSide(gr[0].a), A = V(), B = V();
      for (const c of gr) { const near0 = riverSide(c.a) === side0; A.add(near0 ? c.a : c.b); B.add(near0 ? c.b : c.a); }
      A.divideScalar(gr.length).setY(0); B.divideScalar(gr.length).setY(0);
      // 모은 다리의 양 끝이 마른 땅에 닿을 때까지 늘여요
      const dir = V().subVectors(B, A).normalize();
      for (let k = 0; k < 24 && rdist(A.x, A.z) < 6.2; k++) A.addScaledVector(dir, -0.5);
      for (let k = 0; k < 24 && rdist(B.x, B.z) < 6.2; k++) B.addScaledVector(dir, 0.5);
      bridges.push({ a: A, b: B, ya: heightAt(A.x, A.z), yb: heightAt(B.x, B.z) });
      for (const c of gr) ends.set(c, riverSide(c.a) === side0 ? [A, B] : [B, A]);
    }
    // 건너는 길을 다시 이어요: 다리 앞까지는 원래 길, 다리 위는 곧게, 다리 뒤로는 다시 원래 길
    rpts.forEach((pts, r) => {
      const cs = crosses.filter((c) => c.r === r).sort((x, y) => x.s - y.s);
      if (!cs.length) return;
      const out: THREE.Vector3[] = [];
      let i = 0;
      for (const c of cs) {
        const [A, B] = ends.get(c)!;
        // 다리 옆(난간 옆)을 지나는 점은 빼고, 다리 끝 너머에서 곧게 다리로 들어오고 나가요
        const abx = B.x - A.x, abz = B.z - A.z, L2 = abx * abx + abz * abz;
        const uOf = (q: THREE.Vector3) => ((q.x - A.x) * abx + (q.z - A.z) * abz) / L2;
        for (; i < c.s; i += 4) out.push(pts[i].clone());
        while (out.length > 1 && (out[out.length - 1].distanceTo(A) < 2.5 || uOf(out[out.length - 1]) > -0.12)) out.pop();
        for (const k of [0, 0.12, 0.3, 0.5, 0.7, 0.88, 1]) out.push(A.clone().lerp(B, k));
        i = c.e;
        while (i < pts.length - 1 && (pts[i].distanceTo(B) < 2.5 || uOf(pts[i]) < 1.12)) i++;
      }
      for (; i < pts.length - 1; i += 4) out.push(pts[i].clone());
      out.push(pts[pts.length - 1].clone());
      roads[r] = new THREE.CatmullRomCurve3(out, false, 'centripetal');
    });
  }
  const allPaths = [...roads, ...lanes];
  const pathPtsEarly = allPaths.flatMap((p) => p.getSpacedPoints(90));
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
  const TW = 2800, TH = Math.round(TW * (Z1 - Z0) / (X1 - X0));
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
  for (let i = 0; i < 360; i++) blob(g, rnd() * TW, rnd() * TH, 30 + rnd() * 90, 20 + rnd() * 60, rnd() < 0.5 ? '#E6F4BE' : '#C3DF94', rnd, { layers: 2, alpha: 0.08, edge: 0 });
  const stroke = (pts: THREE.Vector3[], color: string, width: number, alpha = 1, dash?: number[]) => {
    g.save(); g.globalAlpha = alpha; g.strokeStyle = color; g.lineWidth = width * pm; g.lineCap = 'round'; g.lineJoin = 'round';
    if (dash) g.setLineDash(dash.map((x) => x * pm));
    g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(px(p.x), pz(p.z)) : g.moveTo(px(p.x), pz(p.z)))); g.stroke(); g.restore();
  };
  stroke(rp, '#E8DDB6', 13, 0.7); stroke(rp, '#E2D3A6', 9.5);
  for (const p of roads) { const pts = p.getSpacedPoints(140); stroke(pts, '#E3CFA6', 3.4, 0.45); stroke(pts, '#E9D7B0', 2.4); }
  for (const p of lanes) { const pts = p.getSpacedPoints(80); stroke(pts, '#DCC8A0', 4.2, 0.4); stroke(pts, '#EADBBE', 3.2); stroke(pts, '#D9C59C', 0.35, 0.8, [0.7, 0.6]); }
  // 광장: 둥근 돌바닥
  g.fillStyle = '#E9DCC0'; g.beginPath(); g.ellipse(px(PLAZA.x), pz(PLAZA.z), (PLAZA_R + 1.2) * pm, (PLAZA_R + 1.2) * pm, 0, 0, 7); g.fill();
  g.strokeStyle = '#D8C7A2'; g.lineWidth = 0.35 * pm;
  for (let r = 3; r <= PLAZA_R; r += 2.4) { g.beginPath(); g.ellipse(px(PLAZA.x), pz(PLAZA.z), r * pm, r * pm, 0, 0, 7); g.stroke(); }
  for (let a = 0; a < 16; a++) { const an = (a / 16) * PI * 2; g.beginPath(); g.moveTo(px(PLAZA.x + Math.cos(an) * 3), pz(PLAZA.z + Math.sin(an) * 3)); g.lineTo(px(PLAZA.x + Math.cos(an) * PLAZA_R), pz(PLAZA.z + Math.sin(an) * PLAZA_R)); g.stroke(); }
  // 집 앞 작은 마당
  for (const q of plan) { g.fillStyle = '#E6D5B2'; g.globalAlpha = 0.55; g.beginPath(); g.ellipse(px(q.x), pz(q.z), 3.2 * pm, 3.2 * pm, 0, 0, 7); g.fill(); }
  g.globalAlpha = 1;
  // 들꽃: 더 많이, 더 화사하게 (색은 따로 골라 다른 자리는 그대로)
  const flRnd = mulberry32(777);
  for (let i = 0; i < 900; i++) {
    const x = X0 + flRnd() * (X1 - X0), z = Z0 + flRnd() * (Z1 - Z0);
    if (rdist(x, z) < 8) continue;
    g.fillStyle = ['#FF9FB7', '#FFE58A', '#FFFFFF', '#D2C4F6', '#FFC6D3', '#A6DDF7'][i % 6];
    g.globalAlpha = 0.3; // 걸어 다닐 때 가까이 보면 물감 얼룩처럼 보이지 않게 작고 옅게, 갈색으로 번지는 주황은 빼요 (진짜 꽃은 따로 심어요)
    for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(px(x) + (flRnd() - 0.5) * 12, pz(z) + (flRnd() - 0.5) * 12, (2.2 + flRnd() * 2.4) * 0.6, 0, 7); g.fill(); }
  }
  for (let i = 0; i < 1100; i++) {
    const x = X0 + rnd() * (X1 - X0), z = Z0 + rnd() * (Z1 - Z0);
    if (rdist(x, z) < 8) continue;
    g.fillStyle = ['#F7B3C2', '#FFE9A6', '#FFFFFF', '#D8CCF4', '#FFD0DA'][i % 5];
    g.globalAlpha = 0.3;
    for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(px(x) + (rnd() - 0.5) * 14, pz(z) + (rnd() - 0.5) * 14, (2 + rnd() * 2.2) * 0.6, 0, 7); g.fill(); }
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
  // 그늘 띠가 얼룩처럼 끊기지 않게 살짝 고르게. 수채 잔무늬(noise)도 끄면 모래·길·풀밭에 갈색 얼룩이 지지 않아요
  const ground = new THREE.Mesh(geo, Mu('#FFFFFF', { map: groundTex, rim: 0, flat: 0.25, noise: 0 }));
  ground.userData.ownGeo = true;
  root.add(ground); own.push(ground);
  // 하늘: 시간대마다 띠 색이 달라요 (아래 절반은 땅 끝 너머 빛깔)
  const SKY: Record<'day' | 'dusk' | 'night', [number, string][]> = {
    day: [[0, '#8FCBF2'], [0.36, '#CDE8F8'], [0.47, '#FFF0D6'], [0.5, '#FFE9C8'], [0.52, '#CDEAA6'], [1, '#CDEAA6']],
    dusk: [[0, '#7E7FC0'], [0.22, '#D98FA6'], [0.38, '#F7A47A'], [0.47, '#FFC98E'], [0.5, '#FFDDA8'], [0.52, '#C9B88A'], [1, '#C9B88A']],
    night: [[0, '#0E1638'], [0.3, '#1E2A5A'], [0.45, '#3A4680'], [0.5, '#4E5690'], [0.52, '#2C3A52'], [1, '#2C3A52']],
  };
  const skyTex = (t: 'day' | 'dusk' | 'night') => {
    const skyCv = makeCanvas(8, 256), sg = ctx2d(skyCv), gr = sg.createLinearGradient(0, 0, 0, 256);
    SKY[t].forEach(([k, c]) => gr.addColorStop(k, c));
    sg.fillStyle = gr; sg.fillRect(0, 0, 8, 256);
    return tex(skyCv);
  };
  const skyTexs: Partial<Record<'day' | 'dusk' | 'night', THREE.Texture>> = { day: skyTex('day') };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(520, 32, 16), Mu('#FFFFFF', { map: skyTexs.day!, flat: 1, rim: 0, side: THREE.BackSide }));
  sky.userData.ownGeo = true; root.add(sky); own.push(sky);
  // 밤하늘 별 (밤에만)
  const starGeo = new THREE.BufferGeometry();
  {
    const sr = mulberry32(4242), sp: number[] = [];
    for (let i = 0; i < 520; i++) { const a = sr() * PI * 2, e = 0.06 + Math.pow(sr(), 0.7) * 1.4, r = 480; sp.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r); }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  }
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ map: glowTex(), color: '#FFF6DC', size: 4.2, sizeAttenuation: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
  stars.visible = false; stars.renderOrder = 1; root.add(stars);
  // 노을녘 해, 밤의 달
  const orb = makeGlow('#FFB070', 90, 0.85); orb.visible = false; root.add(orb);
  const orbCore = makeGlow('#FFF3D0', 26, 0.95); orbCore.visible = false; root.add(orbCore);
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
  const putShop = (sh: VShop, x: number, z: number, yaw: number) => {
    const y = heightAt(x, z);
    const b = shopBuilding(sh); b.position.set(x, y, z); b.rotation.y = yaw; stat.add(b);
    const fwd = V(Math.sin(yaw), 0, Math.cos(yaw));
    // 간판은 지붕 앞에 세워요 (위에서 내려다봐도 보이게 살짝 뒤로 눕혀요)
    const sg2 = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.8), Mu('#FFFFFF', { map: sign(sh.name, 420, 112, '#FFFDF6', darken(sh.awn[0], 0.35), 52), flat: 0.9, rim: 0, side: THREE.DoubleSide }));
    sg2.userData.ownGeo = true; sg2.position.set(x, y + 3.25, z).addScaledVector(fwd, 2.1); sg2.rotation.set(-0.35, yaw, 0, 'YXZ'); root.add(sg2); own.push(sg2);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(4.6, 4, 4.4), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(x, y + 2, z); hit.rotation.y = yaw; hit.userData.shopLine = sh.line; hit.userData.shopKind = sh.kind; hit.userData.ownGeo = true;
    root.add(hit);
    const front = V(x, y, z).addScaledVector(fwd, 4.8); front.y = heightAt(front.x, front.z); // 간판이 한눈에 보이는 자리
    shopHits.push({ hit, kind: sh.kind, name: sh.name, front, yaw });
    shopSpots.push([x, z]);
  };
  SHOPS.forEach((sh, i) => {
    if (sh.market) {
      // 시장 거리 가게: 광장을 바라보고 나란히 서요
      const x = PLAZA.x + sh.market[0], z = PLAZA.z + sh.market[1];
      putShop(sh, x, z, Math.atan2(PLAZA.x - x, PLAZA.z - z));
      return;
    }
    for (let tries = 0; tries < 12; tries++) {
      const road = roads[(i * 3 + tries) % lanes.length], u = 0.12 + (tries % 4) * 0.06 + i * 0.015;
      const p = road.getPointAt(Math.min(0.6, u)), tg = road.getTangentAt(Math.min(0.6, u)), n = V(-tg.z, 0, tg.x);
      const side = (i + tries) % 2 ? 1 : -1;
      const x = p.x + n.x * side * 6.5, z = p.z + n.z * side * 6.5;
      if (Math.hypot(x - SHOP.x, z - SHOP.z) < 12 || rdist(x, z) < 11) continue;
      if (plan.some((q) => Math.hypot(q.x - x, q.z - z) < 8) || shopSpots.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 9)) continue;
      if (pathPtsEarly.some((q) => (q.x - x) ** 2 + (q.z - z) ** 2 < 3.6 ** 2)) continue;
      putShop(sh, x, z, Math.atan2(p.x - x, p.z - z));
      break;
    }
  });

  // ── 광장: 분수, 긴 의자. 잔치 꾸밈은 잔치를 연 뒤에 보여요 ──
  const extraSolids: [number, number, number][] = [];
  {
    const py = heightAt(PLAZA.x, PLAZA.z);
    const fo = new THREE.Group(); fo.position.set(PLAZA.x, py, PLAZA.z);
    mesh(cylG(2.5, 2.7, 0.6, 24), M('#D6CFC4', { noise: 3 }), [0, 0.3, 0], 1, [0, 0, 0], fo);
    mesh(cylG(2.2, 2.2, 0.02, 24), M('#86CDF0', { flat: 0.5, spec: 0.9 }), [0, 0.612, 0], 1, [0, 0, 0], fo); // 돌 수조 윗면(0.6) 위로 물이 보여요
    mesh(cylG(0.32, 0.42, 1.5, 12), M('#E9E2D6', { noise: 2 }), [0, 1.0, 0], 1, [0, 0, 0], fo);
    mesh(cylG(0.9, 0.5, 0.3, 16), M('#E2DBCF', { noise: 2 }), [0, 1.75, 0], 1, [0, 0, 0], fo);
    mesh(sphereG(0.55, 14, 10), M('#BFE6F7', { flat: 0.6, alpha: 0.75 }), [0, 2.1, 0], [1, 0.7, 1], [0, 0, 0], fo);
    stat.add(fo);
    extraSolids.push([PLAZA.x, PLAZA.z, 3.0]);
    for (let k = 0; k < 4; k++) {
      const a = PI * 0.25 + (k * PI) / 2, bx = PLAZA.x + Math.cos(a) * (PLAZA_R - 1.4), bz = PLAZA.z + Math.sin(a) * (PLAZA_R - 1.4);
      if (bz > PLAZA.z + 4) continue; // 가게 쪽은 비워 둬요
      const bench = new THREE.Group(); bench.position.set(bx, heightAt(bx, bz), bz); bench.rotation.y = Math.atan2(PLAZA.x - bx, PLAZA.z - bz);
      mesh(boxG(2.0, 0.12, 0.6), M('#B98A5E', { noise: 2 }), [0, 0.5, 0], 1, [0, 0, 0], bench);
      mesh(boxG(2.0, 0.5, 0.1), M('#A87B52', { noise: 2 }), [0, 0.8, -0.28], 1, [0, 0, 0], bench);
      for (const x of [-0.85, 0.85]) mesh(boxG(0.1, 0.5, 0.5), M('#8A5E3C'), [x, 0.25, 0], 1, [0, 0, 0], bench);
      stat.add(bench); extraSolids.push([bx, bz, 1.2]);
    }
  }
  const festival = new THREE.Group();
  {
    // 광장을 둘러싼 깃발 줄과 초롱
    const py = heightAt(PLAZA.x, PLAZA.z), cols = ['#E3645A', '#F6CF3E', '#47AE7A', '#6FB3E0', '#A68BD6', '#F0974A'];
    const poles: THREE.Vector3[] = [];
    for (let k = 0; k < 8; k++) { const a = (k / 8) * PI * 2 + 0.2; poles.push(V(PLAZA.x + Math.cos(a) * (PLAZA_R + 0.6), py, PLAZA.z + Math.sin(a) * (PLAZA_R + 0.6))); }
    for (const p of poles) { mesh(cylG(0.08, 0.1, 4.2, 8), M('#8A5E3C'), [p.x, p.y + 2.1, p.z], 1, [0, 0, 0], festival); mesh(sphereG(0.16, 8, 6), M('#F6CF3E'), [p.x, p.y + 4.25, p.z], 1, [0, 0, 0], festival); }
    poles.forEach((a, k) => {
      const b = poles[(k + 1) % poles.length];
      for (let i = 1; i < 8; i++) {
        const t = i / 8, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, y = py + 4.0 - Math.sin(t * PI) * 0.9;
        const f = mesh(coneG(0.2, 0.42, 3), M(cols[(i + k) % cols.length]), [x, y - 0.2, z], 1, [PI, 0, 0], festival);
        f.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
        if (i % 3 === 0) { mesh(sphereG(0.24, 10, 8), M('#FFB86B', { flat: 0.85 }), [x, y - 0.55, z], [1, 1.2, 1], [0, 0, 0], festival); const gl = makeGlow('#FFD27A', 1.6, 0.4); gl.position.set(x, y - 0.55, z); festival.add(gl); }
      }
    });
    festival.visible = false;
    root.add(festival);
  }

  // ── 집 ──
  const spots: VHouseSpot[] = [];
  const hits: THREE.Mesh[] = [];
  const solids: [number, number, number][] = [...shopSpots.map(([x, z]) => [x, z, 3.0] as [number, number, number]), ...extraSolids];
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
  const ends: Village['ends'] = [];
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
    ends.push({ pos: wp.clone(), well: k % 2 === 1 });
    solids.push([wp.x, wp.z, 1.5]);
    const c = ln.getPointAt(0.5); c.y = heightAt(c.x, c.z);
    townInfo.push({ center: c, t, lit, total: list.length });
  });

  // ── 소품: 자리는 여기서 정하고, 놓이는 모양은 블렌더 물리로 구운 값을 써요 ──
  const props = planProps({
    rnd, heightAt, rdist, river: rp, paths: pathPtsEarly,
    houses: plan.map((q) => ({ x: q.x, z: q.z, yaw: q.yaw })),
    shops: shopHits.map((sh, i) => ({ x: shopSpots[i][0], z: shopSpots[i][1], yaw: sh.yaw })),
    entries, solids: [...solids, [PLAZA.x, PLAZA.z, PLAZA_R + 3]], shop: SHOP, rect: { x0: X0, x1: X1, z0: Z0, z1: Z1 },
  });
  const placed0 = placeProps(props, stat, root, heightAt);
  solids.push(...props.solids);
  // ── 마음 텃밭: 라면 가게 가까이, 큰길을 바라보는 고른 빈 땅 (소품 자리를 정한 뒤에 골라서 소품은 그대로예요) ──
  const garden: Garden | null = (() => {
    const dense = allPaths.flatMap((p) => p.getSpacedPoints(Math.ceil(p.getLength() / 0.7)));
    const hx = GARDEN_W / 2, hz = GARDEN_D / 2;
    const find = (rMax: number, slope: number) => {
      let best: { x: number; z: number; yaw: number; s: number } | null = null;
      for (let r = 13; r <= rMax; r += 1.5) for (let a = 0; a < PI * 2; a += 0.12) {
        const x = SHOP.x + Math.cos(a) * r, z = SHOP.z + Math.sin(a) * r;
        let np = dense[0], nd = 1e18;
        for (const p of dense) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < nd) { nd = d; np = p; } }
        nd = Math.sqrt(nd);
        if (nd < hz + 1.6 || nd > hz + 5) continue; // 앞(입구)이 가까운 길을 바라봐요
        const yaw = Math.atan2(np.x - x, np.z - z), cs = Math.cos(yaw), sn = Math.sin(yaw);
        const inR = (px: number, pz: number, pad: number) => { const dx = px - x, dz = pz - z; return Math.abs(dx * cs - dz * sn) < hx + pad && Math.abs(dx * sn + dz * cs) < hz + pad; };
        if (dense.some((p) => inR(p.x, p.z, 1.6))) continue;
        if (plan.some((q) => inR(q.x, q.z, 4.5)) || shopSpots.some(([sx, sz]) => inR(sx, sz, 5.5))) continue;
        if (props.spots.some((sp) => inR(sp.x, sp.z, sp.r + 1.2)) || props.lamps.some(([lx, , lz]) => inR(lx, lz, 1.2))) continue;
        if (solids.some(([sx, sz, sr]) => inR(sx, sz, sr + 0.8))) continue;
        if (inR(SHOP.x, SHOP.z, 5) || Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA_R + hz + 6) continue;
        let lo = 1e9, hi = -1e9, bad = false;
        for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
          const px = x + (i / 2) * hx * cs + (j / 2) * hz * sn, pz = z - (i / 2) * hx * sn + (j / 2) * hz * cs;
          const hh = heightAt(px, pz); lo = Math.min(lo, hh); hi = Math.max(hi, hh);
          if (rdist(px, pz) < 8 || px < X0 + 8 || px > X1 - 8 || pz < Z0 + 8 || pz > Z1 - 8) bad = true;
        }
        if (bad || hi - lo > slope) continue;
        const sc = r + (hi - lo) * 8;
        if (!best || sc < best.s) best = { x, z, yaw, s: sc };
      }
      return best;
    };
    const spot = find(40, 1.2) ?? find(70, 2.2);
    if (!spot) return null;
    const gd = buildGarden(spot.x, spot.z, spot.yaw, heightAt);
    stat.add(gd.stat); root.add(gd.group); solids.push(...gd.solids);
    // 땅 그림에 흙빛 텃밭 자리를 칠해요
    g.save(); g.fillStyle = '#C9A275'; g.globalAlpha = 0.9; g.beginPath();
    gd.corners.forEach((c, i) => (i ? g.lineTo(px(c.x), pz(c.z)) : g.moveTo(px(c.x), pz(c.z)))); g.closePath(); g.fill();
    g.globalAlpha = 0.5; g.strokeStyle = '#B48A5E'; g.lineWidth = 0.8 * pm; g.stroke(); g.restore();
    groundTex.needsUpdate = true;
    return gd;
  })();
  // 나무, 버섯: 길·냇물·집·소품을 피해서
  const pathPts = allPaths.flatMap((p) => p.getSpacedPoints(90));
  const clear = (x: number, z: number, pad: number) => {
    if (rdist(x, z) < 7) return false;
    for (const sp of props.spots) if ((sp.x - x) ** 2 + (sp.z - z) ** 2 < (sp.r + 1.6 + pad) ** 2) return false;
    for (const [lx, , lz] of props.lamps) if ((lx - x) ** 2 + (lz - z) ** 2 < (1.4 + pad) ** 2) return false;
    if (Math.hypot(x - SHOP.x, z - SHOP.z) < 10 + pad) return false;
    if (Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA_R + 2.5 + pad) return false;
    for (const q of plan) if ((q.x - x) ** 2 + (q.z - z) ** 2 < (4.2 + pad) ** 2) return false;
    for (const p of pathPts) if ((p.x - x) ** 2 + (p.z - z) ** 2 < (2.8 + pad) ** 2) return false;
    for (const [sx, sz] of shopSpots) if ((sx - x) ** 2 + (sz - z) ** 2 < (5.4 + pad) ** 2) return false; // 가게 앞을 가리지 않게
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
  for (let i = 0; i < 2200 && placed < 330; i++) {
    const x = X0 + 2 + rnd() * (X1 - X0 - 4), z = Z0 + 2 + rnd() * (Z1 - Z0 - 4);
    if (!clear(x, z, 0.4)) continue;
    const sc = 0.9 + rnd() * 0.6, pal = pickPal(x, z, 0.85);
    if (garden?.inside(x, z, 2.2)) continue; // 텃밭 자리 (다른 나무 자리와 색은 그대로)
    const t = tree(i, sc, pal); t.position.set(x, heightAt(x, z) - 0.05, z); stat.add(t); placed++;
    solids.push([x, z, 0.75 * sc + 0.35]); // 사장님 눈높이에서 잎 속으로 들어가지 않게
  }
  // 마을 바깥 숲: 산자락으로 갈수록 소나무가 많아요
  for (let i = 0, n = 0; i < 2600 && n < 520; i++) {
    const x = BX0 + 6 + rnd() * (BX1 - BX0 - 12), z = BZ0 + 6 + rnd() * (BZ1 - BZ0 - 12);
    const dx = Math.max(X0 - x, 0, x - X1), dz = Math.max(Z0 - z, 0, z - Z1), d = Math.hypot(dx, dz);
    if (d < 3 || rdist(x, z) < 9 || rnd() > 0.35 + smooth(0, 40, d) * 0.65) continue;
    const t = tree(1000 + i, 1.1 + rnd() * 0.9, pickPal(x, z, 0.38 - smooth(0, 60, d) * 0.2)); t.position.set(x, heightAt(x, z) - 0.1, z); stat.add(t); n++;
  }
  for (let i = 0, n = 0; i < 700 && n < 70; i++) {
    const x = X0 + rnd() * (X1 - X0), z = Z0 + rnd() * (Z1 - Z0);
    if (!clear(x, z, -1.2) || garden?.inside(x, z, 0.8)) continue;
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
  // 들꽃: 땅에 그린 꽃 대신 진짜 작은 꽃을 심어요 (가까이 걸어도 또렷해요). 색마다 한 번에 그려요
  {
    const fRnd = mulberry32(31337);
    const cols = ['#FF9FB7', '#FFD95E', '#FFFFFF', '#B9A2F2', '#FFB27A', '#8FD3F5'];
    const petals = (() => { const parts: THREE.BufferGeometry[] = []; for (let i = 0; i < 5; i++) { const a = (i / 5) * PI * 2; const g2 = new THREE.SphereGeometry(1, 6, 3); g2.scale(0.07, 0.018, 0.045); g2.translate(0.06, 0, 0); g2.rotateY(a); parts.push(g2); } const m = mergeGeometries(parts, false)!; parts.forEach((x) => x.dispose()); return m; })();
    const center = new THREE.SphereGeometry(0.035, 5, 3); // 꽃이 많아서 면은 적게 (태블릿 부담 줄이기)
    const spots2: THREE.Matrix4[][] = cols.map(() => []);
    const all: THREE.Matrix4[] = [];
    const q = new THREE.Quaternion(), e = new THREE.Euler();
    for (let i = 0, n = 0; i < 12000 && n < 2000; i++) {
      // 길가와 집 둘레에 더 많이
      const near = fRnd() < 0.6 && pathPts.length;
      let x: number, z: number;
      if (near) { const p = pathPts[Math.floor(fRnd() * pathPts.length)]; const a = fRnd() * PI * 2, r = 2.6 + fRnd() * 3.5; x = p.x + Math.cos(a) * r; z = p.z + Math.sin(a) * r; }
      else { x = X0 + 3 + fRnd() * (X1 - X0 - 6); z = Z0 + 3 + fRnd() * (Z1 - Z0 - 6); }
      if (!clear(x, z, -1.6)) continue;
      const y = heightAt(x, z) + 0.05, sc = 0.8 + fRnd() * 0.6;
      e.set((fRnd() - 0.5) * 0.4, fRnd() * PI * 2, (fRnd() - 0.5) * 0.4); q.setFromEuler(e);
      if (garden?.inside(x, z, 0.6)) { n++; continue; }
      const m = new THREE.Matrix4().compose(V(x, y, z), q, V(sc, sc, sc));
      spots2[n % cols.length].push(m); all.push(m); n++;
    }
    cols.forEach((c, k) => {
      const im = new THREE.InstancedMesh(petals, M(c, { noise: 2 }), spots2[k].length);
      spots2[k].forEach((m, i) => im.setMatrixAt(i, m)); im.instanceMatrix.needsUpdate = true; im.frustumCulled = false;
      root.add(im);
    });
    const ic = new THREE.InstancedMesh(center, M('#F6C431'), all.length);
    all.forEach((m, i) => ic.setMatrixAt(i, m)); ic.instanceMatrix.needsUpdate = true; ic.frustumCulled = false;
    root.add(ic);
    flowerGeos.push(petals, center);
  }
  const merged = new THREE.Group();
  root.add(merged);
  mergeStatic(stat, merged);
  disposeTree(stat);

  // 동네 사람들: 길과 골목을 따라 천천히 오가요
  const npcHitGeo = new THREE.CylinderGeometry(0.75, 0.75, 2.2, 10);
  const standY = (x: number, z: number, ch: Chibi) => walkY(x, z) + LEG * ch.root.scale.y;
  // 멀리서 볼 때는 몸짓 많은 캐릭터 대신 몸통·머리만 있는 작은 인형을 세워요 (태블릿이 버벅이지 않게)
  const pawnBody = new THREE.CapsuleGeometry(0.27, 0.34, 3, 8), pawnHead = new THREE.SphereGeometry(0.4, 10, 8);
  const pawnOf = (s2: ChibiSpec) => {
    const g2 = new THREE.Group();
    const b = new THREE.Mesh(pawnBody, M(s2.cloth)); b.position.y = 0.32; g2.add(b);
    const hd = new THREE.Mesh(pawnHead, M(s2.fur)); hd.position.y = 0.92; g2.add(hd);
    g2.visible = false;
    return g2;
  };
  type Actor = VNpc & { p: THREE.CatmullRomCurve3; t: number; dir: number; speed: number; rest: number; pawn: THREE.Group; u0: number; u1: number };
  const makeActor = (s2: ChibiSpec, p: THREE.CatmullRomCurve3, tag: Record<string, number>, mood: 'happy' | 'neutral', u0 = 0, u1 = 1): Actor => {
    const ch = new Chibi(s2);
    const sh = makeShadow(0.7, 0.6, 0.45);
    root.add(ch.root); root.add(sh);
    ch.setMood(mood);
    // 멀리 있어서 몸짓 계산을 쉬는 주민도 팔이 제자리에 붙어 있게 한 번은 자세를 잡아 둬요
    ch.update(1 / 60);
    const hit = new THREE.Mesh(npcHitGeo, hitMat);
    hit.position.y = 1.0; Object.assign(hit.userData, tag);
    ch.root.add(hit);
    const pawn = pawnOf(s2); ch.root.add(pawn);
    return { ch, sh, p, hit, pawn, t: u0 + rnd() * (u1 - u0), u0, u1, dir: rnd() < 0.5 ? 1 : -1, speed: (0.9 + rnd() * 0.4) / p.getLength(), rest: 0, hold: false, faceTo: null, at: null };
  };
  const npcs: Actor[] = villagers.map((s2, i) => makeActor(s2, allPaths[(i * 5 + 1) % allPaths.length], { npc: i }, i % 3 ? 'happy' : 'neutral'));
  // 불 켜진 집 손님 몇 분이 자기 마을 골목을 산책해요 (마을마다 고르게, 별을 많이 받은 손님부터)
  const walkers: (Actor & { house: number })[] = [];
  {
    const byTown = towns.map((_, k) => spots.map((sp, i) => ({ sp, i })).filter((x) => x.sp.town === k && x.sp.h.lit && x.sp.h.spec).sort((a, b) => b.sp.h.stars - a.sp.h.stars));
    for (let round = 0; round < 2 && walkers.length < 10; round++) {
      for (let k = 0; k < towns.length && walkers.length < 10; k++) {
        const pick = byTown[k][round];
        if (!pick) continue;
        const sp0 = pick.sp.h.spec!, spec = Array.isArray(sp0) ? sp0[0] : sp0;
        const w = makeActor(spec, lanes[k], { walker: walkers.length }, 'happy', 0.08, 0.92) as Actor & { house: number };
        w.house = pick.i; w.speed *= 0.8;
        walkers.push(w);
      }
    }
  }
  const actors: Actor[] = [...npcs, ...walkers];
  // 다리 난간: 다리 위에서는 난간 밖으로, 다리 옆에서는 난간 안으로 지나가지 못해요 (다리 양 끝으로만 오르내려요).
  // 난간(가운데 줄에서 1.25m)과 사장님 몸 반지름(0.3m)만큼을 막아요
  const railHit = (x: number, z: number) => {
    for (const br of bridges) {
      const abx = br.b.x - br.a.x, abz = br.b.z - br.a.z, L2 = abx * abx + abz * abz;
      const u = ((x - br.a.x) * abx + (z - br.a.z) * abz) / L2, m = 0.3 / Math.sqrt(L2);
      if (u < -m || u > 1 + m) continue;
      const lat = Math.abs((x - br.a.x) * abz - (z - br.a.z) * abx) / Math.sqrt(L2);
      if (lat > 0.95 && lat < 1.55) return true;
    }
    return false;
  };
  const blocked = (x: number, z: number) => {
    if (inWater(x, z) || railHit(x, z)) return true;
    if (Math.abs(x - SHOP.x) < 3.1 && Math.abs(z - SHOP.z) < 2.5) return true;
    for (const [sx, sz, r] of solids) if ((x - sx) ** 2 + (z - sz) ** 2 < r * r) return true;
    return x < X0 + 2 || x > X1 - 2 || z < Z0 + 2 || z > Z1 - 2;
  };
  const tmp = V();
  let clock = 0;
  const face = (n: Actor, to: THREE.Vector3, dt: number) => {
    const want = Math.atan2(to.x - n.ch.root.position.x, to.z - n.ch.root.position.z);
    let d = want - n.ch.root.rotation.y; while (d > PI) d -= 2 * PI; while (d < -PI) d += 2 * PI;
    n.ch.root.rotation.y += d * Math.min(1, dt * 8);
  };
  const update = (dt: number, eye?: THREE.Vector3) => {
    clock += dt;
    for (const g2 of glints) { const k = Math.sin(clock * g2.sp + g2.ph); g2.s.material.opacity = Math.max(0, k) ** 6 * 0.85; }
    moteSrc.forEach((p, i) => {
      motePos[i * 3] = p.x + Math.sin(clock * 0.5 + i * 1.7) * 0.5;
      motePos[i * 3 + 1] = p.y + Math.sin(clock * 0.8 + i) * 0.35;
      motePos[i * 3 + 2] = p.z + Math.cos(clock * 0.45 + i * 2.3) * 0.5;
    });
    moteGeo.attributes.position.needsUpdate = true;
    garden?.update(dt, eye);
    for (const L of placed0.lines) {
      if (eye && (L.group.position.x - eye.x) ** 2 + (L.group.position.z - eye.z) ** 2 > 90 * 90) continue;
      L.update(clock);
    }
    for (const n of actors) {
      const P = n.ch.root.position;
      const d2 = eye ? (P.x - eye.x) ** 2 + (P.y - eye.y) ** 2 + (P.z - eye.z) ** 2 : 0;
      // 멀리 있는 주민은 몸짓을 쉬고(75m), 더 멀면 작은 인형으로 바꿔 그려요(65m)
      const far = d2 > 75 * 75, tiny = d2 > 65 * 65;
      n.ch.body.visible = !tiny; n.pawn.visible = tiny;
      // 모임이 끝나면 걸어서 자기 길로 돌아가요 (말을 거는 동안은 멈춰요)
      if (n.goHome && !n.at && !n.hold) n.at = n.p.getPointAt(n.t).clone();
      if (n.at && !(n.goHome && n.hold)) {
        // 모임 자리로: 걸어가요. 사장님 눈에서 멀리 떨어진 곳끼리만 바로 옮겨요 (눈앞에서 사라지지 않게)
        const dx = n.at.x - P.x, dz = n.at.z - P.z, d = Math.hypot(dx, dz);
        if (d > 0.25) {
          const tD2 = eye ? (n.at.x - eye.x) ** 2 + (n.at.z - eye.z) ** 2 : 1e9, lim = d > 26 ? 40 * 40 : 75 * 75;
          if (d2 > lim && tD2 > lim) P.set(n.at.x, standY(n.at.x, n.at.z, n.ch), n.at.z);
          else {
            // 멀리서 오는 길은 빠르게: 사장님 눈에서 먼(40m 밖) 동안은 서둘러 오고, 가까워지면 걸어요
            const st = Math.min(d, dt * (d > 26 ? (d2 > 40 * 40 ? 12 : 4) : (n.pace ?? 2.4)));
            P.x += (dx / d) * st; P.z += (dz / d) * st; P.y = standY(P.x, P.z, n.ch);
            n.ch.root.rotation.y = Math.atan2(dx, dz); n.ch.walking = 1;
          }
          n.sh.position.set(P.x, walkY(P.x, P.z) + 0.05, P.z);
          if (!far) n.ch.update(dt);
          continue;
        }
        if (n.goHome) { n.at = null; n.goHome = false; }
      }
      if (n.hold || n.at) {
        n.ch.walking = 0;
        if (n.faceTo) face(n, n.faceTo, dt);
        if (!far) n.ch.update(dt);
        continue;
      }
      if (n.rest > 0) { n.rest -= dt; n.ch.walking = 0; if (!far) n.ch.update(dt); continue; }
      n.t += n.dir * n.speed * dt;
      if (n.t > n.u1 || n.t < n.u0) { n.dir *= -1; n.t = Math.max(n.u0, Math.min(n.u1, n.t)); n.rest = 2 + Math.random() * 3; }
      n.p.getPointAt(n.t, tmp);
      const ahead = n.p.getPointAt(Math.max(0, Math.min(1, n.t + n.dir * 0.002)));
      n.ch.root.position.set(tmp.x, standY(tmp.x, tmp.z, n.ch), tmp.z);
      n.ch.root.rotation.y = Math.atan2(ahead.x - tmp.x, ahead.z - tmp.z);
      n.sh.position.set(tmp.x, walkY(tmp.x, tmp.z) + 0.05, tmp.z);
      n.ch.walking = 1;
      if (!far) n.ch.update(dt);
    }
  };
  const dispose = () => {
    starGeo.dispose(); (stars.material as THREE.Material).dispose(); Object.values(skyTexs).forEach((t2) => t2?.dispose());
    hitGeo.dispose(); hitMat.dispose(); npcHitGeo.dispose(); pawnBody.dispose(); pawnHead.dispose(); moteGeo.dispose(); flowerGeos.forEach((g2) => g2.dispose());
    (motes.material as THREE.Material).dispose(); glints.forEach((g2) => g2.s.material.dispose());
    placed0.lines.forEach((L) => L.dispose());
    garden?.dispose();
    for (const o of own) { const m = (o as THREE.Mesh).material as THREE.ShaderMaterial; m.uniforms?.uMap?.value?.dispose?.(); }
    disposeTree(root);
  };
  // 빛무리(등불·불 켜진 집·가게): 밤에는 더 밝게. 냇물 반짝임은 매 장면 따로 움직여서 빼요
  const glintSet = new Set(glints.map((g2) => g2.s as THREE.Object3D));
  const glows: { s: THREE.Sprite; base: number }[] = [];
  root.traverse((o) => { const sp = o as THREE.Sprite; if (sp.isSprite && !glintSet.has(o) && o !== orb && o !== orbCore && (sp.material as THREE.SpriteMaterial).blending === THREE.AdditiveBlending) glows.push({ s: sp, base: (sp.material as THREE.SpriteMaterial).opacity }); });
  const moteMat = motes.material as THREE.PointsMaterial;
  const setTod = (t: 'day' | 'dusk' | 'night') => {
    if (!skyTexs[t]) skyTexs[t] = skyTex(t);
    ((sky.material as THREE.ShaderMaterial).uniforms.uMap.value = skyTexs[t]);
    stars.visible = t === 'night';
    const k = t === 'day' ? 1 : t === 'dusk' ? 1.25 : 1.75;
    glows.forEach((g2) => { g2.s.material.opacity = Math.min(0.92, g2.base * k); });
    moteMat.color.set(t === 'night' ? '#FFE27A' : t === 'dusk' ? '#FFD39A' : '#FFE7A6'); moteMat.size = t === 'night' ? 0.42 : 0.34;
    orb.visible = orbCore.visible = t !== 'day';
    const dir = t === 'dusk' ? V(-0.86, 0.07, 0.42).normalize() : V(0.3, 0.55, -0.55).normalize();
    orb.position.copy(dir).multiplyScalar(470); orbCore.position.copy(dir).multiplyScalar(468);
    orb.material.color.set(t === 'dusk' ? '#FFA060' : '#C9D8FF'); orb.material.opacity = t === 'dusk' ? 0.85 : 0.5;
    orbCore.material.color.set(t === 'dusk' ? '#FFE0B0' : '#FFFBEA'); orb.scale.setScalar(t === 'dusk' ? 110 : 70); orbCore.scale.setScalar(t === 'dusk' ? 30 : 20);
  };
  void mix;
  return {
    root, ground, hits, shopHits: shopHits.map((x) => x.hit), shops: shopHits, npcs, walkers, houses: spots, towns: townInfo, shopDoor: V(door.x, walkY(door.x, door.z), door.z),
    plaza: V(PLAZA.x, heightAt(PLAZA.x, PLAZA.z), PLAZA.z), plazaR: PLAZA_R, festival,
    bounds: { minX: X0, maxX: X1, minZ: Z0, maxZ: Z1 }, heightAt, walkY, standY, inWater, blocked, update, dispose, setTod,
    bakeSpec: () => bakeSpec(props, heightAt), baked: placed0.baked, bridges, garden, ends,
  };
}
