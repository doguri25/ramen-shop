import * as THREE from 'three';
import type { ChibiSpec } from '../data/types';
import { darken, lighten } from '../paint/brush';
import { EYES, faceAtlas, MOUTH, tex } from '../paint/textures';
import { boxG, capsuleG, coneG, cylG, group, M, mesh, shellG, sphereG, torusG, tube } from './geo';

export const HR = 0.34; // 머리 반지름
const PI = Math.PI;
const FRONT = PI / 2;
const INK = '#3A2A22';

export type Mood = 'neutral' | 'happy' | 'sad' | 'worried' | 'angry' | 'delight' | 'eat' | 'surprised';
const MOODS: Record<Mood, [number, number]> = {
  neutral: [EYES.neutral, MOUTH.smile],
  happy: [EYES.happy, MOUTH.grin],
  sad: [EYES.sad, MOUTH.frown],
  worried: [EYES.worried, MOUTH.wavy],
  angry: [EYES.angry, MOUTH.frown],
  delight: [EYES.sparkle, MOUTH.grin],
  eat: [EYES.content, MOUTH.chew],
  surprised: [EYES.sparkle, MOUTH.oh],
};

let faceTex: THREE.Texture | null = null;
export const setFaceTexture = (t: THREE.Texture) => { faceTex = t; };
const patchTex = new Map<string, THREE.Texture>();
function atlasFor(patch: string) {
  if (!patch) return faceTex!;
  let t = patchTex.get(patch);
  if (!t) { t = tex(faceAtlas('#F29BA6', patch)); patchTex.set(patch, t); }
  return t;
}

function cellTex(eye: boolean, patch = '') {
  const t = atlasFor(eye ? patch : '').clone();
  t.repeat.set(eye ? 0.25 : 0.125, 0.25);
  t.needsUpdate = true;
  return t;
}
function setCell(t: THREE.Texture, eye: boolean, i: number) {
  if (eye) t.offset.set((i % 4) * 0.25, 0.75 - Math.floor(i / 4) * 0.25);
  else t.offset.set((i % 8) * 0.125, 0.25 - Math.floor(i / 8) * 0.25);
}

export type Act = 'idle' | 'talk' | 'wave' | 'bow' | 'cheer' | 'clap' | 'scratch' | 'think' | 'fist' | 'worry' | 'sad' | 'full' | 'nod' | 'thumbs';
interface Arm { side: number; shoulder: THREE.Vector3; upper: THREE.Mesh; joint: THREE.Mesh; cuff: THREE.Mesh; hand: THREE.Group; cur: THREE.Vector3; target: THREE.Vector3; aim: THREE.Vector3 | null; aimCur: THREE.Vector3 }
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
export const LEG = 0.14; // 서 있을 때 몸을 들어 올리는 높이

export class Chibi {
  root = new THREE.Group();
  body = new THREE.Group();
  headPivot = new THREE.Group();
  head = new THREE.Group();
  arms: Arm[] = [];
  legs: THREE.Group[] = [];
  chop = new THREE.Group();
  shadow: THREE.Mesh | null = null;
  seated = false;
  walking = 0;
  manual = false;
  act: Act = 'idle';
  private actT = 0;
  lean = 0;
  headExtra = new THREE.Euler();
  look: THREE.Vector3 | null = null;
  chewing = false;
  private walkPhase = 0;
  tail: THREE.Object3D | null = null;
  beak: THREE.Object3D | null = null;
  trunk: THREE.Object3D | null = null;
  eyeTex: THREE.Texture;
  mouthTex: THREE.Texture | null = null;
  mood: Mood = 'neutral';
  talking = false;
  private blinkT = 2 + Math.random() * 2;
  private talkT = 0;
  private t = Math.random() * 10;
  bounce = 0;     // 기뻐서 통통 튀기
  droop = 0;      // 시무룩하게 고개 숙이기
  nod = 0;

  constructor(public spec: ChibiSpec) {
    const s = spec;
    const fur = s.fur, fur2 = s.fur2 ?? lighten(fur, 0.5), mark = s.mark ?? darken(fur, 0.3);
    this.root.add(this.body);
    const sc = s.scale ?? 1;
    this.root.scale.setScalar(sc);

    // 몸통 (옷)
    const bw = s.belly ?? 1;
    mesh(sphereG(1, 28, 20), M(s.cloth, { noise: 1.6 }), [0, 0.3, 0], [0.3 * bw, 0.33, 0.27 * Math.min(1.15, bw)], [0, 0, 0], this.body);
    // 옷깃과 단추
    mesh(torusG(0.16, 0.035, 8, 20), M(lighten(s.cloth, 0.45)), [0, 0.6, 0.02], 1, [PI / 2, 0, 0], this.body);
    for (let i = 0; i < 2; i++) mesh(sphereG(0.022, 10, 8), M(darken(s.cloth, 0.3), { spec: 0.5 }), [0, 0.46 - i * 0.12, 0.262 * Math.min(1.15, bw) - i * 0.012], [1, 1, 0.5], [0, 0, 0], this.body);
    // 다리와 발
    const shoe = s.kind === 'human' ? '#6B4A3A' : darken(fur, 0.12);
    for (const sd of [-1, 1]) {
      const hip = group(this.body, [sd * 0.11, 0.06, 0.02]);
      mesh(capsuleG(0.07, 0.08), M(darken(s.cloth, 0.12)), [0, -0.06, 0], 1, [0, 0, 0], hip);
      mesh(sphereG(1, 16, 12), M(shoe, { spec: s.kind === 'human' ? 0.3 : 0 }), [0, -0.15, 0.04], [0.075, 0.05, 0.1], [0, 0, 0], hip);
      this.legs.push(hip);
    }
    // 팔: 어깨에서 손까지 늘었다 줄었다 하는 소매
    const pawCol = s.kind === 'mole' ? fur2 : fur;
    for (const side of [-1, 1]) {
      const shoulder = V(side * 0.245 * bw, 0.47, 0.02);
      const upper = mesh(cylG(0.066, 0.06, 1, 14), M(s.cloth, { noise: 1.6 }), [0, 0, 0], 1, [0, 0, 0], this.body);
      const joint = mesh(sphereG(0.072, 14, 10), M(s.cloth, { noise: 1.6 }), [shoulder.x, shoulder.y, shoulder.z], 1, [0, 0, 0], this.body);
      const hand = group(this.body);
      const cuff = mesh(torusG(0.056, 0.02, 8, 18), M(lighten(s.cloth, 0.4)), [0, 0, 0], 1, [0, 0, 0], this.body);
      mesh(sphereG(1, 16, 12), M(pawCol), [0, 0, 0.03], [0.078, 0.066, 0.085], [0, 0, 0], hand);
      for (let k = -1; k <= 1; k++) mesh(sphereG(0.026, 10, 8), M(pawCol), [k * 0.034, 0.012, 0.1], 1, [0, 0, 0], hand);
      mesh(sphereG(0.028, 10, 8), M(pawCol), [-side * 0.065, 0.018, 0.045], 1, [0, 0, 0], hand);
      if (s.kind !== 'human') mesh(sphereG(1, 10, 8), M('#E9A0A8', { rim: 0.2 }), [0, -0.055, 0.04], [0.035, 0.012, 0.03], [0, 0, 0], hand);
      const rest = V(side * 0.3, 0.26, 0.08);
      this.arms.push({ side, shoulder, upper, joint, cuff, hand, cur: rest.clone(), target: rest.clone(), aim: null, aimCur: V(0, -0.4, 1).normalize() });
    }
    // 젓가락 (오른손)
    for (const dx of [-0.011, 0.011]) mesh(cylG(0.0045, 0.0065, 0.21, 6), M('#B9763E', { spec: 0.4 }), [dx, 0.004, 0.125], 1, [PI / 2, 0, dx * 1.4], this.chop);
    this.chop.visible = false;
    this.arms[1].hand.add(this.chop);
    // 머리
    this.headPivot.position.set(0, 0.58, 0);
    this.body.add(this.headPivot);
    this.head.position.set(0, 0.3, 0);
    this.headPivot.add(this.head);
    mesh(sphereG(HR, 32, 24), M(fur, { noise: 1.4 }), [0, 0, 0], 1, [0, 0, 0], this.head);

    // 얼굴 (눈은 머리 앞쪽에 붙인 얇은 껍질에 그려요)
    this.eyeTex = cellTex(true, s.kind === 'panda' ? '#2E2E2E' : s.kind === 'raccoon' ? (s.mark ?? '#4A403A') : '');
    const faceMat = (t: THREE.Texture) => new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    const eyeR = HR + 0.006 + (['penguin', 'owl', 'monkey'].includes(s.kind) ? 0.006 : 0);
    const eyes = mesh(shellG(eyeR, FRONT, 1.1, 1.35, 0.55), faceMat(this.eyeTex), [0, 0, 0], 1, [0, 0, 0], this.head);
    eyes.renderOrder = 3;

    const snoutKinds: Partial<Record<ChibiSpec['kind'], { r: number; sx: number; sy: number; sz: number; y: number; z: number; col?: string }>> = {
      bear: { r: 0.13, sx: 1.15, sy: 0.85, sz: 0.75, y: -0.09, z: 0.26 },
      fox: { r: 0.12, sx: 1.0, sy: 0.8, sz: 1.0, y: -0.09, z: 0.27 },
      dog: { r: 0.13, sx: 1.2, sy: 0.85, sz: 0.8, y: -0.09, z: 0.26 },
      raccoon: { r: 0.11, sx: 1.1, sy: 0.8, sz: 0.85, y: -0.09, z: 0.27 },
      hippo: { r: 0.15, sx: 1.4, sy: 0.85, sz: 0.85, y: -0.11, z: 0.23 },
      otter: { r: 0.12, sx: 1.3, sy: 0.8, sz: 0.8, y: -0.09, z: 0.26 },
      lion: { r: 0.12, sx: 1.2, sy: 0.85, sz: 0.8, y: -0.09, z: 0.27 },
      tiger: { r: 0.12, sx: 1.2, sy: 0.85, sz: 0.8, y: -0.09, z: 0.27 },
      giraffe: { r: 0.12, sx: 1.05, sy: 0.85, sz: 0.95, y: -0.1, z: 0.27 },
      deer: { r: 0.11, sx: 1.0, sy: 0.85, sz: 0.9, y: -0.1, z: 0.27 },
      kangaroo: { r: 0.12, sx: 1.0, sy: 0.85, sz: 1.0, y: -0.1, z: 0.27 },
      beaver: { r: 0.12, sx: 1.2, sy: 0.85, sz: 0.8, y: -0.09, z: 0.27 },
      alpaca: { r: 0.12, sx: 1.05, sy: 0.9, sz: 0.95, y: -0.1, z: 0.27 },
      goat: { r: 0.11, sx: 1.0, sy: 0.9, sz: 0.9, y: -0.11, z: 0.27 },
      hedgehog: { r: 0.1, sx: 1.0, sy: 0.85, sz: 1.1, y: -0.08, z: 0.28 },
      mouse: { r: 0.09, sx: 1.0, sy: 0.85, sz: 1.1, y: -0.08, z: 0.29 },
      squirrel: { r: 0.1, sx: 1.1, sy: 0.85, sz: 0.85, y: -0.09, z: 0.28 },
      koala: { r: 0.11, sx: 1.2, sy: 0.85, sz: 0.7, y: -0.1, z: 0.26 },
    };
    const sn = snoutKinds[s.kind];
    const noseOnly: ChibiSpec['kind'][] = ['rabbit', 'cat', 'hamster', 'human', 'monkey', 'mole', 'pig', 'sheep', 'turtle', 'frog', 'panda'];
    const beakKinds: ChibiSpec['kind'][] = ['duck', 'chick', 'penguin', 'owl'];

    if (sn) {
      const snout = mesh(sphereG(sn.r, 20, 14), M(sn.col ?? fur2), [0, sn.y, sn.z], [sn.sx, sn.sy, sn.sz], [0, 0, 0], this.head);
      // 코
      if (s.kind !== 'koala') mesh(sphereG(1), M(s.kind === 'mouse' ? '#E98BA3' : INK, { rim: 0.4 }), [0, sn.y + sn.r * 0.55, sn.z + sn.r * sn.sz * 0.85], [0.045, 0.032, 0.03], [0, 0, 0], this.head);
      this.mouthTex = cellTex(false);
      const mouth = mesh(shellG(sn.r + 0.004, FRONT, 1.5, 1.7, 0.75), faceMat(this.mouthTex), [0, 0, 0], 1, [0, 0, 0], snout);
      mouth.renderOrder = 3;
      if (s.kind === 'beaver') for (const x of [-0.022, 0.022]) mesh(boxG(0.038, 0.05, 0.02), M('#FFFFFF', { rim: 0.3 }), [x, sn.y - sn.r * 0.85, sn.z + sn.r * 0.55], 1, [0, 0, 0], this.head);
    } else if (beakKinds.includes(s.kind)) {
      const bc = s.kind === 'duck' || s.kind === 'chick' ? fur2 : mark;
      if (s.kind === 'duck') this.beak = mesh(sphereG(1), M(bc), [0, -0.07, 0.33], [0.13, 0.05, 0.1], [0, 0, 0], this.head);
      else this.beak = mesh(coneG(0.05, 0.1, 12), M(bc), [0, -0.06, 0.35], [1, 1, 0.8], [PI / 2 + 0.5, 0, 0], this.head);
    } else if (noseOnly.includes(s.kind)) {
      const noseCol = s.kind === 'human' ? darken(fur, 0.08) : s.kind === 'rabbit' || s.kind === 'cat' || s.kind === 'hamster' ? '#E98BA3' : s.kind === 'mole' ? fur2 : INK;
      if (s.kind === 'pig') {
        mesh(cylG(0.075, 0.08, 0.06, 20), M(fur2), [0, -0.07, 0.33], [1.2, 1, 0.8], [PI / 2, 0, 0], this.head);
        for (const x of [-0.03, 0.03]) mesh(sphereG(0.015), M(darken(fur2, 0.4)), [x, -0.07, 0.36], 1, [0, 0, 0], this.head);
      } else if (s.kind === 'mole') {
        mesh(sphereG(1), M(fur2), [0, -0.05, 0.33], [0.06, 0.045, 0.05], [0, 0, 0], this.head);
      } else if (s.kind !== 'frog' && s.kind !== 'turtle' && s.kind !== 'sheep') {
        const size = s.kind === 'human' ? [0.035, 0.03, 0.03] : [0.035, 0.025, 0.025];
        mesh(sphereG(1), M(noseCol, { rim: 0.4 }), [0, -0.055, HR - 0.01], size as [number, number, number], [0, 0, 0], this.head);
      }
      this.mouthTex = cellTex(false);
      // 볼 무늬가 입을 가리는 친구는 입을 조금 앞으로 내놓아요
      const lift = s.kind === 'hamster' || s.kind === 'frog' ? 0.05 : 0.007;
      const mouth = mesh(shellG(HR + lift, FRONT, 0.46, 1.86, 0.4), faceMat(this.mouthTex), [0, 0, 0], 1, [0, 0, 0], this.head);
      mouth.renderOrder = 3;
    } else {
      this.mouthTex = cellTex(false);
      mesh(shellG(HR + 0.007, FRONT, 0.5, 1.9, 0.42), faceMat(this.mouthTex), [0, 0, 0], 1, [0, 0, 0], this.head).renderOrder = 3;
    }

    this.buildParts(fur, fur2, mark);
    this.setMood('neutral');
  }

  private shell(color: string, phiC: number, phiL: number, th0: number, thL: number, dr = 0.003) {
    return mesh(shellG(HR + dr, phiC, phiL, th0, thL), M(color, { rim: 0.2 }), [0, 0, 0], 1, [0, 0, 0], this.head);
  }
  // 얼굴 앞쪽 동그란 무늬: 작은 공을 앞으로 살짝 내밀어 둥근 경계를 만들어요
  private disc(color: string, k: number, y: number, sx = 1) {
    return mesh(sphereG(HR * k, 28, 20), M(color, { rim: 0.2 }), [0, y, HR * (1 - k) + 0.004], [sx, 1, 1], [0, 0, 0], this.head);
  }

  private buildParts(fur: string, fur2: string, mark: string) {
    const s = this.spec, h = this.head;
    const earRound = (x: number, y: number, r: number, col = fur, inner = fur2) => {
      for (const sd of [-1, 1]) {
        mesh(sphereG(1), M(col), [sd * x, y, -0.02], [r, r, r * 0.55], [0, 0, 0], h);
        mesh(sphereG(1), M(inner), [sd * x * 0.98, y - r * 0.05, -0.02 + r * 0.32], [r * 0.6, r * 0.6, r * 0.25], [0, 0, 0], h);
      }
    };
    const earTri = (x: number, y: number, hh: number, w: number, tilt: number, col = fur, inner = fur2, z = 0) => {
      for (const sd of [-1, 1]) {
        const e = group(h, [sd * x, y, z]);
        e.rotation.z = -sd * tilt;
        mesh(coneG(w, hh, 14), M(col), [0, hh / 2, 0], [1, 1, 0.5], [0, 0, 0], e);
        mesh(coneG(w * 0.6, hh * 0.7, 12), M(inner), [0, hh * 0.42, w * 0.22], [1, 1, 0.3], [0, 0, 0], e);
      }
    };
    const earLong = (x: number, y: number, len: number, w: number, tilt: number, col = fur, inner = fur2) => {
      for (const sd of [-1, 1]) {
        const e = group(h, [sd * x, y, 0]);
        e.rotation.z = -sd * tilt;
        mesh(capsuleG(w, len), M(col), [0, len / 2 + w, 0], [1, 1, 0.55], [0, 0, 0], e);
        mesh(capsuleG(w * 0.55, len * 0.8), M(inner), [0, len / 2 + w, w * 0.32], [1, 1, 0.3], [0, 0, 0], e);
      }
    };
    const whiskers = (y: number, z: number) => {
      for (const sd of [-1, 1]) for (let i = 0; i < 2; i++)
        mesh(boxG(0.12, 0.006, 0.006), M(INK, { rim: 0 }), [sd * 0.21, y - i * 0.025, z], 1, [0, sd * -0.35, sd * (i ? -0.1 : 0.08)], h);
    };
    const tailBall = (col: string, r = 0.07) => { this.tail = mesh(sphereG(r), M(col), [0, 0.15, -0.27], 1, [0, 0, 0], this.body); };
    const tailTube = (col: string, pts: [number, number, number][], r: number) => {
      const g = tube(pts, r, 30);
      const m = mesh(g, M(col), [0, 0, 0], 1, [0, 0, 0], this.body);
      m.userData.ownGeo = true;
      this.tail = m;
    };

    switch (s.kind) {
      case 'rabbit': earLong(0.11, 0.24, 0.3, 0.065, 0.12); tailBall('#FFFFFF', 0.08); break;
      case 'cat':
        earTri(0.19, 0.2, 0.19, 0.1, 0.32);
        whiskers(-0.05, 0.3);
        for (const x of [-0.07, 0, 0.07]) mesh(sphereG(1), M(mark), [x, 0.26, 0.2], [0.022, 0.05, 0.02], [-0.6, 0, 0], h);
        tailTube(fur, [[0, 0.1, -0.24], [0.15, 0.2, -0.38], [0.2, 0.45, -0.35], [0.12, 0.6, -0.3]], 0.045);
        break;
      case 'bear': earRound(0.22, 0.24, 0.1); break;
      case 'squirrel':
        earTri(0.17, 0.25, 0.13, 0.065, 0.2);
        tailTube(fur, [[0, 0.1, -0.25], [0.05, 0.35, -0.45], [0.02, 0.75, -0.42], [-0.05, 0.95, -0.25]], 0.13);
        break;
      case 'duck':
        mesh(coneG(0.03, 0.12, 8), M(fur), [0, 0.36, 0], 1, [0, 0, 0.3], h);
        break;
      case 'penguin':
        this.disc(fur2, 0.88, -0.02, 1.05);
        break;
      case 'fox':
        earTri(0.19, 0.2, 0.25, 0.12, 0.28, fur, mark);
        this.disc(fur2, 0.62, -0.13, 1.25);
        tailTube(fur, [[0, 0.1, -0.24], [0.2, 0.15, -0.42], [0.35, 0.4, -0.4], [0.3, 0.6, -0.3]], 0.1);
        break;
      case 'panda':
        earRound(0.22, 0.24, 0.1, fur2, fur2);
        break;
      case 'raccoon':
        earRound(0.21, 0.24, 0.09, fur, mark);
        tailTube(fur, [[0, 0.1, -0.24], [0.18, 0.2, -0.4], [0.28, 0.45, -0.38]], 0.09);
        break;
      case 'dog':
        for (const sd of [-1, 1]) mesh(sphereG(1), M(mark), [sd * 0.3, 0.06, -0.02], [0.08, 0.17, 0.11], [0, 0, sd * 0.35], h);
        tailTube(fur, [[0, 0.1, -0.24], [0.08, 0.25, -0.38], [0.04, 0.42, -0.4]], 0.05);
        break;
      case 'owl':
        this.disc(fur2, 0.86, 0.0, 1.08);
        earTri(0.18, 0.24, 0.12, 0.06, 0.5, fur, fur);
        break;
      case 'turtle':
        mesh(sphereG(1), M(mark), [0, 0.34, -0.12], [0.36, 0.34, 0.28], [0, 0, 0], this.body);
        for (let i = 0; i < 5; i++) mesh(sphereG(1), M(darken(mark, 0.15)), [Math.cos(i * 1.256) * 0.18, 0.42 + Math.sin(i * 1.256) * 0.14, -0.38], [0.07, 0.07, 0.02], [0, 0, 0], this.body);
        break;
      case 'sheep':
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * PI * 2;
          mesh(sphereG(0.11), M(fur2), [Math.cos(a) * 0.2, 0.25 + Math.sin(a) * 0.05, Math.sin(a) * 0.14 - 0.02], 1, [0, 0, 0], h);
        }
        mesh(sphereG(0.13), M(fur2), [0, 0.3, 0], 1, [0, 0, 0], h);
        for (const sd of [-1, 1]) mesh(sphereG(1), M(fur), [sd * 0.34, 0.05, 0], [0.12, 0.05, 0.07], [0, 0, sd * -0.3], h);
        break;
      case 'hedgehog':
        for (let i = 0; i < 34; i++) {
          const a = (i / 34) * PI * 2 * 4.3, b = 0.25 + (i / 34) * 1.45;
          const dir = new THREE.Vector3(Math.cos(a) * Math.sin(b), Math.cos(b) + 0.1, Math.sin(a) * Math.sin(b) * 0.6 - 0.45).normalize();
          if (dir.z > 0.2) continue;
          const c = mesh(coneG(0.055, 0.2, 6), M(mark), [dir.x * 0.3, dir.y * 0.3, dir.z * 0.3], 1, [0, 0, 0], h);
          c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        }
        earRound(0.22, 0.2, 0.06);
        break;
      case 'elephant': {
        for (const sd of [-1, 1]) {
          mesh(sphereG(1), M(fur), [sd * 0.34, 0.02, -0.04], [0.06, 0.24, 0.21], [0, sd * -0.3, 0], h);
          mesh(sphereG(1), M(fur2), [sd * 0.36, 0.02, 0.0], [0.03, 0.17, 0.14], [0, sd * -0.3, 0], h);
        }
        const g = tube([[0, -0.04, 0.3], [0, -0.14, 0.38], [0, -0.26, 0.4], [0, -0.32, 0.46], [0, -0.28, 0.5]], 0.05, 24);
        this.trunk = mesh(g, M(fur), [0, 0, 0], 1, [0, 0, 0], h);
        this.trunk.userData.ownGeo = true;
        break;
      }
      case 'hippo':
        earRound(0.2, 0.25, 0.06);
        for (const x of [-0.06, 0.06]) mesh(sphereG(0.022), M(darken(fur2, 0.45)), [x, -0.03, 0.34], 1, [0, 0, 0], h);
        break;
      case 'giraffe':
        for (const sd of [-1, 1]) {
          mesh(cylG(0.022, 0.028, 0.14, 8), M(fur), [sd * 0.09, 0.36, 0], 1, [0, 0, sd * -0.15], h);
          mesh(sphereG(0.04), M(mark), [sd * 0.105, 0.44, 0], 1, [0, 0, 0], h);
          mesh(sphereG(1), M(fur), [sd * 0.3, 0.14, -0.02], [0.1, 0.04, 0.05], [0, 0, sd * -0.4], h);
        }
        for (let i = 0; i < 6; i++) { const a = i * 1.1 + 0.4; this.shell(mark, FRONT + PI + Math.cos(a) * 1.4, 0.3, 0.6 + (i % 3) * 0.45, 0.25, 0.003); }
        break;
      case 'monkey':
        for (const sd of [-1, 1]) {
          mesh(sphereG(1), M(fur), [sd * 0.35, 0.0, -0.02], [0.1, 0.11, 0.05], [0, 0, 0], h);
          mesh(sphereG(1), M(fur2), [sd * 0.36, 0.0, 0.01], [0.06, 0.07, 0.03], [0, 0, 0], h);
        }
        this.disc(fur2, 0.8, -0.04, 1.05);
        tailTube(fur, [[0, 0.1, -0.24], [0.15, 0.1, -0.42], [0.3, 0.3, -0.42], [0.25, 0.5, -0.32], [0.15, 0.48, -0.25]], 0.035);
        break;
      case 'pig':
        earTri(0.18, 0.22, 0.13, 0.09, 0.45);
        tailTube(fur2, [[0, 0.15, -0.25], [0.05, 0.2, -0.32], [-0.03, 0.25, -0.33], [0.02, 0.28, -0.3]], 0.018);
        break;
      case 'hamster':
        earRound(0.2, 0.24, 0.07);
        for (const sd of [-1, 1]) mesh(sphereG(1), M(fur2), [sd * 0.19, -0.12, 0.2], [0.11, 0.09, 0.09], [0, 0, 0], h);
        this.disc(fur2, 0.64, -0.13, 1.3);
        break;
      case 'otter':
        earRound(0.24, 0.16, 0.05);
        whiskers(-0.07, 0.31);
        break;
      case 'frog':
        for (const sd of [-1, 1]) mesh(sphereG(0.1), M(fur), [sd * 0.15, 0.25, 0.08], 1, [0, 0, 0], h);
        this.disc(fur2, 0.64, -0.14, 1.35);
        break;
      case 'chick':
        for (let i = -1; i <= 1; i++) mesh(sphereG(1), M(fur), [i * 0.04, 0.36, 0], [0.03, 0.08, 0.03], [0, 0, i * 0.4], h);
        break;
      case 'deer':
        earTri(0.27, 0.12, 0.16, 0.07, 1.0);
        for (const sd of [-1, 1]) mesh(coneG(0.03, 0.12, 8), M('#B98A5E'), [sd * 0.11, 0.33, 0], 1, [0, 0, sd * -0.25], h);
        for (let i = 0; i < 5; i++) mesh(sphereG(0.024), M(mark), [Math.cos(i * 1.4) * 0.12, 0.25 + Math.sin(i * 1.4) * 0.03, 0.2], [1, 1, 0.4], [0, 0, 0], h);
        break;
      case 'lion': {
        const mane = mesh(torusG(HR * 0.92, 0.13, 10, 28), M(mark, { noise: 2 }), [0, 0, -0.05], 1, [0, 0, 0], h);
        for (let i = 0; i < 12; i++) { const a = (i / 12) * PI * 2; mesh(sphereG(0.1), M(mark, { noise: 2 }), [Math.cos(a) * 0.38, Math.sin(a) * 0.38, -0.09], 1, [0, 0, 0], mane.parent!); }
        earRound(0.2, 0.28, 0.07);
        tailTube(fur, [[0, 0.1, -0.24], [0.2, 0.15, -0.4], [0.3, 0.35, -0.4]], 0.03);
        break;
      }
      case 'tiger':
        earRound(0.21, 0.25, 0.08);
        for (const [x, y] of [[0, 0.3], [-0.08, 0.27], [0.08, 0.27]]) mesh(sphereG(1), M(mark), [x, y, 0.16], [0.018, 0.055, 0.03], [-0.6, 0, 0], h);
        for (const sd of [-1, 1]) for (let i = 0; i < 2; i++) mesh(sphereG(1), M(mark), [sd * 0.31, 0.05 - i * 0.08, 0.1], [0.012, 0.035, 0.05], [0, 0, sd * 1.2], h);
        this.disc(fur2, 0.62, -0.13, 1.3);
        break;
      case 'koala':
        for (const sd of [-1, 1]) {
          mesh(sphereG(1), M(fur), [sd * 0.31, 0.17, -0.02], [0.15, 0.14, 0.07], [0, 0, 0], h);
          mesh(sphereG(1), M(fur2), [sd * 0.32, 0.16, 0.02], [0.1, 0.09, 0.04], [0, 0, 0], h);
        }
        mesh(sphereG(1), M(mark, { rim: 0.4 }), [0, -0.04, 0.33], [0.065, 0.085, 0.05], [0, 0, 0], h);
        break;
      case 'kangaroo': earTri(0.15, 0.24, 0.26, 0.08, 0.22); break;
      case 'mole': for (const sd of [-1, 1]) mesh(sphereG(0.03), M(fur), [sd * 0.3, 0.1, 0], 1, [0, 0, 0], h); break;
      case 'alpaca':
        for (let i = 0; i < 6; i++) { const a = (i / 6) * PI * 2; mesh(sphereG(0.09), M(fur2), [Math.cos(a) * 0.1, 0.3 + Math.sin(a) * 0.02, Math.sin(a) * 0.08], 1, [0, 0, 0], h); }
        earLong(0.17, 0.22, 0.12, 0.045, 0.25);
        break;
      case 'goat':
        for (const sd of [-1, 1]) {
          const g = tube([[sd * 0.1, 0.28, 0], [sd * 0.14, 0.4, -0.06], [sd * 0.2, 0.42, -0.16], [sd * 0.24, 0.35, -0.2]], 0.03, 16);
          const m = mesh(g, M(mark), [0, 0, 0], 1, [0, 0, 0], h); m.userData.ownGeo = true;
          mesh(sphereG(1), M(fur), [sd * 0.32, 0.08, 0], [0.11, 0.04, 0.05], [0, 0, sd * -0.5], h);
        }
        mesh(coneG(0.04, 0.12, 10), M(fur2), [0, -0.33, 0.2], 1, [PI, 0, 0], h);
        break;
      case 'mouse':
        earRound(0.25, 0.22, 0.15);
        whiskers(-0.08, 0.32);
        tailTube('#E9B7BE', [[0, 0.08, -0.25], [0.2, 0.05, -0.45], [0.38, 0.2, -0.5], [0.42, 0.42, -0.4]], 0.015);
        break;
      case 'beaver':
        earRound(0.24, 0.16, 0.05);
        this.tail = mesh(sphereG(1), M(mark || darken(fur, 0.3)), [0, 0.08, -0.38], [0.16, 0.04, 0.22], [0.3, 0, 0], this.body);
        break;
      case 'human': this.buildHuman(); break;
    }
    if (s.glasses) {
      for (const sd of [-1, 1]) mesh(torusG(0.06, 0.008, 6, 20), M('#5A3A28', { rim: 0 }), [sd * 0.088, -0.01, HR + 0.02], 1, [0, 0, 0], h);
      mesh(boxG(0.05, 0.008, 0.008), M('#5A3A28', { rim: 0 }), [0, 0.0, HR + 0.025], 1, [0, 0, 0], h);
    }
    this.buildWear();
  }

  private buildHuman() {
    const s = this.spec, h = this.head, hair = s.hair ?? '#3B2A20';
    for (const sd of [-1, 1]) mesh(sphereG(1), M(s.fur), [sd * HR, -0.02, 0], [0.05, 0.07, 0.05], [0, 0, 0], h);
    switch (s.style) {
      case 'grandpa':
        for (const sd of [-1, 1]) mesh(sphereG(1), M(hair, { noise: 2 }), [sd * 0.29, 0.06, -0.08], [0.09, 0.12, 0.14], [0, 0, 0], h);
        mesh(sphereG(1), M(hair, { noise: 2 }), [0, -0.06, -0.24], [0.24, 0.16, 0.12], [0, 0, 0], h);
        mesh(sphereG(1), M(hair, { noise: 2 }), [0, -0.1, HR - 0.005], [0.09, 0.03, 0.03], [0, 0, 0], h);
        break;
      case 'whitebeard':
        mesh(shellG(HR + 0.02, PI * 1.5, PI * 2, 0, 1.25), M(hair, { noise: 2, side: THREE.DoubleSide }), [0, 0, 0], 1, [0, 0, 0], h);
        mesh(sphereG(1), M(hair, { noise: 2 }), [0, -0.24, 0.17], [0.17, 0.15, 0.12], [0, 0, 0], h);
        mesh(sphereG(1), M(hair, { noise: 2 }), [0, -0.1, HR - 0.005], [0.1, 0.035, 0.035], [0, 0, 0], h);
        for (const sd of [-1, 1]) mesh(sphereG(1), M(hair, { noise: 2 }), [sd * 0.08, 0.12, 0.31], [0.05, 0.015, 0.02], [0, 0, sd * -0.15], h);
        break;
      case 'cap':
        mesh(shellG(HR + 0.012, PI * 1.5, PI * 2, 0, 1.45), M(hair, { side: THREE.DoubleSide }), [0, 0, 0], 1, [0, 0, 0], h);
        mesh(cylG(0.3, 0.33, 0.14, 24), M('#3E6FA8'), [0, 0.24, -0.01], 1, [-0.12, 0, 0], h);
        mesh(cylG(0.31, 0.31, 0.03, 24), M('#2F5A8C'), [0, 0.19, 0.06], [1, 1, 1.1], [-0.12, 0, 0], h);
        mesh(boxG(0.3, 0.02, 0.13), M('#2F5A8C'), [0, 0.18, 0.33], 1, [0.18, 0, 0], h);
        mesh(sphereG(0.03), M('#F4C842'), [0, 0.26, 0.3], [1, 1, 0.5], [0, 0, 0], h);
        break;
      case 'tall':
        mesh(shellG(HR + 0.012, PI * 1.5, PI * 2, 0, 1.3), M(hair, { side: THREE.DoubleSide }), [0, 0, 0], 1, [0, 0, 0], h);
        mesh(cylG(0.2, 0.24, 0.24, 20), M(hair), [0, 0.36, -0.02], [1, 1, 0.95], [0, 0, 0], h);
        mesh(sphereG(1), M('#8BC34A'), [0.0, 0.5, -0.02], [0.05, 0.03, 0.05], [0, 0, 0], h);
        break;
      case 'curly':
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * PI * 2, b = 0.4 + (i % 3) * 0.35;
          mesh(sphereG(0.1), M(hair, { noise: 2 }), [Math.cos(a) * Math.sin(b) * 0.33, Math.cos(b) * 0.33 + 0.04, Math.sin(a) * Math.sin(b) * 0.3 - 0.06], 1, [0, 0, 0], h);
        }
        mesh(sphereG(0.13), M(hair, { noise: 2 }), [0, 0.32, -0.04], 1, [0, 0, 0], h);
        // 앞치마
        mesh(sphereG(1), M('#FFF4E6'), [0, 0.28, 0.06], [0.26, 0.24, 0.22], [0, 0, 0], this.body);
        break;
      default:
        mesh(shellG(HR + 0.012, PI * 1.5, PI * 2, 0, 1.3), M(hair, { side: THREE.DoubleSide }), [0, 0, 0], 1, [0, 0, 0], h);
    }
  }

  private buildWear() {
    const s = this.spec, h = this.head, b = this.body;
    switch (s.wear) {
      case 'bandage': {
        const g = group(h, [0.17, -0.1, 0.28]); g.rotation.set(0, 0.5, 0.6);
        mesh(boxG(0.1, 0.035, 0.012), M('#F3C9A0', { rim: 0.2 }), [0, 0, 0], 1, [0, 0, 0], g);
        mesh(boxG(0.035, 0.03, 0.014), M('#FBE6D0', { rim: 0.2 }), [0, 0, 0.002], 1, [0, 0, 0], g);
        break;
      }
      case 'acorn':
        mesh(torusG(0.15, 0.008, 6, 24), M('#8A5A3B'), [0, 0.58, 0.03], 1, [PI / 2.2, 0, 0], b);
        mesh(sphereG(1), M('#B9763E'), [0, 0.5, 0.2], [0.04, 0.05, 0.04], [0, 0, 0], b);
        mesh(sphereG(1), M('#6E4A30'), [0, 0.54, 0.2], [0.045, 0.02, 0.045], [0, 0, 0], b);
        break;
      case 'scarf':
        mesh(torusG(0.17, 0.05, 10, 24), M('#E86B5F', { noise: 2 }), [0, 0.6, 0.02], 1, [PI / 2, 0, 0], b);
        mesh(boxG(0.08, 0.18, 0.04), M('#E86B5F', { noise: 2 }), [0.08, 0.5, 0.2], 1, [0.2, 0, 0.1], b);
        break;
      case 'earmuff':
        mesh(torusG(HR + 0.02, 0.02, 8, 24, PI), M('#8E6FC2'), [0, 0, 0], 1, [0, 0, 0], h);
        for (const sd of [-1, 1]) mesh(sphereG(0.08), M('#F7D560', { noise: 2 }), [sd * (HR + 0.02), 0, 0], [0.7, 1, 1], [0, 0, 0], h);
        break;
      case 'helmet':
        mesh(shellG(HR + 0.06, PI * 1.5, PI * 2, 0, 1.2), M('#6FB3E0', { side: THREE.DoubleSide }), [0, 0, 0], 1, [0, 0, 0], h);
        for (let i = -1; i <= 1; i++) mesh(boxG(0.03, 0.03, 0.3), M('#FFFFFF'), [i * 0.1, HR + 0.04, -0.02], 1, [0, 0, 0], h);
        break;
    }
  }

  setMood(m: Mood) {
    this.mood = m;
    const [e, mo] = MOODS[m];
    setCell(this.eyeTex, true, e);
    if (this.mouthTex) setCell(this.mouthTex, false, mo);
  }

  play(a: Act) { if (this.act !== a) { this.act = a; this.actT = 0; } }
  setHand(side: number, p: THREE.Vector3, aim: THREE.Vector3 | null = null) {
    const arm = this.arms[side];
    arm.target.copy(p);
    arm.aim = aim ? aim.clone().normalize() : null;
  }
  toLocal(w: THREE.Vector3) { return this.body.worldToLocal(w.clone()); }
  toWorld(l: THREE.Vector3) { return this.body.localToWorld(l.clone()); }
  mouthWorld() { return this.head.localToWorld(V(0, -0.15, HR * 0.92)); }
  chopTipWorld() { return this.chop.localToWorld(V(0, 0.004, 0.23)); }
  handWorld(side: number) { return this.arms[side].hand.getWorldPosition(V()); }
  showChop(on: boolean) { this.chop.visible = on; }

  private restFor(side: number) {
    return this.seated ? V(side * 0.17, 0.52, 0.37) : V(side * 0.3, 0.26, 0.08);
  }

  private actTargets(t: number) {
    const L = this.arms[0], R = this.arms[1];
    const k = this.actT;
    let lean = 0;
    this.headExtra.set(0, 0, 0);
    L.target.copy(this.restFor(-1)); R.target.copy(this.restFor(1)); L.aim = null; R.aim = null;
    if (this.walking) {
      const sw = Math.sin(this.walkPhase);
      L.target.z += sw * 0.12; R.target.z -= sw * 0.12;
      L.target.y += Math.abs(sw) * 0.03; R.target.y += Math.abs(sw) * 0.03;
    }
    switch (this.act) {
      case 'talk':
        R.target.set(0.24 + Math.sin(t * 3.1) * 0.03, 0.66 + Math.sin(t * 4.3) * 0.05, 0.3);
        R.aim = V(0.3, 0.6, 1);
        break;
      case 'wave':
        R.target.set(0.36 + Math.sin(t * 11) * 0.06, 1.0, 0.18);
        R.aim = V(0, 1, 0.3);
        this.headExtra.z = -0.08;
        break;
      case 'bow':
        lean = 0.42 * Math.sin(Math.min(1, k / 1.4) * PI);
        this.headExtra.x = lean * 0.6;
        L.target.set(-0.08, 0.45, 0.3); R.target.set(0.08, 0.45, 0.3);
        break;
      case 'cheer':
        L.target.set(-0.32, 1.08 + Math.sin(t * 9) * 0.05, 0.12); R.target.set(0.32, 1.08 + Math.sin(t * 9 + 1) * 0.05, 0.12);
        L.aim = V(0, 1, 0.2); R.aim = V(0, 1, 0.2);
        this.headExtra.x = -0.15;
        break;
      case 'clap': {
        const c = Math.abs(Math.sin(t * 9));
        L.target.set(-0.035 - c * 0.07, 0.66, 0.32); R.target.set(0.035 + c * 0.07, 0.66, 0.32);
        L.aim = V(1, 0.3, 0.6); R.aim = V(-1, 0.3, 0.6);
        break;
      }
      case 'thumbs':
        R.target.set(0.22, 0.7, 0.32); R.aim = V(0, 1, 0.4);
        this.headExtra.z = -0.06;
        break;
      case 'scratch':
        R.target.set(0.34 + Math.sin(t * 14) * 0.015, 1.0, 0.04); R.aim = V(-0.6, 0.6, 0.2);
        this.headExtra.z = 0.12;
        break;
      case 'think':
        R.target.set(0.06, 0.72, 0.3); R.aim = V(0, 1, 0.3);
        this.headExtra.z = 0.08; this.headExtra.x = -0.05;
        break;
      case 'fist': {
        const sh = Math.sin(t * 22) * 0.015;
        L.target.set(-0.14, 0.62 + sh, 0.3); R.target.set(0.14, 0.62 - sh, 0.3);
        lean = 0.06;
        break;
      }
      case 'worry':
        L.target.set(-0.045, 0.56, 0.3); R.target.set(0.045, 0.56, 0.3);
        L.aim = V(1, 0.4, 0.6); R.aim = V(-1, 0.4, 0.6);
        this.headExtra.z = 0.06;
        break;
      case 'sad':
        L.target.set(-0.15, 0.49, 0.34); R.target.set(0.15, 0.49, 0.34);
        lean = 0.1; this.headExtra.x = 0.22;
        break;
      case 'full':
        L.target.set(-0.12, 0.3, 0.28); R.target.set(0.12, 0.3, 0.28);
        L.aim = V(1, 0, 0.3); R.aim = V(-1, 0, 0.3);
        lean = -0.14; this.headExtra.x = -0.12;
        break;
      case 'nod':
        this.headExtra.x = Math.max(0, Math.sin(t * 8)) * 0.25;
        break;
    }
    this.lean = lean;
  }

  private updateArm(arm: Arm, dt: number) {
    const k = 1 - Math.exp(-dt * 14);
    arm.cur.lerp(arm.target, k);
    const a = arm.shoulder, b = arm.cur;
    const dir = b.clone().sub(a);
    const len = Math.max(0.02, dir.length());
    dir.divideScalar(len);
    arm.upper.position.copy(a).addScaledVector(dir, len * 0.5);
    arm.upper.quaternion.setFromUnitVectors(UP, dir);
    arm.upper.scale.set(1, Math.max(0.01, len - 0.03), 1);
    arm.cuff.position.copy(b).addScaledVector(dir, -0.05);
    arm.cuff.quaternion.setFromUnitVectors(V(0, 0, 1), dir);
    const wantAim = arm.aim ?? dir.clone().add(V(0, -0.35, 0.4)).normalize();
    arm.aimCur.lerp(wantAim, k).normalize();
    arm.hand.position.copy(b);
    const m = new THREE.Matrix4().lookAt(V(), arm.aimCur.clone().negate(), Math.abs(arm.aimCur.y) > 0.95 ? V(0, 0, 1) : UP);
    arm.hand.quaternion.setFromRotationMatrix(m);
  }

  update(dt: number) {
    this.t += dt;
    this.actT += dt;
    const t = this.t;
    // 숨쉬기
    const breath = Math.sin(t * 2.2) * 0.012;
    this.body.scale.set(1 + breath * 0.5, 1 - breath * 0.3, 1);
    // 깜빡이기
    this.blinkT -= dt;
    const [e, mo] = MOODS[this.mood];
    if (this.chewing) setCell(this.eyeTex, true, EYES.content);
    else if (this.blinkT < 0) {
      setCell(this.eyeTex, true, EYES.blink);
      if (this.blinkT < -0.12) { this.blinkT = 2 + Math.random() * 3; setCell(this.eyeTex, true, e); }
    }
    // 입
    if (this.chewing) {
      if (this.mouthTex) setCell(this.mouthTex, false, Math.sin(t * 11) > 0 ? MOUTH.chew : MOUTH.talkB);
    } else if (this.talking) {
      this.talkT += dt;
      const open = Math.sin(this.talkT * 18) > 0;
      if (this.mouthTex) setCell(this.mouthTex, false, open ? (this.mood === 'happy' || this.mood === 'delight' ? MOUTH.grin : MOUTH.talkA) : mo);
      if (this.beak) this.beak.scale.y = (this.spec.kind === 'duck' ? 0.05 : 1) * (open ? 1.5 : 1);
      if (this.trunk) this.trunk.rotation.x = Math.sin(this.talkT * 9) * 0.08;
    } else if (this.mouthTex) setCell(this.mouthTex, false, mo);

    // 걷기
    if (this.walking > 0) this.walkPhase += dt * 11;
    const sw = this.walking > 0 ? Math.sin(this.walkPhase) : 0;
    this.legs.forEach((l, i) => {
      const want = this.seated ? -1.25 + Math.sin(t * 1.6 + i * 2) * 0.12 : sw * (i ? -0.7 : 0.7);
      l.rotation.x += (want - l.rotation.x) * Math.min(1, dt * 12);
    });

    // 팔 목표 정하기
    if (!this.manual) {
      this.actTargets(t);
      if (this.bounce > 0 && this.act === 'idle') {
        const s2 = Math.sin(t * 9) * 0.5;
        this.arms[0].target.y += 0.1 + s2 * 0.08; this.arms[1].target.y += 0.1 - s2 * 0.08;
      }
    }
    for (const arm of this.arms) this.updateArm(arm, dt);

    // 몸 기울기
    this.body.rotation.x += (this.lean - this.body.rotation.x) * Math.min(1, dt * 7);
    this.body.rotation.z = this.walking > 0 ? sw * 0.05 : 0;
    // 통통
    this.body.position.y = Math.abs(Math.sin(t * 9)) * 0.06 * this.bounce + (this.walking > 0 ? Math.abs(sw) * 0.035 : 0);

    // 고개
    let lx = 0, ly = 0;
    if (this.look) {
      const l = this.body.worldToLocal(this.look.clone()).sub(V(0, 0.88, 0));
      ly = THREE.MathUtils.clamp(Math.atan2(l.x, Math.max(0.05, l.z)), -0.6, 0.6);
      lx = THREE.MathUtils.clamp(Math.atan2(-l.y, Math.hypot(l.x, l.z)), -0.45, 0.55);
    }
    const nodX = -this.nod * Math.max(0, Math.sin(t * 8)) * 0.25;
    const wantX = lx + this.droop * 0.3 + nodX + this.headExtra.x - this.body.rotation.x * 0.3;
    const wantY = ly + (this.look ? 0 : Math.sin(t * 0.7) * 0.06) + this.headExtra.y;
    const wantZ = this.headExtra.z + (this.talking ? Math.sin(this.talkT * 5) * 0.04 : Math.sin(t * 0.9) * 0.03) + (this.mood === 'sad' ? 0.08 : 0);
    const hk = Math.min(1, dt * 8);
    this.headPivot.rotation.x += (wantX - this.headPivot.rotation.x) * hk;
    this.headPivot.rotation.y += (wantY - this.headPivot.rotation.y) * hk;
    this.headPivot.rotation.z += (wantZ - this.headPivot.rotation.z) * hk;
    if (this.tail) this.tail.rotation.z = Math.sin(t * (this.bounce ? 12 : 2)) * (this.bounce ? 0.25 : 0.06);
  }
}
