import * as THREE from 'three';
import { mulberry32 } from '../core/rng';
import { CITEM, CRAFT, type CItem, type CPicks, type CraftKind } from '../data/craft';
import type { MiniKind } from '../data/craftMini';
import { darken, lighten } from '../paint/brush';
import { boxG, capsuleG, coneG, cylG, M, mesh, sphereG, torusG } from './geo';

// 미니 가게 봐 주기: 단계마다 하나씩 골라 작은 받침 위에 차곡차곡 모아요
// 아이스크림(그릇→맛→토핑) · 편지 세트(편지지→펜→스티커) · 책(책→책갈피→싸개)
// 차 한 상(찻잔→차→곁들임) · 과일 바구니(바구니→과일→곁들임)
const PI = Math.PI;
const G = () => new THREE.Group();

// 아이스크림 그릇 높이 (맛이 얹히는 자리)
const iceTop = (cup?: CItem) => (cup?.shape === 'cone' ? 0.13 : 0.075);
function iceCup(it: CItem) {
  const g = G();
  if (it.shape === 'cone') {
    // 콘 받침 + 거꾸로 선 콘 (와플 줄무늬)
    mesh(cylG(0.03, 0.036, 0.02, 16, true), M('#C9A36E', { side: THREE.DoubleSide }), [0, 0.01, 0], 1, [0, 0, 0], g);
    mesh(coneG(0.038, 0.12, 18), M(it.color, { noise: 4 }), [0, 0.07, 0], 1, [PI, 0, 0], g);
    for (let i = 0; i < 4; i++) mesh(torusG(0.034 - i * 0.007, 0.0016, 4, 18), M(darken(it.color, 0.2)), [0, 0.118 - i * 0.022, 0], 1, [PI / 2, 0, 0], g);
    if (it.color2) mesh(torusG(0.038, 0.005, 6, 20), M(it.color2), [0, 0.128, 0], 1, [PI / 2, 0, 0], g);
  } else {
    mesh(cylG(0.048, 0.034, 0.06, 20, true), M(it.color, { side: THREE.DoubleSide, rim: 0.5, alpha: it.color === '#CFEAF7' ? 0.8 : 1 }), [0, 0.03, 0], 1, [0, 0, 0], g);
    mesh(cylG(0.034, 0.034, 0.004, 20), M(darken(it.color, 0.1)), [0, 0.002, 0], 1, [0, 0, 0], g);
    mesh(torusG(0.048, 0.004, 6, 22), M(lighten(it.color, 0.2)), [0, 0.06, 0], 1, [PI / 2, 0, 0], g);
    if (it.name.includes('하트')) mesh(sphereG(1, 8, 6), M('#E3645A'), [0, 0.03, 0.042], [0.01, 0.009, 0.004], [0, 0, 0], g);
  }
  return g;
}
function iceScoop(it: CItem, y: number) {
  const g = G();
  mesh(sphereG(1, 20, 14), M(it.color, { noise: 3 }), [0, y + 0.028, 0], [0.046, 0.04, 0.046], [0, 0, 0], g);
  mesh(torusG(0.04, 0.008, 6, 20), M(it.color, { noise: 3 }), [0, y + 0.006, 0], 1, [PI / 2, 0, 0], g); // 녹아 흐르는 테두리
  if (it.color2) { const r = mulberry32(5); for (let i = 0; i < 9; i++) { const a = r() * PI * 2, h = 0.2 + r() * 0.6; mesh(sphereG(1, 5, 4), M(it.color2), [Math.cos(a) * 0.044 * Math.sqrt(1 - h * h), y + 0.028 + h * 0.038, Math.sin(a) * 0.044 * Math.sqrt(1 - h * h)], 0.005, [0, 0, 0], g); } }
  return g;
}
function iceTop2(it: CItem, y: number) {
  const g = G(), c = it.color, top = y + 0.066, rnd = mulberry32(it.id.length * 13);
  switch (it.shape) {
    case 'puff': for (let i = 0; i < 4; i++) { const a = (i / 4) * PI * 2; mesh(cylG(0.011, 0.011, 0.014, 10), M(c), [Math.cos(a) * 0.018, top - 0.004, Math.sin(a) * 0.018], 1, [rnd(), 0, rnd()], g); } break;
    case 'ears': for (const sd of [-1, 1]) mesh(cylG(0.016, 0.016, 0.005, 14), M(c, { noise: 3 }), [sd * 0.017, top + 0.008, 0], 1, [PI / 2, 0, sd * 0.25], g); break;
    case 'drizzle': for (let i = 0; i < 3; i++) mesh(torusG(0.03 - i * 0.008, 0.003, 5, 20), M(c, { spec: 0.6 }), [0, top - 0.012 + i * 0.006, 0], 1, [PI / 2 + 0.15, 0, i], g); break;
    case 'sprinkle': for (let i = 0; i < 16; i++) { const a = rnd() * PI * 2, d = rnd() * 0.03; mesh(cylG(0.0018, 0.0018, 0.01, 4), M(['#F28CB8', '#6FB3E0', '#FFE07A', '#8DC26F', '#FFFFFF'][i % 5]), [Math.cos(a) * d, top - 0.004 - d * 0.3, Math.sin(a) * d], 1, [PI / 2, rnd() * 3, 0], g); } break;
    case 'cherry': mesh(sphereG(0.014, 12, 10), M(c, { spec: 0.6 }), [0, top + 0.008, 0], 1, [0, 0, 0], g); mesh(cylG(0.0015, 0.0015, 0.03, 4), M('#6E4A30'), [0.004, top + 0.03, 0], 1, [0, 0, 0.3], g); break;
    case 'star': for (let i = 0; i < 4; i++) { const a = (i / 4) * PI * 2 + 0.3; mesh(new THREE.OctahedronGeometry(1), M(c, { spec: 0.4 }), [Math.cos(a) * 0.02, top - 0.003, Math.sin(a) * 0.02], [0.008, 0.005, 0.008], [rnd(), rnd(), rnd()], g); } break;
    default: mesh(sphereG(0.01, 8, 6), M(c), [0, top, 0], 1, [0, 0, 0], g);
  }
  return g;
}

// 편지 세트
function paper(it: CItem) {
  const g = G();
  mesh(boxG(0.17, 0.003, 0.12), M(it.color, { flat: 0.3 }), [0, 0.0015, 0], 1, [0, 0, 0], g);
  const c2 = it.color2 ?? darken(it.color, 0.2);
  for (let i = 0; i < 4; i++) mesh(boxG(0.13, 0.0008, 0.003), M(lighten(c2, 0.2)), [0.005, 0.0034, -0.035 + i * 0.022], 1, [0, 0, 0], g);
  const r = mulberry32(it.id.length * 3);
  for (let i = 0; i < 6; i++) mesh(cylG(0.006, 0.006, 0.0012, 10), M(c2), [-0.075 + r() * 0.15, 0.0036, (r() < 0.5 ? -0.052 : 0.052)], 1, [0, 0, 0], g);
  return g;
}
function pen(it: CItem) {
  const g = G(); g.position.set(0.01, 0.009, 0.004); g.rotation.set(0, 0.5, PI / 2);
  const pencil = it.shape === 'pencil';
  mesh(cylG(0.0065, 0.0065, 0.11, pencil ? 6 : 14), M(it.color, { spec: pencil ? 0.1 : 0.5 }), [0, 0, 0], 1, [0, 0, 0], g);
  mesh(coneG(0.0065, 0.018, pencil ? 6 : 14), M(pencil ? '#F3D9B1' : darken(it.color, 0.3)), [0, -0.064, 0], 1, [PI, 0, 0], g);
  mesh(coneG(0.0022, 0.006, 8), M('#3E3A39'), [0, -0.0725, 0], 1, [PI, 0, 0], g);
  if (pencil) mesh(cylG(0.0068, 0.0068, 0.012, 10), M(it.color2 ?? '#F7B3C8'), [0, 0.061, 0], 1, [0, 0, 0], g);
  else { mesh(cylG(0.0072, 0.0072, 0.03, 14), M(it.color2 ?? lighten(it.color, 0.3)), [0, 0.035, 0], 1, [0, 0, 0], g); mesh(boxG(0.003, 0.03, 0.004), M('#C9CED3', { spec: 0.6 }), [0.007, 0.03, 0], 1, [0, 0, 0], g); }
  return g;
}
function sticker(it: CItem) {
  const g = G(); g.position.set(-0.05, 0.004, 0.028);
  mesh(cylG(0.024, 0.024, 0.002, 20), M('#FFFFFF'), [0, 0, 0], 1, [0, 0, 0], g);
  const c = it.color, y = 0.0025;
  switch (it.shape) {
    case 'bear': mesh(cylG(0.016, 0.016, 0.002, 16), M(c), [0, y, 0.002], 1, [0, 0, 0], g); for (const sd of [-1, 1]) mesh(cylG(0.006, 0.006, 0.002, 10), M(c), [sd * 0.012, y, -0.012], 1, [0, 0, 0], g); break;
    case 'bunny': mesh(cylG(0.013, 0.013, 0.002, 16), M('#F7D6DC'), [0, y, 0.006], 1, [0, 0, 0], g); for (const sd of [-1, 1]) mesh(boxG(0.006, 0.002, 0.018), M('#F7D6DC'), [sd * 0.006, y, -0.01], 1, [0, sd * 0.2, 0], g); break;
    case 'moon': mesh(cylG(0.016, 0.016, 0.002, 18), M(c), [0, y, 0], 1, [0, 0, 0], g); mesh(cylG(0.013, 0.013, 0.0025, 18), M('#FFFFFF'), [0.008, y + 0.0003, -0.004], 1, [0, 0, 0], g); break;
    case 'rainbow': ['#E3645A', '#F6CF3E', '#47AE7A', '#6FB3E0'].forEach((cc, i) => mesh(torusG(0.016 - i * 0.003, 0.0016, 4, 16, PI), M(cc), [0, y, 0.006], 1, [-PI / 2, 0, 0], g)); break;
    case 'heart': for (const sd of [-1, 1]) mesh(cylG(0.008, 0.008, 0.002, 12), M(c), [sd * 0.006, y, -0.003], 1, [0, 0, 0], g); mesh(boxG(0.014, 0.002, 0.014), M(c), [0, y, 0.005], 1, [0, PI / 4, 0], g); break;
    default: mesh(new THREE.OctahedronGeometry(1), M(c), [0, y + 0.002, 0], [0.016, 0.002, 0.016], [0, 0.4, 0], g);
  }
  return g;
}

// 책
function bookM(it: CItem) {
  const g = G();
  mesh(boxG(0.13, 0.03, 0.17), M(it.color, { noise: 1.5 }), [0, 0.015, 0], 1, [0, 0, 0], g);
  mesh(boxG(0.122, 0.024, 0.165), M('#FFF8EC'), [0.006, 0.015, 0], 1, [0, 0, 0], g);
  mesh(boxG(0.13, 0.003, 0.17), M(it.color, { noise: 1.5 }), [0, 0.0305, 0], 1, [0, 0, 0], g);
  // 표지 그림: 동그라미와 제목 줄
  mesh(cylG(0.03, 0.03, 0.002, 18), M(lighten(it.color, 0.45)), [0.005, 0.033, -0.02], 1, [0, 0, 0], g);
  mesh(boxG(0.07, 0.001, 0.012), M(darken(it.color, 0.35)), [0.005, 0.0325, 0.045], 1, [0, 0, 0], g);
  mesh(boxG(0.012, 0.031, 0.17), M(darken(it.color, 0.15)), [-0.059, 0.015, 0], 1, [0, 0, 0], g); // 책등
  return g;
}
function bookmark(it: CItem) {
  const g = G();
  mesh(boxG(0.016, 0.002, 0.07), M(it.color), [0.03, 0.033, -0.105], 1, [0.25, 0, 0], g);
  mesh(sphereG(0.006, 8, 6), M(darken(it.color, 0.2)), [0.03, 0.022, -0.142], 1, [0, 0, 0], g);
  mesh(cylG(0.0012, 0.0012, 0.018, 4), M(darken(it.color, 0.2)), [0.03, 0.03, -0.136], 1, [0.7, 0, 0], g);
  return g;
}
function bookWrap(it: CItem) {
  const g = G();
  if (it.shape === 'band') {
    mesh(boxG(0.134, 0.034, 0.012), M(it.color), [0, 0.015, 0.03], 1, [0, 0, 0], g);
    mesh(boxG(0.012, 0.034, 0.174), M(it.color), [0.03, 0.015, 0], 1, [0, 0, 0], g);
    for (const sd of [-1, 1]) mesh(torusG(0.01, 0.003, 5, 12), M(it.color), [0.03 + sd * 0.01, 0.036, 0.03], [1, 0.7, 1], [PI / 2, 0, sd * 0.5], g);
  } else {
    mesh(boxG(0.138, 0.034, 0.08), M(it.color, { noise: 1.5 }), [0, 0.015, 0.04], 1, [0, 0, 0], g);
    const r = mulberry32(it.id.length * 9);
    for (let i = 0; i < 5; i++) mesh(cylG(0.005, 0.005, 0.001, 8), M(lighten(it.color, 0.4)), [-0.05 + r() * 0.1, 0.0325, 0.01 + r() * 0.06], 1, [0, 0, 0], g);
  }
  return g;
}

// 차 한 상
const cupTop = (cup?: CItem) => (cup?.shape === 'teacup' ? 0.04 : cup?.shape === 'pot' ? 0.05 : 0.065);
function teaCup(it: CItem) {
  const g = G(), c = it.color;
  switch (it.shape) {
    case 'teacup':
      mesh(cylG(0.055, 0.05, 0.006, 22), M('#FFFFFF', { rim: 0.4 }), [0, 0.003, 0], 1, [0, 0, 0], g);
      mesh(cylG(0.042, 0.026, 0.038, 20, true), M(c, { side: THREE.DoubleSide, rim: 0.4 }), [0, 0.025, 0], 1, [0, 0, 0], g);
      mesh(torusG(0.012, 0.003, 6, 12), M(c), [0.045, 0.026, 0], 1, [0, 0, 0], g);
      break;
    case 'glass':
      mesh(cylG(0.034, 0.03, 0.07, 20, true), M(c, { side: THREE.DoubleSide, alpha: 0.55, spec: 0.9, rim: 1 }), [0, 0.035, 0], 1, [0, 0, 0], g);
      mesh(cylG(0.03, 0.03, 0.004, 20), M(c, { alpha: 0.7 }), [0, 0.002, 0], 1, [0, 0, 0], g);
      break;
    case 'pot':
      mesh(sphereG(1, 20, 14), M(c, { noise: 2, rim: 0.4 }), [-0.02, 0.04, 0], [0.045, 0.038, 0.045], [0, 0, 0], g);
      mesh(cylG(0.006, 0.01, 0.05, 8), M(c), [0.03, 0.05, 0], 1, [0, 0, -0.9], g);
      mesh(cylG(0.02, 0.026, 0.01, 14), M(darken(c, 0.12)), [-0.02, 0.077, 0], 1, [0, 0, 0], g);
      mesh(sphereG(0.008, 8, 6), M(darken(c, 0.2)), [-0.02, 0.086, 0], 1, [0, 0, 0], g);
      // 따라 마실 작은 잔
      mesh(cylG(0.024, 0.018, 0.028, 16, true), M('#FFFFFF', { side: THREE.DoubleSide, rim: 0.4 }), [0.065, 0.014, 0.03], 1, [0, 0, 0], g);
      break;
    default: // mug
      mesh(cylG(0.036, 0.034, 0.065, 20, true), M(c, { side: THREE.DoubleSide, noise: it.color2 ? 3 : 1, rim: 0.4 }), [0, 0.0325, 0], 1, [0, 0, 0], g);
      mesh(cylG(0.034, 0.034, 0.004, 20), M(darken(c, 0.1)), [0, 0.002, 0], 1, [0, 0, 0], g);
      mesh(torusG(0.016, 0.005, 6, 14), M(c), [0.04, 0.034, 0], 1, [0, 0, 0], g);
      if (it.color2) for (let i = 0; i < 3; i++) mesh(torusG(0.0355, 0.0022, 4, 20), M(it.color2), [0, 0.016 + i * 0.016, 0], 1, [PI / 2, 0, 0], g);
  }
  return g;
}
function teaLiquid(it: CItem, cup?: CItem) {
  const g = G();
  if (cup?.shape === 'pot') mesh(cylG(0.021, 0.021, 0.002, 16), M(it.color, { spec: 0.7, alpha: 0.9 }), [0.065, 0.024, 0.03], 1, [0, 0, 0], g);
  else { const r = cup?.shape === 'teacup' ? 0.039 : cup?.shape === 'glass' ? 0.031 : 0.033, y = cupTop(cup) - 0.008; mesh(cylG(r, r, 0.003, 20), M(it.color, { spec: 0.7, alpha: 0.92 }), [0, y, 0], 1, [0, 0, 0], g); }
  return g;
}
function snack(it: CItem) {
  const g = G(); g.position.set(-0.075, 0, 0.04);
  mesh(cylG(0.04, 0.034, 0.006, 20), M('#FFFFFF', { rim: 0.4 }), [0, 0.003, 0], 1, [0, 0, 0], g);
  const c = it.color, y = 0.006;
  switch (it.shape) {
    case 'mochi': for (let i = 0; i < 2; i++) mesh(sphereG(1, 14, 10), M(c, { rim: 0.3 }), [(i - 0.5) * 0.026, y + 0.01, 0], [0.014, 0.011, 0.014], [0, 0, 0], g); break;
    case 'cookie': for (let i = 0; i < 3; i++) mesh(cylG(0.013, 0.013, 0.005, 14), M(c, { noise: 3 }), [(i - 1) * 0.02, y + 0.003 + i * 0.002, (i % 2) * 0.008], 1, [0.2, 0, 0], g); break;
    case 'cake': mesh(boxG(0.04, 0.025, 0.028), M(c, { noise: 2 }), [0, y + 0.0125, 0], 1, [0, 0.3, 0], g); mesh(boxG(0.04, 0.004, 0.028), M('#8A5A3B'), [0, y + 0.026, 0], 1, [0, 0.3, 0], g); break;
    case 'macaron': for (let i = 0; i < 2; i++) { const x = (i - 0.5) * 0.028; mesh(cylG(0.012, 0.012, 0.006, 14), M(i ? '#9FD8B8' : c), [x, y + 0.004, 0], 1, [0, 0, 0], g); mesh(cylG(0.011, 0.011, 0.004, 14), M('#FFF8EC'), [x, y + 0.009, 0], 1, [0, 0, 0], g); mesh(cylG(0.012, 0.012, 0.006, 14), M(i ? '#9FD8B8' : c), [x, y + 0.014, 0], 1, [0, 0, 0], g); } break;
    default: for (let i = 0; i < 3; i++) mesh(new THREE.OctahedronGeometry(1), M(c, { alpha: 0.85, spec: 0.6 }), [(i - 1) * 0.018, y + 0.008, (i % 2) * 0.01], [0.009, 0.007, 0.009], [0, i, 0], g);
  }
  return g;
}

// 과일 바구니
function basket(it: CItem) {
  const g = G(), c = it.color;
  if (it.shape === 'box') {
    for (const [x, z, w, d] of [[0, -0.05, 0.15, 0.008], [0, 0.05, 0.15, 0.008], [-0.071, 0, 0.008, 0.1], [0.071, 0, 0.008, 0.1]] as const) mesh(boxG(w, 0.05, d), M(c, { noise: 3 }), [x, 0.025, z], 1, [0, 0, 0], g);
    mesh(boxG(0.15, 0.004, 0.1), M(darken(c, 0.15)), [0, 0.002, 0], 1, [0, 0, 0], g);
  } else {
    mesh(cylG(0.075, 0.058, 0.055, 22, true), M(c, { side: THREE.DoubleSide, noise: 4 }), [0, 0.0275, 0], 1, [0, 0, 0], g);
    mesh(cylG(0.058, 0.058, 0.004, 22), M(darken(c, 0.15)), [0, 0.002, 0], 1, [0, 0, 0], g);
    for (let i = 0; i < 3; i++) mesh(torusG(0.062 + i * 0.006, 0.0025, 4, 24), M(darken(c, 0.18)), [0, 0.012 + i * 0.018, 0], 1, [PI / 2, 0, 0], g);
    mesh(torusG(0.07, 0.004, 6, 24, PI), M(darken(c, 0.1)), [0, 0.055, 0], 1, [0, 0, 0], g); // 손잡이
    if (it.color2) mesh(torusG(0.076, 0.005, 6, 24), M(it.color2), [0, 0.054, 0], 1, [PI / 2, 0, 0], g);
  }
  return g;
}
function fruits(it: CItem) {
  const g = G(), c = it.color, r = mulberry32(it.id.length * 17);
  const spots: [number, number][] = [[-0.03, -0.015], [0.028, -0.02], [0, 0.025], [-0.02, 0.03], [0.03, 0.025]];
  spots.forEach(([x, z], i) => {
    const y = 0.05 + (i > 2 ? 0.018 : 0);
    switch (it.shape) {
      case 'banana': if (i < 3) { const b = mesh(capsuleG(0.009, 0.06), M(c, { noise: 2 }), [x * 0.7, y, z * 0.5], 1, [0, 0, PI / 2 - 0.3], g); b.rotation.y = i * 0.5; } break;
      case 'grape': for (let k = 0; k < 6; k++) mesh(sphereG(0.009, 8, 6), M(k % 2 ? c : lighten(c, 0.12), { spec: 0.4 }), [x + (k % 3 - 1) * 0.009, y + (Math.floor(k / 3)) * 0.01, z + (r() - 0.5) * 0.008], 1, [0, 0, 0], g); break;
      case 'watermelon': if (i < 3) { const w = G(); w.position.set(x, y, z); w.rotation.set(0, r() * 3, 0); g.add(w); mesh(cylG(0.026, 0.026, 0.012, 16, false), M(c), [0, 0, 0], 1, [PI / 2, 0, 0], w); mesh(torusG(0.026, 0.003, 5, 16), M(it.color2 ?? '#47AE7A'), [0, 0, 0], 1, [0, 0, 0], w); } break;
      default: {
        mesh(sphereG(1, 14, 10), M(c, { noise: 2, spec: 0.4 }), [x, y, z], it.shape === 'persimmon' ? [0.02, 0.016, 0.02] : 0.019, [0, 0, 0], g);
        if (it.shape === 'apple') mesh(cylG(0.0015, 0.0015, 0.012, 4), M('#6E4A30'), [x, y + 0.022, z], 1, [0, 0, 0.3], g);
        if (it.shape === 'persimmon') mesh(cylG(0.009, 0.009, 0.003, 4), M('#5FA057'), [x, y + 0.017, z], 1, [0, 0.5, 0], g);
        if (it.shape === 'orange') mesh(sphereG(1, 6, 4), M('#5FA057'), [x + 0.005, y + 0.018, z], [0.007, 0.002, 0.004], [0, 0, 0], g);
      }
    }
  });
  return g;
}
function fruitDeco(it: CItem) {
  const g = G(), c = it.color;
  switch (it.shape) {
    case 'cloth': mesh(boxG(0.07, 0.003, 0.07), M(c), [0.07, 0.04, 0.04], 1, [0.3, 0.6, 0.5], g); break;
    case 'note': case 'card': {
      const cd = G(); cd.position.set(0.04, 0.085, 0.03); cd.rotation.set(-0.2, -0.3, 0.1); g.add(cd);
      mesh(boxG(0.05, 0.035, 0.002), M(c), [0, 0, 0], 1, [0, 0, 0], cd);
      mesh(cylG(0.0015, 0.0015, 0.05, 4), M('#8A5E3C'), [0, -0.035, -0.002], 1, [0, 0, 0], cd);
      if (it.shape === 'card') mesh(sphereG(1, 8, 6), M('#E3645A'), [0, 0, 0.002], [0.008, 0.007, 0.002], [0, 0, 0], cd);
      else for (let i = 0; i < 2; i++) mesh(boxG(0.03, 0.002, 0.001), M('#8A5E3C'), [0, 0.006 - i * 0.01, 0.0015], 1, [0, 0, 0], cd);
      break;
    }
    case 'sprig': { const s = G(); s.position.set(-0.05, 0.05, 0.02); s.rotation.z = 0.5; g.add(s); mesh(cylG(0.0015, 0.0015, 0.08, 4), M('#6FA35E'), [0, 0.04, 0], 1, [0, 0, 0], s); for (let i = 0; i < 7; i++) mesh(sphereG(0.005, 6, 4), M(i % 2 ? c : lighten(c, 0.15)), [0, 0.05 + i * 0.006, 0], 1, [0, 0, 0], s); break; }
    case 'smile': { const s = G(); s.position.set(0, 0.03, 0.076); g.add(s); mesh(cylG(0.016, 0.016, 0.002, 18), M(c), [0, 0, 0], 1, [PI / 2, 0, 0], s); for (const sd of [-1, 1]) mesh(sphereG(0.0022, 6, 4), M('#5B3A29'), [sd * 0.005, 0.004, 0.002], 1, [0, 0, 0], s); mesh(torusG(0.006, 0.0012, 4, 10, PI), M('#5B3A29'), [0, 0, 0.002], 1, [0, 0, PI], s); break; }
    default: { // ribbon
      const b = G(); b.position.set(0, 0.11, 0); g.add(b);
      for (const sd of [-1, 1]) mesh(torusG(0.014, 0.004, 6, 14), M(c), [sd * 0.015, 0, 0], [1, 0.7, 1], [PI / 2, 0, sd * 0.6], b);
      mesh(sphereG(0.006, 8, 6), M(darken(c, 0.1)), [0, 0, 0], 1, [0, 0, 0], b);
    }
  }
  return g;
}

// 한 재료를 그 자리에 그려요 (앞 단계 재료에 따라 높이가 달라져요)
function piece(kind: MiniKind, it: CItem, p: CPicks): THREE.Group {
  const S = CRAFT[kind], [s0, s1] = S.steps.map((s) => s.id);
  const first = CITEM.get(p[s0]?.[0] ?? '');
  switch (kind) {
    case 'icecream': return it.step === s0 ? iceCup(it) : it.step === s1 ? iceScoop(it, iceTop(first)) : iceTop2(it, iceTop(first));
    case 'pencil': return it.step === s0 ? paper(it) : it.step === s1 ? pen(it) : sticker(it);
    case 'book': return it.step === s0 ? bookM(it) : it.step === s1 ? bookmark(it) : bookWrap(it);
    case 'tea': return it.step === s0 ? teaCup(it) : it.step === s1 ? teaLiquid(it, first) : snack(it);
    default: return it.step === s0 ? basket(it) : it.step === s1 ? fruits(it) : fruitDeco(it);
  }
}

// 재료 카드 그림: 그릇·찻잔·바구니는 그대로, 맛·차·과일은 받침째, 작은 것(토핑·스티커·간식·곁들임)은 크게
export function miniItemModel(it: CItem): THREE.Group {
  const kind = it.kind as MiniKind, S = CRAFT[kind], o = G();
  const [s0, s1] = S.steps.map((x) => x.id);
  const big = (g: THREE.Group, sc: number, y = 0) => { g.position.set(0, y, 0); g.scale.setScalar(sc); o.add(g); return g; };
  // 가운데에 오고 바닥이 받침 높이에 닿게 옮겨요
  const center = (g: THREE.Object3D, floor = 0) => { o.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(g), c = bb.getCenter(new THREE.Vector3()); g.position.x -= c.x; g.position.z -= c.z; g.position.y += floor - bb.min.y; };
  if (it.step === s0) { o.add(piece(kind, it, {})); o.scale.setScalar(kind === 'pencil' ? 1.45 : kind === 'book' ? 1.3 : 1.6); return o; }
  switch (kind) {
    case 'icecream':
      if (it.step === s1) { const cup = S.items.find((x) => x.step === s0 && x.shape === 'cup')!; o.add(iceCup({ ...cup, color: '#F4EFE8', name: '' })); o.add(iceScoop(it, iceTop(cup))); o.scale.setScalar(1.6); }
      else {
        // 토핑: 작은 아이스크림 한 덩이 위에 크게
        const g = G(); g.add(iceScoop({ ...it, color: '#BFE5D2', color2: undefined }, 0)); g.add(iceTop2(it, 0));
        big(g, 2.3); center(g, 0);
      }
      return o;
    case 'pencil':
      if (it.step === s1) { const g = big(pen(it), 2.2); g.position.set(0, 0.04, 0); g.rotation.set(0.25, 0.5, PI / 2); }
      else { const g = big(sticker(it), 4.2); g.rotation.x = 0.35; center(g, 0.02); }
      return o;
    case 'book':
      o.add(bookM({ ...S.items[0], color: '#EDE6DA' }));
      o.add(piece(kind, it, {}));
      o.scale.setScalar(1.3);
      return o;
    case 'tea':
      if (it.step === s1) { const mug = S.items.find((x) => x.step === s0 && x.shape === 'mug')!; o.add(teaCup({ ...mug, color: '#FFFFFF', color2: undefined })); o.add(teaLiquid(it, mug)); o.scale.setScalar(1.6); }
      else { const g = big(snack(it), 2.6); center(g, 0); }
      return o;
    default:
      if (it.step === s1) { const b = S.items.find((x) => x.step === s0 && x.shape === 'basket')!; o.add(basket({ ...b, color: '#E9DCC6', color2: undefined })); o.add(fruits(it)); o.scale.setScalar(1.6); }
      else {
        // 곁들임: 작은 바구니 옆에 크게
        const g = big(fruitDeco(it), it.shape === 'cloth' ? 2.2 : it.shape === 'smile' ? 4.4 : 2.8);
        if (it.shape === 'cloth') g.rotation.set(-0.3, 0, -0.4);
        center(g, 0.01);
      }
      return o;
  }
}

export function isMini(kind: CraftKind): kind is MiniKind { return !!CRAFT[kind].mini; }

// 조리대 위 작업 자리 (미니 가게)
export function buildMini(kind: MiniKind, content: THREE.Group, parts: Map<string, THREE.Object3D>, p: CPicks, ensure: (key: string, make: () => THREE.Object3D) => THREE.Object3D) {
  const S = CRAFT[kind];
  const first = CITEM.get(p[S.steps[0].id]?.[0] ?? '') ?? null;
  // 그릇·찻잔·바구니를 바꾸면 위에 얹힌 것도 높이를 다시 맞춰요
  S.steps.forEach((st) => {
    const it = CITEM.get(p[st.id]?.[0] ?? '');
    if (!it) return;
    ensure(`${st.id}:${it.id}:${first?.id ?? ''}`, () => { const g = piece(kind, it, p); content.add(g); return g; });
  });
  void parts;
}

// 가게 꾸밈: 선반에 놓을 작은 물건들
export function miniShelf(kind: MiniKind, o: THREE.Group) {
  const S = CRAFT[kind], rnd = mulberry32(kind.length * 31);
  const list = S.items.filter((x) => x.step === S.steps[kind === 'tea' || kind === 'icecream' || kind === 'fruit' ? 0 : 0].id);
  for (let i = 0; i < 3; i++) {
    const it = list[(i * 2) % list.length], x = -0.3 + i * 0.3;
    const g = piece(kind, it, {});
    g.position.x += x; g.position.z += (rnd() - 0.5) * 0.04;
    g.scale.multiplyScalar(kind === 'pencil' || kind === 'book' ? 0.9 : 1.3);
    if (kind === 'book') { g.rotation.set(0, 0, PI / 2); g.position.set(x, 0.07, 0); }
    if (kind === 'pencil') { g.rotation.set(-PI / 2 + 0.25, 0, 0); g.position.set(x, 0.06, 0); }
    o.add(g);
  }
}
