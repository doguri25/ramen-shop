import * as THREE from 'three';
import { capsuleG, cylG, M, mesh, sphereG, torusG } from './geo';

// 사장님(나)의 몸과 두 팔 (사람 손).
// 몸통은 카메라 아래에 서 있고(고개를 숙이면 화면 아래로 가슴과 앞치마가 살짝 보여요),
// 팔은 어깨 → 팔꿈치 → 손목 두 마디로 이어져 어느 쪽을 보든 화면 가장자리에서 들어와요.
const SKIN = '#F3D2B5', SLEEVE = '#C2560E', CUFF = '#FFF4E6', APRON = '#FFF4E6';
const UP = new THREE.Vector3(0, 1, 0);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UPPER = 0.3, FORE = 0.29; // 위팔·아래팔 길이 (다 펴면)
const R_SHOULDER = 0.054, R_ELBOW = 0.048, R_WRIST = 0.043; // 소매 굵기
const BEND = 1.015; // 손이 가까울 때 팔 길이 = 어깨~손목 거리 × BEND (팔꿈치가 살짝만 굽어요)

export class Paw {
  paw = new THREE.Group();
  hold = new THREE.Group(); // 물건을 쥐는 자리
  cur: THREE.Vector3;
  target: THREE.Vector3;
  shoulder = V(); // 어깨 (카메라 기준, 매 프레임 몸에서 받아요)
  maxLen = 0.5; // 예전 값과 맞추려고 남겨 둬요 (팔은 이제 끊기지 않아요)
  roll = 0; // 손목 돌리기 (+면 손등 위쪽이 화면 왼쪽으로 넘어가요: 오른손으로 국자를 왼쪽으로 기울일 때)
  private upper: THREE.Mesh;
  private fore: THREE.Mesh;
  private elbow: THREE.Mesh;
  private ball: THREE.Mesh;
  private cuff: THREE.Mesh;
  private E = V();
  constructor(parent: THREE.Object3D, public side: number, public rest: THREE.Vector3) {
    this.cur = rest.clone();
    this.target = rest.clone();
    parent.add(this.paw);
    // 사람 손: 납작한 손바닥 + 앞(-z)으로 뻗은 손가락 넷 + 몸 안쪽의 엄지
    const skin = M(SKIN, { noise: 1 });
    mesh(sphereG(1, 18, 14), skin, [0, 0, -0.01], [0.054, 0.027, 0.058], [0, 0, 0], this.paw);
    const FINGER = [0.042, 0.048, 0.044, 0.034]; // 검지·중지·약지·새끼 (엄지 쪽부터)
    const tip = V(0, -Math.sin(0.3), -Math.cos(0.3)); // 손끝은 살짝 아래로
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * 0.026; // 엄지가 -side 쪽이라 오른손은 왼쪽(-x)부터 검지
      const len = FINGER[side > 0 ? i : 3 - i];
      const dir = tip.clone().add(V((i - 1.5) * 0.07, 0, 0)).normalize(); // 손가락이 살짝 벌어져요
      const c = V(x, 0.002, -0.05).addScaledVector(dir, len * 0.5 + 0.004);
      const f = mesh(capsuleG(0.0128, len), skin, [c.x, c.y, c.z], 1, [0, 0, 0], this.paw);
      f.quaternion.setFromUnitVectors(UP, dir);
    }
    const tdir = V(-side * 0.5, -0.15, -0.85).normalize(); // 엄지는 앞쪽으로, 조금 바깥으로
    const tc = V(-side * 0.046, -0.008, -0.02).addScaledVector(tdir, 0.02);
    const thumb = mesh(capsuleG(0.015, 0.034), skin, [tc.x, tc.y, tc.z], 1, [0, 0, 0], this.paw);
    thumb.quaternion.setFromUnitVectors(UP, tdir);
    this.paw.add(this.hold);
    this.hold.position.set(0, 0.02, -0.07);
    const sl = M(SLEEVE, { noise: 1.6 });
    // 소매는 어깨에서 손목까지 매끄럽게 가늘어져요 (팔꿈치에서 굵기가 툭 바뀌지 않게, 팔꿈치 공도 같은 굵기)
    this.upper = mesh(cylG(R_SHOULDER, R_ELBOW, 1, 16), sl, [0, 0, 0], 1, [0, 0, 0], parent);
    this.fore = mesh(cylG(R_ELBOW, R_WRIST, 1, 16), sl, [0, 0, 0], 1, [0, 0, 0], parent);
    this.elbow = mesh(sphereG(R_ELBOW, 14, 10), sl, [0, 0, 0], 1, [0, 0, 0], parent);
    this.ball = mesh(sphereG(R_SHOULDER, 14, 10), sl, [0, 0, 0], 1, [0, 0, 0], parent);
    this.cuff = mesh(torusG(0.043, 0.015, 8, 18), M(CUFF), [0, 0, 0], 1, [0, 0, 0], parent);
  }
  // 어깨에서 멀면 몸을 앞으로 기울여요 (그 만큼을 돌려줘요)
  reachLean() {
    const d = this.cur.distanceTo(this.shoulder), reach = (UPPER + FORE) * 0.92;
    return Math.max(0, Math.min(0.32, (d - reach) * 0.55));
  }
  update(dt: number, speed = 12, lean = V()) {
    this.cur.lerp(this.target, 1 - Math.exp(-dt * speed));
    this.paw.position.copy(this.cur);
    // 손목은 손 바로 뒤
    const S = this.shoulder.clone().add(lean);
    const toS = S.clone().sub(this.cur);
    const fdir = toS.clone().normalize(); // 손 → 어깨 쪽
    const W = this.cur.clone().addScaledVector(fdir, 0.055);
    // 두 마디 팔. 손이 가까우면 팔이 그만큼 짧아져서 팔꿈치가 크게 꺾이지 않고 살짝만 굽어요
    // (닿지 않으면 만화처럼 조금 늘어나요)
    const SW = W.clone().sub(S);
    const d = Math.max(1e-4, SW.length());
    const len = Math.max(d, Math.min(UPPER + FORE, d * BEND));
    const a = len * (UPPER / (UPPER + FORE)), b = len * (FORE / (UPPER + FORE));
    const ax = SW.clone().divideScalar(d);
    const x = (a * a - b * b + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, a * a - x * x));
    // 팔꿈치는 바깥쪽 아래로
    const pole = V(this.side * 0.8, -1, 0.15);
    pole.addScaledVector(ax, -pole.dot(ax)).normalize();
    this.E.copy(S).addScaledVector(ax, x).addScaledVector(pole, h);
    this.bone(this.upper, S, this.E);
    this.bone(this.fore, this.E, W);
    this.elbow.position.copy(this.E);
    this.ball.position.copy(S);
    // 소맷부리와 손은 아래팔 방향을 따라요
    const fa = W.clone().sub(this.E).normalize();
    this.cuff.position.copy(W).addScaledVector(fa, -0.012);
    this.cuff.quaternion.setFromUnitVectors(V(0, 0, 1), fa);
    // 손의 -z(손가락 쪽)가 아래팔 방향(앞)을 보게 해요. 그러면 엄지가 몸 안쪽에 와요
    // (오른손은 화면에서 왼쪽, 왼손은 오른쪽). 손끝은 살짝 아래로 숙여요
    const m = new THREE.Matrix4().lookAt(V(), fa, UP);
    this.paw.quaternion.setFromRotationMatrix(m);
    this.paw.rotateX(-0.25);
    if (this.roll) this.paw.rotateZ(this.roll);
  }
  private bone(mh: THREE.Mesh, A: THREE.Vector3, B: THREE.Vector3) {
    const dir = B.clone().sub(A);
    const len = Math.max(1e-4, dir.length());
    mh.position.copy(A).addScaledVector(dir, 0.5);
    // 원기둥의 +y 가 B 쪽 (아래 반지름이 어깨·팔꿈치 쪽으로 굵게)
    mh.quaternion.setFromUnitVectors(UP, dir.divideScalar(len).negate());
    mh.scale.set(1, len, 1);
  }
}

// 몸통: 주황 윗옷에 크림색 앞치마
function makeBody() {
  const g = new THREE.Group();
  const shirt = M(SLEEVE, { noise: 1.6 });
  mesh(sphereG(1, 24, 18), shirt, [0, -0.6, 0.04], [0.27, 0.34, 0.21], [0, 0, 0], g);
  // 앞치마: 몸 앞면을 덮는 판 + 주머니 + 목끈
  const apron = mesh(new THREE.SphereGeometry(1, 20, 14, -0.75, 1.5, 0.55, 1.55), M(APRON, { noise: 1.2 }), [0, -0.6, 0.04], [0.278, 0.348, 0.218], [0, Math.PI, 0], g);
  apron.userData.ownGeo = true;
  mesh(new THREE.BoxGeometry(0.14, 0.07, 0.02), M('#F6E3C8', { noise: 1.2 }), [0, -0.66, -0.2], 1, [0.12, 0, 0], g).userData.ownGeo = true;
  for (const sd of [-1, 1]) mesh(cylG(0.008, 0.008, 0.2, 6), M(APRON), [sd * 0.07, -0.33, -0.08], 1, [0.5, 0, -sd * 0.35], g);
  // 목
  mesh(sphereG(1, 16, 12), M(SKIN, { noise: 1 }), [0, -0.26, 0.02], [0.13, 0.06, 0.11], [0, 0, 0], g);
  return g;
}

export function makeOwnerPaws() {
  const group = new THREE.Group(); // 카메라에 붙어요 (팔·손)
  const body = makeBody(); // 장면에 놓여요 (몸통은 고개를 숙여도 똑바로 서 있어요)
  const L = new Paw(group, -1, V(-0.27, -0.33, -0.62));
  const R = new Paw(group, 1, V(0.27, -0.33, -0.62));
  const shoulderW = [V(-0.21, -0.3, -0.04), V(0.21, -0.3, -0.04)];
  const camPos = V(), camQ = new THREE.Quaternion(), fwd = V();
  let lean = 0;
  // 매 프레임: 몸을 카메라 아래에 세우고, 어깨 위치를 팔에 알려 줘요
  const sync = (cam: THREE.Camera, dt: number) => {
    cam.updateMatrixWorld();
    cam.getWorldPosition(camPos);
    cam.getWorldQuaternion(camQ);
    fwd.set(0, 0, -1).applyQuaternion(camQ);
    const yaw = Math.atan2(-fwd.x, -fwd.z);
    // 멀리 뻗을수록 몸이 앞으로 기울어요
    const want = Math.max(L.reachLean(), R.reachLean());
    lean += (want - lean) * (1 - Math.exp(-dt * 6));
    body.position.copy(camPos).add(V(-Math.sin(yaw) * lean * 0.6, -lean * 0.15, -Math.cos(yaw) * lean * 0.6));
    body.rotation.set(-lean * 0.5, yaw, 0, 'YXZ');
    body.visible = group.visible;
    body.updateMatrixWorld();
    [L, R].forEach((p, i) => { p.shoulder.copy(group.worldToLocal(body.localToWorld(shoulderW[i].clone()))); });
  };
  return { group, body, L, R, sync };
}
