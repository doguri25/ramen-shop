// 행사용(어깨동무 마음 요리사 도전) 랭킹 서버 (Vercel, Node)
// - MongoDB Atlas 연결 문자열은 Vercel 환경 변수 MONGODB_URI 에만 둬요. 게임 코드에는 없어요.
// - 학생 한 명(학년-반-번호-이름)이 한 문서예요. 판(10그릇)은 세 번까지 기록해요.
// - 학생 이름은 주소창(쿼리)에 싣지 않도록 모든 요청을 POST 로 받아요.
import { MongoClient } from 'mongodb';

const ORIGINS = (process.env.ALLOW_ORIGINS || 'https://doguri25.github.io').split(',').map((s) => s.trim()).filter(Boolean);
const DB = process.env.MONGODB_DB || 'ramen_event';
const MAX_RUNS = 3;
const ROUNDS = 10;
const AVG_MIN = 10;
const PER_MIN = Number(process.env.RANK_PER_MINUTE || 600); // 한 학교(같은 인터넷 주소)에서 1분에 보낼 수 있는 횟수
const TOP = 50;

// ── 연결 (함수가 살아 있는 동안 다시 써요) ───────────────
let clientP = null;
let indexed = false;
async function students() {
  const uri = process.env.MONGODB_URI;
  if (!uri) return null;
  if (!clientP) clientP = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 6000 }).connect().catch((e) => { clientP = null; throw e; });
  const col = (await clientP).db(DB).collection('students');
  if (!indexed) {
    indexed = true;
    await Promise.all([
      col.createIndex({ band: 1, 'best.total': -1, 'best.fives': -1, 'best.at': 1 }),
      col.createIndex({ band: 1, avg: -1, sumBowls: -1, updatedAt: 1 }),
    ]).catch((e) => { indexed = false; console.warn('index', e?.message); });
  }
  return col;
}

// ── 들어온 값 다듬기 ─────────────────────────────
const int = (v, lo, hi) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
const cleanName = (v) => {
  const s = (typeof v === 'string' ? v : '').normalize('NFC').replace(/\s+/g, '').slice(0, 8);
  return /^[가-힣a-zA-Z0-9]{1,8}$/.test(s) ? s : null;
};
const bandOf = (g) => (g <= 2 ? '12' : g <= 4 ? '34' : '56');
export function who(d) {
  const grade = int(d?.grade, 1, 6), cls = int(d?.cls, 1, 20), num = int(d?.num, 1, 40), name = cleanName(d?.name);
  if (!grade || !cls || !num || !name) return null;
  return { grade, cls, num, name, key: `${grade}-${cls}-${num}-${name}`, band: bandOf(grade) };
}
const runId = (v) => (typeof v === 'string' && /^[a-z0-9]{6,24}$/i.test(v) ? v : null);

// ── 랭킹 줄 ─────────────────────────────────────
const row = (s) => ({ grade: s.grade, cls: s.cls, num: s.num, name: s.name, total: s.best?.total ?? 0, fives: s.best?.fives ?? 0, bowls: s.best?.bowls ?? 0, avg: s.avg ?? 0, allBowls: s.sumBowls ?? 0 });
const status = (s) => ({ runs: s?.runs?.length ?? 0, best: s?.best ?? null, sumStars: s?.sumStars ?? 0, sumBowls: s?.sumBowls ?? 0, avg: s?.avg ?? 0, list: (s?.runs ?? []).map((r) => ({ runNo: r.runNo, bowls: r.bowls, total: r.total, fives: r.fives, done: r.done })) });
const better = (a, b) => (a.total !== b.total ? a.total > b.total : a.fives !== b.fives ? a.fives > b.fives : a.at < b.at);

export async function rankOf(col, s, by) {
  if (!s) return null;
  if (by === 'avg') {
    if ((s.sumBowls ?? 0) < AVG_MIN) return null;
    const n = await col.countDocuments({ band: s.band, sumBowls: { $gte: AVG_MIN }, $or: [{ avg: { $gt: s.avg } }, { avg: s.avg, sumBowls: { $gt: s.sumBowls } }, { avg: s.avg, sumBowls: s.sumBowls, updatedAt: { $lt: s.updatedAt } }] });
    return n + 1;
  }
  const b = s.best;
  if (!b || !b.total) return null;
  const n = await col.countDocuments({ band: s.band, $or: [{ 'best.total': { $gt: b.total } }, { 'best.total': b.total, 'best.fives': { $gt: b.fives } }, { 'best.total': b.total, 'best.fives': b.fives, 'best.at': { $lt: b.at } }] });
  return n + 1;
}

// 한 그릇 끓일 때마다 판 기록을 올려요 (같은 판은 늘어나기만 해요)
export async function saveRun(col, w, d) {
  const id = runId(d?.runId), runNo = int(d?.runNo, 1, MAX_RUNS);
  const bowls = int(d?.bowls, 1, ROUNDS), total = int(d?.total, 1, 5 * ROUNDS), fives = int(d?.fives, 0, ROUNDS);
  if (!id || !runNo || !bowls || !total || fives === null) return { error: 'bad_run' };
  if (total < bowls || total > 5 * bowls || fives > bowls || fives * 5 > total) return { error: 'bad_run' };
  const done = d?.done === true && bowls === ROUNDS;
  const now = Date.now();

  for (let tries = 0; tries < 4; tries++) {
    const s = await col.findOne({ _id: w.key });
    const runs = s?.runs ? s.runs.map((r) => ({ ...r })) : [];
    let r = runs.find((x) => x.runId === id);
    if (!r) {
      if (runs.length >= MAX_RUNS) return { error: 'max_runs', status: status(s) };
      r = { runId: id, runNo: runs.length + 1, bowls: 0, total: 0, fives: 0, done: false, startedAt: now, at: now };
      runs.push(r);
    }
    if (r.done || bowls < r.bowls || total < r.total || fives < r.fives || bowls - r.bowls > ROUNDS) {
      // 이미 받은 기록보다 작으면 (같은 그릇을 두 번 보냈을 때) 그대로 두고 지금 기록을 알려 줘요
      return { ok: true, same: true, runNo: r.runNo, status: status(s) };
    }
    if (bowls === r.bowls && total === r.total && fives === r.fives && done === r.done) return { ok: true, same: true, runNo: r.runNo, status: status(s) };
    const addStars = total - r.total, addBowls = bowls - r.bowls;
    Object.assign(r, { bowls, total, fives, done, at: now });
    // 세 판 가운데 가장 좋은 판 (별이 같으면 별 다섯 그릇이 많은 판, 그것도 같으면 먼저 낸 판)
    const best = runs.map((x) => ({ total: x.total, fives: x.fives, bowls: x.bowls, runNo: x.runNo, at: x.at })).reduce((a, b) => (better(b, a) ? b : a));
    const sumStars = (s?.sumStars ?? 0) + addStars, sumBowls = (s?.sumBowls ?? 0) + addBowls;
    const doc = {
      grade: w.grade, cls: w.cls, num: w.num, name: w.name, band: w.band,
      runs, best, sumStars, sumBowls, avg: sumBowls ? Math.round((sumStars / sumBowls) * 100) / 100 : 0,
      createdAt: s?.createdAt ?? now, updatedAt: now, v: (s?.v ?? 0) + 1,
    };
    try {
      if (!s) await col.insertOne({ _id: w.key, ...doc });
      else {
        const u = await col.replaceOne({ _id: w.key, v: s.v ?? 0 }, doc);
        if (!u.matchedCount) continue; // 다른 태블릿이 먼저 고쳤으면 다시 읽어요
      }
    } catch (e) {
      if (e?.code === 11000) continue; // 같은 학생이 동시에 처음 등록됐어요
      throw e;
    }
    const me = { ...doc, _id: w.key };
    return { ok: true, runNo: r.runNo, status: status(me), rank: await rankOf(col, me, 'total') };
  }
  return { error: 'busy' };
}

export async function board(col, band, by, w) {
  const q = by === 'avg' ? { band, sumBowls: { $gte: AVG_MIN } } : { band, 'best.total': { $gt: 0 } };
  const sort = by === 'avg' ? { avg: -1, sumBowls: -1, updatedAt: 1 } : { 'best.total': -1, 'best.fives': -1, 'best.at': 1 };
  const [list, count] = await Promise.all([col.find(q).sort(sort).limit(TOP).toArray(), col.countDocuments(q)]);
  const rows = list.map((s, i) => ({ rank: i + 1, ...row(s), me: !!w && s._id === w.key }));
  let me = null;
  if (w && w.band === band) {
    const s = await col.findOne({ _id: w.key });
    if (s) me = { ...row(s), rank: await rankOf(col, s, by), need: by === 'avg' ? Math.max(0, AVG_MIN - (s.sumBowls ?? 0)) : 0 };
  }
  return { ok: true, band, by, rows, count, me };
}

// ── 지켜 주는 것 ─────────────────────────────────
const hits = new Map();
function allow(ip) {
  const m = Math.floor(Date.now() / 60000);
  const k = ip + ':' + m;
  const n = (hits.get(k) ?? 0) + 1;
  hits.set(k, n);
  if (hits.size > 5000) for (const key of hits.keys()) if (!key.endsWith(':' + m)) hits.delete(key);
  return n <= PER_MIN;
}
function cors(res, origin) {
  const ok = ORIGINS.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  res.setHeader('Access-Control-Allow-Origin', ok ? origin : ORIGINS[0]);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Cache-Control', 'no-store');
  return ok;
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  const ok = cors(res, origin);
  if (req.method === 'OPTIONS') return res.status(204).end();
  // 연결 확인: 연결 문자열은 절대 돌려주지 않아요
  if (req.method === 'GET') {
    let db = false;
    try { const col = await students(); if (col) { await col.estimatedDocumentCount(); db = true; } } catch (e) { console.warn('db', e?.message); }
    return res.status(200).json({ ok: true, ready: db, hasUri: !!process.env.MONGODB_URI });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  if (origin && !ok) return res.status(403).json({ error: 'origin' });
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (!allow(ip)) return res.status(429).json({ error: 'busy' });

  let d = req.body;
  if (typeof d === 'string') { if (d.length > 4000) return res.status(413).json({ error: 'too_big' }); try { d = JSON.parse(d); } catch { return res.status(400).json({ error: 'bad_json' }); } }
  if (!d || typeof d !== 'object') return res.status(400).json({ error: 'bad_json' });

  let col;
  try { col = await students(); } catch (e) { console.warn('connect', e?.message); return res.status(503).json({ error: 'no_db' }); }
  if (!col) return res.status(503).json({ error: 'no_db' });

  try {
    if (d.op === 'board') {
      const band = ['12', '34', '56'].includes(d.band) ? d.band : null;
      if (!band) return res.status(400).json({ error: 'bad_band' });
      return res.status(200).json(await board(col, band, d.by === 'avg' ? 'avg' : 'total', d.who ? who(d.who) : null));
    }
    const w = who(d.who);
    if (!w) return res.status(400).json({ error: 'bad_who' });
    if (d.op === 'status') {
      const s = await col.findOne({ _id: w.key });
      return res.status(200).json({ ok: true, status: status(s), rank: await rankOf(col, s, 'total') });
    }
    if (d.op === 'run') {
      const r = await saveRun(col, w, d.run);
      return res.status(r.error === 'bad_run' ? 400 : r.error === 'busy' ? 409 : 200).json(r);
    }
    return res.status(400).json({ error: 'bad_op' });
  } catch (e) {
    console.warn('rank', e?.message);
    return res.status(500).json({ error: 'fail' });
  }
}
