import { AI_URL, ROUNDS, TEACHER_PIN, TINKERBELL_URL } from './config';
import { ai, classStats } from './ai/solar';
import { eulReul } from './core/korean';
import { hashStr, uid } from './core/rng';
import { resumeAudio, setSound, setTts, sfx, speak, suspendAudio, ttsEnabled, unlockAudio, soundOn } from './core/sound';
import { updateTweens, wait } from './core/tween';
import { CUS, CUSTOMERS, TUTORIAL } from './data/customers';
import { ING, INGREDIENTS } from './data/ingredients';
import { TUTOR_INTRO } from './data/text';
import type { Customer, Owner, Picks, RamenRecord, Step } from './data/types';
import { customerForRound, makeOrder } from './game/schedule';
import { hasHeart, score } from './game/scoring';
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
    {
      UI.clearAll();
      this.stage.setView('wide', 0);
      await UI.title(() => this.openTeacher());
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
      const o: Owner = { id, number: r.create.number, name: r.create.name, round: 0, order: makeOrder(CUSTOMERS, hashStr(id) ^ Date.now()), tutorialDone: false, createdAt: Date.now() };
      owners.push(o);
      await db.saveOwners(owners);
      this.owner = o;
    }
    this.records = await db.records(this.owner!.id);
    this.drawHud(null);
  }

  // 손님 목록이 바뀐 뒤에도 예전 학생 기록이 멈추지 않게: 없어진 손님은 빼고 새 손님은 뒤에 붙여요
  private fixOrder(o: Owner) {
    const known = new Set(CUSTOMERS.map((c) => c.id));
    const kept = o.order.filter((id) => known.has(id));
    const add = CUSTOMERS.map((c) => c.id).filter((id) => !kept.includes(id));
    if (kept.length !== o.order.length || add.length) { o.order = [...kept, ...add]; this.saveOwner(); }
  }

  private async counts(owners: Owner[]) {
    const m = new Map<string, number>();
    for (const o of owners) m.set(o.id, (await db.records(o.id)).length);
    return m;
  }

  private async saveOwner() {
    const owners = await db.owners();
    const i = owners.findIndex((o) => o.id === this.owner!.id);
    if (i >= 0) owners[i] = this.owner!; else owners.push(this.owner!);
    await db.saveOwners(owners);
  }

  private drawHud(round: number | null) {
    if (!this.owner) return;
    UI.hud({
      owner: this.owner, count: this.records.length, round, sound: soundOn(), tts: ttsEnabled(),
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
    const c: Customer = tutorial ? TUTORIAL : CUS.get(customerForRound(o.order, o.round, CUSTOMERS, hashStr(o.id)))!;
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
    const story = c.story;
    await UI.dialog(c, story, { onLine: (i, w) => say(i, w, story), final: { label: '라면 끓이러 가기!', replay: true } });
    this.stage.talk(0, false);
    let attempt = 0;
    let picks: Picks = JSON.parse(JSON.stringify(EMPTY));
    let rec: RamenRecord | null = null;
    let saved = false;
    for (;;) {
      this.memo(c, say);
      await this.stage.setView('pot', 0.9);
      this.stage.showPaws(true);
      this.stage.restorePot(picks);
      picks = await this.cook(c, picks, tutorial);
      // 메모에서 다시 듣던 이야기가 남아 있으면 닫아요 (내어 줄 때 손님 반응과 겹치지 않게)
      document.querySelectorAll('.dialog').forEach((d) => d.remove());
      window.speechSynthesis?.cancel();
      this.stage.talk(0, false);
      this.stage.showPaws(false);
      const name = await UI.naming(picks, c, tutorial, (n) => ai.kind(n));
      document.querySelector('.memo')?.remove();
      const r = score(c, picks);
      const heart = hasHeart(c, name);
      // 내어 주고 먹는 동안 AI 손님 한마디를 미리 받아 둬요 (못 받으면 원래 대사만)
      const aiLine = tutorial ? Promise.resolve(null) : ai.react(c, picks, name, r.stars);
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
      await UI.reaction(c, r.stars, heart, (i, w) => say(i, w, lines), lines);
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
      if (!tutorial && choice === 'skip') {
        // 손님은 다음 차례로 넘어가지만, 기록과 사진은 남기지 않아요
        o.round++;
        await this.saveOwner();
        toast('이번 라면은 도감에 넣지 않았어요');
      } else if (!tutorial) {
        saved = true;
        rec = { id: uid(), ownerId: o.id, round: o.round, customerId: c.id, picks, name, stars: r.stars, heart, photoKey: '', createdAt: Date.now() };
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
    const c = i < 0 ? TUTORIAL : CUSTOMERS[i];
    this.stage.showInstant(c);
    this.stage.mood(mood);
    return c.name;
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
    const pick = await UI.library(this.owner, this.records, (r) => this.photoUrl(r), (id) => CUS.get(id));
    if (!pick) return;
    const url = await this.photoUrl(pick);
    const img = new Image();
    await new Promise((res) => { img.onload = res; img.onerror = res; img.src = url; });
    const cust = CUS.get(pick.customerId)!;
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
        const st = classStats(owners.length, all, done, (r) => CUS.get(r.customerId)?.needs.effect);
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
