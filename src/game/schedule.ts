import { mulberry32, shuffle } from '../core/rng';
import type { Customer } from '../data/types';

// 학생마다 손님 순서를 새로 섞어요. 책 손님도 다른 손님과 똑같이 아무 자리에나 와요.
export function makeOrder(all: Customer[], seed: number): string[] {
  return shuffle(all.filter((c) => c.source !== 'tutorial'), mulberry32(seed)).map((c) => c.id);
}

export function customerForRound(order: string[], round: number, all: Customer[], seed: number): string {
  if (round < order.length) return order[round];
  // 손님을 다 만나면 다시 섞어서 이어 가요
  const lap = Math.floor(round / order.length);
  const lapOrder = (k: number): string[] => {
    if (k === 0) return order;
    const a = makeOrder(all, seed + k * 7919);
    // 바퀴가 바뀌는 자리에서 같은 손님이 연달아 오지 않게
    const prev = lapOrder(k - 1);
    if (a.length > 1 && a[0] === prev[prev.length - 1]) [a[0], a[1]] = [a[1], a[0]];
    return a;
  };
  const again = lapOrder(lap);
  return again[(round - lap * order.length) % again.length];
}
