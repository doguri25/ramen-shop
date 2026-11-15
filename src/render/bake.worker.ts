// 가게 조명 굽기 일꾼: 정점마다 광선을 쏴서
//  rgb = 구석 어둠(AO) × 주변에서 튄 빛의 색(한 번 튐) + 등불의 따뜻한 빛
//  a   = 주 조명이 보이는 정도 (부드러운 그림자)
// 를 계산해요. 화면을 멈추지 않게 따로 돌아가요.
import { BufferAttribute, BufferGeometry, DoubleSide, Ray, Vector3 } from 'three';
import { MeshBVH } from 'three-mesh-bvh';

export interface BakeJob {
  tris: Float32Array; // 삼각형 꼭짓점 (세상 좌표, 삼각형마다 9개)
  albedo: Float32Array; // 삼각형마다 색 (3개)
  shell: Uint8Array; // 1 = 벽·바닥·천장 (주 조명은 가리지 않아요)
  verts: Float32Array; // 받는 정점 위치 (3개씩)
  norms: Float32Array; // 받는 정점 법선 (3개씩)
  light: [number, number, number]; // 주 조명 방향 (빛이 오는 쪽)
  lamps: number[]; // 등불 위치 (3개씩)
  aoRays: number;
  sunRays: number;
  lampRays: number;
  aoDist: number;
}

function bvhOf(tris: Float32Array) {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(tris, 3));
  const n = tris.length / 3;
  const idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  g.setIndex(new BufferAttribute(idx, 1));
  return new MeshBVH(g, { indirect: true, targetLeafSize: 8, maxDepth: 60 });
}

// 정해진 순서로 섞인 수 (같은 장면이면 늘 같은 결과)
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}

self.onmessage = (e: MessageEvent<BakeJob>) => {
  const J = e.data;
  const t0 = performance.now();
  const all = bvhOf(J.tris);
  // 주 조명용: 방 껍데기를 뺀 물건들만
  const T = J.tris.length / 9;
  let np = 0;
  for (let i = 0; i < T; i++) if (!J.shell[i]) np++;
  const props = new Float32Array(np * 9);
  for (let i = 0, k = 0; i < T; i++) if (!J.shell[i]) { props.set(J.tris.subarray(i * 9, i * 9 + 9), k * 9); k++; }
  const sunBvh = np ? bvhOf(props) : null;

  // 삼각형 법선 (튄 빛 계산용)
  const tn = new Float32Array(T * 3);
  const a = new Vector3(), b = new Vector3(), c = new Vector3();
  for (let i = 0; i < T; i++) {
    a.fromArray(J.tris, i * 9); b.fromArray(J.tris, i * 9 + 3); c.fromArray(J.tris, i * 9 + 6);
    b.sub(a); c.sub(a); b.cross(c).normalize();
    tn[i * 3] = b.x; tn[i * 3 + 1] = b.y; tn[i * 3 + 2] = b.z;
  }

  const L = new Vector3(...J.light).normalize();
  const V = J.verts.length / 3;
  const out = new Float32Array(V * 4);
  const ray = new Ray();
  const P = new Vector3(), N = new Vector3(), O = new Vector3(), D = new Vector3(), TU = new Vector3(), TV = new Vector3(), tmp = new Vector3(), nh = new Vector3();
  const lamps: Vector3[] = [];
  for (let i = 0; i < J.lamps.length; i += 3) lamps.push(new Vector3(J.lamps[i], J.lamps[i + 1], J.lamps[i + 2]));
  const WARM = [1.0, 0.82, 0.58];
  // 방위각까지 고르게 덮도록 행 수를 따로 셈해요 (광선 수가 제곱수가 아니어도 빈 쪽이 없게)
  const sq = Math.ceil(Math.sqrt(J.aoRays)), rows = Math.ceil(J.aoRays / sq);

  for (let v = 0; v < V; v++) {
    P.fromArray(J.verts, v * 3);
    N.fromArray(J.norms, v * 3);
    if (N.lengthSq() < 1e-8) N.set(0, 1, 0);
    N.normalize();
    O.copy(P).addScaledVector(N, 0.004);
    // 법선 둘레의 직교 축
    tmp.set(Math.abs(N.x) < 0.9 ? 1 : 0, Math.abs(N.x) < 0.9 ? 0 : 1, 0);
    TU.crossVectors(N, tmp).normalize();
    TV.crossVectors(N, TU);
    const r = rng(v * 9781 + 7);
    const rot = r() * Math.PI * 2;

    // 1) 구석 어둠 + 한 번 튄 빛 (코사인 가중 반구, 층을 나눠 고르게)
    let ar = 0, ag = 0, ab = 0;
    for (let i = 0; i < J.aoRays; i++) {
      const u1 = ((i % sq) + r()) / sq, u2 = (Math.floor(i / sq) + r()) / rows;
      const rr = Math.sqrt(Math.min(1, u1)), ph = 2 * Math.PI * Math.min(1, u2) + rot;
      const x = rr * Math.cos(ph), y = rr * Math.sin(ph), z = Math.sqrt(Math.max(0, 1 - u1));
      D.copy(TU).multiplyScalar(x).addScaledVector(TV, y).addScaledVector(N, z).normalize();
      ray.origin.copy(O); ray.direction.copy(D);
      const h = all.raycastFirst(ray, DoubleSide, 0, J.aoDist);
      if (!h) { ar += 1; ag += 1; ab += 1; continue; }
      const f = h.faceIndex!;
      nh.set(tn[f * 3], tn[f * 3 + 1], tn[f * 3 + 2]);
      if (nh.dot(D) > 0) nh.negate();
      const lit = 0.5 + 0.5 * Math.max(0, nh.dot(L));
      const t = h.distance / J.aoDist, k = t * t; // 가까이 막혔을수록 어둡고, 막은 물체 색이 번져요
      ar += J.albedo[f * 3] * lit * 0.9 * (1 - k) + k;
      ag += J.albedo[f * 3 + 1] * lit * 0.9 * (1 - k) + k;
      ab += J.albedo[f * 3 + 2] * lit * 0.9 * (1 - k) + k;
    }
    ar /= J.aoRays; ag /= J.aoRays; ab /= J.aoRays;

    // 2) 주 조명 그림자 (조금씩 흔든 광선 → 부드러운 가장자리)
    let vis = 1;
    const ndl = N.dot(L);
    if (sunBvh && ndl > 0.02) {
      let seen = 0;
      for (let j = 0; j < J.sunRays; j++) {
        D.copy(L).addScaledVector(TU, (r() - 0.5) * 0.12).addScaledVector(TV, (r() - 0.5) * 0.12).normalize();
        ray.origin.copy(O); ray.direction.copy(D);
        if (!sunBvh.raycastFirst(ray, DoubleSide, 0, 10)) seen++;
      }
      vis = seen / J.sunRays;
    }

    // 3) 등불: 공 모양 빛을 향해 쏴서 가려지지 않은 만큼 따뜻하게
    let lamp = 0;
    for (const lp of lamps) {
      for (let j = 0; j < J.lampRays; j++) {
        tmp.set(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(0.16).add(lp).sub(O);
        const dist = tmp.length();
        D.copy(tmp).divideScalar(dist);
        const c2 = N.dot(D);
        if (c2 <= 0) continue;
        ray.origin.copy(O); ray.direction.copy(D);
        if (dist > 0.3 && all.raycastFirst(ray, DoubleSide, 0, dist - 0.28)) continue;
        lamp += c2 / (1 + (dist / 0.85) * (dist / 0.85));
      }
    }
    lamp /= Math.max(1, J.lampRays);

    // 밝은 곳은 1 근처, 구석은 0.55 근처까지
    const g = (x: number) => Math.pow(Math.max(0, x), 0.8);
    out[v * 4] = Math.min(1.25, g(ar) * 1.03 + WARM[0] * lamp * 0.45);
    out[v * 4 + 1] = Math.min(1.25, g(ag) * 1.03 + WARM[1] * lamp * 0.45);
    out[v * 4 + 2] = Math.min(1.25, g(ab) * 1.03 + WARM[2] * lamp * 0.45);
    out[v * 4 + 3] = vis;
    if (v % 1500 === 0) (self as unknown as Worker).postMessage({ progress: v / V });
  }
  (self as unknown as Worker).postMessage({ done: out, ms: performance.now() - t0 }, [out.buffer]);
};
