// 업스테이지 Solar 도우미 (버셀 중계 서버를 거쳐요. 게임에는 키가 없어요)
// 인터넷이 없거나, 늦거나, 이상한 답이 오면 null 을 돌려주고 게임은 원래대로 흘러가요.
import { AI_URL } from '../config';
import { FAMILY, FX } from '../data/effects';
import type { Customer, Picks, RamenRecord } from '../data/types';
import { isBad } from '../game/naming';
import { pickedList } from '../game/scoring';

type Task = 'react' | 'reason' | 'kind' | 'summary';
let base = AI_URL;
let on = true;

const endpoint = () => {
  const b = base.trim().replace(/\/+$/, '');
  return /\/api\/solar$/.test(b) ? b : b + '/api/solar';
};
// [[단서]] 표시와 두 번째 손님 표시(@1)를 지워요
const plain = (s: string) => s.replace(/\[\[|\]\]/g, '').replace(/^@\d\s*/, '').trim();
const okLine = (t: unknown, max: number): string | null => {
  if (typeof t !== 'string') return null;
  const s = t.trim();
  if (s.length < 4 || s.length > max || isBad(s) || /[A-Za-z]{4,}/.test(s)) return null;
  return s;
};

async function ask(task: Task, data: unknown, ms: number): Promise<Record<string, unknown> | null> {
  if (!ai.ready) return null;
  const ac = new AbortController();
  const tm = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(endpoint(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task, data }), signal: ac.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; } finally { clearTimeout(tm); }
}

export const ai = {
  configure(url: string | undefined, enabled: boolean) { base = (url || AI_URL || '').trim(); on = enabled; },
  get url() { return base; },
  get ready() { return on && !!base && navigator.onLine !== false; },
  // 선생님이 AI를 켜 두었는지 (인터넷과 상관없이)
  get enabled() { return on && !!base; },

  // 선생님 화면 연결 확인
  async check(url?: string): Promise<'ok' | 'nokey' | 'fail'> {
    const save = base;
    if (url !== undefined) base = url.trim() || AI_URL;
    try {
      if (!base) return 'fail';
      const ac = new AbortController();
      const tm = setTimeout(() => ac.abort(), 8000);
      const r = await fetch(endpoint(), { signal: ac.signal }).finally(() => clearTimeout(tm));
      if (!r.ok) return 'fail'; // 서버 오류를 '키가 없어요'로 잘못 알리지 않게
      const j = await r.json();
      return j?.ready ? 'ok' : 'nokey';
    } catch { return 'fail'; } finally { base = save; }
  },

  // 1) 손님이 라면 이름이나 재료를 짚어서 하는 한마디
  async react(c: Customer, picks: Picks, name: string, stars: 1 | 2 | 3): Promise<string | null> {
    const fx = FX.get(c.needs.effect);
    const r = await ask('react', {
      customer: {
        name: c.name,
        story: c.story.map(plain).join(' '),
        need: fx?.name ?? '',
        style: [c.greet, ...c.reactions[stars]].map(plain).filter((l) => l).slice(0, 3),
      },
      said: plain(c.reactions[stars][0] ?? ''), // 바로 앞에 한 말 (되풀이하지 않게)
      stars, ramen: name, ingredients: pickedList(picks).map((i) => i.name),
    }, 25000);
    return okLine(r?.text, 90);
  },

  // 2) 고른 까닭을 넓혀 주는 질문 하나
  async reason(c: Customer, rec: RamenRecord, reason: string): Promise<string | null> {
    const r = await ask('reason', {
      customer: c.name, need: FX.get(c.needs.effect)?.name ?? '', ramen: rec.name,
      ingredients: pickedList(rec.picks).map((i) => i.name), reason: reason.trim().slice(0, 80),
    }, 12000);
    return okLine(r?.text, 80);
  },

  // 3) 손님이 들으면 속상할 이름인지 (모르면 null → 그냥 통과)
  async kind(name: string): Promise<{ ok: boolean; why: string } | null> {
    const r = await ask('kind', { name }, 4500);
    if (!r || typeof r.ok !== 'boolean') return null;
    const why = typeof r.why === 'string' && !isBad(r.why) ? r.why : '';
    return { ok: r.ok, why };
  },

  // 4) 선생님용 학급 요약 (학생 이름은 보내지 않아요)
  async summary(stats: ClassStats): Promise<string | null> {
    const r = await ask('summary', { stats }, 45000);
    const t = typeof r?.text === 'string' ? r.text.trim() : '';
    return t.length > 20 ? t : null;
  },
};

export interface ClassStats {
  owners: number; bowls: number; stars3: number; stars2: number; stars1: number; hearts: number; done10: number;
  topEffects: string[]; hardEffects: string[]; families: string[]; words: string[]; names: string[];
}

const STOP = new Set(['주는', '하는', '되는', '친구', '마음이', '마음을', '라면']);
// 도감 기록으로 학급 통계 만들기 (선생님 화면에서도 그대로 보여 줘요)
export function classStats(owners: number, recs: RamenRecord[], doneOwners: number, need: (r: RamenRecord) => string | undefined): ClassStats {
  const byFx = new Map<string, { n: number; s3: number; sum: number }>();
  const byFam = new Map<string, number>();
  const words = new Map<string, number>();
  for (const r of recs) {
    const id = need(r);
    const fx = id ? FX.get(id) : undefined;
    if (fx) {
      const e = byFx.get(fx.name) ?? { n: 0, s3: 0, sum: 0 };
      e.n++; e.sum += r.stars; if (r.stars === 3) e.s3++;
      byFx.set(fx.name, e);
      const fam = FAMILY.get(fx.family)?.name;
      if (fam) byFam.set(fam, (byFam.get(fam) ?? 0) + 1);
    }
    for (const w of r.name.split(/\s+/)) {
      const k = w.replace(/(친구라면|라면)$/, '').trim();
      if (k.length >= 2 && !STOP.has(k)) words.set(k, (words.get(k) ?? 0) + 1);
    }
  }
  const fxs = [...byFx.entries()];
  return {
    owners, bowls: recs.length,
    stars3: recs.filter((r) => r.stars === 3).length,
    stars2: recs.filter((r) => r.stars === 2).length,
    stars1: recs.filter((r) => r.stars === 1).length,
    hearts: recs.filter((r) => r.heart).length,
    done10: doneOwners,
    topEffects: fxs.filter(([, e]) => e.s3 > 0).sort((a, b) => b[1].s3 - a[1].s3).slice(0, 6).map(([k, e]) => `${k} ${e.n}그릇 중 별 셋 ${e.s3}`),
    hardEffects: fxs.filter(([, e]) => e.n >= 2 && e.sum / e.n < 2.5).sort((a, b) => a[1].sum / a[1].n - b[1].sum / b[1].n).slice(0, 4).map(([k, e]) => `${k} ${e.n}그릇, 별 평균 ${(e.sum / e.n).toFixed(1)}`),
    families: [...byFam.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}그릇`),
    words: [...words.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, n]) => `${k} ${n}번`),
    names: recs.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 30).map((r) => r.name),
  };
}
