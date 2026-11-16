import { eulReul, iGa } from '../core/korean';
import { FX } from '../data/effects';
import { BADWORDS, FAMILY_WORDS, NAME_ADJ, NAME_FRONT, NAME_SPRING, NAME_VERB } from '../data/text';
import type { Family } from '../data/types';
import { pickedList } from './scoring';
import type { Picks } from '../data/types';

export type Template = 'blow' | 'heart' | 'spring' | 'free';

export const TEMPLATES: { id: Template; label: string }[] = [
  { id: 'blow', label: '○○을/를 ○○ 주는 친구라면' },
  { id: 'heart', label: '마음이 ○○지는 친구라면' },
  { id: 'spring', label: '○○이/가 샘솟는 친구라면' },
  { id: 'free', label: '내 마음대로 짓기' },
];

export const buildName = (t: Template, a: string, b: string) => {
  if (t === 'blow') return a && b ? `${eulReul(a)} ${b} 주는 친구라면` : '';
  if (t === 'heart') return a ? `마음이 ${a}지는 친구라면` : '';
  if (t === 'spring') return a ? `${iGa(a)} 샘솟는 친구라면` : '';
  return '';
};

export function wordPools(picks: Picks) {
  const fams = new Map<Family, number>();
  for (const it of pickedList(picks)) for (const e of it.effects) { const f = FX.get(e)!.family; fams.set(f, (fams.get(f) ?? 0) + 1); }
  const top = [...fams.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => f);
  const rec = { front: new Set<string>(), verb: new Set<string>(), adj: new Set<string>(), spring: new Set<string>() };
  for (const f of top.slice(0, 3)) {
    const w = FAMILY_WORDS[f];
    w.front.forEach((x) => rec.front.add(x)); w.verb.forEach((x) => rec.verb.add(x));
    w.adj.forEach((x) => rec.adj.add(x)); w.spring.forEach((x) => rec.spring.add(x));
  }
  const order = (all: string[], r: Set<string>) => [...all.filter((x) => r.has(x)), ...all.filter((x) => !r.has(x))];
  return {
    front: order(NAME_FRONT, rec.front), verb: order(NAME_VERB, rec.verb),
    adj: order(NAME_ADJ, rec.adj), spring: order(NAME_SPRING, rec.spring), rec,
  };
}

// 한글·영어 글자만 남기고 비교해요 (공백·숫자·기호·이모지로 끼워 넣어도 걸러요)
const normalize = (s: string) => s.toLowerCase().replace(/[^가-힣ㄱ-ㅎㅏ-ㅣa-z]/g, '');
// 고운 말인데 나쁜 말이 섞여 보이는 경우 (먼저 지우고 봐요)
const ALLOW = ['꺼지는', '꺼지지', '꺼지면', '꺼진', '기죽', '새끼손가락', '새끼고양이', '새끼강아지', '새끼오리', '새끼곰', '새끼돼지', '새끼새',
  '다시발표', '다시발휘', '다시발돋움', '아저씨발', '시바견', '야사랑',
  '다시발견', '다시발사', '솜씨발휘', '무지개같', '조개같', '베개같', '안개같', '개미친구', '장미친구', '거미친구', '매미친구', '일등신'];
// 짧아서 두 낱말 사이에 우연히 생기기 쉬운 말은 낱말마다 따로 봐요
// ('친구야 동글동글' → '야동', '개미 친구라면' → '미친', '할머니 미소' → '니미', '무지개 새싹' → '개새' 아님)
const SHORT = new Set(['야동', '야사', '년아', '놈아', '시바', '씨바', '미친', '니미', '개새', '시벌', '씨벌', '쉬발', '씌발', '시팔', '씨팔', '개같', '개소리']);
export function isBad(name: string) {
  if (/(^|\D)1\s*8(\D|$)|凸/.test(name)) return true; // 숫자·기호로 쓰는 욕
  name = name.replace(/\d+\s*등/g, '일등'); // '1등 신나는'이 '등신'으로 붙지 않게
  let n = normalize(name);
  for (const a of ALLOW) n = n.split(a).join('');
  const tokens = name.split(/\s+/).map((t) => { let x = normalize(t); for (const a of ALLOW) x = x.split(a).join(''); return x; });
  // '미 친'처럼 한 글자씩 띄어 쓴 말은 이어 붙여서도 봐요
  const ones = name.split(/\s+/).map(normalize).map((t) => ([...t].length === 1 ? t : ' ')).join('');
  tokens.push(...ones.split(' ').filter((t) => [...t].length > 1));
  return BADWORDS.some((w) => (SHORT.has(w) ? tokens.some((t) => t.includes(w)) : n.includes(w)));
}
export const MAX_NAME = 20;
