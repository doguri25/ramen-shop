type Kid = Node | string | number | null | undefined | false | Kid[];
type Props = Record<string, unknown> & { class?: string; style?: string };

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props | null = null, ...kids: Kid[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'style') el.setAttribute('style', String(v));
      else if (k === 'html') el.innerHTML = String(v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k in el && typeof v !== 'string') (el as any)[k] = v;
      else el.setAttribute(k, String(v));
    }
  }
  append(el, kids);
  return el;
}
function append(el: Node, kids: Kid[]) {
  for (const k of kids) {
    if (k === null || k === undefined || k === false) continue;
    if (Array.isArray(k)) append(el, k);
    else el.appendChild(typeof k === 'string' || typeof k === 'number' ? document.createTextNode(String(k)) : k);
  }
}
export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T | null;

// [[단서]] 를 형광펜 표시로 바꿔요
export function richText(s: string): (Node | string)[] {
  const out: (Node | string)[] = [];
  const re = /\[\[(.+?)\]\]/g;
  let last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    out.push(h('mark', null, m[1]));
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}
export const clues = (lines: string[]) => [...new Set(lines.flatMap((l) => [...l.matchAll(/\[\[(.+?)\]\]/g)].map((m) => m[1])))];

export function longPress(el: HTMLElement, ms: number, fn: () => void) {
  let t: number | undefined;
  const start = () => { t = window.setTimeout(fn, ms); };
  const end = () => window.clearTimeout(t);
  el.addEventListener('pointerdown', start);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((e) => el.addEventListener(e, end));
}

export const ICON = {
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="#C2560E" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 21.5V5.5"/><path d="M9 8h7M9 12h5"/></svg>',
  sound: '<svg viewBox="0 0 24 24" fill="none" stroke="#C2560E" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
  mute: '<svg viewBox="0 0 24 24" fill="none" stroke="#C2560E" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>',
  read: '<svg viewBox="0 0 24 24" fill="none" stroke="#C2560E" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="#C2560E" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="#C2560E" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};
export const iconBtn = (svg: string, onClick: () => void, title = '', cls = '') => h('button', { class: 'icon-btn ' + cls, html: svg, onclick: onClick, 'aria-label': title, title });

export function toast(msg: string, ms = 2600) {
  const t = h('div', { class: 'toast' }, msg);
  document.getElementById('ui')!.appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity .4s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 450); }, ms);
}

export function confetti() {
  const c = h('canvas', { class: 'confetti' });
  c.width = innerWidth; c.height = innerHeight;
  document.body.appendChild(c);
  const g = c.getContext('2d')!;
  const cols = ['#E98BA3', '#F0974A', '#8DC26F', '#E9B92A', '#6FB3E0', '#A68BD6', '#E3645A', '#47AE7A'];
  const ps = Array.from({ length: 140 }, () => ({ x: innerWidth / 2 + (Math.random() - 0.5) * 200, y: innerHeight * 0.35, vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 14 - 4, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.4, c: cols[Math.floor(Math.random() * cols.length)], s: 6 + Math.random() * 8 }));
  let t0 = performance.now();
  const step = (t: number) => {
    const dt = Math.min(0.05, (t - t0) / 1000); t0 = t;
    g.clearRect(0, 0, c.width, c.height);
    let alive = false;
    for (const p of ps) {
      p.vy += 30 * dt; p.x += p.vx * dt * 30; p.y += p.vy * dt * 30; p.r += p.vr;
      if (p.y < c.height + 20) alive = true;
      g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); g.restore();
    }
    if (alive) requestAnimationFrame(step); else c.remove();
  };
  requestAnimationFrame(step);
}
