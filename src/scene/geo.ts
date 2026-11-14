import * as THREE from 'three';
import { wc, type WCOpts } from '../render/watercolor';

const cache = new Map<string, THREE.ShaderMaterial>();
const shared = new WeakSet<THREE.Material>();
// 같은 색 재질은 하나만 만들어 같이 써요
export function M(color: string, o: WCOpts = {}) {
  const key = color + JSON.stringify({ ...o, map: o.map ? o.map.uuid : null });
  let m = cache.get(key);
  if (!m) { m = wc(color, o); cache.set(key, m); shared.add(m); }
  return m;
}
// 따로 바꿔 쓸 재질 (반짝임·투명도를 바꿀 때)
export const Mu = (color: string, o: WCOpts = {}) => wc(color, o);

const geoCache = new Map<string, THREE.BufferGeometry>();
const G = <T extends THREE.BufferGeometry>(key: string, make: () => T): T => {
  let g = geoCache.get(key) as T | undefined;
  if (!g) { g = make(); geoCache.set(key, g); }
  return g;
};
export const sphereG = (r = 1, w = 24, h = 16) => G(`s${r},${w},${h}`, () => new THREE.SphereGeometry(r, w, h));
export const boxG = (x = 1, y = 1, z = 1) => G(`b${x},${y},${z}`, () => new THREE.BoxGeometry(x, y, z));
export const cylG = (rt = 1, rb = 1, h = 1, s = 20, open = false) => G(`c${rt},${rb},${h},${s},${open}`, () => new THREE.CylinderGeometry(rt, rb, h, s, 1, open));
export const coneG = (r = 1, h = 1, s = 16) => G(`k${r},${h},${s}`, () => new THREE.ConeGeometry(r, h, s));
export const torusG = (r = 1, t = 0.2, rs = 10, ts = 24, arc = Math.PI * 2) => G(`t${r},${t},${rs},${ts},${arc}`, () => new THREE.TorusGeometry(r, t, rs, ts, arc));
export const capsuleG = (r = 0.1, l = 0.2) => G(`p${r},${l}`, () => new THREE.CapsuleGeometry(r, l, 6, 14));
export const shellG = (r: number, phiC: number, phiL: number, th0: number, thL: number, seg = 18) =>
  G(`sh${r},${phiC},${phiL},${th0},${thL}`, () => new THREE.SphereGeometry(r, seg, Math.max(4, Math.round(seg * 0.6)), phiC - phiL / 2, phiL, th0, thL));

type V3 = [number, number, number];
export function mesh(g: THREE.BufferGeometry, m: THREE.Material, p: V3 = [0, 0, 0], s: V3 | number = 1, r: V3 = [0, 0, 0], parent?: THREE.Object3D) {
  const o = new THREE.Mesh(g, m);
  o.position.set(...p);
  if (typeof s === 'number') o.scale.setScalar(s); else o.scale.set(...s);
  o.rotation.set(...r);
  parent?.add(o);
  return o;
}
export const group = (parent?: THREE.Object3D, p: V3 = [0, 0, 0]) => { const g = new THREE.Group(); g.position.set(...p); parent?.add(g); return g; };

// 곡선을 따라 굵은 관 만들기 (면, 코끼리 코, 꼬리)
export const tube = (pts: V3[], r: number, seg = 40, closed = false) =>
  new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), closed), seg, r, 7, closed);

// 다 쓴 물체 정리: 같이 쓰는 재질과 모양은 남기고, 따로 만든 것만 지워요
export function disposeTree(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if ((c as THREE.InstancedMesh).isInstancedMesh) (c as THREE.InstancedMesh).dispose();
    if (m.isMesh && m.userData.ownGeo) m.geometry.dispose();
    const mats = (m as any).material ? (Array.isArray((m as any).material) ? (m as any).material : [(m as any).material]) : [];
    for (const mat of mats as THREE.Material[]) {
      if (shared.has(mat)) continue;
      if ((mat as THREE.MeshBasicMaterial).isMeshBasicMaterial && (mat as THREE.MeshBasicMaterial).map) (mat as THREE.MeshBasicMaterial).map!.dispose();
      mat.dispose();
    }
  });
}
