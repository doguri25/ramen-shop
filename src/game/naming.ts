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

const normalize = (s: string) => s.toLowerCase().replace(/[\s\d~!@#$%^&*()_+\-=[\]{};:'",.<>/?\\|`·…]/g, '');
// 고운 말인데 나쁜 말이 섞여 보이는 경우 (먼저 지우고 봐요)
const ALLOW = ['꺼지는', '꺼지지', '꺼지면', '꺼진', '기죽', '새끼손가락', '새끼고양이', '새끼강아지', '새끼오리', '새끼곰', '새끼돼지', '새끼새'];
// 짧아서 두 낱말 사이에 우연히 생기기 쉬운 말은 낱말마다 따로 봐요 ('친구야 동글동글' → '야동' 아님)
const SHORT = new Set(['야동', '야사', '년아', '놈아', '시바', '씨바']);
export function isBad(name: string) {
  let n = normalize(name);
  for (const a of ALLOW) n = n.split(a).join('');
  const tokens = name.split(/\s+/).map((t) => { let x = normalize(t); for (const a of ALLOW) x = x.split(a).join(''); return x; });
  return BADWORDS.some((w) => (SHORT.has(w) ? tokens.some((t) => t.includes(w)) : n.includes(w)));
}
export const MAX_NAME = 20;
