import * as THREE from 'three';
import { norenCanvas, plaqueCanvas, signCanvas, tex, tileCanvas, villageCanvas, wallCanvas, woodCanvas } from '../paint/textures';
import { wc } from '../render/watercolor';
import { boxG, coneG, cylG, group, M, mesh, sphereG, torusG } from './geo';
import { darken, lighten } from '../paint/brush';
import { makePot } from './food';
import { birdTex, cloudsTex, glowTex, makeGlow, makeShadow, makeSunShafts } from './fx';
import { fitTo, loadModel } from './models';
import { Noren, type Ball } from './noren';

const PI = Math.PI;

export function makeShop() {
  const root = new THREE.Group();
  const woodT = tex(woodCanvas('#C99A6B', 3, 6), true);
  const woodDark = tex(woodCanvas('#A87650', 4, 5), true);
  const floorT = tex(tileCanvas(), true);
  floorT.repeat.set(3, 3);
  const wallT = tex(wallCanvas(), true);
  wallT.repeat.set(2, 1.2);
  const fallback: Record<string, THREE.Object3D[]> = { lamp: [], stool: [], sticks: [], plant: [], shelfLow: [], clock: [] };

  // 바닥과 벽
  // 방 껍데기(바닥·벽·천장)는 광선추적에서 주 조명을 가리지 않게 표시해 둬요
  mesh(new THREE.PlaneGeometry(7, 7), wc('#FFFFFF', { map: floorT, rim: 0 }), [0, 0, 0], 1, [-PI / 2, 0, 0], root).userData.shell = true;
  const walls: THREE.Mesh[] = [];
  walls.push(mesh(new THREE.PlaneGeometry(6, 3.2), wc('#FFFFFF', { map: wallT, rim: 0, flat: 0.3 }), [0, 1.6, -1.75], 1, [0, 0, 0], root));
  for (const sd of [-1, 1]) walls.push(mesh(new THREE.PlaneGeometry(4.5, 3.2), wc('#F1DFC6', { map: wallT, rim: 0, flat: 0.3 }), [sd * 2.6, 1.6, 0.4], 1, [0, -sd * PI / 2, 0], root));
  walls.forEach((w) => { w.userData.shell = true; });
  Object.assign(mesh(new THREE.PlaneGeometry(6, 5), M('#EADBC4', { rim: 0, flat: 0.5 }), [0, 3.1, 0.2], 1, [PI / 2, 0, 0], root).userData, { shell: true, noRecv: true }); // 천장은 안 보여서 굽지 않아요
  // 천장 나무 보
  for (const z of [-1.2, -0.2, 0.8]) Object.assign(mesh(boxG(6, 0.12, 0.14), M('#9A6232'), [0, 3.04, z], 1, [0, 0, 0], root).userData, { shell: true, noRecv: true });
  // 아래 나무 벽널
  const wain = wc('#FFFFFF', { map: woodDark, rim: 0.2 });
  mesh(boxG(6, 0.9, 0.05), wain, [0, 0.45, -1.72], 1, [0, 0, 0], root);
  mesh(boxG(6, 0.06, 0.09), M('#8A5A3B'), [0, 0.92, -1.7], 1, [0, 0, 0], root);

  // 창문 (마을 그림 + 흘러가는 구름 + 새). 오른쪽 벽시계와 겹치지 않게 조금 왼쪽에 둬요
  const village = tex(villageCanvas());
  const todViews: Partial<Record<'day' | 'dusk' | 'night', THREE.Texture>> = { day: village };
  const win = group(root, [-0.28, 1.78, -1.72]);
  const winView = mesh(new THREE.PlaneGeometry(1.9, 0.95), wc('#FFFFFF', { map: village, rim: 0, flat: 0.85 }), [0, 0, 0.01], 1, [0, 0, 0], win);
  const cloudT = cloudsTex(); cloudT.wrapS = THREE.RepeatWrapping; cloudT.repeat.set(1, 1);
  const clouds = mesh(new THREE.PlaneGeometry(1.9, 0.46), new THREE.MeshBasicMaterial({ map: cloudT, transparent: true, depthWrite: false, opacity: 0.9 }), [0, 0.24, 0.016], 1, [0, 0, 0], win);
  clouds.renderOrder = 1;
  const birds: THREE.Sprite[] = [];
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Sprite(new THREE.SpriteMaterial({ map: birdTex(), transparent: true, depthWrite: false, opacity: 0 }));
    b.scale.set(0.06, 0.03, 1); b.position.set(-0.9, 0.3, 0.02); b.userData.t = -2 - i * 5;
    b.renderOrder = 2;
    win.add(b); birds.push(b);
  }
  const frame = M('#9A6232');
  for (const [x, y, w, h] of [[0, 0.5, 2.02, 0.07], [0, -0.5, 2.02, 0.07], [-0.98, 0, 0.07, 1.06], [0.98, 0, 0.07, 1.06], [0, 0, 0.04, 0.95], [0, 0, 1.9, 0.035]] as const)
    mesh(boxG(w, h, 0.08), frame, [x, y, 0.04], 1, [0, 0, 0], win);
  mesh(boxG(2.1, 0.06, 0.18), frame, [0, -0.54, 0.09], 1, [0, 0, 0], win);
  // 창가 화분
  for (const x of [-0.7, 0.72]) {
    mesh(cylG(0.07, 0.055, 0.1, 14), M('#E07A5F'), [x, -0.46, 0.1], 1, [0, 0, 0], win);
    for (let i = 0; i < 5; i++) mesh(sphereG(1, 10, 8), M(i % 2 ? '#7DB86A' : '#93C47D'), [x + Math.cos(i * 1.3) * 0.05, -0.36 + (i % 3) * 0.03, 0.1 + Math.sin(i * 1.3) * 0.04], [0.05, 0.07, 0.04], [0, 0, Math.cos(i) * 0.5], win);
  }

  // 간판
  const sign = mesh(new THREE.PlaneGeometry(1.5, 0.47), wc('#FFFFFF', { map: tex(signCanvas()), rim: 0, flat: 0.6 }), [-0.15, 2.6, -1.7], 1, [0, 0, 0], root);
  sign.renderOrder = 1;
  // 차림표 나무패
  const plaques = ['토닥 라면', '용기 라면', '웃음 라면', '꿀잠 라면'];
  const plaqueMeshes: THREE.Mesh[] = [];
  plaques.forEach((t, i) => {
    const p = mesh(new THREE.PlaneGeometry(0.5, 0.16), wc('#FFFFFF', { map: tex(plaqueCanvas(t)), rim: 0, flat: 0.6 }), [-2.58, 2.25 - i * 0.22, -0.9 + (i % 2) * 0.05], 1, [0, PI / 2, 0], root);
    p.renderOrder = 1;
    plaqueMeshes.push(p);
  });

  // 문: 오른쪽 경첩에 달려 가게 안쪽 오른편으로 열려요 (손님이 지나가는 왼쪽 길을 막지 않게). 문 뒤에는 바깥 골목 그림
  const doorX = 1.75;
  const outside = mesh(new THREE.PlaneGeometry(0.9, 2.15), wc('#FFFFFF', { map: village, rim: 0, flat: 0.9 }), [doorX, 1.08, -1.745], 1, [0, 0, 0], root);
  (outside.material as THREE.ShaderMaterial).uniforms.uColor.value.set('#FFF6E0');
  for (const [x, y, w, h] of [[doorX - 0.5, 1.12, 0.08, 2.24], [doorX + 0.5, 1.12, 0.08, 2.24], [doorX, 2.27, 1.08, 0.08]] as const) mesh(boxG(w, h, 0.1), M('#9A6232'), [x, y, -1.7], 1, [0, 0, 0], root);
  const hinge = group(root, [doorX + 0.455, 0, -1.7]);
  const leaf = group(hinge, [-0.455, 0, 0]);
  leaf.userData.noBake = true; // 여닫는 문
  mesh(boxG(0.91, 2.18, 0.05), M('#B5793F', { noise: 1.5 }), [0, 1.09, 0], 1, [0, 0, 0], leaf);
  mesh(boxG(0.72, 0.85, 0.06), M('#DDEFFA', { flat: 0.6, rim: 0, spec: 0.3 }), [0, 1.55, 0.01], 1, [0, 0, 0], leaf);
  for (const x of [-0.12, 0.12]) mesh(boxG(0.03, 0.85, 0.07), M('#9A6232'), [x, 1.55, 0.01], 1, [0, 0, 0], leaf);
  // 손잡이: 손님(키가 작은 동물들)이 손을 뻗어 잡을 수 있는 높이
  const knob = mesh(sphereG(0.04), M('#E7B84E', { spec: 0.7 }), [-0.36, 0.88, 0.05], 1, [0, 0, 0], leaf);
  // 문 위 천(노렌): 진짜 천처럼 매달려 흔들려요. 문짝이 열리면서 밀고, 문이 열릴 때 들어오는 바람에 펄럭여요
  const norenMat = wc('#FFFFFF', { map: tex(norenCanvas()), rim: 0, side: THREE.DoubleSide, transparent: true });
  const noren = new Noren(norenMat, new THREE.Vector3(doorX, 1.95, -1.58), 1.0, 0.65, -1.64);
  noren.meshes.forEach((m) => { m.userData.noBake = true; root.add(m); });
  mesh(cylG(0.015, 0.015, 1.1, 8), M('#8A5A3B'), [doorX, 2.28, -1.58], 1, [0, 0, PI / 2], root);
  // 종은 천 왼쪽 끝 바깥에 달아요 (천이 펄럭이다 종에 걸리지 않게)
  const bell = group(root, [doorX - 0.58, 2.25, -1.52]);
  mesh(cylG(0.004, 0.004, 0.12, 4), M('#5A3A28'), [0, -0.06, 0], 1, [0, 0, 0], bell);
  mesh(sphereG(0.05, 16, 12), M('#F4C842', { rim: 1.2, spec: 0.8 }), [0, -0.15, 0], [1, 1.1, 1], [0, 0, 0], bell);
  let doorOpen = 0, doorTarget = 0;
  // 천이 피해 가는 것들: 문 위 종 (손님 머리는 무대가 알려 줘요)
  const bellBall: Ball = { c: new THREE.Vector3(doorX - 0.58, 2.1, -1.52), r: 0.06 };
  const leafInfo = { hinge: new THREE.Vector3(), angle: 0, w: 0.91, h: 2.18, t: 0.045 };

  // 왼쪽 선반과 병들
  const shelf = group(root, [-1.85, 0, -1.6]);
  const shelfRows: THREE.Group[] = [];
  for (const y of [1.45, 1.95]) {
    const row = group(shelf);
    row.userData.y = y;
    shelfRows.push(row);
    mesh(boxG(0.9, 0.04, 0.25), M('#9A6232'), [0, y, 0], 1, [0, 0, 0], row);
    const cols = ['#F2A7B8', '#F4C842', '#8EC5E8', '#A8D08D', '#F5A65B'];
    for (let i = 0; i < 4; i++) {
      const c = cols[(i + (y > 1.6 ? 2 : 0)) % cols.length];
      mesh(cylG(0.07, 0.07, 0.2, 14), M('#F3F6F4', { alpha: 0.5, rim: 1.4, spec: 0.6 }), [-0.32 + i * 0.21, y + 0.12, 0], 1, [0, 0, 0], row);
      mesh(cylG(0.062, 0.062, 0.12, 14), M(c), [-0.32 + i * 0.21, y + 0.08, 0], 1, [0, 0, 0], row);
      mesh(cylG(0.075, 0.075, 0.04, 14), M('#C2560E'), [-0.32 + i * 0.21, y + 0.24, 0], 1, [0, 0, 0], row);
    }
    if (y < 1.6) fallback.shelfLow.push(row);
  }

  // 손님 쪽 긴 계산대
  const counterT = wc('#FFFFFF', { map: woodT, rim: 0.3, spec: 0.12 });
  woodT.repeat.set(2, 0.5);
  mesh(boxG(3.0, 0.07, 0.68), counterT, [0, 1.0, 0], 1, [0, 0, 0], root);
  mesh(boxG(2.9, 0.95, 0.55), M('#B98457', { noise: 1.5 }), [0, 0.5, -0.02], 1, [0, 0, 0], root);
  mesh(boxG(3.02, 0.05, 0.7), M(darken('#C99A6B', 0.25)), [0, 0.955, 0], 1, [0, 0, 0], root);
  // 계산대 위 물건
  const napkin = group(root, [-1.05, 1.035, 0.08]);
  mesh(boxG(0.16, 0.1, 0.1), M('#E07A5F'), [0, 0.05, 0], 1, [0, 0.2, 0], napkin);
  mesh(boxG(0.12, 0.05, 0.005), M('#FFFFFF'), [0, 0.12, 0], 1, [0, 0.2, 0], napkin);
  napkin.add(makeShadow(0.26, 0.2, 0.45));
  const sticks = group(root, [1.2, 1.035, 0.0]);
  mesh(cylG(0.05, 0.045, 0.14, 14), M('#6FB3E0'), [0, 0.07, 0], 1, [0, 0, 0], sticks);
  for (let i = 0; i < 6; i++) mesh(cylG(0.006, 0.004, 0.24, 5), M('#D9A866'), [Math.cos(i) * 0.02, 0.17, Math.sin(i) * 0.02], 1, [Math.sin(i) * 0.1, 0, Math.cos(i) * 0.1], sticks);
  sticks.add(makeShadow(0.16, 0.16, 0.45));
  fallback.sticks.push(sticks);
  const plant = group(root, [-1.32, 1.035, -0.18]);
  mesh(cylG(0.08, 0.06, 0.12, 14), M('#F4C842'), [0, 0.06, 0], 1, [0, 0, 0], plant);
  for (let i = 0; i < 7; i++) mesh(sphereG(1, 10, 8), M(i % 2 ? '#7DB86A' : '#5FA65A'), [Math.cos(i * 0.9) * 0.05, 0.16 + (i % 3) * 0.05, Math.sin(i * 0.9) * 0.05], [0.04, 0.09, 0.03], [Math.sin(i) * 0.6, i, Math.cos(i) * 0.6], plant);
  plant.add(makeShadow(0.24, 0.24, 0.45));
  fallback.plant.push(plant);

  // 손님 의자
  const stoolX = [-0.42, 0.42, 1.25, -1.25];
  for (const x of stoolX) {
    const st = group(root, [x, 0, -0.68]);
    mesh(cylG(0.2, 0.2, 0.06, 20), M('#E07A5F'), [0, 0.56, 0], 1, [0, 0, 0], st);
    mesh(cylG(0.03, 0.04, 0.54, 8), M('#8A5A3B'), [0, 0.27, 0], 1, [0, 0, 0], st);
    mesh(torusG(0.14, 0.015, 6, 20), M('#8A5A3B'), [0, 0.2, 0], 1, [PI / 2, 0, 0], st);
    fallback.stool.push(st);
  }

  // 사장님 쪽 조리대와 가스레인지
  mesh(boxG(2.6, 0.06, 0.62), M('#E9DCC8', { noise: 1.5, spec: 0.1 }), [0, 0.86, 0.72], 1, [0, 0, 0], root);
  mesh(boxG(2.5, 0.84, 0.58), M('#D9C4A5'), [0, 0.42, 0.72], 1, [0, 0, 0], root);
  const stove = group(root, [0, 0.89, 0.66]);
  mesh(boxG(0.62, 0.05, 0.48), M('#5D6B78', { rim: 0.4, spec: 0.3 }), [0, 0.0, 0], 1, [0, 0, 0], stove);
  mesh(torusG(0.12, 0.015, 6, 24), M('#2F3740'), [0, 0.03, 0], 1, [PI / 2, 0, 0], stove);
  for (let i = 0; i < 4; i++) mesh(boxG(0.3, 0.015, 0.02), M('#2F3740'), [0, 0.04, 0], 1, [0, i * PI / 4, 0], stove);
  for (const x of [-0.22, 0.22]) mesh(cylG(0.025, 0.025, 0.03, 12), M('#E07A5F'), [x, 0.0, 0.24], 1, [PI / 2, 0, 0], stove);
  const flames = group(stove, [0, 0.04, 0]);
  flames.userData.noBake = true;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * PI * 2;
    const f = mesh(coneG(0.018, 0.055, 6), M('#6FB3E0', { alpha: 0.85, rim: 0, flat: 0.8 }), [Math.cos(a) * 0.11, 0.028, Math.sin(a) * 0.11], 1, [0, 0, 0], flames);
    f.userData.phase = i;
  }
  const flameGlow = makeGlow('#7FC4FF', 0.5, 0.35);
  flameGlow.position.y = 0.04;
  flames.add(flameGlow);
  flames.visible = false;
  const pot = makePot();
  pot.position.set(0, 0.93, 0.66);
  root.add(pot);
  // 조리대 위 재료 바구니들
  for (const [x, col] of [[0.6, '#E2653E'], [0.9, '#F6CF3E']] as const) {
    const b = group(root, [x, 0.89, 0.7]);
    mesh(cylG(0.11, 0.09, 0.08, 16, true), M('#D9A866', { side: THREE.DoubleSide, noise: 3 }), [0, 0.04, 0], 1, [0, 0, 0], b);
    for (let i = 0; i < 6; i++) mesh(sphereG(0.035, 10, 8), M(i % 2 ? col : lighten(col, 0.2)), [Math.cos(i) * 0.05, 0.07, Math.sin(i) * 0.05], 1, [0, 0, 0], b);
    b.add(makeShadow(0.3, 0.3, 0.4));
  }

  // 천장 등과 불빛
  const lamps: THREE.Mesh[] = [];
  const pools: THREE.Mesh[] = [], lampGlows: THREE.Sprite[] = [];
  const lampPivots: THREE.Group[] = [];
  for (const x of [-0.75, 0.75]) {
    const pv = group(root, [x, 3.04, -0.1]);
    // 흔들리는 등은 조명 굽기에서 빼요. 넣으면 흔들린 만큼 지문이 달라져서 저장본을 한 번도 못 써요
    pv.userData.noBake = true;
    lampPivots.push(pv);
    const l = group(pv, [0, -0.59, 0]);
    mesh(cylG(0.006, 0.006, 0.6, 4), M('#5A3A28'), [0, 0.35, 0], 1, [0, 0, 0], l);
    const shade = mesh(coneG(0.22, 0.2, 20), M('#E07A5F', { side: THREE.DoubleSide }), [0, 0, 0], [1, 1, 1], [0, 0, 0], l);
    const bulb = mesh(sphereG(0.07), wc('#FFF4C4', { flat: 1, rim: 0 }), [0, -0.09, 0], 1, [0, 0, 0], l);
    (bulb.material as THREE.ShaderMaterial).uniforms.uGlow.value = 0.6;
    lamps.push(bulb);
    fallback.lamp.push(shade, bulb);
    const glow = makeGlow('#FFD98A', 1.1, 0.42);
    glow.position.y = -0.12;
    l.add(glow);
    const pool = mesh(new THREE.PlaneGeometry(1.1, 0.75), new THREE.MeshBasicMaterial({ map: glowTex(), color: '#FFDFA0', transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending }), [x, 1.037, -0.05], 1, [-PI / 2, 0, 0], root);
    pools.push(pool); lampGlows.push(glow);
    pool.renderOrder = 2;
  }

  // 벽시계 (진짜 시각): 창문과 문 사이 벽
  const clockPos = new THREE.Vector3(0.97, 2.0, -1.709);
  const CLOCK_S = 0.8;
  const fbClock = group(root, [clockPos.x, clockPos.y, -1.73]);
  fbClock.scale.setScalar(CLOCK_S);
  fbClock.userData.noBake = true;
  mesh(cylG(0.19, 0.19, 0.05, 32), M('#9A6232'), [0, 0, 0], 1, [PI / 2, 0, 0], fbClock);
  mesh(cylG(0.16, 0.16, 0.052, 32), M('#FFF8EC', { flat: 0.4 }), [0, 0, 0.002], 1, [PI / 2, 0, 0], fbClock);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * PI * 2; mesh(boxG(0.012, i % 3 ? 0.02 : 0.035, 0.005), M('#5A3A28'), [Math.sin(a) * 0.13, Math.cos(a) * 0.13, 0.03], 1, [0, 0, -a], fbClock); }
  const hourHand = group(fbClock, [0, 0, 0.034]);
  mesh(boxG(0.014, 0.08, 0.006), M('#3A2A22'), [0, 0.04, 0], 1, [0, 0, 0], hourHand);
  const minHand = group(fbClock, [0, 0, 0.04]);
  mesh(boxG(0.01, 0.12, 0.006), M('#C2560E'), [0, 0.06, 0], 1, [0, 0, 0], minHand);
  fallback.clock.push(fbClock);
  let clockHands: { hour: THREE.Object3D; min: THREE.Object3D; baseH: number; baseM: number } = { hour: hourHand, min: minHand, baseH: 0, baseM: 0 };

  // 창으로 들어오는 빛
  const sun = makeSunShafts();
  root.add(sun.group);

  let t = 0;
  const shop = {
    root, bell, flames, pot, lamps, leaf,
    // 시간대(수업용): 창밖·문밖 그림, 구름과 새, 햇살, 등불 밝기를 바꿔요. 낮은 처음 모습 그대로예요
    setTod(tod: 'day' | 'dusk' | 'night') {
      const views = todViews;
      if (!views[tod]) views[tod] = tex(villageCanvas(tod));
      for (const m of [winView, outside]) ((m.material as THREE.ShaderMaterial).uniforms.uMap.value = views[tod]);
      const cm = clouds.material as THREE.MeshBasicMaterial;
      cm.opacity = tod === 'day' ? 0.9 : tod === 'dusk' ? 0.75 : 0.16; cm.color.set(tod === 'day' ? '#FFFFFF' : tod === 'dusk' ? '#FFD2B4' : '#8A93C8');
      birds.forEach((b) => { b.visible = tod !== 'night'; });
      sun.group.visible = tod !== 'night';
      sun.group.children.forEach((c) => { const m = (c as THREE.Mesh).material as THREE.MeshBasicMaterial; if ((c as THREE.Mesh).isMesh) { m.opacity = tod === 'dusk' ? 0.22 : 0.16; m.color.set(tod === 'dusk' ? '#FFB27A' : '#FFE8B0'); } });
      lamps.forEach((l) => { (l.material as THREE.ShaderMaterial).uniforms.uGlow.value = tod === 'day' ? 0.6 : tod === 'dusk' ? 0.8 : 1.1; });
      pools.forEach((pl) => { (pl.material as THREE.MeshBasicMaterial).opacity = tod === 'day' ? 0.2 : tod === 'dusk' ? 0.26 : 0.38; });
      lampGlows.forEach((gl) => { gl.material.opacity = tod === 'day' ? 0.42 : tod === 'dusk' ? 0.5 : 0.62; });
    },
    // 가게 봐 주기에서 빵집·꽃집으로 살짝 바꿔 꾸밀 것들
    theme: { sign, norenMat, plaques: plaqueMeshes, walls, shelf, shelfRows },
    // 드나드는 길은 문 가운데. 문짝은 활짝(100도쯤) 열려서 길을 비켜요
    doorPos: new THREE.Vector3(doorX, 0, -1.25),
    doorOut: new THREE.Vector3(doorX, 0, -2.2),
    seat: (i: number, n: number) => new THREE.Vector3(n === 1 ? 0 : (i ? 0.42 : -0.42), 0.56, -0.68),
    openDoor(v: boolean) { doorTarget = v ? 1 : 0; if (v) noren.puff(); },
    // 손님이 손잡이를 당기는 동안: 문 열린 정도(0~1)를 직접 정해요
    holdDoor(k: number) { doorOpen = doorTarget = k; },
    knobWorld: (out = new THREE.Vector3()) => knob.getWorldPosition(out),
    doorAngle: () => hinge.rotation.y,
    update(dt: number, heads: Ball[] = [], cloth = true) {
      t += dt;
      cloudT.offset.x = (cloudT.offset.x + dt * 0.006) % 1;
      for (const b of birds) {
        b.userData.t += dt;
        const k = b.userData.t / 6;
        const mat = b.material as THREE.SpriteMaterial;
        if (k > 0 && k < 1) {
          b.position.set(-0.88 + k * 1.76, 0.12 + Math.sin(k * 7 + birds.indexOf(b)) * 0.04 + birds.indexOf(b) * 0.06, 0.02);
          b.scale.set(0.06, 0.03 * (0.6 + Math.abs(Math.sin(t * 12 + birds.indexOf(b))) * 0.6), 1);
          mat.opacity = Math.min(1, Math.min(k, 1 - k) * 8) * 0.85;
        } else mat.opacity = 0;
        if (k > 1.8 + birds.indexOf(b)) b.userData.t = -Math.random() * 4;
      }
      lampPivots.forEach((p, i) => { p.rotation.z = Math.sin(t * 0.6 + i * 1.7) * 0.015; p.rotation.x = Math.sin(t * 0.45 + i) * 0.01; });
      const now = new Date();
      const mins = now.getMinutes() + now.getSeconds() / 60, hrs = (now.getHours() % 12) + mins / 60;
      clockHands.min.rotation.z = clockHands.baseM - (mins / 60) * PI * 2;
      clockHands.hour.rotation.z = clockHands.baseH - (hrs / 12) * PI * 2;
      // 열 때는 조금 천천히 (위에 걸린 천이 밀리며 따라올 시간), 닫을 때는 원래대로
      doorOpen += (doorTarget - doorOpen) * Math.min(1, dt * (doorTarget > doorOpen ? 3 : 4));
      hinge.rotation.y = 1.75 * doorOpen;
      leafInfo.hinge.copy(hinge.position); leafInfo.angle = hinge.rotation.y;
      // 천은 보일 때와 문이 움직일 때만 흔들어요 (냄비만 보는 동안은 쉬어요)
      if (cloth || doorTarget > 0 || doorOpen > 0.001) noren.update(dt, leafInfo, [bellBall, ...heads]);
      sun.update(dt);
    },
    // 무료 3D 모델이 오면 직접 그린 소품과 바꿔 끼워요
    async loadModels() {
      const hide = (k: string) => fallback[k].forEach((o) => { o.visible = false; });
      const tasks: Promise<void>[] = [];
      tasks.push(loadModel('lantern').then((m) => {
        if (!m) return;
        hide('lamp');
        // 종이 부분은 안에서 불이 켜진 것처럼 따뜻하게 빛나요
        m.scene.traverse((c) => {
          const mm = c as THREE.Mesh;
          if (!mm.isMesh || !/cream/.test(mm.name)) return;
          const u = (mm.material as THREE.ShaderMaterial).uniforms;
          u.uColor.value.set('#FFF1D6'); u.uGlow.value = 0.65; u.uGlowColor.value.set('#FFC877');
        });
        lampPivots.forEach((pv) => {
          const o = m.scene.clone(true);
          fitTo(o, { h: 0.5 });
          o.position.set(0, -0.5, 0);
          pv.children[0].add(o);
          const lg = makeGlow('#FFC877', 1.3, 0.5); lg.position.set(0, -0.26, 0); pv.children[0].add(lg);
        });
      }));
      tasks.push(loadModel('clock').then((m) => {
        if (!m) return;
        hide('clock');
        const o = m.scene;
        o.position.copy(clockPos);
        o.scale.multiplyScalar(CLOCK_S);
        o.userData.noBake = true; // 유리 덮개가 시계 얼굴을 가린 것으로 계산돼서 굽지 않아요
        root.add(o);
        const hr = o.getObjectByName('clock-hand-hour'), mn = o.getObjectByName('clock-hand-minute');
        if (hr && mn) clockHands = { hour: hr, min: mn, baseH: hr.rotation.z, baseM: mn.rotation.z };
      }));
      tasks.push(loadModel('crockery').then((m) => {
        if (!m) return;
        hide('shelfLow');
        const o = m.scene; fitTo(o, { h: 1.5 });
        o.position.set(-1.8, 0, -1.52);
        root.add(o);
      }));
      tasks.push(loadModel('stool').then((m) => {
        if (!m) return;
        hide('stool');
        for (const x of stoolX) {
          const o = m.scene.clone(true); fitTo(o, { h: 0.59 });
          o.position.set(x, 0, -0.68);
          root.add(o);
        }
      }));
      tasks.push(loadModel('caddy').then((m) => {
        if (!m) return;
        hide('sticks');
        const o = m.scene; fitTo(o, { w: 0.3 });
        o.position.set(1.12, 1.035, -0.02); o.rotation.y = -0.25;
        o.add(makeShadow(0.5, 0.3, 0.45));
        root.add(o);
      }));
      tasks.push(loadModel('onggi').then((m) => {
        if (!m) return;
        // 옹기는 짙은 갈색에 윤이 나게
        m.scene.traverse((c) => {
          const mm = c as THREE.Mesh;
          if (!mm.isMesh) return;
          const u = (mm.material as THREE.ShaderMaterial).uniforms;
          u.uColor.value.set('#7A4E33'); u.uSpec.value = 0.45;
        });
        for (const [x, z, h] of [[-1.12, 0.86, 0.18], [1.12, 0.88, 0.16], [1.0, 0.6, 0.12]] as const) {
          const o = m.scene.clone(true); fitTo(o, { h });
          o.position.set(x, 0.89, z); o.rotation.y = x;
          root.add(o);
          const sh = makeShadow(h * 1.4, h * 1.4, 0.4); sh.position.set(x, 0.891, z); root.add(sh);
        }
      }));
      await Promise.all(tasks);
    },
  };
  return shop;
}
export type Shop = ReturnType<typeof makeShop>;

// 사장님(나) 앞발 — 카메라에 붙어 있어요
export function makePaws() {
  const g = new THREE.Group();
  const fur = '#F3DFC1', pad = '#E9A0A8', sleeve = '#C2560E';
  const make = (sd: number) => {
    const a = group(g, [sd * 0.26, -0.3, -0.62]);
    mesh(cylG(0.055, 0.065, 0.32, 14), M(sleeve), [0, -0.12, 0.08], 1, [0.9, 0, 0], a);
    mesh(torusG(0.055, 0.02, 8, 18), M('#FFF4E6'), [0, -0.02, -0.04], 1, [0.9 + PI / 2, 0, 0], a);
    mesh(sphereG(1), M(fur), [0, 0.02, -0.1], [0.075, 0.065, 0.085], [0, 0, 0], a);
    for (let i = -1; i <= 1; i++) mesh(sphereG(1), M(fur), [i * 0.035, 0.035, -0.16], [0.025, 0.025, 0.028], [0, 0, 0], a);
    mesh(sphereG(1), M(pad, { rim: 0.2 }), [0, -0.03, -0.12], [0.035, 0.012, 0.03], [0, 0, 0], a);
    a.userData.base = a.position.clone();
    return a;
  };
  const L = make(-1), R = make(1);
  return { group: g, L, R };
}

export function makeSteam(steamTex: THREE.Texture, n = 7) {
  const g = new THREE.Group();
  const puffs: THREE.Sprite[] = [];
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: steamTex, transparent: true, depthWrite: false, opacity: 0 }));
    s.userData.t = i / n;
    s.renderOrder = 5;
    g.add(s);
    puffs.push(s);
  }
  let strength = 0;
  return {
    group: g,
    set: (v: number) => { strength = v; },
    update(dt: number, spread = 0.12, height = 0.45) {
      for (const p of puffs) {
        p.userData.t = (p.userData.t + dt * 0.35) % 1;
        const t = p.userData.t;
        const seed = puffs.indexOf(p) * 1.7;
        p.position.set(Math.sin(seed + t * 3) * spread * (0.4 + t), t * height, Math.cos(seed * 1.3 + t * 2) * spread * 0.5);
        const sc = 0.12 + t * 0.22;
        p.scale.set(sc, sc, sc);
        (p.material as THREE.SpriteMaterial).opacity = Math.sin(t * PI) * 0.55 * strength;
      }
    },
  };
}
