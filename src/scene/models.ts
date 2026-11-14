import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { wc } from '../render/watercolor';

// 3dassets.dev 의 CC0(누구나 자유롭게 쓰는) 모델
// 게임 폴더 models/ 에 파일이 있으면 그것을 쓰고, 없으면 사이트에서 바로 불러와요.
export const CC0 = {
  lantern: { id: 36453, file: 'paper-lantern-round.glb' },
  clock: { id: 37758, file: 'wall-clock.glb' },
  crockery: { id: 36434, file: 'crockery-rack.glb' },
  stool: { id: 36426, file: 'counter-stool.glb' },
  caddy: { id: 36436, file: 'chopstick-caddy.glb' },
  plant: { id: 36418, file: 'potted-plant.glb' },
  onggi: { id: 38062, file: 'onggi-jar-small.glb' },
  easel: { id: 36457, file: 'menu-board-easel.glb' },
} as const;
export type ModelKey = keyof typeof CC0;

const loader = new GLTFLoader();

async function fetchBuf(url: string, ms: number): Promise<ArrayBuffer | null> {
  const ctl = new AbortController();
  const tm = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) return null;
    const b = await r.arrayBuffer();
    // glTF 바이너리인지 확인 ('glTF')
    if (b.byteLength < 12 || new Uint32Array(b, 0, 1)[0] !== 0x46546c67) return null;
    return b;
  } catch { return null; } finally { clearTimeout(tm); }
}

// 원래 재질의 색과 그림을 그대로 가져와 수채 재질로 바꿔요
export function toWatercolor(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const conv = (src: THREE.Material) => {
      const sm = src as THREE.MeshStandardMaterial;
      const col = sm.color ? sm.color.clone().convertLinearToSRGB() : new THREE.Color(1, 1, 1);
      if (sm.map) { sm.map.colorSpace = THREE.NoColorSpace; sm.map.needsUpdate = true; }
      const metal = (sm.metalness ?? 0) > 0.5, glossy = (sm.roughness ?? 1) < 0.4;
      const w = wc(col, { map: sm.map ?? null, rim: 0.5, alpha: sm.transparent ? sm.opacity : undefined, transparent: sm.transparent, side: sm.side, spec: metal ? 0.6 : glossy ? 0.35 : 0, noise: 1.5 });
      if (sm.emissive && sm.emissive.getHex() !== 0) {
        w.uniforms.uGlow.value = 0.5;
        w.uniforms.uGlowColor.value = sm.emissive.clone().convertLinearToSRGB();
      }
      w.userData.cc0 = true;
      return w;
    };
    m.material = Array.isArray(m.material) ? m.material.map(conv) : conv(m.material);
  });
  return root;
}

export interface Loaded { scene: THREE.Group; animations: THREE.AnimationClip[] }
const memo = new Map<ModelKey, Promise<Loaded | null>>();

export function loadModel(key: ModelKey): Promise<Loaded | null> {
  let p = memo.get(key);
  if (p) return p;
  p = (async () => {
    const { id, file } = CC0[key];
    let buf = await fetchBuf(`./models/${file}`, 6000);
    if (!buf) buf = await fetchBuf(`https://cdn.3dassets.dev/assets/${id}/v1/model.glb`, 12000);
    if (!buf) return null;
    try {
      const g = await loader.parseAsync(buf, './models/');
      toWatercolor(g.scene);
      return { scene: g.scene, animations: g.animations };
    } catch (e) { console.warn('[model]', key, e); return null; }
  })();
  memo.set(key, p);
  return p;
}

// 모델을 원하는 크기(높이 또는 가로)로 맞춰요
export function fitTo(obj: THREE.Object3D, size: { h?: number; w?: number }) {
  const box = new THREE.Box3().setFromObject(obj);
  const s = box.getSize(new THREE.Vector3());
  const k = size.h ? size.h / Math.max(1e-4, s.y) : size.w ? size.w / Math.max(1e-4, s.x) : 1;
  obj.scale.multiplyScalar(k);
  return k;
}
