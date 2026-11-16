// 행사용 화면: 학년·반·번호·이름 입력, 도전 안내, 판 끝, 랭킹
import { AVG_MIN_BOWLS, MAX_RUNS, MAX_STARS, ROUNDS } from '../config';
import { sfx } from '../core/sound';
import { confetti, h, iconBtn, ICON, toast } from '../ui/dom';
import { BAND_NAME, bandOf, type Band, type Board, type Best, type By, type Who } from './rank';
import './event.css';

const root = () => document.getElementById('ui')!;
const mount = <T extends HTMLElement>(el: T) => { root().appendChild(el); return el; };
const LAST = 'event-last-class';
const NAME_RE = /^[가-힣a-zA-Z0-9]{1,8}$/;
export const whoText = (w: Who) => `${w.grade}학년 ${w.cls}반 ${w.num}번 ${w.name}`;
const medal = (n: number) => (n === 1 ? '🥇' : n === 2 ? '🥈' : n === 3 ? '🥉' : String(n));

// 숫자 버튼 줄
function pad(n: number, cols: number, cur: number, set: (v: number) => void) {
  const el = h('div', { class: 'numpad', style: `grid-template-columns:repeat(${cols},minmax(0,1fr))` });
  for (let i = 1; i <= n; i++) {
    const b = h('button', { class: i === cur ? 'on' : '', onclick: () => { sfx.tap(); el.querySelectorAll('button').forEach((x) => x.classList.remove('on')); b.classList.add('on'); set(i); } }, String(i));
    el.appendChild(b);
  }
  return el;
}

export const EV = {
  // ── 학년·반·번호·이름 ───────────────────────
  login(): Promise<Who | 'rank' | null> {
    return new Promise((res) => {
      let last: Partial<Who> = {};
      try { last = JSON.parse(localStorage.getItem(LAST) || '{}'); } catch { /* 처음 */ }
      let grade = last.grade ?? 0, cls = last.cls ?? 0, num = 0;
      const wrap = h('div', { class: 'modal-wrap fade-in' });
      const name = h('input', { class: 'inp', maxLength: 8, placeholder: '이름 (예: 김민수)', style: 'flex:1;min-width:200px', autocomplete: 'off' }) as HTMLInputElement;
      const warn = h('div', { class: 'name-warn' });
      const ok = h('button', { class: 'btn big', disabled: true }, '도전 시작') as HTMLButtonElement;
      const check = () => {
        const n = name.value.replace(/\s+/g, '');
        warn.textContent = n && !NAME_RE.test(n) ? '이름은 한글·영어·숫자로 8글자까지 써 주세요.' : '';
        ok.disabled = !(grade && cls && num && NAME_RE.test(n));
      };
      name.addEventListener('input', check);
      ok.addEventListener('click', () => {
        const n = name.value.replace(/\s+/g, '').normalize('NFC');
        if (ok.disabled) return;
        try { localStorage.setItem(LAST, JSON.stringify({ grade, cls })); } catch { /* 괜찮아요 */ }
        sfx.pop(); wrap.remove(); res({ grade, cls, num, name: n });
      });
      wrap.append(h('div', { class: 'modal card pop-in ev-login' },
        h('div', { class: 'ev-head' },
          h('div', null, h('h2', null, '마음 요리사 도전!'), h('p', { class: 'sub' }, '학년, 반, 번호를 누르고 이름을 써요. 선생님이 알려 준 대로 정확히 써 주세요.')),
          iconBtn(ICON.close, () => { sfx.back(); wrap.remove(); res(null); }, '닫기')),
        h('div', { class: 'form-row' }, h('label', null, '학년'), pad(6, 6, grade, (v) => { grade = v; check(); })),
        h('div', { class: 'form-row' }, h('label', null, '반'), pad(15, 15, cls, (v) => { cls = v; check(); })),
        h('div', { class: 'form-row' }, h('label', null, '번호'), pad(35, 12, 0, (v) => { num = v; check(); })),
        h('div', { class: 'form-row' }, h('label', null, '이름'), name),
        warn,
        h('div', { class: 'actions' },
          h('button', { class: 'btn ghost', onclick: () => { sfx.tap(); wrap.remove(); res('rank'); } }, '🏆 랭킹 보기'),
          ok)));
      mount(wrap);
      check();
    });
  },

  // ── 도전 안내 (몇 번째 판인지, 최고 기록) ─────────────
  ready(o: { who: Who; runNo: number; resume: number | null; best: Best | null; offline: boolean }): Promise<'start' | 'rank' | 'lib' | 'back'> {
    return new Promise((res) => {
      const left = MAX_RUNS - o.runNo;
      const full = o.runNo > MAX_RUNS;
      const wrap = h('div', { class: 'modal-wrap fade-in' });
      const go = (v: 'start' | 'rank' | 'lib' | 'back') => { v === 'back' ? sfx.back() : sfx.pop(); wrap.remove(); res(v); };
      const dots = h('div', { class: 'ev-runs' }, Array.from({ length: MAX_RUNS }, (_, i) =>
        h('span', { class: i + 1 < o.runNo || full ? 'used' : i + 1 === o.runNo ? 'now' : '' }, `${i + 1}판`)));
      wrap.append(h('div', { class: 'modal card pop-in ev-ready' },
        h('div', { class: 'ev-who' }, whoText(o.who)),
        full ? h('h2', null, '세 판을 모두 도전했어요!')
          : o.resume !== null ? h('h2', null, `${o.runNo}번째 판을 이어서 해요`)
            : h('h2', null, o.runNo === 1 ? '첫 번째 도전이에요' : `${o.runNo}번째 도전이에요`),
        dots,
        h('p', { class: 'sub' }, full ? '가장 잘한 판의 별이 랭킹에 올라 있어요. 친구들 기록도 구경해 보세요.'
          : o.resume !== null ? `${o.resume}그릇까지 끓였어요. 남은 ${ROUNDS - o.resume}그릇을 끓여요.`
            : `손님 ${ROUNDS}명에게 라면을 끓여 별을 모아요. 한 그릇에 별은 ${MAX_STARS}개까지예요.${left ? ` 이번 판이 끝나도 ${left}번 더 도전할 수 있어요.` : ' 마지막 도전이에요!'}`),
        o.best ? h('div', { class: 'ev-best' }, h('span', null, '지금 최고 기록'), h('b', null, `★ ${o.best.total}`), h('span', { class: 'muted' }, `별 다섯 그릇 ${o.best.fives}개`)) : null,
        o.offline ? h('div', { class: 'ev-off' }, '📡 랭킹 서버에 닿지 않아요. 기록은 태블릿에 모아 두었다가 인터넷이 되면 보내요.') : null,
        full ? null : h('div', { class: 'ev-rules' },
          h('div', null, h('b', null, '★'), ' 라면을 끓였어요'),
          h('div', null, h('b', null, '★★'), ' 손님 마음과 같은 묶음 재료 2가지'),
          h('div', null, h('b', null, '★★★'), ' 같은 묶음 재료 3가지 넘게'),
          h('div', null, h('b', null, '★★★★'), ' 꼭 필요한 마음 재료와 더하면 좋은 마음 재료까지'),
          h('div', null, h('b', null, '★★★★★'), ' 라면 이름에 손님 마음 낱말까지 ❤️')),
        h('div', { class: 'actions' },
          h('button', { class: 'btn ghost small', onclick: () => go('back') }, '뒤로'),
          h('button', { class: 'btn ghost small', onclick: () => go('rank') }, '🏆 랭킹'),
          full ? h('button', { class: 'btn', onclick: () => go('lib') }, '도감 보기')
            : h('button', { class: 'btn big pulse', onclick: () => go('start') }, o.resume !== null ? '이어서 하기' : '가게 문 열기'))));
      mount(wrap);
    });
  },

  // ── 판 끝 ───────────────────────────────
  finish(o: { who: Who; runNo: number; total: number; fives: number; best: Best | null; rank: number | null; offline: boolean }): Promise<'rank' | 'lib' | 'again' | 'home'> {
    return new Promise((res) => {
      const left = MAX_RUNS - o.runNo;
      const isBest = !o.best || o.total >= o.best.total;
      const wrap = h('div', { class: 'modal-wrap fade-in' });
      const go = (v: 'rank' | 'lib' | 'again' | 'home') => { sfx.pop(); wrap.remove(); res(v); };
      wrap.append(h('div', { class: 'modal card pop-in ev-finish' },
        h('div', { class: 'ev-who' }, whoText(o.who)),
        h('h2', null, `🎉 ${o.runNo}번째 판, ${ROUNDS}그릇을 다 끓였어요!`),
        h('div', { class: 'ev-score' },
          h('div', null, h('span', null, '모은 별'), h('b', null, `★ ${o.total}`), h('i', null, `/ ${ROUNDS * MAX_STARS}`)),
          h('div', null, h('span', null, '별 다섯 그릇'), h('b', null, `${o.fives}`), h('i', null, `/ ${ROUNDS}`)),
          h('div', null, h('span', null, `${BAND_NAME[bandOf(o.who.grade)]} 순위`), h('b', null, o.rank ? `${o.rank}등` : '–'), h('i', null, o.rank ? '최고 기록 기준' : o.offline ? '인터넷이 되면 올라가요' : ''))),
        h('p', { class: 'sub', style: 'text-align:center' }, isBest ? '지금까지 가장 잘한 판이에요! 이 기록이 랭킹에 올라가요.' : `최고 기록(★ ${o.best!.total})은 그대로 랭킹에 남아 있어요.`),
        h('div', { class: 'actions', style: 'justify-content:center' },
          h('button', { class: 'btn ghost small', onclick: () => go('home') }, '처음으로'),
          h('button', { class: 'btn soft', onclick: () => go('lib') }, '도감·대표 라면 카드'),
          h('button', { class: 'btn soft', onclick: () => go('rank') }, '🏆 랭킹 보기'),
          left > 0 ? h('button', { class: 'btn', onclick: () => go('again') }, `다시 도전 (${left}번 남음)`) : null)));
      mount(wrap);
      if (isBest) confetti();
    });
  },

  // ── 랭킹 ───────────────────────────────
  ranking(o: { band: Band; by?: By; who?: Who | null; load: (band: Band, by: By) => Promise<Board | null> }): Promise<void> {
    return new Promise((res) => {
      let band = o.band, by: By = o.by ?? 'total', seq = 0;
      const el = h('div', { class: 'ev-rank fade-in' });
      const list = h('div', { class: 'ev-list' });
      const mine = h('div', { class: 'ev-mine' });
      const tabs = h('div', { class: 'ev-tabs' });
      const kinds = h('div', { class: 'sel' });
      const drawTabs = () => {
        tabs.innerHTML = ''; kinds.innerHTML = '';
        (['12', '34', '56'] as Band[]).forEach((b) => tabs.append(h('button', { class: b === band ? 'on' : '', onclick: () => { sfx.tap(); band = b; drawTabs(); load(); } }, BAND_NAME[b])));
        ([['total', '⭐ 모은 별'], ['avg', '📊 평균 별']] as [By, string][]).forEach(([k, l]) => kinds.append(h('button', { class: k === by ? 'on' : '', onclick: () => { sfx.tap(); by = k; drawTabs(); load(); } }, l)));
      };
      const line = (r: { rank: number | null; grade: number; cls: number; num: number; name: string; total: number; fives: number; avg: number; allBowls: number }, me = false) =>
        h('div', { class: `ev-row ${me ? 'me' : ''} ${r.rank && r.rank <= 3 ? 'top' : ''}` },
          h('span', { class: 'rk' }, r.rank ? medal(r.rank) : '–'),
          h('span', { class: 'nm' }, h('i', null, `${r.grade}-${r.cls}`), ` ${r.name}`),
          by === 'total'
            ? [h('b', { class: 'sc' }, `★ ${r.total}`), h('span', { class: 'ex' }, `별 다섯 ${r.fives}그릇`)]
            : [h('b', { class: 'sc' }, `★ ${r.avg.toFixed(2)}`), h('span', { class: 'ex' }, `${r.allBowls}그릇 평균`)]);
      const load = async () => {
        const my = ++seq;
        list.innerHTML = ''; mine.innerHTML = '';
        list.append(h('div', { class: 'ev-empty' }, '랭킹을 불러오는 중…'));
        const b = await o.load(band, by);
        if (my !== seq || !el.isConnected) return;
        list.innerHTML = '';
        if (!b) { list.append(h('div', { class: 'ev-empty' }, '📡 랭킹 서버에 닿지 않아요. 인터넷을 확인하고 다시 눌러 주세요.', h('div', null, h('button', { class: 'btn soft small', style: 'margin-top:12px', onclick: () => load() }, '다시 불러오기')))); return; }
        if (!b.rows.length) list.append(h('div', { class: 'ev-empty' }, by === 'avg' ? `아직 ${AVG_MIN_BOWLS}그릇 넘게 끓인 친구가 없어요.` : '아직 기록이 없어요. 첫 번째 마음 요리사가 되어 보세요!'));
        b.rows.forEach((r) => list.append(line(r, !!r.me)));
        const hint = by === 'total' ? '세 판 가운데 가장 잘한 판의 별이에요. 별이 같으면 별 다섯 그릇이 많은 친구가 앞서요.'
          : `끓인 모든 그릇의 별 평균이에요. ${AVG_MIN_BOWLS}그릇을 넘게 끓이면 올라가요.`;
        mine.append(h('div', { class: 'muted ev-hint' }, hint, b.count > b.rows.length ? ` (모두 ${b.count}명 중 ${b.rows.length}등까지 보여요)` : ''));
        if (b.me && !b.rows.some((r) => r.me)) {
          if (b.me.rank) mine.append(line({ ...b.me, rank: b.me.rank }, true));
          else if (by === 'avg' && b.me.need > 0) mine.append(h('div', { class: 'ev-row me' }, h('span', { class: 'rk' }, '–'), h('span', { class: 'nm' }, '나'), h('span', { class: 'ex' }, `${b.me.need}그릇 더 끓이면 평균 별 랭킹에 올라요`)));
        }
      };
      el.append(
        h('header', null, h('h2', null, '🏆 마음 요리사 랭킹'), h('span', { class: 'grow' }),
          iconBtn(ICON.close, () => { sfx.back(); el.remove(); res(); }, '닫기')),
        tabs, kinds, list, mine);
      drawTabs();
      mount(el);
      load();
    });
  },

  sent(r: { error?: string } | null) {
    if (r?.error === 'max_runs') toast('이 이름으로는 세 판을 모두 했어요. 이번 판은 랭킹에 오르지 않아요.', 4000);
  },
};
