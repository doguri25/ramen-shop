import type { Family } from './types';

// 마음 텃밭: 같은 채소라도 이랑마다 담긴 마음이 달라요. 팻말의 이름과 마음 묶음 색을 보고 골라 뽑아요
export type VegKind = 'radish' | 'potato' | 'sweetpotato' | 'carrot';
export interface Veg { id: VegKind; name: string }
export const VEGS: Veg[] = [
  { id: 'radish', name: '무' },
  { id: 'potato', name: '감자' },
  { id: 'sweetpotato', name: '고구마' },
  { id: 'carrot', name: '당근' },
];
export const VEG = new Map(VEGS.map((v) => [v.id, v]));

// 마음 낱말은 묶음마다 같은 말을 써요 (토닥토닥이면 늘 위로)
export interface VegVariant { id: string; veg: VegKind; word: string; fam: Family }
const W: Record<string, Family> = { 토닥토닥: 'comfort', 단짝: 'together', 느긋: 'rest', 불끈: 'courage', 후후: 'calm', 미안해: 'reconcile', 꼬옥: 'love', 싱글벙글: 'joy' };
const row = (veg: VegKind, words: string[]): VegVariant[] => words.map((w, i) => ({ id: `${veg}-${i}`, veg, word: w, fam: W[w] }));
// 이랑마다 넷. 부탁하는 주민에게 꼭 맞는 하나와, 헷갈리지 않게 결이 다른 셋
export const VARIANTS: VegVariant[] = [
  ...row('radish', ['느긋', '싱글벙글', '후후', '미안해']),
  ...row('potato', ['토닥토닥', '불끈', '단짝', '꼬옥']),
  ...row('sweetpotato', ['미안해', '싱글벙글', '토닥토닥', '불끈']),
  ...row('carrot', ['단짝', '후후', '꼬옥', '싱글벙글']),
];
export const VARIANT = new Map(VARIANTS.map((v) => [v.id, v]));
export const variantName = (v: VegVariant) => `${v.word} ${VEG.get(v.veg)!.name}`;
