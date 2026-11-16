import { CREDIT, ROUNDS } from '../config';
import { eulReul } from '../core/korean';
import { sfx } from '../core/sound';
import { FAMILY, FX } from '../data/effects';
import { AMOUNTS, ING, INGREDIENTS, STEPS } from '../data/ingredients';
import { TUTOR_STEP } from '../data/text';
import type { Amount, Customer, Ingredient, Owner, Picks, RamenRecord, Step } from '../data/types';
import { buildName, isBad, MAX_NAME, TEMPLATES, wordPools, type Template } from '../game/naming';
import type { ClassStats } from '../ai/solar';
import type { ScoreResult } from '../game/scoring';
import { pickedList } from '../game/scoring';
import { drawCard, methodLines } from '../share/card';
import { openTinkerbell, saveCard, savePhoto } from '../share/tinkerbell';
import { clues, confetti, h, ICON, iconBtn, longPress, richText, toast } from './dom';

const root = () => document.getElementById('ui')!;
export interface AiInfo { on: boolean; check: () => Promise<'ok' | 'nokey' | 'fail'> }
// 업스테이지 AI가 쓰이는 네 곳 (첫 화면 띠와 안내 창에 같이 써요)
const AI_USES = [
  { icon: '🍜', short: '손님 맞춤 한마디', title: '손님 맞춤 한마디', where: '손님이 라면을 다 먹은 뒤', model: 'Solar Pro 4',
    desc: '손님이 내가 지은 라면 이름이나 넣은 재료를 콕 집어서 한마디를 더 해 줘요. 같은 손님이라도 사장님마다 다른 말을 들어요.' },
  { icon: '💡', short: '생각 도우미', title: '고른 까닭 생각 도우미', where: '레시피 카드 만들기', model: 'Solar Pro 4',
    desc: '대표 라면을 고른 까닭을 쓸 때, 글을 대신 써 주지 않고 더 생각해 볼 수 있는 질문을 하나 건네요.' },
  { icon: '🌱', short: '고운 말 검사', title: '고운 말 검사', where: '라면 이름 짓기', model: 'Solar Pro 4',
    desc: '직접 지은 라면 이름이 손님 마음을 다치게 하지 않는지 한 번 더 살피고, 고칠 점을 부드럽게 알려 줘요.' },
  { icon: '📊', short: '우리 반 요약', title: '우리 반 요약', where: '선생님 화면', model: 'Solar Pro 4',
    desc: '우리 반이 끓인 라면 기록(별, 하트 도장, 많이 맞힌 마음)을 숫자와 짧은 글로 정리해 수업 기록에 보탬이 돼요.' },
];
// 별 두 개일 때: 무엇이 모자랐는지 콕 집어 알려 줘요
const starHint = (r: ScoreResult, fxName: string, famName: string, subName: string) =>
  !r.exact ? `💡 '${fxName}' 마음이 담긴 재료를 하나 넣어 보세요. 별 세 개에 가까워져요!`
    : r.match < 3 ? `💡 ${famName} 묶음 재료를 ${3 - r.match}가지 더 넣으면 별 세 개!`
      : `💡 ${subName} 묶음 재료를 함께 넣으면 별 세 개!`;
const mount = <T extends HTMLElement>(el: T) => { root().appendChild(el); return el; };
const heartImg = () => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#E86B7F';
  g.beginPath(); g.moveTo(64, 108); g.bezierCurveTo(8, 72, 16, 18, 64, 40); g.bezierCurveTo(112, 18, 120, 72, 64, 108); g.fill();
  g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.ellipse(42, 48, 10, 6, -0.6, 0, 6.28); g.fill();
  return c.toDataURL();
};
let HEART = '';
const heart = (cls = '') => { if (!HEART) HEART = heartImg(); return h('img', { src: HEART, class: cls, alt: '하트 도장' }); };
const famDot = (effect: string) => { const f = FAMILY.get(FX.get(effect)!.family)!; return h('i', { style: `background:${f.color}` }); };
export const fxChip = (effect: string) => {
  const f = FAMILY.get(FX.get(effect)!.family)!;
  return h('span', { class: 'fxchip', style: `background:${f.soft}` }, h('span', { class: 'dot', style: `background:${f.color}` }), effect);
};
const speakerName = (c: Customer, line: string) => {
  if (Array.isArray(c.chibi) && c.name.includes('와 ')) {
    const [a, b] = c.name.split('와 ');
    return line.startsWith('@1 ') ? b : a;
  }
  return c.name;
};
const stripSpeaker = (l: string) => l.replace(/^@\d /, '');
const speakerIdx = (l: string) => (l.startsWith('@1 ') ? 1 : 0);

export interface Thumbs { get(id: string): string | undefined }

export const UI = {
  clear() { root().querySelectorAll(':scope > :not(.hud):not(.toast)').forEach((e) => e.remove()); },
  clearAll() { root().innerHTML = ''; },

  // ── 제목 ───────────────────────────────
  title(onTeacher: () => void, ai?: AiInfo): Promise<void> {
    return new Promise((res) => {
      const logo = h('div', { class: 'logo pop-in' },
        h('div', { class: 'l1' }, '마음을 채워 주는'),
        h('div', { class: 'l2' }, '후루룩 친구라면 가게'),
        h('div', { class: 'l3' }, '손님 이야기를 듣고, 꼭 맞는 라면을 끓여 주세요'));
      longPress(logo, 2000, () => { sfx.tap(); onTeacher(); });
      // 업스테이지 AI가 어디에 쓰였는지 첫 화면에서 바로 보여요 (누르면 자세히)
      const aiStrip = ai ? h('button', { class: 'ai-strip fade-in', onclick: () => { sfx.tap(); UI.aiInfo(ai); } },
        h('span', { class: 'ai-badge' }, h('span', { class: 'spark' }, '✦'), 'Upstage Solar AI'),
        h('span', { class: 'ai-feats' }, AI_USES.map((u) => h('span', { class: 'ai-chip' }, u.icon + ' ' + u.short))),
        h('span', { class: 'ai-more' }, '어떻게 쓰였나요? ›')) : null;
      const el = mount(h('div', { class: 'scr-title' }, logo,
        h('button', { class: 'btn big pulse', onclick: () => { sfx.pop(); el.remove(); res(); } }, '가게 문 열기'), aiStrip,
        h('div', { class: 'credit' }, `만든이 ${CREDIT.name}`, h('span', { class: 'sep' }, '·'), `문의 ${CREDIT.contact}`)));
    });
  },

  // ── 업스테이지 AI 활용 안내 ───────────────────
  aiInfo(ai: AiInfo): Promise<void> {
    return new Promise((res) => {
      const wrap = h('div', { class: 'modal-wrap fade-in' });
      const state = h('div', { class: 'ai-state' }, h('i', { class: 'dot wait' }), ai.on ? 'AI 연결을 확인하는 중…' : '선생님이 AI를 꺼 두었어요. 지금은 AI 없이 돌아가요.');
      if (ai.on) ai.check().then((r) => {
        state.innerHTML = '';
        const [cls, msg] = r === 'ok' ? ['ok', 'AI가 연결돼 있어요'] : r === 'nokey' ? ['wait', '중계 서버는 켜져 있지만 아직 AI 키가 없어요'] : ['off', '지금은 인터넷이 닿지 않아 AI 없이 돌아가요'];
        state.append(h('i', { class: `dot ${cls}` }), msg);
      });
      const close = () => { sfx.back(); wrap.remove(); res(); };
      wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
      wrap.appendChild(h('div', { class: 'modal card pop-in ai-info' },
        h('div', { class: 'ai-head' },
          h('span', { class: 'ai-badge' }, h('span', { class: 'spark' }, '✦'), 'Upstage Solar AI'),
          h('h2', null, '업스테이지 AI는 이렇게 쓰여요'),
          h('p', { class: 'sub' }, '한국어를 잘하는 업스테이지의 Solar Pro 4 모델이 네 군데에서 사장님과 선생님을 도와요.'),
          state),
        h('div', { class: 'ai-grid' }, AI_USES.map((u) => h('div', { class: 'ai-card' },
          h('div', { class: 'ai-ic' }, u.icon),
          h('div', null,
            h('h3', null, u.title),
            h('p', null, u.desc),
            h('div', { class: 'ai-meta' }, h('span', null, '📍 ' + u.where), h('span', null, u.model)))))),
        h('div', { class: 'ai-flow' },
          h('span', null, '📱 태블릿'), h('b', null, '→'), h('span', null, '🔒 중계 서버 (버셀)'), h('b', null, '→'), h('span', null, '✦ 업스테이지 Solar')),
        h('div', { class: 'ai-safe' },
          h('h3', null, '이렇게 지켜요'),
          h('ul', null,
            h('li', null, '학생 이름과 번호는 보내지 않아요. 라면 이름, 넣은 재료, 고른 까닭 글만 보내요.'),
            h('li', null, 'AI 키는 태블릿이 아닌 중계 서버에만 있어서 밖으로 드러나지 않아요.'),
            h('li', null, '정해진 네 가지 일만 부탁할 수 있고, 중계 서버는 주고받은 글을 저장하지 않아요.'),
            h('li', null, 'AI는 글을 대신 써 주지 않아요. 생각을 넓히는 질문만 건네요.'),
            h('li', null, '인터넷이 끊기거나 답이 늦으면 AI 없이 원래 게임대로 이어져요.'))),
        h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: close }, '알겠어요'))));
      mount(wrap);
    });
  },

  // ── 사장님 고르기 ───────────────────────────
  owners(list: Owner[], counts: Map<string, number>): Promise<{ owner?: Owner; create?: { number: number; name: string } }> {
    return new Promise((res) => {
      const wrap = h('div', { class: 'modal-wrap fade-in' });
      const box = h('div', { class: 'modal card pop-in' });
      wrap.appendChild(box);
      const showList = () => {
        box.innerHTML = '';
        box.append(
          h('h2', null, '오늘의 사장님은 누구인가요?'),
          h('p', { class: 'sub' }, list.length ? '내 이름을 눌러 가게를 이어서 열어요.' : '처음 오셨네요! 사장님 등록부터 해요.'),
          h('div', { class: 'owner-grid' },
            list.slice().sort((a, b) => a.number - b.number).map((o) => h('button', { class: 'owner', onclick: () => { sfx.pop(); wrap.remove(); res({ owner: o }); } },
              h('span', { class: 'no' }, `${o.number}번`), h('span', { class: 'nm' }, o.name), h('span', { class: 'ct' }, `${counts.get(o.id) ?? 0}그릇 끓였어요`))),
            h('button', { class: 'owner add', onclick: () => { sfx.tap(); showForm(); } }, '＋ 새 사장님 등록')));
      };
      const showForm = () => {
        let num = 0;
        box.innerHTML = '';
        const name = h('input', { class: 'inp', maxLength: 8, placeholder: '이름', style: 'flex:1;min-width:200px' }) as HTMLInputElement;
        const pad = h('div', { class: 'numpad' });
        const ok = h('button', { class: 'btn', disabled: true, onclick: () => {
          const n = name.value.trim();
          if (!num || !n) return;
          if (list.some((o) => o.number === num && o.name === n)) { toast('이미 등록된 사장님이에요. 목록에서 골라 주세요.'); return; }
          sfx.pop(); wrap.remove(); res({ create: { number: num, name: n } });
        } }, '가게 열기');
        const check = () => { (ok as HTMLButtonElement).disabled = !(num && name.value.trim()); };
        name.addEventListener('input', check);
        for (let i = 1; i <= 30; i++) {
          const b = h('button', { onclick: () => { sfx.tap(); num = i; pad.querySelectorAll('button').forEach((x) => x.classList.remove('on')); b.classList.add('on'); check(); } }, String(i));
          pad.appendChild(b);
        }
        box.append(h('h2', null, '새 사장님 등록'), h('p', { class: 'sub' }, '번호와 이름을 알려 주세요. 이 태블릿에만 저장돼요.'),
          h('div', { class: 'form-row' }, h('label', null, '번호'), pad),
          h('div', { class: 'form-row' }, h('label', null, '이름'), name),
          h('div', { class: 'actions' }, list.length ? h('button', { class: 'btn ghost', onclick: () => { sfx.back(); showList(); } }, '뒤로') : null, ok));
      };
      list.length ? showList() : showForm();
      mount(wrap);
    });
  },

  // ── 상단 바 ───────────────────────────────
  hud(o: { owner: Owner; count: number; round: number | null; sound: boolean; tts: boolean; onLib: () => void; onSound: () => void; onTts: () => void; onHome: () => void }) {
    root().querySelector('.hud')?.remove();
    const pct = Math.min(100, (o.count / ROUNDS) * 100);
    const el = h('div', { class: 'hud' },
      h('span', { class: 'chip owner-chip' }, `${o.owner.number}번 ${o.owner.name} 사장님`),
      o.round !== null ? h('span', { class: 'chip round' }, o.round === 0 ? '연습 손님' : `${o.round}번째 손님`) : null,
      h('span', { class: 'grow' }),
      h('button', { class: 'chip prog', onclick: () => { sfx.tap(); o.onLib(); } }, h('span', { html: ICON.book, style: 'width:24px;height:24px;display:inline-block' }), '도감',
        h('span', { class: 'bar' }, h('i', { style: `width:${pct}%` })), `${Math.min(o.count, ROUNDS)}/${ROUNDS}`),
      iconBtn(o.sound ? ICON.sound : ICON.mute, () => { o.onSound(); }, '소리', o.sound ? '' : 'off'),
      iconBtn(ICON.read, () => { o.onTts(); }, '읽어 주기', o.tts ? '' : 'off'),
      iconBtn(ICON.home, () => { sfx.back(); o.onHome(); }, '처음으로'));
    root().prepend(el);
    return el;
  },
  hideHud() { root().querySelector('.hud')?.remove(); },

  // ── 손님 이야기 ─────────────────────────────
  dialog(c: Customer, lines: string[], o: { onLine?: (i: number, who: number) => void; onEnd?: () => void; final?: { label: string; replay?: boolean }; extra?: HTMLElement | null }): Promise<'go'> {
    return new Promise((res) => {
      let i = 0;
      const who = h('span', { class: 'who' });
      const text = h('div', { class: 'text' });
      const next = h('span', { class: 'next' }, '▼');
      const btns = h('div', { class: 'btns' });
      const box = h('div', { class: 'dialog card slide-up' }, o.extra ?? null, who, text, next, btns);
      const show = () => {
        const l = lines[i];
        who.textContent = speakerName(c, l);
        who.classList.toggle('two', speakerIdx(l) === 1);
        text.innerHTML = '';
        text.append(...richText(stripSpeaker(l)));
        text.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'ease-out' });
        o.onLine?.(i, speakerIdx(l));
        const last = i === lines.length - 1;
        next.style.display = last ? 'none' : '';
        btns.innerHTML = '';
        if (last && o.final) {
          // ▼를 빠르게 두 번 누르면 방금 나온 버튼까지 눌리지 않게 잠깐 막아요
          btns.style.pointerEvents = 'none';
          setTimeout(() => { btns.style.pointerEvents = ''; }, 400);
          if (o.final.replay) btns.append(h('button', { class: 'btn ghost small', onclick: (e: Event) => { e.stopPropagation(); sfx.tap(); i = 0; show(); } }, '다시 듣기'));
          btns.append(h('button', { class: 'btn', onclick: (e: Event) => { e.stopPropagation(); sfx.pop(); o.onEnd?.(); box.remove(); res('go'); } }, o.final.label));
        }
      };
      box.addEventListener('click', () => {
        if (i < lines.length - 1) { sfx.tap(); i++; show(); }
        else if (!o.final) { o.onEnd?.(); box.remove(); res('go'); }
      });
      mount(box);
      show();
    });
  },

  memo(c: Customer, onReplay: () => void, open = false) {
    root().querySelector('.memo')?.remove();
    const cl = clues(c.story);
    const el = h('div', { class: `memo card fade-in ${open ? 'open' : ''}` });
    const head = h('button', { class: 't', onclick: () => { sfx.tap(); el.classList.toggle('open'); } }, `📝 ${c.name}의 이야기`, h('span', { class: 'arrow' }, '▾'));
    el.append(head, h('div', { class: 'body' },
      h('div', { class: 'cl' }, cl.map((x) => h('span', null, x))),
      h('button', { class: 'btn soft small replay', onclick: () => { sfx.tap(); onReplay(); } }, '🔁 이야기 다시 듣기')));
    return mount(el);
  },

  // ── 라면 끓이기 ─────────────────────────────
  cook(o: {
    thumbs: Thumbs; start: Picks; tutorial: boolean; hints?: Partial<Record<Step, string[]>>;
    onAdd: (ing: Ingredient, picks: Picks) => Promise<void>; onRemove: (picks: Picks) => void; onStep?: (s: Step) => void;
  }): Promise<Picks> {
    return new Promise((res) => {
      const picks: Picks = JSON.parse(JSON.stringify(o.start));
      let step = 0, busy = false;
      document.body.classList.add('cooking');
      const panel = h('div', { class: 'cook slide-up' });
      const info = h('div', { class: 'info card fade-in' });
      const guide = o.tutorial ? h('div', { class: 'guide card pop-in' }) : null;
      const count = (s: Step) => (s === 'topping' ? picks.toppings.length : s === 'finish' ? picks.finish.length : picks[s] ? 1 : 0);
      const ok = (s: Step) => count(s) >= STEPS.find((x) => x.id === s)!.min;
      const isOn = (ing: Ingredient) => ing.step === 'topping' ? picks.toppings.includes(ing.id) : ing.step === 'finish' ? picks.finish.some((f) => f.id === ing.id) : picks[ing.step as 'broth' | 'noodle' | 'soup'] === ing.id;

      const showInfo = (ing: Ingredient | null) => {
        info.innerHTML = '';
        if (!ing) {
          const st = STEPS[step];
          info.append(h('div', { class: 'row' }, h('span', { class: 'nm' }, `${st.name} 고르기`), st.min === 0 ? h('span', { class: 'opt' }, '안 넣어도 돼요') : null), h('div', { class: 'note' }, st.hint + ' 카드를 누르면 냄비에 쏙 들어가고, 한 번 더 누르면 빠져요.'));
          return;
        }
        info.append(h('div', { class: 'row' }, h('span', { class: 'nm' }, ing.name), h('span', { class: 'fx' }, ing.effects.map(fxChip))), h('div', { class: 'note' }, ing.note, ing.tag ? h('span', { class: 'tag' }, ing.tag) : ''));
        info.animate([{ transform: 'scale(.97)' }, { transform: 'scale(1)' }], { duration: 180 });
      };

      const finish = () => {
        panel.remove(); info.remove(); guide?.remove();
        document.body.classList.remove('cooking');
        res(picks);
      };

      const render = () => {
        const st = STEPS[step];
        o.onStep?.(st.id);
        if (guide) { guide.innerHTML = ''; guide.append(h('div', { class: 't' }, '👴 백발 할아버지'), h('div', { class: 'x' }, TUTOR_STEP[st.id])); }
        panel.innerHTML = '';
        const tabs = h('div', { class: 'tabs' }, STEPS.map((s, k) => {
          const n = s.max > 1 ? `${count(s.id)}/${s.max}` : '';
          const done = count(s.id) > 0;
          return h('button', { class: `tab ${k === step ? 'on' : ''} ${done ? 'done' : ''}`, onclick: () => { sfx.tap(); step = k; showInfo(null); render(); } },
            done ? '✓ ' : '', s.name, s.min === 0 && !done ? h('span', { class: 'n' }, '선택') : n ? h('span', { class: 'n' }, n) : null);
        }));
        const allOk = STEPS.every((s) => ok(s.id));
        const last = step === STEPS.length - 1;
        const label = last ? (picks.finish.length ? '이름 짓기 ▶' : '마무리 없이 이름 짓기 ▶') : st.min === 0 && !count(st.id) ? `건너뛰기 ▶` : `다음: ${STEPS[step + 1].name} ▶`;
        const nextBtn = h('button', {
          class: `btn next ${allOk && last ? 'pulse' : ''}`,
          disabled: last ? !allOk : !ok(st.id),
          onclick: () => {
            if (busy && last) return; // 재료가 냄비에 들어가는 중에는 끝내지 않아요
            sfx.pop();
            if (!last) { step++; showInfo(null); render(); return; }
            const miss = STEPS.findIndex((s) => !ok(s.id));
            if (miss >= 0) { step = miss; showInfo(null); render(); toast(`${eulReul(STEPS[miss].name)} 아직 안 골랐어요`); return; }
            finish();
          },
        }, label);
        const items = INGREDIENTS.filter((i) => i.step === st.id);
        const hintIds = new Set(o.hints?.[st.id] ?? []);
        const cards = h('div', { class: 'cards' }, items.map((ing) => h('button', {
          class: `icard ${isOn(ing) ? 'on' : ''} ${hintIds.has(ing.id) && !isOn(ing) ? 'hint' : ''}`,
          onclick: () => tap(ing),
        }, h('img', { src: o.thumbs.get(ing.id) ?? '', alt: '' }), h('div', { class: 'nm' }, ing.name), h('div', { class: 'dots' }, ing.effects.map(famDot)))));
        const amounts = st.id === 'finish' && picks.finish.length ? h('div', { class: 'amounts' }, picks.finish.map((f) => h('div', { class: 'amtrow' },
          h('span', { class: 'lbl' }, ING.get(f.id)!.name),
          AMOUNTS.map((a) => h('button', { class: `amt ${f.amount === a ? 'on' : ''}`, onclick: () => { if (busy) return; sfx.tap(); f.amount = a as Amount; o.onRemove(JSON.parse(JSON.stringify(picks))); render(); } }, a))))) : null;
        panel.append(h('div', { class: 'cook-top' }, tabs, nextBtn), cards, amounts ?? '');
        document.documentElement.style.setProperty('--cookH', panel.offsetHeight + 'px');
      };

      const tap = async (ing: Ingredient) => {
        if (busy) return;
        showInfo(ing);
        const s = ing.step;
        if (isOn(ing)) { remove(ing); return; }
        if (s === 'topping' || s === 'finish') {
          const n = s === 'topping' ? picks.toppings.length : picks.finish.length;
          if (n >= (s === 'topping' ? 3 : 2)) { sfx.back(); toast(s === 'topping' ? '건더기는 세 가지까지 넣을 수 있어요. 빼고 싶은 건더기를 한 번 더 눌러요.' : '마무리는 두 가지까지예요. 빼고 싶은 것을 한 번 더 눌러요.'); return; }
          if (s === 'topping') picks.toppings.push(ing.id); else picks.finish.push({ id: ing.id, amount: '한 숟가락' });
        } else picks[s] = ing.id;
        sfx.pop();
        busy = true; panel.classList.add('busy');
        render();
        try { await o.onAdd(ing, JSON.parse(JSON.stringify(picks))); } finally { busy = false; panel.classList.remove('busy'); }
      };
      const remove = (ing: Ingredient) => {
        if (busy) return;
        if (ing.step === 'topping') picks.toppings = picks.toppings.filter((x) => x !== ing.id);
        else if (ing.step === 'finish') picks.finish = picks.finish.filter((f) => f.id !== ing.id);
        else picks[ing.step as 'broth' | 'noodle' | 'soup'] = null;
        o.onRemove(JSON.parse(JSON.stringify(picks)));
        render();
      };
      mount(panel); mount(info); if (guide) mount(guide);
      showInfo(null);
      render();
    });
  },

  // ── 이름 짓기 ─────────────────────────────
  naming(picks: Picks, c: Customer, tutorial: boolean, check?: (name: string) => Promise<{ ok: boolean; why: string } | null>): Promise<string> {
    return new Promise((res) => {
      const pools = wordPools(picks);
      let tpl: Template = 'blow', a = '', b = '';
      const sheet = h('div', { class: 'name-sheet card slide-up' });
      const input = h('input', { class: 'inp', maxLength: MAX_NAME, placeholder: '라면 이름' }) as HTMLInputElement;
      const cnt = h('span', { class: 'cnt' });
      const warn = h('div', { class: 'name-warn' });
      let checking = false;
      const OK_LABEL = '이 이름으로 내어 주기!';
      const ok = h('button', { class: 'btn big', onclick: async () => {
        const v = input.value.trim();
        if (checking || !valid()) return;
        // 낱말 카드로만 지은 이름은 이미 고운 말이라 바로 내어 줘요. 직접 쓴 이름은 AI에게 한 번 더 물어봐요
        if (check && v !== buildName(tpl, a, b)) {
          checking = true; ok.disabled = true; ok.textContent = '이름을 살펴보는 중…';
          const r = await check(v);
          checking = false; ok.textContent = OK_LABEL;
          if (!sheet.isConnected) return;
          if (r && !r.ok) {
            sfx.back();
            warn.textContent = r.why || '손님이 들으면 속상할 수 있어요. 다른 이름을 지어 볼까요?';
            ok.disabled = true; // 이름을 고치면 다시 눌러져요
            return;
          }
          if (input.value.trim() !== v) { valid(); return; } // 살펴보는 사이에 고쳤으면 다시 눌러요
        }
        sfx.pop(); sheet.remove(); res(v);
      } }, OK_LABEL) as HTMLButtonElement;
      const valid = () => {
        const v = input.value.trim();
        cnt.textContent = `${[...v].length}/${MAX_NAME}`;
        if (!v) { warn.textContent = ''; ok.disabled = true; return false; }
        if (isBad(v)) { warn.textContent = '고운 말로 지어 주세요. 손님이 들으면 속상할 수 있어요.'; ok.disabled = true; return false; }
        warn.textContent = ''; ok.disabled = false; return true;
      };
      input.addEventListener('input', valid);
      const wordRow = (label: string, words: string[], rec: Set<string>, cur: string, set: (w: string) => void) =>
        h('div', { class: 'words' }, h('span', { class: 'lbl' }, label), words.map((w) => h('button', { class: `word ${rec.has(w) ? 'rec' : ''} ${cur === w ? 'on' : ''}`, onclick: () => { sfx.tap(); set(w); upd(); render(); } }, w)));
      const upd = () => { const n = buildName(tpl, a, b); if (n) input.value = n; valid(); };
      const render = () => {
        sheet.innerHTML = '';
        sheet.append(h('div', null,
          h('h2', null, '라면 이름 짓기'),
          h('div', { class: 'muted', style: 'font-size:17px;margin-top:4px' }, tutorial ? TUTOR_STEP.name : `${c.name}에게 어떤 마음을 주는 라면인가요? ★ 표시는 넣은 재료와 어울리는 낱말이에요.`),
          h('div', { class: 'tpls' }, TEMPLATES.map((t) => h('button', { class: `tpl ${tpl === t.id ? 'on' : ''}`, onclick: () => { sfx.tap(); tpl = t.id; a = ''; b = ''; if (t.id === 'free') input.value = ''; render(); valid(); if (t.id === 'free') input.focus(); } }, t.label))),
          tpl === 'blow' ? [wordRow('무엇을', pools.front, pools.rec.front, a, (w) => { a = w; }), wordRow('어떻게', pools.verb, pools.rec.verb, b, (w) => { b = w; })] : null,
          tpl === 'heart' ? wordRow('마음이 어떻게', pools.adj, pools.rec.adj, a, (w) => { a = w; }) : null,
          tpl === 'spring' ? wordRow('무엇이 샘솟을까', pools.spring, pools.rec.spring, a, (w) => { a = w; }) : null,
          tpl === 'free' ? h('div', { class: 'muted', style: 'font-size:17px;margin:8px 0' }, '아래 칸에 직접 써요. 20글자까지 쓸 수 있어요.') : null,
          h('div', { class: 'name-preview' }, input, cnt),
          warn,
          h('div', { class: 'actions' }, ok)));
      };
      render(); valid();
      mount(sheet);
    });
  },

  fastButton(onToggle: (on: boolean) => void) {
    let on = false;
    const b = h('button', { class: 'fast chip', onclick: () => { on = !on; b.classList.toggle('on', on); b.textContent = on ? '⏩ 빨리 보는 중' : '⏩ 빨리 보기'; onToggle(on); } }, '⏩ 빨리 보기');
    return mount(b);
  },

  yum(text = '후루룩!') {
    const y = mount(h('div', { class: 'yum' }, text));
    setTimeout(() => y.remove(), 1500);
  },

  // ── 손님 반응 ─────────────────────────────
  reaction(c: Customer, stars: number, heartOn: boolean, onLine: (i: number, who: number) => void, lines?: string[]): Promise<void> {
    const starRow = h('div', { class: 'stars' }, [0, 1, 2].map(() => h('span', null, '★')));
    const extra = h('div', null, starRow, heartOn ? heart('stamp') : null);
    setTimeout(() => starRow.querySelectorAll('span').forEach((s, i) => { if (i < stars) setTimeout(() => { s.classList.add('on'); sfx.star(i); }, i * 380); }), 200);
    if (heartOn) setTimeout(() => sfx.heart(), 200 + stars * 380 + 200);
    if (stars === 3) setTimeout(() => { sfx.fanfare(); confetti(); }, 200 + 3 * 380);
    else setTimeout(() => sfx.soft(), 200 + stars * 380);
    return UI.dialog(c, lines ?? c.reactions[stars as 1 | 2 | 3], { onLine, final: { label: '마음 쪽지 보기' }, extra }).then(() => {});
  },

  // ── 마음 쪽지 ─────────────────────────────
  note(c: Customer, picks: Picks, r: ScoreResult, heartOn: boolean, canRetry: boolean, tutorial: boolean): Promise<'retry' | 'save' | 'skip'> {
    return new Promise((res) => {
      const fx = FX.get(c.needs.effect)!, fam = FAMILY.get(fx.family)!, sub = FAMILY.get(c.needs.sub)!;
      const wrap = h('div', { class: 'modal-wrap fade-in' });
      const close = (v: 'retry' | 'save' | 'skip') => { sfx.pop(); wrap.remove(); res(v); };
      // 도감에 넣지 않기는 잘못 누르지 않게 한 번 더 눌러야 해요
      // (빠른 연타로 두 번 눌리지 않게 0.5초는 기다리고, 5초 지나면 처음으로 돌아가요)
      let sure = 0, sureT = 0;
      const skip = h('button', { class: 'btn ghost', onclick: () => {
        const now = performance.now();
        if (!sure) {
          sure = now; sfx.tap(); skip.textContent = '정말 넣지 않을래요'; skip.classList.add('warn');
          sureT = window.setTimeout(() => { sure = 0; skip.textContent = '도감에 넣지 않기'; skip.classList.remove('warn'); }, 5000);
          return;
        }
        if (now - sure < 500) return;
        clearTimeout(sureT); close('skip');
      } }, '도감에 넣지 않기');
      const box = h('div', { class: 'heartnote card pop-in' },
        h('h2', null, '💌 마음 쪽지'),
        h('div', { class: 'muted', style: 'font-size:18px' }, `${c.name}에게 꼭 필요했던 마음은…`),
        h('div', { class: 'need', style: `background:${fam.soft}` },
          h('span', { class: 'dot', style: `width:22px;height:22px;border-radius:50%;background:${fam.color}` }),
          h('span', { class: 'big' }, fx.name), h('span', { class: 'fam' }, `${fam.name} 묶음 · ${fx.when}`)),
        h('div', { class: 'tip' }, fx.tip),
        h('div', { class: 'sub' }, '더하면 좋은 마음: ', h('b', { style: `color:${sub.color}` }, `${sub.name} 묶음`)),
        h('div', { class: 'ings' }, pickedList(picks).map((ing) => h('span', { class: `ing ${r.glow.get(ing.id) ?? ''}` }, ing.effects.map(famDot).slice(0, 1), ing.name))),
        h('div', { class: 'legend' }, `노란 테두리는 꼭 필요한 마음(${fam.name})과 맞은 재료, 연한 테두리는 더하면 좋은 마음(${sub.name})과 맞은 재료예요.`),
        r.stars < 3 ? h('div', { class: 'heartline' }, r.stars === 1 ? `💡 ${fam.name} 묶음 재료를 더 넣어 보면 어떨까요? 특히 '${fx.name}' 마음이 담긴 재료를 찾아봐요.` : starHint(r, fx.name, fam.name, sub.name)) : null,
        heartOn ? h('div', { class: 'heartline' }, '❤️ 라면 이름에 손님 마음 낱말이 들어 있어서 하트 도장을 받았어요!') : null,
        c.safetyNote ? h('div', { class: 'safety' }, '🙋 ', c.safetyNote) : null,
        tutorial ? h('div', { class: 'safety', style: 'background:#FFF6D6' }, '👴 ', TUTOR_STEP.note) : null,
        h('div', { class: 'actions' },
          canRetry ? h('button', { class: 'btn ghost', onclick: () => close('retry') }, '한 번 더 끓여 주기') : null,
          tutorial ? null : skip,
          h('button', { class: 'btn', onclick: () => close('save') }, tutorial ? '연습 끝! 가게 열기' : '도감에 담기')));
      wrap.appendChild(box);
      mount(wrap);
    });
  },

  between(o: { count: number; justTen: boolean; skipped?: boolean }): Promise<'next' | 'lib' | 'switch'> {
    return new Promise((res) => {
      const el = h('div', { class: 'between card slide-up' },
        h('h3', null, o.justTen ? `🎉 ${ROUNDS}그릇을 다 끓였어요!` : o.skipped ? `이번 라면은 도감에 넣지 않았어요 (도감 ${o.count}그릇)` : `${o.count}그릇째 라면을 끓였어요`),
        h('p', null, o.justTen ? '도감에서 대표 라면을 골라 레시피 카드를 만들고 띵커벨에 올려 보세요. 손님은 계속 받을 수 있어요.' : o.count >= ROUNDS ? '대표 라면 카드는 언제든 도감에서 만들 수 있어요.' : `${ROUNDS - o.count}그릇 더 끓이면 대표 라면 카드를 만들 수 있어요.`),
        h('div', { class: 'actions' },
          h('button', { class: 'btn ghost small', onclick: () => { sfx.tap(); el.remove(); res('switch'); } }, '사장님 바꾸기'),
          h('button', { class: `btn ${o.justTen ? 'pulse' : 'soft'}`, onclick: () => { sfx.tap(); el.remove(); res('lib'); } }, '도감 보기'),
          h('button', { class: 'btn', onclick: () => { sfx.pop(); el.remove(); res('next'); } }, '다음 손님 받기')));
      mount(el);
      if (o.justTen) confetti();
    });
  },

  // ── 도감 ───────────────────────────────
  library(owner: Owner, recs: RamenRecord[], photo: (r: RamenRecord) => Promise<string>, customer: (id: string) => Customer | undefined): Promise<RamenRecord | null> {
    return new Promise((res) => {
      let choosing = false, chosen: RamenRecord | null = null;
      const el = h('div', { class: 'lib fade-in' });
      const sorted = recs.slice().sort((a, b) => b.createdAt - a.createdAt);
      const imgs = new Map<string, HTMLImageElement>();
      const done = (v: RamenRecord | null) => { el.remove(); res(v); };
      // 라면 사진을 태블릿에 '라면이름.png'로 저장
      let saving = false;
      const savePic = async (r: RamenRecord, img: HTMLImageElement) => {
        if (saving) return;
        if (!img.src || !img.complete || !img.naturalWidth) { toast('사진을 불러오는 중이에요. 잠시 뒤에 다시 눌러 주세요'); return; }
        saving = true; sfx.pop();
        const ok = await savePhoto(img.src, r.name);
        saving = false;
        toast(ok ? `📷 '${r.name}' 사진을 태블릿 다운로드 폴더에 저장했어요` : '사진을 저장하지 못했어요. 다시 눌러 주세요');
      };
      const render = () => {
        el.innerHTML = '';
        el.classList.toggle('choose', choosing);
        const n = recs.length;
        const head = h('header', null,
          h('h2', null, choosing ? '대표 라면을 하나 골라요' : `${owner.name} 사장님의 라면 도감`),
          choosing
            ? [h('button', { class: 'btn ghost small', onclick: () => { sfx.back(); choosing = false; chosen = null; render(); } }, '취소'),
               h('button', { class: 'btn small', disabled: !chosen, onclick: () => { sfx.pop(); done(chosen); } }, '이 라면으로 카드 만들기')]
            : [h('button', { class: `btn small ${n >= ROUNDS ? 'pulse' : ''}`, disabled: n < ROUNDS, onclick: () => { sfx.pop(); choosing = true; render(); } }, '대표 라면 고르기'),
               iconBtn(ICON.close, () => { sfx.back(); done(null); }, '닫기')]);
        const bar = h('div', { class: 'bar10' }, `${Math.min(n, ROUNDS)}/${ROUNDS}그릇`, h('span', { class: 'bar' }, h('i', { style: `width:${Math.min(100, (n / ROUNDS) * 100)}%` })),
          h('span', { class: 'muted', style: 'font-size:17px' }, n >= ROUNDS ? (choosing ? '카드로 만들 라면을 눌러요' : `모두 ${n}그릇 · 대표 라면을 골라 띵커벨에 올려요`) : `${ROUNDS - n}그릇 더 끓이면 대표 라면을 고를 수 있어요`));
        const grid = h('div', { class: 'grid' });
        if (!sorted.length) grid.append(h('div', { class: 'empty-lib' }, '아직 끓인 라면이 없어요. 첫 손님을 맞이해 볼까요?'));
        for (const r of sorted) {
          let img = imgs.get(r.id);
          if (!img) { img = h('img', { alt: '' }) as HTMLImageElement; imgs.set(r.id, img); photo(r).then((u) => { img!.src = u; }); }
          const c = customer(r.customerId);
          const im = img;
          grid.append(h('div', { class: 'rwrap' },
            h('button', { class: `rcard ${chosen?.id === r.id ? 'pick' : ''}`, onclick: () => { sfx.tap(); if (choosing) { chosen = r; render(); } else detail(r, im); } },
              im, r.heart ? heart('hrt') : null,
              h('div', { class: 'nm' }, r.name),
              h('div', { class: 'meta' }, h('span', null, c?.name ?? ''), h('span', { class: 'st' }, '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars)))),
            choosing ? null : h('button', { class: 'rsave', 'aria-label': `${r.name} 사진 저장`, onclick: () => savePic(r, im) }, '📷 사진 저장')));
        }
        el.append(head, bar, grid);
      };
      const detail = (r: RamenRecord, im: HTMLImageElement) => {
        const src = im.src;
        const c = customer(r.customerId);
        const wrap = h('div', { class: 'modal-wrap fade-in', onclick: (e: Event) => { if (e.target === wrap) wrap.remove(); } });
        wrap.append(h('div', { class: 'modal card pop-in' },
          h('div', { style: 'display:flex;gap:16px;align-items:center;flex-wrap:wrap' },
            h('img', { src, style: 'width:180px;height:180px;border-radius:18px' }),
            h('div', { style: 'flex:1;min-width:220px' }, h('h2', null, r.name), h('div', { class: 'sub' }, `${c?.name ?? ''}에게 · ${'★'.repeat(r.stars)}${'☆'.repeat(3 - r.stars)}${r.heart ? ' · ❤️' : ''}`))),
          h('div', { class: 'steps' }, methodLines(r.picks).map((l, i) => h('div', null, h('b', null, `${i + 1}. `), l))),
          h('div', { class: 'actions' },
            h('button', { class: 'btn ghost', onclick: () => savePic(r, im) }, '📷 사진 저장'),
            h('button', { class: 'btn', onclick: () => { sfx.back(); wrap.remove(); } }, '닫기'))));
        el.append(wrap);
      };
      render();
      mount(el);
    });
  },

  // ── 레시피 카드 만들고 띵커벨에 올리기 ──────────────────
  maker(o: { rec: RamenRecord; customer: Customer; photo: HTMLImageElement | null; author: string; tinkerbell: string; hint?: (reason: string) => Promise<string | null> }): Promise<void> {
    return new Promise((res) => {
      const reason = h('textarea', { class: 'inp', maxLength: 60, placeholder: '예) 친구가 슬플 때 토닥여 주고 싶기' }) as HTMLTextAreaElement;
      const who = h('input', { class: 'inp', maxLength: 14, placeholder: '예) 우리 반 친구 (안 써도 돼요)' }) as HTMLInputElement;
      const author = h('input', { class: 'inp', maxLength: 10, value: o.author }) as HTMLInputElement;
      const preview = h('img', { alt: '친구라면 레시피 카드' }) as HTMLImageElement;
      let canvas: HTMLCanvasElement | null = null;
      let tm = 0;
      // 생각 도우미: 글을 대신 써 주지 않고, 더 생각해 볼 질문만 하나 건네요 (한 카드에 다섯 번까지)
      const hintBox = h('div', { class: 'hint-bubble', hidden: true });
      let hints = 0, asking = false;
      const hintBtn = o.hint ? h('button', { class: 'btn soft small hint-btn', onclick: async () => {
        if (asking) return;
        if (hints >= 5) { toast('이제 내 생각으로 끝까지 써 볼까요?'); return; }
        asking = true; hintBtn!.textContent = '💭 생각하는 중…';
        const q = await o.hint!(reason.value);
        asking = false; hintBtn!.textContent = '💡 생각 도우미';
        if (!q) { toast('지금은 도우미를 부를 수 없어요. 내 생각대로 써 봐요!'); return; }
        hints++; sfx.pop();
        hintBox.hidden = false; hintBox.textContent = '💭 ' + q;
        hintBox.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 220 });
      } }, '💡 생각 도우미') as HTMLButtonElement : null;
      const draw = () => {
        canvas = drawCard({ rec: o.rec, customer: o.customer, photo: o.photo, reason: reason.value, who: who.value, author: author.value.trim() || o.author });
        preview.src = canvas.toDataURL('image/png');
      };
      const later = () => { clearTimeout(tm); tm = window.setTimeout(draw, 250); };
      [reason, who, author].forEach((x) => x.addEventListener('input', later));
      const status = h('div', { class: 'steps card' });
      const showSteps = (opened: boolean | null) => {
        status.innerHTML = '';
        if (opened === null) {
          status.append(h('div', null, h('b', null, '올리는 방법 '), '① 아래 버튼을 누르면 카드 그림이 태블릿에 저장되고 띵커벨이 열려요. ② 띵커벨 보드에서 ＋ 를 누르고 ③ 사진 올리기에서 방금 저장한 ', h('b', null, `${o.rec.name}_카드`), ' 그림을 골라요.'));
          if (!o.tinkerbell) status.append(h('div', { class: 'muted', style: 'margin-top:6px' }, '선생님이 아직 띵커벨 주소를 넣지 않았어요. 지금은 카드 그림만 저장할 수 있어요.'));
        } else {
          status.append(h('div', null, h('b', null, '✓ 카드 그림을 저장했어요! '), opened ? `띵커벨 탭에서 ＋ → 사진 올리기 → '${o.rec.name}_카드' 그림을 골라요.` : (o.tinkerbell ? '띵커벨이 열리지 않았다면 아래 "띵커벨 열기"를 눌러요.' : '갤러리나 다운로드 폴더에서 카드를 볼 수 있어요.')));
          status.append(h('div', { class: 'muted', style: 'margin-top:6px' }, '저장이 안 되면 오른쪽 카드 그림을 꾹 눌러 "이미지 다운로드"를 골라도 돼요.'));
          if (o.tinkerbell) status.append(h('div', { class: 'actions', style: 'justify-content:flex-start;margin-top:10px' }, h('button', { class: 'btn soft small', onclick: () => { sfx.tap(); if (!openTinkerbell(o.tinkerbell)) toast('팝업이 막혔어요. 주소창 오른쪽의 팝업 허용을 눌러 주세요.'); } }, '띵커벨 열기')));
        }
      };
      const save = (open: boolean) => {
        if (!reason.value.trim()) { toast('고른 까닭을 먼저 써 주세요.'); reason.focus(); return; }
        clearTimeout(tm); draw(); // 방금 쓴 글자까지 카드에 넣어요
        saveCard(canvas!, o.rec.name);
        let opened = false;
        if (open && o.tinkerbell) opened = openTinkerbell(o.tinkerbell);
        sfx.fanfare(); confetti();
        showSteps(open ? opened : false);
      };
      const el = h('div', { class: 'maker fade-in' },
        h('div', { class: 'left' },
          h('div', { style: 'display:flex;align-items:center;gap:10px' },
            h('div', { style: 'flex:1' }, h('h2', null, '친구라면 레시피 카드'), h('div', { style: 'font-family:var(--head);font-size:20px;margin-top:2px' }, h('span', { style: 'color:var(--accent)' }, o.rec.name), h('span', { class: 'muted', style: 'font-size:16px' }, `  ·  ${o.customer.name}에게 ${'★'.repeat(o.rec.stars)}`))),
            iconBtn(ICON.close, () => { sfx.back(); el.remove(); res(); }, '닫기')),
          h('div', { class: 'q card' }, h('div', { class: 'ql' }, h('span', { class: 'qn' }, '1'), '내가 이 라면을 고른 까닭은? ', h('span', { class: 'muted', style: 'font-size:15px' }, '"…때문이에요."로 들어가요')), reason, hintBtn ? h('div', { class: 'hint-row' }, hintBtn, hintBox) : null),
          h('div', { class: 'q card' }, h('div', { class: 'ql' }, h('span', { class: 'qn' }, '2'), '누구에게 끓여 주고 싶나요? ', h('span', { class: 'muted', style: 'font-size:15px' }, '안 써도 돼요')), who),
          h('div', { class: 'q card' }, h('div', { class: 'ql' }, h('span', { class: 'qn' }, '3'), '만든 사장님 이름'), author),
          h('div', { class: 'actions', style: 'justify-content:flex-start;margin-top:4px' },
            o.tinkerbell ? h('button', { class: 'btn big', onclick: () => { sfx.pop(); save(true); } }, '카드 저장하고 띵커벨 열기') : null,
            h('button', { class: `btn ${o.tinkerbell ? 'ghost' : 'big'}`, onclick: () => { sfx.pop(); save(false); } }, '카드만 저장하기')),
          status),
        h('div', { class: 'right' }, preview));
      showSteps(null);
      draw();
      mount(el);
    });
  },

  // ── 교사 화면 ─────────────────────────────
  pin(correct: string): Promise<boolean | null> {
    return new Promise((res) => {
      let v = '';
      const len = correct.length;
      const dots = h('div', { class: 'pin-dots' }, Array.from({ length: len }, () => h('i')));
      const wrap = h('div', { class: 'modal-wrap fade-in' });
      const upd = () => dots.querySelectorAll('i').forEach((d, i) => d.classList.toggle('on', i < v.length));
      const press = (k: string) => {
        sfx.tap();
        if (k === '←') v = v.slice(0, -1); else if (v.length < len) v += k;
        upd();
        if (v.length === len) setTimeout(() => { wrap.remove(); res(v === correct); }, 150);
      };
      wrap.append(h('div', { class: 'modal card pop-in', style: 'width:min(380px,100%);text-align:center' },
        h('h2', null, '선생님 화면'), h('p', { class: 'sub' }, '암호 네 자리를 눌러 주세요'), dots,
        h('div', { class: 'pin' }, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '←'].map((k) => k ? h('button', { onclick: () => press(k) }, k) : h('span'))),
        h('button', { class: 'btn ghost small', onclick: () => { wrap.remove(); res(null); } }, '닫기')));
      mount(wrap);
    });
  },

  teacher(o: {
    url: string; defaultUrl: string; quality: string; owners: Owner[]; counts: Map<string, number>;
    ai: { on: boolean; url: string; defaultUrl: string };
    onCheck: (url: string) => Promise<'ok' | 'nokey' | 'fail'>;
    onSummary: () => Promise<{ stats: ClassStats; text: string | null }>;
    onSave: (url: string, q: string, aiOn: boolean, aiUrl: string) => void; onDelete: (o: Owner) => Promise<void>;
  }): Promise<void> {
    return new Promise((res) => {
      // AI 도우미 (업스테이지 Solar)
      let aiOn = o.ai.on;
      const aiUrl = h('input', { class: 'inp', value: o.ai.url, placeholder: o.ai.defaultUrl || 'https://….vercel.app', style: 'width:100%' }) as HTMLInputElement;
      const aiSel = h('div', { class: 'sel' });
      const drawAi = () => { aiSel.innerHTML = ''; [[true, '켜기'], [false, '끄기']].forEach(([k, l]) => aiSel.append(h('button', { class: aiOn === k ? 'on' : '', onclick: () => { aiOn = k as boolean; drawAi(); } }, l as string))); };
      drawAi();
      const aiState = h('span', { class: 'muted', style: 'font-size:15px' });
      const checkBtn = h('button', { class: 'btn ghost small', onclick: async () => {
        aiState.textContent = '확인하는 중…';
        const r = await o.onCheck(aiUrl.value);
        aiState.textContent = r === 'ok' ? '✓ 연결됐어요' : r === 'nokey' ? '중계 서버는 켜져 있지만 업스테이지 키가 아직 없어요' : '연결하지 못했어요. 주소와 인터넷을 확인해 주세요';
      } }, '연결 확인');
      const sumBox = h('div', { class: 'ai-sum', hidden: true });
      const sumBtn = h('button', { class: 'btn soft small', onclick: async () => {
        sumBtn.disabled = true; sumBtn.textContent = '정리하는 중… (30초쯤)';
        const { stats: st, text } = await o.onSummary();
        sumBtn.disabled = false; sumBtn.textContent = '우리 반 요약 다시 만들기';
        sumBox.hidden = false; sumBox.innerHTML = '';
        const facts = [
          `사장님 ${st.owners}명 · 끓인 라면 ${st.bowls}그릇 · ${ROUNDS}그릇 채운 사장님 ${st.done10}명`,
          `별 셋 ${st.stars3} · 별 둘 ${st.stars2} · 별 하나 ${st.stars1} · 하트 도장 ${st.hearts}`,
          st.topEffects.length ? `잘 맞힌 마음: ${st.topEffects.slice(0, 3).join(', ')}` : '',
          st.hardEffects.length ? `어려워한 마음: ${st.hardEffects.slice(0, 3).join(', ')}` : '',
          st.words.length ? `이름에 자주 쓴 낱말: ${st.words.slice(0, 8).join(', ')}` : '',
        ].filter(Boolean);
        sumBox.append(h('div', { class: 'facts' }, facts.map((f) => h('div', null, f))));
        if (text) {
          const body = h('div', { class: 'text' }, text);
          sumBox.append(body, h('div', { class: 'actions', style: 'justify-content:flex-start;margin-top:8px' },
            h('button', { class: 'btn ghost small', onclick: async () => {
              try { await navigator.clipboard.writeText(text); toast('복사했어요'); } catch { toast('복사하지 못했어요. 글을 길게 눌러 복사해 주세요'); }
            } }, '글 복사하기')), h('div', { class: 'muted', style: 'font-size:13px;margin-top:4px' }, 'AI가 쓴 글이에요. 숫자는 위 기록과 맞는지 한 번 확인해 주세요.'));
        } else sumBox.append(h('div', { class: 'muted', style: 'margin-top:6px' }, st.bowls ? 'AI 요약은 만들지 못했어요. 위 숫자는 태블릿 기록 그대로예요.' : '아직 끓인 라면이 없어요.'));
      } }, '우리 반 요약 만들기');
      const wrap = h('div', { class: 'modal-wrap fade-in' });
      const url = h('input', { class: 'inp', value: o.url, placeholder: o.defaultUrl || 'https://www.tkbell.co.kr/…', style: 'width:100%' }) as HTMLInputElement;
      let q = o.quality;
      const qsel = h('div', { class: 'sel' });
      const drawQ = () => { qsel.innerHTML = ''; [['auto', '자동'], ['high', '높게'], ['mid', '보통'], ['low', '낮게']].forEach(([k, l]) => qsel.append(h('button', { class: q === k ? 'on' : '', onclick: () => { q = k; drawQ(); } }, l))); };
      drawQ();
      const list = h('div', { class: 't-list' });
      const drawList = () => {
        list.innerHTML = '';
        if (!o.owners.length) list.append(h('div', { class: 'muted' }, '등록된 사장님이 없어요.'));
        o.owners.slice().sort((a, b) => a.number - b.number).forEach((ow) => list.append(h('div', { class: 't-row' }, h('span', null, `${ow.number}번 ${ow.name} · ${o.counts.get(ow.id) ?? 0}그릇`),
          h('button', { class: 'btn ghost small', onclick: async (e: Event) => {
            const b = e.currentTarget as HTMLButtonElement;
            if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = '정말 지울까요?'; return; }
            await o.onDelete(ow);
            o.owners = o.owners.filter((x) => x.id !== ow.id);
            drawList();
          } }, '지우기'))));
      };
      drawList();
      wrap.append(h('div', { class: 'modal card pop-in' },
        h('h2', null, '선생님 화면'),
        h('div', { class: 'sec' }, h('h3', null, '띵커벨 보드 주소'), url, h('div', { class: 'muted', style: 'margin-top:6px;font-size:15px' }, '비워 두면 config.ts에 적은 주소를 써요. 보드는 손님 참여와 이미지 올리기를 허용해 주세요.')),
        h('div', { class: 'sec' }, h('h3', null, '화질'), qsel),
        h('div', { class: 'sec' }, h('h3', null, 'AI 도우미 (업스테이지)'),
          h('div', { class: 'muted', style: 'font-size:15px;margin-bottom:8px' }, '손님 맞춤 한마디, 고른 까닭 생각 도우미, 고운 말 검사에 써요. 학생 이름은 보내지 않아요. 인터넷이 없으면 저절로 원래대로 돌아가요.'),
          aiSel, h('div', { style: 'margin-top:8px' }, aiUrl),
          h('div', { class: 'actions', style: 'justify-content:flex-start;align-items:center;margin-top:8px' }, checkBtn, aiState)),
        h('div', { class: 'sec' }, h('h3', null, '우리 반 요약'),
          h('div', { class: 'muted', style: 'font-size:15px;margin-bottom:8px' }, '이 태블릿에 있는 모든 사장님 기록을 모아 정리해요. 수업 결과를 쓸 때 참고해 주세요.'),
          sumBtn, sumBox),
        h('div', { class: 'sec' }, h('h3', null, '사장님 기록'), list),
        h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: () => { o.onSave(url.value.trim(), q, aiOn, aiUrl.value.trim()); sfx.pop(); wrap.remove(); res(); } }, '저장하고 닫기'))));
      mount(wrap);
    });
  },

  toast,
};
