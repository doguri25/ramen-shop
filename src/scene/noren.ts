import * as THREE from 'three';

// 문 위에 거는 두 폭짜리 천(노렌).
// 천을 점과 막대(거리 제약)로 이어서 매 프레임 흔들어요: 중력, 바람, 문짝, 손님 머리에 밀리면 펄럭여요.
// 좌표는 모두 가게(root) 기준이에요.

const CX = 9; // 한 폭의 가로 칸 수
const CY = 8; // 세로 칸 수
const SUB = 1 / 120; // 작은 시간 조각
const ITER = 5; // 막대 맞추기 반복

export interface DoorLeaf {
  hinge: THREE.Vector3; // 경첩 위치
  angle: number; // 경첩 회전 (y축)
  w: number; // 문짝 폭 (경첩에서 -x 쪽으로)
  h: number; // 문짝 높이 (바닥부터)
  t: number; // 문짝 반 두께 + 천 두께
}

export interface Ball { c: THREE.Vector3; r: number }

export class Noren {
  readonly meshes: THREE.Mesh[] = [];
  private readonly n: number; // 한 폭의 점 수
  private readonly P: Float32Array;
  private readonly Q: Float32Array;
  private readonly pinned: Uint8Array;
  private readonly cons: number[] = []; // a, b, 길이, 단단함
  private acc = 0;
  private t = 0;
  private gust = 0;
  private lastAngle = 0;
  private readonly zMin: number;

  constructor(mat: THREE.Material, center: THREE.Vector3, w: number, h: number, wallZ: number) {
    const cols = CX + 1, rows = CY + 1;
    this.n = cols * rows;
    const N = this.n * 2;
    this.P = new Float32Array(N * 3);
    this.Q = new Float32Array(N * 3);
    this.pinned = new Uint8Array(N);
    this.zMin = wallZ;
    const pw = w / 2, dx = pw / CX, dy = h / CY;
    const top = center.y + h / 2;
    for (let p = 0; p < 2; p++) {
      const x0 = center.x - w / 2 + p * pw;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const i = p * this.n + r * cols + c;
        this.P[i * 3] = this.Q[i * 3] = x0 + c * dx;
        this.P[i * 3 + 1] = this.Q[i * 3 + 1] = top - r * dy;
        this.P[i * 3 + 2] = this.Q[i * 3 + 2] = center.z;
        if (r === 0) this.pinned[i] = 1;
      }
      const at = (r: number, c: number) => p * this.n + r * cols + c;
      const link = (a: number, b: number, k: number) => {
        const d = Math.hypot(this.P[a * 3] - this.P[b * 3], this.P[a * 3 + 1] - this.P[b * 3 + 1], this.P[a * 3 + 2] - this.P[b * 3 + 2]);
        this.cons.push(a, b, d, k);
      };
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        if (c + 1 < cols) link(at(r, c), at(r, c + 1), 1);
        if (r + 1 < rows) link(at(r, c), at(r + 1, c), 1);
        if (r + 1 < rows && c + 1 < cols) { link(at(r, c), at(r + 1, c + 1), 0.5); link(at(r, c + 1), at(r + 1, c), 0.5); }
        // 천이 구겨지지 않고 살짝 빳빳하게
        if (c + 2 < cols) link(at(r, c), at(r, c + 2), 0.15);
        if (r + 2 < rows) link(at(r, c), at(r + 2, c), 0.15);
      }
      // 그림은 한 장: 왼쪽 폭은 왼쪽 반, 오른쪽 폭은 오른쪽 반을 써요
      const g = new THREE.PlaneGeometry(pw, h, CX, CY);
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let j = 0; j < uv.count; j++) uv.setX(j, p * 0.5 + uv.getX(j) * 0.5);
      const m = new THREE.Mesh(g, mat);
      m.frustumCulled = false;
      m.renderOrder = 2;
      this.meshes.push(m);
    }
    this.write();
  }

  // 문이 열릴 때 바람이 한 번 훅 들어와요
  puff() { this.gust = 1; }

  update(dt: number, leaf: DoorLeaf, balls: Ball[]) {
    this.acc = Math.min(this.acc + Math.min(dt, 1 / 15), 4 * SUB);
    // 문짝이 빨리 돌아도 천을 건너뛰지 않게, 작은 조각마다 문짝 각도를 나눠서 따라가요
    const a0 = this.lastAngle, a1 = leaf.angle, steps = Math.floor(this.acc / SUB);
    for (let s = 0; s < steps; s++) this.step({ ...leaf, angle: a0 + (a1 - a0) * ((s + 1) / steps) }, a0 + (a1 - a0) * (s / steps), balls);
    this.acc -= steps * SUB;
    if (steps) this.lastAngle = a1;
    if (steps) this.write();
  }

  private step(leaf: DoorLeaf, prevAngle: number, balls: Ball[]) {
    const { P, Q } = this;
    this.t += SUB;
    this.gust = Math.max(0, this.gust - SUB * 1.1);
    const h2 = SUB * SUB, damp = 0.985, vmax = 2.2 * SUB; // 천은 아무리 세게 밀려도 이보다 빨리 날아가지 않아요
    const N = this.n * 2;
    for (let i = 0; i < N; i++) {
      if (this.pinned[i]) continue;
      const k = i * 3, x = P[k], y = P[k + 1], z = P[k + 2];
      // 살랑이는 바람 + 문 열릴 때 들어오는 바람 (안쪽으로, 아래로 갈수록 더)
      const sway = Math.sin(this.t * 1.3 + x * 3.1) * 0.25 + Math.sin(this.t * 2.9 + x * 7.0 + y * 4.0) * 0.12;
      const az = sway + this.gust * (1.5 + Math.sin(this.t * 9 + x * 11) * 1.0);
      const ax = this.gust * Math.sin(this.t * 7 + y * 9 + x * 5) * 0.6;
      let vx = (x - Q[k]) * damp, vy = (y - Q[k + 1]) * damp, vz = (z - Q[k + 2]) * damp;
      const v = Math.hypot(vx, vy, vz);
      if (v > vmax) { const f = vmax / v; vx *= f; vy *= f; vz *= f; }
      P[k] = x + vx + ax * h2;
      P[k + 1] = y + vy - 9.8 * h2;
      P[k + 2] = z + vz + az * h2;
      Q[k] = x; Q[k + 1] = y; Q[k + 2] = z;
    }
    const c = this.cons, cs = Math.cos(leaf.angle), sn = Math.sin(leaf.angle);
    const pcs = Math.cos(prevAngle), psn = Math.sin(prevAngle), closing = leaf.angle < prevAngle - 1e-6;
    for (let it = 0; it < ITER; it++) {
      for (let j = 0; j < c.length; j += 4) {
        const a = c[j], b = c[j + 1], rest = c[j + 2], kk = c[j + 3];
        const pa = this.pinned[a], pb = this.pinned[b];
        if (pa && pb) continue;
        const ax = a * 3, bx = b * 3;
        const dx = P[bx] - P[ax], dy = P[bx + 1] - P[ax + 1], dz = P[bx + 2] - P[ax + 2];
        const len = Math.hypot(dx, dy, dz) || 1e-6;
        const f = ((len - rest) / len) * kk;
        const wa = pa ? 0 : pb ? 1 : 0.5, wb = pb ? 0 : pa ? 1 : 0.5;
        P[ax] += dx * f * wa; P[ax + 1] += dy * f * wa; P[ax + 2] += dz * f * wa;
        P[bx] -= dx * f * wb; P[bx + 1] -= dy * f * wb; P[bx + 2] -= dz * f * wb;
      }
      for (let i = 0; i < N; i++) {
        if (this.pinned[i]) continue;
        const k = i * 3;
        // 벽과 문틀 뒤로는 못 가요
        if (P[k + 2] < this.zMin) P[k + 2] = this.zMin;
        // 문짝: 천이 있던 쪽 면으로 밀어요 (문짝 높이 아래, 폭 안쪽에서만)
        const wx = P[k] - leaf.hinge.x, wz = P[k + 2] - leaf.hinge.z;
        const lx = wx * cs - wz * sn, lz = wx * sn + wz * cs;
        if (P[k + 1] < leaf.h + 0.02 && lx > -leaf.w - 0.02 && lx < 0.02 && lz < leaf.t && lz > -leaf.t) {
          // 바로 전 순간 문짝과 천의 자리로 어느 쪽에 있었는지 봐요
          const qx = Q[k] - leaf.hinge.x, qz = Q[k + 2] - leaf.hinge.z;
          let side = qx * psn + qz * pcs >= 0 ? 1 : -1;
          // 닫히는 문짝 뒤쪽에 걸린 천은 문과 벽 사이에 끼지 않게 가게 쪽으로 빠져나와요
          if (closing && side < 0) side = 1;
          const nz = leaf.t * side;
          P[k] = leaf.hinge.x + lx * cs + nz * sn;
          P[k + 2] = leaf.hinge.z - lx * sn + nz * cs;
          // 천은 부드러워서 문짝에 밀려도 튕겨 나가지 않아요: 문짝 쪽으로 밀린 속도는 거의 잃고,
          // 문짝 면을 따라서는 미끄러져요 (그래야 문짝 끝으로 흘러내려 다시 늘어져요)
          const nx = sn, nzw = cs;
          const vx = P[k] - Q[k], vz = P[k + 2] - Q[k + 2];
          const vn = vx * nx + vz * nzw;
          const keep = vn * 0.8;
          Q[k] += nx * keep; Q[k + 2] += nzw * keep;
        }
        // 손님 머리
        for (const b of balls) {
          const dx = P[k] - b.c.x, dy = P[k + 1] - b.c.y, dz = P[k + 2] - b.c.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < b.r * b.r && d2 > 1e-8) {
            const d = Math.sqrt(d2), s = b.r / d;
            P[k] = b.c.x + dx * s; P[k + 1] = b.c.y + dy * s; P[k + 2] = b.c.z + dz * s;
          }
        }
      }
    }
  }

  private write() {
    const cols = CX + 1;
    for (let p = 0; p < 2; p++) {
      const g = this.meshes[p].geometry;
      const pos = g.attributes.position as THREE.BufferAttribute;
      for (let r = 0; r <= CY; r++) for (let c = 0; c < cols; c++) {
        const j = r * cols + c, i = (p * this.n + j) * 3;
        pos.setXYZ(j, this.P[i], this.P[i + 1], this.P[i + 2]);
      }
      pos.needsUpdate = true;
      g.computeVertexNormals();
    }
  }
}
