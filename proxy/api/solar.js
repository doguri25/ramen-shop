// 후루룩 친구라면 가게 ↔ 업스테이지 Solar 중계 서버 (Vercel)
// - 업스테이지 키는 Vercel 환경 변수 UPSTAGE_API_KEY 에만 둬요. 게임 코드에는 키가 없어요.
// - 무엇을 물어볼지(프롬프트)는 이 파일이 정해요. 게임은 정해진 네 가지 일과 재료만 보낼 수 있어요.
//   그래서 누가 이 주소를 알아내도 아무 질문이나 시킬 수는 없어요.
export const config = { runtime: 'edge' };

const UPSTAGE_URL = process.env.UPSTAGE_URL || 'https://api.upstage.ai/v1/chat/completions';
const ORIGINS = (process.env.ALLOW_ORIGINS || 'https://doguri25.github.io').split(',').map((s) => s.trim()).filter(Boolean);
const PER_MIN = Number(process.env.PER_MINUTE || 150); // 한 학교(같은 인터넷 주소)에서 1분에 보낼 수 있는 횟수
const PER_DAY = Number(process.env.PER_DAY || 4000); // 하루 전체 횟수 (서버 한 대 기준, 대략)

const FAST = process.env.MODEL_FAST || 'solar-mini4';
const SMART = process.env.MODEL_SMART || 'solar-pro4';

// ── 들어온 값 다듬기 ─────────────────────────────
const str = (v, n) => (typeof v === 'string' ? v : '').replace(/[\u0000-\u001f<>`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const strs = (v, n, k) => (Array.isArray(v) ? v.slice(0, k).map((x) => str(x, n)).filter(Boolean) : []);
const int = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));

// ── 쓰기 규칙 (선생님이 바라는 문체) ─────────────────
const KID = [
  '초등학교 3학년이 읽어요. 쉬운 낱말로 짧게 써요.',
  '영어, 이모지, 따옴표, 마크다운, 괄호 설명은 쓰지 않아요.',
  '병이나 치료, 진단 이야기는 하지 않아요. 무섭거나 슬픈 말을 덧붙이지 않아요.',
  '이름·학교·사는 곳 같은 개인 정보는 묻지 않아요.',
].join(' ');
const TEACHER_STYLE = [
  '사람이 쓴 것처럼 자연스러운 문장으로 써요.',
  '"~를 통해", "~에 있어서", "결론적으로", "첫째·둘째", "~가 아니라 ~다" 같은 표현과 과장된 칭찬은 쓰지 않아요.',
  '주어진 숫자와 사실만 쓰고, 없는 사실을 지어내지 않아요.',
].join(' ');

// ── 네 가지 일 ───────────────────────────────────
const TASKS = {
  // 1) 손님 맞춤 반응: 손님이 학생이 지은 라면 이름이나 재료를 짚어서 한마디
  react(d) {
    const c = d.customer || {};
    const name = str(c.name, 20), ramen = str(d.ramen, 30);
    if (!name || !ramen) return null;
    const stars = int(d.stars, 1, 3);
    const mood = { 1: '고맙지만 마음이 아직 다 풀리지는 않았어요.', 2: '마음이 꽤 가벼워졌어요.', 3: '마음이 활짝 풀렸어요.' }[stars];
    return {
      model: FAST, max: 800, temp: 0.8,
      system: [
        `너는 동네 라면 가게에 온 손님 "${name}"이야. 방금 학생 사장님이 끓여 준 라면을 다 먹었어.`,
        `네 고민: ${str(c.story, 300)}`,
        `네가 바라던 마음: ${str(c.need, 20)}. 지금 기분: ${mood}`,
        `네 말투 예시: ${strs(c.style, 80, 3).join(' / ')}. 이 말투(반말·존댓말, 끝맺음)를 그대로 따라 해.`,
        '라면 이름이나 넣은 재료 하나를 콕 집어서, 그게 네 마음에 어떻게 닿았는지 한 문장으로 말해. 45자 안팎, 길어도 60자를 넘기지 마.',
        '별·점수·게임 이야기는 하지 마. 대사만 써.',
        KID,
      ].join('\n'),
      user: `라면 이름: ${ramen}\n넣은 재료: ${strs(d.ingredients, 20, 9).join(', ')}`,
      out: 'line',
    };
  },
  // 2) 고른 까닭 도우미: 대신 써 주지 않고, 생각을 넓히는 질문 하나
  reason(d) {
    const ramen = str(d.ramen, 30);
    if (!ramen) return null;
    const reason = str(d.reason, 80);
    return {
      model: FAST, max: 700, temp: 0.7,
      system: [
        '너는 초등학교 3학년 학생의 글쓰기를 돕는 다정한 선생님이야.',
        '학생은 자기가 끓인 친구라면을 대표 라면으로 고르고, 그 까닭을 "…때문이에요."로 끝나는 한 문장으로 쓰는 중이야.',
        '절대로 대신 써 주거나 고친 문장을 보여 주지 마. 학생이 스스로 더 생각해 볼 수 있게 묻는 질문 하나만 해.',
        '질문은 반말로, 35자 안팎, 물음표로 끝나. 학생이 쓴 낱말 하나를 이어받으면 좋아.',
        reason ? '학생 글이 이미 충분하면 칭찬 대신 "누구에게 끓여 주고 싶은지" 같은 다음 생각으로 이어 줘.' : '학생이 아직 아무것도 안 썼으면 쓰기 시작할 수 있게 쉬운 질문을 해.',
        KID,
      ].join('\n'),
      user: `손님: ${str(d.customer, 20)} (바라던 마음: ${str(d.need, 20)})\n라면 이름: ${ramen}\n넣은 재료: ${strs(d.ingredients, 20, 9).join(', ')}\n학생이 쓴 까닭: ${reason || '(아직 없음)'}`,
      out: 'line',
    };
  },
  // 3) 고운 말 검사: 손님이 들으면 속상할 이름인지
  kind(d) {
    const name = str(d.name, 30);
    if (!name) return null;
    return {
      model: FAST, max: 700, temp: 0,
      system: [
        '너는 초등학교 3학년 교실 게임의 말 검사 도우미야. 학생이 지은 라면 이름을 손님에게 그대로 들려줘도 되는지 판단해.',
        '안 되는 경우: 욕설이나 비속어(초성·변형 포함), 놀림·비하·외모 평가, 성적인 말, 폭력·죽음, 특정 친구나 실제 사람을 놀리는 말, 유행하는 혐오 표현.',
        '괜찮은 경우: 화·슬픔·걱정 같은 감정 낱말, 장난스럽지만 따뜻한 말, 엉뚱한 말, 맞춤법이 틀린 말. 애매하면 괜찮다고 해.',
        'ok가 false이면 why에 학생에게 들려줄 부드러운 한 문장(30자 안팎, 반말)을 써. ok가 true이면 why는 빈 문자열.',
        'JSON으로만 답해.',
      ].join('\n'),
      user: `라면 이름: ${name}`,
      out: 'json',
      schema: { name: 'kind_check', strict: true, schema: { type: 'object', additionalProperties: false, required: ['ok', 'why'], properties: { ok: { type: 'boolean' }, why: { type: 'string' } } } },
    };
  },
  // 4) 선생님용 학급 요약
  summary(d) {
    const s = d.stats || {};
    const facts = {
      사장님_수: int(s.owners, 0, 60),
      끓인_그릇: int(s.bowls, 0, 5000),
      별: { 셋: int(s.stars3, 0, 5000), 둘: int(s.stars2, 0, 5000), 하나: int(s.stars1, 0, 5000) },
      하트_도장: int(s.hearts, 0, 5000),
      열_그릇_채운_사장님: int(s.done10, 0, 60),
      많이_맞힌_마음: strs(s.topEffects, 30, 8),
      어려워한_마음: strs(s.hardEffects, 30, 6),
      마음_묶음별_그릇: strs(s.families, 30, 8),
      자주_쓴_이름_낱말: strs(s.words, 20, 15),
      라면_이름_예: strs(s.names, 30, 30),
    };
    return {
      model: SMART, max: 1800, temp: 0.4,
      system: [
        '너는 초등학교 3학년 담임 선생님을 돕는 조수야. 마음 건강 수업 게임 「후루룩 친구라면 가게」 기록을 보고 선생님이 수업 결과를 정리할 때 참고할 요약을 써.',
        '손님마다 꼭 필요한 마음이 있고, 학생은 재료를 골라 라면을 끓인 뒤 이름을 지어 줘. 별 셋은 필요한 마음을 잘 맞힌 것, 하트 도장은 라면 이름에 손님 마음 낱말을 넣은 것이야.',
        '두 문단으로 써. 첫 문단은 우리 반이 한 일과 잘한 점을 숫자와 함께 4~5문장으로. 둘째 문단은 어려워한 마음과 다음 수업에서 해 볼 만한 활동 1~2가지를 3문장 안팎으로.',
        '학생 개인을 가리키지 마. 제목, 글머리표, 마크다운은 쓰지 마. 존댓말(~습니다)로 써.',
        TEACHER_STYLE,
      ].join('\n'),
      user: JSON.stringify(facts),
      out: 'text',
    };
  },
};

// ── 업스테이지 부르기 ─────────────────────────────
async function solar(job, key) {
  const body = {
    model: job.model,
    messages: [{ role: 'system', content: job.system }, { role: 'user', content: job.user }],
    max_tokens: job.max, // 추론 글자도 여기에 들어가서 넉넉히 줘요
    temperature: job.temp,
    reasoning_effort: 'low',
  };
  if (job.out === 'json') body.response_format = { type: 'json_schema', json_schema: job.schema };
  const go = async (b) => {
    const ac = new AbortController();
    const tm = setTimeout(() => ac.abort(), 22000);
    try {
      return await fetch(UPSTAGE_URL, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(b), signal: ac.signal });
    } finally { clearTimeout(tm); }
  };
  let r = await go(body);
  // 모델이 추론 세기나 구조화 출력을 모르면 빼고 한 번 더
  if (r.status === 400) {
    const t = await r.text();
    if (/reasoning/i.test(t)) delete body.reasoning_effort;
    else if (/response_format|json_schema/i.test(t) && body.response_format) body.response_format = { type: 'json_object' };
    else return { error: 'upstage_400', detail: t.slice(0, 200) };
    r = await go(body);
  }
  if (!r.ok) return { error: `upstage_${r.status}` };
  const j = await r.json();
  const text = (j.choices?.[0]?.message?.content ?? '').trim();
  return { text };
}

// 대사 한 줄 다듬기: 줄을 이어 붙이고, 통째로 감싼 따옴표만 벗기고, 짝이 안 맞는 따옴표는 지워요
const tidyLine = (t, n) => {
  let s = t.replace(/\s*\n+\s*/g, ' ').trim();
  if (/^["“「『']/.test(s) && /["”」』']$/.test(s)) s = s.slice(1, -1).trim();
  if ((s.match(/["“”]/g) || []).length % 2) s = s.replace(/["“”]/g, '');
  return s.slice(0, n);
};

// ── 사용량 (서버가 잠깐 살아 있는 동안만 세는 대략값) ─────────
const perIp = new Map();
let day = '', dayCount = 0;
function allow(ip) {
  const now = Date.now();
  const today = new Date(now + 9 * 3600e3).toISOString().slice(0, 10); // 한국 날짜
  if (today !== day) { day = today; dayCount = 0; perIp.clear(); }
  if (dayCount >= PER_DAY) return false;
  const e = perIp.get(ip) ?? { t: now, n: 0 };
  if (now - e.t > 60000) { e.t = now; e.n = 0; }
  if (e.n >= PER_MIN) return false;
  e.n++; dayCount++;
  perIp.set(ip, e);
  return true;
}

function cors(origin) {
  const ok = ORIGINS.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
const json = (obj, status, h) => new Response(JSON.stringify(obj), { status, headers: { ...h, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

export default async function handler(req) {
  const origin = req.headers.get('origin') || '';
  const h = cors(origin);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  const key = process.env.UPSTAGE_API_KEY;
  // 연결 확인 (선생님 화면): 키 값은 절대 돌려주지 않아요
  if (req.method === 'GET') return json({ ok: true, ready: !!key, tasks: Object.keys(TASKS) }, 200, h);
  if (req.method !== 'POST') return json({ error: 'method' }, 405, h);
  if (origin && h['Access-Control-Allow-Origin'] !== origin) return json({ error: 'origin' }, 403, h);
  if (!key) return json({ error: 'no_key' }, 503, h);

  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  if (!allow(ip)) return json({ error: 'busy' }, 429, h);

  let d;
  try {
    const raw = await req.text();
    if (raw.length > 8000) return json({ error: 'too_big' }, 413, h);
    d = JSON.parse(raw);
  } catch { return json({ error: 'bad_json' }, 400, h); }
  const make = TASKS[d?.task];
  const job = make ? make(d.data || {}) : null;
  if (!job) return json({ error: 'bad_task' }, 400, h);

  try {
    const r = await solar(job, key);
    if (r.error) return json({ error: r.error }, 502, h);
    if (job.out === 'json') {
      let v = null;
      try { v = JSON.parse(r.text); } catch { const m = r.text.match(/\{[\s\S]*\}/); if (m) try { v = JSON.parse(m[0]); } catch { /* 아래에서 처리 */ } }
      if (!v || typeof v.ok !== 'boolean') return json({ error: 'bad_reply' }, 502, h);
      return json({ ok: v.ok, why: tidyLine(String(v.why || ''), 60) }, 200, h);
    }
    const text = job.out === 'line' ? tidyLine(r.text, 90) : r.text.replace(/[*#`]/g, '').slice(0, 1500);
    if (!text) return json({ error: 'empty' }, 502, h);
    return json({ text }, 200, h);
  } catch (e) {
    return json({ error: e?.name === 'AbortError' ? 'timeout' : 'fail' }, 504, h);
  }
}
