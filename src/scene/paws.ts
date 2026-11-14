import * as THREE from 'three';
import { cylG, M, mesh, sphereG, torusG } from './geo';

// 사장님(라면 먹는 개)의 앞발. 카메라에 붙어 있고, 소매는 화면 아래에서 앞발까지 늘어나요
const FUR = '#F3DFC1', PAD = '#E9A0A8', SLEEVE = '#C2560E';
const UP = new THREE.Vector3(0, 1, 0);

export class Paw {
  paw = new THREE.Group();
  sleeve: THREE.Mesh;
  cuff: THREE.Mesh;
  cur: THREE.Vector3;
  target: THREE.Vector3;
  hold = new THREE.Group(); // 물건을 쥐는 자리
  constructor(parent: THREE.Object3D, public side: number, public anchor: THREE.Vector3, public rest: THREE.Vector3) {
    this.cur = rest.clone();
    this.target = rest.clone();
    parent.add(this.paw);
    mesh(sphereG(1, 18, 14), M(FUR, { noise: 2 }), [0, 0, 0], [0.072, 0.06, 0.08], [0, 0, 0], this.paw);
    for (let i = -1; i <= 1; i++) mesh(sphereG(0.024, 10, 8), M(FUR, { noise: 2 }), [i * 0.033, 0.018, -0.07], 1, [0, 0, 0], this.paw);
    mesh(sphereG(0.026, 10, 8), M(FUR, { noise: 2 }), [-side * 0.062, 0.02, -0.03], 1, [0, 0, 0], this.paw);
    mesh(sphereG(1, 12, 8), M(PAD, { rim: 0.2 }), [0, -0.05, -0.02], [0.032, 0.012, 0.028], [0, 0, 0], this.paw);
    this.paw.add(this.hold);
    this.hold.position.set(0, 0.02, -0.07);
    this.sleeve = mesh(cylG(0.04, 0.05, 1, 14), M(SLEEVE, { noise: 1.6 }), [0, 0, 0], 1, [0, 0, 0], parent);
    this.cuff = mesh(torusG(0.044, 0.015, 8, 18), M('#FFF4E6'), [0, 0, 0], 1, [0, 0, 0], parent);
  }
  update(dt: number, speed = 12) {
    this.cur.lerp(this.target, 1 - Math.exp(-dt * speed));
    this.paw.position.copy(this.cur);
    const dir = this.anchor.clone().sub(this.cur);
    const len = Math.min(0.5, dir.length());
    dir.normalize();
    this.sleeve.position.copy(this.cur).addScaledVector(dir, len * 0.5 + 0.04);
    this.sleeve.quaternion.setFromUnitVectors(UP, dir);
    this.sleeve.scale.set(1, len, 1);
    this.cuff.position.copy(this.cur).addScaledVector(dir, 0.07);
    this.cuff.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    // 앞발은 앞쪽(소매 반대쪽)을 바라봐요
    const fwd = dir.clone().negate();
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), fwd, UP);
    this.paw.quaternion.setFromRotationMatrix(m);
    this.paw.rotateX(-0.25);
  }
}

export function makeOwnerPaws() {
  const group = new THREE.Group();
  const L = new Paw(group, -1, new THREE.Vector3(-0.7, -1.3, -1.05), new THREE.Vector3(-0.27, -0.33, -0.62));
  const R = new Paw(group, 1, new THREE.Vector3(1.0, -1.05, -0.95), new THREE.Vector3(0.27, -0.33, -0.62));
  return { group, L, R };
}
