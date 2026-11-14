export type Ease = (t: number) => number;
export const ease = {
  linear: (t: number) => t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  outElastic: (t: number) => (t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
};

interface Tw { t: number; dur: number; delay: number; fn: (k: number) => void; ease: Ease; done?: () => void; resolve: () => void }
const list: Tw[] = [];

export function tween(dur: number, fn: (k: number) => void, opts: { ease?: Ease; delay?: number; done?: () => void } = {}): Promise<void> {
  return new Promise((resolve) => {
    list.push({ t: 0, dur: Math.max(0.0001, dur), delay: opts.delay ?? 0, fn, ease: opts.ease ?? ease.inOutCubic, done: opts.done, resolve });
  });
}
export function updateTweens(dt: number) {
  for (let i = list.length - 1; i >= 0; i--) {
    const w = list[i];
    if (w.delay > 0) { w.delay -= dt; if (w.delay > 0) continue; }
    w.t += dt;
    const k = Math.min(1, w.t / w.dur);
    w.fn(w.ease(k));
    if (k >= 1) { list.splice(i, 1); w.done?.(); w.resolve(); }
  }
}
export const wait = (sec: number) => tween(sec, () => {}, { ease: ease.linear });
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
