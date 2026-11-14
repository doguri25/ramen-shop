import * as THREE from 'three';
import { M } from './geo';

// ── 작은 물리 엔진 ─────────────────────────────
// 이 게임의 1 단위는 대략 1m 로 잡아요 (카운터 높이 1.035).
export const GRAV = 9.8;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const SUB = 1 / 150; // 한 번에 계산하는 시간 조각
// 화질 단계에 맞춰 계산량을 줄여요 (낮음: 반복 6번)
export const PHYS = { iters: 10 };

// ── 그릇·냄비 안쪽 모양 ─────────────────────────
// 모든 높이는 '음식 그룹' 기준이에요 (가득 찬 국물 면 = y 0).
export interface Profile {
  floorAt(rho: number): number; // 반지름 rho 에서 안쪽 바닥(벽) 높이
  rimR: number; // 테두리 안쪽 반지름
  rimY: number; // 테두리 높이
  refR: number; // 국물 무늬(uv) 기준 반지름
}
const piecewise = (pts: [number, number][]) => (rho: number) => {
  if (rho <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    if (rho <= x1) { const [x0, y0] = pts[i - 1]; return y0 + ((rho - x0) / Math.max(1e-6, x1 - x0)) * (y1 - y0); }
  }
  return 1e3; // 테두리 밖은 벽
};
// makeBowl(r) 의 안쪽 선을 그대로 따라요 (음식 그룹은 0.5r 높이에 있어요)
export function bowlProfile(r: number, refR: number): Profile {
  const s = 0.5 * r;
  const raw: [number, number][] = [[0, 0.1], [0.5, 0.1], [0.74, 0.25], [0.88, 0.5], [0.94, 0.62]];
  return { floorAt: piecewise(raw.map(([x, y]) => [x * r * 0.985, y * r - s])), rimR: 0.94 * r * 0.985, rimY: 0.62 * r - s, refR };
}
// makePot(): 아래 반지름 0.96R, 위 반지름 R, 높이 0.16, 음식 그룹은 0.12 높이
export function potProfile(R: number, refR: number): Profile {
  const b = 0.01 - 0.12, top = 0.16 - 0.12;
  return { floorAt: piecewise([[0, b], [R * 0.95, b], [R * 0.955, b + 0.004], [R * 0.985, top]]), rimR: R * 0.985, rimY: top, refR };
}

// ── 국물 면: 그릇을 기울여도 늘 수평, 움직이면 출렁 ─────────────
// 국물 면 = 수평면과 그릇 안쪽 면이 만나는 선 안쪽. 출렁임은 용수철처럼 흔들리다 가라앉아요.
export class Liquid {
  private geo: THREE.BufferGeometry;
  private seg = 44;
  private tilt = new THREE.Vector2();
  private tiltV = new THREE.Vector2();
  private lastP: THREE.Vector3 | null = null;
  private lastV = V();
  private acc = V();
  private q = new THREE.Quaternion();
  private n = V();
  private sig = '';
  constructor(public mesh: THREE.Mesh, public prof: Profile, public freq = 2.6, public damp = 0.16) {
    mesh.geometry.dispose();
    const N = this.seg + 1;
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    this.geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(N * 2), 2));
    const idx: number[] = [];
    for (let i = 0; i < this.seg; i++) idx.push(0, 1 + ((i + 1) % this.seg), 1 + i);
    this.geo.setIndex(idx);
    mesh.geometry = this.geo;
    mesh.userData.ownGeo = true;
    mesh.rotation.set(0, 0, 0);
    mesh.scale.setScalar(1);
    mesh.frustumCulled = false;
    this.rebuild();
  }
  // 그릇이 갑자기 움직인 것처럼 출렁이게 (물방울이 떨어질 때 등)
  kick(x: number, z: number) { this.tiltV.x += x; this.tiltV.y += z; }
  get level() { return this.mesh.position.y; }
  set level(v: number) { this.mesh.position.y = v; }
  update(dt: number) {
    const par = this.mesh.parent;
    if (!par) return;
    par.updateWorldMatrix(true, false);
    const p = V().setFromMatrixPosition(par.matrixWorld);
    if (this.lastP && dt > 0) {
      const v = p.clone().sub(this.lastP).divideScalar(dt);
      const a = v.clone().sub(this.lastV).divideScalar(dt);
      this.acc.lerp(a, Math.min(1, dt * 30));
      this.lastV.copy(v);
    }
    this.lastP = p;
    // 가속하면 국물은 반대쪽으로 쏠려요: 면의 기울기 목표 = 수평 가속도 / g
    const tx = THREE.MathUtils.clamp(this.acc.x / GRAV, -0.45, 0.45), tz = THREE.MathUtils.clamp(this.acc.z / GRAV, -0.45, 0.45);
    const w = this.freq * Math.PI * 2;
    let left = Math.min(dt, 0.1);
    while (left > 1e-6) {
      const h = Math.min(SUB, left); left -= h;
      this.tiltV.x += (w * w * (tx - this.tilt.x) - 2 * this.damp * w * this.tiltV.x) * h;
      this.tiltV.y += (w * w * (tz - this.tilt.y) - 2 * this.damp * w * this.tiltV.y) * h;
      this.tilt.x += this.tiltV.x * h; this.tilt.y += this.tiltV.y * h;
    }
    this.mesh.scale.setScalar(1);
    this.mesh.rotation.set(0, 0, 0);
    // 높이·기울기·출렁임이 그대로면 다시 계산하지 않아요
    par.getWorldQuaternion(this.q);
    const sig = [this.mesh.position.y, this.tilt.x, this.tilt.y, this.q.x, this.q.y, this.q.z, this.q.w].map((v) => v.toFixed(4)).join();
    if (sig === this.sig) return;
    this.sig = sig;
    this.rebuild();
  }
  private rebuild() {
    const par = this.mesh.parent;
    // 세상 기준 수평면(+출렁임)을 음식 그룹 기준으로 바꿔요
    this.n.set(this.tilt.x, 1, this.tilt.y).normalize();
    if (par) { par.getWorldQuaternion(this.q); this.n.applyQuaternion(this.q.invert()); }
    const n = this.n, L = this.mesh.position.y, pr = this.prof;
    const pos = this.geo.attributes.position as THREE.BufferAttribute;
    const nor = this.geo.attributes.normal as THREE.BufferAttribute;
    const uv = this.geo.attributes.uv as THREE.BufferAttribute;
    const ny = Math.max(0.2, n.y);
    // 국물 면은 mesh 안에서 y 0 이에요 (mesh.position.y 가 높이)
    pos.setXYZ(0, 0, 0, 0); nor.setXYZ(0, n.x, n.y, n.z); uv.setXY(0, 0.5, 0.5);
    for (let i = 0; i < this.seg; i++) {
      const a = (i / this.seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const slope = (n.x * c + n.z * s) / ny;
      const yAt = (rho: number) => L - rho * slope;
      const inside = (rho: number) => yAt(rho) >= pr.floorAt(rho);
      let lo = 0, hi = pr.rimR;
      if (inside(hi)) lo = hi;
      else {
        // 바깥으로 가며 처음 벽에 닿는 곳을 찾아요
        let prev = 0;
        for (let k = 1; k <= 12; k++) { const r = (k / 12) * pr.rimR; if (!inside(r)) { lo = prev; hi = r; break; } prev = r; }
        for (let k = 0; k < 10; k++) { const m = (lo + hi) / 2; if (inside(m)) lo = m; else hi = m; }
      }
      const rho = lo;
      const x = rho * c, z = rho * s;
      pos.setXYZ(i + 1, x, yAt(rho) - L, z);
      nor.setXYZ(i + 1, n.x, n.y, n.z);
      uv.setXY(i + 1, 0.5 + (x / pr.refR) * 0.5, 0.5 - (z / pr.refR) * 0.5);
    }
    this.mesh.visible = L > pr.floorAt(0) + 0.002;
    pos.needsUpdate = true; nor.needsUpdate = true; uv.needsUpdate = true;
    this.geo.computeBoundingSphere();
  }
}

// ── 면발 한 가닥: 버렛(Verlet) 로프 ─────────────
// 점들을 길이 제약으로 잇고, 중력·공기/국물 저항·그릇 바닥과 벽 충돌을 계산해요.
export interface Container { obj: THREE.Object3D; prof: Profile; level: () => number; mound: () => number }
// 한 프레임 동안 그대로인 그릇 정보 (행렬, 국물 높이, 면 더미 높이, 가까운지 볼 중심)
export interface Frame { m: THREE.Matrix4; inv: THREE.Matrix4; level: number; mound: number; c: THREE.Vector3; reach2: number }
export class Rope {
  p: THREE.Vector3[]; q: THREE.Vector3[];
  pin: (THREE.Vector3 | null)[];
  reel = 1; // 1 보다 작으면 가닥이 입 쪽으로 빨려 들어가요
  constructor(pts: THREE.Vector3[], public rest: number, public bend = 0.12, public friction = 0.55) {
    this.p = pts.map((v) => v.clone());
    this.q = pts.map((v) => v.clone());
    this.pin = pts.map(() => null);
  }
  step(h: number, cs: Container[], mats: Frame[]) {
    const n = this.p.length, g = GRAV * h * h;
    const lp = V(), lq = V();
    for (let i = 0; i < n; i++) {
      const pin = this.pin[i];
      if (pin) { this.q[i].copy(this.p[i]); this.p[i].copy(pin); continue; }
      const p = this.p[i], q = this.q[i];
      let drag = 0.995, gg = g;
      // 국물 속이면 물의 저항이 크고, 면은 물보다 살짝 무거워 천천히 가라앉아요
      for (let c = 0; c < cs.length; c++) {
        const F = mats[c];
        if (p.distanceToSquared(F.c) > F.reach2) continue;
        lp.copy(p).applyMatrix4(F.inv);
        if (lp.y < F.level && Math.hypot(lp.x, lp.z) < cs[c].prof.rimR) { drag = 0.9; gg = g * 0.15; }
      }
      const vx = (p.x - q.x) * drag, vy = (p.y - q.y) * drag, vz = (p.z - q.z) * drag;
      q.copy(p);
      p.x += vx; p.y += vy - gg; p.z += vz;
    }
    const r1 = this.rest * this.reel, r2 = r1 * 1.96;
    const iters = PHYS.iters;
    for (let it = 0; it < iters; it++) {
      for (let i = 0; i < n - 1; i++) this.solve(i, i + 1, r1, 1);
      if (this.bend > 0) for (let i = 0; i < n - 2; i++) this.solve(i, i + 2, r2, this.bend);
      // 충돌은 세 번에 한 번, 그리고 마지막에 (가까운 그릇만)
      if (it % 3 !== 2 && it !== iters - 1) continue;
      for (let i = 0; i < n; i++) {
        const pin = this.pin[i];
        if (pin) { this.p[i].copy(pin); continue; }
        for (let c = 0; c < cs.length; c++) if (this.p[i].distanceToSquared(mats[c].c) <= mats[c].reach2) this.collide(i, cs[c], mats[c], lp, lq);
      }
    }
  }
  private solve(a: number, b: number, rest: number, k: number) {
    const pa = this.p[a], pb = this.p[b];
    const wa = this.pin[a] ? 0 : 1, wb = this.pin[b] ? 0 : 1;
    if (wa + wb === 0) return;
    const dx = pb.x - pa.x, dy = pb.y - pa.y, dz = pb.z - pa.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
    // 굽힘 제약은 늘어나는 쪽만 막지 않고, 줄어드는 쪽만 살짝 버텨요 (면이 휘청하게)
    if (k < 1 && d > rest) return;
    const f = ((d - rest) / d) * k / (wa + wb);
    pa.x += dx * f * wa; pa.y += dy * f * wa; pa.z += dz * f * wa;
    pb.x -= dx * f * wb; pb.y -= dy * f * wb; pb.z -= dz * f * wb;
  }
  private collide(i: number, c: Container, mt: Frame, lp: THREE.Vector3, lq: THREE.Vector3) {
    const p = this.p[i], q = this.q[i];
    lp.copy(p).applyMatrix4(mt.inv);
    const rho = Math.hypot(lp.x, lp.z);
    const pr = c.prof;
    if (lp.y > pr.rimY + 0.01) return;
    let hit = false;
    // 벽: 안쪽에 있던 점은 밖으로 못 나가요
    if (rho > pr.rimR * 0.97) {
      lq.copy(q).applyMatrix4(mt.inv);
      if (Math.hypot(lq.x, lq.z) < pr.rimR) { const k = (pr.rimR * 0.97) / rho; lp.x *= k; lp.z *= k; hit = true; }
      else return;
    }
    // 바닥: 국물 아래 바닥, 그 위에 면이 소복이 쌓인 둔덕
    const r = Math.min(1, Math.hypot(lp.x, lp.z) / pr.rimR);
    const floor = Math.max(pr.floorAt(Math.hypot(lp.x, lp.z)) + 0.004, mt.mound > 0 ? mt.mound * (1 - r * r) - 0.004 : -1e3);
    if (lp.y < floor) { lp.y = floor; hit = true; }
    if (!hit) return;
    // 닿은 곳에서는 미끄러지는 속도를 깎아요 (마찰)
    lq.copy(q).applyMatrix4(mt.inv);
    lq.x += (lp.x - lq.x) * this.friction;
    lq.z += (lp.z - lq.z) * this.friction;
    if (lq.y < lp.y - 0.02) lq.y = lp.y;
    p.copy(lp).applyMatrix4(mt.m);
    q.copy(lq).applyMatrix4(mt.m);
  }
}

// ── 굵기와 꼬불거림이 있는 관(튜브) 메시 ─────────────
// 로프 점을 부드럽게 이어 그리고, 면처럼 꼬불꼬불한 물결을 얹어요.
export class TubeMesh {
  mesh: THREE.Mesh;
  private geo = new THREE.BufferGeometry();
  private rs = 6;
  private rings: number;
  private pts: THREE.Vector3[] = [];
  constructor(private cap: number, public radius: number, mat: THREE.Material, public wig = 0, public freq = 60) {
    this.rings = cap;
    const nv = cap * (this.rs + 1);
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
    this.geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(nv * 2), 2));
    const idx: number[] = [];
    for (let i = 0; i < cap - 1; i++) for (let j = 0; j < this.rs; j++) {
      const a = i * (this.rs + 1) + j, b = a + this.rs + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1); // 바깥쪽이 앞면
    }
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.userData.ownGeo = true;
    for (let i = 0; i < cap; i++) this.pts.push(V());
  }
  // pts: 중심선 점들, radii: 점마다 굵기 배율(없으면 1)
  set(src: THREE.Vector3[], radii?: number[], phase = 0) {
    const n = src.length;
    if (n < 2) { this.mesh.visible = false; return; }
    this.mesh.visible = true;
    // 캣멀롬으로 부드럽게 (점 사이에 하나씩 더)
    const out = this.pts, cap = this.rings;
    let m = 0;
    const rad: number[] = [];
    for (let i = 0; i < n - 1 && m < cap - 1; i++) {
      const p0 = src[Math.max(0, i - 1)], p1 = src[i], p2 = src[i + 1], p3 = src[Math.min(n - 1, i + 2)];
      for (const t of [0, 0.5]) {
        if (m >= cap - 1) break;
        const t2 = t * t, t3 = t2 * t;
        out[m].set(
          0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
          0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
          0.5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3));
        const r0 = radii ? radii[i] : 1, r1 = radii ? radii[i + 1] : 1;
        rad.push(r0 + (r1 - r0) * t);
        m++;
      }
    }
    out[m].copy(src[n - 1]); rad.push(radii ? radii[n - 1] : 1); m++;
    const pos = this.geo.attributes.position as THREE.BufferAttribute;
    const nor = this.geo.attributes.normal as THREE.BufferAttribute;
    const uv = this.geo.attributes.uv as THREE.BufferAttribute;
    const T = V(), N = V(), B = V(), P = V(), tmp = V();
    let s = 0;
    for (let i = 0; i < m; i++) {
      const a = out[Math.max(0, i - 1)], b = out[Math.min(m - 1, i + 1)];
      T.copy(b).sub(a);
      if (T.lengthSq() < 1e-12) T.set(0, 1, 0);
      T.normalize();
      if (i === 0) { N.copy(Math.abs(T.y) < 0.9 ? UP : V(1, 0, 0)).cross(T).normalize(); }
      else { N.addScaledVector(T, -N.dot(T)); if (N.lengthSq() < 1e-8) N.copy(UP).cross(T); N.normalize(); }
      B.copy(T).cross(N);
      if (i > 0) s += out[i].distanceTo(out[i - 1]);
      // 꼬불꼬불: 길이를 따라 옆으로 물결쳐요 (끝으로 갈수록 가늘게)
      P.copy(out[i]);
      if (this.wig > 0) P.addScaledVector(N, Math.sin(s * this.freq + phase) * this.wig).addScaledVector(B, Math.cos(s * this.freq * 0.7 + phase) * this.wig * 0.6);
      const end = Math.min(1, Math.min(i, m - 1 - i) / 2 + 0.45);
      const r = this.radius * rad[i] * end;
      for (let j = 0; j <= this.rs; j++) {
        const th = (j / this.rs) * Math.PI * 2;
        tmp.copy(N).multiplyScalar(Math.cos(th)).addScaledVector(B, Math.sin(th));
        const k = i * (this.rs + 1) + j;
        pos.setXYZ(k, P.x + tmp.x * r, P.y + tmp.y * r, P.z + tmp.z * r);
        nor.setXYZ(k, tmp.x, tmp.y, tmp.z);
        uv.setXY(k, j / this.rs, i / Math.max(1, m - 1));
      }
    }
    this.geo.setDrawRange(0, (m - 1) * this.rs * 6);
    pos.needsUpdate = true; nor.needsUpdate = true; uv.needsUpdate = true;
  }
  dispose() { this.mesh.removeFromParent(); this.geo.dispose(); }
}

// ── 젓가락에 걸린 면 한 움큼 ─────────────
export interface NoodleLook { colors: string[]; radius: number; wig: number; len: number; bend: number }
export class NoodleBundle {
  group = new THREE.Group();
  ropes: Rope[] = [];
  tubes: TubeMesh[] = [];
  private offs: THREE.Vector3[] = [];
  private phases: number[] = [];
  frozen = false;
  private acc = 0;
  private mats: Frame[] = [];
  constructor(public look: NoodleLook, public containers: Container[]) {}
  // 집을 자리(spot) 둘레의 면 더미 위에 가닥을 눕혀 두고, 가운데를 젓가락 끝에 걸어요
  lay(spot: THREE.Vector3, count: number, c: Container, tip: THREE.Vector3) {
    const L = this.look, seg = 0.014;
    const n = Math.max(8, Math.round(L.len / seg)) | 1;
    c.obj.updateWorldMatrix(true, false);
    const m = c.obj.matrixWorld, inv = m.clone().invert();
    const ls = spot.clone().applyMatrix4(inv);
    for (let k = 0; k < count; k++) {
      const a0 = Math.random() * Math.PI * 2, curl = (Math.random() - 0.5) * 6;
      const len = L.len * (0.75 + Math.random() * 0.5);
      const pts: THREE.Vector3[] = [];
      // 가운데에서 양쪽으로 뻗는 휘어진 선 (그릇 밖으로 나가지 않게)
      for (let i = 0; i < n; i++) {
        const u = (i / (n - 1) - 0.5) * len;
        const a = a0 + curl * u;
        let x = ls.x + Math.cos(a) * u + (Math.random() - 0.5) * 0.004, z = ls.z + Math.sin(a) * u;
        const rho = Math.hypot(x, z), lim = c.prof.rimR * 0.9;
        if (rho > lim) { x *= lim / rho; z *= lim / rho; }
        const r = Math.min(1, Math.hypot(x, z) / c.prof.rimR);
        const y = Math.max(c.level() - 0.004, c.mound() * (1 - r * r)) + 0.002;
        pts.push(V(x, y, z).applyMatrix4(m));
      }
      const rope = new Rope(pts, len / (n - 1), L.bend);
      const mid = (n - 1) >> 1;
      const off = V((Math.random() - 0.5) * 0.012, 0.004 + Math.random() * 0.004, (Math.random() - 0.5) * 0.008);
      this.offs.push(off);
      rope.pin[mid] = tip.clone().add(off);
      this.ropes.push(rope);
      const tube = new TubeMesh(n * 2, L.radius * (0.85 + Math.random() * 0.3), M(L.colors[k % L.colors.length], { rim: 0.6, spec: 0.45 }), L.wig, 55 + Math.random() * 20);
      this.tubes.push(tube);
      this.phases.push(Math.random() * 6.28);
      this.group.add(tube.mesh);
    }
    this.draw();
  }
  // 젓가락 끝이 움직인 곳으로 걸린 점을 옮겨요
  hold(tip: THREE.Vector3) {
    this.ropes.forEach((r, k) => { const mid = (r.p.length - 1) >> 1; if (r.pin[mid]) r.pin[mid]!.copy(tip).add(this.offs[k]); });
  }
  release() { this.ropes.forEach((r) => { r.pin = r.pin.map(() => null); }); }
  setReel(v: number) { this.ropes.forEach((r) => { r.reel = v; }); }
  update(dt: number) {
    if (this.frozen) return;
    this.mats = this.containers.map((c) => {
      c.obj.updateWorldMatrix(true, false);
      const m = c.obj.matrixWorld.clone();
      const reach = c.prof.rimR + 0.12;
      return { m, inv: m.clone().invert(), level: c.level(), mound: c.mound(), c: V().setFromMatrixPosition(m), reach2: reach * reach };
    });
    // 프레임이 많이 밀려도 한 번에 10조각까지만 (그 이상은 살짝 느리게 흘러가요)
    this.acc = Math.min(this.acc + Math.min(dt, 0.1), SUB * 10);
    let guard = 0;
    while (this.acc >= SUB && guard++ < 10) {
      for (const r of this.ropes) r.step(SUB, this.containers, this.mats);
      this.acc -= SUB;
    }
    this.draw();
  }
  private draw() { this.tubes.forEach((t, k) => t.set(this.ropes[k].p, undefined, this.phases[k])); }
  // 가닥 끝(국물을 떨굴 자리)
  ends() { return this.ropes.flatMap((r) => [r.p[0], r.p[r.p.length - 1]]); }
  dispose() { this.tubes.forEach((t) => t.dispose()); this.group.removeFromParent(); }
}

// ── 물줄기: 포물선으로 떨어지는 국물 ─────────────
// 입구에서 물 알갱이를 쏟아 내고, 알갱이는 중력으로 떨어져요. 알갱이를 이어 관으로 그려요.
interface Drip { p: THREE.Vector3; v: THREE.Vector3; alive: boolean }
export class Stream {
  group = new THREE.Group();
  private drips: Drip[] = [];
  private tube: TubeMesh;
  private acc = 0;
  constructor(color: string, public radius = 0.007) {
    this.tube = new TubeMesh(128, radius, M(color, { alpha: 0.9, rim: 0.2, spec: 0.7 }));
    this.group.add(this.tube.mesh);
    this.tube.mesh.visible = false;
  }
  // flow: 0~1 (얼마나 콸콸), floorY(p): 그 자리에서 닿을 높이, onHit: 닿았을 때
  update(dt: number, lip: THREE.Vector3 | null, vel: THREE.Vector3, flow: number, floorY: (p: THREE.Vector3) => number, onHit: (p: THREE.Vector3) => void) {
    if (lip && flow > 0.01) {
      this.acc += dt * 70;
      while (this.acc >= 1) {
        this.acc -= 1;
        this.drips.unshift({ p: lip.clone(), v: vel.clone().multiplyScalar(0.6 + 0.4 * flow), alive: true });
      }
    }
    for (const d of this.drips) {
      if (!d.alive) continue;
      d.v.y -= GRAV * dt;
      d.p.addScaledVector(d.v, dt);
      if (d.p.y <= floorY(d.p)) { d.alive = false; onHit(d.p); }
    }
    this.drips = this.drips.filter((d) => d.alive).slice(0, 63);
    if (this.drips.length < 2) { this.tube.mesh.visible = false; return; }
    // 빠를수록 가늘어져요 (같은 양이 지나가니까)
    const v0 = Math.max(0.3, this.drips[0].v.length());
    const radii = this.drips.map((d) => Math.sqrt(v0 / Math.max(0.3, d.v.length())) * (0.4 + 0.6 * Math.sqrt(Math.max(0.05, flow))));
    this.tube.set(this.drips.map((d) => d.p), radii);
  }
  get empty() { return this.drips.length === 0; }
  dispose() { this.tube.dispose(); this.group.removeFromParent(); }
}

// ── 떨어지는 건더기: 떨어져 튀고, 국물 위에서 둥둥 ─────────────
export class Drop {
  v = V();
  w = V();
  private t = 0;
  private landed = false;
  done = false;
  constructor(public obj: THREE.Object3D, public target: THREE.Vector3, public targetQ: THREE.Quaternion, private onImpact?: (p: THREE.Vector3, speed: number) => void, v0?: THREE.Vector3) {
    if (v0) this.v.copy(v0);
    this.w.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 8);
  }
  update(dt: number) {
    if (this.done) return;
    const h = Math.min(dt, 0.05);
    this.t += h;
    const o = this.obj, p = o.position;
    if (!this.landed) {
      this.v.y -= GRAV * h;
      // 떨어지면서 목표 자리로 살짝 끌려가요 (젓가락이 놓은 자리)
      this.v.x += (this.target.x - p.x) * 6 * h; this.v.z += (this.target.z - p.z) * 6 * h;
      p.addScaledVector(this.v, h);
      o.rotateX(this.w.x * h); o.rotateY(this.w.y * h); o.rotateZ(this.w.z * h);
      if (p.y <= this.target.y) {
        p.y = this.target.y;
        const sp = -this.v.y;
        this.onImpact?.(p.clone(), sp);
        this.v.y = sp * 0.22; // 국물에 '퐁' 하고 조금 튀어요
        this.v.x *= 0.4; this.v.z *= 0.4;
        this.w.multiplyScalar(0.3);
        if (this.v.y < 0.12) this.landed = true;
      }
      return;
    }
    // 둥둥: 부력(용수철)과 국물 저항으로 위아래로 흔들리다 멈춰요
    const k = 120, c = 9;
    this.v.y += (-k * (p.y - this.target.y) - c * this.v.y) * h;
    this.v.x += (-k * 0.4 * (p.x - this.target.x) - c * this.v.x) * h;
    this.v.z += (-k * 0.4 * (p.z - this.target.z) - c * this.v.z) * h;
    p.addScaledVector(this.v, h);
    o.quaternion.slerp(this.targetQ, 1 - Math.exp(-h * 6));
    if (this.t > 0.9 && this.v.length() < 0.02 && p.distanceTo(this.target) < 0.004) { p.copy(this.target); o.quaternion.copy(this.targetQ); this.done = true; }
  }
}
