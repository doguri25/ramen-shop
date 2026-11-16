// 행사용 화면: 학년·반·번호·이름 입력, 도전 안내, 판 끝 내 결과, 선생님 랭킹
import { AVG_MIN_BOWLS, MAX_RUNS, MAX_STARS, ROUNDS } from '../config';
import { sfx } from '../core/sound';
import { confetti, h, iconBtn, ICON, toast } from '../ui/dom';
import { icon } from './icons';
import { BAND_NAME, type Band, type Board, type Best, type By, type ClassBoard, type RankErr, type Who } from './rank';
import './event.css';

const root = () => document.getElementById('ui')!;
const mount = <T extends HTMLElement>(el: T) => { root().appendChild(el); return el; };
const LAST = 'event-last-class';
const NAME_RE = /^[가-힣a-zA-Z0-9]{1,8}$/;
export const whoText = (w: Who) => `${w.grade}학년 ${w.cls}반 ${w.num}번 ${w.name}`;
const medal = (n: number) => (n <= 3 ? h('span', { class: 'gm', html: icon('medal' + n, 30) }) : String(n));
// 아이콘 + 글자 버튼 내용
export const iconLabel = (name: string, text: string, size = 24) => [h('span', { class: 'gi-wrap', html: icon(name, size) }), text];

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
  login(roster?: (grade: number, cls: number) => Promise<Map<number, string> | null>): Promise<Who | null> {
    return new Promise((res) => {
      let last: Partial<Who> = {};
      try { last = JSON.parse(localStorage.getItem(LAST) || '{}'); } catch { /* 처음 */ }
      let grade = last.grade ?? 0, cls = last.cls ?? 0, num = 0, seq = 0;
      let taken = new Map<number, string>();
      const wrap = h('div', { class: 'modal-wrap fade-in' });
      const name = h('input', { class: 'inp', maxLength: 8, placeholder: '이름 (예: 김민수)', style: 'flex:1;min-width:200px', autocomplete: 'off' }) as HTMLInputElement;
      const legend = h('div', { class: 'ev-legend' });
      // 번호 버튼: 이미 들어온 번호는 초록색으로 칠하고 이름을 작게 적어요
      const nums = h('div', { class: 'numpad ev-nums', style: 'grid-template-columns:repeat(12,minmax(0,1fr))' });
      const numBtns: HTMLButtonElement[] = [];
      for (let i = 1; i <= 35; i++) {
        const b = h('button', { onclick: () => {
          sfx.tap(); num = i;
          numBtns.forEach((x) => x.classList.toggle('on', x === b));
          const nm = taken.get(i);
          if (nm && (!name.value.trim() || name.dataset.auto === '1')) { name.value = nm; name.dataset.auto = '1'; }
          else if (!nm && name.dataset.auto === '1') { name.value = ''; name.dataset.auto = ''; }
          check();
        } }, h('span', { class: 'n' }, String(i)), h('span', { class: 'who' })) as HTMLButtonElement;
        numBtns.push(b); nums.appendChild(b);
      }
      const paint = () => numBtns.forEach((b, k) => {
        const nm = taken.get(k + 1);
        b.classList.toggle('taken', !!nm);
        b.title = nm ? `${nm} (이미 들어왔어요)` : '';
        (b.querySelector('.who') as HTMLElement).textContent = nm ?? '';
      });
      const loadRoster = async () => {
        const my = ++seq;
        // 고른 학년·반은 바로 기억해요 (다음 친구가 같은 반이면 다시 누르지 않게)
        if (grade || cls) try { localStorage.setItem(LAST, JSON.stringify({ grade, cls })); } catch { /* 괜찮아요 */ }
        taken = new Map(); paint(); legend.textContent = '';
        if (!grade || !cls || !roster) return;
        legend.textContent = '이 반에서 들어온 번호를 확인하는 중…';
        const m = await roster(grade, cls);
        if (my !== seq || !wrap.isConnected) return;
        taken = m ?? new Map(); paint();
        legend.innerHTML = '';
        legend.append(h('i', { class: 'dot' }), m ? (taken.size ? `초록색 번호는 이미 이름을 쓰고 들어온 친구예요 (${taken.size}명). 내 번호를 누르면 이름이 저절로 들어가요.` : '아직 이 반에서 들어온 친구가 없어요.') : '기록 서버에 닿지 않아 들어온 번호를 보여 주지 못했어요.');
      };
      const warn = h('div', { class: 'name-warn' });
      const ok = h('button', { class: 'btn big', disabled: true }, '도전 시작') as HTMLButtonElement;
      // 지금까지 고른 것: 5학년 2반 3번 김민수
      const summary = h('div', { class: 'ev-summary' });
      const step = (n: number, label: string, cls: string, ...body: HTMLElement[]) =>
        h('section', { class: `ev-step s-${cls}` }, h('div', { class: 'ev-step-h' }, h('b', null, String(n)), label), h('div', { class: 'ev-step-b' }, ...body));
      const check = () => {
        const n = name.value.replace(/\s+/g, '');
        summary.innerHTML = '';
        summary.append(...[[grade, '학년'], [cls, '반'], [num, '번']].map(([v, u]) => h('span', { class: v ? 'on' : '' }, v ? `${v}${u}` : `?${u}`)), h('span', { class: n ? 'on' : '' }, n || '이름'));
        warn.textContent = n && !NAME_RE.test(n) ? '이름은 한글·영어·숫자로 8글자까지 써 주세요.' : '';
        ok.disabled = !(grade && cls && num && NAME_RE.test(n));
      };
      name.addEventListener('input', () => { name.dataset.auto = ''; check(); });
      ok.addEventListener('click', () => {
        const n = name.value.replace(/\s+/g, '').normalize('NFC');
        if (ok.disabled) return;
        try { localStorage.setItem(LAST, JSON.stringify({ grade, cls })); } catch { /* 괜찮아요 */ }
        seq++; sfx.pop(); wrap.remove(); res({ grade, cls, num, name: n });
      });
      wrap.append(h('div', { class: 'modal card pop-in ev-login' },
        h('div', { class: 'ev-head' },
          h('div', null, h('h2', null, '마음 요리사 도전!'), h('p', { class: 'sub' }, '학년, 반, 번호를 누르고 이름을 써요. 선생님이 알려 준 대로 정확히 써 주세요.')),
          iconBtn(ICON.close, () => { sfx.back(); seq++; wrap.remove(); res(null); }, '닫기')),
        // 학년·반·번호·이름을 색이 다른 칸으로 나누고 순서 번호를 붙여, 어느 줄을 누르는지 헷갈리지 않게 해요
        step(1, '학년', 'g', pad(6, 6, grade, (v) => { grade = v; check(); loadRoster(); })),
        step(2, '반', 'c', pad(15, 15, cls, (v) => { cls = v; check(); loadRoster(); })),
        step(3, '번호', 'n', nums, legend),
        step(4, '이름', 'm', name, warn),
        h('div', { class: 'actions ev-login-acts' }, summary, ok)));
      mount(wrap);
      check();
      loadRoster();
    });
  },

  // ── 도전 안내 (몇 번째 판인지, 최고 기록) ─────────────
  ready(o: { who: Who; runNo: number; resume: number | null; best: Best | null; offline: boolean }): Promise<'start' | 'lib' | 'back'> {
    return new Promise((res) => {
      const left = MAX_RUNS - o.runNo;
      const full = o.runNo > MAX_RUNS;
      const wrap = h('div', { class: 'modal-wrap fade-in' });
      const go = (v: 'start' | 'lib' | 'back') => { v === 'back' ? sfx.back() : sfx.pop(); wrap.remove(); res(v); };
      const dots = h('div', { class: 'ev-runs' }, Array.from({ length: MAX_RUNS }, (_, i) =>
        h('span', { class: i + 1 < o.runNo || full ? 'used' : i + 1 === o.runNo ? 'now' : '' }, `${i + 1}판`)));
      wrap.append(h('div', { class: 'modal card pop-in ev-ready' },
        h('div', { class: 'ev-who' }, whoText(o.who)),
        full ? h('h2', null, '세 판을 모두 도전했어요!')
          : o.resume !== null ? h('h2', null, `${o.runNo}번째 판을 이어서 해요`)
            : h('h2', null, o.runNo === 1 ? '첫 번째 도전이에요' : `${o.runNo}번째 도전이에요`),
        dots,
        h('p', { class: 'sub' }, full ? '가장 잘한 판의 별이 내 기록으로 남아 있어요. 도감에서 끓인 라면을 다시 볼 수 있어요.'
          : o.resume !== null ? `${o.resume}그릇까지 끓였어요. 남은 ${ROUNDS - o.resume}그릇을 끓여요.`
            : `손님 ${ROUNDS}명에게 라면을 끓여 별을 모아요. 한 그릇에 별은 ${MAX_STARS}개까지예요.${left ? ` 이번 판이 끝나도 ${left}번 더 도전할 수 있어요.` : ' 마지막 도전이에요!'}`),
        o.best ? h('div', { class: 'ev-best' }, h('span', null, '지금 최고 기록'), h('b', null, `★ ${o.best.total}`), h('span', { class: 'muted' }, `별 다섯 그릇 ${o.best.fives}개`)) : null,
        o.offline ? h('div', { class: 'ev-off' }, ...iconLabel('offline', '기록 서버에 닿지 않아요. 기록은 태블릿에 모아 두었다가 인터넷이 되면 보내요.', 20)) : null,
        full ? null : h('div', { class: 'ev-rules' },
          h('div', null, h('b', null, '★'), ' 라면을 끓였어요'),
          h('div', null, h('b', null, '★★'), ' 손님 마음과 같은 묶음 재료 2가지'),
          h('div', null, h('b', null, '★★★'), ' 같은 묶음 재료 3가지 이상'),
          h('div', null, h('b', null, '★★★★'), ' 꼭 필요한 마음 재료와 더하면 좋은 마음 재료까지'),
          h('div', null, h('b', null, '★★★★★'), ' 라면 이름에 손님 마음 낱말까지 ❤️')),
        h('div', { class: 'actions' },
          h('button', { class: 'btn ghost small', onclick: () => go('back') }, '뒤로'),
          full ? h('button', { class: 'btn', onclick: () => go('lib') }, '도감 보기')
            : h('button', { class: 'btn big pulse', onclick: () => go('start') }, o.resume !== null ? '이어서 하기' : '가게 문 열기'))));
      mount(wrap);
    });
  },

  // ── 판 끝: 내 결과만 (다른 친구 기록과 등수는 보여 주지 않아요) ─────────────
  result<A extends string>(o: {
    who: Who; runNo: number; total: number; fives: number; isBest: boolean; best: { total: number; runNo: number } | null;
    runs: { runNo: number; total: number }[]; cheer?: boolean;
    actions: { id: A; label: string; kind?: 'main' | 'soft' | 'ghost' }[];
  }): Promise<A> {
    return new Promise((res) => {
      const wrap = h('div', { class: 'modal-wrap fade-in' });
      const runs = h('div', { class: 'ev-runs ev-myruns' }, Array.from({ length: MAX_RUNS }, (_, i) => {
        const r = o.runs.find((x) => x.runNo === i + 1);
        return h('span', { class: i + 1 === o.runNo ? 'now' : r ? '' : 'empty' }, r ? `${i + 1}판 ★ ${r.total}` : `${i + 1}판`);
      }));
      wrap.append(h('div', { class: 'modal card pop-in ev-finish' },
        h('div', { class: 'ev-who' }, whoText(o.who)),
        h('h2', { class: 'ev-fin-h' }, h('span', { class: 'gi-wrap', html: icon('star', 30) }), ` ${o.runNo}번째 판, ${ROUNDS}그릇을 다 끓였어요!`),
        h('div', { class: 'ev-score' },
          h('div', null, h('span', null, '이번 판 별'), h('b', null, `★ ${o.total}`), h('i', null, `/ ${ROUNDS * MAX_STARS}`)),
          h('div', null, h('span', null, '별 다섯 그릇'), h('b', null, `${o.fives}`), h('i', null, `/ ${ROUNDS}`)),
          h('div', null, h('span', null, '내 최고 기록'), h('b', null, `★ ${o.isBest || !o.best ? o.total : o.best.total}`), h('i', null, o.isBest || !o.best ? '이번 판' : `${o.best.runNo}번째 판`))),
        runs,
        h('p', { class: 'sub' }, o.isBest ? '지금까지 가장 잘한 판이에요! 이 별이 내 기록으로 남아요.' : `가장 잘한 판(★ ${o.best!.total})이 내 기록으로 남아 있어요.`),
        h('div', { class: 'actions' }, o.actions.map((a) => h('button', { class: `btn ${a.kind === 'ghost' ? 'ghost small' : a.kind === 'soft' ? 'soft' : ''}`, onclick: () => { sfx.pop(); wrap.remove(); res(a.id); } }, a.label)))));
      mount(wrap);
      if (o.isBest && o.cheer) confetti();
    });
  },

  // ── 선생님 랭킹 암호 ─────────────
  askKey(msg?: string): Promise<string | null> {
    return new Promise((res) => {
      const wrap = h('div', { class: 'modal-wrap fade-in ev-keywrap' });
      const inp = h('input', { class: 'inp', type: 'password', placeholder: '랭킹 암호', autocomplete: 'off', style: 'width:100%' }) as HTMLInputElement;
      const ok = h('button', { class: 'btn', onclick: () => { const v = inp.value.trim(); if (!v) return; sfx.pop(); wrap.remove(); res(v); } }, '확인');
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok.click(); });
      wrap.append(h('div', { class: 'modal card pop-in', style: 'width:min(460px,100%)' },
        h('h2', null, '랭킹 암호'),
        msg ? h('div', { class: 'ev-off' }, msg) : null,
        h('p', { class: 'sub' }, '버셀에 RANK_ADMIN_KEY로 넣은 암호를 써 주세요. 이 기기에서만 기억해요.'),
        inp,
        h('div', { class: 'actions' }, h('button', { class: 'btn ghost', onclick: () => { sfx.back(); wrap.remove(); res(null); } }, '닫기'), ok)));
      mount(wrap);
      setTimeout(() => inp.focus(), 50);
    });
  },

  // ── 선생님만 보는 랭킹: 개인(학년군별) / 반(전교) ─────────────
  // 열려 있는 동안 20초마다 저절로 새로 불러와요. 'rekey'면 암호를 다시 물어요
  ranking(o: { band: Band; people: (band: Band, by: By) => Promise<Board | RankErr>; classes: (by: By) => Promise<ClassBoard | RankErr> }): Promise<'close' | 'rekey'> {
    return new Promise((res) => {
      let mode: 'people' | 'class' = 'people', band = o.band, by: By = 'total', seq = 0, loadedAt = 0, busy = false;
      const el = h('div', { class: 'ev-rank fade-in' });
      const list = h('div', { class: 'ev-list' });
      const foot = h('div', { class: 'ev-mine' });
      const modes = h('div', { class: 'ev-tabs ev-modes' });
      const tabs = h('div', { class: 'ev-tabs' });
      const kinds = h('div', { class: 'sel' });
      const stamp = h('span', { class: 'ev-stamp' });
      const done = (v: 'close' | 'rekey') => { clearInterval(timer); el.remove(); res(v); };
      const drawTabs = () => {
        modes.innerHTML = ''; tabs.innerHTML = ''; kinds.innerHTML = '';
        ([['people', 'medal1', '개인 랭킹'], ['class', 'trophy', '반 랭킹']] as const).forEach(([k, ic, l]) => modes.append(h('button', { class: k === mode ? 'on' : '', onclick: () => { sfx.tap(); mode = k; drawTabs(); load(true); } }, ...iconLabel(ic, l, 24))));
        tabs.hidden = mode === 'class';
        (['12', '34', '56'] as Band[]).forEach((b) => tabs.append(h('button', { class: b === band ? 'on' : '', onclick: () => { sfx.tap(); band = b; drawTabs(); load(true); } }, BAND_NAME[b])));
        ([['total', 'star', '모은 별'], ['avg', 'chart', '평균 별']] as [By, string, string][]).forEach(([k, ic, l]) => kinds.append(h('button', { class: k === by ? 'on' : '', onclick: () => { sfx.tap(); by = k; drawTabs(); load(true); } }, ...iconLabel(ic, l, 20))));
      };
      const row = (rank: number, name: HTMLElement | string, score: string, ex: string) =>
        h('div', { class: `ev-row ${rank <= 3 ? 'top' : ''}` }, h('span', { class: 'rk' }, medal(rank)), h('span', { class: 'nm' }, name), h('b', { class: 'sc' }, score), h('span', { class: 'ex' }, ex));
      const tick = () => { if (loadedAt) stamp.textContent = `${Math.max(0, Math.round((Date.now() - loadedAt) / 1000))}초 전 순위`; };
      const fail = (e: RankErr) => {
        list.innerHTML = ''; foot.innerHTML = '';
        if (e === 'bad_key' || e === 'no_admin_key' || e === 'too_many') {
          const m = e === 'bad_key' ? '랭킹 암호가 맞지 않아요.' : e === 'too_many' ? '암호를 여러 번 틀려서 10분 동안 막혔어요. 잠시 뒤에 다시 해 주세요.' : '서버에 랭킹 암호가 아직 없어요. 버셀에 RANK_ADMIN_KEY를 넣고 다시 배포해 주세요.';
          list.append(h('div', { class: 'ev-empty' }, m, e === 'bad_key' ? h('div', null, h('button', { class: 'btn soft small', style: 'margin-top:12px', onclick: () => done('rekey') }, '암호 다시 넣기')) : null));
          return;
        }
        list.append(h('div', { class: 'ev-empty' }, h('div', { class: 'gi-big', html: icon('offline', 44) }), '랭킹 서버에 닿지 않아요. 인터넷을 확인하고 다시 눌러 주세요.', h('div', null, h('button', { class: 'btn soft small', style: 'margin-top:12px', onclick: () => load(true) }, ...iconLabel('refresh', '다시 불러오기', 20)))));
      };
      // fresh: 처음 열거나 탭을 바꿀 때. 저절로 고칠 때는 '불러오는 중'을 띄우지 않고 보던 자리를 지켜요
      const load = async (fresh = false) => {
        const my = ++seq;
        if (fresh) { list.innerHTML = ''; foot.innerHTML = ''; list.append(h('div', { class: 'ev-empty' }, '랭킹을 불러오는 중…')); }
        busy = true;
        const r = await (mode === 'class' ? o.classes(by) : o.people(band, by)).finally(() => { if (my === seq) busy = false; });
        if (my !== seq || !el.isConnected) return;
        if (typeof r === 'string') {
          if (r === 'offline' && !fresh && loadedAt) { loadedAt = Date.now() - 10000; return; } // 잠깐 끊긴 거면 보던 순위를 그대로 두고 10초 뒤 다시
          loadedAt = 0; stamp.textContent = '';
          fail(r);
          return;
        }
        const keep = list.scrollTop;
        list.innerHTML = ''; foot.innerHTML = '';
        loadedAt = Date.now(); tick();
        let hint = '';
        if ('band' in r) {
          if (!r.rows.length) list.append(h('div', { class: 'ev-empty' }, by === 'avg' ? `아직 ${AVG_MIN_BOWLS}그릇 넘게 끓인 학생이 없어요.` : '아직 기록이 없어요.'));
          r.rows.forEach((x) => list.append(by === 'total'
            ? row(x.rank, h('span', null, h('i', null, `${x.grade}-${x.cls}`), ` ${x.name}`), `★ ${x.total}`, `별 다섯 ${x.fives}그릇`)
            : row(x.rank, h('span', null, h('i', null, `${x.grade}-${x.cls}`), ` ${x.name}`), `★ ${x.avg.toFixed(2)}`, `${x.allBowls}그릇 평균`)));
          hint = (by === 'total' ? '세 판 가운데 가장 잘한 판의 별이에요. 별이 같으면 별 다섯 그릇이 많은 학생이 앞서요.' : `끓인 모든 그릇의 별 평균이에요. ${AVG_MIN_BOWLS}그릇을 넘게 끓이면 올라가요.`)
            + (r.count > r.rows.length ? ` (모두 ${r.count}명 중 ${r.rows.length}등까지 보여요)` : '');
        } else {
          if (!r.rows.length) list.append(h('div', { class: 'ev-empty' }, by === 'avg' ? `아직 반 전체로 ${r.min}그릇 넘게 끓인 반이 없어요.` : '아직 기록이 없어요.'));
          r.rows.forEach((x) => list.append(by === 'total'
            ? row(x.rank, `${x.grade}학년 ${x.cls}반`, `★ ${x.total}`, `${x.students}명 · 별 다섯 ${x.fives}그릇`)
            : row(x.rank, `${x.grade}학년 ${x.cls}반`, `★ ${x.avg.toFixed(2)}`, `${x.students}명 · ${x.bowls}그릇 평균`)));
          hint = by === 'total' ? '반 친구들이 저마다 가장 잘한 판의 별을 모두 더했어요. 같으면 별 다섯 그릇이 많은 반이 앞서요.'
            : `반 친구들이 끓인 모든 그릇의 별 평균이에요. 반 전체로 ${r.min}그릇 넘게 끓인 반부터 올라가요.`;
          if (r.count > r.rows.length) hint += ` (참여한 반 ${r.count}개 중 ${r.rows.length}개)`;
        }
        foot.append(h('div', { class: 'muted ev-hint' }, hint));
        if (!fresh) list.scrollTop = keep;
      };
      const timer = window.setInterval(() => { tick(); if (!busy && loadedAt && Date.now() - loadedAt > 20000) load(); }, 1000);
      const header = h('header', null, h('h2', null, h('span', { class: 'gi-wrap', html: icon('trophy', 34) }), '마음 요리사 랭킹'), h('span', { class: 'ev-only' }, '선생님만 봐요'), stamp, h('span', { class: 'grow' }),
        h('button', { class: 'btn ghost small', onclick: () => { sfx.tap(); load(true); } }, ...iconLabel('refresh', '새로 고침', 20)),
        iconBtn(ICON.close, () => { sfx.back(); done('close'); }, '닫기'));
      el.append(header, modes, tabs, kinds, list, foot);
      drawTabs();
      mount(el);
      load(true);
    });
  },

  sent(r: { error?: string } | null) {
    if (r?.error === 'max_runs') toast('이 이름으로는 세 판을 모두 했어요. 이번 판은 기록에 남지 않아요.', 4000);
  },
};
