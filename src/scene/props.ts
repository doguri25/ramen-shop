import * as THREE from 'three';
import { labelCanvas, tex } from '../paint/textures';
import { wc } from '../render/watercolor';
import { boxG, capsuleG, coneG, cylG, M, mesh, sphereG, torusG, tube } from './geo';

const PI = Math.PI;
const texCache = new Map<string, THREE.Texture>();
const labelTex = (k: string) => { let t = texCache.get(k); if (!t) { t = tex(labelCanvas(k)); texCache.set(k, t); } return t; };
const faced = (k: string, side: string, sx: number, sy: number, sz: number) => {
  const face = wc('#FFFFFF', { map: labelTex(k), rim: 0.3 });
  const s = M(side);
  return new THREE.Mesh(boxG(sx, sy, sz), [s, s, face, s, face, s]);
};
const frontFaced = (k: string, side: string, sx: number, sy: number, sz: number) => {
  const face = wc('#FFFFFF', { map: labelTex(k), rim: 0.3 });
  const s = M(side);
  return new THREE.Mesh(boxG(sx, sy, sz), [s, s, s, s, face, s]);
};

// 손님 옆 계산대 위에 놓는 소품 (원점 = 계산대 윗면)
export function makeProp(id: string): THREE.Group | null {
  const g = new THREE.Group();
  switch (id) {
    case 'cane': {
      const m = mesh(tube([[0, 0, 0], [0, 0.5, 0.02], [0.02, 0.62, 0.03], [0.09, 0.66, 0.03], [0.13, 0.6, 0.03]], 0.018, 24), M('#8A5A3B'), [0, -0.35, 0.05], 1, [0, 0, -0.18], g);
      m.userData.ownGeo = true;
      break;
    }
    case 'mailbag':
      mesh(boxG(0.26, 0.18, 0.1), M('#B5793F'), [0, 0.09, 0], 1, [0, 0.3, 0], g);
      mesh(boxG(0.27, 0.08, 0.105), M('#9A6232'), [0, 0.15, 0.005], 1, [0.1, 0.3, 0], g);
      for (let i = 0; i < 3; i++) mesh(boxG(0.14, 0.09, 0.005), M('#FFF4E6'), [-0.04 + i * 0.03, 0.2 + i * 0.01, -0.02], 1, [0, 0.3, 0.2 - i * 0.15], g);
      break;
    case 'backpack':
      mesh(boxG(0.22, 0.26, 0.12), M('#8FB8DE'), [0, 0.13, 0], 1, [0, 0.25, 0], g);
      mesh(boxG(0.16, 0.1, 0.04), M('#F4C842'), [0, 0.09, 0.06], 1, [0, 0.25, 0], g);
      mesh(torusG(0.05, 0.012, 6, 12, PI), M('#6E93BA'), [0, 0.26, 0], 1, [0, 0.25, 0], g);
      break;
    case 'pencil':
      mesh(cylG(0.012, 0.012, 0.22, 6), M('#F4C842'), [0, 0.012, 0], 1, [0, 0.5, PI / 2], g);
      mesh(coneG(0.012, 0.035, 6), M('#F3D9B5'), [0.128, 0.012, -0.07], 1, [0, 0.5, -PI / 2], g);
      mesh(cylG(0.013, 0.013, 0.025, 8), M('#F2A7B8'), [-0.12, 0.012, 0.066], 1, [0, 0.5, PI / 2], g);
      break;
    case 'script': case 'notebook': case 'timetable': {
      const p = frontFaced(id, '#FFFFFF', 0.2, 0.004, 0.26);
      p.rotation.set(-PI / 2, 0, 0.3); p.position.y = 0.003;
      const s = new THREE.Mesh(boxG(0.2, 0.26, 0.004), [M('#FFFFFF'), M('#FFFFFF'), M('#FFFFFF'), M('#FFFFFF'), wc('#FFFFFF', { map: labelTex(id) }), M('#FFFFFF')]);
      s.rotation.set(-PI / 2 + 0.0, 0, 0.3); s.position.y = 0.004;
      g.add(s);
      if (id === 'notebook') mesh(boxG(0.205, 0.006, 0.265), M('#E3645A'), [0, 0.001, 0], 1, [0, -0.3, 0], g);
      break;
    }
    case 'ddakji':
      for (let i = 0; i < 2; i++) {
        const d = faced('ddakji', '#6FB3E0', 0.12, 0.02, 0.12);
        d.position.set(i * 0.1 - 0.05, 0.01 + i * 0.02, i * 0.03); d.rotation.set(i * 0.25, i * 0.7, 0);
        g.add(d);
      }
      break;
    case 'ball': {
      const b = new THREE.Mesh(sphereG(0.1, 24, 16), wc('#FFFFFF', { map: labelTex('ball') }));
      b.position.y = 0.1; g.add(b);
      break;
    }
    case 'award': case 'photo': {
      const f = frontFaced(id, id === 'award' ? '#E9B92A' : '#C9A27A', 0.2, 0.24, 0.02);
      f.position.set(0, 0.12, 0); f.rotation.set(-0.25, 0.3, 0);
      g.add(f);
      break;
    }
    case 'notebooks':
      for (let i = 0; i < 5; i++) mesh(boxG(0.2, 0.025, 0.26), M(['#8EC5E8', '#F2A7B8', '#A8D08D', '#F4C842', '#B9A3DB'][i]), [(i % 2) * 0.01, 0.013 + i * 0.026, 0], 1, [0, i * 0.08, 0], g);
      break;
    case 'flowers':
      mesh(cylG(0.05, 0.035, 0.12, 14), M('#8EC5E8'), [0, 0.06, 0], 1, [0, 0, 0], g);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * PI * 2;
        mesh(cylG(0.005, 0.005, 0.16, 5), M('#6FA34A'), [Math.cos(a) * 0.02, 0.18, Math.sin(a) * 0.02], 1, [Math.sin(a) * 0.2, 0, Math.cos(a) * 0.2], g);
        mesh(sphereG(0.035, 12, 8), M(['#F2A7B8', '#F7D560', '#E3645A', '#FFFFFF', '#B9A3DB'][i]), [Math.cos(a) * 0.05, 0.27, Math.sin(a) * 0.05], 1, [0, 0, 0], g);
      }
      break;
    case 'blocks':
      for (let i = 0; i < 6; i++) mesh(boxG(0.06, 0.06, 0.06), M(['#E3645A', '#F4C842', '#6FB3E0', '#8DC26F', '#F0974A', '#A68BD6'][i]), [(i % 3) * 0.07 - 0.07, 0.03 + (i > 3 ? 0.06 : 0), Math.floor(i / 3) * 0.06], 1, [0, i * 0.3, 0], g);
      break;
    case 'bubblesign': {
      mesh(cylG(0.008, 0.008, 0.3, 6), M('#B5793F'), [0, 0.15, 0], 1, [0, 0, 0], g);
      const s = frontFaced('bubblesign', '#FFFFFF', 0.24, 0.16, 0.015);
      s.position.set(0, 0.36, 0); g.add(s);
      break;
    }
    case 'box': {
      const b = faced('box', '#D8AE7E', 0.3, 0.22, 0.24);
      b.position.y = 0.11; b.rotation.y = 0.35; g.add(b);
      break;
    }
    case 'pillow':
      mesh(sphereG(1), M('#FFFFFF', { noise: 2 }), [0, 0.06, 0], [0.18, 0.06, 0.12], [0, 0.3, 0], g);
      mesh(sphereG(1), M('#8EC5E8'), [0.02, 0.1, 0.02], [0.05, 0.02, 0.05], [0, 0, 0], g);
      break;
    case 'robot':
      mesh(boxG(0.12, 0.12, 0.08), M('#A9B4C2'), [0, 0.06, 0], 1, [0, 0.3, 0], g);
      mesh(boxG(0.09, 0.08, 0.07), M('#A9B4C2'), [0.1, 0.04, 0.05], 1, [0.6, 0.2, 1.1], g);
      mesh(cylG(0.012, 0.012, 0.1, 6), M('#E3645A'), [-0.09, 0.03, 0.05], 1, [0, 0, 1.4], g);
      for (const x of [-0.03, 0.03]) mesh(sphereG(0.015), M('#F4C842'), [x, 0.08, 0.04], 1, [0, 0, 0], g);
      break;
    case 'letter': case 'letterheart': {
      const l = frontFaced(id, '#FFF4E6', 0.2, 0.13, 0.008);
      l.position.set(0, 0.006, 0); l.rotation.set(-PI / 2 + 0.15, 0, 0.25); g.add(l);
      break;
    }
    case 'nametag': {
      for (const sd of [-1, 1]) {
        const p = frontFaced('nametag', '#FFF4E6', 0.18, 0.1, 0.006);
        p.position.set(0, 0.045, sd * 0.025); p.rotation.set(sd * 0.45, sd > 0 ? 0 : PI, 0); g.add(p);
      }
      break;
    }
    case 'blanket':
      mesh(boxG(0.26, 0.05, 0.2), M('#F2A7B8', { noise: 2 }), [0, 0.025, 0], 1, [0, 0.3, 0], g);
      mesh(boxG(0.26, 0.03, 0.2), M('#FFF4E6', { noise: 2 }), [0, 0.06, 0], 1, [0, 0.35, 0.05], g);
      break;
    case 'broom':
      mesh(cylG(0.012, 0.012, 0.7, 8), M('#B5793F'), [0, 0.0, 0.06], 1, [0.1, 0, -0.2], g);
      mesh(coneG(0.07, 0.18, 12), M('#E9C46A', { noise: 3 }), [0.07, -0.36, 0.1], [1, 1, 0.5], [PI + 0.1, 0, -0.2], g);
      break;
    case 'gift': {
      const b = faced('gift', '#F2A7B8', 0.18, 0.15, 0.18);
      b.position.y = 0.075; b.rotation.y = 0.4; g.add(b);
      mesh(boxG(0.19, 0.155, 0.03), M('#F7D560'), [0, 0.076, 0], 1, [0, 0.4, 0], g);
      mesh(boxG(0.03, 0.155, 0.19), M('#F7D560'), [0, 0.076, 0], 1, [0, 0.4, 0], g);
      for (const sd of [-1, 1]) mesh(torusG(0.035, 0.012, 6, 12), M('#F7D560'), [sd * 0.03, 0.17, 0], [1, 1, 0.6], [0, 0.4, sd * 0.6], g);
      break;
    }
    case 'shovel':
      mesh(cylG(0.012, 0.012, 0.2, 6), M('#B5793F'), [0, 0.012, 0], 1, [0, 0.4, PI / 2], g);
      mesh(boxG(0.09, 0.008, 0.07), M('#A9B4C2'), [0.13, 0.012, -0.055], 1, [0, 0.4, 0], g);
      break;
    case 'basket':
      mesh(cylG(0.13, 0.1, 0.12, 20, true), M('#D9A866', { side: THREE.DoubleSide, noise: 3 }), [0, 0.06, 0], [1, 1, 0.75], [0, 0, 0], g);
      mesh(torusG(0.11, 0.01, 6, 24, PI), M('#B5793F'), [0, 0.12, 0], [1, 1, 1], [0, PI / 2, 0], g);
      mesh(sphereG(0.04), M('#E3645A'), [-0.03, 0.12, 0], 1, [0, 0, 0], g);
      mesh(boxG(0.1, 0.03, 0.06), M('#FFF4E6'), [0.04, 0.12, 0], 1, [0, 0.3, 0], g);
      break;
    case 'jumprope': {
      const m = mesh(tube([[-0.15, 0.01, 0], [-0.08, 0.01, 0.1], [0.05, 0.01, 0.08], [0.12, 0.01, -0.04], [0.02, 0.01, -0.08], [-0.1, 0.01, -0.02]], 0.007, 40), M('#E3645A'), [0, 0, 0], 1, [0, 0, 0], g);
      m.userData.ownGeo = true;
      for (const x of [-0.15, -0.1]) mesh(capsuleG(0.015, 0.06), M('#6FB3E0'), [x, 0.015, x === -0.15 ? 0.03 : -0.05], 1, [PI / 2, 0, 0.5], g);
      break;
    }
    case 'ruler': {
      const r = frontFaced('ruler', '#F7D98A', 0.32, 0.05, 0.005);
      r.position.set(0, 0.003, 0); r.rotation.set(-PI / 2, 0, 0.2); g.add(r);
      break;
    }
    case 'poster': {
      const m = mesh(cylG(0.03, 0.03, 0.32, 14), wc('#FFFFFF', { map: labelTex('poster') }), [0, 0.03, 0], 1, [0, 0.3, PI / 2], g);
      void m;
      break;
    }
    default:
      return null;
  }
  return g;
}
