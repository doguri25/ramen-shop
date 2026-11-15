import * as THREE from 'three';
import { delMany, get, keys as idbKeys, set } from 'idb-keyval';
import { shared } from './watercolor';
import type { BakeJob } from './bake.worker';

// ── 광선추적 조명 굽기 ─────────────────────────────
// 가게(움직이지 않는 것들)에 광선을 쏴서 구석 어둠·반사광·등불 빛·부드러운 그림자를
// 정점마다 구워 수채 재질에 입혀요. 한 번 구운 값은 태블릿에 저장해 두고 다시 써요.

const MAX_VERTS = 140_000;
const V3 = () => new THREE.Vector3();

interface Picked { mesh: THREE.Mesh; recv: boolean; shell: boolean; glow: boolean }
// 굽는 방법(일꾼 계산식)을 바꾸면 올려요. 저장본 지문에 들어가요
const ALGO = 'rt5';
// 긴 계산 사이사이 화면이 멈추지 않게 숨을 돌려요
const idle = () => new Promise<void>((r) => setTimeout(r, 0));

const isBakeMat = (m: THREE.Material) => {
  const s = m as THREE.ShaderMaterial;
  return !!(s.isShaderMaterial && s.uniforms?.uBake && s.uniforms?.uColor);
};
function hidden(o: THREE.Object3D) {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible || p.userData.noBake) return true;
  return false;
}

// 긴 변을 반으로 나누기를 되풀이해서 삼각형 변이 maxEdge 보다 짧아지게 (정점은 나눠 써요)
function tessellate(src: THREE.BufferGeometry, maxEdge: number, scale: number) {
  const g = src.index ? src.clone() : src.clone();
  if (!g.index) { const n = g.attributes.position.count; g.setIndex([...Array(n).keys()]); }
  const names = ['position', 'normal', 'uv'].filter((k) => g.attributes[k]);
  const data: Record<string, number[]> = {};
  const size: Record<string, number> = {};
  // 압축(정수·정규화)되거나 섞여(interleaved) 저장된 값도 실제 숫자로 풀어 읽어요
  for (const k of names) {
    const a = g.attributes[k] as THREE.BufferAttribute;
    const arr: number[] = [];
    for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) arr.push(a.getComponent(i, c));
    data[k] = arr; size[k] = a.itemSize;
  }
  let tris = Array.from(g.index!.array as ArrayLike<number>);
  if (data.position.some((x) => !Number.isFinite(x))) return src.clone();
  const pos = data.position;
  const mid = new Map<string, number>();
  const lim2 = (maxEdge / scale) ** 2;
  const d2 = (a: number, b: number) => { const dx = pos[a * 3] - pos[b * 3], dy = pos[a * 3 + 1] - pos[b * 3 + 1], dz = pos[a * 3 + 2] - pos[b * 3 + 2]; return dx * dx + dy * dy + dz * dz; };
  const midpoint = (a: number, b: number) => {
    const key = a < b ? a + '_' + b : b + '_' + a;
    let m = mid.get(key);
    if (m !== undefined) return m;
    m = pos.length / 3;
    for (const k of names) { const s = size[k], A = data[k]; for (let i = 0; i < s; i++) A.push((A[a * s + i] + A[b * s + i]) / 2); }
    mid.set(key, m);
    return m;
  };
  for (let pass = 0; pass < 14; pass++) {
    const next: number[] = [];
    let split = false;
    for (let t = 0; t < tris.length; t += 3) {
      const a = tris[t], b = tris[t + 1], c = tris[t + 2];
      const ab = d2(a, b), bc = d2(b, c), ca = d2(c, a);
      const mx = Math.max(ab, bc, ca);
      if (mx <= lim2 || pos.length / 3 > MAX_VERTS) { next.push(a, b, c); continue; }
      split = true;
      if (mx === ab) { const m = midpoint(a, b); next.push(a, m, c, m, b, c); }
      else if (mx === bc) { const m = midpoint(b, c); next.push(a, b, m, a, m, c); }
      else { const m = midpoint(c, a); next.push(a, b, m, m, b, c); }
    }
    tris = next;
    if (!split) break;
  }
  const out = new THREE.BufferGeometry();
  for (const k of names) out.setAttribute(k, new THREE.Float32BufferAttribute(data[k], size[k]));
  out.setIndex(tris);
  if (out.attributes.normal) {
    const n = out.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < n.count; i++) { const v = V3().fromBufferAttribute(n, i).normalize(); n.setXYZ(i, v.x, v.y, v.z); }
  } else out.computeVertexNormals();
  out.userData = { ...src.userData };
  return out;
}

// 그림(텍스처)의 평균 색
const avgCache = new WeakMap<object, THREE.Color>();
function avgColor(tex: THREE.Texture | null): THREE.Color {
  const white = new THREE.Color(1, 1, 1);
  const img = tex?.image as CanvasImageSource | undefined;
  if (!img) return white;
  const hit = avgCache.get(img as object);
  if (hit) return hit;
  try {
    const c = document.createElement('canvas'); c.width = c.height = 4;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0, 4, 4);
    const d = g.getImageData(0, 0, 4, 4).data;
    let r = 0, gg = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
    const col = new THREE.Color(r / 16 / 255, gg / 16 / 255, b / 16 / 255);
    avgCache.set(img as object, col);
    return col;
  } catch { return white; }
}

// 구운 값을 쓰는 재질: 같은 셰이더에 BAKE 만 켜고, 값(uniforms)은 원래 재질과 함께 써요
const variants = new Map<THREE.Material, THREE.ShaderMaterial>();
function bakedVariant(m: THREE.ShaderMaterial) {
  let v = variants.get(m);
  if (v) return v;
  v = new THREE.ShaderMaterial({
    vertexShader: m.vertexShader, fragmentShader: m.fragmentShader, uniforms: m.uniforms,
    defines: { ...(m.defines ?? {}), BAKE: '' }, side: m.side, transparent: m.transparent,
    depthWrite: m.depthWrite, depthTest: m.depthTest, blending: m.blending,
  });
  v.userData = { ...m.userData, bakedFrom: m.uuid };
  variants.set(m, v);
  return v;
}

// 광선 수가 적어 생기는 얼룩을 이웃 정점끼리 부드럽게 섞어 지워요.
// 같은 자리·비슷한 방향의 정점(모서리 이음매)은 같은 값으로 맞춰요.
async function smooth(data: Float32Array, recv: Picked[]) {
  const out = data.slice();
  let off = 0;
  for (const p of recv) {
    await idle();
    const g = p.mesh.geometry, pos = g.attributes.position as THREE.BufferAttribute, nor = g.attributes.normal as THREE.BufferAttribute | undefined;
    const n = pos.count;
    // 같은 자리 정점 묶기
    const weld = new Int32Array(n);
    const map = new Map<string, number[]>();
    for (let i = 0; i < n; i++) {
      const k = `${Math.round(pos.getX(i) * 2000)},${Math.round(pos.getY(i) * 2000)},${Math.round(pos.getZ(i) * 2000)}`;
      let list = map.get(k);
      if (!list) { list = []; map.set(k, list); }
      let rep = i;
      if (nor) for (const j of list) { if (nor.getX(i) * nor.getX(j) + nor.getY(i) * nor.getY(j) + nor.getZ(i) * nor.getZ(j) > 0.6) { rep = j; break; } }
      weld[i] = rep === i ? i : weld[rep];
      if (rep === i) list.push(i);
    }
    // 이웃 (삼각형 변으로 이어진 정점)
    const nb: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
    const idx = g.index ? (g.index.array as ArrayLike<number>) : null;
    const cnt = idx ? idx.length : n;
    for (let t = 0; t < cnt; t += 3) {
      const a = weld[idx ? idx[t] : t], b = weld[idx ? idx[t + 1] : t + 1], c = weld[idx ? idx[t + 2] : t + 2];
      nb[a].add(b); nb[a].add(c); nb[b].add(a); nb[b].add(c); nb[c].add(a); nb[c].add(b);
    }
    const cur = new Float32Array(n * 4);
    const acc = new Float32Array(n * 4), w = new Float32Array(n);
    for (let i = 0; i < n; i++) { const r = weld[i]; w[r]++; for (let k = 0; k < 4; k++) acc[r * 4 + k] += data[(off + i) * 4 + k]; }
    for (let i = 0; i < n; i++) if (weld[i] === i) for (let k = 0; k < 4; k++) cur[i * 4 + k] = acc[i * 4 + k] / w[i];
    for (let it = 0; it < 2; it++) {
      const nxt = cur.slice();
      for (let i = 0; i < n; i++) {
        if (weld[i] !== i || !nb[i].size) continue;
        for (let k = 0; k < 4; k++) {
          let sum = 0;
          for (const j of nb[i]) sum += cur[j * 4 + k];
          nxt[i * 4 + k] = cur[i * 4 + k] * 0.45 + (sum / nb[i].size) * 0.55;
        }
      }
      cur.set(nxt);
    }
    for (let i = 0; i < n; i++) { const r = weld[i]; for (let k = 0; k < 4; k++) out[(off + i) * 4 + k] = cur[r * 4 + k]; }
    off += n;
  }
  return out;
}

export interface BakeOpts {
  version: string; // 굽는 방법을 바꾸면 올려요 (저장본을 새로)
  light: THREE.Vector3; // 주 조명이 오는 방향 (세상 기준)
  lamps: THREE.Vector3[]; // 등불 위치
  quality: 'high' | 'mid' | 'low';
  onProgress?: (k: number) => void;
}

// 굽고 나서 조명이 천천히 스며들게
function fadeIn(sec = 1.6) {
  const t0 = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / (sec * 1000));
    shared.uBake.value = k * k * (3 - 2 * k);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export async function bakeLighting(root: THREE.Object3D, o: BakeOpts): Promise<{ verts: number; ms: number; cached: boolean; key: string } | null> {
  const t0 = performance.now();
  root.updateMatrixWorld(true);
  // 1) 고르기: 받는 면(수채 재질, 불투명, 빛나지 않음)과 가리는 면
  const picked: Picked[] = [];
  root.traverse((ob) => {
    const m = ob as THREE.Mesh;
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || hidden(m)) return;
    const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.ShaderMaterial;
    if (!isBakeMat(mat) || mat.transparent || (mat.uniforms.uFlat?.value ?? 0) >= 0.8) return;
    if (/hand/i.test(m.name)) return; // 돌아가는 시계 바늘
    const glowing = (mat.uniforms.uGlow?.value ?? 0) > 0.01 || (mat.uniforms.uWave?.value ?? 0) > 0;
    picked.push({ mesh: m, recv: !glowing && !Array.isArray(m.material) && !m.userData.noRecv, shell: !!m.userData.shell, glow: glowing });
  });
  if (!picked.length) return null;
  // 모델이 도착하는 순서와 상관없이 늘 같은 순서로 (저장해 둔 값을 다시 쓰려면 꼭 필요해요)
  const keyOf = (p: Picked) => {
    const w = p.mesh.getWorldPosition(V3());
    return `${p.mesh.name}|${p.mesh.geometry.attributes.position.count}|${Math.round(w.x * 10)},${Math.round(w.y * 10)},${Math.round(w.z * 10)}`;
  };
  const keys = new Map(picked.map((p) => [p, keyOf(p)]));
  picked.sort((x, y) => (keys.get(x)! < keys.get(y)! ? -1 : keys.get(x)! > keys.get(y)! ? 1 : 0));

  // 2) 큰 면은 잘게 나눠야 그림자가 맺혀요 (벽·바닥 9cm, 나머지 13cm)
  for (const p of picked) {
    if (!p.recv) continue;
    await idle();
    const g = p.mesh.geometry;
    const s = new THREE.Vector3(); p.mesh.matrixWorld.decompose(V3(), new THREE.Quaternion(), s);
    const scale = Math.max(Math.abs(s.x), Math.abs(s.y), Math.abs(s.z));
    g.computeBoundingSphere();
    // 넓은 면(벽·바닥·카운터·선반)만 나눠요. 둥근 물체를 나누면 이음매 줄무늬가 생겨요
    const big = (g.boundingSphere?.radius ?? 0) * scale > 0.45;
    const ng = big ? tessellate(g, p.shell ? 0.1 : 0.12, scale) : g.clone();
    ng.userData.ownGeo = true;
    p.mesh.geometry = ng; // 나눠 쓰던 모양은 그대로 두고, 이 물체만 자기 모양을 가져요
  }

  // 3) 받는 정점 (세상 좌표 위치·법선)
  const recv = picked.filter((p) => p.recv);
  const a = V3(), b = V3(), c = V3();
  const vs: number[] = [], ns: number[] = [];
  const nm = new THREE.Matrix3();
  for (const p of recv) {
    const g = p.mesh.geometry, pos = g.attributes.position as THREE.BufferAttribute, nor = g.attributes.normal as THREE.BufferAttribute | undefined;
    nm.getNormalMatrix(p.mesh.matrixWorld);
    for (let i = 0; i < pos.count; i++) {
      a.fromBufferAttribute(pos, i).applyMatrix4(p.mesh.matrixWorld);
      vs.push(a.x, a.y, a.z);
      if (nor) { b.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); ns.push(b.x, b.y, b.z); } else ns.push(0, 1, 0);
    }
  }
  const nV = vs.length / 3;
  const rays = {
    aoRays: o.quality === 'high' ? 25 : o.quality === 'mid' ? 16 : 9,
    sunRays: o.quality === 'high' ? 8 : o.quality === 'mid' ? 6 : 4,
    lampRays: o.quality === 'high' ? 4 : 2,
  };
  const colorOf = (p: Picked) => {
    const mat = p.mesh.material as THREE.ShaderMaterial;
    return (mat.uniforms.uColor.value as THREE.Color).clone().multiply(avgColor(mat.uniforms.uMap?.value ?? null));
  };

  // 4) 지문: 받는 면의 자리, 가리는 물체의 자리·색, 빛 방향·등불, 광선 수, 계산식이 같을 때만 저장본을 써요.
  //    (흔들리는 등불은 자리 대신 개수만 넣고, 등불 빛 위치는 25cm 단위로 넣어요)
  let h = 2166136261;
  const mix = (x: number) => { h ^= Math.round(x * 1000) | 0; h = Math.imul(h, 16777619); };
  for (let i = 0; i < vs.length; i += 31) mix(vs[i]);
  for (let i = 0; i < ns.length; i += 53) mix(ns[i]);
  for (const p of picked) {
    const pos = p.mesh.geometry.attributes.position as THREE.BufferAttribute;
    mix(pos.count); mix(p.shell ? 1 : 0);
    const col = colorOf(p); mix(col.r); mix(col.g); mix(col.b);
    if (p.glow) continue;
    for (let i = 0; i < pos.count; i += 41) { a.fromBufferAttribute(pos, i).applyMatrix4(p.mesh.matrixWorld); mix(a.x); mix(a.y); mix(a.z); }
  }
  mix(o.light.x); mix(o.light.y); mix(o.light.z);
  for (const l of o.lamps) { mix(Math.round(l.x * 4) / 4); mix(Math.round(l.y * 4) / 4); mix(Math.round(l.z * 4) / 4); }
  mix(rays.aoRays); mix(rays.sunRays); mix(rays.lampRays); mix(nV);
  for (const ch of ALGO) mix(ch.charCodeAt(0));
  const key = `bake:${o.version}:${o.quality}:${(h >>> 0).toString(36)}`;
  let out: Float32Array | null = null;
  let cached = false;
  try {
    const q = (await get(key)) as Uint8Array | undefined;
    if (q && q.length === nV * 4) {
      out = new Float32Array(nV * 4);
      for (let i = 0; i < q.length; i++) out[i] = (i % 4 === 3) ? q[i] / 255 : q[i] / 200; // rgb 는 0~1.275
      cached = true;
    }
  } catch { /* 저장소를 못 쓰면 새로 구워요 */ }

  if (!out) {
    // 가리는 삼각형(세상 좌표)과 색: 새로 구울 때만 모아요
    const tris: number[] = [], alb: number[] = [], shell: number[] = [];
    for (const p of picked) {
      await idle();
      const g = p.mesh.geometry, pos = g.attributes.position as THREE.BufferAttribute;
      const col = colorOf(p);
      const idx = g.index ? (g.index.array as ArrayLike<number>) : null;
      const n = idx ? idx.length : pos.count;
      for (let i = 0; i < n; i += 3) {
        const i0 = idx ? idx[i] : i, i1 = idx ? idx[i + 1] : i + 1, i2 = idx ? idx[i + 2] : i + 2;
        a.fromBufferAttribute(pos, i0).applyMatrix4(p.mesh.matrixWorld);
        b.fromBufferAttribute(pos, i1).applyMatrix4(p.mesh.matrixWorld);
        c.fromBufferAttribute(pos, i2).applyMatrix4(p.mesh.matrixWorld);
        tris.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
        alb.push(col.r, col.g, col.b);
        shell.push(p.shell ? 1 : 0);
      }
    }
    const job: BakeJob = {
      tris: new Float32Array(tris), albedo: new Float32Array(alb), shell: new Uint8Array(shell),
      verts: new Float32Array(vs), norms: new Float32Array(ns),
      light: [o.light.x, o.light.y, o.light.z], lamps: o.lamps.flatMap((l) => [l.x, l.y, l.z]),
      ...rays,
      aoDist: 0.55,
    };
    const raw = await new Promise<Float32Array>((res, rej) => {
      const w = new Worker(new URL('./bake.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e) => {
        if (e.data.progress !== undefined) o.onProgress?.(e.data.progress);
        if (e.data.done) { w.terminate(); res(e.data.done as Float32Array); }
      };
      w.onerror = (e) => { w.terminate(); rej(e); };
      w.postMessage(job, [job.tris.buffer, job.albedo.buffer, job.shell.buffer, job.verts.buffer, job.norms.buffer]);
    });
    out = await smooth(raw, recv);
    try {
      const q = new Uint8Array(out.length);
      for (let i = 0; i < out.length; i++) q[i] = Math.max(0, Math.min(255, Math.round(out[i] * (i % 4 === 3 ? 255 : 200))));
      await set(key, q);
      // 예전 저장본(다른 지문·다른 화질)은 지워서 자리를 비워요
      const old = (await idbKeys()).filter((k) => typeof k === 'string' && k.startsWith('bake:') && k !== key);
      if (old.length) await delMany(old);
    } catch { /* 저장 못 해도 이번에는 그대로 써요 */ }
  }

  // 6) 입히기
  let off = 0;
  for (const p of recv) {
    const g = p.mesh.geometry, n = g.attributes.position.count;
    g.setAttribute('bake', new THREE.BufferAttribute(out.slice(off * 4, (off + n) * 4), 4));
    off += n;
    p.mesh.material = bakedVariant(p.mesh.material as THREE.ShaderMaterial);
  }
  o.onProgress?.(1);
  fadeIn(cached ? 0.8 : 1.6);
  return { verts: nV, ms: Math.round(performance.now() - t0), cached, key };
}
