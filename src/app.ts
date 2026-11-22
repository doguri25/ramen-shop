import { AI_URL, MAX_RUNS, ROUNDS, TEACHER_PIN, TINKERBELL_URL } from './config';
import { ai, classStats } from './ai/solar';
import { eulReul } from './core/korean';
import { hashStr, mulberry32, uid } from './core/rng';
import { resumeAudio, setSound, setTts, sfx, speak, suspendAudio, ttsEnabled, unlockAudio, soundOn } from './core/sound';
import { updateTweens, wait } from './core/tween';
import { CUS, CUSTOMERS, TUTORIAL } from './data/customers';
import { CUS_56, CUSTOMERS_56 } from './data/customers56';
import { CUS_14, CUSTOMERS_14 } from './data/customers14';
import { EVENT } from './event/flag';
import { bandOf, keyOf, maskName, rank, type Best, type SendResult, type Who } from './event/rank';
import { EV, rememberPaused, whoText } from './event/screens';
import { ING, INGREDIENTS } from './data/ingredients';
import { josa, TUTOR_INTRO } from './data/text';
import { BODY, LATER, PROMISES, type BodyMood } from './data/later';
import { FX } from './data/effects';
import type { ChibiSpec, Customer, GimbapRec, Owner, Picks, RamenRecord, Step, Treat } from './data/types';
import { GIMBAP, judgeGimbap } from './data/gimbap';
import { adaptStory, craftLines, craftName, CRAFT, scoreCraft, type CraftKind } from './data/craft';
import type { World } from './ui/village';
import { catchUpOrder, customerForRound, makeOrder } from './game/schedule';
import { fiveStars, hasHeart, isBackward, score } from './game/scoring';
import { faceAtlas, paperCanvas, tex } from './paint/textures';
import { LIGHT_W, QualityProbe, TIERS, WatercolorRenderer, type Look, type Tier, shared } from './render/watercolor';
import { getTod, onTod, TOD_LIGHT, TOD_SHOP_TINT, type Tod } from './core/tod';
import { bakeLighting } from './render/bake';
import * as THREE from 'three';
import { setFaceTexture } from './scene/chibi';
import { Stage } from './scene/stage';
import { PHYS } from './scene/physics';
import { db, local, type TeacherSettings } from './storage/db';
import { h, toast } from './ui/dom';
import { UI } from './ui/screens';

// 메모리가 작은 기기 (안드로이드 크롬·삼성 인터넷이 알려 줘요. 6GB 는 4로 알려 줘요. 아이패드 사파리는 몰라서 넉넉하다고 봐요)
const DEVICE_MEM = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
const LOW_MEM = DEVICE_MEM <= 4;
const LOW_MEM_PHONE = LOW_MEM && Math.min(screen.width, screen.height) < 600;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// 수업용 손님과 행사용 5~6학년 손님을 모두 찾을 수 있게
const CUSX = new Map<string, Customer>([...CUS, ...CUS_14, ...CUS_56]);
// 수업용과 행사용 1~4학년 손님 72명 (처음 손님 36명 + 새 손님 36명)
const CUSTOMERS_72 = [...CUSTOMERS, ...CUSTOMERS_14];
const whoOf = (o: Owner): Who => ({ grade: o.ev!.grade, cls: o.ev!.cls, num: o.number, name: o.name });
const EMPTY: Picks = { broth: null, noodle: null, soup: null, toppings: [], finish: [] };
const TUTOR_HINTS: Partial<Record<Step, string[]>> = {
  broth: ['b_feast'], noodle: ['n_rainbow'], soup: ['s_party'], topping: ['t_corn', 't_quail', 't_dumpling'], finish: ['f_giggle'],
};

export class App {
  wcr!: WatercolorRenderer;
  stage!: Stage;
  thumbs = new Map<string, string>();
  owner: Owner | null = null;
  records: RamenRecord[] = [];
  teacher: TeacherSettings = {};
  settings = local.get();
  probe!: QualityProbe;
  private last = 0;
  private running = true;
  private ctxLost = false;
  private raf = 0; // 그리기 예약 번호 (탭을 다시 열 때 겹치지 않게)
  private photoUrls = new Map<string, string>();
  inRound = false;
  serving = false; // 내어 주고 반응·쪽지를 보는 동안
  timeScale = 1;
  private lastShown = 0; // 행사용: 방금 받은 별
  private sending: Promise<SendResult | null> | null = null;

  async boot(setStatus: (s: string) => void) {
    const canvas = document.getElementById('gl') as HTMLCanvasElement;
    setStatus('종이와 물감을 준비하는 중…');
    await Promise.race([Promise.all([document.fonts.load('40px "Jua"', '마음라면'), document.fonts.load('20px "Gowun Dodum"', '마음라면')]), sleep(3000)]).catch(() => {});
    this.teacher = await db.teacher();
    ai.configure(this.teacher.aiUrl, this.teacher.ai !== false);
    setSound(this.settings.sound);
    setTts(this.settings.tts);
    const paper = tex(paperCanvas(512), true);
    this.wcr = new WatercolorRenderer(canvas, paper);
    // 그래픽이 잠깐 끊기면 멈춰 두고, 다시 살아나면 새로 열어요. 6초가 지나도 안 살아나면(아이패드에서 흔해요) 그냥 새로 열어요
    // 판 기록은 그릇마다 저장해 두어서 새로 열어도 이어서 할 수 있어요. 가게를 꾸미는 중에 끊겨도 잡도록 그리기 도구를 만들자마자 걸어 둬요
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault(); this.ctxLost = true; this.running = false; toast('화면을 다시 그리는 중이에요…', 6000);
      setTimeout(() => { if (this.ctxLost && !document.hidden) location.reload(); }, 6000);
    });
    canvas.addEventListener('webglcontextrestored', () => location.reload());
    shared.uPaper.value = paper;
    setFaceTexture(tex(faceAtlas()));
    const q = this.teacher.quality ?? 'auto';
    // 화질은 점 개수 한도로 정해서, 작은 화면도 처음부터 '높음'으로 또렷하게 시작해요.
    // 메모리가 작은 휴대폰(4GB 이하)은 처음부터 '낮음'으로 가볍게 해요 (그림 버퍼가 작아지고 물리 계산도 줄어요)
    const tier: Tier = q === 'auto' ? (LOW_MEM_PHONE ? 'low' : 'high') : q;
    const apply = (t: Tier) => { this.wcr.setTier(TIERS[t]); PHYS.iters = t === 'low' ? 6 : t === 'mid' ? 8 : 10; };
    apply(tier);
    this.probe = new QualityProbe(tier, apply, q !== 'auto');
    setStatus('가게를 꾸미는 중…');
    await sleep(30);
    this.stage = new Stage(this.wcr);
    // 시간대: 가게 창밖 그림과 등불, 화면 빛깔 (낮은 처음 모습 그대로, 행사용은 늘 낮)
    const shopTod = (t: Tod) => { this.stage.shop.setTod(t); this.shopLook = t === 'day' ? null : { tint: TOD_SHOP_TINT[t], sunCol: TOD_LIGHT[t].sunCol }; };
    if (getTod() !== 'day') shopTod(getTod());
    onTod(shopTod);
    this.onResize();
    window.addEventListener('resize', () => this.onResize());
    setStatus('재료를 그리는 중…');
    let i = 0;
    for (const ing of INGREDIENTS) {
      this.thumbs.set(ing.id, this.stage.thumb(ing, 192).toDataURL('image/webp', 0.9));
      if (++i % 6 === 0) { setStatus(`재료를 그리는 중… ${i}/${INGREDIENTS.length}`); await new Promise((r) => setTimeout(r, 0)); }
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.running = false; suspendAudio(); window.speechSynthesis?.cancel(); }
      else if (this.ctxLost) location.reload();
      else { this.running = true; this.last = performance.now(); resumeAudio(); cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame(this.loop); }
    });
    // 소리 켜기: 아이폰은 손을 뗄 때(touchend·click)만 허락해서 여러 손짓에 다 걸어 둬요
    for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) window.addEventListener(ev, () => unlockAudio(), { capture: true, passive: true });
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
    // 저장한 도감이 저장 공간이 모자랄 때 지워지지 않게 부탁해요
    navigator.storage?.persist?.().catch(() => {});
    // 소품 모델이 다 오면, 가게에 광선을 쏴서 조명을 구워요 (그동안에도 게임은 그대로 해요)
    this.stage.shop.loadModels().catch((e) => console.warn('[models]', e)).finally(() => { setTimeout(() => this.bakeLights(), 300); });
  }

  bakeInfo: { verts: number; ms: number; cached: boolean; key: string } | null = null;
  private async bakeLights() {
    try {
      const shop = this.stage.shop;
      const lamps = shop.lamps.map((b) => b.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, -0.1, 0)));
      // 굽는 품질은 성능 측정과 상관없이 정해요 (선생님이 화질을 고정했으면 그 값)
      const q = this.teacher.quality && this.teacher.quality !== 'auto' ? this.teacher.quality : 'high';
      this.bakeInfo = await bakeLighting(shop.root, { version: 'rt5', light: LIGHT_W, lamps, quality: q, noWorker: LOW_MEM });
      console.info('[bake]', this.bakeInfo);
    } catch (e) { console.warn('[bake]', e); }
  }

  private onResize() {
    this.wcr.resize();
    this.stage.resize(window.innerWidth, window.innerHeight);
  }

  private loopErrors = 0;
  private shopLook: Look | null = null;
  private loop = (t: number) => {
    if (!this.running) return;
    // 다음 장면을 먼저 예약해요. 한 장면에서 문제가 나도 게임이 얼어붙지 않게요
    this.raf = requestAnimationFrame(this.loop);
    const raw = Math.min(0.1, Math.max(0, (t - this.last) / 1000));
    this.last = t;
    const dt = raw * this.timeScale;
    try {
      updateTweens(dt);
      shared.uTime.value += dt;
      if (this.world) {
        this.world.update(raw);
        const d = this.world.dof;
        this.wcr.setDof(d.focus, d.range, d.amount);
        this.wcr.look = this.world.look ?? null;
        this.wcr.render(this.world.scene, this.world.cam);
      } else {
        this.stage.update(dt);
        const d = this.stage.dof;
        this.wcr.setDof(Math.max(0.2, d.focus - this.stage.focusShift), d.range, d.amount);
        this.wcr.look = this.shopLook;
        this.wcr.render(this.stage.scene, this.stage.cam);
      }
      this.probe.sample(raw);
    } catch (e) {
      if (this.loopErrors++ < 5) console.error('[loop]', e);
    }
  };

  // ── 흐름 ─────────────────────────────
  async start() {
    for (;;) {
      try { await this.session(); } catch (e) {
        // 예상 못 한 문제가 생기면 멈추지 않고 첫 화면으로 돌아가요
        console.error(e);
        this.inRound = false;
        this.serving = false;
        this.timeScale = 1;
        try { this.stage.clearGuests(); this.stage.resetPot(); } catch { /* 무시 */ }
        document.body.classList.remove('cooking');
        // 첫 화면을 다시 그리면서 알림이 지워지지 않게 조금 뒤에 띄워요
        setTimeout(() => toast('문제가 생겨서 첫 화면으로 돌아왔어요', 3500), 300);
      }
      this.owner = null;
    }
  }

  private async session() {
    if (EVENT) return this.eventSession();
    {
      UI.clearAll();
      this.stage.setView('wide', 0);
      // 인터넷이 끊긴 것을 '선생님이 AI를 껐다'고 알리지 않게, 켜 두었는지만 넘기고 연결은 check가 알려 줘요
      await UI.title(() => this.openTeacher(), ai.url ? { get on() { return ai.enabled; }, check: () => ai.check() } : undefined, () => this.alleyFromTitle());
      unlockAudio();
      await this.chooseOwner();
      if (!this.owner!.tutorialDone) {
        await this.round(true);
        this.owner!.tutorialDone = true;
        await this.saveOwner();
      }
      let keep = true;
      while (keep) {
        const saved = await this.round(false);
        const n = this.records.length;
        // 열 그릇째: 이번엔 손님들이 사장님에게 라면을 끓여 줘요 (한 번만)
        if (saved && n >= ROUNDS && !this.owner!.treat) await this.treat();
        let first = true;
        for (;;) {
          const choice = await UI.between({ count: n, justTen: first && saved && n === ROUNDS, skipped: !saved });
          first = false;
          if (choice === 'lib') { await this.openLibrary(); continue; }
          if (choice === 'switch') keep = false;
          break;
        }
      }
    }
  }

  // 수업용 첫 화면: 가게에 들어가지 않고 내 마음 골목 보기 (이 태블릿의 사장님 가운데 골라요)
  private async alleyFromTitle() {
    const owners = await db.owners();
    if (!owners.length) { toast('아직 이 태블릿에 사장님이 없어요. 가게 문을 열고 첫 손님부터 맞아 봐요.'); return; }
    const recs = new Map<string, RamenRecord[]>();
    const lit = new Map<string, number>();
    for (const o of owners) { const r = await db.records(o.id); recs.set(o.id, r); lit.set(o.id, new Set(r.filter((x) => LATER[x.customerId]).map((x) => x.customerId)).size); }
    const o = owners.length === 1 ? owners[0] : await UI.pickAlleyOwner(owners, lit);
    if (!o) return;
    await this.openAlley(o, recs.get(o.id) ?? []);
  }

  // 3D 마음 골목: 열려 있는 동안은 가게 대신 골목을 그려요
  private world: World | null = null;
  private alleyOpen = false;
  private async openAlley(o: Owner, recs: RamenRecord[]) {
    // 단추를 빠르게 두 번 눌러도 골목은 하나만 열어요
    if (this.alleyOpen) return;
    this.alleyOpen = true;
    try {
    // 골목(주민·물리 소품)은 열 때 불러와요 (첫 화면을 가볍게)
    const { openVillage } = await import('./ui/village');
    return await openVillage({ owner: o, recs, order: o.order, customer: (id) => CUSX.get(id), setWorld: (w) => { this.world = w; }, story: (c, r) => UI.alleyHouse(o, c, r, true), shopSit: this.inRound ? undefined : (kind) => this.shopSit(kind) }); // 라면 손님이 있는 동안은 가게를 비울 수 없어요
    } finally { this.alleyOpen = false; }
  }

  private async chooseOwner() {
    const owners = await db.owners();
    const counts = await this.counts(owners);
    const r = await UI.owners(owners, counts);
    if (r.owner) { this.owner = r.owner; this.fixOrder(this.owner, await db.records(this.owner.id)); }
    else if (r.create) {
      const id = uid();
      const o: Owner = { id, number: r.create.number, name: r.create.name, round: 0, order: makeOrder(CUSTOMERS_72, hashStr(id) ^ Date.now()), tutorialDone: false, createdAt: Date.now() };
      owners.push(o);
      await db.saveOwners(owners);
      this.owner = o;
    }
    this.records = await db.records(this.owner!.id);
    this.drawHud(null);
  }

  // 행사용 5~6학년은 5~6학년 손님을 만나요
  private listFor(o: Owner) { return EVENT && o.ev && o.ev.grade >= 5 ? CUSTOMERS_56 : CUSTOMERS_72; }

  // 손님 목록이 바뀐 뒤에도 예전 학생 기록이 멈추지 않게: 없어진 손님은 빼고 새 손님은 끼워 넣어요
  private fixOrder(o: Owner, recs: RamenRecord[] = []) {
    const list = this.listFor(o);
    if (!o.ev) {
      // 수업용: 아직 못 만난 손님(새 손님 포함)이 다음 손님부터 고르게 섞여서 와요. 몇 그릇을 끓였든 똑같아요
      const next = catchUpOrder(o.order, o.round, list, hashStr(o.id), recs);
      if (next) { o.order = next; this.saveOwner(o); }
      return;
    }
    const known = new Set(list.map((c) => c.id));
    const kept = o.order.filter((id) => known.has(id));
    const add = list.map((c) => c.id).filter((id) => !kept.includes(id));
    if (kept.length === o.order.length && !add.length) return;
    o.order = [...kept, ...add];
    this.saveOwner(o);
  }

  // 행사용 5~6학년: 손님마다 단서 밑줄이 있기도 하고 없기도 해요 (학생마다 다르게)
  private clueView(c: Customer): Customer {
    const ev = this.owner?.ev;
    if (!EVENT || !ev || ev.grade < 5 || c.source === 'tutorial') return c;
    if (mulberry32(hashStr(ev.key + ':' + c.id))() < 0.5) return c;
    return { ...c, story: c.story.map((l) => l.replace(/\[\[|\]\]/g, '')) };
  }

  private async counts(owners: Owner[]) {
    const m = new Map<string, number>();
    for (const o of owners) m.set(o.id, (await db.records(o.id)).length);
    return m;
  }

  private async saveOwner(me: Owner = this.owner!) {
    const owners = await db.owners();
    const i = owners.findIndex((o) => o.id === me.id);
    if (i >= 0) owners[i] = me; else owners.push(me);
    await db.saveOwners(owners);
  }

  private drawHud(round: number | null) {
    if (!this.owner) return;
    const ev = EVENT ? this.owner.ev : undefined;
    UI.hud({
      owner: this.owner, count: ev ? this.owner.round : this.records.length, round, sound: soundOn(), tts: ttsEnabled(),
      label: ev ? whoText(whoOf(this.owner)) : undefined, stars: ev ? ev.total : undefined,
      onLib: () => {
        // 라면을 내어 드리는 동안 열면 손님 반응·쪽지가 도감 위아래로 겹쳐요. 그때만 잠깐 막아요
        if (this.serving) { toast('손님이 라면을 다 드신 뒤에 도감을 볼 수 있어요'); return; }
        this.openLibrary();
      },
      onSound: () => { this.settings.sound = !soundOn(); setSound(this.settings.sound); local.set(this.settings); this.drawHud(round); },
      onTts: () => { this.settings.tts = !ttsEnabled(); setTts(this.settings.tts); local.set(this.settings); this.drawHud(round); toast(this.settings.tts ? '손님 말을 소리 내어 읽어 줄게요' : '읽어 주기를 껐어요'); },
      onHome: () => this.goHome(),
    });
  }

  private goHome() {
    if (!this.inRound) { location.reload(); return; }
    const wrap = h('div', { class: 'modal-wrap fade-in' }, h('div', { class: 'modal card pop-in', style: 'width:min(460px,100%);text-align:center' },
      h('h2', null, '처음 화면으로 갈까요?'), h('p', { class: 'sub' }, '지금 손님에게 끓이던 라면은 저장되지 않아요.'),
      h('div', { class: 'actions', style: 'justify-content:center' },
        h('button', { class: 'btn ghost', onclick: () => wrap.remove() }, '계속하기'),
        h('button', { class: 'btn', onclick: () => location.reload() }, '처음으로'))));
    document.getElementById('ui')!.appendChild(wrap);
  }

  private say(c: Customer) {
    return (i: number, who: number, lines: string[]) => {
      const l = lines[i];
      this.stage.talk(who, true);
      const n = Math.min(14, Math.max(4, Math.round(l.length / 3)));
      for (let k = 0; k < n; k++) setTimeout(() => sfx.talk(), k * 85);
      clearTimeout((this as any)._talkT);
      (this as any)._talkT = setTimeout(() => this.stage.talk(who, false), Math.max(900, l.length * 70));
      speak(l, c.slowVoice || c.source === 'tutorial' ? 0.9 : 1.25);
    };
  }

  // 도감에 담았으면 true
  private async round(tutorial: boolean): Promise<boolean> {
    const o = this.owner!;
    const c: Customer = tutorial ? TUTORIAL : CUSX.get(customerForRound(o.order, o.round, this.listFor(o), hashStr(o.id)))!;
    const view = this.clueView(c); // 이야기·메모에 보여 줄 모습 (행사용 5~6학년은 밑줄이 없을 수도 있어요)
    this.inRound = true;
    if (!tutorial && !EVENT) await this.dropIn(o);
    this.drawHud(tutorial ? 0 : o.round + 1);
    this.stage.mood('neutral');
    await this.stage.setView('door', 0.9);
    const entering = this.stage.enter(c);
    await wait(1.2);
    this.stage.setView('guest', 1.4);
    await entering;
    const say = this.say(c);
    this.stage.mood(this.moodFor(c));
    if (tutorial) await UI.dialog(c, TUTOR_INTRO, { onLine: (i, w) => say(i, w, TUTOR_INTRO) });
    const story = view.story;
    let body: string | undefined;
    const look = tutorial || EVENT ? undefined : async () => { body = await this.lookCloser(c); };
    await UI.dialog(view, story, { onLine: (i, w) => say(i, w, story), final: { label: '라면 끓이러 가기!', replay: true }, look });
    this.stage.talk(0, false);
    let picks: Picks = JSON.parse(JSON.stringify(EMPTY));
    let rec: RamenRecord | null = null;
    let saved = false;
    for (;;) {
      this.memo(view, say, body);
      await this.stage.setView('pot', 0.9);
      this.stage.showPaws(true);
      this.stage.restorePot(picks);
      picks = await this.cook(c, picks, tutorial);
      // 메모에서 다시 듣던 이야기가 남아 있으면 닫아요 (내어 줄 때 손님 반응과 겹치지 않게)
      document.querySelectorAll('.dialog').forEach((d) => d.remove());
      window.speechSynthesis?.cancel();
      this.stage.talk(0, false);
      this.stage.showPaws(false);
      const name = await UI.naming(picks, c, tutorial, EVENT ? undefined : (n) => ai.kind(n));
      document.querySelector('.memo')?.remove();
      // 이름 짓는 동안 메모에서 다시 연 이야기도 닫아요
      document.querySelectorAll('.dialog').forEach((d) => d.remove());
      const r = score(c, picks);
      const heart = hasHeart(c, name);
      const shown = EVENT ? fiveStars(r, heart) : r.stars; // 보여 주고 기록하는 별
      // 내어 주고 먹는 동안 AI 손님 한마디를 미리 받아 둬요 (못 받으면 원래 대사만)
      const aiLine = tutorial || EVENT ? Promise.resolve(null) : ai.react(c, picks, name, r.stars);
      this.serving = true;
      const fast = UI.fastButton((on) => { this.timeScale = on ? 2.5 : 1; });
      await this.stage.serve(picks);
      // 수업용: 먹는 동안 손님 마음이 처음 마음에서 나아진 마음 쪽으로 차올라요
      const later = tutorial || EVENT ? undefined : LATER[c.id];
      const gauge = later ? UI.moodGauge(later, r.stars) : null;
      await this.stage.eat(() => UI.yum());
      gauge?.done();
      fast.remove();
      this.timeScale = 1;
      this.stage.celebrate(r.stars, heart);
      const extra = await Promise.race([aiLine, new Promise<null>((res) => setTimeout(() => res(null), 1500))]);
      const lines = [...c.reactions[r.stars]];
      if (extra) lines.splice(1, 0, extra);
      await UI.reaction(c, shown, heart, (i, w) => say(i, w, lines), lines, r.stars);
      gauge?.remove();
      this.stage.talk(0, false);
      // 수업용: 마음 쪽지 끝에서 오늘의 마음 한 그릇 약속을 골라요 (안 골라도 돼요)
      let promise: string | null = null;
      const pledge = tutorial || EVENT ? undefined : { options: PROMISES[c.needs.effect] ?? [], onPick: (p: string | null) => { promise = p; }, initial: null as string | null };
      // 수업용: 별 하나를 받으면 다시 끓이는 대신, 손님에게 꼭 필요했던 마음을 담은 김밥을 한 번 곁들여 줄 수 있어요
      // (별은 그대로, 그 마음 묶음 재료를 넣으면 정성 도장). 행사용은 대회라 곁들이기가 없어요
      let gimbap: GimbapRec | null = null;
      let choice: 'gimbap' | 'save' | 'skip';
      for (;;) {
        if (pledge) pledge.initial = promise;
        choice = await UI.note(c, picks, r, heart, !tutorial && !EVENT && r.stars === 1 && !gimbap, tutorial, !heart && isBackward(name), pledge, gimbap);
        if (choice !== 'gimbap') break;
        gimbap = await this.gimbap(c, view, say);
      }
      this.serving = false;
      // 행사용: 내어 드린 라면의 별을 이번 판에 더해요 (도감에 넣지 않아도 별은 받아요)
      if (!tutorial && o.ev) {
        o.ev.total += shown;
        if (shown === 5) o.ev.fives++;
        if (o.round + 1 >= ROUNDS) o.ev.done = true;
        this.lastShown = shown;
      }
      if (!tutorial && choice === 'skip') {
        // 손님은 다음 차례로 넘어가지만, 기록과 사진은 남기지 않아요
        o.round++;
        await this.saveOwner();
        toast('이번 라면은 도감에 넣지 않았어요');
      } else if (!tutorial) {
        saved = true;
        rec = { id: uid(), ownerId: o.id, round: o.round, customerId: c.id, picks, name, stars: shown, heart, photoKey: '', createdAt: Date.now() };
        if (promise) rec.promise = promise;
        if (gimbap) rec.gimbap = gimbap;
        rec.photoKey = rec.id;
        // 그래픽이 끊긴 동안 찍으면 빈 사진이 돼서 그때는 사진을 건너뛰어요
        const photo = this.ctxLost ? null : this.stage.photo(picks, 512);
        const blob = photo ? await new Promise<Blob | null>((res) => photo.toBlob(res, 'image/webp', 0.86)) : null;
        if (blob) await db.savePhoto(rec.photoKey, blob);
        this.records.push(rec);
        const ok = await db.saveRecords(o.id, this.records);
        o.round++;
        await this.saveOwner();
        sfx.camera();
        toast(ok ? `📖 '${name}'${eulReul(name).slice(-1)} 도감에 담았어요${rec.gimbap ? ' · 🍙 김밥도 함께' : ''}${rec.promise ? ' · 🤝 약속도 함께 담았어요' : ''}` : '⚠️ 태블릿에 저장하지 못했어요. 선생님께 알려 주세요');
      }
      if (!tutorial && o.ev) this.sendRun(o);
      break;
    }
    this.drawHud(null);
    await this.stage.leave();
    this.stage.resetPot();
    this.inRound = false;
    return saved;
  }

  // 수업용: 마음 김밥 곁들이기. 김발에 김·밥·속재료·마무리를 올리고 말아서 썰어 손님 앞에 놓으면, 손님이 한 조각 먹고 한마디 해요
  private gThumbs = new Map<string, string>();
  private async gimbap(c: Customer, view: Customer, say: ReturnType<App['say']>): Promise<GimbapRec> {
    const st = this.stage;
    this.serving = true;
    document.querySelectorAll('.dialog').forEach((d) => d.remove());
    window.speechSynthesis?.cancel();
    st.talk(0, false);
    const start = st.gimbapStart();
    // 재료 그림은 처음 한 번만 그려요 (카메라가 조리대로 가는 동안)
    let i = 0;
    for (const g of GIMBAP) {
      if (this.gThumbs.has(g.id)) continue;
      this.gThumbs.set(g.id, st.gimThumb(g, 192).toDataURL('image/webp', 0.9));
      if (++i % 5 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    await start;
    const picks = await UI.gimbap({ thumbs: this.gThumbs, need: c.needs.effect, onSet: (p) => st.gimbapSet(p) });
    st.showPaws(true);
    await st.gimbapRoll(picks);
    await st.gimbapSlice(picks);
    await st.gimbapServe();
    const j = judgeGimbap(c.needs.effect, picks);
    await st.gimbapEat(j.stamp);
    const lines = j.stamp && j.effect
      ? [`(우물우물) ${j.name}… 김밥 속에 '${j.effect}' 마음이 꼭꼭 들어 있어요.`, '제 마음을 한 번 더 생각해 주셔서 고마워요. 마음이 한결 나아졌어요.']
      : ['(우물우물) 김밥 맛있어요. 곁들여 주셔서 고마워요.', `그런데 제게 꼭 필요했던 건 '${FX.get(c.needs.effect)!.name}' 같은 마음이었어요.`];
    if (j.stamp) { sfx.heart(); toast('🍙 정성 도장을 받았어요!'); }
    await UI.dialog(view, lines, { onLine: (k, w) => say(k, w, lines), final: { label: '마음 쪽지 보기' } });
    st.talk(0, false);
    return { picks, name: j.name, stamp: j.stamp, effect: j.effect };
  }

  // 마음 골목 '가게 봐 주기' (수업용): 빵집·꽃집 주인이 잠깐 자리를 비운 동안 라면 손님 세 분을 맞아요.
  // 놀이는 라면과 같아요: 이야기 듣기 → 단계마다 재료 고르기 → 굽거나 묶어서 건네기 → 별과 마음 쪽지
  private cThumbs = new Map<string, string>();
  private async shopSit(kind: CraftKind): Promise<{ stars: number[]; quit?: boolean }> {
    const S = CRAFT[kind], st = this.stage;
    document.body.classList.add('shop-sit');
    st.clearGuests();
    st.craftTheme(kind);
    await st.setView('wide', 0);
    const banner = h('div', { class: 'sit-banner card craft-ok fade-in' });
    document.getElementById('ui')!.appendChild(banner);
    // 빵집·꽃집은 손님 셋, 미니 가게는 손님 하나
    const N = S.mini ? 1 : 3;
    const ICON: Record<CraftKind, string> = { bread: '🥐', flower: '💐', icecream: '🍦', pencil: '✏️', book: '📚', tea: '🍵', fruit: '🍎' };
    const setBanner = (i: number) => { banner.textContent = `${ICON[kind]} ${josa(S.shop, '을', '를')} 봐 주는 중${N > 1 ? ` · 손님 ${i + 1}/${N}` : ''}`; };
    setBanner(0);
    // 재료 그림은 처음 한 번만 그려요
    let n = 0;
    for (const it of S.items) {
      if (this.cThumbs.has(it.id)) continue;
      this.cThumbs.set(it.id, st.craftThumb(it, 192).toDataURL('image/webp', 0.9));
      if (++n % 5 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    // 손님 셋: 라면 손님 가운데서 겹치지 않게 골라요
    const rnd = mulberry32((Date.now() ^ hashStr(kind)) >>> 0);
    const pool = CUSTOMERS_72.slice();
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const stars: number[] = [];
    // 나가기: 언제든 물어보고 그만둘 수 있어요. 그만두면 별과 도장은 남기지 않고 골목으로 돌아가요.
    // 고르기·대화처럼 기다리는 화면은 바로 닫고, 움직이는 장면은 그 동작이 끝난 뒤에 정리해요
    const QUIT = Symbol('quit');
    let quitting = false, quitNow: () => void = () => {};
    const quitP = new Promise<never>((_, rej) => { quitNow = () => rej(QUIT); });
    quitP.catch(() => {});
    const ui = <T>(p: Promise<T>) => Promise.race([p, quitP]) as Promise<T>;
    const go = async <T>(p: Promise<T>) => { const v = await p; if (quitting) throw QUIT; return v; };
    const askQuit = () => {
      if (quitting || document.querySelector('.sit-quit')) return;
      sfx.tap();
      const wrap = h('div', { class: 'modal-wrap fade-in craft-ok sit-quit', style: 'z-index:30' });
      const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
      const close = () => { wrap.remove(); window.removeEventListener('keydown', onKey); };
      window.addEventListener('keydown', onKey);
      wrap.append(h('div', { class: 'modal card pop-in', style: 'width:min(460px,100%)' },
        h('h2', null, '가게 봐 주기를 그만둘까요?'),
        h('p', { class: 'sub' }, '지금 나가면 이번에 받은 별과 마음 도장은 남지 않아요.'),
        h('div', { class: 'actions' },
          h('button', { class: 'btn ghost', onclick: () => { sfx.back(); close(); } }, '계속 봐 주기'),
          h('button', { class: 'btn', onclick: () => {
            if (!exitBtn.isConnected) { close(); return; } // 손님을 다 맞고 주인이 돌아오는 중이면 그만두지 않아요
            sfx.pop(); close(); quitting = true;
            window.speechSynthesis?.cancel();
            document.querySelectorAll('#ui > .dialog, #ui > .memo, #ui > .cook, #ui > .info, #ui > .yum, #ui > .confetti, #ui > .stars, #ui > .modal-wrap.craft-ok').forEach((d) => d.remove());
            document.body.classList.remove('cooking');
            exitBtn.remove();
            quitNow();
          } }, '그만두고 나가기'))));
      document.getElementById('ui')!.appendChild(wrap);
    };
    const exitBtn = h('button', { class: 'btn ghost small sit-exit craft-ok', onclick: askQuit }, '나가기');
    document.getElementById('ui')!.appendChild(exitBtn);
    try {
      for (let i = 0; i < N; i++) {
        const c0 = pool[i], c: Customer = { ...c0, story: adaptStory(c0, kind) };
        setBanner(i);
        st.mood('neutral');
        await go(st.setView('door', 0.9));
        const entering = st.enter(c0, { prop: false });
        st.craftStove(); // 손님을 들인 뒤에 냄비를 치워요 (enter가 가게를 라면 가게로 되돌려요)
        await go(wait(1.2));
        st.setView('guest', 1.4);
        await go(entering);
        const say = this.say(c);
        st.mood(this.moodFor(c));
        await ui(UI.dialog(c, c.story, { onLine: (k, w) => say(k, w, c.story), final: { label: S.go, replay: true } }));
        st.talk(0, false);
        this.memo(c, say);
        await go(st.craftStart(kind));
        const picks = await ui(UI.craft({ kind, thumbs: this.cThumbs, onSet: (p) => st.craftSet(p) }));
        document.querySelectorAll('.dialog').forEach((d) => d.remove());
        window.speechSynthesis?.cancel();
        st.talk(0, false);
        await go(st.craftFinish());
        document.querySelector('.memo')?.remove();
        const r = scoreCraft(c, picks), name = craftName(kind, picks);
        await go(st.craftServe());
        await go(st.craftReceive());
        st.celebrate(r.stars, false);
        const lines = craftLines(c, kind, r.stars, name);
        await ui(UI.reaction(c, r.stars, false, (k, w) => say(k, w, lines), lines, r.stars));
        st.talk(0, false);
        await ui(UI.craftNote(c, kind, name, picks, r, N - 1 - i));
        stars.push(r.stars);
        st.craftClear();
        await go(st.leave());
        st.clearGuests();
      }
      // 주인이 돌아와서 고맙다고 해요 (여기부터는 나가기 단추와 확인 창을 치워요)
      exitBtn.remove(); document.querySelector('.sit-quit')?.remove();
      const total = stars.reduce((a, b) => a + b, 0);
      const ownerC: Customer = { id: `owner-${kind}`, name: S.owner.name, source: 'new', chibi: S.owner.spec, greet: '', story: [], needs: { effect: '고마움', sub: 'love' }, feelingWords: [], reactions: { 3: [], 2: [], 1: [] }, prop: '', propModel: '' };
      await st.setView('door', 0.9);
      const entering = st.enter(ownerC, { prop: false });
      st.craftStove();
      await wait(1.2);
      st.setView('guest', 1.4);
      await entering;
      st.mood('happy');
      const say = this.say(ownerC);
      const lines = [
        '다녀왔어요! 가게를 봐 줘서 정말 고마워요.',
        N > 1 ? `손님 세 분께 별을 ${total}개 받았네요. ${total >= 8 ? '손님 마음을 저보다 더 잘 살펴 줬어요!' : total >= 6 ? '손님 마음을 정성껏 살펴 줬군요.' : '처음인데도 끝까지 잘 해 줬어요.'}`
          : `손님께 별을 ${total}개 받았네요. ${total >= 3 ? '손님 마음에 꼭 맞게 골라 줬어요!' : total >= 2 ? '손님 마음을 정성껏 살펴 줬군요.' : '처음인데도 끝까지 잘 해 줬어요.'}`,
        '고마운 마음을 담아 마음 도장을 드릴게요.',
      ];
      await UI.dialog(ownerC, lines, { onLine: (k, w) => say(k, w, lines), final: { label: '마음 골목으로 돌아가기' } });
      st.talk(0, false);
      await st.leave();
    } catch (e) {
      if (e !== QUIT) throw e;
      // 움직이던 장면(카메라·손님 걸음)이 다 끝난 뒤에 가게를 정리해요
      await wait(1.5);
    } finally {
      exitBtn.remove(); document.querySelector('.sit-quit')?.remove();
      st.showPaws(false); // 재료를 고르다 나가도 앞발이 카메라 앞에 남지 않게
      window.speechSynthesis?.cancel();
      document.querySelectorAll('.dialog, .memo').forEach((d) => d.remove());
      banner.remove();
      st.craftClear();
      st.clearGuests();
      st.craftTheme(null);
      st.resetPot();
      st.setView('wide', 0);
      document.body.classList.remove('shop-sit');
    }
    return { stars: quitting ? [] : stars, quit: quitting };
  }

  // 수업용: 두 그릇 전에 라면을 끓여 준 손님이 다음 손님보다 먼저 잠깐 들러 뒷이야기를 들려줘요 (두 그릇마다 한 번)
  private async dropIn(o: Owner) {
    if (o.round < 2 || o.round % 2) return;
    const rec = this.records.find((r) => r.round === o.round - 2);
    if (!rec || o.visits?.includes(rec.id)) return;
    const c = CUSX.get(rec.customerId), later = LATER[rec.customerId];
    if (!c || !later) return;
    const lines = rec.stars >= 3 ? later.good : later.okay;
    this.drawHud(null);
    await this.stage.setView('door', 0.9);
    const entering = this.stage.enter(c, { prop: false });
    await wait(1.2);
    this.stage.setView('guest', 1.4);
    await entering;
    this.stage.mood(rec.stars >= 3 ? 'happy' : 'neutral');
    const say = this.say(c);
    await UI.dialog(c, lines, { onLine: (i, w) => say(i, w, lines), final: { label: '또 놀러 와요!' }, extra: UI.visitTag(rec.name) });
    this.stage.talk(0, false);
    window.speechSynthesis?.cancel();
    o.visits = [...(o.visits ?? []), rec.id].slice(-60);
    await this.saveOwner();
    await this.stage.leave();
  }

  private moodFor(c: Customer) {
    const fam = c.needs.effect;
    if (['축하', '설렘', '뿌듯함'].includes(fam)) return 'happy' as const;
    if (['화 식히기', '잠깐 멈춤', '마음 말하기', '좋은 점 찾기'].includes(fam)) return 'angry' as const;
    if (['걱정 줄이기', '씩씩함', '자신감', '단잠', '깊은 숨', '차분함', '입장 바꾸기', '사과', '고마움'].includes(fam)) return 'worried' as const;
    if (['쉼', '느긋함'].includes(fam)) return 'neutral' as const;
    return 'sad' as const;
  }

  // 마음 돋보기: 카메라가 손님 얼굴과 손으로 다가가고, 몸짓을 보고 마음을 골라요. 찾은 몸짓 단서는 메모에 남아요
  private async lookCloser(c: Customer): Promise<string> {
    const kind = this.moodFor(c) as BodyMood;
    const b = BODY[kind];
    this.stage.talk(0, false);
    window.speechSynthesis?.cancel();
    await this.stage.setView('face', 0.8);
    this.stage.showBody(kind);
    const others = Object.values(BODY).map((x) => x.answer).filter((a) => a !== b.answer);
    const rnd = mulberry32(hashStr(c.id + (this.owner?.id ?? '')));
    const two = others.sort(() => rnd() - 0.5).slice(0, 2);
    const opts = [b.answer, ...two].sort(() => rnd() - 0.5);
    await UI.bodyQuiz(c, b.cue, b.answer, opts);
    this.stage.mood(this.moodFor(c));
    await this.stage.setView('guest', 0.8);
    return b.cue;
  }

  private memo(c: Customer, say: ReturnType<App['say']>, body?: string) {
    const open = window.innerWidth >= 1100 && window.innerHeight >= 700;
    UI.memo(c, () => {
      if (document.querySelector('.dialog')) return;
      UI.dialog(c, c.story, { onLine: (i, w) => say(i, w, c.story), final: { label: '알겠어요!' } });
    }, open, body);
  }

  private cook(c: Customer, start: Picks, tutorial: boolean): Promise<Picks> {
    const done = UI.cook({
      thumbs: this.thumbs, start, tutorial, hints: tutorial ? TUTOR_HINTS : undefined,
      onAdd: (ing, p) => this.stage.toss(ing, p),
      onRemove: (p) => this.stage.removeFromPot(p),
    });
    const panel = document.querySelector('.cook') as HTMLElement | null;
    const fit = () => { if (panel?.isConnected) this.stage.setShift(Math.max(0, panel.offsetHeight * 0.5 - 30)); };
    fit();
    const ro = new ResizeObserver(fit);
    if (panel) ro.observe(panel);
    return done.then((p) => { ro.disconnect(); this.stage.setShift(0); return p; });
  }

  // 시험용
  debugShow(i: number, mood: 'neutral' | 'happy' | 'sad' | 'worried' | 'angry' | 'delight' = 'neutral') {
    const c = i < 0 ? TUTORIAL : CUSTOMERS_72[i];
    this.stage.showInstant(c);
    this.stage.mood(mood);
    return c.name;
  }

  // ── 행사용(어깨동무 마음 요리사 도전) ─────────────────
  // 첫 화면 → 학년·반·번호·이름 → 도전 안내 → 10그릇 → 판 끝 (다시 도전은 두 번까지)
  private async eventSession() {
    UI.clearAll();
    this.stage.setView('wide', 0);
    rank.flush(); // 지난번에 못 보낸 기록이 있으면 보내요
    rank.warm();
    await UI.title(() => this.openTeacher(), undefined);
    unlockAudio();
    let prefill = '';
    for (;;) {
      const r = await EV.login((g, c) => this.roster(g, c), prefill);
      if (r === null) return; // 첫 화면으로
      // 뒤로 오면 번호와 이름을 다시 고르게 해요 (쓴 이름은 남겨 둬요)
      if ((await this.student(r.who, r.takenBy)) === 'back') { prefill = r.who.name; continue; }
      return;
    }
  }

  // 이 반에서 이미 들어온 번호와 이름 (서버 기록 + 이 태블릿 기록). 서버에 닿지 않으면 이 태블릿 것만
  // 이름은 첫 글자만 보여 줘요(김○○). 친구 이름으로 잘못 들어가지 않게, 번호를 눌러도 이름을 대신 채우지 않아요
  private async roster(grade: number, cls: number): Promise<{ names: Map<number, string>; partial: boolean } | null> {
    const [rows, owners] = await Promise.all([rank.roster(grade, cls), db.owners()]);
    const m = new Map<number, { name: string; runs: number }>();
    const put = (num: number, name: string, runs: number) => {
      const cur = m.get(num);
      // 같은 번호에 이름이 여럿이면 판을 더 많이 한 이름
      if (!cur || runs > cur.runs) m.set(num, { name, runs });
    };
    rows?.forEach((r) => put(r.num, r.name, r.runs));
    // 한 그릇도 안 끓인 판(가게 문만 연 판)은 들어온 번호로 치지 않아요
    owners.filter((o) => o.ev && o.ev.grade === grade && o.ev.cls === cls && (o.ev.done || o.round > 0)).forEach((o) => put(o.number, maskName(o.name), 1));
    if (!rows && !m.size) return null;
    return { names: new Map([...m].map(([k, v]) => [k, v.name])), partial: !rows };
  }

  private lastBand() {
    try { const g = JSON.parse(localStorage.getItem('event-last-class') || '{}').grade; return bandOf(g || 3); } catch { return bandOf(3); }
  }
  // 선생님만 보는 랭킹: 암호는 이 기기에 기억해 두고, 틀리면 다시 물어요
  private async teacherRanking() {
    let key = rank.savedKey();
    let msg: string | undefined;
    for (;;) {
      if (!key) {
        const ask = await EV.askKey(msg);
        if (!ask) return;
        const k = ask.key;
        // 맞는 암호인지 먼저 확인하고 기억해요
        const busy = h('div', { class: 'toast' }, '암호를 확인하는 중…');
        document.getElementById('ui')!.appendChild(busy);
        const t = await rank.classes('total', k);
        busy.remove();
        if (t === 'bad_key') { msg = '랭킹 암호가 맞지 않아요.'; continue; }
        if (t === 'too_many') { toast('암호를 여러 번 틀려서 10분 동안 막혔어요', 4000); return; }
        if (t === 'no_admin_key') { toast('서버에 랭킹 암호가 아직 없어요. 버셀에 RANK_ADMIN_KEY를 넣고 다시 배포해 주세요', 5000); return; }
        if (t === 'offline') { toast('랭킹 서버에 닿지 않아요. 인터넷을 확인해 주세요'); return; }
        key = k; rank.saveKey(k, ask.remember);
      }
      const k = key;
      const r = await EV.ranking({ band: this.lastBand(), people: (b, by) => rank.board(b, by, k), classes: (by) => rank.classes(by, k) });
      if (r !== 'rekey') return;
      rank.saveKey(''); key = ''; msg = '랭킹 암호가 맞지 않아요.';
    }
  }

  // 한 학생: 몇 번째 판인지 정하고, 끓이고, 끝나면 다시 도전할지 물어요
  private async student(w: Who, takenBy: string | null = null): Promise<'back' | 'home'> {
    const key = keyOf(w);
    let asked = false;
    for (;;) {
      UI.hideHud(); // 앞 학생의 상단 바가 남지 않게
      this.owner = null;
      const busy = h('div', { class: 'toast' }, '기록을 확인하는 중…');
      document.getElementById('ui')!.appendChild(busy);
      // 오래 쉬던 서버는 첫 대답이 느려서, 못 받으면 한 번 더 물어요
      const [owners, st] = await Promise.all([db.owners(), rank.status(w).then((r) => r ?? rank.status(w))]);
      busy.remove();
      let mine = owners.filter((o) => o.ev?.key === key).sort((a, b) => a.ev!.runNo - b.ev!.runNo);
      const hereBefore = mine.length > 0; // 지우기 전에: 이 태블릿에 이 학생 이름으로 만든 판이 있었어요
      // 만들기만 하고 한 그릇도 안 끓인 판은 지우고 새로 셈해요
      for (const o of mine.filter((x) => !x.ev!.done && x.round === 0)) await db.deleteOwner(o.id);
      mine = mine.filter((x) => x.ev!.done || x.round > 0);
      const unfinished = mine.find((x) => !x.ev!.done) ?? null;
      // 고른 번호에 다른 이름이 먼저 들어와 있으면 한 번 물어요 (잘못 누른 번호일 수 있어요)
      // 같은 학생인지는 이 학생 이름으로 쌓인 기록이 있는지로 봐요. 서버에 닿지 않으면 가린 이름끼리 견줘요
      if (takenBy && !asked) {
        asked = true;
        const same = hereBefore || (st ? st.status.runs > 0 : maskName(w.name) === takenBy);
        if (!same && (await EV.dupe(w, takenBy)) === 'retry') return 'back';
      }
      const best = st?.status.best ?? this.localBest(mine);
      const runNo = unfinished ? unfinished.ev!.runNo : Math.max(st?.status.runs ?? 0, mine.length) + 1;
      // 이미 쓴 판 (서버 기록 + 이 태블릿 기록). 다른 기기에서 한 판도 세어요
      const known = new Set<number>([...(st?.status.list ?? []).map((x) => x.runNo), ...mine.map((x) => x.ev!.runNo)]);
      const used = [...known].filter((n) => n !== runNo);
      const pick = await EV.ready({ who: w, runNo, used, resume: unfinished ? unfinished.round : null, best, offline: !st });
      if (pick === 'back') return 'back';
      if (pick === 'lib') {
        const last = mine[mine.length - 1];
        if (!last) { toast('이 태블릿에는 이 학생의 도감이 없어요'); continue; }
        this.owner = last; this.records = await db.records(last.id);
        await this.openLibrary();
        continue;
      }
      if (runNo > MAX_RUNS && !unfinished) continue;
      const o = unfinished ?? this.newRun(w, runNo, mine.some((x) => x.tutorialDone));
      if (!unfinished) { const all = await db.owners(); all.push(o); await db.saveOwners(all); }
      this.owner = o;
      this.fixOrder(o);
      this.records = await db.records(o.id);
      // 하다가 멈추거나 창을 닫아도 다음에 학년·반·번호·이름이 채워져 있게 기억해 둬요 (판을 끝내면 지워요)
      rememberPaused(w);
      const end = await this.playRun(o);
      if (end === 'stop') return 'home';
      rememberPaused(null);
      // 판 끝: 마지막 그릇 기록을 보내 두고(늦어도 6초) 내 결과만 보여 줘요. 랭킹은 선생님 화면에서만 봐요
      const sent = await Promise.race([this.sending ?? Promise.resolve(null), sleep(6000).then(() => null)]);
      const ev = o.ev!;
      // 서버가 이미 세 판을 했다며 받지 않은 판은 기록에 남지 않아요
      const lost = sent?.error === 'max_runs';
      // 서버 답이 있으면 그게 가장 새 최고 기록이에요. 없으면 시작할 때 받아 둔 기록과 견줘요
      // (별이 같으면 별 다섯 그릇이 많은 판, 그것도 같으면 먼저 한 판: 서버와 같은 기준)
      const top = sent?.status?.best ?? best;
      const isBest = !lost && (sent?.status?.best ? sent.status.best.runNo === ev.runNo
        : !best || best.runNo === ev.runNo || ev.total > best.total || (ev.total === best.total && ev.fives > best.fives));
      // 지금까지 판 기록: 서버 기록 + 이 태블릿 기록 + 방금 끝낸 판 (기록에 남은 판만)
      const runs = new Map<number, number>();
      (sent?.status?.list ?? st?.status.list ?? []).forEach((x) => runs.set(x.runNo, x.total));
      mine.forEach((x) => { if (!runs.has(x.ev!.runNo)) runs.set(x.ev!.runNo, x.ev!.total); });
      if (!lost) runs.set(ev.runNo, ev.total);
      let cheer = true;
      for (;;) {
        const left = MAX_RUNS - Math.max(ev.runNo, sent?.status?.runs ?? 0, used.length + 1);
        const f = await EV.result({
          who: w, runNo: ev.runNo, total: ev.total, fives: ev.fives, isBest, lost, best: top ? { total: top.total, runNo: top.runNo } : null,
          runs: [...runs].map(([runNo, total]) => ({ runNo, total })), cheer,
          actions: [
            { id: 'home', label: '처음으로', kind: 'ghost' },
            { id: 'lib', label: '도감·대표 라면 카드', kind: 'soft' },
            ...(left > 0 ? [{ id: 'again' as const, label: `다시 도전 (${left}번 남음)` }] : []),
          ],
        });
        cheer = false;
        if (f === 'lib') { await this.openLibrary(); continue; }
        if (f === 'again') break;
        return 'home';
      }
    }
  }

  private localBest(runs: Owner[]): Best | null {
    let b: Best | null = null;
    for (const o of runs) {
      const ev = o.ev!;
      if (!b || ev.total > b.total || (ev.total === b.total && ev.fives > b.fives)) b = { total: ev.total, fives: ev.fives, bowls: o.round, runNo: ev.runNo, at: o.createdAt };
    }
    return b && b.total ? b : null;
  }

  // 새 판: 손님 순서는 학생마다 정해져 있고, 판마다 다음 10명을 만나요 (세 판 동안 같은 손님이 다시 오지 않게)
  private newRun(w: Who, runNo: number, tutored: boolean): Owner {
    const key = keyOf(w);
    const id = uid();
    const o: Owner = { id, number: w.num, name: w.name, round: 0, order: [], tutorialDone: tutored || runNo > 1, createdAt: Date.now(),
      ev: { grade: w.grade, cls: w.cls, key, runNo, runId: id, total: 0, fives: 0, done: false } };
    const base = makeOrder(this.listFor(o), hashStr(key));
    const k = ((runNo - 1) * ROUNDS) % base.length;
    o.order = [...base.slice(k), ...base.slice(0, k)];
    return o;
  }

  // 10그릇을 끓여요. 중간에 멈추면 'stop' (다음에 이 태블릿에서 이어서 해요)
  private async playRun(o: Owner): Promise<'done' | 'stop'> {
    this.drawHud(null);
    if (!o.tutorialDone) {
      await this.round(true);
      o.tutorialDone = true;
      await this.saveOwner(o);
    }
    while (o.round < ROUNDS) {
      const saved = await this.round(false);
      if (o.round >= ROUNDS) break;
      for (;;) {
        const choice = await UI.between({ count: this.records.length, justTen: false, skipped: !saved, ev: { bowls: o.round, total: o.ev!.total, last: this.lastShown } });
        if (choice === 'lib') { await this.openLibrary(); continue; }
        if (choice === 'switch') { toast('다음에 이 태블릿에서 이름을 똑같이 쓰면 이어서 할 수 있어요', 3500); return 'stop'; }
        break;
      }
    }
    return 'done';
  }

  // 한 그릇 끓일 때마다 랭킹 서버에 이번 판 기록을 보내요
  private maxRunsWarned = new Set<string>();
  private sendRun(o: Owner) {
    const ev = o.ev!;
    const p = rank.submit(whoOf(o), { runId: ev.runId, runNo: ev.runNo, bowls: o.round, total: ev.total, fives: ev.fives, done: ev.done }).then((r) => {
      if (r?.runNo && r.runNo !== ev.runNo) { ev.runNo = r.runNo; this.saveOwner(o); }
      // 세 판을 넘긴 판이라는 알림은 판마다 한 번만
      if (r?.error === 'max_runs') { if (this.maxRunsWarned.has(ev.runId)) return r; this.maxRunsWarned.add(ev.runId); }
      EV.sent(r);
      return r;
    });
    this.sending = p;
    return p;
  }

  // ── 도감과 카드 ─────────────────────────
  private async treatPhoto(t: Treat) {
    const b = await db.photo(t.photoKey);
    return b ? URL.createObjectURL(b) : this.stage.photo(t.picks, 320).toDataURL('image/webp', 0.85);
  }

  // ── 손님들이 사장님에게 끓여 주는 라면 (수업용, 열 그릇째에 한 번) ──
  // 학생이 오늘 마음을 고르면, 그동안 라면을 끓여 준 손님 다섯이 재료를 하나씩 넣으며 한마디씩 해요
  private async treat() {
    const o = this.owner!;
    // 도와줄 손님: 별을 많이 받은 손님부터, 서로 다른 손님 다섯
    const helpers: { c: Customer; rec: RamenRecord }[] = [];
    for (const r of [...this.records].sort((a, b) => b.stars - a.stars || b.round - a.round)) {
      const c = CUSX.get(r.customerId);
      if (!c || c.source === 'tutorial' || helpers.some((x) => x.c.id === c.id)) continue;
      helpers.push({ c, rec: r });
      if (helpers.length === 5) break;
    }
    if (!helpers.length) return;
    while (helpers.length < 5) helpers.push(helpers[helpers.length % Math.max(1, helpers.length)]);
    let seated = helpers.filter((x) => !Array.isArray(x.c.chibi)).filter((x, i, a) => a.findIndex((y) => y.c.id === x.c.id) === i).slice(0, 2);
    if (!seated.length) seated = helpers.slice(0, 1); // 둘이 같이 오는 손님뿐이면 그 손님들이 앉아요
    const party: Customer = { ...seated[0].c, id: 'treat', chibi: seated.flatMap((x) => (Array.isArray(x.c.chibi) ? x.c.chibi : [x.c.chibi as ChibiSpec])).slice(0, 2), propModel: 'none' };
    const names = seated.map((x) => x.c.name);
    this.inRound = true;
    this.drawHud(null);
    this.stage.resetPot();
    await this.stage.setView('door', 0.9);
    const entering = this.stage.enter(party, { prop: false });
    await wait(1.2);
    this.stage.setView('guest', 1.4);
    await entering;
    this.stage.mood('happy');
    const say = this.say(party);
    const hello = [`${o.name} 사장님! 열 그릇이나 끓이느라 정말 수고 많았어요.`, `${seated.length > 1 ? '@1 ' : ''}그래서 오늘은 우리가 사장님께 라면을 끓여 드릴게요. 사장님, 오늘 마음은 어때요?`];
    await UI.dialog(party, hello, { onLine: (i, w) => say(i, w, hello), final: { label: '마음 고르기' }, names: [names[0], names[names.length - 1]] });
    this.stage.talk(0, false);
    const mood = await UI.treatMood(o.name);
    // 학생 마음에 맞는 재료를 단계마다 하나씩
    const fam = FX.get(mood.effect)!.family;
    const steps: Step[] = ['broth', 'noodle', 'soup', 'topping', 'finish'];
    const ings = steps.map((st) => {
      const list = INGREDIENTS.filter((i) => i.step === st);
      return list.find((i) => i.effects.includes(mood.effect)) ?? list.find((i) => i.effects.some((e) => FX.get(e)?.family === fam)) ?? list[0];
    });
    const say1 = [
      (r: string, g: string) => `사장님! 그때 끓여 준 '${r}' 덕분에 힘이 났어요. 이번엔 제가 ${eulReul(g)} 부을게요.`,
      (r: string, g: string) => `'${r}', 아직도 생각나요. 이번엔 제가 ${eulReul(g)} 넣을게요.`,
      (_r: string, g: string) => `사장님이 제 이야기를 끝까지 들어 줘서 고마웠어요. ${eulReul(g)} 솔솔 뿌릴게요.`,
      (_r: string, g: string) => `이번엔 제 차례예요! ${eulReul(g)} 살짝 올릴게요.`,
      (_r: string, g: string) => `마지막은 제가 할게요. ${eulReul(g)} 톡톡 뿌리면 완성!`,
    ];
    const picks: Picks = { broth: null, noodle: null, soup: null, toppings: [], finish: [] };
    const lines: string[] = [];
    await this.stage.setView('pot', 0.9);
    for (let i = 0; i < 5; i++) {
      const { c, rec } = helpers[i], ing = ings[i];
      const line = say1[i](rec.name, ing.name);
      lines.push(line);
      const sayI = this.say(c);
      await UI.dialog(c, [line], { onLine: () => sayI(0, 0, [line]), final: { label: i < 4 ? '고마워요!' : '완성!' } });
      window.speechSynthesis?.cancel();
      if (ing.step === 'broth') picks.broth = ing.id;
      else if (ing.step === 'noodle') picks.noodle = ing.id;
      else if (ing.step === 'soup') picks.soup = ing.id;
      else if (ing.step === 'topping') picks.toppings.push(ing.id);
      else picks.finish.push({ id: ing.id, amount: '한 꼬집' });
      await this.stage.toss(ing, picks);
    }
    this.stage.setView('guest', 1.0);
    const end = [mood.end];
    await UI.dialog(party, end, { onLine: (i, w) => say(i, w, end), final: { label: '라면 받기' }, names: [names[0]] });
    this.stage.talk(0, false);
    const t: Treat = { mood: mood.id, name: mood.name, picks, helpers: helpers.map((x, i) => ({ id: x.c.id, ing: ings[i].name, line: lines[i] })), photoKey: 'treat-' + o.id, at: Date.now() };
    const photo = this.ctxLost ? null : this.stage.photo(picks, 512);
    const blob = photo ? await new Promise<Blob | null>((res) => photo.toBlob(res, 'image/webp', 0.86)) : null;
    if (blob) await db.savePhoto(t.photoKey, blob);
    o.treat = t;
    await this.saveOwner();
    sfx.fanfare();
    await UI.treatCard(t, o.name, await this.treatPhoto(t), (id) => CUSX.get(id));
    await this.stage.leave();
    this.stage.resetPot();
    this.inRound = false;
  }

  private async photoUrl(r: RamenRecord) {
    let u = this.photoUrls.get(r.photoKey);
    if (u) return u;
    const b = await db.photo(r.photoKey);
    if (b) u = URL.createObjectURL(b);
    else u = this.stage.photo(r.picks, 320).toDataURL('image/webp', 0.85);
    this.photoUrls.set(r.photoKey, u);
    return u;
  }

  private libOpen = false;
  async openLibrary() {
    if (!this.owner) return;
    // 수업용: 도감 칩을 빠르게 두 번 눌러도 도감은 하나만 열어요
    if (!EVENT) { if (this.libOpen) return; this.libOpen = true; try { return await this.openLibraryNow(); } finally { this.libOpen = false; } }
    return this.openLibraryNow();
  }
  private async openLibraryNow() {
    if (!this.owner) return;
    const ev = EVENT ? this.owner.ev : undefined;
    const o = this.owner;
    const more = EVENT ? undefined : {
      alley: () => this.openAlley(o, this.records),
      treat: o.treat ? { label: o.treat.name, open: async () => UI.treatCard(o.treat!, o.name, await this.treatPhoto(o.treat!), (id) => CUSX.get(id)) } : undefined,
    };
    const pick = await UI.library(this.owner, this.records, (r) => this.photoUrl(r), (id) => CUSX.get(id),
      ev ? `${this.owner.name}의 ${ev.runNo}번째 판 도감` : undefined, ev ? ev.done : undefined, more);
    if (!pick) return;
    const url = await this.photoUrl(pick);
    const img = new Image();
    await new Promise((res) => { img.onload = res; img.onerror = res; img.src = url; });
    const cust = CUSX.get(pick.customerId)!;
    await UI.maker({ rec: pick, customer: cust, photo: img.naturalWidth ? img : null, author: this.owner.name, tinkerbell: this.teacher.tinkerbell || TINKERBELL_URL,
      hint: ai.ready ? (reason) => ai.reason(cust, pick, reason) : undefined });
  }

  private async openTeacher() {
    const ok = await UI.pin(TEACHER_PIN);
    if (ok === null) return; // 닫기
    if (!ok) { toast('암호가 맞지 않아요'); return; }
    const owners = await db.owners();
    await UI.teacher({
      url: this.teacher.tinkerbell ?? '', defaultUrl: TINKERBELL_URL, quality: this.teacher.quality ?? 'auto', owners, counts: await this.counts(owners),
      ai: { on: this.teacher.ai !== false, url: this.teacher.aiUrl ?? '', defaultUrl: AI_URL },
      onCheck: (u) => ai.check(u),
      onSummary: async () => {
        const owners = await db.owners(); // 이 화면에서 지운 사장님은 빼고 세요
        // 학생 이름은 빼고 숫자와 라면 이름만 모아요
        const all: RamenRecord[] = [];
        let done = 0;
        for (const ow of owners) { const rs = await db.records(ow.id); all.push(...rs); if (rs.length >= ROUNDS) done++; }
        const st = classStats(owners.length, all, done, (r) => CUSX.get(r.customerId)?.needs.effect);
        return { stats: st, text: all.length ? await ai.summary(st) : null };
      },
      onSave: (url, q, aiOn, aiUrl) => {
        const wasQ = this.teacher.quality ?? 'auto';
        this.teacher = { tinkerbell: url || undefined, quality: q as TeacherSettings['quality'], ai: aiOn, aiUrl: aiUrl || undefined };
        ai.configure(this.teacher.aiUrl, aiOn);
        db.saveTeacher(this.teacher);
        // 선생님이 화질을 고정하면 자동 측정이 나중에 바꾸지 않게 멈춰요
        if (q !== 'auto') { const t = q as Tier; this.wcr.setTier(TIERS[t]); PHYS.iters = t === 'low' ? 6 : t === 'mid' ? 8 : 10; this.probe.done = true; }
        else if (!EVENT && wasQ !== 'auto') {
          // 수업용: 고정했던 화질을 '자동'으로 되돌리면 처음처럼 높게 시작해서 다시 재요
          const apply = (t: Tier) => { this.wcr.setTier(TIERS[t]); PHYS.iters = t === 'low' ? 6 : t === 'mid' ? 8 : 10; };
          const t0: Tier = LOW_MEM_PHONE ? 'low' : 'high';
          apply(t0); this.probe = new QualityProbe(t0, apply);
        }
        toast('저장했어요');
      },
      onDelete: async (ow) => { await db.deleteOwner(ow.id); toast(`${ow.name} 사장님 기록을 지웠어요`); },
      rank: EVENT ? { open: () => this.teacherRanking(), hasKey: () => rank.rememberedKey(), forget: () => rank.saveKey('') } : undefined,
    });
  }
}

export { ING };
