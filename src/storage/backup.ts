// 기록 옮기기 (수업용): 이 태블릿의 사장님, 라면 기록, 도감 사진, 마음 골목 기록을 파일 하나로 내보내고
// 다른 태블릿에서 불러와 합쳐요. 합칠 때 원래 있던 기록은 지우지 않아요.
import { db } from './db';
import { CUS } from '../data/customers';
import { CUS_14 } from '../data/customers14';
import type { Amount, FinishPick, GimbapRec, Owner, Picks, RamenRecord, Treat } from '../data/types';

const MAGIC = 'ramen-shop-records';
const ALLEY = ['folk', 'shop', 'quest', 'badge'] as const;
type AlleyKey = (typeof ALLEY)[number];
interface Pack {
  app: typeof MAGIC;
  v: 1;
  at: number;
  owners: Owner[];
  records: Record<string, RamenRecord[]>;
  photos: Record<string, { t: string; d: string }>;
  alley: Record<string, Partial<Record<AlleyKey, string>>>;
}

export interface ExportResult { blob: Blob; name: string; owners: number; bowls: number; photos: number }
export interface ImportResult { owners: number; added: number; merged: number; bowls: number; photos: number; byName: string[]; sameNo: string[] }

const lsKey = (k: AlleyKey, id: string) => `ramen-alley-${k}:${id}`;
const lsGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* 저장 못 해도 계속해요 */ } };
const parse = (s: unknown): unknown => { if (typeof s !== 'string') return undefined; try { return JSON.parse(s); } catch { return undefined; } };

const toB64 = (b: Blob) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1] ?? '');
  r.onerror = () => rej(r.error);
  r.readAsDataURL(b);
});
const fromB64 = (d: string, t: string) => {
  const bin = atob(d), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Blob([u], { type: t });
};
const two = (n: number) => String(n).padStart(2, '0');

export function downloadBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = href; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}

// ── 파일 검사·정리: 망가지거나 손댄 파일이 들어와도 앱이 깨지지 않게 모양을 맞춰서만 받아요 ──
type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => !!x && typeof x === 'object' && !Array.isArray(x);
const isStr = (x: unknown): x is string => typeof x === 'string' && x.length > 0;
const strOrNull = (x: unknown) => (typeof x === 'string' && x ? x : null);
const strs = (x: unknown) => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string' && v.length > 0) : []);
const int0 = (x: unknown) => (typeof x === 'number' && Number.isInteger(x) && x >= 0 ? x : 0);
const time = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : Date.now());
const AMOUNTS: readonly Amount[] = ['한 꼬집', '한 숟가락', '두 숟가락', '한 국자'];
// 수업용 손님 72명(+연습 손님) 전부. 이 목록에 없는 손님 기록만 건너뛰어요
const KNOWN = new Set([...CUS.keys(), ...CUS_14.keys()]);

function cleanPicks(x: unknown): Picks {
  const p = isObj(x) ? x : {};
  const finish = Array.isArray(p.finish) ? p.finish.filter((f): f is FinishPick => isObj(f) && isStr(f.id) && AMOUNTS.includes(f.amount as Amount)) : [];
  return { broth: strOrNull(p.broth), noodle: strOrNull(p.noodle), soup: strOrNull(p.soup), toppings: strs(p.toppings), finish };
}
function cleanGimbap(x: unknown): GimbapRec | undefined {
  if (!isObj(x) || !isObj(x.picks)) return undefined;
  const p = x.picks;
  return { picks: { rice: strOrNull(p.rice), gim: strOrNull(p.gim), fills: strs(p.fills), top: strOrNull(p.top) }, name: typeof x.name === 'string' ? x.name : '마음 김밥', stamp: x.stamp === true, effect: strOrNull(x.effect) };
}
function cleanTreat(x: unknown): Treat | undefined {
  if (!isObj(x) || !isStr(x.photoKey) || !isStr(x.mood)) return undefined;
  const helpers = Array.isArray(x.helpers) ? x.helpers.filter((v): v is Treat['helpers'][number] => isObj(v) && isStr(v.id) && typeof v.ing === 'string' && typeof v.line === 'string') : [];
  return { mood: x.mood, name: typeof x.name === 'string' ? x.name : '', picks: cleanPicks(x.picks), helpers, photoKey: x.photoKey, at: time(x.at) };
}
function cleanOwner(x: unknown): Owner | null {
  if (!isObj(x) || !isStr(x.id) || x.ev) return null; // 행사용 기록은 옮기지 않아요
  const number = Number(x.number), name = typeof x.name === 'string' ? x.name.trim().slice(0, 20) : '';
  if (!Number.isInteger(number) || number < 0 || !name) return null;
  const o: Owner = { id: x.id, number, name, round: int0(x.round), order: strs(x.order), tutorialDone: x.tutorialDone === true, createdAt: time(x.createdAt) };
  const visits = strs(x.visits), treat = cleanTreat(x.treat);
  if (visits.length) o.visits = visits;
  if (treat) o.treat = treat;
  return o;
}
function cleanRecord(x: unknown): RamenRecord | null {
  if (!isObj(x) || !isStr(x.id) || !isStr(x.customerId) || !KNOWN.has(x.customerId)) return null;
  const stars = typeof x.stars === 'number' && Number.isFinite(x.stars) ? Math.min(3, Math.max(1, Math.round(x.stars))) : 1;
  const r: RamenRecord = { id: x.id, ownerId: '', round: int0(x.round), customerId: x.customerId, picks: cleanPicks(x.picks), name: typeof x.name === 'string' && x.name.trim() ? x.name : '마음 라면', stars, heart: x.heart === true, photoKey: isStr(x.photoKey) ? x.photoKey : x.id, createdAt: time(x.createdAt) };
  if (typeof x.promise === 'string' && x.promise) r.promise = x.promise;
  const g = cleanGimbap(x.gimbap);
  if (g) r.gimbap = g;
  return r;
}

export async function exportRecords(onProgress?: (done: number, total: number) => void): Promise<ExportResult> {
  const owners = (await db.owners()).filter((o) => !o.ev);
  const records: Pack['records'] = {}, alley: Pack['alley'] = {};
  const keys: string[] = [];
  let bowls = 0;
  for (const o of owners) {
    const rs = await db.records(o.id);
    records[o.id] = rs;
    bowls += rs.length;
    for (const r of rs) if (r.photoKey) keys.push(r.photoKey);
    if (o.treat?.photoKey) keys.push(o.treat.photoKey);
    const a: Partial<Record<AlleyKey, string>> = {};
    for (const k of ALLEY) { const v = lsGet(lsKey(k, o.id)); if (v) a[k] = v; }
    if (Object.keys(a).length) alley[o.id] = a;
  }
  // 사진은 한 장씩 조각으로 이어 붙여요 (반 전체를 문자열 하나로 만들면 메모리가 몇 배로 들어요)
  const head: Omit<Pack, 'photos'> = { app: MAGIC, v: 1, at: Date.now(), owners, records, alley };
  const parts: BlobPart[] = [JSON.stringify(head).slice(0, -1), ',"photos":{'];
  let n = 0, count = 0;
  for (let i = 0; i < keys.length; i += 40) {
    const chunk = keys.slice(i, i + 40), blobs = await db.photos(chunk);
    for (let j = 0; j < chunk.length; j++) {
      const b = blobs[j];
      if (b) parts.push((count++ ? ',' : '') + JSON.stringify(chunk[j]) + ':{"t":' + JSON.stringify(b.type || 'image/webp') + ',"d":"', await toB64(b), '"}');
      onProgress?.(++n, keys.length);
    }
  }
  parts.push('}}');
  const d = new Date();
  const name = `마음라면_기록_${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}_${owners.length}명.json`;
  return { blob: new Blob(parts, { type: 'application/json' }), name, owners: owners.length, bowls, photos: count };
}

// 마음 골목 기록 합치기: 도장·끝낸 미션·마음 배지는 모두 모으고, 가게 봐 주기는 더 좋은 기록을 남겨요
function mergeAlley(id: string, src: Obj) {
  const folkIn = strs(parse(src.folk));
  if (folkIn.length) lsSet(lsKey('folk', id), JSON.stringify([...new Set([...strs(parse(lsGet(lsKey('folk', id)))), ...folkIn])]));
  const shopIn = parse(src.shop);
  if (isObj(shopIn)) {
    const mine = parse(lsGet(lsKey('shop', id)));
    const out: Record<string, { best: number; times: number }> = {};
    for (const [k, v] of Object.entries(isObj(mine) ? mine : {})) if (isObj(v) && typeof v.best === 'number') out[k] = { best: v.best, times: int0(v.times) };
    for (const [k, v] of Object.entries(shopIn)) {
      if (!isObj(v) || typeof v.best !== 'number' || !Number.isFinite(v.best)) continue;
      const m = out[k];
      out[k] = m ? { best: Math.max(m.best, v.best), times: Math.max(m.times, int0(v.times)) } : { best: v.best, times: int0(v.times) };
    }
    lsSet(lsKey('shop', id), JSON.stringify(out));
  }
  const qIn = parse(src.quest);
  if (isObj(qIn)) {
    const qm = parse(lsGet(lsKey('quest', id))), a = isObj(qm) ? qm : {};
    const done = [...new Set([...strs(a.done), ...strs(qIn.done)])];
    const ok = (c: unknown): c is { id: string; step: number; got?: string[] } => isObj(c) && isStr(c.id) && !done.includes(c.id);
    // 하는 중인 미션: 이 태블릿에서 하던 걸 먼저 이어 가요
    const c = [a.cur, qIn.cur].find(ok);
    lsSet(lsKey('quest', id), JSON.stringify(c ? { done, cur: { id: c.id, step: int0(c.step), got: strs(c.got) } } : { done }));
  }
  const bIn = parse(src.badge);
  if (isObj(bIn)) {
    const bm = parse(lsGet(lsKey('badge', id))), a = isObj(bm) ? bm : {};
    const out: Record<string, unknown> = {};
    for (const k of ['got', 'feel', 'veg', 'kind', 'tods', 'houses', 'walkers']) out[k] = [...new Set([...strs(a[k]), ...strs(bIn[k])])];
    const nums = (x: unknown) => (Array.isArray(x) ? x.filter((v): v is number => Number.isInteger(v) && v >= 0 && v < 64) : []);
    out.towns = [...new Set([...nums(a.towns), ...nums(bIn.towns)])];
    out.bridge = a.bridge || bIn.bridge ? 1 : 0;
    lsSet(lsKey('badge', id), JSON.stringify(out));
  }
}

export async function importRecords(file: File, onProgress?: (done: number, total: number) => void): Promise<ImportResult> {
  let raw: unknown;
  // 아주 큰 파일을 이 기기가 다 못 읽으면 '다른 파일'이 아니라 '너무 커요'로 알려요
  try { raw = JSON.parse(await file.text()); } catch { throw new Error(file.size > 40e6 ? 'big' : 'format'); }
  if (!isObj(raw) || raw.app !== MAGIC || !Array.isArray(raw.owners)) throw new Error('format');
  // 쓰기 전에 파일 전체를 먼저 검사·정리해요
  const list = raw.owners.map(cleanOwner).filter((o): o is Owner => !!o);
  if (!list.length) throw new Error('empty');
  const recIn = isObj(raw.records) ? raw.records : {}, photoIn = isObj(raw.photos) ? raw.photos : {}, alleyIn = isObj(raw.alley) ? raw.alley : {};
  const recsOf = (oid: string) => (Array.isArray(recIn[oid]) ? (recIn[oid] as unknown[]) : []).map(cleanRecord).filter((r): r is RamenRecord => !!r);
  let cur: Owner[];
  try { cur = await db.ownersOrThrow(); } catch { throw new Error('read'); }
  const key = (o: Owner) => `${o.number}|${o.name.trim()}`, label = (o: Owner) => `${o.number}번 ${o.name}`;
  const byId = new Map(cur.map((o) => [o.id, o])), byNm = new Map(cur.filter((o) => !o.ev).map((o) => [key(o), o]));
  const fresh: Owner[] = [], byName: string[] = [], sameNo: string[] = [];
  // 이 태블릿에 없는 사진만 넣어요. 지난번에 사진만 못 넣었어도 같은 파일을 다시 불러오면 채워져요
  const putPhoto = async (k: string | undefined) => {
    const ph = k ? photoIn[k] : undefined;
    if (!k || !isObj(ph) || typeof ph.d !== 'string' || (await db.photo(k))) return 0;
    let blob: Blob;
    try { blob = fromB64(ph.d, typeof ph.t === 'string' ? ph.t : 'image/webp'); } catch { return 0; } // 망가진 사진 하나는 건너뛰어요
    if (!(await db.savePhoto(k, blob))) throw new Error('space');
    return 1;
  };
  let added = 0, merged = 0, bowls = 0, photos = 0, n = 0;
  // 중간에 멈춰도(저장 공간 등) 그때까지 불러온 사장님은 목록에 남겨요
  try {
    for (const o of list) {
      // 같은 사장님은 id로, 다른 태블릿에서 따로 등록했으면 번호와 이름으로 알아봐요
      const mine = byId.get(o.id) ?? byNm.get(key(o));
      if (mine && mine.id !== o.id) byName.push(label(mine));
      if (!mine && cur.some((c) => !c.ev && c.number === o.number)) sameNo.push(label(o));
      const id = mine ? mine.id : o.id;
      const fileRecs = recsOf(o.id).map((r) => ({ ...r, ownerId: id }));
      const have = await db.records(id), haveIds = new Set(have.map((r) => r.id));
      const recs = fileRecs.filter((r) => !haveIds.has(r.id));
      if (recs.length && !(await db.saveRecords(id, recs))) throw new Error('space');
      bowls += recs.length;
      for (const r of fileRecs) photos += await putPhoto(r.photoKey);
      const total = haveIds.size + recs.length; // 합친 뒤 그릇 수
      if (mine) {
        // 끓인 그릇 수는 두 기록과 합친 그릇 수 중 큰 값, 다시 들른 손님 기록은 합쳐요
        mine.round = Math.max(int0(mine.round), o.round, total);
        mine.tutorialDone = mine.tutorialDone || o.tutorialDone;
        if (o.visits?.length) mine.visits = [...new Set([...(mine.visits ?? []), ...o.visits])];
        if (!mine.treat && o.treat) mine.treat = o.treat;
        if (o.treat && mine.treat?.photoKey === o.treat.photoKey) photos += await putPhoto(o.treat.photoKey);
        merged++;
      } else {
        const no: Owner = { ...o, round: Math.max(o.round, total) };
        fresh.push(no);
        byId.set(id, no); byNm.set(key(no), no);
        if (no.treat) photos += await putPhoto(no.treat.photoKey);
        added++;
      }
      if (isObj(alleyIn[o.id])) mergeAlley(id, alleyIn[o.id] as Obj);
      onProgress?.(++n, list.length);
    }
  } finally {
    if (!(await db.saveOwners([...cur, ...fresh]))) throw new Error('space');
  }
  return { owners: list.length, added, merged, bowls, photos, byName, sameNo };
}
