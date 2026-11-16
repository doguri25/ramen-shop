import { AI_URL, MAX_RUNS, ROUNDS, TEACHER_PIN, TINKERBELL_URL } from './config';
import { ai, classStats } from './ai/solar';
import { eulReul } from './core/korean';
import { hashStr, mulberry32, shuffle, uid } from './core/rng';
import { resumeAudio, setSound, setTts, sfx, speak, suspendAudio, ttsEnabled, unlockAudio, soundOn } from './core/sound';
import { updateTweens, wait } from './core/tween';
import { CUS, CUSTOMERS, TUTORIAL } from './data/customers';
import { CUS_56, CUSTOMERS_56 } from './data/customers56';
import { CUS_14, CUSTOMERS_14 } from './data/customers14';
import { EVENT } from './event/flag';
import { bandOf, keyOf, rank, type Best, type SendResult, type Who } from './event/rank';
import { EV, whoText } from './event/screens';
import { ING, INGREDIENTS } from './data/ingredients';
import { TUTOR_INTRO } from './data/text';
import type { Customer, Owner, Picks, RamenRecord, Step } from './data/types';
import { customerForRound, makeOrder } from './game/schedule';
import { fiveStars, hasHeart, score } from './game/scoring';
import { faceAtlas, paperCanvas, tex } from './paint/textures';
import { LIGHT_W, QualityProbe, TIERS, WatercolorRenderer, type Tier, shared } from './render/watercolor';
import { bakeLighting } from './render/bake';
import * as THREE from 'three';
import { setFaceTexture } from './scene/chibi';
import { Stage } from './scene/stage';
import { PHYS } from './scene/physics';
import { db, local, type TeacherSettings } from './storage/db';
import { h, toast } from './ui/dom';
import { UI } from './ui/screens';

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
    await Promise.race([Promise.all([document.fonts.load('40px "Jua"', '친구라면'), document.fonts.load('20px "Gowun Dodum"', '친구라면')]), sleep(3000)]).catch(() => {});
    this.teacher = await db.teacher();
    ai.configure(this.teacher.aiUrl, this.teacher.ai !== false);
    setSound(this.settings.sound);
    setTts(this.settings.tts);
    const paper = tex(paperCanvas(512), true);
    this.wcr = new WatercolorRenderer(canvas, paper);
    shared.uPaper.value = paper;
    setFaceTexture(tex(faceAtlas()));
    const q = this.teacher.quality ?? 'auto';
    // 화질은 점 개수 한도로 정해서, 작은 화면도 처음부터 '높음'으로 또렷하게 시작해요
    const tier: Tier = q === 'auto' ? 'high' : q;
    const apply = (t: Tier) => { this.wcr.setTier(TIERS[t]); PHYS.iters = t === 'low' ? 6 : t === 'mid' ? 8 : 10; };
    apply(tier);
    this.probe = new QualityProbe(tier, apply, q !== 'auto');
    setStatus('가게를 꾸미는 중…');
    await sleep(30);
    this.stage = new Stage(this.wcr);
    this.onResize();
    window.addEventListener('resize', () => this.onResize());
    setStatus('재료를 그리는 중…');
    let i = 0;
    for (const ing of INGREDIENTS) {
      this.thumbs.set(ing.id, this.stage.thumb(ing, 192).toDataURL('image/webp', 0.9));
      if (++i % 6 === 0) { setStatus(`재료를 그리는 중… ${i}/${INGREDIENTS.length}`); await new Promise((r) => setTimeout(r, 0)); }
    }
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.running = false; toast('화면을 다시 그리는 중이에요…'); });
    canvas.addEventListener('webglcontextrestored', () => location.reload());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.running = false; suspendAudio(); window.speechSynthesis?.cancel(); }
      else { this.running = true; this.last = performance.now(); resumeAudio(); cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame(this.loop); }
    });
    window.addEventListener('pointerdown', () => unlockAudio(), { capture: true });
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
      this.bakeInfo = await bakeLighting(shop.root, { version: 'rt5', light: LIGHT_W, lamps, quality: q });
      console.info('[bake]', this.bakeInfo);
    } catch (e) { console.warn('[bake]', e); }
  }

  private onResize() {
    this.wcr.resize();
    this.stage.resize(window.innerWidth, window.innerHeight);
  }

  private loop = (t: number) => {
    if (!this.running) return;
    const raw = Math.min(0.1, Math.max(0, (t - this.last) / 1000));
    this.last = t;
    const dt = raw * this.timeScale;
    updateTweens(dt);
    shared.uTime.value += dt;
    this.stage.update(dt);
    const d = this.stage.dof;
    this.wcr.setDof(d.focus, d.range, d.amount);
    this.wcr.render(this.stage.scene, this.stage.cam);
    this.probe.sample(raw);
    this.raf = requestAnimationFrame(this.loop);
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
        toast('문제가 생겨서 첫 화면으로 돌아왔어요');
      }
      this.owner = null;
    }
  }

  private async session() {
    if (EVENT) return this.eventSession();
    {
      UI.clearAll();
      this.stage.setView('wide', 0);
      await UI.title(() => this.openTeacher(), ai.url ? { on: ai.ready, check: () => ai.check() } : undefined);
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

  private async chooseOwner() {
    const owners = await db.owners();
    const counts = await this.counts(owners);
    const r = await UI.owners(owners, counts);
    if (r.owner) { this.owner = r.owner; this.fixOrder(this.owner); }
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
  private fixOrder(o: Owner) {
    const list = this.listFor(o);
    const known = new Set(list.map((c) => c.id));
    const kept = o.order.filter((id) => known.has(id));
    const add = list.map((c) => c.id).filter((id) => !kept.includes(id));
    if (kept.length === o.order.length && !add.length) return;
    if (o.ev || !add.length) { o.order = [...kept, ...add]; this.saveOwner(o); return; }
    // 수업용: 아직 안 만난 손님 사이에 새 손님을 섞어서, 다음 손님부터 바로 만날 수 있게 해요
    const met = kept.slice(0, Math.min(o.round, kept.length));
    let rest = shuffle([...kept.slice(met.length), ...add], mulberry32(hashStr(o.id) ^ add.length));
    const gap = o.round - met.length; // 한 바퀴를 넘게 돈 학생은 이번 자리부터 새 손님이 오게 돌려요
    if (gap > 0) { const k = gap % rest.length; rest = [...rest.slice(rest.length - k), ...rest.slice(0, rest.length - k)]; }
    o.order = [...met, ...rest];
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
      onRank: ev ? () => {
        if (this.serving) { toast('손님이 라면을 다 드신 뒤에 랭킹을 볼 수 있어요'); return; }
        this.showRanking(whoOf(this.owner!));
      } : undefined,
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
      speak(l, c.source === 'book' || c.source === 'tutorial' ? 0.9 : 1.25);
    };
  }

  // 도감에 담았으면 true
  private async round(tutorial: boolean): Promise<boolean> {
    const o = this.owner!;
    const c: Customer = tutorial ? TUTORIAL : CUSX.get(customerForRound(o.order, o.round, this.listFor(o), hashStr(o.id)))!;
    const view = this.clueView(c); // 이야기·메모에 보여 줄 모습 (행사용 5~6학년은 밑줄이 없을 수도 있어요)
    this.inRound = true;
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
    await UI.dialog(view, story, { onLine: (i, w) => say(i, w, story), final: { label: '라면 끓이러 가기!', replay: true } });
    this.stage.talk(0, false);
    let attempt = 0;
    let picks: Picks = JSON.parse(JSON.stringify(EMPTY));
    let rec: RamenRecord | null = null;
    let saved = false;
    for (;;) {
      this.memo(view, say);
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
      const r = score(c, picks);
      const heart = hasHeart(c, name);
      const shown = EVENT ? fiveStars(r, heart) : r.stars; // 보여 주고 기록하는 별
      // 내어 주고 먹는 동안 AI 손님 한마디를 미리 받아 둬요 (못 받으면 원래 대사만)
      const aiLine = tutorial || EVENT ? Promise.resolve(null) : ai.react(c, picks, name, r.stars);
      this.serving = true;
      const fast = UI.fastButton((on) => { this.timeScale = on ? 2.5 : 1; });
      await this.stage.serve(picks);
      await this.stage.eat(() => UI.yum());
      fast.remove();
      this.timeScale = 1;
      this.stage.celebrate(r.stars, heart);
      const extra = await Promise.race([aiLine, new Promise<null>((res) => setTimeout(() => res(null), 1500))]);
      const lines = [...c.reactions[r.stars]];
      if (extra) lines.splice(1, 0, extra);
      await UI.reaction(c, shown, heart, (i, w) => say(i, w, lines), lines, r.stars);
      this.stage.talk(0, false);
      const canRetry = !tutorial && attempt === 0 && r.stars === 1;
      const choice = await UI.note(c, picks, r, heart, canRetry, tutorial);
      this.serving = false;
      if (choice === 'retry') {
        attempt++;
        this.stage.mood(this.moodFor(c));
        this.stage.guests.forEach((g) => { g.bounce = 0; });
        this.stage.clearBowls();
        continue;
      }
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
        rec.photoKey = rec.id;
        const photo = this.stage.photo(picks, 512);
        const blob = await new Promise<Blob | null>((res) => photo.toBlob(res, 'image/webp', 0.86));
        if (blob) await db.savePhoto(rec.photoKey, blob);
        this.records.push(rec);
        const ok = await db.saveRecords(o.id, this.records);
        o.round++;
        await this.saveOwner();
        sfx.camera();
        toast(ok ? `📖 '${name}'${eulReul(name).slice(-1)} 도감에 담았어요` : '⚠️ 태블릿에 저장하지 못했어요. 선생님께 알려 주세요');
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

  private moodFor(c: Customer) {
    const fam = c.needs.effect;
    if (['축하', '설렘', '뿌듯함'].includes(fam)) return 'happy' as const;
    if (['화 식히기', '잠깐 멈춤', '마음 말하기', '좋은 점 찾기'].includes(fam)) return 'angry' as const;
    if (['걱정 줄이기', '씩씩함', '자신감', '단잠', '깊은 숨', '차분함', '입장 바꾸기', '사과', '고마움'].includes(fam)) return 'worried' as const;
    if (['쉼', '느긋함'].includes(fam)) return 'neutral' as const;
    return 'sad' as const;
  }

  private memo(c: Customer, say: ReturnType<App['say']>) {
    const open = window.innerWidth >= 1100 && window.innerHeight >= 700;
    UI.memo(c, () => {
      if (document.querySelector('.dialog')) return;
      UI.dialog(c, c.story, { onLine: (i, w) => say(i, w, c.story), final: { label: '알겠어요!' } });
    }, open);
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
    await UI.title(() => this.openTeacher(), undefined, () => { this.showRanking(null); });
    unlockAudio();
    for (;;) {
      const r = await EV.login((g, c) => this.roster(g, c));
      if (r === null) return; // 첫 화면으로
      if (r === 'rank') { await this.showRanking(null); continue; }
      if ((await this.student(r)) === 'back') continue; // 이름을 고쳐 쓰려고 뒤로
      return;
    }
  }

  // 이 반에서 이미 들어온 번호와 이름 (서버 기록 + 이 태블릿 기록). 서버에 닿지 않으면 이 태블릿 것만
  private async roster(grade: number, cls: number): Promise<Map<number, string> | null> {
    const [rows, owners] = await Promise.all([rank.roster(grade, cls), db.owners()]);
    const m = new Map<number, { name: string; runs: number; at: number }>();
    const put = (num: number, name: string, runs: number, at: number) => {
      const cur = m.get(num);
      // 같은 번호에 이름이 여럿이면 판을 더 많이 한 이름, 같으면 최근 이름
      if (!cur || runs > cur.runs || (runs === cur.runs && at > cur.at)) m.set(num, { name, runs, at });
    };
    rows?.forEach((r) => put(r.num, r.name, r.runs, r.at ?? 0));
    owners.filter((o) => o.ev && o.ev.grade === grade && o.ev.cls === cls).forEach((o) => put(o.number, o.name, 1, o.createdAt));
    if (!rows && !m.size) return null;
    return new Map([...m].map(([k, v]) => [k, v.name]));
  }

  private lastBand() {
    try { const g = JSON.parse(localStorage.getItem('event-last-class') || '{}').grade; return bandOf(g || 3); } catch { return bandOf(3); }
  }
  private showRanking(w: Who | null) {
    return EV.ranking({ band: w ? bandOf(w.grade) : this.lastBand(), who: w, load: (b, by) => rank.board(b, by, w) });
  }

  // 한 학생: 몇 번째 판인지 정하고, 끓이고, 끝나면 다시 도전할지 물어요
  private async student(w: Who): Promise<'back' | 'home'> {
    const key = keyOf(w);
    for (;;) {
      UI.hideHud(); // 앞 학생의 상단 바가 남지 않게
      this.owner = null;
      const busy = h('div', { class: 'toast' }, '기록을 확인하는 중…');
      document.getElementById('ui')!.appendChild(busy);
      const [owners, st] = await Promise.all([db.owners(), rank.status(w)]);
      busy.remove();
      let mine = owners.filter((o) => o.ev?.key === key).sort((a, b) => a.ev!.runNo - b.ev!.runNo);
      // 만들기만 하고 한 그릇도 안 끓인 판은 지우고 새로 셈해요
      for (const o of mine.filter((x) => !x.ev!.done && x.round === 0)) await db.deleteOwner(o.id);
      mine = mine.filter((x) => x.ev!.done || x.round > 0);
      const unfinished = mine.find((x) => !x.ev!.done) ?? null;
      const best = st?.status.best ?? this.localBest(mine);
      const runNo = unfinished ? unfinished.ev!.runNo : Math.max(st?.status.runs ?? 0, mine.length) + 1;
      const pick = await EV.ready({ who: w, runNo, resume: unfinished ? unfinished.round : null, best, offline: !st });
      if (pick === 'back') return 'back';
      if (pick === 'rank') { await this.showRanking(w); continue; }
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
      const end = await this.playRun(o);
      if (end === 'stop') return 'home';
      // 판 끝: 마지막 그릇 기록이 서버에 닿은 뒤(늦어도 6초) 내 결과와 지금 랭킹을 함께 보여 줘요
      await Promise.race([this.sending ?? Promise.resolve(null), sleep(6000)]);
      const ev = o.ev!;
      const isBest = !best || ev.total >= best.total;
      let cheer = true;
      for (;;) {
        const left = MAX_RUNS - ev.runNo;
        const f = await EV.ranking({
          band: bandOf(w.grade), who: w, load: (b, by) => rank.board(b, by, w),
          result: { runNo: ev.runNo, total: ev.total, fives: ev.fives, isBest, bestTotal: best?.total ?? null, cheer },
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
  private sendRun(o: Owner) {
    const ev = o.ev!;
    const p = rank.submit(whoOf(o), { runId: ev.runId, runNo: ev.runNo, bowls: o.round, total: ev.total, fives: ev.fives, done: ev.done }).then((r) => {
      if (r?.runNo && r.runNo !== ev.runNo) { ev.runNo = r.runNo; this.saveOwner(o); }
      EV.sent(r);
      return r;
    });
    this.sending = p;
    return p;
  }

  // ── 도감과 카드 ─────────────────────────
  private async photoUrl(r: RamenRecord) {
    let u = this.photoUrls.get(r.photoKey);
    if (u) return u;
    const b = await db.photo(r.photoKey);
    if (b) u = URL.createObjectURL(b);
    else u = this.stage.photo(r.picks, 320).toDataURL('image/webp', 0.85);
    this.photoUrls.set(r.photoKey, u);
    return u;
  }

  async openLibrary() {
    if (!this.owner) return;
    const ev = EVENT ? this.owner.ev : undefined;
    const pick = await UI.library(this.owner, this.records, (r) => this.photoUrl(r), (id) => CUSX.get(id),
      ev ? `${this.owner.name}의 ${ev.runNo}번째 판 도감` : undefined, ev ? ev.done : undefined);
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
        // 학생 이름은 빼고 숫자와 라면 이름만 모아요
        const all: RamenRecord[] = [];
        let done = 0;
        for (const ow of owners) { const rs = await db.records(ow.id); all.push(...rs); if (rs.length >= ROUNDS) done++; }
        const st = classStats(owners.length, all, done, (r) => CUSX.get(r.customerId)?.needs.effect);
        return { stats: st, text: all.length ? await ai.summary(st) : null };
      },
      onSave: (url, q, aiOn, aiUrl) => {
        this.teacher = { tinkerbell: url || undefined, quality: q as TeacherSettings['quality'], ai: aiOn, aiUrl: aiUrl || undefined };
        ai.configure(this.teacher.aiUrl, aiOn);
        db.saveTeacher(this.teacher);
        if (q !== 'auto') { const t = q as Tier; this.wcr.setTier(TIERS[t]); PHYS.iters = t === 'low' ? 6 : t === 'mid' ? 8 : 10; }
        toast('저장했어요');
      },
      onDelete: async (ow) => { await db.deleteOwner(ow.id); toast(`${ow.name} 사장님 기록을 지웠어요`); },
    });
  }
}

export { ING };
