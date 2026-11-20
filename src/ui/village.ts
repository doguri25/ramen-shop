import * as THREE from 'three';
import { sfx } from '../core/sound';
import { ease, tween } from '../core/tween';
import { FAMILIES, FAMILY, FX } from '../data/effects';
import { ALLEY_LINKS, KIND_EMOJI, LATER } from '../data/later';
import type { ChibiSpec, Customer, Owner, RamenRecord } from '../data/types';
import { Chibi } from '../scene/chibi';
import { makeShadow } from '../scene/fx';
import { disposeTree } from '../scene/geo';
import { buildVillage, type VHouse, type Village } from '../scene/village';
import { h, ICON, iconBtn, toast } from './dom';

const mount = <T extends HTMLElement>(el: T) => { (document.getElementById('ui') ?? document.body).appendChild(el); return el; };

// 3D 마음 골목 보기: 전체 보기(모형처럼 내려다보기)와 돌아다니기(사장님이 직접 걸어 다니기)
export interface World { scene: THREE.Scene; cam: THREE.PerspectiveCamera; update: (dt: number) => void; dof: { focus: number; range: number; amount: number } }

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const OWNER: ChibiSpec = { kind: 'raccoon', fur: '#9C8F84', fur2: '#F4EEE6', mark: '#4E443C', cloth: '#E07A3F' };
const FOLK: ChibiSpec[] = [
  { kind: 'sheep', fur: '#FBF7EF', fur2: '#F2E6D8', cloth: '#9FC6E0' },
  { kind: 'duck', fur: '#FFE27A', fur2: '#F6B04A', cloth: '#E98BA3' },
  { kind: 'hedgehog', fur: '#B08A6A', fur2: '#F3E2CC', cloth: '#8DC26F' },
  { kind: 'frog', fur: '#8DCB72', fur2: '#E9F5D6', cloth: '#F6CF3E' },
  { kind: 'mouse', fur: '#C9C2BA', fur2: '#F7E9E6', cloth: '#A68BD6' },
  { kind: 'deer', fur: '#C99366', fur2: '#F5E3CC', cloth: '#47AE7A' },
  { kind: 'pig', fur: '#F6C3C8', fur2: '#FBE3E5', cloth: '#6FB3E0' },
  { kind: 'otter', fur: '#9A7458', fur2: '#E9D6C0', cloth: '#F0974A' },
  { kind: 'chick', fur: '#FFE07A', fur2: '#FFF1BF', cloth: '#E3645A' },
  { kind: 'koala', fur: '#B9B6B2', fur2: '#ECE8E4', cloth: '#E9B92A' },
];

export function openVillage(o: {
  owner: Owner; recs: RamenRecord[]; order: string[]; customer: (id: string) => Customer | undefined;
  setWorld: (w: World | null) => void; story: (c: Customer, r: RamenRecord) => Promise<void>;
}): Promise<void> {
  return new Promise((res) => {
    const loading = mount(h('div', { class: 'village-loading fade-in' }, h('div', { class: 'vl-in' }, '🏘', h('b', null, '마음 골목을 꾸미는 중…'))));
    requestAnimationFrame(() => setTimeout(() => {
      // ── 손님 집 (온 차례대로, 묶음별 마을) ──
      const best = new Map<string, RamenRecord>();
      for (const r of o.recs) { const b = best.get(r.customerId); if (!b || r.stars > b.stars || (r.stars === b.stars && r.round > b.round)) best.set(r.customerId, r); }
      const ids = o.order.filter((id) => !!o.customer(id) && !!LATER[id]);
      const houses: VHouse[] = ids.map((id) => {
        const c = o.customer(id)!, r = best.get(id);
        return { id, name: c.name, family: FX.get(c.needs.effect)!.family, lit: !!r, stars: r?.stars ?? 0, spec: c.chibi };
      });
      const towns = FAMILIES.map((f) => ({ family: f.id, name: f.name, color: f.color }));
      const vil: Village = buildVillage(houses, towns, FOLK.slice(0, 7));
      const scene = new THREE.Scene();
      scene.add(vil.root);
      const cam = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.3, 900);
      const lit = houses.filter((x) => x.lit).length;
      // 사장님(돌아다니기에서 보여요)
      const me = new Chibi(OWNER);
      const meShadow = makeShadow(0.8, 0.7, 0.5);
      { const sp = vil.shopDoor.clone().add(V(3.5, 0, 5)); me.root.position.set(sp.x, vil.walkY(sp.x, sp.z), sp.z); } me.root.rotation.y = Math.PI + 0.55; me.setMood('happy');
      scene.add(me.root); scene.add(meShadow);
      let goal: THREE.Vector3 | null = null;
      let onArrive: (() => void) | null = null;
      // ── 카메라 ──
      let mode: 'all' | 'walk' = 'all';
      const fitDist = () => Math.min(310, Math.max(185, 240 / (0.77 * cam.aspect)));
      const all = { target: V(0, 2, -13), dist: fitDist(), yaw: 0 };
      const walk = { yaw: 0.55, pitch: 0.42, dist: 10 };
      const cur = { pos: V(0, 120, 120), look: V(0, 0, -4) };
      const world: World = { scene, cam, update: () => {}, dof: { focus: 100, range: 40, amount: 0.8 } };
      const B = vil.bounds;
      const clampT = (t: THREE.Vector3) => { t.x = Math.max(B.minX + 6, Math.min(B.maxX - 6, t.x)); t.z = Math.max(B.minZ + 6, Math.min(B.maxZ - 6, t.z)); };
      const want = () => {
        if (mode === 'all') {
          // 가까이 볼수록 비스듬히 (집과 손님이 잘 보이게)
          const t = all.target, d = all.dist, p = 0.6 + 0.35 * Math.min(1, Math.max(0, (d - 14) / 56));
          return { pos: V(t.x + Math.sin(all.yaw) * Math.cos(p) * d, t.y + Math.sin(p) * d, t.z + Math.cos(all.yaw) * Math.cos(p) * d), look: t.clone() };
        }
        const a = me.root.position, p = walk.pitch, d = walk.dist;
        const pos = V(a.x + Math.sin(walk.yaw) * Math.cos(p) * d, a.y + 1 + Math.sin(p) * d, a.z + Math.cos(walk.yaw) * Math.cos(p) * d);
        pos.y = Math.max(pos.y, vil.heightAt(pos.x, pos.z) + 1.6);
        return { pos, look: a.clone().add(V(0, 1.2, 0)) };
      };
      { const w0 = want(); cur.pos.copy(w0.pos).add(V(0, 40, 30)); cur.look.copy(w0.look); }
      // 집에서 손님이 나와요
      let guest: { chs: Chibi[]; shadows: THREE.Object3D[] } | null = null;
      let busy = false;
      const popGuest = async (k: number) => {
        const s = vil.houses[k], c = o.customer(s.h.id)!, r = best.get(s.h.id)!;
        busy = true;
        const specs = Array.isArray(c.chibi) ? c.chibi : [c.chibi];
        const fwd = V(Math.sin(s.yaw), 0, Math.cos(s.yaw)), side = V(Math.cos(s.yaw), 0, -Math.sin(s.yaw));
        const chs = specs.map((sp) => { const ch = new Chibi(sp); ch.root.position.copy(s.door); ch.root.rotation.y = s.yaw; ch.root.scale.multiplyScalar(0.01); scene.add(ch.root); ch.setMood('happy'); return ch; });
        const shadows = chs.map(() => { const sh = makeShadow(0.7, 0.6, 0.45); scene.add(sh); return sh; });
        guest = { chs, shadows };
        const sc = chs.map((ch) => ch.root.scale.x / 0.01);
        sfx.pop();
        await tween(0.9, (t) => chs.forEach((ch, i) => {
          const off = (i - (chs.length - 1) / 2) * 0.75;
          const p = s.door.clone().lerp(s.out, ease.outCubic(t)).addScaledVector(side, off * t);
          ch.root.position.set(p.x, vil.walkY(p.x, p.z), p.z);
          ch.root.scale.setScalar(Math.max(0.01, sc[i] * Math.min(1, t * 2.2)));
          ch.walking = t < 0.9 ? 1 : 0;
          shadows[i].position.set(p.x, ch.root.position.y + 0.05, p.z);
        }), { ease: ease.linear });
        chs.forEach((ch) => { ch.walking = 0; ch.play('wave'); });
        if (mode === 'walk') { me.root.rotation.y = Math.atan2(s.out.x - me.root.position.x, s.out.z - me.root.position.z); }
        void fwd;
        await new Promise((r2) => setTimeout(r2, 350));
        await o.story(c, r);
        chs.forEach((ch) => { ch.play('bow'); });
        await new Promise((r2) => setTimeout(r2, 500));
        const from = chs.map((ch) => ch.root.position.clone());
        await tween(0.7, (t) => chs.forEach((ch, i) => {
          const p = from[i].clone().lerp(s.door, t);
          ch.root.position.set(p.x, vil.walkY(p.x, p.z), p.z);
          ch.root.rotation.y = s.yaw + Math.PI;
          ch.walking = 1;
          ch.root.scale.setScalar(Math.max(0.01, sc[i] * (1 - Math.max(0, t - 0.5) * 2)));
          shadows[i].position.set(p.x, ch.root.position.y + 0.05, p.z);
        }), { ease: ease.linear });
        chs.forEach((ch) => { scene.remove(ch.root); disposeTree(ch.root); });
        shadows.forEach((sh) => { scene.remove(sh); disposeTree(sh); });
        guest = null;
        busy = false;
      };
      const tapHouse = (k: number) => {
        const s = vil.houses[k];
        if (!s.h.lit) { sfx.back(); toast('아직 만나지 않은 손님의 집이에요. 라면을 끓여 주면 불이 켜져요.'); return; }
        sfx.tap();
        if (mode === 'all') {
          all.target.copy(s.out); all.dist = 14; all.yaw = s.yaw;
          setTimeout(() => popGuest(k), 650);
        } else {
          const stand = s.out.clone().addScaledVector(V(Math.sin(s.yaw), 0, Math.cos(s.yaw)), 2.2);
          goal = stand; onArrive = () => { walk.yaw = s.yaw; popGuest(k); };
        }
      };
      // ── 화면 위 단추와 안내 ──
      const touch = h('div', { class: 'v-touch' });
      const seg = h('div', { class: 'v-seg' });
      const hint = h('div', { class: 'v-hint' });
      const setMode = (m: 'all' | 'walk') => {
        mode = m;
        seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.m === m));
        hint.textContent = m === 'all'
          ? '손가락으로 밀어 둘러보고, 두 손가락이나 +·− 단추로 크게 볼 수 있어요. 불 켜진 집을 누르면 손님이 나와요.'
          : '가고 싶은 곳을 누르면 사장님이 걸어가요. 옆으로 밀면 둘러볼 수 있어요. 불 켜진 집을 누르면 손님이 나와요.';
        me.root.visible = meShadow.visible = m === 'walk';
        if (m === 'all') { all.target.copy(me.root.position).setY(0); clampT(all.target); all.dist = Math.max(all.dist, 60); }
        zoom.style.display = m === 'all' ? '' : 'none';
      };
      seg.append(
        h('button', { 'data-m': 'all', onclick: () => { sfx.tap(); setMode('all'); } }, '🗺 전체 보기'),
        h('button', { 'data-m': 'walk', onclick: () => { sfx.tap(); setMode('walk'); } }, '🚶 돌아다니기'));
      const zoom = h('div', { class: 'v-zoom' },
        h('button', { 'aria-label': '크게 보기', onclick: () => { sfx.tap(); all.dist = Math.max(18, all.dist * 0.72); } }, '+'),
        h('button', { 'aria-label': '작게 보기', onclick: () => { sfx.tap(); all.dist = Math.min(fitDist() * 1.1, all.dist / 0.72); } }, '−'));
      const news = ALLEY_LINKS.filter((l) => (best.get(l.a)?.stars ?? 0) >= 2 && (best.get(l.b)?.stars ?? 0) >= 2);
      const face = (id: string) => { const c = o.customer(id); const s = c ? (Array.isArray(c.chibi) ? c.chibi[0] : c.chibi) : null; return s ? KIND_EMOJI[s.kind] ?? '🏠' : '🏠'; };
      const newsBox = h('details', { class: 'v-news card' },
        h('summary', null, `📮 골목 소식 ${news.length ? news.length + '개' : ''}`),
        news.length ? h('div', null, news.map((l) => h('div', { class: 'nw' }, h('span', null, face(l.a) + face(l.b)), l.text)))
          : h('div', { class: 'muted' }, lit ? '비슷한 고민을 가진 두 손님을 모두 도우면 두 손님 사이에 새 이야기가 생겨요.' : '라면을 끓여 준 손님의 집에 불이 켜져요.'));
      const townBar = h('div', { class: 'v-towns' }, vil.towns.map((t) => h('button', {
        class: 'v-town', style: `--c:${t.t.color};--s:${FAMILY.get(t.t.family as never)?.soft ?? '#fff'}`,
        onclick: () => { sfx.tap(); if (mode === 'walk') { goal = t.center.clone(); onArrive = null; } else { all.target.copy(t.center).setY(0); all.dist = 34; all.yaw = 0; } },
      }, h('i', null), `${t.t.name} 마을`, h('b', null, `${t.lit}/${t.total}`))));
      const el = h('div', { class: 'village fade-in' }, touch,
        h('header', { class: 'v-top' },
          h('div', { class: 'v-title' }, '🏘 마음 골목', h('small', null, `${o.owner.number}번 ${o.owner.name} 사장님`)),
          h('span', { class: 'chip v-count' }, `불 켜진 집 ${lit} / ${houses.length}`),
          seg, iconBtn(ICON.close, () => close(), '닫기')),
        newsBox, hint, zoom, townBar);
      document.body.classList.add('village-open');
      loading.remove();
      mount(el);
      setMode('all');
      // ── 손가락 ──
      const ray = new THREE.Raycaster();
      const ndc = (x: number, y: number) => new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
      const pts = new Map<number, { x: number; y: number; x0: number; y0: number; t0: number }>();
      let pinch0 = 0, dist0 = 0, moved = false;
      touch.addEventListener('pointerdown', (e) => {
        touch.setPointerCapture(e.pointerId);
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now() });
        if (pts.size === 1) moved = false;
        if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); dist0 = mode === 'all' ? all.dist : walk.dist; moved = true; }
      });
      touch.addEventListener('pointermove', (e) => {
        const p = pts.get(e.pointerId);
        if (!p) return;
        const dx = e.clientX - p.x, dy = e.clientY - p.y;
        p.x = e.clientX; p.y = e.clientY;
        if (pts.size >= 2) {
          const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
          if (pinch0 > 0) { const k = pinch0 / Math.max(20, d); if (mode === 'all') all.dist = Math.max(18, Math.min(fitDist() * 1.1, dist0 * k)); else walk.dist = Math.max(5, Math.min(18, dist0 * k)); }
          return;
        }
        if (Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > 8) moved = true;
        if (!moved) return;
        if (mode === 'all') {
          const s = (all.dist * 1.1) / innerHeight, c = Math.cos(all.yaw), sn = Math.sin(all.yaw);
          all.target.x -= (dx * c + dy * sn) * s; all.target.z -= (-dx * sn + dy * c) * s;
          clampT(all.target);
        } else {
          walk.yaw -= dx * 0.006;
          walk.pitch = Math.max(0.15, Math.min(1.2, walk.pitch + dy * 0.004));
        }
      });
      const up = (e: PointerEvent) => {
        const p = pts.get(e.pointerId);
        pts.delete(e.pointerId);
        if (pts.size < 2) pinch0 = 0;
        if (!p || moved || busy || performance.now() - p.t0 > 600) return;
        ray.setFromCamera(ndc(e.clientX, e.clientY), cam);
        const hh = ray.intersectObjects(vil.hits, false)[0];
        const hs = ray.intersectObjects(vil.shopHits, false)[0];
        const hg = ray.intersectObject(vil.ground, false)[0];
        if (hs && (!hh || hs.distance < hh.distance) && (!hg || hs.distance < hg.distance + 2)) { sfx.tap(); toast(hs.object.userData.shopLine); return; }
        if (hh && (!hg || hh.distance < hg.distance + 2)) { tapHouse(hh.object.userData.house); return; }
        if (hg && mode === 'walk') {
          if (vil.inWater(hg.point.x, hg.point.z)) { toast('냇물은 다리로 건너요'); return; }
          goal = hg.point.clone(); onArrive = null; sfx.tap();
        } else if (hg && mode === 'all') { all.target.copy(hg.point).setY(0); clampT(all.target); }
      };
      touch.addEventListener('pointerup', up);
      touch.addEventListener('pointercancel', (e) => { pts.delete(e.pointerId); pinch0 = 0; });
      touch.addEventListener('wheel', (e) => {
        e.preventDefault();
        const k = Math.exp(e.deltaY * 0.0012);
        if (mode === 'all') all.dist = Math.max(18, Math.min(fitDist() * 1.1, all.dist * k)); else walk.dist = Math.max(5, Math.min(18, walk.dist * k));
      }, { passive: false });
      // ── 매 장면 ──
      world.update = (dt: number) => {
        cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix();
        vil.update(dt);
        if (goal && !busy) {
          const a = me.root.position, d = V(goal.x - a.x, 0, goal.z - a.z), L = d.length();
          if (L < 0.35) { goal = null; me.walking = 0; const f = onArrive; onArrive = null; f?.(); }
          else {
            const step = Math.min(L, Math.max(4.2, Math.min(9, L * 0.6)) * dt);
            let nx = a.x + (d.x / L) * step, nz = a.z + (d.z / L) * step;
            // 집·가게·우물에 부딪히면 옆으로 미끄러져 돌아가요
            if (vil.blocked(nx, nz)) { if (!vil.blocked(nx, a.z)) nz = a.z; else if (!vil.blocked(a.x, nz)) nx = a.x; }
            if (vil.blocked(nx, nz)) { goal = null; me.walking = 0; if (vil.inWater(nx, nz)) toast('냇물은 다리로 건너요'); }
            else {
              a.set(nx, vil.walkY(nx, nz), nz);
              const yaw = Math.atan2(d.x, d.z); let dy = yaw - me.root.rotation.y; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
              me.root.rotation.y += dy * Math.min(1, dt * 10);
              me.walking = 1;
            }
          }
        } else me.walking = 0;
        meShadow.position.set(me.root.position.x, me.root.position.y + 0.05, me.root.position.z);
        me.update(dt);
        guest?.chs.forEach((ch) => ch.update(dt));
        const w = want(), k = 1 - Math.exp(-dt * (mode === 'all' ? 5 : 6));
        cur.pos.lerp(w.pos, k); cur.look.lerp(w.look, k);
        cam.position.copy(cur.pos); cam.lookAt(cur.look);
        const fd = cur.pos.distanceTo(cur.look);
        world.dof.focus = fd; world.dof.range = mode === 'all' ? fd * 0.42 : 9; world.dof.amount = mode === 'all' ? 0.9 : 0.35;
      };
      o.setWorld(world);
      // 점검용 (개발 중에만)
      if (import.meta.env.DEV) (window as unknown as { __village: unknown }).__village = { vil, cam, me, setMode, all };
      function close() {
        if (busy) return;
        sfx.back();
        o.setWorld(null);
        el.remove();
        document.body.classList.remove('village-open');
        scene.remove(me.root); disposeTree(me.root);
        vil.dispose();
        res();
      }
    }, 30));
  });
}
