import * as THREE from 'three';
import { mulberry32 } from '../core/rng';
import { CITEM, type CItem, type CPicks, type CraftKind } from '../data/craft';
import { darken, lighten } from '../paint/brush';
import { buildMini, isMini, miniItemModel, miniShelf } from './craftMini';
import { makeShadow } from './fx';
import { boxG, coneG, cylG, disposeTree, M, Mu, mesh, sphereG, torusG } from './geo';

// 가게 봐 주기 (수업용): 빵집은 쟁반 위에 반죽·속·토핑·마무리를 올려 구워요.
// 꽃집은 주인공 꽃·곁들일 꽃·잎을 모아 포장지로 감싸고 리본을 묶어요.
const PI = Math.PI;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const LOAF = { rx: 0.085, ry: 0.05, rz: 0.065, y: 0.03 };
const topY = (x: number, z: number) => LOAF.y + LOAF.ry * Math.sqrt(Math.max(0, 1 - (x / LOAF.rx) ** 2 - (z / LOAF.rz) ** 2));

// 둥근 빵 윗면을 따라 붙는 띠 (곧은 막대는 빵 끝에서 떠 버려요)
function strip(pts: [number, number][], w: number, h: number, mat: THREE.Material, lift: number, into: THREE.Object3D) {
  for (let k = 0; k < pts.length - 1; k++) {
    const [x0, z0] = pts[k], [x1, z1] = pts[k + 1];
    const y0 = topY(x0, z0) + lift, y1 = topY(x1, z1) + lift;
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, hz = Math.hypot(dx, dz), len = Math.hypot(hz, dy);
    mesh(boxG(len + 0.0015, h, w), mat, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], 1, [0, Math.atan2(-dz, dx), Math.atan2(dy, hz)], into);
  }
}

// ── 빵 ──
function loaf(it: CItem, into: THREE.Object3D) {
  const g = new THREE.Group(); into.add(g);
  // 굽는 동안 색을 바꾸니 빵마다 따로 만든 재질을 써요 (같은 색 빵이 다음에 처음부터 구운 색이 되지 않게)
  const m = mesh(sphereG(1, 28, 18), Mu(it.color, { noise: 2.5 }), [0, LOAF.y, 0], [LOAF.rx, LOAF.ry, LOAF.rz], [0, 0, 0], g);
  m.userData.dough = true;
  // 칼집 세 줄
  const cut = M(darken(it.color, 0.18)), dx = Math.sin(0.35) * 0.025, dz = Math.cos(0.35) * 0.025;
  for (const x of [-0.035, 0, 0.035]) strip([0, 1, 2, 3, 4].map((k): [number, number] => { const s = k / 2 - 1; return [x + s * dx, s * dz]; }), 0.004, 0.003, cut, 0.0008, g);
  return g;
}
function topping(it: CItem, into: THREE.Object3D, seed: number) {
  const g = new THREE.Group(); into.add(g);
  const rnd = mulberry32(seed * 97 + it.id.length);
  const spot = (r = 0.7) => { const a = rnd() * PI * 2, d = Math.sqrt(rnd()) * r; const x = Math.cos(a) * d * LOAF.rx, z = Math.sin(a) * d * LOAF.rz; return V(x, topY(x, z), z); };
  const c = it.color;
  const put = (geo: THREE.BufferGeometry, col: string, s: [number, number, number] | number, n: number, lift = 0, r = 0.7) => { for (let i = 0; i < n; i++) { const p = spot(r); mesh(geo, M(col, { noise: 2 }), [p.x, p.y + lift, p.z], s, [rnd() * 3, rnd() * 3, rnd() * 3], g); } };
  switch (it.shape) {
    case 'berry': put(sphereG(1, 10, 8), c, 0.013, 4, 0.008, 0.6); break;
    case 'dots': put(sphereG(1, 6, 5), c, [0.006, 0.005, 0.006], 12, 0.003); break;
    case 'sprinkle': for (let i = 0; i < 22; i++) { const p = spot(); mesh(cylG(0.0022, 0.0022, 0.012, 5), M(['#F28CB8', '#6FB3E0', '#FFE07A', '#8DC26F', '#FFFFFF'][i % 5]), [p.x, p.y + 0.002, p.z], 1, [PI / 2, rnd() * 3, 0], g); } break;
    case 'slice': put(cylG(1, 1, 1, 12), c, [0.015, 0.004, 0.015], 5, 0.003, 0.6); break;
    case 'nut': put(sphereG(1, 8, 6), c, [0.012, 0.008, 0.009], 4, 0.005, 0.6); break;
    case 'leaf': put(sphereG(1, 8, 6), c, [0.016, 0.003, 0.008], 3, 0.004, 0.5); break;
    case 'heart': for (let i = 0; i < 3; i++) { const p = spot(0.55); const h = new THREE.Group(); h.position.set(p.x, p.y + 0.006, p.z); h.rotation.y = rnd() * 3; g.add(h); for (const sx of [-1, 1]) mesh(sphereG(1, 10, 8), M(c), [sx * 0.006, 0, -0.004], [0.009, 0.005, 0.009], [0, 0, 0], h); mesh(coneG(0.013, 0.014, 4), M(c), [0, 0, 0.005], [1, 0.4, 1], [PI / 2, 0, PI / 4], h); } break;
    case 'seed': put(sphereG(1, 6, 4), c, [0.004, 0.0025, 0.0025], 26, 0.002, 0.8); break;
    case 'puff': put(cylG(1, 1, 1, 12), c, [0.011, 0.012, 0.011], 4, 0.008, 0.6); break;
    case 'star': put(new THREE.OctahedronGeometry(1), c, [0.012, 0.007, 0.012], 4, 0.007, 0.6); break;
    default: put(sphereG(1, 8, 6), c, 0.01, 5, 0.005);
  }
  return g;
}
function finishLayer(it: CItem, into: THREE.Object3D) {
  const g = new THREE.Group(); into.add(g);
  const rnd = mulberry32(it.id.length * 7);
  if (it.shape === 'powder') for (let i = 0; i < 70; i++) { const a = rnd() * PI * 2, d = Math.sqrt(rnd()) * 0.85, x = Math.cos(a) * d * LOAF.rx, z = Math.sin(a) * d * LOAF.rz; mesh(sphereG(1, 5, 4), M(it.color, { flat: 0.4 }), [x, topY(x, z) + 0.001, z], 0.0028, [0, 0, 0], g); }
  else if (it.shape === 'glaze') mesh(sphereG(1, 28, 14, ), M(it.color, { alpha: 0.72, spec: 0.8, rim: 0.3 }), [0, LOAF.y + 0.004, 0], [LOAF.rx * 1.03, LOAF.ry * 1.02, LOAF.rz * 1.03], [0, 0, 0], g);
  else {
    // 줄무늬: 빵 둥근 면을 따라 살짝 비스듬히 그어요
    const mat = M(it.color);
    for (let i = 0; i < 5; i++) {
      const z = (i / 4 - 0.5) * LOAF.rz * 1.3, tilt = (i % 2 ? 1 : -1) * 0.12;
      const half = 0.9 * LOAF.rx * Math.sqrt(Math.max(0.05, 1 - (z / LOAF.rz) ** 2));
      strip(Array.from({ length: 11 }, (_, k): [number, number] => { const x = -half + (k / 10) * 2 * half; return [x, z + x * tilt]; }), 0.006, 0.0035, mat, 0.002, g);
    }
  }
  return g;
}
function fillBlob(it: CItem, into: THREE.Object3D) {
  const g = new THREE.Group(); into.add(g);
  // 칼집 사이로 속이 살짝 보여요
  mesh(sphereG(1, 14, 10), M(it.color, { noise: 2, spec: 0.3 }), [0, topY(0, 0) - 0.004, 0], [0.03, 0.014, 0.022], [0, 0, 0], g);
  return g;
}
function tray(into: THREE.Object3D) {
  mesh(cylG(0.13, 0.12, 0.014, 32), M('#C9A36E', { noise: 3 }), [0, 0.007, 0], 1, [0, 0, 0], into);
  mesh(torusG(0.128, 0.006, 6, 36), M('#A87B52'), [0, 0.014, 0], 1, [PI / 2, 0, 0], into);
  mesh(cylG(0.115, 0.115, 0.002, 32), M('#FFF6E6', { flat: 0.4 }), [0, 0.015, 0], 1, [0, 0, 0], into); // 종이 깔개
}

// ── 꽃 ──
function flowerHead(it: CItem, s = 1): THREE.Group {
  const g = new THREE.Group();
  const c = it.color, c2 = it.color2 ?? '#F6D46A';
  const rnd = mulberry32(it.id.length * 31 + it.id.charCodeAt(3));
  const ring = (n: number, r: number, sz: [number, number, number], col: string, tilt: number, y = 0) => { for (let i = 0; i < n; i++) { const a = (i / n) * PI * 2 + rnd() * 0.2; const p = mesh(sphereG(1, 10, 6), M(col, { noise: 2 }), [Math.cos(a) * r * s, y * s, Math.sin(a) * r * s], [sz[0] * s, sz[1] * s, sz[2] * s], [0, 0, 0], g); p.rotation.set(0, -a, tilt); } };
  switch (it.shape) {
    case 'rose':
      ring(7, 0.02, [0.018, 0.012, 0.012], c, 0.9);
      ring(5, 0.011, [0.013, 0.012, 0.01], darken(c, 0.08), 1.2, 0.006);
      mesh(sphereG(1, 10, 8), M(darken(c, 0.15)), [0, 0.012 * s, 0], [0.01 * s, 0.01 * s, 0.01 * s], [0, 0, 0], g);
      break;
    case 'sun':
      ring(16, 0.034, [0.02, 0.003, 0.007], c, 0.15);
      mesh(cylG(0.022 * s, 0.024 * s, 0.01 * s, 18), M(c2, { noise: 4 }), [0, 0.003 * s, 0], 1, [0, 0, 0], g);
      break;
    case 'daisy':
      ring(12, 0.022, [0.014, 0.0025, 0.006], c, 0.2);
      mesh(sphereG(1, 10, 8), M(c2), [0, 0.003 * s, 0], [0.009 * s, 0.006 * s, 0.009 * s], [0, 0, 0], g);
      break;
    case 'tulip':
      for (let i = 0; i < 4; i++) { const a = (i / 4) * PI * 2; const p = mesh(sphereG(1, 10, 8), M(i % 2 ? c : lighten(c, 0.1), { noise: 2 }), [Math.cos(a) * 0.011 * s, 0.018 * s, Math.sin(a) * 0.011 * s], [0.012 * s, 0.026 * s, 0.009 * s], [0, 0, 0], g); p.rotation.set(0, -a, 0.15); }
      break;
    case 'lily':
      for (let i = 0; i < 6; i++) { const a = (i / 6) * PI * 2; const p = mesh(coneG(0.01 * s, 0.045 * s, 6), M(c, { noise: 2 }), [Math.cos(a) * 0.016 * s, 0.01 * s, Math.sin(a) * 0.016 * s], [1, 1, 0.45], [0, 0, 0], g); p.rotation.set(0, -a, -PI / 2 + 0.5); }
      for (let i = 0; i < 4; i++) mesh(sphereG(1, 6, 4), M(c2), [Math.cos(i * 1.6) * 0.004 * s, 0.02 * s, Math.sin(i * 1.6) * 0.004 * s], 0.003 * s, [0, 0, 0], g);
      break;
    case 'cluster':
      for (let i = 0; i < 16; i++) { const a = rnd() * PI * 2, r = Math.sqrt(rnd()) * 0.028; mesh(sphereG(1, 8, 6), M(i % 3 ? c : lighten(c, 0.15), { noise: 2 }), [Math.cos(a) * r * s, (0.01 + rnd() * 0.012) * s, Math.sin(a) * r * s], 0.009 * s, [0, 0, 0], g); }
      break;
    case 'spike':
      for (let i = 0; i < 9; i++) mesh(sphereG(1, 8, 6), M(i % 2 ? c : lighten(c, 0.12)), [(rnd() - 0.5) * 0.006 * s, (i * 0.009) * s, (rnd() - 0.5) * 0.006 * s], [0.007 * s, 0.006 * s, 0.007 * s], [0, 0, 0], g);
      break;
    case 'bell':
      for (let i = 0; i < 4; i++) mesh(coneG(0.008 * s, 0.012 * s, 8), M(c), [(i - 1.5) * 0.009 * s, -i * 0.004 * s, 0.004 * s], 1, [PI, 0, 0], g);
      break;
    default: ring(8, 0.02, [0.014, 0.003, 0.006], c, 0.2);
  }
  return g;
}
function leafSprig(it: CItem, s = 1): THREE.Group {
  const g = new THREE.Group();
  const c = it.color;
  mesh(cylG(0.0025 * s, 0.003 * s, 0.14 * s, 5), M(darken(c, 0.15)), [0, 0.07 * s, 0], 1, [0, 0, 0], g);
  const along = (n: number, sz: [number, number, number], off = 0.012) => { for (let i = 0; i < n; i++) { const y = (0.03 + (i / n) * 0.11) * s, sd = i % 2 ? 1 : -1; const l = mesh(sphereG(1, 8, 6), M(i % 2 ? c : lighten(c, 0.1), { noise: 2 }), [sd * off * s, y, 0], [sz[0] * s, sz[1] * s, sz[2] * s], [0, 0, sd * 0.6], g); l.userData.leaf = true; } };
  switch (it.shape) {
    case 'round': along(7, [0.011, 0.011, 0.003], 0.01); break;
    case 'fern': along(12, [0.014, 0.004, 0.003], 0.012); break;
    case 'long': along(8, [0.016, 0.004, 0.004], 0.013); break;
    case 'clover': for (let i = 0; i < 4; i++) { const a = (i / 4) * PI * 2; mesh(sphereG(1, 8, 6), M(c), [Math.cos(a) * 0.008 * s, 0.145 * s, Math.sin(a) * 0.008 * s], [0.009 * s, 0.003 * s, 0.009 * s], [0, 0, 0], g); } along(3, [0.008, 0.008, 0.002], 0.008); break;
    default: along(7, [0.013, 0.011, 0.003], 0.012);
  }
  return g;
}
function wrapCone(it: CItem): THREE.Group {
  const g = new THREE.Group();
  const m = mesh(cylG(0.085, 0.022, 0.17, 18, true), M(it.color, { side: THREE.DoubleSide, noise: 2, rim: 0.5 }), [0, 0.1, 0], 1, [0, 0, 0], g);
  // 접힌 종이 끝 세 장
  for (let i = 0; i < 3; i++) { const a = (i / 3) * PI * 2 + 0.4; const p = mesh(coneG(0.04, 0.06, 3, ), M(lighten(it.color, 0.08), { side: THREE.DoubleSide }), [Math.cos(a) * 0.07, 0.19, Math.sin(a) * 0.07], [1, 1, 0.12], [0, -a, 0], g); p.rotation.x = Math.sin(a) * 0.25; }
  void m;
  return g;
}
// br: 감는 띠 반지름. 매듭과 고리는 띠 바깥 앞쪽에 달아요 (포장지 속에 묻히지 않게)
function bow(it: CItem, br = 0.033): THREE.Group {
  const g = new THREE.Group(), f = br + 0.006;
  for (const sd of [-1, 1]) mesh(torusG(0.016, 0.005, 6, 16), M(it.color), [sd * 0.017, 0, f], [1, 0.7, 1], [0, 0, sd * 0.6], g);
  mesh(sphereG(1, 8, 6), M(darken(it.color, 0.08)), [0, 0, f + 0.002], 0.007, [0, 0, 0], g);
  for (const sd of [-1, 1]) mesh(boxG(0.008, 0.04, 0.003), M(it.color), [sd * 0.01, -0.022, f + 0.002], 1, [0, 0, sd * 0.35], g);
  mesh(torusG(br, 0.004, 5, 28), M(it.color), [0, 0, 0], 1, [PI / 2, 0, 0], g); /* 줄기를 감는 띠 */
  return g;
}

// 재료 카드에 쓸 작은 그림
export function craftItemModel(it: CItem): THREE.Group {
  if (isMini(it.kind)) return miniItemModel(it);
  const o = new THREE.Group();
  const plate = (r = 0.15) => { mesh(cylG(r, r * 0.86, 0.02, 28), M('#FFFFFF', { rim: 0.4 }), [0, 0.01, 0], 1, [0, 0, 0], o); mesh(torusG(r * 0.98, 0.006, 6, 32), M('#E6DCCB'), [0, 0.02, 0], 1, [PI / 2, 0, 0], o); };
  if (it.kind === 'bread') {
    if (it.step === 'dough') { plate(); const l = loaf(it, o); l.position.y = 0.02; l.scale.setScalar(1.15); }
    else if (it.step === 'fill') {
      mesh(cylG(0.1, 0.075, 0.07, 24, true), M('#FFFFFF', { side: THREE.DoubleSide, rim: 0.4 }), [0, 0.035, 0], 1, [0, 0, 0], o);
      mesh(sphereG(1, 18, 12), M(it.color, { noise: 2, spec: 0.3 }), [0, 0.06, 0], [0.09, 0.03, 0.09], [0, 0, 0], o);
    } else if (it.step === 'top') { plate(); const base = new THREE.Group(); base.position.y = -LOAF.y + 0.005; base.scale.set(1.5, 0.4, 1.5); o.add(base); const t = topping(it, base, 3); t.scale.set(1, 2.5, 1); }
    else {
      // 마무리: 가루는 체, 바르는 건 병, 줄무늬는 짤주머니
      if (it.shape === 'powder') { mesh(cylG(0.07, 0.07, 0.05, 24, true), M('#C9CED3', { side: THREE.DoubleSide, spec: 0.6 }), [0, 0.09, 0], 1, [0, 0, 0], o); mesh(cylG(0.068, 0.068, 0.004, 24), M(it.color), [0, 0.07, 0], 1, [0, 0, 0], o); mesh(boxG(0.12, 0.01, 0.02), M('#8A5E3C'), [0.11, 0.1, 0], 1, [0, 0, 0], o); plate(0.12); for (let i = 0; i < 20; i++) mesh(sphereG(1, 5, 4), M(it.color), [(i % 5 - 2) * 0.02, 0.022, (Math.floor(i / 5) - 2) * 0.02], 0.004, [0, 0, 0], o); }
      else if (it.shape === 'glaze') { mesh(cylG(0.06, 0.065, 0.13, 20), M(it.color, { alpha: 0.85, spec: 0.8, rim: 0.6 }), [0, 0.065, 0], 1, [0, 0, 0], o); mesh(cylG(0.066, 0.066, 0.03, 20), M('#F4E6C0'), [0, 0.14, 0], 1, [0, 0, 0], o); mesh(boxG(0.08, 0.05, 0.004), M('#FFF6E0'), [0, 0.07, 0.064], 1, [0, 0, 0], o); }
      else { mesh(coneG(0.05, 0.16, 16), M(lighten(it.color, 0.2), { side: THREE.DoubleSide }), [0, 0.1, 0], 1, [PI, 0, 0.5], o); mesh(sphereG(1, 10, 8), M(it.color), [0.04, 0.03, 0], 0.012, [0, 0, 0], o); }
    }
    return o;
  }
  if (it.step === 'main' || it.step === 'side') {
    mesh(cylG(0.004, 0.005, 0.18, 6), M('#6FA35E'), [0, 0.09, 0], 1, [0, 0, 0.1], o);
    const h = flowerHead(it, it.step === 'main' ? 2.0 : 2.1); h.position.set(0.009, it.step === 'main' ? 0.16 : 0.18, 0); h.rotation.x = 0.5; o.add(h);
    mesh(sphereG(1, 8, 6), M('#7DB86A'), [0.02, 0.07, 0], [0.022, 0.006, 0.01], [0, 0, 0.5], o);
  } else if (it.step === 'leaf') { const l = leafSprig(it, 1.5); l.rotation.z = 0.15; o.add(l); }
  else if (it.step === 'wrap') { const w = wrapCone(it); w.scale.setScalar(1.1); o.add(w); }
  else { const b = bow(it); b.scale.setScalar(2.4); b.position.y = 0.09; b.rotation.x = 0.3; o.add(b); }
  return o;
}

// 조리대 위 작업 자리: 고른 재료가 하나씩 올라가요. set()은 새로 올라간 것을 돌려줘요 (떨어지는 몸짓용)
export interface CraftRig { root: THREE.Group; product: THREE.Group; kind: CraftKind; set: (p: CPicks) => THREE.Object3D | null; dispose: () => void }
export function makeCraftRig(kind: CraftKind): CraftRig {
  const root = new THREE.Group();
  const product = new THREE.Group(); root.add(product);
  const parts = new Map<string, THREE.Object3D>(); // "단계:재료" → 그림
  const mini = isMini(kind);
  if (kind === 'bread') tray(product);
  else if (mini) { mesh(cylG(0.14, 0.135, 0.012, 32), M('#E3C79A', { noise: 3 }), [0, 0.006, 0], 1, [0, 0, 0], product); mesh(torusG(0.138, 0.005, 6, 36), M('#C9A36E'), [0, 0.012, 0], 1, [PI / 2, 0, 0], product); } // 미니 가게: 둥근 나무 받침
  else { mesh(boxG(0.3, 0.002, 0.22), M('#FFFFFF', { flat: 0.3 }), [0, 0.001, 0.02], 1, [0, 0.15, 0], root); } // 꽃 손질하는 하얀 종이
  const content = new THREE.Group(); product.add(content);
  if (kind === 'bread') content.position.y = 0.015;
  else if (mini) content.position.y = 0.012;
  else content.scale.setScalar(0.82); // 꽃다발은 조금 작게 (조리대 위에서 한눈에)
  const sh = makeShadow(0.32, 0.28, 0.35); sh.position.y = 0.002; root.add(sh);
  const bouquetSpots = (n: number) => Array.from({ length: n }, (_, i) => { const a = (i / Math.max(1, n)) * PI * 2 + 0.5; return V(Math.cos(a) * 0.035, 0.235, Math.sin(a) * 0.035); });
  const build = (p: CPicks): THREE.Object3D | null => {
    const keys = new Set<string>();
    let fresh: THREE.Object3D | null = null;
    const ensure = (key: string, make: () => THREE.Object3D) => { keys.add(key); if (parts.has(key)) return parts.get(key)!; const o = make(); parts.set(key, o); fresh = o; return o; };
    if (mini) buildMini(kind, content, parts, p, ensure);
    else if (kind === 'bread') {
      const d = CITEM.get(p.dough?.[0] ?? '');
      if (d) ensure('dough:' + d.id, () => loaf(d, content));
      const f = CITEM.get(p.fill?.[0] ?? '');
      if (f) ensure('fill:' + f.id, () => fillBlob(f, content));
      (p.top ?? []).forEach((id, i) => { const t = CITEM.get(id); if (t) ensure('top:' + id, () => topping(t, content, i + 1)); });
      const z = CITEM.get(p.finish?.[0] ?? '');
      if (z) ensure('finish:' + z.id, () => finishLayer(z, content));
    } else {
      const m = CITEM.get(p.main?.[0] ?? '');
      const sides = (p.side ?? []).map((id) => CITEM.get(id)).filter((x): x is CItem => !!x);
      const spots = bouquetSpots(Math.max(1, sides.length * 3));
      // 줄기 다발 (꽃이 하나라도 있으면)
      if (m || sides.length) ensure('stems', () => { const s = new THREE.Group(); content.add(s); for (let i = 0; i < 7; i++) { const a = (i / 7) * PI * 2; mesh(cylG(0.003, 0.003, 0.24, 5), M(i % 2 ? '#6FA35E' : '#7DB86A'), [Math.cos(a) * 0.008, 0.12, Math.sin(a) * 0.008], 1, [Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12], s); } return s; });
      if (m) ensure('main:' + m.id, () => { const h = flowerHead(m, 2.0); h.position.set(0, 0.26, 0); content.add(h); return h; });
      sides.forEach((s, si) => ensure('side:' + s.id, () => {
        const g = new THREE.Group(); content.add(g);
        for (let k = 0; k < 3; k++) { const sp = spots[si * 3 + k] ?? V(); const h = flowerHead(s, 1.25); h.position.copy(sp); h.rotation.set(sp.z * 6, 0, -sp.x * 6); g.add(h); }
        return g;
      }));
      const l = CITEM.get(p.leaf?.[0] ?? '');
      if (l) ensure('leaf:' + l.id, () => { const g = new THREE.Group(); content.add(g); for (let k = 0; k < 4; k++) { const a = (k / 4) * PI * 2 + 0.2; const s = leafSprig(l, 1.25); s.position.set(Math.cos(a) * 0.012, 0.09, Math.sin(a) * 0.012); s.rotation.set(Math.sin(a) * 0.28, 0, -Math.cos(a) * 0.28); /* 포장지 안쪽으로 서서 위로만 삐죽 */ g.add(s); } return g; });
      const w = CITEM.get(p.wrap?.[0] ?? '');
      if (w) ensure('wrap:' + w.id, () => { const g = wrapCone(w); content.add(g); return g; });
      const r = CITEM.get(p.ribbon?.[0] ?? '');
      if (r) ensure('ribbon:' + r.id, () => { const g = bow(r, 0.051); g.position.y = 0.09; content.add(g); return g; }); // 포장지 겉(이 높이에서 반지름 0.05)에 묶어요
    }
    for (const [k, o] of parts) if (!keys.has(k)) { o.parent?.remove(o); disposeTree(o); parts.delete(k); }
    return fresh;
  };
  return { root, product, kind, set: build, dispose: () => disposeTree(root) };
}

// 가게 꾸밈: 선반에 놓을 빵 바구니·꽃 양동이
export function shelfDecor(kind: CraftKind): THREE.Group {
  const o = new THREE.Group();
  if (isMini(kind)) { miniShelf(kind, o); return o; }
  const rnd = mulberry32(kind === 'bread' ? 11 : 23);
  for (let i = 0; i < 3; i++) {
    const x = -0.3 + i * 0.3;
    if (kind === 'bread') {
      mesh(cylG(0.1, 0.08, 0.07, 16, true), M('#C9A36E', { side: THREE.DoubleSide, noise: 3 }), [x, 0.035, 0], 1, [0, 0, 0], o);
      const cols = ['#E3B37A', '#D9A066', '#C98A4E', '#F0C58A'];
      for (let k = 0; k < 3; k++) mesh(sphereG(1, 12, 8), M(cols[(i + k) % 4], { noise: 3 }), [x + (k - 1) * 0.045, 0.075, (rnd() - 0.5) * 0.04], [0.04, 0.025, 0.03], [0, rnd() * 3, 0.2], o);
    } else {
      mesh(cylG(0.075, 0.06, 0.12, 14), M(['#9FD8B8', '#BFE0FA', '#F7C6D2'][i]), [x, 0.06, 0], 1, [0, 0, 0], o);
      const cols = ['#F7A9C9', '#F6C431', '#FFFFFF', '#B39DE8', '#E8506A', '#F28A3C'];
      for (let k = 0; k < 5; k++) { const a = (k / 5) * PI * 2; mesh(cylG(0.003, 0.003, 0.14, 4), M('#6FA35E'), [x + Math.cos(a) * 0.03, 0.17, Math.sin(a) * 0.02], 1, [0, 0, Math.cos(a) * 0.2], o); mesh(sphereG(1, 8, 6), M(cols[(i * 2 + k) % cols.length], { noise: 2 }), [x + Math.cos(a) * 0.045, 0.245, Math.sin(a) * 0.03], 0.022, [0, 0, 0], o); }
    }
  }
  return o;
}
