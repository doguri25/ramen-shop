import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FAMILY } from '../data/effects';
import { VARIANTS, VEGS, variantName, type VegKind, type VegVariant } from '../data/garden';
import { ctx2d, darken, makeCanvas } from '../paint/brush';
import { tex } from '../paint/textures';
import { boxG, coneG, cylG, M, Mu, mesh, sphereG } from './geo';

// 마음 텃밭: 라면 가게 가까이 큰길 가. 이랑마다 채소 한 가지, 채소마다 담긴 마음이 다른 넷.
// 채소 앞 팻말에 이름과 마음 묶음 색이 있어요. 텃밭 심부름 중에 누르면 쑥 뽑혀요 (뽑은 자리는 금세 다시 자라요)
const PI = Math.PI;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const GARDEN_W = 8.8, GARDEN_D = 11.2; // 울타리 바깥 크기 (좌우, 앞뒤)
const ROWS = [-3.45, -1.15, 1.15, 3.45];       // 이랑 자리 (앞이 +)
const COLS = [-2.25, -0.75, 0.75, 2.25];
const ROW_VEG: VegKind[] = ['carrot', 'sweetpotato', 'potato', 'radish']; // 뒤에서 앞으로

export interface GardenPlant { v: VegVariant; name: string; root: THREE.Group; hit: THREE.Mesh; pos: THREE.Vector3; stand: THREE.Vector3; t: number }
export interface Garden {
  group: THREE.Group;   // 채소처럼 움직이는 것 (따로 그려요)
  stat: THREE.Group;    // 울타리·이랑·팻말 (마을이 한 덩어리로 합쳐 그려요)
  plants: GardenPlant[]; hits: THREE.Mesh[];
  center: THREE.Vector3; entrance: THREE.Vector3; yaw: number;
  corners: THREE.Vector3[];
  solids: [number, number, number][];
  inside: (x: number, z: number, pad?: number) => boolean;
  pull: (k: number) => void;
  update: (dt: number, eye?: THREE.Vector3) => void;
  dispose: () => void;
}

// 한 그루를 재질별로 합쳐요 (태블릿이 버벅이지 않게)
function merged(src: THREE.Group): THREE.Group {
  src.updateMatrixWorld(true);
  const inv = src.matrixWorld.clone().invert();
  const by = new Map<THREE.Material, THREE.BufferGeometry[]>();
  src.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material)) return;
    let g = m.geometry.clone();
    if (g.index) g = g.toNonIndexed();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    const list = by.get(m.material) ?? []; list.push(g); by.set(m.material, list);
  });
  const out = new THREE.Group();
  for (const [mat, list] of by) {
    const geo = mergeGeometries(list, false);
    list.forEach((g) => g.dispose());
    if (!geo) continue;
    const mm = new THREE.Mesh(geo, mat); mm.userData.ownGeo = true; out.add(mm);
  }
  return out;
}

// 채소 한 그루 (땅 = y 0). 땅속 부분은 이랑 흙에 가려 있다가 뽑으면 보여요
function plant(veg: VegKind, seed: number): THREE.Group {
  const o = new THREE.Group();
  const leafA = M('#4F9A44', { noise: 2 }), leafB = M('#6DBE5A', { noise: 2 });
  const leaf = (a: number, tilt: number, len: number, wide: number, y0: number, mat: THREE.Material) => {
    const p = new THREE.Group(); p.position.set(0, y0, 0); p.rotation.y = a; o.add(p);
    mesh(sphereG(1, 8, 6), mat, [0, len * 0.9, len * 0.35], [wide * 0.45, len, wide], [tilt, 0, 0], p);
  };
  const r = (k: number) => Math.sin(seed * 12.9898 + k * 78.233) * 0.5 + 0.5;
  if (veg === 'radish') {
    mesh(sphereG(0.13, 14, 10), M('#FBF7EE', { noise: 1 }), [0, -0.14, 0], [1, 2.0, 1], [0, 0, 0], o);
    mesh(sphereG(0.135, 14, 10), M('#D8EDB0', { noise: 1 }), [0, 0.07, 0], [1, 0.5, 1], [0, 0, 0], o);
    mesh(coneG(0.045, 0.26, 6), M('#F3EEE2'), [0, -0.5, 0], 1, [PI, 0, 0], o);
    for (let i = 0; i < 6; i++) leaf((i / 6) * PI * 2 + r(i), 0.42 + r(i + 9) * 0.2, 0.3, 0.13, 0.1, i % 2 ? leafA : leafB);
  } else if (veg === 'carrot') {
    mesh(coneG(0.075, 0.42, 10), M('#F08A2E', { noise: 2 }), [0, -0.17, 0], 1, [PI, 0, 0], o);
    mesh(cylG(0.073, 0.073, 0.02, 10), M('#E57A22'), [0, 0.045, 0], 1, [0, 0, 0], o);
    for (let i = 0; i < 7; i++) {
      const p = new THREE.Group(); p.position.y = 0.05; p.rotation.set(0, (i / 7) * PI * 2 + r(i), 0); o.add(p);
      const lean = 0.25 + r(i + 3) * 0.25;
      mesh(cylG(0.01, 0.012, 0.36, 5), M('#5E8A3E'), [0, 0.17, Math.sin(lean) * 0.18], 1, [lean, 0, 0], p);
      for (let k = 0; k < 3; k++) mesh(sphereG(0.05, 6, 4), i % 2 ? leafA : leafB, [0, 0.22 + k * 0.07, Math.sin(lean) * (0.12 + k * 0.07)], [1, 0.45, 1.3], [lean, 0, 0], p);
    }
  } else if (veg === 'potato') {
    for (let i = 0; i < 3; i++) { const a = (i / 3) * PI * 2 + r(i); mesh(sphereG(0.085, 10, 8), M('#C99A62', { noise: 3 }), [Math.cos(a) * 0.11, -0.13 - r(i + 2) * 0.05, Math.sin(a) * 0.11], [1.2, 0.9, 1], [0, a, 0], o); }
    for (let i = 0; i < 3; i++) { const a = (i / 3) * PI * 2 + 0.5; mesh(cylG(0.014, 0.018, 0.3, 5), M('#5E8A3E'), [Math.cos(a) * 0.04, 0.14, Math.sin(a) * 0.04], 1, [Math.sin(a) * 0.3, 0, Math.cos(a) * 0.3], o); }
    for (let i = 0; i < 6; i++) { const a = (i / 6) * PI * 2 + r(i + 5); const rr = 0.1 + r(i + 7) * 0.08; mesh(sphereG(0.15 + r(i) * 0.04, 10, 8), i % 2 ? leafA : leafB, [Math.cos(a) * rr, 0.2 + r(i + 1) * 0.14, Math.sin(a) * rr], [1, 0.72, 1], [0, 0, 0], o); }
    for (let i = 0; i < 3; i++) { const a = (i / 3) * PI * 2 + 1.1; const x = Math.cos(a) * 0.1, z = Math.sin(a) * 0.1; mesh(sphereG(0.04, 6, 4), M('#FFFFFF', { flat: 0.4 }), [x, 0.44, z], 1, [0, 0, 0], o); mesh(sphereG(0.018, 5, 4), M('#F6CF3E'), [x, 0.47, z], 1, [0, 0, 0], o); }
  } else {
    for (let i = 0; i < 2; i++) mesh(sphereG(0.07, 10, 8), M('#B5507A', { noise: 3 }), [i ? 0.08 : -0.08, -0.11, i ? 0.03 : -0.03], [1, 1, 2.5], [0.25, i ? 0.9 : -0.6, 0], o);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2 + r(i), d = 0.17 + r(i + 4) * 0.13;
      const p = new THREE.Group(); p.rotation.y = a; o.add(p);
      mesh(cylG(0.012, 0.012, d, 5), M('#8E5A7A'), [0, 0.06, d / 2], 1, [PI / 2 - 0.15, 0, 0], p);
      mesh(sphereG(1, 8, 6), i % 2 ? leafA : leafB, [0, 0.1, d + 0.05], [0.12, 0.03, 0.11], [0.2, 0, 0], p);
    }
    for (let i = 0; i < 3; i++) leaf((i / 3) * PI * 2 + 0.4, 0.3, 0.14, 0.12, 0.05, leafB);
  }
  return merged(o);
}

// 팻말 그림 한 장에 다 모아 그려요 (한 번에 그리게)
const CW = 256, CH = 128, AC = 4, AR = 8;
function signAtlas(): { tex: THREE.CanvasTexture; cell: (i: number) => [number, number, number, number] } {
  const cv = makeCanvas(CW * AC, CH * AR), g = ctx2d(cv);
  const box = (i: number) => [(i % AC) * CW, Math.floor(i / AC) * CH] as const;
  const card = (x: number, y: number, bg: string) => {
    g.fillStyle = bg; g.beginPath(); g.roundRect(x + 6, y + 6, CW - 12, CH - 12, 18); g.fill();
    g.strokeStyle = darken(bg, 0.32); g.lineWidth = 5; g.stroke();
  };
  const fit = (text: string, max: number, fs0: number) => { let fs = fs0; g.font = `${fs}px Jua, sans-serif`; while (g.measureText(text).width > max && fs > 16) { fs -= 2; g.font = `${fs}px Jua, sans-serif`; } };
  g.textAlign = 'center'; g.textBaseline = 'middle';
  // 0..15: 채소마다 마음 이름과 묶음 색
  VARIANTS.forEach((v, i) => {
    const [x, y] = box(i), f = FAMILY.get(v.fam)!;
    card(x, y, '#FFF8EC');
    g.fillStyle = '#5B3A29'; fit(variantName(v), CW - 36, 40); g.fillText(variantName(v), x + CW / 2, y + 44);
    const pw = 150, ph = 38, px = x + (CW - pw) / 2, py = y + 72;
    g.fillStyle = f.soft; g.beginPath(); g.roundRect(px, py, pw, ph, 19); g.fill();
    g.strokeStyle = f.color; g.lineWidth = 4; g.stroke();
    g.fillStyle = f.color; g.beginPath(); g.arc(px + 24, py + ph / 2, 9, 0, PI * 2); g.fill();
    g.fillStyle = darken(f.color, 0.45); g.font = '28px Jua, sans-serif'; g.fillText(`${f.name} 마음`, px + pw / 2 + 12, py + ph / 2 + 2);
  });
  // 16..19: 밭 이름
  VEGS.forEach((vg, k) => {
    const [x, y] = box(16 + k);
    card(x, y, '#F6E3C2');
    g.fillStyle = '#6B4226'; fit(`${vg.name} 밭`, CW - 40, 54); g.fillText(`${vg.name} 밭`, x + CW / 2, y + CH / 2 + 3);
  });
  // 20: 텃밭 이름
  {
    const [x, y] = box(20);
    card(x, y, '#E7F3DD');
    g.fillStyle = '#2F6B3A'; fit('마음 텃밭', CW - 40, 50); g.fillText('마음 텃밭', x + CW / 2, y + 48);
    g.fillStyle = '#5B7A4E'; fit('팻말을 보고 골라 뽑아요', CW - 40, 22); g.fillText('팻말을 보고 골라 뽑아요', x + CW / 2, y + 92);
  }
  const t = tex(cv);
  return { tex: t, cell: (i) => { const [x, y] = box(i); return [x / cv.width, 1 - (y + CH) / cv.height, CW / cv.width, CH / cv.height]; } };
}
function board(w: number, h: number, uv: [number, number, number, number]) {
  const g = new THREE.PlaneGeometry(w, h);
  const a = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < a.count; i++) a.setXY(i, uv[0] + a.getX(i) * uv[2], uv[1] + a.getY(i) * uv[3]);
  return g;
}

export function buildGarden(cx: number, cz: number, yaw: number, heightAt: (x: number, z: number) => number): Garden {
  const group = new THREE.Group(), stat = new THREE.Group();
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  const W = (lx: number, lz: number) => V(cx + lx * cs + lz * sn, 0, cz - lx * sn + lz * cs);
  const at = (lx: number, lz: number, dy = 0) => { const p = W(lx, lz); p.y = heightAt(p.x, p.z) + dy; return p; };
  const fwd = V(sn, 0, cs);
  const solids: [number, number, number][] = [];
  const atlas = signAtlas();
  const signMat = Mu('#FFFFFF', { map: atlas.tex, flat: 0.9, rim: 0 });
  const wood = M('#9A6B45', { noise: 2 }), woodD = M('#7E5434', { noise: 2 });
  const hx = GARDEN_W / 2, hz = GARDEN_D / 2;
  // 울타리: 뒤와 양옆은 막고, 앞(큰길 쪽)은 모서리만 두고 넓게 열어 둬요
  const fence = (ax: number, az: number, bx: number, bz: number) => {
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / 1.35));
    for (let i = 0; i <= n; i++) {
      const lx = ax + ((bx - ax) * i) / n, lz = az + ((bz - az) * i) / n, p = at(lx, lz);
      mesh(boxG(0.12, 0.85, 0.12), woodD, [p.x, p.y + 0.42, p.z], 1, [0, yaw, 0], stat);
      mesh(sphereG(0.08, 6, 4), woodD, [p.x, p.y + 0.88, p.z], 1, [0, 0, 0], stat);
    }
    for (let i = 0; i < n; i++) {
      const la = [ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n], lb = [ax + ((bx - ax) * (i + 1)) / n, az + ((bz - az) * (i + 1)) / n];
      const pa = at(la[0], la[1]), pb = at(lb[0], lb[1]);
      for (const hy of [0.32, 0.62]) {
        const a = pa.clone().setY(pa.y + hy), b = pb.clone().setY(pb.y + hy), m = a.clone().add(b).multiplyScalar(0.5);
        const r = mesh(boxG(0.06, 0.09, a.distanceTo(b) + 0.06), wood, [m.x, m.y, m.z], 1, [0, 0, 0], stat);
        r.lookAt(b);
      }
    }
    const steps = Math.ceil(L / 0.45);
    for (let i = 0; i <= steps; i++) { const p = W(ax + ((bx - ax) * i) / steps, az + ((bz - az) * i) / steps); solids.push([p.x, p.z, 0.3]); }
  };
  fence(-hx, -hz, hx, -hz);
  fence(-hx, -hz, -hx, hz);
  fence(hx, -hz, hx, hz);
  fence(-hx, hz, -hx + 1.0, hz);
  fence(hx - 1.0, hz, hx, hz);
  // 이랑과 채소
  const plants: GardenPlant[] = [], hits: THREE.Mesh[] = [];
  const hitGeo = new THREE.CylinderGeometry(0.55, 0.55, 1.2, 8), hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const soil = M('#8B5E3C', { noise: 4 }), soilTop = M('#9C6B45', { noise: 4 });
  ROWS.forEach((lz, ri) => {
    const veg = ROW_VEG[ri], list = VARIANTS.filter((v) => v.veg === veg);
    const c = at(0, lz), y0 = Math.min(at(-3.2, lz).y, at(3.2, lz).y, c.y);
    const top = Math.max(at(-3.2, lz).y, at(3.2, lz).y, c.y) + 0.12;
    const bh = top - y0 + 0.3;
    mesh(boxG(6.4, bh, 0.95), soil, [c.x, top - bh / 2, c.z], 1, [0, yaw, 0], stat);
    for (let k = 0; k < 9; k++) { const p = W(-3.0 + k * 0.75, lz); mesh(sphereG(0.32, 8, 5), soilTop, [p.x, top - 0.02, p.z], [1.2, 0.28, 1.35], [0, yaw, 0], stat); }
    // 밭 이름 팻말 (이랑 왼쪽 끝)
    const lp = W(-3.05, lz + 0.05);
    mesh(boxG(0.07, 0.95, 0.07), woodD, [lp.x, top + 0.3, lp.z], 1, [0, yaw, 0], stat);
    const lbb = mesh(boxG(0.84, 0.44, 0.035), wood, [lp.x, top + 0.86, lp.z], 1, [0, 0, 0], stat);
    lbb.rotation.set(-0.25, yaw, 0, 'YXZ'); lbb.position.addScaledVector(fwd, 0.03);
    const lb = mesh(board(0.8, 0.4, atlas.cell(16 + VEGS.findIndex((x) => x.id === veg))), signMat, [lp.x, top + 0.86, lp.z], 1, [0, 0, 0], stat);
    lb.rotation.set(-0.25, yaw, 0, 'YXZ'); lb.position.addScaledVector(fwd, 0.055);
    solids.push([lp.x, lp.z, 0.2]);
    COLS.forEach((lx, ci) => {
      const v = list[ci], p = W(lx, lz); p.y = top;
      const root = new THREE.Group(); root.position.copy(p); root.rotation.y = yaw + (ci - 1.5) * 0.4;
      root.add(plant(veg, ri * 4 + ci + 1)); group.add(root);
      const hit = new THREE.Mesh(hitGeo, hitMat); hit.position.set(p.x, p.y + 0.4, p.z); hit.userData.plant = plants.length; group.add(hit); hits.push(hit);
      // 채소 바로 뒤 팻말: 채소 앞 고랑에 서면 채소와 팻말이 함께 보여요 (뒤에서 보면 나무판)
      const sp = W(lx, lz - 0.5); sp.y = top;
      mesh(boxG(0.05, 0.85, 0.05), woodD, [sp.x, sp.y + 0.36, sp.z], 1, [0, yaw, 0], stat);
      const back = mesh(boxG(0.86, 0.45, 0.035), wood, [sp.x, sp.y + 0.82, sp.z], 1, [0, 0, 0], stat);
      back.rotation.set(-0.38, yaw, 0, 'YXZ');
      const sb = mesh(board(0.82, 0.41, atlas.cell(VARIANTS.indexOf(v))), signMat, [sp.x, sp.y + 0.82, sp.z], 1, [0, 0, 0], stat);
      sb.rotation.set(-0.38, yaw, 0, 'YXZ');
      sb.position.add(new THREE.Vector3(0, Math.sin(0.38) * 0.02, Math.cos(0.38) * 0.02).applyAxisAngle(V(0, 1, 0), yaw));
      solids.push([p.x, p.z, 0.42]);
      const stand = W(lx, lz + 1.15); stand.y = heightAt(stand.x, stand.z);
      plants.push({ v, name: variantName(v), root, hit, pos: p.clone(), stand, t: -1 });
    });
  });
  // 입구 팻말과 허수아비, 물뿌리개
  const ep = at(-hx + 0.6, hz + 0.45);
  for (const s of [-0.62, 0.62]) { const q = ep.clone().addScaledVector(V(cs, 0, -sn), s); mesh(boxG(0.1, 1.5, 0.1), woodD, [q.x, ep.y + 0.75, q.z], 1, [0, yaw, 0], stat); }
  const ebb = mesh(boxG(1.56, 0.8, 0.05), wood, [ep.x, ep.y + 1.35, ep.z], 1, [0, 0, 0], stat);
  ebb.rotation.set(-0.2, yaw, 0, 'YXZ'); ebb.position.addScaledVector(fwd, 0.04);
  const eb = mesh(board(1.5, 0.75, atlas.cell(20)), signMat, [ep.x, ep.y + 1.35, ep.z], 1, [0, 0, 0], stat);
  eb.rotation.set(-0.2, yaw, 0, 'YXZ'); eb.position.addScaledVector(fwd, 0.075);
  solids.push([ep.x, ep.z, 0.7]);
  {
    const sc = at(hx - 0.9, -hz + 0.9), o = new THREE.Group(); o.position.copy(sc); o.rotation.y = yaw;
    mesh(cylG(0.05, 0.06, 1.7, 6), woodD, [0, 0.85, 0], 1, [0, 0, 0], o);
    mesh(cylG(0.04, 0.04, 1.1, 6), woodD, [0, 1.25, 0], 1, [0, 0, PI / 2], o);
    mesh(boxG(0.5, 0.55, 0.25), M('#6FB3E0', { noise: 2 }), [0, 1.15, 0], 1, [0, 0, 0], o);
    mesh(sphereG(0.22, 10, 8), M('#F2D39A', { noise: 3 }), [0, 1.62, 0], 1, [0, 0, 0], o);
    mesh(cylG(0.34, 0.34, 0.04, 14), M('#E3B04B', { noise: 2 }), [0, 1.78, 0], 1, [0, 0, 0], o);
    mesh(coneG(0.2, 0.26, 12), M('#E3B04B', { noise: 2 }), [0, 1.92, 0], 1, [0, 0, 0], o);
    for (const s of [-1, 1]) mesh(sphereG(0.03, 6, 4), M('#3B2A20'), [s * 0.07, 1.65, 0.2], 1, [0, 0, 0], o);
    mesh(boxG(0.1, 0.02, 0.02), M('#C2563A'), [0, 1.56, 0.21], 1, [0, 0, 0], o);
    stat.add(o); solids.push([sc.x, sc.z, 0.45]);
    const wc = at(hx - 0.9, hz - 0.8), w = new THREE.Group(); w.position.copy(wc); w.rotation.y = yaw + 0.6;
    mesh(cylG(0.16, 0.18, 0.3, 12), M('#6FA8D8', { spec: 0.4 }), [0, 0.15, 0], 1, [0, 0, 0], w);
    mesh(cylG(0.025, 0.035, 0.36, 6), M('#6FA8D8', { spec: 0.4 }), [0.2, 0.25, 0], 1, [0, 0, -0.9], w);
    mesh(cylG(0.012, 0.012, 0.28, 5), M('#5A8FC0'), [0, 0.38, 0], 1, [0, 0, PI / 2], w);
    stat.add(w); solids.push([wc.x, wc.z, 0.3]);
  }
  // 흙먼지: 뽑을 때 퐁퐁 튀어요 (몇 개만 돌려 써요)
  const dirt = Array.from({ length: 10 }, () => { const m = mesh(sphereG(0.05, 6, 4), M('#8B5E3C', { noise: 2 }), [0, 0, 0], 1, [0, 0, 0], group); m.visible = false; return { m, v: V(), life: 0 }; });
  let di = 0;
  const pull = (k: number) => {
    const p = plants[k];
    if (!p || p.t >= 0) return;
    p.t = 0;
    for (let i = 0; i < 6; i++) {
      const d = dirt[di++ % dirt.length], a = Math.random() * PI * 2;
      d.m.position.copy(p.pos).add(V(Math.cos(a) * 0.12, 0.05, Math.sin(a) * 0.12));
      d.v.set(Math.cos(a) * (0.8 + Math.random()), 1.6 + Math.random() * 1.2, Math.sin(a) * (0.8 + Math.random()));
      d.life = 0.7; d.m.visible = true; d.m.scale.setScalar(1);
    }
  };
  const ease = (x: number) => 1 - (1 - x) * (1 - x);
  const update = (dt: number, eye?: THREE.Vector3) => {
    const far = !!eye && (eye.x - cx) ** 2 + (eye.z - cz) ** 2 > 75 * 75;
    group.visible = !far;
    if (far) return;
    for (const p of plants) {
      if (p.t < 0) continue;
      p.t += dt;
      const t = p.t, r = p.root;
      if (t < 0.45) { const k = ease(t / 0.45); r.position.y = p.pos.y + k * 0.75; r.rotation.z = Math.sin(t * 40) * 0.12 * (1 - k); r.scale.setScalar(1); }
      else if (t < 0.85) { const k = (t - 0.45) / 0.4; r.position.y = p.pos.y + 0.75 + k * 0.35; r.rotation.z = 0; r.scale.setScalar(Math.max(0.001, 1 - k)); }
      else if (t < 1.8) { r.visible = false; r.position.y = p.pos.y; }
      else if (t < 2.25) { r.visible = true; r.scale.setScalar(Math.max(0.001, (t - 1.8) / 0.45)); }
      else { r.scale.setScalar(1); r.position.y = p.pos.y; r.visible = true; p.t = -1; }
    }
    for (const d of dirt) {
      if (d.life <= 0) continue;
      d.life -= dt; d.v.y -= 6 * dt;
      d.m.position.addScaledVector(d.v, dt); d.m.scale.setScalar(Math.max(0.01, d.life / 0.7));
      if (d.life <= 0) d.m.visible = false;
    }
  };
  const inside = (x: number, z: number, pad = 0) => {
    const dx = x - cx, dz = z - cz, lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
    return Math.abs(lx) < hx + pad && Math.abs(lz) < hz + pad;
  };
  const center = V(cx, heightAt(cx, cz), cz);
  const entrance = at(0, hz + 2.2);
  const corners = [W(-hx, -hz), W(hx, -hz), W(hx, hz), W(-hx, hz)];
  const dispose = () => { atlas.tex.dispose(); hitGeo.dispose(); hitMat.dispose(); signMat.dispose(); };
  return { group, stat, plants, hits, center, entrance, yaw, corners, solids, inside, pull, update, dispose };
}
