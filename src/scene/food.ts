import * as THREE from 'three';
import { mulberry32, type Rnd } from '../core/rng';
import { ING } from '../data/ingredients';
import type { Amount, Ingredient, Picks } from '../data/types';
import { darken, lighten, mix } from '../paint/brush';
import { bowlCanvas, labelCanvas, packetCanvas, tex } from '../paint/textures';
import { boxG, coneG, cylG, group, M, mesh, sphereG, torusG, tube } from './geo';
import { wc } from '../render/watercolor';
import { brothMaterial } from './broth';

const PI = Math.PI;
const AMOUNT_K: Record<Amount, number> = { '한 꼬집': 0.5, '한 숟가락': 1, '두 숟가락': 1.6, '한 국자': 2.4 };

// ── 면 ───────────────────────────────
const RAINBOW = ['#F2A7B8', '#F7D560', '#A8D08D', '#8EC5E8', '#B9A3DB', '#F5A65B'];
function noodleNest(style: string, color: string, r: number, seed = 5, dome = 0.12) {
  const g = new THREE.Group();
  const rnd = mulberry32(seed);
  const cfg: Record<string, { n: number; tr: number; wig: number; f: number }> = {
    curly: { n: 11, tr: 0.034, wig: 0.08, f: 16 },
    thick: { n: 7, tr: 0.06, wig: 0.03, f: 6 },
    thin: { n: 16, tr: 0.02, wig: 0.03, f: 8 },
    rainbow: { n: 11, tr: 0.036, wig: 0.07, f: 14 },
    chewy: { n: 9, tr: 0.042, wig: 0.025, f: 5 },
    long: { n: 6, tr: 0.034, wig: 0.012, f: 3 },
  };
  const c = cfg[style] ?? cfg.curly;
  for (let k = 0; k < c.n; k++) {
    const pts: [number, number, number][] = [];
    const ring = 0.25 + rnd() * 0.55, ph = rnd() * 6.28, steps = style === 'long' ? 60 : 36;
    for (let i = 0; i <= steps; i++) {
      const a = ph + (i / steps) * PI * 2 * (style === 'long' ? 2.2 : 1.05);
      let rr = ring + Math.sin(a * c.f + k) * c.wig;
      if (style === 'long') rr = 0.1 + (i / steps) * 0.75;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      const d = Math.min(1, Math.hypot(x, z));
      const y = (1 - d * d) * dome + Math.sin(a * c.f * 0.7 + k) * 0.012 + 0.005;
      pts.push([x * r, y * r, z * r]);
    }
    const col = style === 'rainbow' ? RAINBOW[k % RAINBOW.length] : mix(color, k % 2 ? '#ffffff' : darken(color, 0.3), 0.12 * rnd());
    const m = new THREE.Mesh(tube(pts, c.tr * r, steps * 2), M(col, { rim: 0.7, alpha: style === 'chewy' ? 0.92 : 1, spec: 0.45 }));
    m.userData.ownGeo = true;
    g.add(m);
  }
  return g;
}

// ── 건더기 ──────────────────────────────
function topping(ing: Ingredient, s: number, rnd: Rnd): THREE.Group {
  const g = new THREE.Group();
  const c = ing.look.color, c2 = ing.look.color2 ?? lighten(c, 0.4);
  const add = (geo: THREE.BufferGeometry, col: string, p: [number, number, number], sc: [number, number, number] | number, r: [number, number, number] = [0, 0, 0], o = {}) =>
    mesh(geo, M(col, o), [p[0] * s, p[1] * s, p[2] * s], typeof sc === 'number' ? sc * s : [sc[0] * s, sc[1] * s, sc[2] * s], r, g);
  switch (ing.look.model) {
    case 'egg':
      add(sphereG(1, 28, 18), c, [0, 0, 0], [0.24, 0.1, 0.17], [0, 0, 0], { spec: 0.35 });
      add(sphereG(1, 24, 16), c2, [0.01, 0.06, 0], [0.11, 0.05, 0.085], [0, 0, 0], { rim: 0.4, spec: 0.7 });
      break;
    case 'dumpling':
      add(sphereG(1), c, [0, 0.04, 0], [0.2, 0.1, 0.12]);
      for (let i = -2; i <= 2; i++) add(sphereG(1), darken(c, 0.06), [i * 0.06, 0.12, 0], [0.03, 0.03, 0.045]);
      break;
    case 'scallion':
      for (let i = 0; i < 7; i++) {
        const a = rnd() * 6.28, d = rnd() * 0.16;
        add(torusG(1, 0.35, 6, 12), i % 3 ? c : c2, [Math.cos(a) * d, 0.02, Math.sin(a) * d], 0.045, [PI / 2 + (rnd() - 0.5) * 0.6, 0, rnd()]);
      }
      break;
    case 'fishcake': {
      const t = tex(labelCanvas('fishcake'));
      const m = new THREE.Mesh(cylG(0.13, 0.13, 0.04, 28), [M(c2), wc('#FFFFFF', { map: t }), M(c)]);
      m.scale.setScalar(s); m.position.y = 0.02 * s; m.rotation.x = -0.25;
      g.add(m);
      break;
    }
    case 'gim':
      add(boxG(0.34, 0.4, 0.012), c, [0, 0.12, -0.05], 1, [-0.45, 0, 0], { rim: 0.3 });
      break;
    case 'shiitake':
      add(sphereG(1), c, [0, 0.03, 0], [0.15, 0.065, 0.15]);
      add(boxG(0.16, 0.012, 0.025), c2, [0, 0.093, 0], 1, [0, 0.785, 0]);
      add(boxG(0.16, 0.012, 0.025), c2, [0, 0.093, 0], 1, [0, -0.785, 0]);
      break;
    case 'corn':
      for (let i = 0; i < 14; i++) {
        const a = rnd() * 6.28, d = rnd() * 0.12;
        add(sphereG(1, 10, 8), mix(c, '#ffffff', rnd() * 0.2), [Math.cos(a) * d, 0.02 + rnd() * 0.05, Math.sin(a) * d], [0.035, 0.03, 0.03]);
      }
      break;
    case 'chili':
      for (let i = 0; i < 5; i++) {
        const a = rnd() * 6.28, d = rnd() * 0.12;
        add(torusG(1, 0.32, 6, 14), i === 4 ? c2 : c, [Math.cos(a) * d, 0.02, Math.sin(a) * d], 0.05, [PI / 2 + (rnd() - 0.5) * 0.5, 0, 0]);
      }
      break;
    case 'tofu':
      for (let i = 0; i < 3; i++) add(boxG(0.1, 0.09, 0.1), c, [(i - 1) * 0.11, 0.045, (rnd() - 0.5) * 0.06], 1, [0, rnd(), 0], { rim: 0.6 });
      break;
    case 'tteok':
      for (let i = 0; i < 4; i++) add(sphereG(1), i === 2 ? c2 : c, [(i - 1.5) * 0.08, 0.025, (rnd() - 0.5) * 0.08], [0.07, 0.03, 0.045], [0, rnd() * 3, 0]);
      break;
    case 'woodear':
      for (let i = 0; i < 3; i++) add(sphereG(1), c, [(i - 1) * 0.09, 0.03, (rnd() - 0.5) * 0.06], [0.1, 0.025, 0.08], [rnd() * 0.6, rnd() * 3, rnd() * 0.5], { rim: 0.5 });
      break;
    case 'sprout':
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * 6.28;
        const pts: [number, number, number][] = [[Math.cos(a) * 0.02 * s, 0.02 * s, Math.sin(a) * 0.02 * s], [Math.cos(a) * 0.08 * s, 0.06 * s, Math.sin(a) * 0.08 * s], [Math.cos(a + 0.4) * 0.15 * s, 0.03 * s, Math.sin(a + 0.4) * 0.15 * s]];
        const m = new THREE.Mesh(tube(pts, 0.012 * s, 10), M(c)); m.userData.ownGeo = true; g.add(m);
        add(sphereG(1, 8, 6), c2, [Math.cos(a + 0.4) * 0.15, 0.035, Math.sin(a + 0.4) * 0.15], [0.022, 0.016, 0.016]);
      }
      break;
    case 'yubu':
      add(sphereG(1), c, [0, 0.07, 0], [0.13, 0.11, 0.1]);
      add(torusG(1, 0.25, 6, 14), c2, [0, 0.16, 0], 0.045, [PI / 2, 0, 0]);
      add(coneG(0.05, 0.06, 8), c, [0, 0.2, 0], 1);
      break;
    case 'sausage':
      for (let i = 0; i < 3; i++) {
        add(cylG(0.06, 0.06, 0.035, 18), c, [(i - 1) * 0.1, 0.025, (rnd() - 0.5) * 0.05], 1, [0.3, 0, (rnd() - 0.5) * 0.3], { spec: 0.4 });
        add(cylG(0.048, 0.048, 0.037, 18), lighten(c, 0.35), [(i - 1) * 0.1, 0.027, (rnd() - 0.5) * 0.02], 1, [0.3, 0, 0]);
      }
      break;
    case 'quail':
      for (let i = 0; i < 3; i++) add(sphereG(1), i === 1 ? c2 : c, [(i - 1) * 0.085, 0.05, (rnd() - 0.5) * 0.05], [0.055, 0.07, 0.055], [rnd() * 0.5, 0, rnd() - 0.5]);
      break;
  }
  return g;
}

// ── 마무리 ──────────────────────────────
function scatter(g: THREE.Group, geo: THREE.BufferGeometry, col: string, count: number, r: number, size: [number, number, number], rnd: Rnd, y = 0.01, o = {}) {
  const inst = new THREE.InstancedMesh(geo, M(col, o), count);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const a = rnd() * 6.28, d = Math.sqrt(rnd()) * r;
    p.set(Math.cos(a) * d, y + rnd() * y, Math.sin(a) * d);
    e.set(rnd() * 3, rnd() * 3, rnd() * 3); q.setFromEuler(e);
    const k = 0.7 + rnd() * 0.6;
    sc.set(size[0] * k, size[1] * k, size[2] * k);
    m4.compose(p, q, sc);
    inst.setMatrixAt(i, m4);
  }
  g.add(inst);
  return inst;
}

let starGeo: THREE.BufferGeometry | null = null;
function starG() {
  if (starGeo) return starGeo;
  const sh = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * PI * 2 + PI / 2, rr = i % 2 ? 0.42 : 1;
    if (i === 0) sh.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  starGeo = new THREE.ExtrudeGeometry(sh, { depth: 0.25, bevelEnabled: false });
  starGeo.rotateX(-PI / 2);
  return starGeo;
}

function finishOn(g: THREE.Group, ing: Ingredient, amount: Amount, r: number, rnd: Rnd, dome = 0.12) {
  const k = AMOUNT_K[amount];
  const c = ing.look.color;
  const top = dome * r * 0.6;
  switch (ing.look.model) {
    case 'sesame': scatter(g, sphereG(1, 6, 4), c, Math.round(40 * k), r * 0.6, [0.012 * r, 0.006 * r, 0.008 * r], rnd, top, { rim: 0.2 }); break;
    case 'pepper': scatter(g, sphereG(1, 5, 4), c, Math.round(45 * k), r * 0.7, [0.007 * r, 0.007 * r, 0.007 * r], rnd, top); break;
    case 'salt': scatter(g, boxG(1, 1, 1), c, Math.round(40 * k), r * 0.65, [0.009 * r, 0.009 * r, 0.009 * r], rnd, top, { rim: 0.2 }); break;
    case 'gimflake': scatter(g, boxG(1, 1, 1), c, Math.round(30 * k), r * 0.35, [0.06 * r, 0.004 * r, 0.012 * r], rnd, top * 1.3); break;
    case 'giggle': {
      const n = Math.round(6 * k);
      for (let i = 0; i < n; i++) {
        const a = rnd() * 6.28, d = 0.4 + rnd() * 0.5;
        const b = mesh(sphereG(1, 14, 10), M(RAINBOW[i % RAINBOW.length], { alpha: 0.85, rim: 1.5 }), [Math.cos(a) * d * r, 0.03 * r, Math.sin(a) * d * r], (0.04 + rnd() * 0.04) * r, [0, 0, 0], g);
        b.userData.bob = rnd() * 6;
      }
      break;
    }
    case 'oil': {
      const n = Math.round(5 * k);
      for (let i = 0; i < n; i++) {
        const a = rnd() * 6.28, d = 0.5 + rnd() * 0.4;
        mesh(cylG(1, 1, 0.1, 18), M(c, { alpha: 0.75, rim: 0.2 }), [Math.cos(a) * d * r, 0.004 * r, Math.sin(a) * d * r], [(0.04 + rnd() * 0.04) * r, 0.02 * r, (0.04 + rnd() * 0.04) * r], [0, 0, 0], g);
      }
      break;
    }
    case 'cheese': {
      const sz = 0.28 + 0.05 * Math.min(2, k);
      mesh(boxG(1, 1, 1), M(c, { rim: 0.5 }), [0, top * 1.3 + 0.01 * r, 0], [sz * r, 0.015 * r, sz * r], [0.05, 0.785, 0.08], g);
      break;
    }
    case 'butter':
      mesh(boxG(1, 1, 1), M(c, { rim: 0.4 }), [0.05 * r, top * 1.2 + 0.04 * r, 0.02 * r], (0.08 + 0.02 * Math.min(2, k)) * r, [0, 0.5, 0], g);
      mesh(cylG(1, 1, 0.1, 18), M(lighten(c, 0.3), { alpha: 0.8 }), [0.05 * r, top * 1.2, 0.02 * r], [0.13 * r, 0.02 * r, 0.12 * r], [0, 0, 0], g);
      break;
    case 'stargim': {
      const n = Math.round(5 * k);
      for (let i = 0; i < n; i++) {
        const a = rnd() * 6.28, d = 0.2 + rnd() * 0.5;
        mesh(starG(), M(i % 2 ? c : (ing.look.color2 ?? '#F7D560'), { rim: 0.3 }), [Math.cos(a) * d * r, top + 0.01 * r, Math.sin(a) * d * r], 0.045 * r, [0, rnd() * 6, 0], g);
      }
      break;
    }
  }
}

export function brothColor(p: Picks) {
  const b = p.broth ? ING.get(p.broth)!.look.color : '#F3E3C0';
  const s = p.soup ? ING.get(p.soup)!.look.color2 ?? '#D8783F' : null;
  return s ? mix(b, s, 0.28) : b;
}

// 냄비·그릇 속 라면 한 그릇 (원점 = 국물 표면 가운데)
export function buildRamen(p: Picks, r: number, seed = 7): THREE.Group {
  const g = new THREE.Group();
  const rnd = mulberry32(seed);
  if (p.broth || p.soup) {
    const base = p.broth ? ING.get(p.broth)!.look.color : '#F3E3C0';
    const disc = mesh(new THREE.CircleGeometry(r, 48), brothMaterial(p.soup ? mix(base, SOUP_COLOR(p.soup), 0.22) : base, p.soup ? SOUP_COLOR(p.soup) : null), [0, 0, 0], 1, [-PI / 2, 0, 0], g);
    disc.userData.ownGeo = true;
    disc.name = 'broth';
  }
  let dome = 0.04;
  if (p.noodle) {
    const n = ING.get(p.noodle)!;
    dome = 0.14;
    const nest = noodleNest(n.look.style ?? 'curly', n.look.color, r * 0.92, 5, dome);
    nest.name = 'noodles';
    g.add(nest);
  }
  const tops = p.toppings.map((id) => ING.get(id)!);
  tops.forEach((it, i) => {
    const a = -PI / 2 + (i - (tops.length - 1) / 2) * 1.25 + PI;
    const d = tops.length === 1 ? 0.3 : 0.48;
    const t = topping(it, r * 1.55, rnd);
    t.position.set(Math.cos(a) * d * r, dome * r * (1 - d * d) * 0.9 + 0.02 * r, Math.sin(a) * d * r);
    t.rotation.y = -a + PI / 2;
    t.name = it.id;
    g.add(t);
  });
  for (const f of p.finish) {
    const fg = new THREE.Group();
    fg.name = f.id;
    finishOn(fg, ING.get(f.id)!, f.amount, r, rnd, dome);
    g.add(fg);
  }
  return g;
}

export function animateRamen(g: THREE.Object3D, t: number) {
  g.traverse((o) => { if (o.userData.bob !== undefined) o.position.y = (0.03 + Math.sin(t * 2 + o.userData.bob) * 0.01) * (o.parent?.parent ? 1 : 1); });
}

// ── 카드·던지기에 쓰는 재료 하나짜리 모형 ─────────────────────
const packetTex = new Map<string, THREE.Texture>();
export function itemModel(ing: Ingredient): THREE.Group {
  const g = new THREE.Group();
  const rnd = mulberry32(ing.id.length * 17 + 3);
  const c = ing.look.color;
  switch (ing.look.model) {
    case 'broth': {
      mesh(cylG(0.12, 0.1, 0.17, 24, true), M('#FFF8EE', { side: THREE.DoubleSide }), [0, 0.085, 0], 1, [0, 0, 0], g);
      mesh(cylG(0.1, 0.1, 0.01, 24), M('#FFF8EE'), [0, 0.005, 0], 1, [0, 0, 0], g);
      mesh(cylG(0.115, 0.115, 0.005, 24), M(c, { rim: 0, flat: 0.2 }), [0, 0.14, 0], 1, [0, 0, 0], g);
      mesh(torusG(0.05, 0.014, 8, 16, PI * 1.2), M('#FFF8EE'), [0.13, 0.09, 0], 1, [0, 0, -PI * 0.6], g);
      mesh(torusG(0.12, 0.012, 6, 28), M('#C2560E'), [0, 0.165, 0], 1, [PI / 2, 0, 0], g);
      mesh(coneG(0.03, 0.04, 3), M('#FFF8EE'), [-0.125, 0.165, 0], 1, [0, 0, PI / 2], g);
      break;
    }
    case 'noodle': {
      mesh(cylG(0.17, 0.13, 0.03, 28), M('#FFF8EE'), [0, 0.015, 0], 1, [0, 0, 0], g);
      const nest = noodleNest(ing.look.style ?? 'curly', c, 0.16, 9, 0.35);
      nest.position.y = 0.03;
      g.add(nest);
      break;
    }
    case 'packet': {
      let t = packetTex.get(ing.id);
      if (!t) { t = tex(packetCanvas(ing.name, c, ing.id.length * 7)); packetTex.set(ing.id, t); }
      const face = wc('#FFFFFF', { map: t, rim: 0.3 });
      const side = M(darken(c, 0.1));
      const m = new THREE.Mesh(boxG(0.2, 0.25, 0.025), [side, side, side, side, face, face]);
      m.position.y = 0.125;
      g.add(m);
      break;
    }
    case 'sesame': case 'pepper': case 'salt': case 'gimflake': case 'stargim': case 'butter': case 'cheese': {
      mesh(cylG(0.14, 0.11, 0.04, 26), M('#FFF8EE'), [0, 0.02, 0], 1, [0, 0, 0], g);
      mesh(torusG(0.14, 0.008, 6, 28), M('#C2560E'), [0, 0.04, 0], 1, [PI / 2, 0, 0], g);
      const inner = new THREE.Group(); inner.position.y = 0.04; g.add(inner);
      if (ing.look.model === 'cheese') mesh(boxG(0.16, 0.012, 0.16), M(c, { rim: 0.5 }), [0, 0.01, 0], 1, [0, 0.4, 0], inner);
      else if (ing.look.model === 'butter') mesh(boxG(0.09, 0.07, 0.09), M(c, { rim: 0.4 }), [0, 0.035, 0], 1, [0, 0.5, 0], inner);
      else if (ing.look.model === 'stargim') for (let i = 0; i < 4; i++) mesh(starG(), M(i % 2 ? c : (ing.look.color2 ?? '#F7D560')), [Math.cos(i * 1.6) * 0.06, 0.005, Math.sin(i * 1.6) * 0.06], 0.04, [0, i, 0], inner);
      else {
        const geo = ing.look.model === 'salt' ? boxG(1, 1, 1) : ing.look.model === 'gimflake' ? boxG(1, 1, 1) : sphereG(1, 6, 4);
        const size: [number, number, number] = ing.look.model === 'gimflake' ? [0.06, 0.005, 0.016] : ing.look.model === 'sesame' ? [0.016, 0.008, 0.012] : [0.013, 0.013, 0.013];
        // 소복이 쌓인 더미
        for (let lay = 0; lay < 5; lay++) scatter(inner, geo, ing.look.model === 'sesame' ? mix(c, '#C9A26B', lay * 0.12) : ing.look.model === 'salt' ? mix('#FFFFFF', '#DDE7EE', lay * 0.15) : c, 70, 0.1 - lay * 0.018, size, rnd, 0.006 + lay * 0.012, { rim: 0.3 });
      }
      break;
    }
    case 'giggle': {
      mesh(cylG(0.09, 0.09, 0.18, 24), M('#DDEFFA', { alpha: 0.45, rim: 1.5 }), [0, 0.09, 0], 1, [0, 0, 0], g);
      mesh(cylG(0.075, 0.08, 0.03, 20), M('#F0974A'), [0, 0.195, 0], 1, [0, 0, 0], g);
      for (let i = 0; i < 9; i++) mesh(sphereG(1, 12, 8), M(RAINBOW[i % 6], { rim: 1 }), [(rnd() - 0.5) * 0.1, 0.03 + rnd() * 0.12, (rnd() - 0.5) * 0.1], 0.025 + rnd() * 0.012, [0, 0, 0], g);
      break;
    }
    case 'oil': {
      mesh(cylG(0.07, 0.08, 0.17, 20), M(c, { alpha: 0.85, rim: 1.2 }), [0, 0.085, 0], 1, [0, 0, 0], g);
      mesh(cylG(0.03, 0.06, 0.06, 16), M(c, { alpha: 0.85 }), [0, 0.2, 0], 1, [0, 0, 0], g);
      mesh(cylG(0.032, 0.032, 0.03, 16), M('#C2560E'), [0, 0.245, 0], 1, [0, 0, 0], g);
      mesh(boxG(0.1, 0.07, 0.005), M('#FFF4E6'), [0, 0.09, 0.08], 1, [0, 0, 0], g);
      break;
    }
    default: {
      const t = topping(ing, 1.4, rnd);
      mesh(cylG(0.2, 0.16, 0.03, 28), M('#FFF8EE'), [0, 0.015, 0], 1, [0, 0, 0], g);
      t.position.y = 0.03;
      g.add(t);
    }
  }
  return g;
}

// ── 양은냄비와 그릇 ────────────────────────────
export const POT_R = 0.21;
export function makePot() {
  const g = new THREE.Group();
  const gold = '#E7B84E';
  mesh(cylG(POT_R, POT_R * 0.96, 0.16, 36, true), M(gold, { side: THREE.DoubleSide, rim: 0.8, noise: 2.5 }), [0, 0.08, 0], 1, [0, 0, 0], g);
  mesh(cylG(POT_R * 0.96, POT_R * 0.96, 0.01, 36), M(darken(gold, 0.1)), [0, 0.005, 0], 1, [0, 0, 0], g);
  mesh(torusG(POT_R, 0.008, 6, 40), M(lighten(gold, 0.2)), [0, 0.16, 0], 1, [PI / 2, 0, 0], g);
  for (const sd of [-1, 1]) {
    const h = mesh(torusG(0.05, 0.012, 6, 16, PI), M(darken(gold, 0.15)), [sd * (POT_R + 0.035), 0.13, 0], 1, [0, sd > 0 ? 0 : PI, -PI / 2], g);
    h.rotation.order = 'YZX';
    mesh(boxG(0.04, 0.02, 0.04), M(darken(gold, 0.2)), [sd * (POT_R + 0.01), 0.13, 0], 1, [0, 0, 0], g);
  }
  return g;
}

let bowlTex: THREE.Texture | null = null;
export function makeBowl(r = 0.17) {
  const g = new THREE.Group();
  if (!bowlTex) bowlTex = tex(bowlCanvas(), true);
  const lathe = (prof: number[][], mat: THREE.Material) => {
    const geo = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x * r, y * r)), 40);
    const m = mesh(geo, mat, [0, 0, 0], 1, [0, 0, 0], g);
    m.userData.ownGeo = true;
  };
  lathe([[0, 0], [0.55, 0], [0.6, 0.06], [0.8, 0.25], [0.96, 0.55], [1.0, 0.62]], wc('#FFFFFF', { map: bowlTex, side: THREE.DoubleSide, rim: 0.6 }));
  lathe([[1.0, 0.62], [0.94, 0.62], [0.88, 0.5], [0.74, 0.25], [0.5, 0.1], [0, 0.1]], M('#FFF8EE', { side: THREE.DoubleSide, rim: 0.3 }));
  return { group: g, surfaceY: 0.5 * r, innerR: 0.86 * r };
}

export const SOUP_COLOR = (id: string) => ING.get(id)?.look.color2 ?? '#D8783F';
export { RAINBOW };
export { group };

// 마른 라면 사리 (냄비에 넣기 전)
const blockTex = new Map<string, THREE.Texture>();
export function noodleBlock(ing: Ingredient) {
  const g = new THREE.Group();
  const style = ing.look.style ?? 'curly';
  let t = blockTex.get(style);
  if (!t) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d')!;
    x.fillStyle = ing.look.color; x.fillRect(0, 0, 256, 256);
    x.lineCap = 'round';
    const rows = style === 'thick' ? 9 : style === 'thin' ? 26 : 16;
    for (let r = 0; r < rows; r++) {
      x.strokeStyle = style === 'rainbow' ? RAINBOW[r % RAINBOW.length] : r % 2 ? darken(ing.look.color, 0.18) : lighten(ing.look.color, 0.25);
      x.lineWidth = style === 'thick' ? 14 : style === 'thin' ? 4 : 8;
      x.beginPath();
      for (let i = 0; i <= 256; i += 4) {
        const y = (r + 0.5) * (256 / rows) + Math.sin(i * (style === 'long' || style === 'chewy' ? 0.03 : 0.12) + r) * (style === 'curly' || style === 'rainbow' ? 6 : 2);
        if (i === 0) x.moveTo(i, y); else x.lineTo(i, y);
      }
      x.stroke();
    }
    t = tex(c);
    blockTex.set(style, t);
  }
  const mat = wc('#FFFFFF', { map: t, rim: 0.6, spec: 0.2 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.055, 0.2, 1, 1, 1), mat);
  box.userData.ownGeo = true;
  box.position.y = 0.03;
  g.add(box);
  return g;
}

export function makeLadle() {
  const g = new THREE.Group();
  const metal = M('#C9CED6', { spec: 0.8, rim: 0.6 });
  const cup = mesh(new THREE.SphereGeometry(0.055, 18, 10, 0, PI * 2, PI / 2, PI / 2), metal, [0, 0, 0], 1, [0, 0, 0], g);
  cup.userData.ownGeo = true;
  (cup.material as THREE.ShaderMaterial).side = THREE.DoubleSide;
  mesh(torusG(0.055, 0.004, 6, 24), metal, [0, 0, 0], 1, [PI / 2, 0, 0], g);
  // 손잡이는 낮게 뉘어 있어서, 1인칭 화면에서 손이 아래쪽에 머물러요
  mesh(cylG(0.006, 0.007, 0.34, 8), metal, [0, 0.092, -0.193], 1, [-1.0, 0, 0], g);
  mesh(cylG(0.012, 0.012, 0.09, 8), M('#5A3A28'), [0, 0.159, -0.298], 1, [-1.0, 0, 0], g);
  const liquid = mesh(new THREE.CircleGeometry(0.05, 20), M('#F2D27C', { rim: 0, flat: 0.3 }), [0, -0.012, 0], 1, [-PI / 2, 0, 0], g);
  liquid.userData.ownGeo = true;
  liquid.name = 'liquid';
  liquid.visible = false;
  return g;
}

export function makeCookChopsticks() {
  const g = new THREE.Group();
  for (const dx of [-0.01, 0.01]) mesh(cylG(0.005, 0.008, 0.42, 6), M('#D9A866', { spec: 0.3 }), [dx, 0, 0.21], 1, [PI / 2, 0, dx * 1.5], g);
  return g;
}

export function strandsMesh(color: string) {
  return M(color, { rim: 0.6, spec: 0.45 });
}
