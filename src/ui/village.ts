import * as THREE from 'three';
import { sfx } from '../core/sound';
import { ease, tween } from '../core/tween';
import { FAMILIES, FAMILY, FX } from '../data/effects';
import { FOLKS, ITEM_DOODLE, type FeelOpt, type Folk, type FolkMood, type ShopKind } from '../data/folk';
import { ALLEY_LINKS, KIND_EMOJI, LATER } from '../data/later';
import type { Customer, Owner, RamenRecord } from '../data/types';
import { tex } from '../paint/textures';
import type { Look } from '../render/watercolor';
import { Chibi, type Mood } from '../scene/chibi';
import { makeShadow } from '../scene/fx';
import { disposeTree } from '../scene/geo';
import { buildVillage, SHOPS, type VHouse, type Village } from '../scene/village';
import { h, ICON, iconBtn, toast } from './dom';
import { doodleCanvas, doodleImg, type DoodleKind } from './doodles';
import { faceImg, type FaceKind } from './faces';

const mount = <T extends HTMLElement>(el: T) => { (document.getElementById('ui') ?? document.body).appendChild(el); return el; };

// 3D 마음 골목 보기: 전체 보기(모형처럼 내려다보기)와 돌아다니기(사장님 눈으로 직접 걸어 다니기)
export interface World { scene: THREE.Scene; cam: THREE.PerspectiveCamera; update: (dt: number) => void; dof: { focus: number; range: number; amount: number }; look?: Look }

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const EYE = 1.2;            // 사장님 눈높이 (주민 얼굴과 비슷하게)
const WALK = 4.6, BACK = 2.4, TURN = 1.9;
const TALK_R = 3.4;         // 이만큼 가까우면 말을 걸 수 있어요
const SHOP_R = 5;           // 가게 앞 이만큼이면 물건을 받을 수 있어요

const MOOD_FACE: Record<FolkMood, FaceKind> = { happy: 'happy', neutral: 'smile', sad: 'sad', worried: 'worried', angry: 'angry' };
const MOOD_CHIBI: Record<FolkMood, Mood> = { happy: 'happy', neutral: 'neutral', sad: 'sad', worried: 'worried', angry: 'angry' };

// 마음 도장: 사장님마다 이 기기에 남겨요 (못 쓰는 브라우저면 이번만 기억해요)
const KEY = (id: string) => `ramen-alley-folk:${id}`;
function loadDone(id: string): Set<string> {
  try { const v = JSON.parse(localStorage.getItem(KEY(id)) || '[]'); return new Set(Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []); } catch { return new Set(); }
}
function saveDone(id: string, s: Set<string>) { try { localStorage.setItem(KEY(id), JSON.stringify([...s])); } catch { /* 저장 못 해도 계속해요 */ } }

const coarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

export function openVillage(o: {
  owner: Owner; recs: RamenRecord[]; order: string[]; customer: (id: string) => Customer | undefined;
  setWorld: (w: World | null) => void; story: (c: Customer, r: RamenRecord) => Promise<void>;
}): Promise<void> {
  return new Promise((res) => {
    const loading = mount(h('div', { class: 'village-loading fade-in' }, h('div', { class: 'vl-in' }, doodleImg('village', '', 'dicon vl'), h('b', null, '마음 골목을 꾸미는 중…'))));
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
      const vil: Village = buildVillage(houses, towns, FOLKS.map((f) => f.spec));
      const scene = new THREE.Scene();
      scene.add(vil.root);
      const cam = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.3, 900);
      const lit = houses.filter((x) => x.lit).length;
      const done = loadDone(o.owner.id);

      // ── 사장님(나): 돌아다니기에서는 사장님 눈으로 봐요 ──
      const fp = { pos: V(), yaw: 0, pitch: -0.06, y: 0, bob: 0, moving: 0 };
      { const sp = vil.shopDoor.clone().add(V(0, 0, 3)); fp.pos.set(sp.x, 0, sp.z); fp.y = vil.walkY(sp.x, sp.z); }
      let goal: THREE.Vector3 | null = null;
      let onArrive: (() => void) | null = null;
      let faceYaw: number | null = null, facePitch: number | null = null; // 말 걸 때 주민 쪽으로 고개를 돌려요
      // 전체 보기에서 내가 있는 곳 표시
      const texCache = new Map<DoodleKind, THREE.Texture>();
      const dtex = (k: DoodleKind) => { let t = texCache.get(k); if (!t) { t = tex(doodleCanvas(k, 128)); texCache.set(k, t); } return t; };
      const sprite = (k: DoodleKind) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dtex(k), transparent: true, depthWrite: false })); s.renderOrder = 8; return s; };
      const meMark = sprite('me'); scene.add(meMark);

      // ── 카메라 ──
      let mode: 'all' | 'walk' = 'all';
      const fitDist = () => Math.min(310, Math.max(185, 240 / (0.77 * cam.aspect)));
      const all = { target: V(0, 2, -13), dist: fitDist(), yaw: 0 };
      const cur = { pos: V(0, 120, 120), look: V(0, 0, -4) };
      let blend = 1; // 돌아다니기로 바꾼 뒤 내려앉는 동안 0→1
      // 마음 골목은 가게보다 화사하게: 채도·밝기를 올리고 그늘을 밝히고, 낮은 해에서 햇살이 비쳐요
      const look = { sat: 1.18, bright: 1.04, lift: 0.35, rays: 0.25, sunDir: V(0.4, 0.17, 0.5).normalize(), skyD: 400 };
      const world: World = { scene, cam, update: () => {}, dof: { focus: 100, range: 40, amount: 0.8 }, look };
      const B = vil.bounds;
      const clampT = (t: THREE.Vector3) => { t.x = Math.max(B.minX + 6, Math.min(B.maxX - 6, t.x)); t.z = Math.max(B.minZ + 6, Math.min(B.maxZ - 6, t.z)); };
      const eye = () => V(fp.pos.x, fp.y + EYE + Math.sin(fp.bob) * 0.035 * fp.moving, fp.pos.z);
      const want = () => {
        if (mode === 'all') {
          // 가까이 볼수록 비스듬히 (집과 손님이 잘 보이게)
          const t = all.target, d = all.dist, p = 0.6 + 0.35 * Math.min(1, Math.max(0, (d - 14) / 56));
          return { pos: V(t.x + Math.sin(all.yaw) * Math.cos(p) * d, t.y + Math.sin(p) * d, t.z + Math.cos(all.yaw) * Math.cos(p) * d), look: t.clone() };
        }
        const e = eye();
        return { pos: e, look: e.clone().add(V(Math.sin(fp.yaw) * Math.cos(fp.pitch), Math.sin(fp.pitch), Math.cos(fp.yaw) * Math.cos(fp.pitch))) };
      };
      { const w0 = want(); cur.pos.copy(w0.pos).add(V(0, 40, 30)); cur.look.copy(w0.look); }
      const turnTo = (p: THREE.Vector3, headY?: number) => {
        faceYaw = Math.atan2(p.x - fp.pos.x, p.z - fp.pos.z);
        facePitch = headY === undefined ? -0.06 : Math.atan2(headY - (fp.y + EYE), Math.max(0.5, Math.hypot(p.x - fp.pos.x, p.z - fp.pos.z)));
      };

      // 집에서 손님이 나와요
      let guest: { chs: Chibi[]; shadows: THREE.Object3D[] } | null = null;
      let busy = false;
      const popGuest = async (k: number) => {
        const s = vil.houses[k], c = o.customer(s.h.id)!, r = best.get(s.h.id)!;
        busy = true;
        const specs = Array.isArray(c.chibi) ? c.chibi : [c.chibi];
        const side = V(Math.cos(s.yaw), 0, -Math.sin(s.yaw));
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
        chs.forEach((ch) => { ch.walking = 0; ch.play('wave'); if (mode === 'walk') ch.look = eye(); });
        if (mode === 'walk') turnTo(s.out, s.out.y + 0.9);
        await new Promise((r2) => setTimeout(r2, 350));
        await o.story(c, r);
        chs.forEach((ch) => { ch.look = null; ch.play('bow'); });
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
        faceYaw = facePitch = null;
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
          goal = stand; onArrive = () => popGuest(k);
        }
      };

      // ── 동네 주민 ──
      const npcs = vil.npcs;
      const badges = npcs.map(() => { const s = sprite('talk'); scene.add(s); return s; });
      const chatStep = new Map<number, number>();
      let errand: { npc: number; shop: ShopKind; got: boolean } | null = null;
      let talk: number | null = null;
      const shopOf = (k: ShopKind) => vil.shops.find((s) => s.kind === k);
      const shopMark = sprite('bang'); shopMark.visible = false; scene.add(shopMark);
      const badgeKind = (i: number): DoodleKind => {
        const f = FOLKS[i];
        if (done.has(f.id)) return 'heart';
        if (errand?.npc === i) return errand.got ? 'bang' : (ITEM_DOODLE[errand.shop] as DoodleKind);
        return f.type === 'feel' ? 'worry' : f.type === 'chat' ? 'talk' : 'bang';
      };
      const refreshBadges = () => badges.forEach((b, i) => { b.material.map = dtex(badgeKind(i)); b.material.needsUpdate = true; });
      refreshBadges();

      // ── 화면 위 단추와 안내 ──
      const touch = h('div', { class: 'v-touch' });
      const seg = h('div', { class: 'v-seg' });
      const hint = h('div', { class: 'v-hint' });
      const stampChip = h('span', { class: 'chip v-stamp' });
      const drawStamp = () => { stampChip.replaceChildren(doodleImg('stamp'), `마음 도장 ${done.size}/${FOLKS.length}`); };
      drawStamp();
      const goalChip = h('div', { class: 'v-goal card', hidden: true });
      const arrow = h('span', { class: 'v-arrow', html: '<svg viewBox="0 0 24 24"><path d="M12 3l7 9h-4.5v9h-5v-9H5z" fill="#C2560E"/></svg>' });
      const goalText = h('span', { class: 'gt' });
      const goalDist = h('b', { class: 'gd' });
      const goalIcon = h('span', { class: 'gi' });
      goalChip.append(goalIcon, goalText, arrow, goalDist);
      const prompt = h('button', { class: 'v-prompt btn', hidden: true });
      let promptAct: (() => void) | null = null;
      prompt.addEventListener('click', () => { promptAct?.(); });
      const stickGhost = h('div', { class: 'v-stick ghost', hidden: true }, h('i'), h('span', null, '눌러서 걷기'));
      const stick = h('div', { class: 'v-stick', hidden: true }, h('i'));
      const fade = h('div', { class: 'v-fade' });
      const talkBox = h('div', { class: 'v-talk card', hidden: true });
      let hintTimer = 0;
      const PC = !coarse();
      const setMode = (m: 'all' | 'walk') => {
        if (talk !== null) closeTalk();
        const prev = mode;
        mode = m;
        seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.m === m));
        hint.textContent = m === 'all'
          ? (PC ? '끌어서 둘러보고, 휠이나 +·− 단추로 크게 봐요. 불 켜진 집이나 주민을 누르면 만나요.' : '밀어서 둘러보고, 두 손가락으로 크게 봐요. 불 켜진 집이나 주민을 누르면 만나요.')
          : (PC ? '↑↓ 걷기 · ←→ 돌기 · 끌어서 둘러보기 · 스페이스로 말 걸기' : '왼쪽을 눌러 걷고, 오른쪽을 밀어 둘러봐요. 주민 가까이 가면 말을 걸 수 있어요.');
        hint.classList.remove('hide');
        clearTimeout(hintTimer);
        hintTimer = window.setTimeout(() => hint.classList.add('hide'), m === 'walk' ? 7000 : 9000);
        if (m === 'all' && prev === 'walk') { all.target.set(fp.pos.x, 0, fp.pos.z); clampT(all.target); all.dist = Math.max(all.dist, 60); all.yaw = 0; }
        if (m === 'walk' && prev === 'all') { blend = 0; fp.pitch = -0.06; }
        zoom.style.display = m === 'all' ? '' : 'none';
        stickGhost.hidden = !(m === 'walk' && coarse() && !stickUsed);
        el.classList.toggle('walk', m === 'walk');
        goal = null; onArrive = null;
      };
      seg.append(
        h('button', { 'data-m': 'all', onclick: () => { sfx.tap(); setMode('all'); } }, doodleImg('map'), h('span', null, '전체 보기')),
        h('button', { 'data-m': 'walk', onclick: () => { sfx.tap(); setMode('walk'); } }, doodleImg('walk'), h('span', null, '돌아다니기')));
      const zoom = h('div', { class: 'v-zoom' },
        h('button', { 'aria-label': '크게 보기', onclick: () => { sfx.tap(); all.dist = Math.max(18, all.dist * 0.72); } }, '+'),
        h('button', { 'aria-label': '작게 보기', onclick: () => { sfx.tap(); all.dist = Math.min(fitDist() * 1.1, all.dist / 0.72); } }, '−'));
      const news = ALLEY_LINKS.filter((l) => (best.get(l.a)?.stars ?? 0) >= 2 && (best.get(l.b)?.stars ?? 0) >= 2);
      const face = (id: string) => { const c = o.customer(id); const s = c ? (Array.isArray(c.chibi) ? c.chibi[0] : c.chibi) : null; return s ? KIND_EMOJI[s.kind] ?? '🏠' : '🏠'; };
      const newsBox = h('details', { class: 'v-news card' },
        h('summary', null, doodleImg('news'), `골목 소식 ${news.length ? news.length + '개' : ''}`),
        news.length ? h('div', null, news.map((l) => h('div', { class: 'nw' }, h('span', null, face(l.a) + face(l.b)), l.text)))
          : h('div', { class: 'muted' }, lit ? '비슷한 고민을 가진 두 손님을 모두 도우면 두 손님 사이에 새 이야기가 생겨요.' : '라면을 끓여 준 손님의 집에 불이 켜져요.'));
      // 마을 단추: 전체 보기는 그 마을로 날아가고, 돌아다니기는 마을 어귀로 순간 이동해요
      const jumpTo = (k: number) => {
        const t = vil.towns[k];
        fade.classList.add('on');
        setTimeout(() => {
          const hs = vil.houses.filter((x) => x.town === k);
          const p = t.center.clone();
          if (vil.blocked(p.x, p.z) && hs[0]) p.copy(hs[0].out).addScaledVector(V(Math.sin(hs[0].yaw), 0, Math.cos(hs[0].yaw)), 2.5);
          fp.pos.set(p.x, 0, p.z); fp.y = vil.walkY(p.x, p.z);
          const look = hs.length ? hs[Math.floor(hs.length / 2)].hit.position : t.center;
          fp.yaw = Math.atan2(look.x - p.x, look.z - p.z); fp.pitch = -0.06;
          cur.pos.copy(eye()); blend = 1;
          fade.classList.remove('on');
        }, 260);
      };
      const townBar = h('div', { class: 'v-towns' }, vil.towns.map((t, k) => h('button', {
        class: 'v-town', style: `--c:${t.t.color};--s:${FAMILY.get(t.t.family as never)?.soft ?? '#fff'}`,
        onclick: () => { sfx.tap(); if (talk !== null) return; if (mode === 'walk') jumpTo(k); else { all.target.copy(t.center).setY(0); all.dist = 34; all.yaw = 0; } },
      }, h('i', null), `${t.t.name} 마을`, h('b', null, `${t.lit}/${t.total}`))));
      const el = h('div', { class: 'village fade-in' }, touch,
        h('div', { class: 'v-head' },
          h('header', { class: 'v-top' },
            h('div', { class: 'v-title' }, doodleImg('village'), '마음 골목', h('small', null, `${o.owner.number}번 ${o.owner.name} 사장님`)),
            h('span', { class: 'chip v-count' }, `불 켜진 집 ${lit} / ${houses.length}`),
            stampChip,
            seg, h('button', { class: 'icon-btn v-help', 'aria-label': '마음 골목 안내', onclick: () => { sfx.tap(); showIntro(); } }, '?'), iconBtn(ICON.close, () => close(), '닫기')),
          h('div', { class: 'v-row2' }, newsBox, goalChip)),
        hint, zoom, prompt, stickGhost, stick, townBar, talkBox, fade);
      document.body.classList.add('village-open');
      loading.remove();
      mount(el);
      let stickUsed = false;
      setMode('all');
      // ── 처음 열면 짧은 안내 ──
      let intro: HTMLElement | null = null;
      const hideIntro = () => { if (!intro) return; const it = intro; intro = null; it.classList.add('out'); setTimeout(() => it.remove(), 220); };
      function showIntro() {
        if (intro) return;
        const row = (k: DoodleKind, b: string, t: string) => h('li', null, doodleImg(k), h('div', null, h('b', null, b), h('span', null, t)));
        intro = h('div', { class: 'v-intro' }, h('div', { class: 'vi-card card pop-in' },
          h('div', { class: 'vi-head' }, doodleImg('village', '', 'dicon vi-logo'), h('div', null, h('h2', null, '마음 골목'), h('p', null, '라면을 끓여 준 손님들이 사는 마을이에요.'))),
          h('ul', null,
            row('village', '불 켜진 집', '내가 라면을 끓여 준 손님 집이에요. 누르면 손님이 나와 뒷이야기를 들려줘요.'),
            row('talk', '동네 주민', '머리 위에 표시가 뜬 주민에게 말을 걸어 봐요. 마음을 알아주면 마음 도장을 받아요.'),
            row('walk', '돌아다니기', PC ? '사장님 눈으로 걸어요. 화살표 키로 걷고, 끌어서 둘러봐요.' : '사장님 눈으로 걸어요. 왼쪽을 눌러 걷고, 오른쪽을 밀어 둘러봐요.')),
          h('div', { class: 'vi-btns' },
            h('button', { class: 'btn ghost small', onclick: () => { sfx.tap(); hideIntro(); } }, '전체 보기로 둘러보기'),
            h('button', { class: 'btn small', onclick: () => { sfx.pop(); hideIntro(); setMode('walk'); } }, doodleImg('walk'), '걸어 다니기'))));
        intro.addEventListener('click', (e) => { if (e.target === intro) hideIntro(); });
        el.appendChild(intro);
      }
      showIntro();

      // ── 심부름 안내 ──
      const drawGoal = () => {
        if (!errand) { goalChip.hidden = true; shopMark.visible = false; return; }
        const f = FOLKS[errand.npc], e = f.errand!, sh = shopOf(errand.shop);
        goalChip.hidden = false;
        goalIcon.replaceChildren(doodleImg(ITEM_DOODLE[errand.shop] as DoodleKind));
        goalText.textContent = errand.got ? `${e.item}을(를) ${f.name}에게` : `${sh?.name ?? '가게'}에서 ${e.item} 받기`;
        shopMark.visible = !errand.got && !!sh;
        if (sh) shopMark.position.copy(sh.front).setY(sh.front.y + 4.6);
      };
      const goalPos = () => {
        if (!errand) return null;
        if (errand.got) return npcs[errand.npc].ch.root.position;
        return shopOf(errand.shop)?.front ?? null;
      };

      // ── 마음 도장 ──
      const award = (f: Folk) => {
        if (done.has(f.id)) return;
        done.add(f.id); saveDone(o.owner.id, done); drawStamp();
        stampChip.classList.remove('bump'); void stampChip.offsetWidth; stampChip.classList.add('bump');
        sfx.heart();
        const pop = h('div', { class: 'v-stamp-pop' }, doodleImg('stamp', '', 'dicon sp'), h('b', null, '마음 도장!'), h('span', null, `${f.name}의 마음을 알아주었어요`));
        el.appendChild(pop);
        setTimeout(() => pop.remove(), 1900);
        if (done.size === FOLKS.length) setTimeout(() => { sfx.fanfare(); toast('동네 주민 모두에게 마음 도장을 받았어요! 마음 골목이 더 따뜻해졌어요.', 4200); }, 1200);
        refreshBadges();
      };

      // ── 말 걸기 (대화창) ──
      const say = (f: Folk, mood: FolkMood, text: string, buttons: (HTMLElement | null)[]) => {
        talkBox.replaceChildren(
          h('div', { class: 'vt-who' }, faceImg(MOOD_FACE[mood], '', 'hface vt-face'), h('b', null, f.name), h('span', null, f.type === 'feel' ? '마음 이야기' : f.type === 'errand' ? '부탁' : '동네 이야기')),
          h('p', { class: 'vt-line' }, text),
          h('div', { class: 'vt-btns' }, ...buttons));
        const ch = npcs[talk!].ch;
        ch.setMood(MOOD_CHIBI[mood]); ch.talking = true; sfx.talk();
        setTimeout(() => { if (talk !== null) npcs[talk].ch.talking = false; }, 900);
      };
      const btn = (label: string, fn: () => void, cls = 'btn small') => h('button', { class: cls, onclick: () => { sfx.tap(); fn(); } }, label);
      const closeTalk = () => {
        if (talk === null) return;
        const n = npcs[talk];
        n.ch.talking = false; n.ch.look = null; n.faceTo = null;
        n.hold = errand?.npc === talk && !errand.got; // 심부름을 맡긴 주민은 그 자리에서 기다려요
        if (!done.has(FOLKS[talk].id) && FOLKS[talk].type !== 'feel') n.ch.setMood('happy');
        talk = null; talkBox.hidden = true; el.classList.remove('talking');
        faceYaw = facePitch = null;
        drawGoal(); refreshBadges();
      };
      const feelStep = (i: number, f: Folk) => {
        const fe = f.feel!;
        say(f, fe.mood, fe.say, fe.opts.map((op: FeelOpt) => btn(op.text, () => {
          const ch = npcs[i].ch;
          if (op.good) {
            ch.play('cheer');
            say(f, 'happy', op.reply, [btn('천만에!', () => closeTalk())]);
            award(f);
            talkBox.prepend(h('div', { class: 'vt-note' }, fe.after));
          } else {
            ch.play('sad');
            say(f, 'sad', op.reply, [btn('다시 말해 볼게', () => feelStep(i, f), 'btn small ghost')]);
            talkBox.prepend(h('div', { class: 'vt-note soft' }, '마음을 먼저 알아주는 말을 골라 볼까요?'));
          }
        }, 'btn small ghost vt-opt')));
      };
      const chatStepAt = (i: number, f: Folk, k: number) => {
        const lines = f.chat!, last = k >= lines.length - 1;
        npcs[i].ch.play(k === 0 ? 'wave' : 'talk');
        say(f, 'happy', lines[k], [btn(last ? '좋은 이야기 고마워!' : ['그렇구나!', '우와, 정말?', '응응'][k % 3], () => {
          if (last) { award(f); closeTalk(); } else { chatStep.set(i, k + 1); chatStepAt(i, f, k + 1); }
        })]);
      };
      const openTalk = (i: number) => {
        if (busy || talk !== null) return;
        const f = FOLKS[i], n = npcs[i];
        goal = null; onArrive = null;
        talk = i; n.hold = true;
        const meP = mode === 'walk' ? eye() : cur.pos.clone();
        n.faceTo = V(meP.x, 0, meP.z); n.ch.look = meP;
        if (mode === 'walk') turnTo(n.ch.root.position, n.ch.root.position.y + 0.85);
        else { all.target.copy(n.ch.root.position).setY(n.ch.root.position.y); all.dist = 14; }
        talkBox.hidden = false; el.classList.add('talking'); prompt.hidden = true;
        if (done.has(f.id) && !(errand?.npc === i)) { n.ch.play('wave'); say(f, 'happy', f.done, [btn('또 만나요!', () => closeTalk())]); return; }
        if (f.type === 'feel') {
          n.ch.play('worry');
          say(f, f.feel!.mood, f.hello, [btn('무슨 일 있어?', () => feelStep(i, f))]);
        } else if (f.type === 'chat') {
          n.ch.play('wave');
          const k = chatStep.get(i) ?? 0;
          if (k === 0) say(f, 'happy', f.hello, [btn('안녕!', () => chatStepAt(i, f, 0))]);
          else chatStepAt(i, f, k);
        } else {
          const e = f.errand!;
          if (errand && errand.npc === i) {
            if (errand.got) {
              n.ch.play('cheer');
              say(f, 'happy', e.thanks, [btn('천만에!', () => closeTalk())]);
              errand = null; award(f);
            } else say(f, 'neutral', e.waiting, [btn('알았어, 다녀올게!', () => closeTalk())]);
          } else if (errand) {
            say(f, 'neutral', `${f.hello} …아, 지금은 다른 심부름 중이군요. 그거 먼저 끝내고 와 줄래요?`, [btn('알았어!', () => closeTalk())]);
          } else {
            n.ch.play('wave');
            say(f, 'neutral', f.hello, [btn('무슨 부탁인데?', () => {
              n.ch.play('think');
              say(f, 'worried', e.ask, [
                btn('좋아, 다녀올게!', () => { errand = { npc: i, shop: e.shop, got: false }; n.ch.play('cheer'); n.ch.setMood('happy'); toast(e.waiting, 3200); closeTalk(); }),
                btn('다음에 할게', () => closeTalk(), 'btn small ghost')]);
            })]);
          }
        }
      };
      const takeItem = () => {
        if (!errand || errand.got) return;
        const sh = shopOf(errand.shop), e = FOLKS[errand.npc].errand!;
        errand.got = true; sfx.pop();
        toast(`${sh?.name ?? '가게'}에서 ${e.item}을(를) 받았어요. ${FOLKS[errand.npc].name}에게 가져다줘요!`, 3000);
        drawGoal(); refreshBadges();
      };
      const tapNpc = (i: number) => {
        if (talk !== null || busy) return;
        sfx.tap();
        if (mode === 'all') { openTalk(i); return; }
        const p = npcs[i].ch.root.position;
        if (Math.hypot(p.x - fp.pos.x, p.z - fp.pos.z) <= TALK_R + 0.6) { openTalk(i); return; }
        npcs[i].hold = true; // 걸어가는 동안 기다려 줘요
        goal = p.clone(); onArrive = () => openTalk(i);
      };
      const tapShop = (hit: THREE.Object3D) => {
        const kind = hit.userData.shopKind as ShopKind;
        if (errand && !errand.got && errand.shop === kind) {
          const sh = shopOf(kind)!;
          if (mode === 'all' || Math.hypot(sh.front.x - fp.pos.x, sh.front.z - fp.pos.z) <= SHOP_R + 1) { takeItem(); return; }
          sfx.tap(); goal = sh.front.clone(); onArrive = takeItem; return;
        }
        sfx.tap(); toast(hit.userData.shopLine);
      };

      // ── 손가락·마우스 ──
      const ray = new THREE.Raycaster();
      const ndc = (x: number, y: number) => new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
      const pts = new Map<number, { x: number; y: number; x0: number; y0: number; t0: number; stick: boolean }>();
      const stickV = { x: 0, y: 0, id: -1, cx: 0, cy: 0 };
      let pinch0 = 0, dist0 = 0, moved = false;
      const STICK_R = 52;
      const tapAt = (x: number, y: number) => {
        ray.setFromCamera(ndc(x, y), cam);
        const hn = ray.intersectObjects(npcs.map((n) => n.hit), false)[0];
        const hh = ray.intersectObjects(vil.hits, false)[0];
        const hs = ray.intersectObjects(vil.shopHits, false)[0];
        const hg = ray.intersectObject(vil.ground, false)[0];
        const near = (d: number | undefined, ...others: (THREE.Intersection | undefined)[]) => d !== undefined && others.every((x2) => !x2 || d < x2.distance + 1.2);
        if (hn && near(hn.distance, hh, hs, hg)) { tapNpc(hn.object.userData.npc as number); return; }
        if (hs && near(hs.distance, hh, hg)) { tapShop(hs.object); return; }
        if (hh && near(hh.distance, hg)) { tapHouse(hh.object.userData.house); return; }
        if (hg && mode === 'walk') {
          if (vil.inWater(hg.point.x, hg.point.z)) { toast('냇물은 다리로 건너요'); return; }
          goal = hg.point.clone(); onArrive = null; sfx.tap();
        } else if (hg && mode === 'all') { all.target.copy(hg.point).setY(0); clampT(all.target); }
      };
      touch.addEventListener('pointerdown', (e) => {
        touch.setPointerCapture(e.pointerId);
        const isStick = mode === 'walk' && e.pointerType !== 'mouse' && stickV.id < 0 && e.clientX < innerWidth * 0.5 && talk === null;
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now(), stick: isStick });
        if (isStick) {
          stickV.id = e.pointerId; stickV.cx = e.clientX; stickV.cy = e.clientY; stickV.x = stickV.y = 0;
          stick.hidden = false; stick.style.left = `${e.clientX}px`; stick.style.top = `${e.clientY}px`;
          (stick.firstChild as HTMLElement).style.transform = 'translate(-50%, -50%)';
          if (!stickUsed) { stickUsed = true; stickGhost.hidden = true; }
          goal = null; onArrive = null;
        }
        const looks = [...pts.values()].filter((p) => !p.stick);
        if (looks.length === 1 && !isStick) moved = false;
        if (looks.length === 2 && mode === 'all') { const [a, b] = looks; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); dist0 = all.dist; moved = true; }
      });
      touch.addEventListener('pointermove', (e) => {
        const p = pts.get(e.pointerId);
        if (!p) return;
        const dx = e.clientX - p.x, dy = e.clientY - p.y;
        p.x = e.clientX; p.y = e.clientY;
        if (p.stick) {
          let vx = (e.clientX - stickV.cx) / STICK_R, vy = (e.clientY - stickV.cy) / STICK_R;
          const L = Math.hypot(vx, vy); if (L > 1) { vx /= L; vy /= L; }
          stickV.x = vx; stickV.y = vy;
          (stick.firstChild as HTMLElement).style.transform = `translate(calc(-50% + ${vx * STICK_R}px), calc(-50% + ${vy * STICK_R}px))`;
          return;
        }
        const looks = [...pts.values()].filter((q) => !q.stick);
        if (looks.length >= 2) {
          const [a, b] = looks, d = Math.hypot(a.x - b.x, a.y - b.y);
          if (pinch0 > 0 && mode === 'all') all.dist = Math.max(18, Math.min(fitDist() * 1.1, dist0 * (pinch0 / Math.max(20, d))));
          return;
        }
        if (Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > 8) moved = true;
        if (!moved) return;
        if (mode === 'all') {
          const s = (all.dist * 1.1) / innerHeight, c = Math.cos(all.yaw), sn = Math.sin(all.yaw);
          all.target.x -= (dx * c + dy * sn) * s; all.target.z -= (-dx * sn + dy * c) * s;
          clampT(all.target);
        } else if (talk === null) {
          // 끌어서 둘러보기: 오른쪽으로 밀면 오른쪽을 봐요
          fp.yaw -= dx * 0.0055; fp.pitch = Math.max(-0.75, Math.min(0.55, fp.pitch - dy * 0.0045));
          faceYaw = facePitch = null;
        }
      });
      const up = (e: PointerEvent) => {
        const p = pts.get(e.pointerId);
        pts.delete(e.pointerId);
        if ([...pts.values()].filter((q) => !q.stick).length < 2) pinch0 = 0;
        if (!p) return;
        const quick = performance.now() - p.t0 < 350 && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < 10;
        if (p.stick) {
          stickV.id = -1; stickV.x = stickV.y = 0; stick.hidden = true;
          if (quick && !busy && talk === null) tapAt(e.clientX, e.clientY);
          return;
        }
        if (moved || busy || talk !== null || performance.now() - p.t0 > 600) return;
        tapAt(e.clientX, e.clientY);
      };
      touch.addEventListener('pointerup', up);
      touch.addEventListener('pointercancel', (e) => { const p = pts.get(e.pointerId); pts.delete(e.pointerId); pinch0 = 0; if (p?.stick) { stickV.id = -1; stickV.x = stickV.y = 0; stick.hidden = true; } });
      touch.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (mode === 'all') all.dist = Math.max(18, Math.min(fitDist() * 1.1, all.dist * Math.exp(e.deltaY * 0.0012)));
      }, { passive: false });
      // ── 화살표 키 (컴퓨터) ──
      const keys = new Set<string>();
      const MOVE_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'];
      const onKey = (e: KeyboardEvent) => {
        if (e.type === 'keyup') { keys.delete(e.code); return; }
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        if (document.querySelector('.modal-wrap')) { keys.clear(); return; } // 손님 이야기 창이 열려 있으면 쉬어요
        if (intro) { if (['Enter', 'Space', 'Escape'].includes(e.code) || MOVE_KEYS.includes(e.code)) { e.preventDefault(); hideIntro(); if (MOVE_KEYS.includes(e.code)) setMode('walk'); } return; }
        if (MOVE_KEYS.includes(e.code)) {
          e.preventDefault();
          if (talk !== null) return;
          if (mode === 'all') setMode('walk');
          keys.add(e.code); goal = null; onArrive = null;
        } else if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) {
          if (talk !== null) { const b = talkBox.querySelector<HTMLButtonElement>('.vt-btns button:last-child'); if (b && talkBox.querySelectorAll('.vt-btns button').length === 1) { e.preventDefault(); b.click(); } return; }
          if (mode === 'walk' && promptAct && !prompt.hidden) { e.preventDefault(); promptAct(); }
        } else if (e.code === 'Escape' && talk !== null) closeTalk();
      };
      const onBlur = () => keys.clear();
      window.addEventListener('keydown', onKey);
      window.addEventListener('keyup', onKey);
      window.addEventListener('blur', onBlur);

      // ── 매 장면 ──
      const tmp = V();
      const tryMove = (nx: number, nz: number) => {
        const a = fp.pos;
        if (vil.blocked(nx, nz)) { if (!vil.blocked(nx, a.z)) nz = a.z; else if (!vil.blocked(a.x, nz)) nx = a.x; }
        if (vil.blocked(nx, nz)) return false;
        a.set(nx, 0, nz);
        return true;
      };
      const angDiff = (a: number, b: number) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
      world.update = (dt: number) => {
        cam.aspect = innerWidth / innerHeight;
        cam.near = mode === 'walk' ? 0.08 : 0.3;
        cam.updateProjectionMatrix();
        const e0 = mode === 'walk' ? eye() : cur.pos;
        vil.update(dt, e0);
        let moving = 0;
        if (mode === 'walk' && !busy && talk === null) {
          let f = 0, t = 0;
          if (keys.has('ArrowUp') || keys.has('KeyW')) f += 1;
          if (keys.has('ArrowDown') || keys.has('KeyS')) f -= 1;
          if (keys.has('ArrowLeft') || keys.has('KeyA')) t += 1;
          if (keys.has('ArrowRight') || keys.has('KeyD')) t -= 1;
          if (stickV.id >= 0) { const dz = (v: number) => (Math.abs(v) < 0.15 ? 0 : v); f += -dz(stickV.y); t += -dz(stickV.x) * 0.85; }
          f = Math.max(-1, Math.min(1, f)); t = Math.max(-1, Math.min(1, t));
          if (f || t) { goal = null; onArrive = null; faceYaw = facePitch = null; }
          fp.yaw += t * TURN * dt;
          if (f) {
            const step = f * (f > 0 ? WALK : BACK) * dt;
            if (tryMove(fp.pos.x + Math.sin(fp.yaw) * step, fp.pos.z + Math.cos(fp.yaw) * step)) moving = Math.abs(f);
            else if (vil.inWater(fp.pos.x + Math.sin(fp.yaw) * 1.2, fp.pos.z + Math.cos(fp.yaw) * 1.2) && !toastCool) { toastCool = 2.5; toast('냇물은 다리로 건너요'); }
          }
          if (goal) {
            const d = V(goal.x - fp.pos.x, 0, goal.z - fp.pos.z), L = d.length();
            const stopAt = onArrive ? 1.9 : 0.35;
            if (L < stopAt) { goal = null; const fn = onArrive; onArrive = null; fn?.(); }
            else {
              const step = Math.min(L, Math.max(3.4, Math.min(WALK, L * 0.8)) * dt);
              if (tryMove(fp.pos.x + (d.x / L) * step, fp.pos.z + (d.z / L) * step)) {
                moving = 1;
                fp.yaw += angDiff(Math.atan2(d.x, d.z), fp.yaw) * Math.min(1, dt * 6);
                fp.pitch += (-0.06 - fp.pitch) * Math.min(1, dt * 3);
              } else {
                goal = null; onArrive = null;
                if (vil.inWater(fp.pos.x + (d.x / L), fp.pos.z + (d.z / L))) toast('냇물은 다리로 건너요');
                npcs.forEach((n, i) => { if (n.hold && talk !== i && errand?.npc !== i) n.hold = false; });
              }
            }
          }
        }
        if (faceYaw !== null) fp.yaw += angDiff(faceYaw, fp.yaw) * Math.min(1, dt * 5);
        if (facePitch !== null) fp.pitch += (facePitch - fp.pitch) * Math.min(1, dt * 5);
        toastCool = Math.max(0, toastCool - dt);
        fp.moving += (moving - fp.moving) * Math.min(1, dt * 8);
        fp.bob += dt * 9 * fp.moving;
        fp.y += (vil.walkY(fp.pos.x, fp.pos.z) - fp.y) * Math.min(1, dt * 12);
        guest?.chs.forEach((ch) => ch.update(dt));
        // 카메라: 돌아다니기로 바꾸면 하늘에서 사장님 눈높이로 내려앉아요
        const w = want();
        if (mode === 'walk') {
          blend = Math.min(1, blend + dt / 1.1);
          if (blend >= 1) { cur.pos.copy(w.pos); cur.look.copy(w.look); }
          else { const k = 1 - Math.exp(-dt * (3 + 18 * blend * blend)); cur.pos.lerp(w.pos, k); cur.look.lerp(w.look, k); }
        } else { const k = 1 - Math.exp(-dt * 5); cur.pos.lerp(w.pos, k); cur.look.lerp(w.look, k); }
        cam.position.copy(cur.pos); cam.lookAt(cur.look);
        // 머리 위 표시: 멀리서도 보이게 거리만큼 키워요
        const camP = cam.position;
        npcs.forEach((n, i) => {
          const b = badges[i], p = n.ch.root.position, sc = n.ch.root.scale.y;
          const d = camP.distanceTo(p);
          b.position.set(p.x, p.y + 1.75 * sc + 0.25 + Math.sin(performance.now() / 380 + i) * 0.06, p.z);
          b.scale.setScalar(Math.min(4.5, Math.max(0.55, d * (mode === 'all' ? 0.045 : 0.03))));
          const show = mode === 'walk' ? d < 85 : all.dist < 130 || d < 140;
          n.ch.root.visible = show || talk === i || errand?.npc === i;
          b.visible = talk !== i && (n.ch.root.visible || errand?.npc === i || mode === 'all');
        });
        meMark.visible = mode === 'all';
        if (meMark.visible) { meMark.position.set(fp.pos.x, fp.y + 1.2 + cam.position.distanceTo(fp.pos) * 0.03, fp.pos.z); meMark.scale.setScalar(Math.min(7, Math.max(1.2, cam.position.distanceTo(fp.pos) * 0.05))); }
        if (shopMark.visible) {
          const d = camP.distanceTo(shopMark.position);
          shopMark.scale.setScalar(Math.min(6, Math.max(0.8, d * (mode === 'all' ? 0.05 : 0.04))));
          shopMark.material.opacity = mode === 'walk' ? Math.min(1, Math.max(0, (d - 6) / 6)) : 1; // 가게 바로 앞에서는 가려지지 않게
        }
        // 가까운 주민·가게: 말 걸기 단추
        promptAct = null;
        if (mode === 'walk' && talk === null && !busy) {
          let bi = -1, bd = TALK_R;
          npcs.forEach((n, i) => {
            const p = n.ch.root.position, dx = p.x - fp.pos.x, dz = p.z - fp.pos.z, d = Math.hypot(dx, dz);
            if (d < bd && (Math.sin(fp.yaw) * dx + Math.cos(fp.yaw) * dz) / Math.max(0.01, d) > 0.25) { bd = d; bi = i; }
          });
          const sh = errand && !errand.got ? shopOf(errand.shop) : null;
          if (sh && Math.hypot(sh.front.x - fp.pos.x, sh.front.z - fp.pos.z) < SHOP_R) {
            promptAct = takeItem;
            setPrompt(ITEM_DOODLE[errand!.shop] as DoodleKind, `${FOLKS[errand!.npc].errand!.item} 받기`);
          } else if (bi >= 0) {
            const k = bi; promptAct = () => openTalk(k);
            setPrompt('talk', `${FOLKS[bi].name}에게 말 걸기`);
          }
        }
        prompt.hidden = !promptAct;
        stickGhost.hidden = !(mode === 'walk' && !PC && !stickUsed && !promptAct && talk === null);
        // 심부름 방향
        const gp = goalPos();
        if (gp && !goalChip.hidden) {
          tmp.copy(gp).sub(cam.position).applyQuaternion(cam.quaternion.clone().invert());
          arrow.style.transform = `rotate(${Math.atan2(tmp.x, -tmp.z)}rad)`;
          goalDist.textContent = `${Math.round(Math.hypot(gp.x - (mode === 'walk' ? fp.pos.x : all.target.x), gp.z - (mode === 'walk' ? fp.pos.z : all.target.z)))}m`;
        }
        if (mode === 'walk') {
          const tn = talk !== null ? npcs[talk].ch.root.position : null;
          world.dof.focus = tn ? cam.position.distanceTo(tn) : 9; world.dof.range = tn ? 4 : 16; world.dof.amount = tn ? 0.4 : 0.18;
        } else { const fd = cur.pos.distanceTo(cur.look); world.dof.focus = fd; world.dof.range = fd * 0.42; world.dof.amount = 0.9; }
        look.rays = mode === 'walk' ? 0.7 : 0.22;
      };
      let toastCool = 0;
      let promptKey = '';
      function setPrompt(k: DoodleKind, label: string) {
        const key = k + label;
        if (key === promptKey) return;
        promptKey = key;
        prompt.replaceChildren(doodleImg(k), h('span', null, label), ...(PC ? [h('kbd', null, 'Space')] : []));
      }
      o.setWorld(world);
      // 점검용 (개발 중에만)
      if (import.meta.env.DEV) (window as unknown as { __village: unknown }).__village = { vil, cam, fp, setMode, all, openTalk, closeTalk, tapNpc, takeItem, get errand() { return errand; }, get talk() { return talk; }, done, keys, stickV, jumpTo, shops: SHOPS };
      function close() {
        if (busy) return;
        if (talk !== null) closeTalk();
        sfx.back();
        o.setWorld(null);
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('keyup', onKey);
        window.removeEventListener('blur', onBlur);
        clearTimeout(hintTimer);
        el.remove();
        document.body.classList.remove('village-open');
        for (const s of [meMark, shopMark, ...badges]) { scene.remove(s); s.material.dispose(); }
        texCache.forEach((t) => t.dispose());
        vil.dispose();
        res();
      }
    }, 30));
  });
}
