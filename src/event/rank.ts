// 행사용 랭킹 서버와 이야기해요 (버셀 → MongoDB Atlas)
// 인터넷이 잠깐 끊겨도 기록을 잃지 않게, 판마다 가장 최근 기록을 태블릿에 모아 두었다가 다시 보내요.
import { RANK_URL } from '../config';
import { EVENT } from './flag';

export interface Who { grade: number; cls: number; num: number; name: string }
export interface RunSend { runId: string; runNo: number; bowls: number; total: number; fives: number; done: boolean }
export interface Best { total: number; fives: number; bowls: number; runNo: number; at: number }
export interface Status { runs: number; best: Best | null; sumStars: number; sumBowls: number; avg: number; list: { runNo: number; bowls: number; total: number; fives: number; done: boolean }[] }
export type Band = '12' | '34' | '56';
export type By = 'total' | 'avg';
export interface Row { rank: number; grade: number; cls: number; num: number; name: string; total: number; fives: number; bowls: number; avg: number; allBowls: number }
export interface Board { band: Band; by: By; rows: Row[]; count: number }
export interface ClassRow { rank: number; grade: number; cls: number; students: number; total: number; fives: number; avg: number; bowls: number }
export interface ClassBoard { by: By; rows: ClassRow[]; count: number; min: number }
// 랭킹을 못 받았을 때: 암호가 틀림 / 서버에 암호가 아직 없음 / 여러 번 틀려 잠깐 막힘 / 인터넷
export type RankErr = 'bad_key' | 'no_admin_key' | 'too_many' | 'offline';
export interface RosterRow { num: number; name: string; runs: number; done: number; at?: number }
export interface SendResult { ok?: boolean; same?: boolean; error?: string; runNo?: number; status?: Status }

export const bandOf = (grade: number): Band => (grade <= 2 ? '12' : grade <= 4 ? '34' : '56');
export const keyOf = (w: Who) => `${w.grade}-${w.cls}-${w.num}-${w.name}`;
export const BAND_NAME: Record<Band, string> = { '12': '1~2학년', '34': '3~4학년', '56': '5~6학년' };

const Q = 'event-rank-queue';
interface Item { who: Who; run: RunSend }
const readQ = (): Record<string, Item> => { try { return JSON.parse(localStorage.getItem(Q) || '{}'); } catch { return {}; } };
const writeQ = (q: Record<string, Item>) => { try { localStorage.setItem(Q, JSON.stringify(q)); } catch { /* 저장 못 해도 이번에는 그냥 보내요 */ } };

const KEY = 'event-rank-key'; // 선생님 기기에만 기억하는 랭킹 암호

async function post<T>(body: unknown, ms = 8000): Promise<T | null> {
  if (!RANK_URL) return null;
  const ac = new AbortController();
  const tm = setTimeout(() => ac.abort(), ms);
  try {
    // text/plain 으로 보내면 브라우저가 미리 묻는 요청(OPTIONS)을 건너뛰어 학교 와이파이에서 더 빨라요
    const r = await fetch(RANK_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), signal: ac.signal });
    if (r.status === 429 && (body as { key?: string }).key) return await r.json(); // 선생님 암호를 여러 번 틀렸어요
    if (r.status >= 500 || r.status === 429 || r.status === 409) return null; // 다시 보내 볼 만한 실패
    return await r.json();
  } catch { return null; } finally { clearTimeout(tm); }
}

const err = (r: { error?: string } | null): RankErr =>
  r?.error === 'bad_key' || r?.error === 'no_admin_key' || r?.error === 'too_many' ? r.error : 'offline';

let flushing: Promise<void> | null = null;
const listeners = new Set<(runId: string, r: SendResult) => void>();

export const rank = {
  // 이 학생이 몇 판을 했는지, 최고 기록이 얼마인지
  async status(w: Who): Promise<{ status: Status } | null> {
    const r = await post<{ ok: boolean; status: Status }>({ op: 'status', who: w }, 6000);
    return r?.ok ? { status: r.status } : null;
  },

  // 이 반에서 이미 이름을 쓰고 들어온 번호들
  async roster(grade: number, cls: number): Promise<RosterRow[] | null> {
    const r = await post<{ ok: boolean; rows: RosterRow[] }>({ op: 'roster', grade, cls }, 5000);
    return r?.ok ? r.rows : null;
  },

  // ── 선생님만: 개인 랭킹, 반 랭킹 (암호가 있어야 받아요) ──
  async board(band: Band, by: By, key: string): Promise<Board | RankErr> {
    const r = await post<Board & { ok?: boolean; error?: string }>({ op: 'board', band, by, key }, 9000);
    return r?.ok ? r : err(r);
  },
  async classes(by: By, key: string): Promise<ClassBoard | RankErr> {
    const r = await post<ClassBoard & { ok?: boolean; error?: string }>({ op: 'classes', by, key }, 9000);
    return r?.ok ? r : err(r);
  },
  savedKey(): string { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } },
  saveKey(k: string) { try { if (k) localStorage.setItem(KEY, k); else localStorage.removeItem(KEY); } catch { /* 이번만 써요 */ } },

  // 한 그릇 끓일 때마다 불러요. 보내지 못하면 모아 두었다가 다음에 다시 보내요
  async submit(w: Who, run: RunSend): Promise<SendResult | null> {
    const q = readQ();
    q[run.runId] = { who: w, run };
    writeQ(q);
    return rank.flush(run.runId);
  },

  // 모아 둔 기록을 보내요. 지정한 판의 결과를 돌려줘요
  async flush(want?: string): Promise<SendResult | null> {
    let mine: SendResult | null = null;
    const run = async () => {
      const q = readQ();
      for (const [id, it] of Object.entries(q)) {
        const r = await post<SendResult>({ op: 'run', who: it.who, run: it.run });
        if (!r) continue; // 인터넷 문제: 다음에 다시
        // 보내는 사이 더 새 기록이 들어왔으면 그것은 남겨 둬요
        const now = readQ();
        if (now[id] && now[id].run.bowls === it.run.bowls && now[id].run.total === it.run.total && now[id].run.done === it.run.done) { delete now[id]; writeQ(now); }
        listeners.forEach((f) => f(id, r));
        if (id === want) mine = r;
      }
    };
    // 동시에 두 번 보내지 않게 줄을 세워요
    const prev = flushing;
    const p = (async () => { if (prev) await prev.catch(() => {}); await run(); })();
    flushing = p;
    await p.catch(() => {});
    if (flushing === p) flushing = null;
    return mine;
  },

  pending(): number { return Object.keys(readQ()).length; },
  onResult(f: (runId: string, r: SendResult) => void) { listeners.add(f); return () => listeners.delete(f); },
};

// 인터넷이 다시 되면 모아 둔 기록을 보내요
if (EVENT && typeof window !== 'undefined') {
  window.addEventListener('online', () => { rank.flush(); });
  setInterval(() => { if (rank.pending() && navigator.onLine !== false) rank.flush(); }, 60000);
}
