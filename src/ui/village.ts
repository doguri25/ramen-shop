import * as THREE from 'three';
import { sfx } from '../core/sound';
import { ease, tween } from '../core/tween';
import { FAMILIES, FAMILY, FX } from '../data/effects';
import { CRAFT, type CraftKind } from '../data/craft';
import { FOLKS, folkIndex, ITEM_DOODLE, type FeelOpt, type Folk, type FolkMood, type ShopKind } from '../data/folk';
import { QUEST, QUESTS, type Quest } from '../data/quests';
import { ALLEY_LINKS, KIND_EMOJI, LATER } from '../data/later';
import type { Customer, Owner, RamenRecord } from '../data/types';
import { josa } from '../data/text';
import { getTod, onTod, setTod, TOD_DOODLE, TOD_LIGHT, TOD_LOOK, TOD_NAME, TODS, type Tod } from '../core/tod';
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
const EYE = 1.45;           // 사장님 눈높이: 주민(키 1.7~2.0) 눈과 비슷하게 마주 봐요
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
// 가게 봐 주기 기록: 가게마다 가장 많이 받은 별과 봐 준 횟수
type ShopRec = Partial<Record<CraftKind, { best: number; times: number }>>;
const SKEY = (id: string) => `ramen-alley-shop:${id}`;
function loadShop(id: string): ShopRec { try { const v = JSON.parse(localStorage.getItem(SKEY(id)) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } }
function saveShop(id: string, r: ShopRec) { try { localStorage.setItem(SKEY(id), JSON.stringify(r)); } catch { /* 저장 못 해도 계속해요 */ } }
// 이어지는 미션: 끝낸 미션과 하는 중인 미션(몇 번째 단계인지)
type QState = { done: string[]; cur?: { id: string; step: number; got?: string[] } };
const QKEY = (id: string) => `ramen-alley-quest:${id}`;
function loadQ(id: string): QState {
  try { const v = JSON.parse(localStorage.getItem(QKEY(id)) || '{}'); return { done: Array.isArray(v?.done) ? v.done.filter((x: unknown) => typeof x === 'string' && QUEST.has(x as string)) : [], cur: v?.cur && QUEST.has(v.cur.id) ? { id: v.cur.id, step: Math.max(0, v.cur.step | 0), got: Array.isArray(v.cur.got) ? v.cur.got.filter((x: unknown) => typeof x === 'string') : undefined } : undefined }; } catch { return { done: [] }; }
}
function saveQ(id: string, q: QState) { try { localStorage.setItem(QKEY(id), JSON.stringify(q)); } catch { /* 저장 못 해도 계속해요 */ } }
// 지금 하는 일: 주민 심부름 또는 이어지는 미션의 한 단계
interface Task { src: 'errand' | 'quest'; npc: number; qid?: string; step: number; gets: ShopKind[]; got: ShopKind[]; item: string; to: number[] }

const coarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

export function openVillage(o: {
  owner: Owner; recs: RamenRecord[]; order: string[]; customer: (id: string) => Customer | undefined;
  setWorld: (w: World | null) => void; story: (c: Customer, r: RamenRecord) => Promise<void>;
  shopSit?: (kind: CraftKind) => Promise<{ stars: number[] }>;
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
      // 멀리 있는 주민을 눌러 걸어가는 동안 그 주민은 기다려 줘요. 걸어가기를 그만두면 다시 다니게 해요
      let waitNpc = -1;
      const cancelGoal = () => {
        goal = null; onArrive = null;
        const i = waitNpc; waitNpc = -1;
        if (i < 0 || i === talk) return;
        const n = people[i];
        if (!n.at && !(i < NN && holdFor(i))) n.hold = false;
      };
      let faceYaw: number | null = null, facePitch: number | null = null; // 말 걸 때 주민 쪽으로 고개를 돌려요
      // 전체 보기에서 내가 있는 곳 표시
      const texCache = new Map<DoodleKind, THREE.Texture>();
      const dtex = (k: DoodleKind) => { let t = texCache.get(k); if (!t) { t = tex(doodleCanvas(k, 128)); texCache.set(k, t); } return t; };
      const sprite = (k: DoodleKind) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dtex(k), transparent: true, depthWrite: false })); s.renderOrder = 8; return s; };
      const meMark = sprite('me'); scene.add(meMark);

      // ── 카메라 ──
      let mode: 'all' | 'walk' = 'all';
      const fitDist = () => Math.min(400, Math.max(235, 305 / (0.77 * cam.aspect)));
      const all = { target: V(0, 2, 18), dist: fitDist(), yaw: 0 };
      const cur = { pos: V(0, 120, 120), look: V(0, 0, -4) };
      let blend = 1; // 돌아다니기로 바꾼 뒤 내려앉는 동안 0→1
      // 마음 골목은 가게보다 화사하게: 채도·밝기를 올리고 그늘을 밝히고, 낮은 해에서 햇살이 비쳐요
      const look: Look & { rays: number } = { sat: 1.18, bright: 1.04, lift: 0.35, rays: 0.25, sunDir: V(0.4, 0.17, 0.5).normalize(), skyD: 400, paper: 0.8, blot: 0.6 };
      // 시간대(낮·노을녘·밤): 하늘과 등불, 화면 빛깔을 함께 바꿔요
      let rayK = 1;
      const applyTod = (t: Tod) => {
        const L = TOD_LOOK[t], P = TOD_LIGHT[t];
        look.sat = L.sat; look.bright = L.bright; look.lift = L.lift; look.sunDir = L.sunDir; rayK = L.rayK;
        if (t === 'day') { delete look.tint; delete look.lightW; delete look.sunCol; delete look.haze; } else { look.tint = P.tint; look.lightW = P.lightW; look.sunCol = P.sunCol; look.haze = P.haze; }
        vil.setTod(t);
        todBtn.replaceChildren(doodleImg(TOD_DOODLE[t]));
        todBtn.setAttribute('aria-label', `시간대 바꾸기 (지금 ${TOD_NAME[t]})`); todBtn.title = `지금은 ${TOD_NAME[t]}`;
      };
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

      // 대화 전 시점: 이야기가 끝나면 그 자리(걷기는 보던 방향·고개, 전체 보기는 위치·확대)로 천천히 돌아가요
      let preView: { mode: 'all' | 'walk'; yaw: number; pitch: number; target: THREE.Vector3; dist: number; ayaw: number } | null = null;
      let faceBack = false;
      // 되돌아가는 중에 다시 말을 걸면, 반쯤 돌아간 방향이 아니라 원래 보던 방향을 기억해요
      const saveView = () => {
        const back = faceBack && faceYaw !== null;
        preView = { mode, yaw: back ? faceYaw! : fp.yaw, pitch: back ? facePitch ?? fp.pitch : fp.pitch, target: all.target.clone(), dist: all.dist, ayaw: all.yaw };
      };
      const restoreView = () => {
        const v = preView; preView = null; faceBack = false;
        if (!v || v.mode !== mode) { faceYaw = facePitch = null; return; }
        if (mode === 'walk') { faceYaw = v.yaw; facePitch = v.pitch; faceBack = true; }
        else { all.target.copy(v.target); all.dist = v.dist; all.yaw = v.ayaw; faceYaw = facePitch = null; }
      };

      // 집에서 손님이 나와요
      let guest: { chs: Chibi[]; shadows: THREE.Object3D[] } | null = null;
      let busy = false;
      const popGuest = async (k: number) => {
        if (guest) return;
        const s = vil.houses[k], c = o.customer(s.h.id)!, r = best.get(s.h.id)!;
        busy = true;
        const specs = Array.isArray(c.chibi) ? c.chibi : [c.chibi];
        const side = V(Math.cos(s.yaw), 0, -Math.sin(s.yaw));
        const chs = specs.map((sp) => { const ch = new Chibi(sp); ch.update(1 / 60); ch.root.position.copy(s.door); ch.root.rotation.y = s.yaw; ch.root.scale.multiplyScalar(0.01); scene.add(ch.root); ch.setMood('happy'); return ch; });
        const shadows = chs.map(() => { const sh = makeShadow(0.7, 0.6, 0.45); scene.add(sh); return sh; });
        guest = { chs, shadows };
        const sc = chs.map((ch) => ch.root.scale.x / 0.01);
        sfx.pop();
        await tween(0.9, (t) => chs.forEach((ch, i) => {
          const off = (i - (chs.length - 1) / 2) * 0.75;
          const p = s.door.clone().lerp(s.out, ease.outCubic(t)).addScaledVector(side, off * t);
          ch.root.scale.setScalar(Math.max(0.01, sc[i] * Math.min(1, t * 2.2)));
          ch.root.position.set(p.x, vil.standY(p.x, p.z, ch), p.z);
          ch.walking = t < 0.9 ? 1 : 0;
          shadows[i].position.set(p.x, vil.walkY(p.x, p.z) + 0.05, p.z);
        }), { ease: ease.linear });
        chs.forEach((ch) => { ch.walking = 0; ch.play('wave'); if (mode === 'walk') ch.look = eye(); });
        if (mode === 'walk') { saveView(); turnTo(s.out, s.out.y + 0.8); }
        await new Promise((r2) => setTimeout(r2, 350));
        await o.story(c, r);
        chs.forEach((ch) => { ch.look = null; ch.play('bow'); });
        await new Promise((r2) => setTimeout(r2, 500));
        const from = chs.map((ch) => ch.root.position.clone());
        await tween(0.7, (t) => chs.forEach((ch, i) => {
          const p = from[i].clone().lerp(s.door, t);
          ch.root.rotation.y = s.yaw + Math.PI;
          ch.walking = 1;
          ch.root.scale.setScalar(Math.max(0.01, sc[i] * (1 - Math.max(0, t - 0.5) * 2)));
          ch.root.position.set(p.x, vil.standY(p.x, p.z, ch), p.z);
          shadows[i].position.set(p.x, vil.walkY(p.x, p.z) + 0.05, p.z);
        }), { ease: ease.linear });
        chs.forEach((ch) => { scene.remove(ch.root); disposeTree(ch.root); });
        shadows.forEach((sh) => { scene.remove(sh); disposeTree(sh); });
        guest = null;
        busy = false;
        restoreView();
      };
      const tapHouse = (k: number) => {
        if (busy || guest) return;
        const s = vil.houses[k];
        if (!s.h.lit) { sfx.back(); toast('아직 만나지 않은 손님의 집이에요. 라면을 끓여 주면 불이 켜져요.'); return; }
        sfx.tap();
        if (mode === 'all') {
          saveView();
          all.target.copy(s.out); all.dist = 14; all.yaw = s.yaw;
          busy = true; // 다가가는 동안 다른 집을 누르거나 닫으면 이야기 창이 겹치지 않게
          setTimeout(() => popGuest(k), 650);
        } else {
          const stand = s.out.clone().addScaledVector(V(Math.sin(s.yaw), 0, Math.cos(s.yaw)), 2.2);
          goal = stand; onArrive = () => popGuest(k);
        }
      };

      // ── 동네 주민과 산책하는 손님 ──
      const npcs = vil.npcs;
      const walkers = vil.walkers;
      const NN = npcs.length;
      const people = [...npcs, ...walkers]; // 대화 상대 번호: 주민 0..NN-1, 산책 손님 NN..
      const badges = npcs.map(() => { const s = sprite('talk'); scene.add(s); return s; });
      const chatStep = new Map<number, number>();
      let task: Task | null = null;
      let talk: number | null = null;
      const shopOf = (k: ShopKind) => vil.shops.find((s) => s.kind === k);
      const shopMark = sprite('bang'); shopMark.visible = false; scene.add(shopMark);
      // 가게 주인은 자기 가게 앞에 서 있어요
      const pinned = new Set<number>();
      const shopRec = loadShop(o.owner.id);
      FOLKS.forEach((f, i) => {
        const kind = (f.type === 'shop' && f.sit ? f.sit.kind : f.stand) as ShopKind | undefined;
        if (!kind) return;
        const sh = shopOf(kind);
        if (!sh) return;
        const fwd = V(Math.sin(sh.yaw), 0, Math.cos(sh.yaw)), side = V(Math.cos(sh.yaw), 0, -Math.sin(sh.yaw));
        const p = sh.front.clone().addScaledVector(fwd, -1.9).addScaledVector(side, -1.7);
        const n = npcs[i];
        n.ch.root.position.set(p.x, vil.standY(p.x, p.z, n.ch), p.z); n.ch.root.rotation.y = sh.yaw;
        n.sh.position.set(p.x, vil.walkY(p.x, p.z) + 0.05, p.z);
        n.hold = true; pinned.add(i);
      });
      // ── 이어지는 미션 ──
      const qs = loadQ(o.owner.id);
      const qDone = new Set(qs.done);
      const unlocked = (q: Quest) => q.need.every((id) => done.has(id)) && (!q.needStamps || done.size >= q.needStamps);
      const offerOf = (i: number) => QUESTS.find((q) => folkIndex(q.giver) === i && !qDone.has(q.id) && task?.qid !== q.id && unlocked(q) && done.has(FOLKS[i].id));
      const toIdx = (q: Quest, to: string) => (to === 'group' ? (q.group ?? []).map(folkIndex) : [folkIndex(to)]).filter((x) => x >= 0);
      const questTask = (q: Quest, step: number): Task => {
        const t = q.tasks[step];
        return { src: 'quest', npc: folkIndex(q.giver), qid: q.id, step, gets: [...(t.get ?? [])], got: [], item: t.item, to: toIdx(q, t.to) };
      };
      // 마음 모으기: 세 주민이 광장 한쪽에 동그랗게 모여요
      const meetSpot = (q: Quest) => {
        const g = QUESTS.filter((x) => x.kind === 'mood').indexOf(q);
        const a = -Math.PI / 2 + (g - 1) * 1.15;
        return vil.plaza.clone().add(V(Math.cos(a) * (vil.plazaR - 3.2), 0, Math.sin(a) * (vil.plazaR - 3.2)));
      };
      const meetFace = new Map<number, THREE.Vector3>(); // 모임 중인 주민이 바라볼 곳
      const gather = (q: Quest, on: boolean) => {
        const c = meetSpot(q);
        (q.group ?? []).map(folkIndex).forEach((i, k) => {
          const n = npcs[i];
          if (!on) { n.at = null; n.faceTo = null; meetFace.delete(i); if (!pinned.has(i)) { n.hold = false; n.goHome = true; } return; }
          const a = (k / 3) * Math.PI * 2;
          n.at = c.clone().add(V(Math.cos(a) * 1.5, 0, Math.sin(a) * 1.5)); n.goHome = false; n.faceTo = c.clone(); meetFace.set(i, c.clone());
        });
      };
      if (qs.cur) { const q = QUEST.get(qs.cur.id)!; if (qs.cur.step < q.tasks.length) { task = questTask(q, qs.cur.step); const t0 = task; t0.got = (qs.cur.got ?? []).filter((k): k is ShopKind => t0.gets.includes(k as ShopKind)); if (q.kind === 'mood') gather(q, true); } else qs.cur = undefined; }
      if (qDone.has('q-festival')) vil.festival.visible = true;
      const badgeKind = (i: number): DoodleKind => {
        const f = FOLKS[i];
        if (task && task.to.includes(i) && task.got.length >= task.gets.length) return 'bang';
        if (task?.src === 'errand' && task.npc === i) return ITEM_DOODLE[task.gets[0]] as DoodleKind;
        const q = offerOf(i);
        if (q) return q.kind === 'chain' ? 'chain' : q.kind === 'mood' ? 'group' : 'party';
        if (done.has(f.id)) return 'heart';
        if (f.type === 'shop') return 'shopsit';
        return f.type === 'feel' ? 'worry' : f.type === 'chat' ? 'talk' : 'bang';
      };
      const refreshBadges = () => badges.forEach((b, i) => { b.material.map = dtex(badgeKind(i)); b.material.needsUpdate = true; });
      refreshBadges();

      // ── 화면 위 단추와 안내 ──
      const touch = h('div', { class: 'v-touch' });
      const seg = h('div', { class: 'v-seg' });
      const hint = h('div', { class: 'v-hint' });
      // 마음 도장 칩을 누르면 마음 수첩(할 일 목록)이 열려요
      const stampChip = h('button', { class: 'chip v-stamp', 'aria-label': '마음 수첩 열기', onclick: () => { sfx.tap(); showBook(); } });
      const drawStamp = () => { stampChip.replaceChildren(doodleImg('stamp'), h('span', null, h('em', { class: 'lbl' }, '마음 도장 '), `${done.size}/${FOLKS.length}`), h('i', { class: 'v-book-ic' }, doodleImg('notebook'))); };
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
        if (busy) return; // 잔치·집 손님 이야기처럼 막아 둔 동안에는 보기를 바꾸지 않아요 (닫기·걷기가 멈춰 버리지 않게)
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
        cancelGoal();
      };
      seg.append(
        h('button', { 'data-m': 'all', onclick: () => { sfx.tap(); setMode('all'); } }, doodleImg('map'), h('span', null, '전체 보기')),
        h('button', { 'data-m': 'walk', onclick: () => { sfx.tap(); setMode('walk'); } }, doodleImg('walk'), h('span', null, '돌아다니기')));
      const todBtn = h('button', { class: 'v-tod', onclick: () => {
        sfx.tap();
        const t = TODS[(TODS.indexOf(getTod()) + 1) % TODS.length];
        setTod(t);
        toast(t === 'day' ? '해가 떴어요. 낮이에요' : t === 'dusk' ? '노을이 지고 있어요' : '밤이 되었어요. 집마다 불이 반짝여요');
      } });
      const offTod = onTod(applyTod);
      const zoom = h('div', { class: 'v-zoom' },
        h('button', { 'aria-label': '크게 보기', onclick: () => { sfx.tap(); all.dist = Math.max(18, all.dist * 0.72); } }, '+'),
        h('button', { 'aria-label': '작게 보기', onclick: () => { sfx.tap(); all.dist = Math.min(fitDist() * 1.1, all.dist / 0.72); } }, '−'));
      const news = ALLEY_LINKS.filter((l) => (best.get(l.a)?.stars ?? 0) >= 2 && (best.get(l.b)?.stars ?? 0) >= 2);
      const face = (id: string) => { const c = o.customer(id); const s = c ? (Array.isArray(c.chibi) ? c.chibi[0] : c.chibi) : null; return s ? KIND_EMOJI[s.kind] ?? '🏠' : '🏠'; };
      // 골목 소식: 위쪽 줄에 작은 칩으로 두고, 누르면 아래로 펼쳐져요 (좁은 화면에서는 그림과 숫자만)
      const newsBox = h('details', { class: 'v-news' },
        h('summary', { 'aria-label': `골목 소식 ${news.length}개`, title: '골목 소식' }, doodleImg('news'), h('span', { class: 'nl' }, '골목 소식'), news.length ? h('b', { class: 'nc' }, String(news.length)) : null),
        h('div', { class: 'nb card' }, h('b', { class: 'nh' }, '골목 소식'),
          news.length ? h('div', null, news.map((l) => h('div', { class: 'nw' }, h('span', null, face(l.a) + face(l.b)), l.text)))
            : h('div', { class: 'muted' }, lit ? '비슷한 고민을 가진 두 손님을 모두 도우면 두 손님 사이에 새 이야기가 생겨요.' : '라면을 끓여 준 손님의 집에 불이 켜져요.')));
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
          faceYaw = facePitch = null; faceBack = false;
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
            stampChip, newsBox,
            h('div', { class: 'v-right' }, seg, h('button', { class: 'icon-btn v-help', 'aria-label': '마음 골목 안내', onclick: () => { sfx.tap(); showIntro(); } }, '?'), iconBtn(ICON.close, () => close(), '닫기'))),
          h('div', { class: 'v-row2' }, goalChip)),
        hint, h('div', { class: 'v-side' }, todBtn, zoom), prompt, stickGhost, stick, townBar, talkBox, fade);
      applyTod(getTod());
      document.body.classList.add('village-open');
      loading.remove();
      mount(el);
      el.addEventListener('click', (e) => { if (e.detail > 0) (e.target as Element).closest?.('button')?.blur(); });
      let stickUsed = false;
      setMode('all');
      // ── 처음 열면 짧은 안내 ──
      let intro: HTMLElement | null = null;
      const hideIntro = () => { if (!intro) return; const it = intro; intro = null; it.classList.add('out'); setTimeout(() => it.remove(), 220); };
      function showIntro() {
        if (intro) return;
        const row = (k: DoodleKind, b: string, t: string) => h('li', null, doodleImg(k), h('div', null, h('b', null, b), h('span', null, t)));
        intro = h('div', { class: 'v-intro' }, h('div', { class: 'vi-card vi-guide card pop-in' },
          h('div', { class: 'vi-head' }, doodleImg('village', '', 'dicon vi-logo'), h('div', null, h('h2', null, '마음 골목'), h('p', null, '라면을 끓여 준 손님들이 사는 마을이에요.'))),
          h('ul', null,
            row('village', '불 켜진 집', '라면을 끓여 준 손님 집이에요. 누르면 손님이 나와요. 골목을 산책하는 손님도 있어요.'),
            row('talk', '동네 주민', '머리 위에 표시가 뜬 주민에게 말을 걸어요. 마음을 알아주면 마음 도장! 도장이 모이면 이어지는 미션이 열려요.'),
            row('shopsit', '가게 봐 주기', '가게 주인이 자리를 비울 때 가게를 봐 줘요. 빵집·꽃집은 손님 셋, 다른 가게는 손님 하나예요.'),
            row('notebook', '마음 수첩', '위쪽 마음 도장을 누르면 할 일과 미션이 한눈에 보여요.'),
            row('walk', '돌아다니기', PC ? '사장님 눈으로 걸어요. 화살표 키로 걷고, 끌어서 둘러봐요.' : '사장님 눈으로 걸어요. 왼쪽을 눌러 걷고, 오른쪽을 밀어 둘러봐요.')),
          h('div', { class: 'vi-btns' },
            h('button', { class: 'btn ghost small', onclick: () => { sfx.tap(); hideIntro(); } }, '전체 보기로 둘러보기'),
            h('button', { class: 'btn small', onclick: () => { sfx.pop(); hideIntro(); setMode('walk'); } }, doodleImg('walk'), '걸어 다니기'))));
        intro.addEventListener('click', (e) => { if (e.target === intro) hideIntro(); });
        el.appendChild(intro);
      }
      showIntro();

      // ── 할 일 안내 (심부름·미션) ──
      const need = () => (task ? task.gets.filter((k) => !task!.got.includes(k)) : []);
      const nearShop = () => {
        const list = need().map((k) => shopOf(k)).filter((x): x is NonNullable<typeof x> => !!x);
        const me = mode === 'walk' ? fp.pos : all.target;
        list.sort((a, b) => Math.hypot(a.front.x - me.x, a.front.z - me.z) - Math.hypot(b.front.x - me.x, b.front.z - me.z));
        return list[0] ?? null;
      };
      const nearTo = () => {
        if (!task || !task.to.length) return null;
        const me = mode === 'walk' ? fp.pos : all.target;
        return [...task.to].sort((a, b) => npcs[a].ch.root.position.distanceTo(me) - npcs[b].ch.root.position.distanceTo(me))[0];
      };
      const taskLabel = () => {
        if (!task) return '';
        const sh = nearShop(), left = need().length;
        if (sh) return task.gets.length > 1 ? `${sh.name}에서 받기 (${task.got.length}/${task.gets.length})` : `${sh.name}에서 ${task.item} 받기`;
        const q = task.qid ? QUEST.get(task.qid)! : null;
        if (q?.kind === 'mood') return `${josa(task.item, '을', '를')} 광장 모임에`;
        const t = nearTo();
        void left;
        return `${josa(task.item, '을', '를')} ${t !== null ? FOLKS[t].name : ''}에게`;
      };
      const drawGoal = () => {
        if (!task) { goalChip.hidden = true; shopMark.visible = false; return; }
        const sh = nearShop();
        goalChip.hidden = false;
        goalIcon.replaceChildren(doodleImg(sh ? (ITEM_DOODLE[sh.kind] as DoodleKind) : task.src === 'quest' ? (QUEST.get(task.qid!)!.kind === 'mood' ? 'group' : QUEST.get(task.qid!)!.kind === 'festival' ? 'party' : 'chain') : 'bang'));
        goalText.textContent = taskLabel();
        shopMark.visible = !!sh;
        if (sh) shopMark.position.copy(sh.front).setY(sh.front.y + 4.6);
      };
      const goalPos = () => {
        if (!task) return null;
        const sh = nearShop();
        if (sh) return sh.front;
        const t = nearTo();
        return t !== null ? npcs[t].ch.root.position : null;
      };
      drawGoal(); // 하던 미션을 이어서 열면 '지금 할 일'과 가게 표시를 바로 보여 줘요

      // ── 마음 도장 ──
      const popStamp = (k: DoodleKind, title: string, line: string) => {
        const pop = h('div', { class: 'v-stamp-pop' }, doodleImg(k, '', 'dicon sp'), h('b', null, title), h('span', null, line));
        el.appendChild(pop);
        setTimeout(() => pop.remove(), 1900);
      };
      const award = (f: Folk, line = `${f.name}의 마음을 알아주었어요`) => {
        if (done.has(f.id)) return;
        const before = QUESTS.filter((q) => !qDone.has(q.id) && unlocked(q)).length;
        done.add(f.id); saveDone(o.owner.id, done); drawStamp();
        stampChip.classList.remove('bump'); void stampChip.offsetWidth; stampChip.classList.add('bump');
        sfx.heart();
        popStamp('stamp', '마음 도장!', line);
        const opened = QUESTS.filter((q) => !qDone.has(q.id) && unlocked(q));
        if (opened.length > before) {
          const q = opened.find((x) => x.need.includes(f.id) || (x.needStamps && done.size === x.needStamps)) ?? opened[opened.length - 1];
          setTimeout(() => { sfx.pop(); toast(`새 미션 '${q.title}'${josa(q.title, '이', '가').slice(q.title.length)} 열렸어요! ${FOLKS[folkIndex(q.giver)].name}에게 가 보세요.`, 4000); }, 1500);
        }
        if (done.size === FOLKS.length) setTimeout(() => { sfx.fanfare(); toast('동네 주민 모두에게 마음 도장을 받았어요! 마음 골목이 더 따뜻해졌어요.', 4200); }, 1200);
        refreshBadges();
      };
      const finishQuest = (q: Quest) => {
        qDone.add(q.id); qs.done = [...qDone]; qs.cur = undefined; saveQ(o.owner.id, qs);
        task = null;
        sfx.fanfare();
        popStamp(q.kind === 'chain' ? 'chain' : q.kind === 'mood' ? 'group' : 'party', `${q.title} 끝!`, q.end);
        setTimeout(() => toast(`${q.end} (이어지는 미션 ${qDone.size}/${QUESTS.length})`, 3600), 1500);
        drawGoal(); refreshBadges();
      };

      // ── 말 걸기 (대화창) ──
      // who: 말하는 주민(번호). 손님(산책)이 말할 때는 이름과 얼굴을 따로 넘겨요
      const say = (f: Folk | { name: string; type?: string }, mood: FolkMood, text: string, buttons: (HTMLElement | null)[], who = talk!, tag?: string) => {
        const ty = (f as Folk).type;
        talkBox.replaceChildren(
          h('div', { class: 'vt-who' }, faceImg(MOOD_FACE[mood], '', 'hface vt-face'), h('b', null, f.name), h('span', null, tag ?? (ty === 'feel' ? '마음 이야기' : ty === 'errand' ? '부탁' : ty === 'shop' ? '가게 주인' : ty === 'chat' ? '동네 이야기' : '손님'))),
          h('p', { class: 'vt-line' }, text),
          h('div', { class: 'vt-btns' }, ...buttons));
        const ch = people[who].ch;
        ch.setMood(MOOD_CHIBI[mood]); ch.talking = true; sfx.talk();
        setTimeout(() => { ch.talking = false; }, 900);
      };
      const btn = (label: string, fn: () => void, cls = 'btn small') => h('button', { class: cls, onclick: () => { sfx.tap(); fn(); } }, label);
      const holdFor = (i: number) => pinned.has(i) || (task?.src === 'errand' && task.npc === i);
      const closeTalk = () => {
        if (talk === null) return;
        const n = people[talk];
        n.ch.talking = false; n.ch.look = null; n.ch.play('idle');
        if (talk < NN) {
          n.faceTo = n.at ? meetFace.get(talk)?.clone() ?? null : null;
          n.hold = holdFor(talk); // 심부름을 맡긴 주민·가게 주인은 그 자리에 있어요
          if (!done.has(FOLKS[talk].id) && FOLKS[talk].type !== 'feel') n.ch.setMood('happy');
        } else { n.faceTo = null; n.hold = false; n.ch.setMood('happy'); }
        talk = null; talkBox.hidden = true; el.classList.remove('talking');
        restoreView();
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
      const busyLine = (f: Folk) => `${f.hello} …아, 지금은 다른 일을 하는 중이군요. 그거 먼저 끝내고 와 줄래요?`;
      // 미션 받기
      const offer = (i: number, q: Quest) => {
        const f = FOLKS[i], n = npcs[i];
        n.ch.play('wave');
        const tag = q.kind === 'chain' ? '이어지는 심부름' : q.kind === 'mood' ? '마음 모으기' : '동네 잔치';
        say(f, 'happy', q.ask, [
          btn('좋아, 할게!', () => {
            task = questTask(q, 0); qs.cur = { id: q.id, step: 0 }; saveQ(o.owner.id, qs);
            if (q.kind === 'mood') gather(q, true);
            n.ch.play('cheer'); sfx.pop();
            closeTalk();
            toast(`미션 '${q.title}' 시작! ${taskLabel()}`, 3400);
          }),
          btn('다음에 할게', () => closeTalk(), 'btn small ghost')], i, tag);
        talkBox.prepend(h('div', { class: 'vt-note' }, `새 미션: ${q.title}`));
      };
      // 미션 단계 건네기
      const deliverQuest = (i: number) => {
        const q = QUEST.get(task!.qid!)!, st = q.tasks[task!.step], f = FOLKS[i], n = npcs[i];
        n.ch.play('cheer');
        const last = task!.step >= q.tasks.length - 1;
        if (!last) {
          say(f, 'happy', st.say, [btn('좋아, 전해 줄게!', () => {
            const next = task!.step + 1;
            task = questTask(q, next); qs.cur = { id: q.id, step: next }; saveQ(o.owner.id, qs);
            closeTalk(); sfx.pop(); toast(taskLabel(), 3000);
          })], i, q.title);
          return;
        }
        if (q.kind === 'mood') { say(f, 'happy', st.say, [btn('모임 시작!', () => meeting(q, 0))], i, q.title); return; }
        if (q.kind === 'festival') { say(f, 'happy', st.say, [btn('잔치 시작!', () => { closeTalk(); void festival(q); })], i, q.title); return; }
        say(f, 'happy', st.say, [btn('천만에!', () => { closeTalk(); finishQuest(q); })], i, q.title);
      };
      // 마음 모으기 모임: 셋이 차례로 말하고, 함께 고민에 답해요
      const meeting = (q: Quest, k: number) => {
        const lines = q.meet ?? [];
        if (k < lines.length) {
          const [id, text] = lines[k].split('|'), i = folkIndex(id);
          npcs[i].ch.play('talk');
          say(FOLKS[i], 'neutral', text, [btn(k === lines.length - 1 ? '그랬구나…' : '응응', () => meeting(q, k + 1))], i, q.title);
          return;
        }
        const i0 = folkIndex(q.giver), qu = q.question!;
        say(FOLKS[i0], 'worried', qu.say, qu.opts.map((op) => btn(op.text, () => {
          const grp = (q.group ?? []).map(folkIndex);
          if (op.good) {
            grp.forEach((gi) => npcs[gi].ch.play('cheer'));
            say(FOLKS[i0], 'happy', op.reply, [btn('멋진 모임이야!', () => { closeTalk(); gather(q, false); finishQuest(q); })], i0, q.title);
          } else {
            grp.forEach((gi) => npcs[gi].ch.play('think'));
            say(FOLKS[i0], 'sad', op.reply, [btn('다시 생각해 볼게', () => meeting(q, lines.length), 'btn small ghost')], i0, q.title);
            talkBox.prepend(h('div', { class: 'vt-note soft' }, '우리가 위로받았던 말을 떠올려 볼까요?'));
          }
        }, 'btn small ghost vt-opt')), i0, q.title);
      };
      // 동네 잔치: 모두 광장에 모여 깃발과 초롱을 달고 함께 춤춰요
      let partyT = 0, danceT = 0;
      const festival = async (q: Quest) => {
        busy = true; cancelGoal(); keys.clear();
        fade.classList.add('on');
        await new Promise((r2) => setTimeout(r2, 320));
        vil.festival.visible = true;
        const c = vil.plaza;
        const crowd = people.map((_, i) => i).filter((i) => i !== folkIndex(q.giver));
        // 사장님이 서는 쪽(남쪽)은 비워 두고 반원보다 넓게 둘러서요
        crowd.forEach((i, k) => {
          const a = Math.PI / 2 + 0.7 + (k / Math.max(1, crowd.length - 1)) * (Math.PI * 2 - 1.4);
          let r = vil.plazaR - 1.2 - (k % 2) * 1.8;
          // 긴 의자·분수 자리는 비켜서요 (의자 속에 서지 않게)
          while (r > 3.6 && vil.blocked(c.x + Math.cos(a) * r, c.z + Math.sin(a) * r)) r -= 0.6;
          const n = people[i]; n.at = c.clone().add(V(Math.cos(a) * r, 0, Math.sin(a) * r)); n.goHome = false; n.faceTo = c.clone(); n.hold = true;
          n.ch.root.position.copy(n.at).setY(vil.standY(n.at.x, n.at.z, n.ch));
        });
        const hi = folkIndex(q.giver), host = npcs[hi];
        host.at = c.clone().add(V(0, 0, 4.2)); host.goHome = false; host.faceTo = c.clone().add(V(0, 0, 12)); host.hold = true;
        host.ch.root.position.copy(host.at).setY(vil.standY(host.at.x, host.at.z, host.ch));
        if (mode === 'walk') { fp.pos.set(c.x, 0, c.z + 9.2); fp.y = vil.walkY(fp.pos.x, fp.pos.z); fp.yaw = Math.PI; fp.pitch = -0.06; cur.pos.copy(eye()); faceYaw = facePitch = null; }
        else { all.target.copy(c); all.dist = 30; all.yaw = 0; }
        fade.classList.remove('on');
        sfx.fanfare();
        partyT = 14;
        const conf = h('div', { class: 'confetti v-party' });
        for (let k = 0; k < 60; k++) conf.appendChild(h('i', { style: `left:${Math.random() * 100}%;animation-delay:${Math.random() * 2.4}s;background:${['#E3645A', '#F6CF3E', '#47AE7A', '#6FB3E0', '#A68BD6', '#F0974A'][k % 6]}` }));
        el.appendChild(conf);
        setTimeout(() => conf.remove(), 9000);
        talk = hi; talkBox.hidden = false; el.classList.add('talking');
        const lines = ['여러분, 다 모였나요? 오늘은 마음 골목 잔치 날이에요!', '슬플 때 토닥여 주고, 화날 때 기다려 주고, 걱정될 때 곁에 있어 준 이웃들 덕분이에요.', '그리고 우리 마음을 하나하나 알아준 라면 가게 사장님, 고마워요! 자, 다 같이 딩동딩동!'];
        const step = (k: number) => {
          host.ch.play(k === lines.length - 1 ? 'cheer' : 'talk');
          say(FOLKS[hi], 'happy', lines[k], [btn(k === lines.length - 1 ? '딩동딩동! 🎉' : '와아!', () => {
            if (k < lines.length - 1) { sfx.heart(); step(k + 1); return; }
            busy = false;
            closeTalk(); finishQuest(q);
          })], hi, '동네 잔치');
        };
        step(0);
      };
      // 잔치가 끝나면: 춤은 멈추고, 사장님이 광장을 떠나면 모두 제자리로 돌아가요 (눈앞에서 갑자기 사라지지 않게)
      let partyStay = false;
      const endParty = () => {
        partyStay = false;
        people.forEach((n, i) => { n.ch.play('idle'); n.ch.bounce = 0; n.at = null; n.faceTo = null; n.hold = i < NN && holdFor(i); });
        // 가게 주인은 다시 가게 앞으로
        FOLKS.forEach((f, i) => {
          const kind = (f.type === 'shop' && f.sit ? f.sit.kind : f.stand) as ShopKind | undefined;
          const sh = kind ? shopOf(kind) : null;
          if (!sh) return;
          const fwd = V(Math.sin(sh.yaw), 0, Math.cos(sh.yaw)), side = V(Math.cos(sh.yaw), 0, -Math.sin(sh.yaw));
          npcs[i].at = sh.front.clone().addScaledVector(fwd, -1.9).addScaledVector(side, -1.7);
          npcs[i].faceTo = sh.front.clone().addScaledVector(fwd, 3); npcs[i].hold = true;
        });
        // 모임 중인 미션이 있으면 다시 모임 자리로
        const q = task?.qid ? QUEST.get(task.qid) : null;
        if (q?.kind === 'mood') gather(q, true);
      };
      // 산책하는 손님: 라면을 먹은 뒤의 이야기를 들려줘요
      const walkerTalk = (w: number) => {
        const j = w - NN, sp = vil.houses[walkers[j].house], c = o.customer(sp.h.id), r = best.get(sp.h.id);
        if (!c) { closeTalk(); return; }
        const L = LATER[sp.h.id], lines = (r && r.stars >= 3 ? L.good : L.okay).map((x) => x.replace(/^@1\s+/, ''));
        const step = (k: number) => {
          people[w].ch.play(k === 0 ? 'wave' : 'talk');
          say({ name: c.name }, 'happy', lines[k], [btn(k >= lines.length - 1 ? '또 만나요!' : '응응', () => { if (k >= lines.length - 1) closeTalk(); else step(k + 1); })], w, '산책하는 손님');
        };
        step(0);
      };
      const openTalk = (i: number) => {
        if (busy || talk !== null) return;
        const n = people[i];
        cancelGoal();
        talk = i; n.hold = true;
        const meP = mode === 'walk' ? eye() : cur.pos.clone();
        n.faceTo = V(meP.x, 0, meP.z); n.ch.look = meP;
        saveView();
        if (mode === 'walk') turnTo(n.ch.root.position, n.ch.root.position.y + 0.7); // 얼굴이 대화창 위에 오게 몸 아래쪽을 겨눠요
        else { all.target.copy(n.ch.root.position).setY(n.ch.root.position.y); all.dist = 14; }
        talkBox.hidden = false; el.classList.add('talking'); prompt.hidden = true;
        if (i >= NN) { walkerTalk(i); return; }
        const f = FOLKS[i];
        // 1) 지금 하는 일의 받을 사람이면 건네기
        if (task && task.to.includes(i)) {
          if (need().length) {
            const sh = nearShop();
            say(f, 'neutral', `${sh?.name ?? '가게'}에서 ${task.gets.length > 1 ? '준비물을 다' : josa(task.item, '을', '를')} 받아 와 줄래요? 기다릴게요!`, [btn('알았어, 다녀올게!', () => closeTalk())]);
            return;
          }
          if (task.src === 'errand') {
            const e = f.errand!;
            n.ch.play('cheer');
            say(f, 'happy', e.thanks, [btn('천만에!', () => closeTalk())]);
            task = null; award(f);
            return;
          }
          deliverQuest(i);
          return;
        }
        // 2) 가게 주인: 가게 봐 주기
        if (f.type === 'shop' && f.sit) {
          const sk = f.sit.kind, rec = shopRec[sk];
          n.ch.play('wave');
          const ask = () => { n.ch.play('think'); say(f, 'worried', f.sit!.ask, [
            o.shopSit ? btn('좋아요, 맡겨 주세요!', () => sit(i, sk)) : null,
            btn('다음에요', () => closeTalk(), 'btn small ghost')]); };
          if (!o.shopSit) { say(f, 'neutral', `${f.hello} …아, 지금은 라면 가게에 손님이 기다리고 있군요. 다음에 꼭 부탁해요!`, [btn('알았어요!', () => closeTalk())]); return; }
          if (rec?.times) say(f, 'happy', `${f.sit.again} (지금까지 ${rec.times}번, 가장 많이 받은 별 ${rec.best}개)`, [btn('좋아요, 맡겨 주세요!', () => sit(i, sk)), btn('다음에요', () => closeTalk(), 'btn small ghost')]);
          else say(f, 'neutral', f.hello, [btn('무슨 일이에요?', ask)]);
          return;
        }
        // 3) 아직 마음 도장을 못 받은 주민: 자기 이야기
        if (!done.has(f.id)) {
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
            if (task?.src === 'errand' && task.npc === i) say(f, 'neutral', e.waiting, [btn('알았어, 다녀올게!', () => closeTalk())]);
            else if (task) say(f, 'neutral', busyLine(f), [btn('알았어!', () => closeTalk())]);
            else {
              n.ch.play('wave');
              say(f, 'neutral', f.hello, [btn('무슨 부탁인데?', () => {
                n.ch.play('think');
                say(f, 'worried', e.ask, [
                  btn('좋아, 다녀올게!', () => { task = { src: 'errand', npc: i, step: 0, gets: [e.shop], got: [], item: e.item, to: [i] }; n.ch.play('cheer'); n.ch.setMood('happy'); toast(e.waiting, 3200); closeTalk(); }),
                  btn('다음에 할게', () => closeTalk(), 'btn small ghost')]);
              })]);
            }
          }
          return;
        }
        // 4) 새로 열린 미션
        const q = offerOf(i);
        if (q) {
          if (task) { say(f, 'neutral', `${f.hello} 부탁하고 싶은 게 있는데… 지금 하는 일을 먼저 끝내고 와 줄래요?`, [btn('알았어!', () => closeTalk())]); return; }
          offer(i, q);
          return;
        }
        // 5) 내가 준 미션을 하는 중
        if (task?.src === 'quest' && task.npc === i) { n.ch.play('wave'); say(f, 'happy', `부탁한 미션 잘 부탁해요! 지금은 ${taskLabel()}.`, [btn('응, 하는 중이야!', () => closeTalk())]); return; }
        n.ch.play('wave'); say(f, 'happy', f.done, [btn('또 만나요!', () => closeTalk())]);
      };
      const takeItem = (kind?: ShopKind) => {
        if (!task) return;
        const k = kind ?? need()[0];
        if (!k || !need().includes(k)) return;
        const sh = shopOf(k);
        task.got.push(k); sfx.pop();
        // 골목을 닫았다 열어도 받은 물건은 그대로예요
        if (task.src === 'quest' && qs.cur && qs.cur.id === task.qid) { qs.cur.got = [...task.got]; saveQ(o.owner.id, qs); }
        const left = need().length;
        const item = task.gets.length > 1 ? `${sh?.name.split(' ').pop() ?? ''} 준비물` : task.item;
        const t = nearTo();
        toast(left ? `${sh?.name ?? '가게'}에서 ${josa(item, '을', '를')} 받았어요. 남은 가게 ${left}곳!` : `${sh?.name ?? '가게'}에서 ${josa(item, '을', '를')} 받았어요. ${QUEST.get(task.qid ?? '')?.kind === 'mood' ? '광장 모임' : t !== null ? FOLKS[t].name : ''}에게 가져다줘요!`, 3000);
        drawGoal(); refreshBadges();
      };
      // 가게 봐 주기: 골목을 잠깐 숨기고 가게 안으로 들어가요. 끝나면 그 자리로 돌아와요
      let sitting = false;
      const sit = async (i: number, kind: CraftKind) => {
        if (!o.shopSit || sitting) return;
        closeTalk();
        sitting = true; busy = true; keys.clear(); cancelGoal();
        sfx.door();
        fade.classList.add('on');
        await new Promise((r2) => setTimeout(r2, 300));
        el.style.display = 'none'; document.body.classList.remove('village-open'); o.setWorld(null);
        fade.classList.remove('on');
        let r: { stars: number[] } | null = null;
        try { r = await o.shopSit(kind); } catch (e) { console.error('[shop-sit]', e); }
        o.setWorld(world); el.style.display = ''; document.body.classList.add('village-open');
        sitting = false; busy = false;
        if (r && r.stars.length) {
          const total = r.stars.reduce((a, b) => a + b, 0);
          const rec = shopRec[kind] ?? { best: 0, times: 0 };
          rec.best = Math.max(rec.best, total); rec.times++; shopRec[kind] = rec; saveShop(o.owner.id, shopRec);
          award(FOLKS[i], `${josa(CRAFT[kind].shop, '을', '를')} 잘 봐 주었어요`);
          toast(`${josa(CRAFT[kind].shop, '을', '를')} 봐 주고 별 ${total}개를 받았어요!`, 3200);
          refreshBadges();
        }
      };
      const tapNpc = (i: number) => {
        if (talk !== null || busy) return;
        sfx.tap();
        if (mode === 'all') { openTalk(i); return; }
        const p = people[i].ch.root.position;
        if (Math.hypot(p.x - fp.pos.x, p.z - fp.pos.z) <= TALK_R + 0.6) { openTalk(i); return; }
        cancelGoal();
        people[i].hold = true; waitNpc = i; // 걸어가는 동안 기다려 줘요
        goal = p.clone(); onArrive = () => openTalk(i);
      };
      const tapShop = (hit: THREE.Object3D) => {
        const kind = hit.userData.shopKind as ShopKind;
        if (need().includes(kind)) {
          const sh = shopOf(kind)!;
          if (mode === 'all' || Math.hypot(sh.front.x - fp.pos.x, sh.front.z - fp.pos.z) <= SHOP_R + 1) { takeItem(kind); return; }
          sfx.tap(); goal = sh.front.clone(); onArrive = () => takeItem(kind); return;
        }
        sfx.tap(); toast(hit.userData.shopLine);
      };

      // ── 마음 수첩: 주민 도장과 이어지는 미션을 한눈에 ──
      let book: HTMLElement | null = null;
      const hideBook = () => { if (!book) return; const b = book; book = null; b.classList.add('out'); setTimeout(() => b.remove(), 200); };
      const guideTo = (i: number) => {
        hideBook();
        if (mode === 'all') { const p = npcs[i].ch.root.position; all.target.set(p.x, p.y, p.z); all.dist = 22; return; }
        tapNpc(i);
      };
      function showBook() {
        if (book || busy) return;
        if (talk !== null) closeTalk();
        const typeIc = (f: Folk): DoodleKind => (f.type === 'feel' ? 'worry' : f.type === 'chat' ? 'talk' : f.type === 'shop' ? 'shopsit' : 'bang');
        const folkCards = FOLKS.map((f, i) => h('button', { class: 'vb-folk' + (done.has(f.id) ? ' on' : ''), onclick: () => { sfx.tap(); guideTo(i); } },
          doodleImg(done.has(f.id) ? 'stamp' : typeIc(f)), h('span', null, f.name)));
        const qRow = (q: Quest) => {
          const gi = folkIndex(q.giver), doing = task?.qid === q.id, fin = qDone.has(q.id), open = unlocked(q);
          const state = fin ? '끝!' : doing ? '하는 중' : open ? '할 수 있어요' : '잠김';
          const text = fin ? q.end : doing ? taskLabel() : open ? (done.has(FOLKS[gi].id) ? `${FOLKS[gi].name}에게 가 보세요.` : `먼저 ${FOLKS[gi].name}의 이야기를 들어 주세요.`) : q.hint;
          const prog = !fin && !open ? (q.needStamps ? ` (${done.size}/${q.needStamps})` : ` (${q.need.filter((id) => done.has(id)).length}/${q.need.length})`) : '';
          return h('li', { class: 'vb-q ' + (fin ? 'fin' : doing ? 'doing' : open ? 'open' : 'lock') },
            doodleImg(q.kind === 'chain' ? 'chain' : q.kind === 'mood' ? 'group' : 'party'),
            h('div', null, h('b', null, q.title, h('em', null, state)), h('span', null, text + prog)),
            !fin && (open || doing) ? h('button', { class: 'btn small ghost', onclick: () => {
              sfx.tap();
              if (doing) { const gp = goalPos(); hideBook(); if (gp) { if (mode === 'all') { all.target.copy(gp); all.dist = 24; } else { const sh = nearShop(); if (sh) { goal = sh.front.clone(); onArrive = () => takeItem(sh.kind); } else { const t = nearTo(); if (t !== null) tapNpc(t); } } } }
              else guideTo(gi);
            } }, '찾아가기') : null);
        };
        book = h('div', { class: 'v-intro v-book' }, h('div', { class: 'vi-card card pop-in' },
          h('div', { class: 'vi-head' }, doodleImg('notebook', '', 'dicon vi-logo'), h('div', null, h('h2', null, '마음 수첩'), h('p', null, `마음 도장 ${done.size}/${FOLKS.length} · 이어지는 미션 ${qDone.size}/${QUESTS.length}`))),
          task ? h('div', { class: 'vb-now' }, doodleImg('bang'), h('span', null, `지금 할 일: ${taskLabel()}`)) : null,
          h('h3', null, '이어지는 미션'),
          h('ul', { class: 'vb-qs' }, ...QUESTS.map(qRow)),
          h('h3', null, '동네 주민 (누르면 찾아가요)'),
          h('div', { class: 'vb-folks' }, ...folkCards),
          h('div', { class: 'vi-btns' }, h('button', { class: 'btn small', onclick: () => { sfx.tap(); hideBook(); } }, '닫기'))));
        book.addEventListener('click', (e) => { if (e.target === book) hideBook(); });
        el.appendChild(book);
      }

      // ── 손가락·마우스 ──
      const ray = new THREE.Raycaster();
      const ndc = (x: number, y: number) => new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
      const pts = new Map<number, { x: number; y: number; x0: number; y0: number; t0: number; stick: boolean }>();
      const stickV = { x: 0, y: 0, id: -1, cx: 0, cy: 0 };
      let pinch0 = 0, dist0 = 0, moved = false;
      const STICK_R = 52;
      const tapAt = (x: number, y: number) => {
        ray.setFromCamera(ndc(x, y), cam);
        const hn = ray.intersectObjects(people.map((n) => n.hit), false)[0];
        const hh = ray.intersectObjects(vil.hits, false)[0];
        const hs = ray.intersectObjects(vil.shopHits, false)[0];
        const hg = ray.intersectObject(vil.ground, false)[0];
        const near = (d: number | undefined, ...others: (THREE.Intersection | undefined)[]) => d !== undefined && others.every((x2) => !x2 || d < x2.distance + 1.2);
        if (hn && near(hn.distance, hh, hs, hg)) { const u = hn.object.userData; tapNpc(u.walker !== undefined ? NN + (u.walker as number) : (u.npc as number)); return; }
        if (hs && near(hs.distance, hh, hg)) { tapShop(hs.object); return; }
        if (hh && near(hh.distance, hg)) { tapHouse(hh.object.userData.house); return; }
        if (hg && mode === 'walk') {
          if (vil.inWater(hg.point.x, hg.point.z)) { toast('냇물은 다리로 건너요'); return; }
          goal = hg.point.clone(); onArrive = null; sfx.tap();
        } else if (hg && mode === 'all') { all.target.copy(hg.point).setY(0); clampT(all.target); }
      };
      touch.addEventListener('pointerdown', (e) => {
        newsBox.open = false;
        touch.setPointerCapture(e.pointerId);
        const isStick = mode === 'walk' && e.pointerType !== 'mouse' && stickV.id < 0 && e.clientX < innerWidth * 0.5 && talk === null;
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now(), stick: isStick });
        if (isStick) {
          stickV.id = e.pointerId; stickV.cx = e.clientX; stickV.cy = e.clientY; stickV.x = stickV.y = 0;
          stick.hidden = false; stick.style.left = `${e.clientX}px`; stick.style.top = `${e.clientY}px`;
          (stick.firstChild as HTMLElement).style.transform = 'translate(-50%, -50%)';
          if (!stickUsed) { stickUsed = true; stickGhost.hidden = true; }
          cancelGoal();
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
        if (sitting) return;
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        if (document.querySelector('.modal-wrap')) { keys.clear(); return; } // 손님 이야기 창이 열려 있으면 쉬어요
        if (intro) { if (['Enter', 'Space', 'Escape'].includes(e.code) || MOVE_KEYS.includes(e.code)) { e.preventDefault(); hideIntro(); if (MOVE_KEYS.includes(e.code)) setMode('walk'); } return; }
        if (book) { if (e.code === 'Escape' || e.code === 'Enter') { e.preventDefault(); hideBook(); } keys.clear(); return; }
        if (MOVE_KEYS.includes(e.code)) {
          e.preventDefault();
          if (talk !== null) return;
          if (mode === 'all') setMode('walk');
          keys.add(e.code); cancelGoal();
        } else if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) {
          if (talk !== null) { const b = talkBox.querySelector<HTMLButtonElement>('.vt-btns button:last-child'); if (b && talkBox.querySelectorAll('.vt-btns button').length === 1) { e.preventDefault(); b.click(); } return; }
          if (mode === 'walk' && promptAct && !prompt.hidden) { e.preventDefault(); promptAct(); }
        } else if (e.code === 'Escape' && talk !== null && !busy) closeTalk();
      };
      const onBlur = () => keys.clear();
      window.addEventListener('keydown', onKey);
      window.addEventListener('keyup', onKey);
      window.addEventListener('blur', onBlur);

      // ── 매 장면 ──
      const tmp = V();
      const tryMove = (nx: number, nz: number) => {
        const a = fp.pos;
        // 주민 몸을 뚫고 지나가지 않게 (가까워지는 쪽으로는 못 가요)
        for (const n of people) {
          const p = n.ch.root.position, d1 = (p.x - nx) ** 2 + (p.z - nz) ** 2;
          if (d1 < 0.85 * 0.85 && d1 < (p.x - a.x) ** 2 + (p.z - a.z) ** 2) return false;
        }
        if (vil.blocked(nx, nz)) { if (!vil.blocked(nx, a.z)) nz = a.z; else if (!vil.blocked(a.x, nz)) nx = a.x; }
        if (vil.blocked(nx, nz)) return false;
        a.set(nx, 0, nz);
        return true;
      };
      const angDiff = (a: number, b: number) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
      world.update = (dt: number) => {
        cam.aspect = innerWidth / innerHeight;
        cam.near = mode === 'walk' ? 0.08 : 0.3;
        // 1인칭은 시야를 넓게: 가로로 75° 이상 보이게 (세로 폰은 위아래를 더 넓혀요)
        const wantFov = mode === 'walk' ? Math.min(85, Math.max(58, (2 * Math.atan(Math.tan((37.5 * Math.PI) / 180) / cam.aspect) * 180) / Math.PI)) : 42;
        cam.fov += (wantFov - cam.fov) * Math.min(1, dt * 4);
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
          if (f || t) { cancelGoal(); faceYaw = facePitch = null; faceBack = false; }
          // 대화 뒤 고개를 되돌리는 중에 어딘가로 걸어가기 시작하면 되돌리기는 그만둬요 (걷는 쪽과 서로 당기지 않게)
          if (goal && faceBack) { faceYaw = facePitch = null; faceBack = false; }
          fp.yaw += t * TURN * dt;
          if (f) {
            const step = f * (f > 0 ? WALK : BACK) * dt;
            if (tryMove(fp.pos.x + Math.sin(fp.yaw) * step, fp.pos.z + Math.cos(fp.yaw) * step)) moving = Math.abs(f);
            else if (vil.inWater(fp.pos.x + Math.sin(fp.yaw) * 1.2, fp.pos.z + Math.cos(fp.yaw) * 1.2) && !toastCool) { toastCool = 2.5; toast('냇물은 다리로 건너요'); }
          }
          if (goal) {
            const d = V(goal.x - fp.pos.x, 0, goal.z - fp.pos.z), L = d.length();
            const stopAt = onArrive ? 1.9 : 0.35;
            if (L < stopAt) { goal = null; waitNpc = -1; const fn = onArrive; onArrive = null; fn?.(); }
            else {
              const step = Math.min(L, Math.max(3.4, Math.min(WALK, L * 0.8)) * dt);
              if (tryMove(fp.pos.x + (d.x / L) * step, fp.pos.z + (d.z / L) * step)) {
                moving = 1;
                fp.yaw += angDiff(Math.atan2(d.x, d.z), fp.yaw) * Math.min(1, dt * 6);
                fp.pitch += (-0.06 - fp.pitch) * Math.min(1, dt * 3);
              } else {
                cancelGoal();
                if (vil.inWater(fp.pos.x + (d.x / L), fp.pos.z + (d.z / L))) toast('냇물은 다리로 건너요');
                people.forEach((n, i) => { if (n.hold && !n.at && talk !== i && !holdFor(i)) n.hold = false; });
              }
            }
          }
        }
        if (faceYaw !== null) fp.yaw += angDiff(faceYaw, fp.yaw) * Math.min(1, dt * 5);
        if (facePitch !== null) fp.pitch += (facePitch - fp.pitch) * Math.min(1, dt * 5);
        // 대화 전 방향으로 다 돌아오면 손을 놓아요 (그다음은 다시 마음대로 둘러봐요)
        if (faceBack && faceYaw !== null && Math.abs(angDiff(faceYaw, fp.yaw)) < 0.01 && Math.abs((facePitch ?? fp.pitch) - fp.pitch) < 0.01) { faceYaw = facePitch = null; faceBack = false; }
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
          const key = !!task && (task.to.includes(i) || task.npc === i);
          n.ch.root.visible = show || talk === i || key || partyT > 0 || partyStay;
          b.visible = talk !== i && partyT <= 0 && (n.ch.root.visible || key || mode === 'all');
        });
        walkers.forEach((w, j) => {
          const d = camP.distanceTo(w.ch.root.position);
          w.ch.root.visible = (mode === 'walk' ? d < 85 : all.dist < 130 || d < 140) || talk === NN + j || partyT > 0 || partyStay;
        });
        // 잔치: 연설이 끝나면 한동안 다 같이 춤추다가 다시 제자리로
        if (partyT > 0 && talk === null) {
          partyT -= dt;
          danceT -= dt;
          if (danceT <= 0) { danceT = 0.9; const n = people[Math.floor(Math.random() * people.length)]; n.ch.play(Math.random() < 0.5 ? 'cheer' : 'clap'); n.ch.bounce = 1; setTimeout(() => { n.ch.bounce = 0; }, 1600); }
          if (partyT <= 0) { partyStay = true; people.forEach((n) => { n.ch.play('idle'); n.ch.bounce = 0; }); }
        }
        if (partyStay && talk === null && !busy) {
          const me = mode === 'walk' ? fp.pos : all.target;
          if (Math.hypot(me.x - vil.plaza.x, me.z - vil.plaza.z) > 34 || (mode === 'all' && all.dist > 110)) endParty();
        }
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
          people.forEach((n, i) => {
            const p = n.ch.root.position, dx = p.x - fp.pos.x, dz = p.z - fp.pos.z, d = Math.hypot(dx, dz);
            if (d < bd && (Math.sin(fp.yaw) * dx + Math.cos(fp.yaw) * dz) / Math.max(0.01, d) > 0.25) { bd = d; bi = i; }
          });
          const sh = need().map((k) => shopOf(k)).find((x) => x && Math.hypot(x.front.x - fp.pos.x, x.front.z - fp.pos.z) < SHOP_R);
          if (sh) {
            promptAct = () => takeItem(sh.kind);
            setPrompt(ITEM_DOODLE[sh.kind] as DoodleKind, task!.gets.length > 1 ? `${sh.name}에서 받기` : `${task!.item} 받기`);
          } else if (bi >= 0) {
            const k = bi; promptAct = () => openTalk(k);
            setPrompt('talk', k < NN ? `${FOLKS[k].name}에게 말 걸기` : `${o.customer(vil.houses[walkers[k - NN].house].h.id)?.name ?? '손님'}에게 인사하기`);
          }
        }
        prompt.hidden = !promptAct;
        stickGhost.hidden = !(mode === 'walk' && !PC && !stickUsed && !promptAct && talk === null);
        // 심부름 방향
        const gp = goalPos();
        if (gp && !goalChip.hidden) {
          if (mode === 'all') {
            // 전체 보기는 내려다보는 시점이라 화면에 비친 자리로 방향을 재요
            const a = tmp.copy(gp).project(cam), ax = a.x, ay = a.y, behind = a.z > 1;
            const c = tmp.copy(all.target).project(cam);
            let dx = (ax - c.x) * cam.aspect, dy = ay - c.y;
            if (behind) { dx = -dx; dy = -dy; }
            arrow.style.transform = `rotate(${Math.atan2(dx, dy)}rad)`;
          } else {
            tmp.copy(gp).sub(cam.position).applyQuaternion(cam.quaternion.clone().invert());
            arrow.style.transform = `rotate(${Math.atan2(tmp.x, -tmp.z)}rad)`;
          }
          goalDist.textContent = `${Math.round(Math.hypot(gp.x - (mode === 'walk' ? fp.pos.x : all.target.x), gp.z - (mode === 'walk' ? fp.pos.z : all.target.z)))}m`;
        }
        if (mode === 'walk') {
          const tn = talk !== null ? people[talk].ch.root.position : null;
          world.dof.focus = tn ? cam.position.distanceTo(tn) : 9; world.dof.range = tn ? 4 : 16; world.dof.amount = tn ? 0.4 : 0.18;
        } else { const fd = cur.pos.distanceTo(cur.look); world.dof.focus = fd; world.dof.range = fd * 0.42; world.dof.amount = 0.9; }
        look.rays = (mode === 'walk' ? 0.7 : 0.22) * rayK;
        // 걸어 다닐 때는 종이 결과 화면 얼룩을 옅게 (가까운 땅이 얼룩져 보이지 않게)
        look.paper = mode === 'walk' ? 0.5 : 0.8; look.blot = mode === 'walk' ? 0.15 : 0.6;
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
      if (import.meta.env.DEV) (window as unknown as { __village: unknown }).__village = { vil, cam, fp, setMode, all, openTalk, closeTalk, tapNpc, takeItem, get task() { return task; }, get talk() { return talk; }, done, qDone, qs, keys, stickV, jumpTo, shops: SHOPS, showBook, hideBook, people, walkers, offerOf, finishQuest, festival: (id = 'q-festival') => festival(QUEST.get(id)!), award: (i: number) => award(FOLKS[i]) };
      function close() {
        if (busy) return;
        if (talk !== null) closeTalk();
        sfx.back();
        o.setWorld(null);
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('keyup', onKey);
        window.removeEventListener('blur', onBlur);
        clearTimeout(hintTimer);
        offTod();
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
