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

// 이름에 손님 마음 낱말이 들어 있으면 하트 도장
export const hasHeart = (c: Customer, name: string) => c.feelingWords.some((w) => name.replace(/\s/g, '').includes(w.replace(/\s/g, '')));
