import * as THREE from 'three';
import { mulberry32 } from '../core/rng';
import { GING, type GIng, type GPicks } from '../data/gimbap';
import { ctx2d, darken, lighten, makeCanvas } from '../paint/brush';
import { tex } from '../paint/textures';
import { makeShadow } from './fx';
import { boxG, cylG, disposeTree, group, M, Mu, mesh, sphereG, torusG } from './geo';

// 마음 김밥 (수업용): 김발 위에 김·밥·속재료를 차곡차곡 올리고, 돌돌 말아 썰어서 접시에 담아요
const PI = Math.PI;
export const ROLL_R = 0.03, ROLL_L = 0.24, SLICES = 8;
export const GIM_COLOR = '#22362A';
const MAT_W = 0.3, MAT_D = 0.24;
const SHEET_D = 0.2, RICE_D = 0.15;

// 속재료 한 줄 (x 방향으로 길게, 가운데가 원점)
function fillStick(g: GIng, len: number): THREE.Group {
  const o = new THREE.Group();
  const c = g.color, m = M(c, { noise: 2 });
  const rnd = mulberry32(g.id.length * 31 + 7);
  switch (g.id) {
    case 'gf_burdock':
      for (const z of [-0.006, 0.006]) mesh(cylG(0.006, 0.006, len, 8), m, [0, 0.006, z], 1, [0, 0, PI / 2], o);
      break;
    case 'gf_carrot':
      for (const z of [-0.008, 0, 0.008]) mesh(boxG(len, 0.006, 0.006), m, [0, 0.004 + Math.abs(z) * 0.3, z], 1, [0, 0, 0], o);
      break;
    case 'gf_spinach':
      mesh(cylG(0.009, 0.009, len, 8), m, [0, 0.009, 0], 1, [0, 0, PI / 2], o);
      for (let i = 0; i < 5; i++) mesh(sphereG(1, 8, 6), M(lighten(c, 0.15)), [(i / 4 - 0.5) * len * 0.85, 0.014, (rnd() - 0.5) * 0.01], [0.018, 0.004, 0.011], [0, rnd() * 3, 0], o);
      break;
    case 'gf_bulgogi':
      for (let i = 0; i < 6; i++) mesh(boxG(len / 6.2, 0.012, 0.018), M(i % 2 ? c : darken(c, 0.12), { noise: 3 }), [(i / 5 - 0.5) * len * 0.84, 0.007, (rnd() - 0.5) * 0.006], 1, [rnd() * 0.3, rnd() * 0.4, 0], o);
      break;
    case 'gf_crab':
      mesh(cylG(0.011, 0.011, len, 12), M('#FFF6EE'), [0, 0.011, 0], 1, [0, 0, PI / 2], o);
      mesh(boxG(len, 0.004, 0.016), M(c), [0, 0.021, 0], 1, [0, 0, 0], o);
      break;
    case 'gf_fishcake':
      for (const z of [-0.007, 0.007]) mesh(boxG(len, 0.008, 0.01), m, [0, 0.004, z], 1, [0, 0, 0], o);
      break;
    case 'gf_cheese':
      mesh(boxG(len, 0.006, 0.032), m, [0, 0.003, 0], 1, [0, 0, 0], o);
      break;
    case 'gf_tuna':
      for (let i = 0; i < 12; i++) mesh(sphereG(0.009 + rnd() * 0.004, 8, 6), M(i % 3 ? c : lighten(c, 0.2)), [(i / 11 - 0.5) * len * 0.92, 0.009, (rnd() - 0.5) * 0.012], 1, [0, 0, 0], o);
      break;
    case 'gf_egg':
      mesh(boxG(len, 0.016, 0.026), m, [0, 0.008, 0], 1, [0, 0, 0], o);
      break;
    case 'gf_kimchi':
      for (let i = 0; i < 4; i++) mesh(boxG(len / 4.1, 0.012, 0.016), M(i % 2 ? c : lighten(c, 0.12), { noise: 3 }), [(i / 3 - 0.5) * len * 0.75, 0.006, (rnd() - 0.5) * 0.006], 1, [0, rnd() * 0.3, rnd() * 0.2], o);
      break;
    default: // 단무지·오이·햄: 네모난 막대
      mesh(boxG(len, 0.018, 0.018), m, [0, 0.009, 0], 1, [0, 0, 0], o);
  }
  return o;
}

// 재료 카드에 쓸 작은 그림
export function gimItemModel(g: GIng): THREE.Group {
  const o = new THREE.Group();
  const plate = (r = 0.16) => { mesh(cylG(r, r * 0.86, 0.022, 28), M('#FFFFFF', { rim: 0.4 }), [0, 0.011, 0], 1, [0, 0, 0], o); mesh(torusG(r * 0.98, 0.006, 6, 32), M('#E6DCCB'), [0, 0.022, 0], 1, [PI / 2, 0, 0], o); };
  if (g.step === 'rice') {
    plate();
    mesh(sphereG(1, 20, 12), M(g.color, { noise: 3 }), [0, 0.03, 0], [0.12, 0.07, 0.11], [0, 0, 0], o);
    const rnd = mulberry32(g.id.length * 13);
    const dot = g.id === 'gr_grain' ? '#7A4E33' : g.id === 'gr_sesame' ? '#3A2A20' : '#FFFFFF';
    for (let i = 0; i < 26; i++) {
      const a = rnd() * PI * 2, r = Math.sqrt(rnd()) * 0.9, x = Math.cos(a) * r * 0.11, z = Math.sin(a) * r * 0.1;
      const y = 0.03 + 0.07 * Math.sqrt(Math.max(0, 1 - r * r)) - 0.002;
      mesh(sphereG(1, 6, 4), M(dot), [x, y, z], [0.007, 0.004, 0.005], [0, a, 0], o);
    }
  } else if (g.step === 'gim') {
    for (let i = 0; i < 3; i++) mesh(boxG(0.24, 0.004, 0.22), M(i % 2 ? g.color : lighten(g.color, 0.06), { spec: 0.35 }), [i * 0.012 - 0.012, 0.01 + i * 0.006, i * -0.01], 1, [0, i * 0.18 - 0.2, g.id === 'gg_crisp' ? i * 0.05 : 0], o);
  } else if (g.step === 'fill') {
    plate(0.17);
    for (const [z, ry] of [[-0.045, 0.06], [0.0, -0.04], [0.045, 0.03]] as const) {
      const s = fillStick(g, 0.22);
      s.position.set(0, 0.022, z); s.rotation.y = ry;
      o.add(s);
    }
  } else if (g.id === 'gt_oil') {
    mesh(cylG(0.055, 0.06, 0.16, 20), M(g.color, { alpha: 0.85, spec: 0.8, rim: 0.6 }), [0, 0.08, 0], 1, [0, 0, 0], o);
    mesh(cylG(0.02, 0.05, 0.05, 16), M(g.color, { alpha: 0.85, spec: 0.8 }), [0, 0.185, 0], 1, [0, 0, 0], o);
    mesh(cylG(0.022, 0.022, 0.03, 12), M('#C2560E'), [0, 0.22, 0], 1, [0, 0, 0], o);
    mesh(boxG(0.09, 0.06, 0.004), M('#FFF6E0'), [0, 0.08, 0.06], 1, [0, 0, 0], o);
  } else {
    mesh(cylG(0.11, 0.075, 0.07, 24, true), M('#FFFFFF', { side: THREE.DoubleSide, rim: 0.4 }), [0, 0.035, 0], 1, [0, 0, 0], o);
    mesh(cylG(0.1, 0.1, 0.01, 24), M(g.color, { noise: 4 }), [0, 0.06, 0], 1, [0, 0, 0], o);
    const rnd = mulberry32(5);
    for (let i = 0; i < 30; i++) { const a = rnd() * PI * 2, r = Math.sqrt(rnd()) * 0.09; mesh(sphereG(1, 6, 4), M(i % 4 ? '#F7EBCB' : '#3A2A20'), [Math.cos(a) * r, 0.067, Math.sin(a) * r], [0.008, 0.004, 0.005], [0, a, 0], o); }
  }
  return o;
}

// 썬 김밥 단면 그림 (도감·쪽지에서도 써요)
export function gimFaceCanvas(p: GPicks, size = 256): HTMLCanvasElement {
  const cv = makeCanvas(size, size), g = ctx2d(cv), s = size / 256, c = size / 2;
  const rnd = mulberry32(7);
  const rice = p.rice ? GING.get(p.rice)! : null;
  g.fillStyle = p.gim ? GIM_COLOR : '#3A5A3E';
  g.beginPath(); g.arc(c, c, 126 * s, 0, PI * 2); g.fill();
  g.fillStyle = rice?.color ?? '#FBF6EC';
  g.beginPath(); g.arc(c, c, 114 * s, 0, PI * 2); g.fill();
  // 밥알
  const grain = rice?.id === 'gr_grain' ? '#8A5A3B' : rice?.id === 'gr_sesame' ? '#4A382A' : '#FFFFFF';
  for (let i = 0; i < 160; i++) {
    const a = rnd() * PI * 2, r = (40 + rnd() * 72) * s;
    g.fillStyle = i % 3 === 0 ? grain : 'rgba(255,255,255,.75)';
    g.beginPath(); g.ellipse(c + Math.cos(a) * r, c + Math.sin(a) * r, 5 * s, 3 * s, a, 0, PI * 2); g.fill();
  }
  const fills = p.fills.map((id) => GING.get(id)!).filter(Boolean);
  const spots = fills.length === 1 ? [[0, 0]] : fills.length === 2 ? [[-24, 0], [24, 0]] : [[0, -26], [-26, 18], [26, 18]];
  fills.forEach((f, i) => {
    const [dx, dy] = spots[i];
    const x = c + dx * s, y = c + dy * s, r = 22 * s;
    g.fillStyle = f.color;
    if (['gf_crab', 'gf_spinach', 'gf_burdock'].includes(f.id)) {
      g.beginPath(); g.arc(x, y, r, 0, PI * 2); g.fill();
      if (f.id === 'gf_crab') { g.fillStyle = '#FFF6EE'; g.beginPath(); g.arc(x, y + r * 0.25, r * 0.8, 0, PI * 2); g.fill(); }
    } else if (f.id === 'gf_tuna' || f.id === 'gf_bulgogi' || f.id === 'gf_kimchi') {
      for (let k = 0; k < 7; k++) { g.fillStyle = k % 2 ? f.color : lighten(f.color, 0.15); g.beginPath(); g.arc(x + (rnd() - 0.5) * r * 1.3, y + (rnd() - 0.5) * r * 1.3, r * 0.45, 0, PI * 2); g.fill(); }
    } else if (f.id === 'gf_carrot') {
      for (let k = -1; k <= 1; k++) g.fillRect(x + k * r * 0.7 - r * 0.25, y - r * 0.5, r * 0.5, r);
    } else if (f.id === 'gf_cheese' || f.id === 'gf_egg') {
      g.fillRect(x - r * 1.1, y - r * 0.55, r * 2.2, r * 1.1);
    } else {
      g.fillRect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7);
      if (f.id === 'gf_cucumber') { g.fillStyle = '#DDF0C8'; g.fillRect(x - r * 0.5, y - r * 0.5, r, r); }
    }
  });
  // 참기름은 반들반들, 깨는 김 위에 콕콕
  if (p.top === 'gt_seed') for (let i = 0; i < 18; i++) { const a = rnd() * PI * 2; g.fillStyle = '#F7EBCB'; g.beginPath(); g.ellipse(c + Math.cos(a) * 120 * s, c + Math.sin(a) * 120 * s, 4 * s, 2.5 * s, a, 0, PI * 2); g.fill(); }
  return cv;
}

// 김발과 그 위에 올라가는 재료 (조리대에 놓아요)
export interface GimRig { root: THREE.Group; mat: THREE.Group; layers: THREE.Group; set: (p: GPicks) => THREE.Object3D | null; dispose: () => void }
export function makeGimRig(): GimRig {
  const root = new THREE.Group();
  // 김발: 대나무 살을 나란히
  const mat = group(root);
  for (let i = 0; i < 22; i++) mesh(cylG(0.0055, 0.0055, MAT_W, 6), M(i % 2 ? '#D9C08A' : '#CDB27A'), [0, 0.0055, (i / 21 - 0.5) * MAT_D], 1, [0, 0, PI / 2], mat);
  for (const x of [-0.1, 0.1]) mesh(boxG(0.004, 0.012, MAT_D), M('#9A7A4E'), [x, 0.006, 0], 1, [0, 0, 0], mat);
  mat.add(makeShadow(MAT_W * 1.3, MAT_D * 1.3, 0.35));
  const layers = group(root, [0, 0.011, 0]);
  let shown = new Map<string, THREE.Object3D>();
  const set = (p: GPicks) => {
    // 바뀐 재료만 새로 만들어요. 새로 놓인 재료를 돌려줘요 (떨어지는 움직임용)
    const want = new Map<string, () => THREE.Object3D>();
    if (p.gim) want.set(`gim:${p.gim}`, () => { const g = GING.get(p.gim!)!; return mesh(boxG(ROLL_L + 0.02, 0.003, SHEET_D), M(GIM_COLOR, { spec: 0.35, noise: 2 }), [0, 0.0015, 0], 1, [0, 0, 0]).add(mesh(boxG(ROLL_L, 0.0005, SHEET_D * 0.9), M(lighten(g.color, 0.08)), [0, 0.002, 0])); });
    if (p.rice) want.set(`rice:${p.rice}`, () => { const g = GING.get(p.rice!)!; const o = mesh(boxG(ROLL_L, 0.008, RICE_D), M(g.color, { noise: 4 }), [0, 0.007, (SHEET_D - RICE_D) / 2 - 0.005]); return o; });
    p.fills.forEach((id, i) => want.set(`fill:${id}`, () => { const s = fillStick(GING.get(id)!, ROLL_L * 0.97); s.position.set(0, 0.011, 0.035 - i * 0.026); return s; }));
    let fresh: THREE.Object3D | null = null;
    for (const [k, o] of shown) if (!want.has(k)) { layers.remove(o); disposeTree(o); shown.delete(k); }
    for (const [k, make] of want) if (!shown.has(k)) { const o = make(); o.name = k; layers.add(o); shown.set(k, o); fresh = o; }
    // 줄 자리는 고른 차례대로 다시 맞춰요 (빼고 넣으면 빈자리가 생기지 않게)
    p.fills.forEach((id, i) => { const o = shown.get(`fill:${id}`); if (o && o !== fresh) o.position.z = 0.035 - i * 0.026; });
    return fresh;
  };
  const dispose = () => { disposeTree(root); shown = new Map(); };
  return { root, mat, layers, set, dispose };
}

// 다 만 김밥 한 줄 (x 방향)
export function makeRoll(p: GPicks): { roll: THREE.Group; seeds: THREE.Group } {
  const roll = new THREE.Group();
  const shine = p.top === 'gt_oil';
  mesh(cylG(ROLL_R, ROLL_R, ROLL_L, 28), M(shine ? '#2C4434' : GIM_COLOR, { spec: shine ? 0.9 : 0.3, rim: shine ? 0.7 : 0.3, noise: 2 }), [0, 0, 0], 1, [0, 0, PI / 2], roll);
  const seeds = group(roll);
  if (p.top === 'gt_seed') {
    const rnd = mulberry32(11);
    for (let i = 0; i < 40; i++) { const a = PI / 2 + (rnd() - 0.5) * 2.2; mesh(sphereG(1, 6, 4), M('#F7EBCB'), [(rnd() - 0.5) * ROLL_L * 0.95, Math.sin(a) * ROLL_R, Math.cos(a) * ROLL_R], [0.003, 0.0018, 0.0022], [rnd() * 3, rnd() * 3, 0], seeds); }
    seeds.visible = false;
  }
  return { roll, seeds };
}

// 김밥 한 조각: 둥근 옆면은 김, 위아래는 단면 그림 (세워 두면 단면이 위로 보여요)
export function makeSlices(p: GPicks): { slices: THREE.Mesh[]; faceTex: THREE.Texture } {
  const faceTex = tex(gimFaceCanvas(p));
  const face = Mu('#FFFFFF', { map: faceTex, rim: 0.15, flat: 0.25 });
  const side = M(p.top === 'gt_oil' ? '#2C4434' : GIM_COLOR, { spec: p.top === 'gt_oil' ? 0.9 : 0.3, rim: 0.4 });
  const th = ROLL_L / SLICES;
  const geo = cylG(ROLL_R, ROLL_R, th * 0.96, 28);
  const slices: THREE.Mesh[] = [];
  for (let i = 0; i < SLICES; i++) slices.push(new THREE.Mesh(geo, [side, face, face]));
  return { slices, faceTex };
}

// 김밥 접시 (조각을 두 줄로 놓을 자리를 알려 줘요). 손님이 둘이라 접시를 둘로 나누면 작은 접시에 네 조각씩
export function makeGimPlate(k = 1, n = k < 1 ? SLICES / 2 : SLICES): { plate: THREE.Group; spots: THREE.Vector3[] } {
  const plate = new THREE.Group();
  const r = 0.15 * k;
  mesh(cylG(r, r * 0.87, 0.014, 36), M('#FFFFFF', { rim: 0.5, spec: 0.3 }), [0, 0.007, 0], [1, 1, 0.62 / k * (k < 1 ? 0.9 : 1)], [0, 0, 0], plate);
  mesh(torusG(r * 0.975, 0.006, 6, 40), M('#9FC6E0'), [0, 0.014, 0], [1, 0.62 / k * (k < 1 ? 0.9 : 1), 1], [PI / 2, 0, 0], plate);
  plate.add(makeShadow(r * 2.5, r * 1.75, 0.4));
  const th = ROLL_L / SLICES, per = n / 2;
  const spots: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const row = i < per ? 0 : 1, j = i % per;
    spots.push(new THREE.Vector3((j - (per - 1) / 2) * 0.062 + row * 0.012, 0.014 + th * 0.48, row ? 0.034 : -0.03));
  }
  return { plate, spots };
}
