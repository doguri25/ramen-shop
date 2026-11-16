import { FX } from '../data/effects';
import { ING } from '../data/ingredients';
import type { Customer, Family, Ingredient, Picks } from '../data/types';

export const pickedList = (p: Picks): Ingredient[] =>
  [p.broth, p.noodle, p.soup, ...p.toppings, ...p.finish.map((f) => f.id)].filter(Boolean).map((id) => ING.get(id as string)!);

export interface ScoreResult { stars: 1 | 2 | 3; match: number; help: number; exact: boolean; mainFamily: Family; glow: Map<string, 'main' | 'sub'> }

export function score(c: Customer, picks: Picks): ScoreResult {
  const mainFamily = FX.get(c.needs.effect)!.family;
  let match = 0, help = 0, exact = false;
  const glow = new Map<string, 'main' | 'sub'>();
  for (const it of pickedList(picks)) {
    const fams = new Set(it.effects.map((e) => FX.get(e)!.family));
    if (fams.has(mainFamily)) {
      match++;
      glow.set(it.id, 'main');
      if (it.effects.includes(c.needs.effect)) exact = true;
    } else if (fams.has(c.needs.sub)) {
      help++;
      glow.set(it.id, 'sub');
    }
  }
  const stars: 1 | 2 | 3 = match >= 3 && exact && help >= 1 ? 3 : match >= 2 || (match >= 1 && help >= 2) ? 2 : 1;
  return { stars, match, help, exact, mainFamily, glow };
}

// 행사용 별 다섯 단계
// ★ 라면을 끓였어요 · ★★ 마음 묶음 재료 2가지 · ★★★ 3가지 넘게
// ★★★★ 꼭 필요한 마음 재료 + 더하면 좋은 마음 재료 (수업용 별 셋) · ★★★★★ 여기에 이름 하트까지
export const fiveStars = (r: ScoreResult, heart: boolean) =>
  r.stars === 3 ? (heart ? 5 : 4) : r.stars === 2 ? (r.match >= 3 ? 3 : 2) : 1;

// 이름에 손님 마음 낱말이 들어 있으면 하트 도장
// 이름 틀에 늘 들어 있는 말('…친구라면', '마음이 …')은 빼고 봐요. 그래야 누구나 하트를 받지 않아요
export const hasHeart = (c: Customer, name: string) => {
  const n = name.replace(/\s/g, '').replace(/친구라면/g, '').replace(/^마음이/, '');
  return c.feelingWords.some((w) => n.includes(w.replace(/\s/g, '')));
};
