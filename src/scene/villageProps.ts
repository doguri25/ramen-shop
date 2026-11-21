import * as THREE from 'three';
import { mulberry32 } from '../core/rng';
import BAKE from '../data/village-bake.json';
import { boxG, cylG, M, mesh, sphereG, torusG } from './geo';

// 마음 골목 소품: 놓일 자리는 게임이 정하고, 어떻게 놓이는지(굴러가고 쏟아지고 기울어지고)는
// 블렌더 물리(강체·천)로 미리 계산해 둔 값을 써요. 그리는 건 그대로 수채화 재질이에요.
// 다시 굽기: scratchpad의 export → blender bake 스크립트 (README의 '마음 골목 물리 굽기' 참고)
const PI = Math.PI;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export type BodyKind = 'rock' | 'apple' | 'barrel' | 'crate' | 'log' | 'ball';
export interface Body { k: BodyKind; s: [number, number, number]; p: [number, number, number]; q: [number, number, number, number]; c: number }
export interface Cart { p: [number, number, number]; q: [number, number, number, number] }
export interface Line { p: [number, number, number]; yaw: number; c: number }
export interface Patch { x0: number; z0: number; step: number; n: number; h: number[] }
export interface PropPlan { bodies: Body[]; carts: Cart[]; lines: Line[]; lamps: [number, number, number][]; solids: [number, number, number][]; sig: string; spots: { x: number; z: number; r: number }[] }
interface Bake { sig: string; bodies: number[][]; cloth: { cols: number; rows: number; frames: number; sheets: { w: number; h: number; x: number; f: number[][] }[] } }

export interface PropCtx {
  rnd: () => number;
  heightAt: (x: number, z: number) => number;
  rdist: (x: number, z: number) => number;
  river: THREE.Vector3[];
  paths: THREE.Vector3[];
  houses: { x: number; z: number; yaw: number }[];
  shops: { x: number; z: number; yaw: number }[];
  entries: THREE.Vector3[];
  solids: [number, number, number][];
  shop: THREE.Vector3;
  rect: { x0: number; x1: number; z0: number; z1: number };
}

// 손수레(바퀴 둘 + 앞다리 둘): 땅에 닿는 곳이 y=0, 앞이 +x
export const CART = { base: [1.5, 0.1, 0.9] as const, baseY: 0.5, wallH: 0.32, wallT: 0.07, wheelR: 0.34, wheelZ: 0.53, legX: 0.68 };
export const APPLE_R = 0.1;
// 빨래줄: 기둥 사이 3.2m, 줄 높이 1.62
export const LINE = { half: 1.6, h: 1.62 };

const quatOf = (e: THREE.Euler) => { const q = new THREE.Quaternion().setFromEuler(e); return [q.x, q.y, q.z, q.w] as [number, number, number, number]; };

export function planProps(c: PropCtx): PropPlan {
  const rnd = mulberry32(4242);
  const bodies: Body[] = [], carts: Cart[] = [], lines: Line[] = [], lamps: [number, number, number][] = [];
  const spots: { x: number; z: number; r: number }[] = [];
  const slope = (x: number, z: number) => Math.hypot(c.heightAt(x + 0.5, z) - c.heightAt(x - 0.5, z), c.heightAt(x, z + 0.5) - c.heightAt(x, z - 0.5));
  const free = (x: number, z: number, need: number, maxSlope = 0.45) => {
    if (x < c.rect.x0 + 4 || x > c.rect.x1 - 4 || z < c.rect.z0 + 4 || z > c.rect.z1 - 4) return false;
    if (c.rdist(x, z) < 7.5 + need) return false;
    if (Math.hypot(x - c.shop.x, z - c.shop.z) < 9 + need) return false;
    for (const h of c.houses) if ((h.x - x) ** 2 + (h.z - z) ** 2 < (3.4 + need) ** 2) return false;
    for (const s of c.shops) if ((s.x - x) ** 2 + (s.z - z) ** 2 < (3.6 + need) ** 2) return false;
    for (const p of c.paths) if ((p.x - x) ** 2 + (p.z - z) ** 2 < (2.6 + need) ** 2) return false;
    for (const [sx, sz, r] of c.solids) if ((sx - x) ** 2 + (sz - z) ** 2 < (r + need + 0.6) ** 2) return false;
    for (const s of spots) if ((s.x - x) ** 2 + (s.z - z) ** 2 < (s.r + need + 1.2) ** 2) return false;
    return slope(x, z) < maxSlope;
  };
  const find = (cx: number, cz: number, r0: number, r1: number, need: number, maxSlope?: number) => {
    for (let i = 0; i < 90; i++) {
      const a = rnd() * PI * 2, r = r0 + rnd() * (r1 - r0), x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (free(x, z, need, maxSlope)) { spots.push({ x, z, r: need }); return { x, z }; }
    }
    return null;
  };
  const gy = (x: number, z: number) => c.heightAt(x, z);
  // 발밑에서 가장 높은 땅 (비탈에서 처음부터 땅에 박혀 튕겨 나가지 않게, 살짝 위에서 떨어뜨려요)
  const gmax = (x: number, z: number, r: number) => { let m = gy(x, z); for (let i = 0; i < 8; i++) { const a = (i / 8) * PI * 2; m = Math.max(m, gy(x + Math.cos(a) * r, z + Math.sin(a) * r)); } return m; };
  const at = (cx: number, cz: number, yaw: number, lx: number, lz: number) => ({ x: cx + Math.cos(yaw) * lx + Math.sin(yaw) * lz, z: cz - Math.sin(yaw) * lx + Math.cos(yaw) * lz });
  const H = c.houses.length;

  // 손수레와 사과: 마을 어귀 몇 곳. 수레는 땅 기울기를 따라 놓고, 사과는 블렌더에서 쏟아져요
  for (const k of [1, 3, 4, 6]) {
    const e = c.entries[k % c.entries.length]; if (!e) continue;
    const s = find(e.x, e.z, 3, 14, 1.3, 0.3); if (!s) continue;
    const yaw = rnd() * PI * 2;
    // 땅 기울기(법선)에 맞춰 수레를 기울여요
    const n = V(gy(s.x - 0.5, s.z) - gy(s.x + 0.5, s.z), 1, gy(s.x, s.z - 0.5) - gy(s.x, s.z + 0.5)).normalize();
    const fwd = V(Math.cos(yaw), 0, -Math.sin(yaw)); fwd.addScaledVector(n, -fwd.dot(n)).normalize();
    const side = V().crossVectors(fwd, n).normalize();
    const m = new THREE.Matrix4().makeBasis(fwd, n, side);
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    const p = V(s.x, gy(s.x, s.z), s.z);
    carts.push({ p: [p.x, p.y, p.z], q: [q.x, q.y, q.z, q.w] });
    const toW = (lx: number, ly: number, lz: number) => V(lx, ly, lz).applyQuaternion(q).add(p);
    const floor = CART.baseY + CART.base[1] / 2 + APPLE_R + 0.01;
    const put = (lx: number, ly: number, lz: number) => { const w = toW(lx, ly, lz); bodies.push({ k: 'apple', s: [APPLE_R, APPLE_R, APPLE_R], p: [w.x, w.y, w.z], q: [0, 0, 0, 1], c: Math.floor(rnd() * 3) }); };
    for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) put(-0.55 + i * 0.22, floor, -0.22 + j * 0.22);
    for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) put(-0.44 + i * 0.22, floor + 0.17, -0.11 + j * 0.22);
    for (let i = 0; i < 4; i++) put(-0.33 + i * 0.22, floor + 0.34, 0);
    for (let i = 0; i < 4; i++) put(0.42 + (i % 2) * 0.08, floor + 0.44 + i * 0.22, -0.12 + (i % 3) * 0.12); // 넘치게 쌓인 사과
  }
  // 통과 상자: 가게 옆에 쌓아 두었어요
  c.shops.forEach((sh) => {
    const side = rnd() < 0.5 ? 1 : -1;
    const base = at(sh.x, sh.z, sh.yaw, side * 3.4, -0.4);
    const s = find(base.x, base.z, 0, 8, 1.1, 0.2); if (!s) return;
    const yaw = sh.yaw + (rnd() - 0.5) * 0.4;
    const g = gmax(s.x, s.z, 1.4) + 0.06;
    const b = (lx: number, lz: number, ly: number, k: 'barrel' | 'crate', lie = false) => {
      const w = at(s.x, s.z, yaw, lx, lz);
      const size: [number, number, number] = k === 'barrel' ? [0.3, 0.76, 0.3] : [0.56, 0.56, 0.56];
      const e = new THREE.Euler(lie ? PI / 2 : 0, yaw + (rnd() - 0.5) * 0.3, 0, 'YXZ');
      bodies.push({ k, s: size, p: [w.x, g + ly, w.z], q: quatOf(e), c: Math.floor(rnd() * 3) });
    };
    b(-0.68, 0, 0.39, 'barrel'); b(0, 0, 0.39, 'barrel'); b(0.68, 0.05, 0.39, 'barrel');
    b(-0.34, 0, 1.17, 'barrel'); b(0.2, 0.88, 0.29, 'crate'); b(0.26, 0.88, 0.87, 'crate');
  });
  // 장작더미, 공, 빨래줄: 집 옆 마당
  for (const i of [3, 14, 25, 37, 50, 63]) {
    const h = c.houses[i % H]; const s = find(h.x, h.z, 3.4, 12, 0.9, 0.14); if (!s) continue;
    const yaw = rnd() * PI;
    const g = gmax(s.x, s.z, 0.75) + 0.05;
    const lg = (lx: number, ly: number) => { const w = at(s.x, s.z, yaw, lx, 0); bodies.push({ k: 'log', s: [0.11, 1.3, 0.11], p: [w.x, g + ly, w.z], q: quatOf(new THREE.Euler(PI / 2, yaw, 0, 'YXZ')), c: Math.floor(rnd() * 3) }); };
    const r = 0.115;
    [-0.24, 0, 0.24].forEach((x) => lg(x, r + 0.02)); [-0.12, 0.12].forEach((x) => lg(x, r * 2.8 + 0.03)); lg(0.02, r * 4.6 + 0.04);
  }
  for (const i of [10, 23, 40, 52, 66]) {
    const h = c.houses[i % H]; const s = find(h.x, h.z, 3, 9, 0.4, 0.25); if (!s) continue;
    bodies.push({ k: 'ball', s: [0.26, 0.26, 0.26], p: [s.x, gmax(s.x, s.z, 0.3) + 0.5, s.z], q: quatOf(new THREE.Euler(rnd() * 3, rnd() * 3, 0)), c: Math.floor(rnd() * 3) });
  }
  for (const i of [7, 19, 31, 44, 56, 68]) {
    const h = c.houses[i % H]; const s = find(h.x, h.z, 3.8, 10, 1.9, 0.45); if (!s) continue;
    lines.push({ p: [s.x, gy(s.x, s.z), s.z], yaw: h.yaw + PI / 2 + (rnd() - 0.5) * 0.3, c: Math.floor(rnd() * 4) });
  }
  // 냇가 돌: 둑 위에서 떨어뜨리면 비탈을 따라 굴러 자리를 잡아요
  for (let i = 0, n = 0; i < 1500 && n < 90; i++) {
    const p = c.river[Math.floor(rnd() * c.river.length)];
    if (p.x < c.rect.x0 + 3 || p.x > c.rect.x1 - 3) continue;
    const a = rnd() * PI * 2, r = 5.4 + rnd() * 3.6, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
    if (c.rdist(x, z) < 5.2 || slope(x, z) > 0.7) continue;
    if (c.paths.some((q) => (q.x - x) ** 2 + (q.z - z) ** 2 < 2.2 ** 2)) continue;
    const sz = 0.28 + rnd() * 0.36;
    bodies.push({ k: 'rock', s: [sz, sz * (0.5 + rnd() * 0.15), sz * (0.75 + rnd() * 0.2)], p: [x, gmax(x, z, sz) + sz * 0.62 + 0.04, z], q: quatOf(new THREE.Euler((rnd() - 0.5) * 0.2, rnd() * PI * 2, (rnd() - 0.5) * 0.2)), c: Math.floor(rnd() * 3) });
    n++;
  }
  // 가로등: 라면 가게 근처 큰길 가
  for (let i = 0, n = 0; i < 300 && n < 10; i++) {
    const p = c.paths[Math.floor(rnd() * c.paths.length)];
    if (Math.hypot(p.x - c.shop.x, p.z - c.shop.z) > 48) continue;
    const a = rnd() * PI * 2, x = p.x + Math.cos(a) * 2.4, z = p.z + Math.sin(a) * 2.4;
    if (c.paths.some((q) => (q.x - x) ** 2 + (q.z - z) ** 2 < 2.0 ** 2) || c.rdist(x, z) < 7 || lamps.some(([lx, , lz]) => Math.hypot(lx - x, lz - z) < 11)) continue;
    if (c.houses.some((h) => Math.hypot(h.x - x, h.z - z) < 3.6) || c.shops.some((s) => Math.hypot(s.x - x, s.z - z) < 4) || Math.hypot(x - c.shop.x, z - c.shop.z) < 5) continue;
    lamps.push([x, gy(x, z), z]); n++;
  }
  const solids: [number, number, number][] = [
    ...carts.map((ct) => [ct.p[0], ct.p[2], 1.0] as [number, number, number]),
    ...lines.flatMap((l) => [-1, 1].map((sd) => [l.p[0] + Math.cos(l.yaw) * LINE.half * sd, l.p[2] - Math.sin(l.yaw) * LINE.half * sd, 0.3] as [number, number, number])),
    ...lamps.map(([x, , z]) => [x, z, 0.3] as [number, number, number]),
  ];
  // 블렌더로 구운 값이 지금 자리와 맞는지 알아보는 표
  let hsh = 0;
  for (const b of bodies) for (const v of b.p) hsh = (hsh * 31 + Math.round(v * 100)) | 0;
  return { bodies, carts, lines, lamps, solids, sig: `${bodies.length}:${carts.length}:${lines.length}:${hsh >>> 0}`, spots };
}

// 블렌더로 보낼 것: 소품마다 발밑 땅 조각(0.5m 간격 높이표)
export function bakeSpec(plan: PropPlan, heightAt: (x: number, z: number) => number) {
  const patches: Patch[] = [];
  const add = (x: number, z: number, size: number) => {
    const step = 0.5, n = Math.round(size / step) + 1, x0 = x - size / 2, z0 = z - size / 2, h: number[] = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) h.push(+heightAt(x0 + i * step, z0 + j * step).toFixed(3));
    patches.push({ x0, z0, step, n, h });
  };
  const cl: { x: number; z: number }[] = [];
  for (const b of plan.bodies) {
    if (cl.some((c) => Math.hypot(c.x - b.p[0], c.z - b.p[2]) < 4)) continue;
    cl.push({ x: b.p[0], z: b.p[2] });
    add(b.p[0], b.p[2], 14);
  }
  return { sig: plan.sig, bodies: plan.bodies, carts: plan.carts, cart: CART, appleR: APPLE_R, line: LINE, patches };
}

// ── 그리기 ──
const APPLE = ['#E3645A', '#F0974A', '#9CC77A'];
const WOOD = ['#B98A5E', '#A87B52', '#C49A6C'];
const ROCK = ['#C9C2B6', '#B6AEA2', '#D3CCC0'];
const BALL = [['#E3645A', '#FFFFFF'], ['#6FB3E0', '#FFE07A'], ['#8DC26F', '#FFFFFF']];
const CLOTH = [['#F7B3C2', '#BFE0FA', '#FFF4D6'], ['#FFE07A', '#C9B6F0', '#FFFFFF'], ['#9FD8B8', '#F9C38E', '#E9F3FB'], ['#E9F3FB', '#F7B3C2', '#C9E2A8']];

function bodyMesh(b: Body, into: THREE.Object3D, p: THREE.Vector3, q: THREE.Quaternion) {
  const g = new THREE.Group(); g.position.copy(p); g.quaternion.copy(q); into.add(g);
  switch (b.k) {
    case 'apple':
      mesh(sphereG(APPLE_R, 10, 8), M(APPLE[b.c % 3], { noise: 2 }), [0, 0, 0], [1, 0.92, 1], [0, 0, 0], g);
      mesh(cylG(0.008, 0.01, 0.06, 4), M('#7A5236'), [0, APPLE_R * 0.95, 0], 1, [0.2, 0, 0.1], g);
      break;
    case 'barrel': {
      const [r, h] = b.s;
      mesh(cylG(r * 0.92, r * 0.92, h, 14), M(WOOD[b.c % 3], { noise: 2 }), [0, 0, 0], 1, [0, 0, 0], g);
      mesh(cylG(r, r, h * 0.55, 14), M(WOOD[(b.c + 1) % 3], { noise: 2 }), [0, 0, 0], 1, [0, 0, 0], g);
      for (const y of [-h * 0.38, 0, h * 0.38]) mesh(torusG(r * (y ? 0.93 : 1.0), 0.022, 5, 18), M('#6E5A4A'), [0, y, 0], 1, [PI / 2, 0, 0], g);
      mesh(cylG(r * 0.85, r * 0.85, 0.01, 14), M('#D9B48A'), [0, h / 2 + 0.002, 0], 1, [0, 0, 0], g);
      break;
    }
    case 'crate': {
      const s = b.s[0];
      mesh(boxG(s, s, s), M('#D2A878', { noise: 2 }), [0, 0, 0], 1, [0, 0, 0], g);
      for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) mesh(boxG(0.06, s + 0.01, 0.06), M('#A87B52'), [x * (s / 2 - 0.02), 0, z * (s / 2 - 0.02)], 1, [0, 0, 0], g);
      mesh(boxG(s + 0.01, 0.07, s + 0.01), M('#B98A5E'), [0, 0, 0], 1, [0, 0, 0], g);
      break;
    }
    case 'log': {
      const [r, l] = b.s;
      mesh(cylG(r, r, l, 9), M(WOOD[b.c % 3], { noise: 3 }), [0, 0, 0], 1, [0, 0, 0], g);
      for (const y of [-l / 2 - 0.003, l / 2 + 0.003]) mesh(cylG(r * 0.86, r * 0.86, 0.01, 9), M('#E9CFA4'), [0, y, 0], 1, [0, 0, 0], g);
      break;
    }
    case 'ball': {
      const [c1, c2] = BALL[b.c % 3];
      mesh(sphereG(b.s[0], 14, 10), M(c1, { spec: 0.4 }), [0, 0, 0], 1, [0, 0, 0], g);
      mesh(torusG(b.s[0] * 0.99, 0.045, 6, 20), M(c2), [0, 0, 0], 1, [0, 0, 0], g);
      mesh(torusG(b.s[0] * 0.99, 0.045, 6, 20), M(c2), [0, 0, 0], 1, [0, PI / 2, 0], g);
      break;
    }
    case 'rock':
      mesh(sphereG(1, 9, 6), M(ROCK[b.c % 3], { noise: 3 }), [0, 0, 0], b.s, [0, 0, 0], g);
      break;
  }
}

function cartMesh(into: THREE.Object3D, p: THREE.Vector3, q: THREE.Quaternion) {
  const g = new THREE.Group(); g.position.copy(p); g.quaternion.copy(q); into.add(g);
  const [bx, by, bz] = CART.base, wood = M('#B98A5E', { noise: 2 }), dark = M('#8A5E3C');
  mesh(boxG(bx, by, bz), wood, [0, CART.baseY, 0], 1, [0, 0, 0], g);
  const top = CART.baseY + by / 2 + CART.wallH / 2;
  for (const s of [-1, 1]) mesh(boxG(bx, CART.wallH, CART.wallT), wood, [0, top, s * (bz / 2 - CART.wallT / 2)], 1, [0, 0, 0], g);
  for (const s of [-1, 1]) mesh(boxG(CART.wallT, CART.wallH, bz), wood, [s * (bx / 2 - CART.wallT / 2), top, 0], 1, [0, 0, 0], g);
  for (const s of [-1, 1]) {
    mesh(cylG(CART.wheelR, CART.wheelR, 0.08, 16), M('#8A5E3C'), [-0.15, CART.wheelR, s * CART.wheelZ], 1, [PI / 2, 0, 0], g);
    mesh(cylG(0.07, 0.07, 0.1, 8), M('#F6CF3E'), [-0.15, CART.wheelR, s * (CART.wheelZ + 0.03)], 1, [PI / 2, 0, 0], g);
    mesh(boxG(0.07, CART.baseY - by / 2, 0.07), dark, [CART.legX, (CART.baseY - by / 2) / 2, s * (bz / 2 - 0.08)], 1, [0, 0, 0], g);
    mesh(boxG(0.9, 0.06, 0.06), dark, [bx / 2 + 0.4, CART.baseY + 0.12, s * 0.3], 1, [0, 0, 0.25], g);
  }
}

function lampMesh(into: THREE.Object3D, x: number, y: number, z: number) {
  mesh(cylG(0.05, 0.07, 2.4, 8), M('#5E6B78'), [x, y + 1.2, z], 1, [0, 0, 0], into);
  mesh(cylG(0.14, 0.18, 0.12, 8), M('#5E6B78'), [x, y + 0.06, z], 1, [0, 0, 0], into);
  mesh(sphereG(0.2, 12, 8), M('#FFF1C2', { flat: 0.9, rim: 0 }), [x, y + 2.5, z], 1, [0, 0, 0], into);
  mesh(cylG(0.02, 0.2, 0.12, 8), M('#5E6B78'), [x, y + 2.68, z], 1, [0, 0, 0], into);
}

// 빨래: 블렌더 천 시뮬레이션을 몇 장면 구워 두고 앞뒤로 이어 틀어요
export interface Laundry { group: THREE.Group; update: (t: number) => void; dispose: () => void }
function laundry(l: Line, idx: number, cloth: Bake['cloth'] | null): Laundry {
  const group = new THREE.Group();
  group.position.set(...l.p); group.rotation.y = l.yaw;
  for (const s of [-1, 1]) mesh(cylG(0.045, 0.06, LINE.h + 0.12, 7), M('#8A5E3C'), [s * LINE.half, (LINE.h + 0.12) / 2, 0], 1, [0, 0, 0], group);
  mesh(cylG(0.012, 0.012, LINE.half * 2, 4), M('#F4EEE6'), [0, LINE.h, 0], 1, [0, 0, PI / 2], group);
  const geos: THREE.BufferGeometry[] = [];
  const upd: ((t: number) => void)[] = [];
  const sheets = cloth?.sheets ?? [{ w: 0.7, h: 0.8, x: -0.95, f: [] }, { w: 0.85, h: 0.7, x: 0.05, f: [] }, { w: 0.6, h: 0.75, x: 0.95, f: [] }];
  const cols = cloth?.cols ?? 7, rows = cloth?.rows ?? 9;
  sheets.forEach((sh, k) => {
    const g = new THREE.BufferGeometry(), N = cols * rows, pos = new Float32Array(N * 3), ix: number[] = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const v = j * cols + i; pos[v * 3] = sh.x - sh.w / 2 + (sh.w * i) / (cols - 1); pos[v * 3 + 1] = LINE.h - (sh.h * j) / (rows - 1); pos[v * 3 + 2] = 0; }
    for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) { const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1; ix.push(a, c, b, b, c, d); }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(ix);
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(N * 2), 2));
    g.computeVertexNormals();
    geos.push(g);
    const m = new THREE.Mesh(g, M(CLOTH[l.c % 4][k], { side: THREE.DoubleSide, noise: 1 }));
    m.userData.ownGeo = true;
    group.add(m);
    const F = sh.f;
    if (F.length > 1) {
      const L = F.length, phase = idx * 0.37 + k * 0.11;
      upd.push((t) => {
        // 12장면/초, 앞으로 갔다가 뒤로 (끊기지 않게)
        const u = ((t * 12 + phase * L) % (2 * (L - 1)) + 2 * (L - 1)) % (2 * (L - 1));
        const fu = u < L - 1 ? u : 2 * (L - 1) - u, a = Math.floor(fu), w = fu - a, A = F[a], Bf = F[Math.min(L - 1, a + 1)];
        for (let v = 0; v < N * 3; v++) pos[v] = (A[v] * (1 - w) + Bf[v] * w) / 1000;
        g.attributes.position.needsUpdate = true;
        g.computeVertexNormals();
      });
    }
  });
  return { group, update: (t) => upd.forEach((f) => f(t)), dispose: () => geos.forEach((g) => g.dispose()) };
}

// 계획 + 구운 값 → 장면에 놓기. 정적인 것은 stat(합쳐 그리기)에, 빨래는 따로 움직여요
export function placeProps(plan: PropPlan, stat: THREE.Object3D, root: THREE.Object3D, heightAt: (x: number, z: number) => number) {
  const bake = BAKE as unknown as Bake;
  const ok = bake.sig === plan.sig && bake.bodies.length === plan.bodies.length;
  if (!ok && import.meta.env.DEV) console.warn('[village] 블렌더 물리 굽기 값이 지금 자리와 달라요. 다시 구워 주세요.', bake.sig, plan.sig);
  plan.bodies.forEach((b, i) => {
    let r = ok ? bake.bodies[i] : null;
    if (r && r[1] < heightAt(r[0], r[2]) - 0.45) { if (b.k === 'apple' || b.k === 'ball') return; r = null; } // 땅 밖으로 빠진 것은 빼거나 처음 자리에
    const p = r ? V(r[0], r[1], r[2]) : V(...b.p);
    const q = r ? new THREE.Quaternion(r[3], r[4], r[5], r[6]) : new THREE.Quaternion(...b.q);
    if (!r && b.k !== 'apple') p.y -= b.k === 'rock' ? 0.04 + b.s[1] * 0.3 : 0.05; // 굽기 전에는 대충 땅에 붙여요
    bodyMesh(b, stat, p, q);
  });
  for (const c of plan.carts) cartMesh(stat, V(...c.p), new THREE.Quaternion(...c.q));
  for (const [x, y, z] of plan.lamps) lampMesh(stat, x, y, z);
  const lines = plan.lines.map((l, i) => { const L = laundry(l, i, ok ? bake.cloth : null); root.add(L.group); return L; });
  return { lines, baked: ok };
}
