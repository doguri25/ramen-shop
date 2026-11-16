import { mulberry32, shuffle } from '../core/rng';
import type { Customer } from '../data/types';

// 학생마다 손님 순서를 새로 섞어요. 책 손님도 다른 손님과 똑같이 아무 자리에나 와요.
export function makeOrder(all: Customer[], seed: number): string[] {
  return shuffle(all.filter((c) => c.source !== 'tutorial'), mulberry32(seed)).map((c) => c.id);
}

// 순서(order)를 다 돌면 손님 전체를 다시 섞어서 한 바퀴씩 이어 가요.
// order는 손님 수보다 길 수도 있어요 (손님이 늘어서 순서를 다시 짠 학생)
export function customerForRound(order: string[], round: number, all: Customer[], seed: number): string {
  if (round < order.length) return order[round];
  const n = all.filter((c) => c.source !== 'tutorial').length;
  const extra = round - order.length;
  const lap = Math.floor(extra / n) + 1;
  const lapOrder = (k: number): string[] => {
    if (k === 0) return order;
    const a = makeOrder(all, seed + k * 7919);
    // 바퀴가 바뀌는 자리에서 같은 손님이 연달아 오지 않게
    const prev = lapOrder(k - 1);
    if (a.length > 1 && a[0] === prev[prev.length - 1]) [a[0], a[1]] = [a[1], a[0]];
    return a;
  };
  return lapOrder(lap)[extra - (lap - 1) * n];
}

// 아직 못 만난 손님이 바로 다음부터 섞여서 오게 순서를 다시 짜요.
// 손님이 늘었을 때(예: 36명 → 72명, 이미 한 바퀴 넘게 돈 학생 포함)나 순서에 없어진 손님이 남아 있을 때 써요.
// 만난 손님 = 도감에 담은 손님 + 첫 바퀴에서 건너뛴 손님. 고칠 게 없으면 null
export function catchUpOrder(order: string[], round: number, all: Customer[], seed: number, recs: { round: number; customerId: string }[]): string[] | null {
  const ids = all.filter((c) => c.source !== 'tutorial').map((c) => c.id);
  const known = new Set(ids);
  const met = new Set(recs.map((r) => r.customerId));
  const savedAt = new Map(recs.map((r) => [r.round, r.customerId]));
  for (let r = 0; r < Math.min(round, order.length); r++) if (!savedAt.has(r)) met.add(order[r]);
  const unmet = ids.filter((id) => !met.has(id));
  const at = (r: number) => customerForRound(order, r, all, seed);
  const ahead = new Set<string>();
  for (let i = 0; i < unmet.length; i++) ahead.add(at(round + i));
  if (unmet.every((id) => ahead.has(id)) && order.slice(round).every((id) => known.has(id))) return null;
  const rnd = mulberry32(seed ^ Math.imul(round + 1, 0x9e3779b1));
  const left = new Set(unmet);
  const next = [...shuffle(unmet, rnd), ...shuffle(ids.filter((id) => !left.has(id)), rnd)];
  const prev = round > 0 ? savedAt.get(round - 1) ?? at(round - 1) : '';
  if (next.length > 1 && next[0] === prev) [next[0], next[1]] = [next[1], next[0]];
  // 지난 판은 실제로 만난 손님만 남겨요 (예전 순서 밖에서 건너뛴 판은 누구였는지 모르니 비워 둬요)
  return [...Array.from({ length: round }, (_, r) => (r < order.length ? order[r] : savedAt.get(r) ?? '')), ...next];
}
