import * as THREE from 'three';
import type { ChibiSpec } from '../data/types';
import { darken, lighten } from '../paint/brush';
import { EYES, faceAtlas, MOUTH, tex } from '../paint/textures';
import { boxG, capsuleG, coneG, cylG, group, M, mesh, shellG, sphereG, torusG, tube } from './geo';

export const HR = 0.34; // 머리 반지름
const ARM_MAX = 0.52; // 팔(어깨~손) 길이: 이보다 멀면 곧게 펴지고 조금 늘어나요
const CHOP_X = 0.012, CHOP_Y = -0.016; // 젓가락을 쥐는 자리 (손 기준, 오른손 엄지 쪽이 +x)
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
interface Arm { side: number; shoulder: THREE.Vector3; upper: THREE.Mesh; fore: THREE.Mesh; elbow: THREE.Mesh; joint: THREE.Mesh; cuff: THREE.Mesh; hand: THREE.Group; thumb: THREE.Mesh; cur: THREE.Vector3; target: THREE.Vector3; aim: THREE.Vector3 | null; aimCur: THREE.Vector3; thumbUp: boolean; thumbW: number }
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
  // 머리 앞으로 튀어나온 주둥이·부리·코 길이 (먹을 때 그릇·냄비에 박히지 않게 자세를 고쳐요)
  faceReach = 0;

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
    // 팔: 어깨-팔꿈치-손 두 마디 소매. 멀리 뻗을 때만 만화처럼 조금 늘어나요
    const pawCol = s.kind === 'mole' ? fur2 : fur;
    for (const side of [-1, 1]) {
      const shoulder = V(side * 0.245 * bw, 0.47, 0.02);
      const sleeve = M(s.cloth, { noise: 1.6 });
      const upper = mesh(cylG(0.06, 0.064, 1, 14), sleeve, [0, 0, 0], 1, [0, 0, 0], this.body);
      const fore = mesh(cylG(0.055, 0.06, 1, 14), sleeve, [0, 0, 0], 1, [0, 0, 0], this.body);
      const elbow = mesh(sphereG(0.06, 12, 10), sleeve, [0, 0, 0], 1, [0, 0, 0], this.body);
      const joint = mesh(sphereG(0.072, 14, 10), M(s.cloth, { noise: 1.6 }), [shoulder.x, shoulder.y, shoulder.z], 1, [0, 0, 0], this.body);
      const hand = group(this.body);
      const cuff = mesh(torusG(0.056, 0.02, 8, 18), M(lighten(s.cloth, 0.4)), [0, 0, 0], 1, [0, 0, 0], this.body);
      mesh(sphereG(1, 16, 12), M(pawCol), [0, 0, 0.03], [0.078, 0.066, 0.085], [0, 0, 0], hand);
      for (let k = -1; k <= 1; k++) mesh(sphereG(0.026, 10, 8), M(pawCol), [k * 0.034, 0.012, 0.1], 1, [0, 0, 0], hand);
      // 엄지는 몸 안쪽 (손바닥을 아래로 둘 때 오른손·왼손 모두 엄지가 가운데 쪽에 와요)
      const thumb = mesh(sphereG(0.028, 10, 8), M(pawCol), [-side * 0.065, 0.018, 0.045], 1, [0, 0, 0], hand);
      if (s.kind !== 'human') mesh(sphereG(1, 10, 8), M('#E9A0A8', { rim: 0.2 }), [0, -0.055, 0.04], [0.035, 0.012, 0.03], [0, 0, 0], hand);
      const rest = V(side * 0.3, 0.26, 0.08);
      this.arms.push({ side, shoulder, upper, fore, elbow, joint, cuff, hand, thumb, cur: rest.clone(), target: rest.clone(), aim: null, aimCur: V(0, -0.4, 1).normalize(), thumbUp: false, thumbW: 0 });
    }
    // 젓가락 (손님의 오른손 = arms[0], 몸 -x 쪽. 마주 보는 내 쪽에서는 화면 왼쪽): 엄지와 손가락 사이로 지나가게 엄지 쪽·손가락 아래로 조금 비켜 쥐고, 윗동이 주먹 뒤로 삐져나와요
    for (const dx of [-0.011, 0.011]) mesh(cylG(0.0045, 0.0065, 0.28, 6), M('#B9763E', { spec: 0.4 }), [CHOP_X + dx, CHOP_Y, 0.09], 1, [PI / 2, 0, dx * 1.4], this.chop);
    this.chop.visible = false;
    this.arms[0].hand.add(this.chop);
    // 머리
    this.headPivot.position.set(0, 0.58, 0);
    this.body.add(this.headPivot);
    this.head.position.set(0, 0.3, 0);
    this.headPivot.add(this.head);
    mesh(sphereG(HR, 32, 24), M(fur, { noise: 1.4 }), [0, 0, 0], 1, [0, 0, 0], this.head);

    // 얼굴 (눈은 머리 앞쪽에 붙인 얇은 껍질에 그려요)
    this.eyeTex = cellTex(true, s.kind === 'panda' ? '#2E2E2E' : s.kind === 'raccoon' || s.kind === 'meerkat' || s.kind === 'sloth' ? (s.mark ?? '#4A403A') : '');
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
      capybara: { r: 0.15, sx: 1.3, sy: 0.95, sz: 0.95, y: -0.07, z: 0.24 },
      quokka: { r: 0.1, sx: 1.1, sy: 0.85, sz: 0.9, y: -0.09, z: 0.28 },
      redpanda: { r: 0.1, sx: 1.1, sy: 0.85, sz: 0.95, y: -0.09, z: 0.28 },
      fennec: { r: 0.095, sx: 1.0, sy: 0.85, sz: 1.15, y: -0.09, z: 0.29 },
      cow: { r: 0.15, sx: 1.4, sy: 0.9, sz: 0.85, y: -0.11, z: 0.24 },
      horse: { r: 0.14, sx: 1.1, sy: 0.9, sz: 1.15, y: -0.11, z: 0.25 },
      zebra: { r: 0.14, sx: 1.1, sy: 0.9, sz: 1.15, y: -0.11, z: 0.25 },
      unicorn: { r: 0.14, sx: 1.1, sy: 0.9, sz: 1.15, y: -0.11, z: 0.25 },
      wolf: { r: 0.12, sx: 1.05, sy: 0.8, sz: 1.15, y: -0.09, z: 0.27 },
      rhino: { r: 0.15, sx: 1.25, sy: 0.9, sz: 0.95, y: -0.1, z: 0.24 },
      skunk: { r: 0.1, sx: 1.05, sy: 0.85, sz: 1.0, y: -0.09, z: 0.28 },
      dino: { r: 0.14, sx: 1.25, sy: 0.85, sz: 0.95, y: -0.09, z: 0.25 },
      dragon: { r: 0.13, sx: 1.2, sy: 0.85, sz: 1.05, y: -0.09, z: 0.26 },
      meerkat: { r: 0.09, sx: 1.0, sy: 0.85, sz: 1.2, y: -0.08, z: 0.29 },
      walrus: { r: 0.15, sx: 1.45, sy: 0.85, sz: 0.75, y: -0.1, z: 0.25 },
      crocodile: { r: 0.12, sx: 1.25, sy: 0.62, sz: 1.9, y: -0.1, z: 0.3 },
      cheetah: { r: 0.11, sx: 1.2, sy: 0.85, sz: 0.8, y: -0.09, z: 0.27 },
      boar: { r: 0.12, sx: 1.15, sy: 0.9, sz: 1.05, y: -0.09, z: 0.27 },
      moose: { r: 0.15, sx: 1.2, sy: 0.95, sz: 1.2, y: -0.11, z: 0.24 },
      lynx: { r: 0.11, sx: 1.2, sy: 0.85, sz: 0.8, y: -0.09, z: 0.27 },
      badger: { r: 0.11, sx: 1.05, sy: 0.8, sz: 1.1, y: -0.09, z: 0.28 },
      yak: { r: 0.14, sx: 1.3, sy: 0.9, sz: 0.9, y: -0.1, z: 0.25 },
    };
    const sn = snoutKinds[s.kind];
    const noseOnly: ChibiSpec['kind'][] = ['rabbit', 'cat', 'hamster', 'human', 'monkey', 'mole', 'pig', 'sheep', 'turtle', 'frog', 'panda', 'seal', 'sloth', 'bee', 'axolotl', 'gorilla', 'shark', 'bat'];
    const beakKinds: ChibiSpec['kind'][] = ['duck', 'chick', 'penguin', 'owl', 'parrot', 'sparrow', 'crow', 'peacock', 'rooster', 'eagle', 'pelican'];

    if (sn) this.faceReach = Math.max(0, sn.z + sn.r * sn.sz - HR);
    else if (s.kind === 'pelican') this.faceReach = 0.3;
    else if (s.kind === 'duck') this.faceReach = 0.08;
    else if (beakKinds.includes(s.kind)) this.faceReach = 0.05;
    else if (s.kind === 'elephant') this.faceReach = 0.18;
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
      else if (s.kind === 'pelican') {
        // 길쭉한 부리와 아래 주머니 (말할 때 통째로 위아래로 움직여요)
        const g = group(this.head, [0, -0.07, 0.33]);
        mesh(sphereG(1), M(bc), [0, 0, 0.13], [0.065, 0.032, 0.2], [0.12, 0, 0], g);
        mesh(sphereG(1), M(lighten(bc, 0.3)), [0, -0.045, 0.1], [0.055, 0.05, 0.15], [0.12, 0, 0], g);
        this.beak = g;
      } else if (s.kind === 'parrot' || s.kind === 'eagle') {
        // 아래로 굽은 부리
        const g = group(this.head, [0, -0.04, 0.32]);
        mesh(coneG(0.065, 0.11, 14), M(bc), [0, 0, 0.04], [1, 1, 0.85], [PI / 2 + 0.35, 0, 0], g);
        mesh(sphereG(1), M(bc), [0, -0.05, 0.08], [0.03, 0.04, 0.03], [0, 0, 0], g);
        mesh(sphereG(1), M(darken(bc, 0.25)), [0, -0.035, 0.02], [0.045, 0.02, 0.04], [0, 0, 0], g);
        this.beak = g;
      } else this.beak = mesh(coneG(s.kind === 'sparrow' ? 0.035 : 0.05, s.kind === 'sparrow' ? 0.07 : 0.1, 12), M(bc), [0, -0.06, 0.35], [1, 1, 0.8], [PI / 2 + 0.5, 0, 0], this.head);
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
      // ── 행사용으로 더한 생김새 ─────────────────────────
      case 'capybara':
        earRound(0.2, 0.2, 0.05);
        // 머리 위에 귤 하나 (카피바라는 귤을 좋아해요)
        mesh(sphereG(0.075, 16, 12), M('#F5A33B', { noise: 1.5 }), [0.04, 0.37, -0.02], [1, 0.9, 1], [0, 0, 0], h);
        mesh(sphereG(1), M('#6FA34E'), [0.06, 0.445, -0.02], [0.035, 0.012, 0.02], [0, 0, 0.4], h);
        break;
      case 'quokka':
        earRound(0.21, 0.23, 0.08);
        for (const sd of [-1, 1]) mesh(sphereG(1), M(fur2), [sd * 0.17, -0.1, 0.24], [0.08, 0.07, 0.06], [0, 0, 0], h);
        break;
      case 'redpanda':
        earTri(0.2, 0.2, 0.15, 0.1, 0.35, fur, '#FFFFFF');
        for (const sd of [-1, 1]) {
          mesh(sphereG(1), M('#FFFFFF'), [sd * 0.11, 0.15, 0.27], [0.05, 0.035, 0.03], [0, 0, 0], h);
          mesh(sphereG(1), M(mark), [sd * 0.13, -0.06, 0.29], [0.02, 0.06, 0.02], [0, 0, sd * 0.3], h);
        }
        tailTube(fur, [[0, 0.1, -0.24], [0.15, 0.15, -0.4], [0.3, 0.32, -0.42], [0.32, 0.55, -0.34]], 0.08);
        for (const [x, y, z] of [[0.15, 0.15, -0.4], [0.27, 0.27, -0.42], [0.32, 0.43, -0.39]]) mesh(torusG(0.08, 0.02, 6, 16), M(mark), [x, y, z], 1, [0.6, 0.6, 0], this.body);
        break;
      case 'fennec':
        earTri(0.19, 0.17, 0.36, 0.14, 0.42, fur, fur2);
        this.disc(fur2, 0.6, -0.14, 1.25);
        tailTube(fur, [[0, 0.1, -0.24], [0.15, 0.12, -0.42], [0.3, 0.3, -0.42]], 0.08);
        mesh(sphereG(0.08), M(mark), [0.3, 0.32, -0.42], 1, [0, 0, 0], this.body);
        break;
      case 'seal':
        for (const sd of [-1, 1]) mesh(sphereG(1), M(fur2), [sd * 0.055, -0.09, 0.3], [0.065, 0.05, 0.05], [0, 0, 0], h);
        mesh(sphereG(1), M(INK, { rim: 0.4 }), [0, -0.045, 0.33], [0.04, 0.028, 0.025], [0, 0, 0], h);
        whiskers(-0.09, 0.32);
        for (const [x, y] of [[-0.18, 0.22], [0.12, 0.27], [0.24, 0.12], [-0.25, 0.05]]) mesh(sphereG(1), M(mark), [x, y, Math.sqrt(Math.max(0, HR * HR - x * x - y * y)) - 0.01], [0.03, 0.03, 0.015], [0, 0, 0], h);
        break;
      case 'cow':
        for (const sd of [-1, 1]) {
          mesh(coneG(0.03, 0.1, 10), M('#F3E9D2'), [sd * 0.17, 0.3, -0.02], 1, [0, 0, sd * -0.6], h);
          mesh(sphereG(1), M(fur), [sd * 0.33, 0.12, -0.02], [0.11, 0.045, 0.06], [0, 0, sd * -0.25], h);
          mesh(sphereG(0.018), M(darken(fur2, 0.45)), [sd * 0.05, -0.08, 0.37], 1, [0, 0, 0], h);
        }
        this.shell(mark, FRONT + 0.6, 0.7, 0.35, 0.45);
        this.shell(mark, FRONT + PI, 0.9, 0.2, 0.6);
        break;
      case 'horse': case 'zebra': case 'unicorn': {
        earTri(0.14, 0.25, 0.14, 0.055, 0.12);
        for (const sd of [-1, 1]) mesh(sphereG(0.018), M(darken(fur2, 0.45)), [sd * 0.05, -0.09, 0.4], 1, [0, 0, 0], h);
        const maneCols = s.kind === 'unicorn' ? ['#F2A7B8', '#F7D560', '#A8D08D', '#8EC5E8', '#B9A3DB'] : [mark];
        // 앞머리 한 줌 + 정수리에서 뒤로 이어지는 갈기
        mesh(sphereG(1), M(maneCols[0], { noise: 2 }), [0.03, 0.3, 0.17], [0.07, 0.06, 0.05], [0.5, 0, 0.3], h);
        for (let i = 0; i < 6; i++) {
          const a = 0.25 + i * 0.36;
          mesh(sphereG(1), M(maneCols[(i + 1) % maneCols.length], { noise: 2 }), [0, Math.cos(a) * 0.35, -Math.sin(a) * 0.35], [0.06, 0.09, 0.07], [-a, 0, 0], h);
        }
        if (s.kind === 'zebra') {
          for (const th of [0.42, 0.72]) this.shell(mark, FRONT, 1.1, th, 0.07);
          for (const sd of [-1, 1]) for (const th of [1.15, 1.5, 1.85]) this.shell(mark, FRONT + sd * 1.15, 0.45, th, 0.07);
        }
        if (s.kind === 'unicorn') {
          const horn = group(h, [0, 0.3, 0.16]); horn.rotation.x = 0.45;
          mesh(coneG(0.04, 0.2, 14), M('#F7D560', { spec: 0.6 }), [0, 0.1, 0], 1, [0, 0, 0], horn);
          for (let i = 0; i < 3; i++) mesh(torusG(0.03 - i * 0.008, 0.006, 6, 14), M('#FFF4C8'), [0, 0.04 + i * 0.05, 0], 1, [PI / 2, 0, 0], horn);
        }
        tailTube(mark, [[0, 0.15, -0.25], [0.05, 0.1, -0.4], [0.1, -0.05, -0.45]], 0.05);
        break;
      }
      case 'bee':
        for (const sd of [-1, 1]) {
          mesh(cylG(0.008, 0.008, 0.16, 6), M(INK), [sd * 0.08, 0.38, 0.05], 1, [0.3, 0, sd * -0.35], h);
          mesh(sphereG(0.03), M(INK), [sd * 0.115, 0.46, 0.08], 1, [0, 0, 0], h);
          // 날개 (등 뒤, 반투명)
          mesh(sphereG(1), M('#EAF6FF', { alpha: 0.7, rim: 0.6 }), [sd * 0.2, 0.52, -0.24], [0.16, 0.09, 0.02], [0.3, sd * 0.4, sd * 0.5], this.body);
        }
        this.shell(mark, FRONT + PI, PI * 1.3, 0.35, 0.18);
        this.shell(mark, FRONT + PI, PI * 1.5, 0.8, 0.2);
        break;
      case 'axolotl':
        for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) {
          const g = group(h, [sd * 0.3, 0.12 - i * 0.1, -0.04]);
          g.rotation.z = sd * (-0.9 + i * 0.45);
          mesh(capsuleG(0.03, 0.12), M(mark), [0, 0.09, 0], 1, [0, 0, 0], g);
          for (let k = 0; k < 3; k++) mesh(sphereG(0.022), M(lighten(mark, 0.2)), [sd * 0.025, 0.04 + k * 0.045, 0], 1, [0, 0, 0], g);
        }
        break;
      case 'dino': case 'dragon':
        for (let i = 0; i < 5; i++) {
          const a = 0.2 + i * 0.42;
          mesh(coneG(0.045 - i * 0.004, 0.11, 8), M(mark), [0, Math.cos(a) * 0.33, -Math.sin(a) * 0.33], 1, [-a, 0, 0], h);
        }
        for (const sd of [-1, 1]) mesh(sphereG(0.02), M(darken(fur2, 0.4)), [sd * 0.05, -0.05, 0.4], 1, [0, 0, 0], h);
        tailTube(fur, [[0, 0.12, -0.22], [0.1, 0.08, -0.42], [0.25, 0.05, -0.55], [0.38, 0.1, -0.6]], 0.09);
        if (s.kind === 'dragon') {
          for (const sd of [-1, 1]) {
            const g = tube([[sd * 0.12, 0.26, 0.02], [sd * 0.18, 0.4, -0.04], [sd * 0.17, 0.5, -0.14]], 0.028, 12);
            const m = mesh(g, M('#F3E9D2'), [0, 0, 0], 1, [0, 0, 0], h); m.userData.ownGeo = true;
            mesh(sphereG(1), M(mark, { alpha: 0.95 }), [sd * 0.25, 0.55, -0.25], [0.2, 0.12, 0.02], [0.2, sd * 0.5, sd * 0.6], this.body);
          }
        }
        break;
      case 'parrot':
        for (let i = 0; i < 3; i++) mesh(capsuleG(0.035, 0.1), M(['#E3645A', '#F7D560', '#6FB3E0'][i]), [(i - 1) * 0.05, 0.38, -0.02 - i * 0.02], 1, [-0.4, 0, (i - 1) * 0.35], h);
        for (const sd of [-1, 1]) mesh(sphereG(1), M(fur2), [sd * 0.15, -0.04, 0.27], [0.08, 0.07, 0.05], [0, 0, 0], h);
        break;
      case 'sparrow':
        this.shell(mark, FRONT, PI * 2, 0, 0.75);
        for (const sd of [-1, 1]) mesh(sphereG(1), M(fur2), [sd * 0.2, -0.05, 0.24], [0.08, 0.07, 0.05], [0, 0, 0], h);
        mesh(sphereG(1), M(INK), [0, -0.17, 0.28], [0.06, 0.035, 0.03], [0, 0, 0], h);
        break;
      case 'bat':
        earTri(0.2, 0.2, 0.26, 0.13, 0.5, fur, fur2);
        mesh(sphereG(1), M(darken(fur, 0.2)), [0, -0.05, 0.33], [0.045, 0.03, 0.03], [0, 0, 0], h);
        for (const sd of [-1, 1]) {
          mesh(coneG(0.012, 0.03, 6), M('#FFFFFF'), [sd * 0.035, -0.135, 0.31], 1, [PI, 0, 0], h);
          const w = group(this.body, [sd * 0.18, 0.52, -0.2]);
          w.rotation.set(0.2, sd * 0.5, sd * 0.35);
          for (let k = 0; k < 3; k++) mesh(sphereG(1), M(mark), [sd * (0.08 + k * 0.1), -k * 0.04, 0], [0.11, 0.15 - k * 0.02, 0.015], [0, 0, sd * 0.3], w);
        }
        break;
      case 'wolf':
        earTri(0.19, 0.22, 0.22, 0.1, 0.25, fur, fur2);
        this.disc(fur2, 0.6, -0.15, 1.25);
        tailTube(fur, [[0, 0.1, -0.24], [0.12, 0.1, -0.42], [0.25, 0.2, -0.5]], 0.1);
        mesh(sphereG(0.1), M(fur2), [0.25, 0.2, -0.5], [1, 1, 1.2], [0, 0, 0], this.body);
        break;
      case 'rhino':
        earTri(0.18, 0.24, 0.12, 0.06, 0.2);
        mesh(coneG(0.075, 0.26, 14), M('#E8DCC8'), [0, 0.0, 0.42], 1, [0.35, 0, 0], h);
        mesh(coneG(0.035, 0.1, 12), M('#E8DCC8'), [0, 0.1, 0.33], 1, [0.4, 0, 0], h);
        break;
      case 'sloth':
        this.disc(fur2, 0.8, -0.02, 1.15);
        earRound(0.27, 0.1, 0.05);
        break;
      case 'skunk':
        earRound(0.2, 0.22, 0.07);
        this.shell('#FFFFFF', FRONT, 0.3, 0.05, 1.0, 0.004);
        tailTube(fur, [[0, 0.1, -0.24], [0.05, 0.3, -0.48], [0.02, 0.62, -0.46], [-0.06, 0.82, -0.3]], 0.13);
        tailTube('#FFFFFF', [[0, 0.12, -0.3], [0.05, 0.32, -0.56], [0.02, 0.64, -0.55], [-0.07, 0.86, -0.38]], 0.045);
        break;
      case 'meerkat':
        for (const sd of [-1, 1]) mesh(sphereG(1), M(darken(fur, 0.15)), [sd * 0.31, 0.04, 0], [0.05, 0.06, 0.04], [0, 0, 0], h);
        tailTube(fur, [[0, 0.1, -0.24], [0.05, 0.05, -0.42], [0.1, 0.15, -0.55], [0.12, 0.35, -0.55]], 0.03);
        break;
      case 'walrus':
        for (const sd of [-1, 1]) {
          mesh(sphereG(1), M(fur2), [sd * 0.07, -0.1, 0.3], [0.09, 0.07, 0.07], [0, 0, 0], h);
          mesh(coneG(0.025, 0.2, 10), M('#FFFDF5', { spec: 0.5 }), [sd * 0.06, -0.25, 0.3], 1, [PI + 0.15, 0, sd * 0.1], h);
        }
        for (let i = 0; i < 6; i++) mesh(sphereG(0.008), M(INK), [(i % 3 - 1) * 0.04 + (i < 3 ? -0.07 : 0.07), -0.09 - (i % 2) * 0.02, 0.37], 1, [0, 0, 0], h);
        break;
      case 'crocodile':
        for (const sd of [-1, 1]) {
          mesh(sphereG(0.07), M(fur), [sd * 0.1, 0.2, 0.24], 1, [0, 0, 0], h);
          for (let i = 0; i < 4; i++) mesh(coneG(0.012, 0.03, 6), M('#FFFFFF'), [sd * 0.12, -0.14, 0.32 + i * 0.05], 1, [PI, 0, 0], h);
          mesh(sphereG(0.015), M(darken(fur, 0.3)), [sd * 0.035, -0.04, 0.51], 1, [0, 0, 0], h);
        }
        for (let i = 0; i < 4; i++) mesh(coneG(0.035, 0.07, 6), M(mark), [0, 0.33 - i * 0.08, -0.08 - i * 0.08], 1, [-0.4 - i * 0.3, 0, 0], h);
        tailTube(fur, [[0, 0.12, -0.22], [0.1, 0.05, -0.45], [0.25, 0.02, -0.6]], 0.07);
        break;
      case 'gorilla':
        this.disc(fur2, 0.75, -0.06, 1.15);
        mesh(sphereG(1), M(fur), [0, 0.13, 0.25], [0.24, 0.05, 0.09], [0, 0, 0], h);
        for (const sd of [-1, 1]) mesh(sphereG(1), M(fur2), [sd * 0.34, 0.0, -0.02], [0.05, 0.07, 0.04], [0, 0, 0], h);
        mesh(sphereG(1), M(fur), [0, 0.33, -0.05], [0.12, 0.08, 0.14], [0, 0, 0], h);
        break;
      case 'crow':
        this.disc(fur2, 0.72, -0.04, 1.1);
        for (let i = 0; i < 3; i++) mesh(capsuleG(0.025, 0.07), M(fur), [(i - 1) * 0.04, 0.37, -0.04], 1, [-0.6, 0, (i - 1) * 0.4], h);
        break;
      case 'peacock': {
        for (let i = 0; i < 3; i++) {
          mesh(cylG(0.006, 0.006, 0.12, 5), M(fur), [(i - 1) * 0.05, 0.4, -0.02], 1, [0, 0, (i - 1) * 0.35], h);
          mesh(sphereG(0.025), M('#6FB3E0'), [(i - 1) * 0.09, 0.47, -0.02], 1, [0, 0, 0], h);
        }
        for (let i = 0; i < 9; i++) {
          const a = -1.2 + i * 0.3;
          const g = group(this.body, [Math.sin(a) * 0.42, 0.42 + Math.cos(a) * 0.42, -0.34]);
          g.rotation.set(-0.25, 0, -a);
          mesh(sphereG(1), M('#3E9C7A', { noise: 1.5 }), [0, 0, 0], [0.09, 0.2, 0.02], [0, 0, 0], g);
          mesh(sphereG(1), M('#F2C14E'), [0, 0.1, 0.012], [0.05, 0.05, 0.01], [0, 0, 0], g);
          mesh(sphereG(1), M('#2F5A8C'), [0, 0.1, 0.02], [0.028, 0.028, 0.01], [0, 0, 0], g);
        }
        break;
      }
      case 'shark':
        mesh(coneG(0.1, 0.22, 3), M(fur), [0, 0.38, -0.08], [0.35, 1, 1.4], [-0.35, 0, 0], h);
        this.disc(fur2, 0.7, -0.14, 1.3);
        for (const sd of [-1, 1]) {
          mesh(sphereG(1), M(fur), [sd * 0.36, -0.04, -0.02], [0.03, 0.1, 0.14], [0.6, 0, sd * 0.5], h);
          for (let i = 0; i < 3; i++) mesh(boxG(0.006, 0.07, 0.012), M(darken(fur, 0.25)), [sd * 0.29, 0.02, 0.12 - i * 0.05], 1, [0, sd * 0.9, 0], h);
        }
        break;
      case 'cheetah':
        earRound(0.2, 0.25, 0.07);
        this.disc(fur2, 0.6, -0.14, 1.25);
        for (const sd of [-1, 1]) mesh(capsuleG(0.008, 0.1), M(INK), [sd * 0.13, -0.06, 0.3], 1, [0.3, 0, sd * -0.15], h);
        for (const [x, y] of [[-0.15, 0.24], [0.05, 0.28], [0.2, 0.2], [-0.25, 0.08], [0.26, 0.04], [-0.05, 0.18], [0.14, 0.12]]) mesh(sphereG(1), M(mark), [x, y, Math.sqrt(Math.max(0, HR * HR - x * x - y * y)) - 0.005], [0.022, 0.022, 0.012], [0, 0, 0], h);
        tailTube(fur, [[0, 0.1, -0.24], [0.15, 0.1, -0.42], [0.3, 0.25, -0.45], [0.32, 0.45, -0.38]], 0.035);
        break;
      case 'rooster':
        for (let i = 0; i < 3; i++) mesh(sphereG(0.05 + (i === 1 ? 0.015 : 0)), M('#E3453A'), [0, 0.34 + (i === 1 ? 0.03 : 0), 0.06 - i * 0.08], 1, [0, 0, 0], h);
        mesh(sphereG(1), M('#E3453A'), [0, -0.16, 0.32], [0.03, 0.06, 0.03], [0, 0, 0], h);
        for (let i = 0; i < 5; i++) mesh(capsuleG(0.03, 0.2), M(i % 2 ? '#2F5A8C' : '#3E9C7A'), [0, 0.45, -0.3], 1, [-0.9 + i * 0.25, 0, 0], this.body);
        break;
      case 'boar':
        earTri(0.18, 0.22, 0.14, 0.07, 0.4);
        mesh(cylG(0.06, 0.065, 0.03, 16), M(fur2), [0, -0.09, 0.4], [1.1, 1, 0.9], [PI / 2, 0, 0], h);
        for (const sd of [-1, 1]) {
          mesh(sphereG(0.012), M(darken(fur2, 0.45)), [sd * 0.025, -0.09, 0.415], 1, [0, 0, 0], h);
          mesh(coneG(0.018, 0.09, 8), M('#FFFDF5'), [sd * 0.1, -0.1, 0.34], 1, [0, 0, sd * -0.4], h);
        }
        for (let i = 0; i < 5; i++) mesh(coneG(0.03, 0.08, 6), M(mark), [0, 0.32 - i * 0.06, 0.05 - i * 0.08], 1, [-0.2 - i * 0.3, 0, 0], h);
        break;
      case 'moose':
        earTri(0.25, 0.14, 0.13, 0.06, 0.9);
        for (const sd of [-1, 1]) {
          const g = group(h, [sd * 0.14, 0.3, -0.04]);
          g.rotation.z = sd * -0.7;
          mesh(cylG(0.02, 0.025, 0.1, 8), M('#C9A06A'), [0, 0.04, 0], 1, [0, 0, 0], g);
          mesh(sphereG(1), M('#D9B47E', { noise: 1.5 }), [0, 0.15, 0], [0.13, 0.08, 0.02], [0, 0, 0], g);
          for (let k = 0; k < 4; k++) mesh(coneG(0.018, 0.06, 6), M('#D9B47E'), [-0.1 + k * 0.065, 0.22, 0], 1, [0, 0, 0], g);
        }
        break;
      case 'eagle':
        for (const sd of [-1, 1]) mesh(sphereG(1), M(darken(fur, 0.15)), [sd * 0.1, 0.11, 0.28], [0.08, 0.025, 0.04], [0, 0, sd * -0.3], h);
        break;
      case 'lynx':
        earTri(0.19, 0.2, 0.2, 0.1, 0.25, fur, fur2);
        for (const sd of [-1, 1]) {
          mesh(coneG(0.012, 0.09, 6), M(INK), [sd * 0.245, 0.43, 0], 1, [0, 0, sd * -0.25], h);
          mesh(coneG(0.08, 0.16, 8), M(fur2), [sd * 0.3, -0.16, 0.05], [1, 1, 0.6], [0, 0, sd * 2.3], h);
        }
        this.disc(fur2, 0.6, -0.14, 1.25);
        break;
      case 'badger':
        earRound(0.24, 0.18, 0.06, '#FFFFFF', '#FFFFFF');
        for (const sd of [-1, 1]) this.shell(mark, FRONT + sd * 0.42, 0.3, 0.15, 1.15, 0.004);
        this.shell('#FFFFFF', FRONT, 0.32, 0.05, 1.1, 0.005);
        break;
      case 'yak':
        for (const sd of [-1, 1]) {
          const g = tube([[sd * 0.2, 0.18, 0], [sd * 0.34, 0.24, 0.02], [sd * 0.4, 0.36, 0.06], [sd * 0.36, 0.44, 0.1]], 0.035, 16);
          const m = mesh(g, M('#EDE3CF'), [0, 0, 0], 1, [0, 0, 0], h); m.userData.ownGeo = true;
          mesh(sphereG(1), M(fur), [sd * 0.33, 0.06, 0], [0.1, 0.04, 0.05], [0, 0, sd * -0.3], h);
        }
        for (let i = 0; i < 9; i++) { const a = -0.9 + i * 0.22; mesh(sphereG(0.07), M(mark, { noise: 2 }), [Math.sin(a) * 0.25, 0.22 + Math.cos(a * 1.5) * 0.04, 0.2], [1, 1.3, 0.8], [0, 0, 0], h); }
        break;
      case 'pelican':
        for (let i = 0; i < 3; i++) mesh(capsuleG(0.02, 0.06), M(fur2), [(i - 1) * 0.03, 0.36, -0.08], 1, [-0.9, 0, (i - 1) * 0.3], h);
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
      case 'bob':
        // 단발머리: 정수리 + 귀밑까지 내려오는 옆·뒷머리 + 앞머리 (얼굴 쪽은 비워요)
        mesh(shellG(HR + 0.012, PI * 1.5, PI * 2, 0, 1.3), M(hair, { side: THREE.DoubleSide }), [0, 0, 0], 1, [0, 0, 0], h);
        mesh(shellG(HR + 0.022, PI * 1.5, PI * 2 - 2.0, 0.8, 1.25), M(hair, { side: THREE.DoubleSide }), [0, 0, 0], 1, [0, 0, 0], h);
        mesh(sphereG(1), M(hair), [0, 0.215, 0.245], [0.2, 0.06, 0.075], [-0.55, 0, 0], h);
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
  // 세상 좌표로 손 목표를 정해 두면 몸이 숙여지는 동안에도 매 프레임 다시 맞춰요
  private handW: ({ p: THREE.Vector3; aim: THREE.Vector3 | null } | null)[] = [null, null];
  setHandWorld(side: number, p: THREE.Vector3, aim: THREE.Vector3 | null = null) {
    this.handW[side] = { p: p.clone(), aim: aim ? aim.clone() : null };
  }
  setHand(side: number, p: THREE.Vector3, aim: THREE.Vector3 | null = null) {
    this.handW[side] = null;
    const arm = this.arms[side];
    arm.target.copy(p);
    arm.aim = aim ? aim.clone().normalize() : null;
  }
  toLocal(w: THREE.Vector3) { return this.body.worldToLocal(w.clone()); }
  toWorld(l: THREE.Vector3) { return this.body.localToWorld(l.clone()); }
  mouthWorld() { return this.head.localToWorld(V(0, -0.15, HR * 0.92)); }
  chopTipWorld() { return this.chop.localToWorld(V(CHOP_X, CHOP_Y, 0.23)); }
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
    L.target.copy(this.restFor(-1)); R.target.copy(this.restFor(1)); L.aim = null; R.aim = null; L.thumbUp = R.thumbUp = false;
    if (this.walking) {
      const sw = Math.sin(this.walkPhase);
      L.target.z -= sw * 0.12; R.target.z += sw * 0.12; // 아래에서 좌우를 뒤집으니 부호도 반대로 (다리와 엇갈리게)
      L.target.y += Math.abs(sw) * 0.03; R.target.y += Math.abs(sw) * 0.03;
    }
    switch (this.act) {
      case 'talk':
        R.target.set(0.24 + Math.sin(t * 3.1) * 0.03, 0.66 + Math.sin(t * 4.3) * 0.05, 0.3);
        R.aim = V(0.3, 0.6, 1);
        break;
      case 'wave':
        // 손은 머리 옆 높이에서 흔들어요 (팔꿈치를 굽혀서, 팔이 길게 늘어나지 않게)
        R.target.set(0.34 + Math.sin(t * 11) * 0.06, 0.84, 0.22);
        R.aim = V(0, 1, 0.3);
        this.headExtra.z = -0.08;
        break;
      case 'bow':
        lean = 0.42 * Math.sin(Math.min(1, k / 1.4) * PI);
        this.headExtra.x = lean * 0.6;
        L.target.set(-0.08, 0.45, 0.3); R.target.set(0.08, 0.45, 0.3);
        break;
      case 'cheer':
        L.target.set(-0.31, 0.9 + Math.sin(t * 9) * 0.04, 0.16); R.target.set(0.31, 0.9 + Math.sin(t * 9 + 1) * 0.04, 0.16);
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
        // 엄지 척: 주먹 쥔 손가락은 나를 보고, 엄지는 위로 세워요
        R.target.set(0.22, 0.7, 0.32); R.aim = V(-0.15, 0.2, 1); R.thumbUp = true;
        this.headExtra.z = -0.06;
        break;
      case 'scratch':
        R.target.set(0.35 + Math.sin(t * 14) * 0.015, 0.9, 0.06); R.aim = V(-0.6, 0.6, 0.2);
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
    this.mirrorPose();
  }

  // 위 자세들은 마주 보는 내 쪽에서 오른쪽에 있는 손(R)을 주로 쓰게 적었어요. 그 손은 손님에게 왼손이라,
  // 좌우를 뒤집어 손님의 오른손(arms[0])이 말하기·손 흔들기·엄지 척을 하게 해요 (두 손을 같이 쓰는 자세는 그대로예요)
  private mirrorPose() {
    const [a, b] = this.arms;
    const ta = a.target.clone(), tb = b.target.clone(), ma = a.aim, mb = b.aim, ua = a.thumbUp;
    a.target.set(-tb.x, tb.y, tb.z); b.target.set(-ta.x, ta.y, ta.z);
    a.aim = mb ? V(-mb.x, mb.y, mb.z) : null; b.aim = ma ? V(-ma.x, ma.y, ma.z) : null;
    a.thumbUp = b.thumbUp; b.thumbUp = ua;
    this.headExtra.y = -this.headExtra.y; this.headExtra.z = -this.headExtra.z;
  }

  // 두 마디 팔: 손까지 거리보다 팔 길이를 조금 길게 잡아 팔꿈치가 자연스럽게 굽어요.
  // 팔꿈치는 바깥쪽 아래로. 아주 멀면(0.56 넘게) 곧게 펴지며 조금 늘어나요
  private updateArm(arm: Arm, dt: number) {
    const k = 1 - Math.exp(-dt * 14);
    arm.cur.lerp(arm.target, k);
    const a = arm.shoulder, b = arm.cur;
    const SB = b.clone().sub(a);
    const d = Math.max(0.02, SB.length());
    const dir = SB.divideScalar(d);
    // 가까울수록 팔꿈치를 더 굽히고(×1.25), 멀리 뻗을수록 덜 굽혀서(×1.1) 팔이 길어 보이지 않게
    const bend = 1.25 - 0.15 * Math.min(1, Math.max(0, (d - 0.3) / 0.15));
    const total = Math.max(d, Math.min(d * bend, ARM_MAX));
    const seg = total / 2;
    const x = d / 2, hgt = Math.sqrt(Math.max(0, seg * seg - x * x));
    // 팔꿈치는 옆으로 벌어지고 조금 아래로 (손을 들 때 겨드랑이를 벌리는 모양)
    const pole = V(arm.side, -0.65, -0.2);
    pole.addScaledVector(dir, -pole.dot(dir));
    if (pole.lengthSq() < 1e-6) pole.set(arm.side, 0, 0);
    pole.normalize();
    const E = a.clone().addScaledVector(dir, x).addScaledVector(pole, hgt);
    const bone = (mh: THREE.Mesh, A: THREE.Vector3, B: THREE.Vector3, trim: number) => {
      const v = B.clone().sub(A); const len = Math.max(1e-3, v.length());
      mh.position.copy(A).addScaledVector(v, 0.5);
      mh.quaternion.setFromUnitVectors(UP, v.divideScalar(len));
      mh.scale.set(1, Math.max(0.01, len - trim), 1);
    };
    bone(arm.upper, a, E, 0);
    bone(arm.fore, E, b, 0.03);
    arm.elbow.position.copy(E);
    const fdir = b.clone().sub(E).normalize();
    arm.cuff.position.copy(b).addScaledVector(fdir, -0.05);
    arm.cuff.quaternion.setFromUnitVectors(V(0, 0, 1), fdir);
    const wantAim = arm.aim ?? fdir.clone().add(V(0, -0.35, 0.4)).normalize();
    arm.aimCur.lerp(wantAim, k).normalize();
    arm.hand.position.copy(b);
    // 엄지 척일 때는 손을 옆으로 세워 엄지(-side 쪽)가 위를 보게 돌려요
    arm.thumbW += ((arm.thumbUp ? 1 : 0) - arm.thumbW) * k;
    const up = Math.abs(arm.aimCur.y) > 0.95 ? V(0, 0, 1) : UP.clone();
    if (arm.thumbW > 0.001) up.lerp(V(arm.side, 0, 0), arm.thumbW).normalize();
    const m = new THREE.Matrix4().lookAt(V(), arm.aimCur.clone().negate(), up);
    arm.hand.quaternion.setFromRotationMatrix(m);
    // 세운 엄지는 조금 길게
    arm.thumb.scale.set(1 + arm.thumbW * 0.9, 1, 1);
    arm.thumb.position.x = -arm.side * (0.065 + arm.thumbW * 0.03);
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
    // 말하지 않을 때는 부리·코를 닫아 둬요 (벌린 채로 먹지 않게)
    if (this.chewing || !this.talking) {
      if (this.beak) this.beak.scale.y = this.spec.kind === 'duck' ? 0.05 : 1;
      if (this.trunk) this.trunk.rotation.x = 0;
    }

    // 걷기
    if (this.walking > 0) this.walkPhase += dt * 11;
    const sw = this.walking > 0 ? Math.sin(this.walkPhase) : 0;
    this.legs.forEach((l, i) => {
      const want = this.seated ? -1.25 + Math.sin(t * 1.6 + i * 2) * 0.12 : sw * (i ? -0.7 : 0.7);
      l.rotation.x += (want - l.rotation.x) * Math.min(1, dt * 12);
    });

    // 팔 목표 정하기
    if (this.manual) this.arms[0].thumbUp = this.arms[1].thumbUp = false; // 손을 따로 움직일 때는 엄지를 접어요
    else {
      this.actTargets(t);
      if (this.bounce > 0 && this.act === 'idle') {
        const s2 = Math.sin(t * 9) * 0.5;
        this.arms[0].target.y += 0.1 + s2 * 0.08; this.arms[1].target.y += 0.1 - s2 * 0.08;
      }
    }
    // 몸 기울기 (팔보다 먼저: 세상 좌표 손 목표를 숙인 몸 기준으로 바꿔야 해요)
    this.body.rotation.x += (this.lean - this.body.rotation.x) * Math.min(1, dt * 7);
    this.body.rotation.z = this.walking > 0 ? sw * 0.05 : 0;
    // 통통
    this.body.position.y = Math.abs(Math.sin(t * 9)) * 0.06 * this.bounce + (this.walking > 0 ? Math.abs(sw) * 0.035 : 0);
    if (!this.manual) this.handW[0] = this.handW[1] = null;
    else if (this.handW[0] || this.handW[1]) {
      this.body.updateWorldMatrix(true, false);
      this.handW.forEach((hw, i) => {
        if (!hw) return;
        const arm = this.arms[i];
        arm.target.copy(this.body.worldToLocal(hw.p.clone()));
        arm.aim = hw.aim ? this.body.worldToLocal(hw.p.clone().add(hw.aim)).sub(arm.target).normalize() : null;
      });
    }
    for (const arm of this.arms) this.updateArm(arm, dt);

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
