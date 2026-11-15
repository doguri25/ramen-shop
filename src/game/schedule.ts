import { mulberry32, shuffle } from '../core/rng';
import type { Customer } from '../data/types';

// 학생마다 손님 순서를 새로 섞어요. 책 손님 3명은 처음 10번 안의 아무 자리에 들어가요.
export function makeOrder(all: Customer[], seed: number, firstN = 10): string[] {
  const rnd = mulberry32(seed);
  const book = shuffle(all.filter((c) => c.source === 'book'), rnd).map((c) => c.id);
  const fresh = shuffle(all.filter((c) => c.source === 'new'), rnd).map((c) => c.id);
  const total = book.length + fresh.length;
  const span = Math.max(book.length, Math.min(firstN > 0 ? firstN : total, total));
  const slots = shuffle([...Array(span).keys()], rnd).slice(0, book.length);
  const order: string[] = [];
  for (let i = 0; order.length < total; i++) {
    const s = slots.indexOf(i);
    order.push(s >= 0 ? book[s] : fresh.shift()!);
  }
  return order;
}

export function customerForRound(order: string[], round: number, all: Customer[], seed: number): string {
  if (round < order.length) return order[round];
  // 36명을 다 만나면 다시 섞어서 이어 가요
  const lap = Math.floor(round / order.length);
  const lapOrder = (k: number): string[] => {
    if (k === 0) return order;
    const a = makeOrder(all, seed + k * 7919, 0);
    // 바퀴가 바뀌는 자리에서 같은 손님이 연달아 오지 않게
    const prev = lapOrder(k - 1);
    if (a.length > 1 && a[0] === prev[prev.length - 1]) [a[0], a[1]] = [a[1], a[0]];
    return a;
  };
  const again = lapOrder(lap);
  return again[(round - lap * order.length) % again.length];
}
