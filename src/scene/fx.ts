import * as THREE from 'three';
import { blob, ctx2d, makeCanvas, seeded } from '../paint/brush';
import { tex } from '../paint/textures';

const cache = new Map<string, THREE.Texture>();
// 여러 물체가 같이 쓰는 그림이라 물체를 치울 때 지우지 않아요 (shared)
const once = (k: string, make: () => HTMLCanvasElement) => { let t = cache.get(k); if (!t) { t = tex(make()); t.userData.shared = true; cache.set(k, t); } return t; };

export const glowTex = () => once('glow', () => {
  const c = makeCanvas(128, 128), g = ctx2d(c);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return c;
});
export const shadowTex = () => once('shadow', () => {
  const c = makeCanvas(128, 128), g = ctx2d(c);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(60,35,20,0.75)'); gr.addColorStop(0.5, 'rgba(60,35,20,0.35)'); gr.addColorStop(1, 'rgba(60,35,20,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return c;
});
export const shaftTex = () => once('shaft', () => {
  const c = makeCanvas(64, 256), g = ctx2d(c);
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, 'rgba(255,240,200,0.9)'); gr.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 256);
  const side = g.createLinearGradient(0, 0, 64, 0);
  side.addColorStop(0, 'rgba(0,0,0,1)'); side.addColorStop(0.3, 'rgba(0,0,0,0)'); side.addColorStop(0.7, 'rgba(0,0,0,0)'); side.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = side; g.fillRect(0, 0, 64, 256);
  return c;
});
export const cloudsTex = () => once('clouds', () => {
  const w = 1024, h = 256, c = makeCanvas(w, h), g = ctx2d(c), rnd = seeded(91);
  for (let i = 0; i < 9; i++) {
    const x = (i / 9) * w + rnd() * 60, y = 50 + rnd() * 120;
    for (let k = 0; k < 4; k++) for (const dx of [-w, 0, w]) blob(g, x + dx + (k - 1.5) * 30, y + (rnd() - 0.5) * 10, 34 + rnd() * 18, 15 + rnd() * 7, '#FFFFFF', rnd, { layers: 3, alpha: 0.32, edge: 0.04 });
  }
  return c;
});
export const birdTex = () => once('bird', () => {
  const c = makeCanvas(64, 32), g = ctx2d(c);
  g.strokeStyle = '#4A3A33'; g.lineWidth = 4; g.lineCap = 'round';
  g.beginPath(); g.moveTo(6, 10); g.quadraticCurveTo(20, 4, 32, 18); g.quadraticCurveTo(44, 4, 58, 10); g.stroke();
  return c;
});
export const wispTex = () => once('wisp', () => {
  const c = makeCanvas(128, 128), g = ctx2d(c), rnd = seeded(33);
  for (let i = 0; i < 7; i++) {
    const x = 64 + (rnd() - 0.5) * 40, y = 64 + (rnd() - 0.5) * 50, r = 18 + rnd() * 22;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.38)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  }
  return c;
});

export function makeGlow(color: string, size: number, opacity = 0.6) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.setScalar(size);
  s.renderOrder = 7;
  return s;
}

const shadowGeo = new THREE.PlaneGeometry(1, 1);
export function makeShadow(w: number, d: number, opacity = 0.5) {
  const m = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ map: shadowTex(), transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.rotation.x = -Math.PI / 2;
  m.scale.set(w, d, 1);
  m.renderOrder = 1;
  return m;
}

// 창으로 들어오는 빛줄기와 떠다니는 먼지
export function makeSunShafts() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ map: shaftTex(), transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, color: '#FFE8B0' });
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 2.2), mat);
    p.position.set(-0.75 + i * 0.6, 1.25, -1.15);
    p.rotation.set(-0.55, 0.12, -0.22);
    p.renderOrder = 8;
    g.add(p);
  }
  const n = 60;
  const pos = new Float32Array(n * 3);
  const seeds = new Float32Array(n);
  for (let i = 0; i < n; i++) { pos[i * 3] = -1.1 + Math.random() * 2; pos[i * 3 + 1] = 1.1 + Math.random() * 1.3; pos[i * 3 + 2] = -1.5 + Math.random() * 1.0; seeds[i] = Math.random() * 100; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(geo, new THREE.PointsMaterial({ map: glowTex(), size: 0.022, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, color: '#FFF2CC' }));
  dust.renderOrder = 8;
  g.add(dust);
  let t = 0;
  return {
    group: g,
    update(dt: number) {
      t += dt;
      const a = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < n; i++) {
        const s = seeds[i];
        let y = a.getY(i) + Math.sin(t * 0.3 + s) * 0.0006 - 0.0004;
        if (y < 0.95) y = 2.4;
        a.setXYZ(i, a.getX(i) + Math.sin(t * 0.21 + s * 1.7) * 0.0007, y, a.getZ(i) + Math.cos(t * 0.17 + s) * 0.0005);
      }
      a.needsUpdate = true;
    },
  };
}
