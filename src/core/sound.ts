// 효과음은 모두 Web Audio로 그때그때 만들어요 (파일 없음)
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let on = true;
let bubbleNode: { stop: () => void } | null = null;

export function setSound(v: boolean) { on = v; if (!v) stopBubble(); if (master) master.gain.value = v ? 0.55 : 0; }
export const soundOn = () => on;

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = on ? 0.55 : 0;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
}
export function suspendAudio() { ctx?.suspend(); }
export function resumeAudio() { if (ctx && on) ctx.resume(); }

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.3, when = 0, slide = 0) {
  if (!ctx || !master || !on) return;
  const t0 = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}
function noise(dur: number, vol: number, filter: number, when = 0, q = 1, type: BiquadFilterType = 'bandpass', sweep = 0) {
  if (!ctx || !master || !on) return;
  const t0 = ctx.currentTime + when;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(filter, t0);
  if (sweep) f.frequency.exponentialRampToValueAtTime(filter * sweep, t0 + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0);
}

export const sfx = {
  tap() { tone(880, 0.08, 'triangle', 0.18); },
  pop() { tone(520, 0.12, 'sine', 0.25, 0, 1.8); },
  back() { tone(440, 0.1, 'triangle', 0.15, 0, 0.7); },
  plop() { tone(300, 0.18, 'sine', 0.35, 0, 0.45); noise(0.18, 0.12, 900, 0.02, 2); },
  pour() { noise(0.9, 0.18, 700, 0, 0.8, 'lowpass', 1.6); },
  sprinkle() { for (let i = 0; i < 6; i++) noise(0.05, 0.08, 4000 + i * 300, i * 0.05, 4); },
  bell() { tone(1318, 1.2, 'sine', 0.22); tone(1760, 1.0, 'sine', 0.12, 0.02); tone(2637, 0.6, 'sine', 0.05, 0.03); },
  door() { noise(0.25, 0.08, 400, 0, 1, 'lowpass'); },
  talk() { tone(500 + Math.random() * 260, 0.06, 'triangle', 0.06); },
  slurp() { noise(0.7, 0.2, 600, 0, 3, 'bandpass', 3.5); noise(0.5, 0.15, 900, 0.75, 3, 'bandpass', 3); },
  star(i: number) { const f = [784, 988, 1175][i] ?? 1175; tone(f, 0.5, 'triangle', 0.22); tone(f * 2, 0.3, 'sine', 0.06, 0.01); },
  fanfare() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, 'triangle', 0.18, i * 0.11)); tone(1047, 0.8, 'sine', 0.14, 0.45); },
  soft() { [392, 494, 587].forEach((f, i) => tone(f, 0.4, 'sine', 0.14, i * 0.12)); },
  heart() { tone(660, 0.12, 'sine', 0.2); tone(990, 0.25, 'sine', 0.18, 0.1); },
  whoosh() { noise(0.35, 0.1, 500, 0, 0.7, 'bandpass', 4); },
  camera() { noise(0.06, 0.2, 3000, 0, 1, 'highpass'); tone(1200, 0.05, 'square', 0.05, 0.05); },
};

export function startBubble() {
  if (!ctx || !master || !on || bubbleNode) return;
  let alive = true;
  const loop = () => {
    if (!alive || !on) return;
    tone(180 + Math.random() * 160, 0.09, 'sine', 0.05 + Math.random() * 0.04, 0, 1.6);
    setTimeout(loop, 90 + Math.random() * 260);
  };
  loop();
  bubbleNode = { stop: () => { alive = false; } };
}
export function stopBubble() { bubbleNode?.stop(); bubbleNode = null; }

// 손님 말 읽어 주기
let ttsOn = false;
export const setTts = (v: boolean) => { ttsOn = v; if (!v) window.speechSynthesis?.cancel(); };
export const ttsEnabled = () => ttsOn;
export function speak(text: string, pitch = 1.1) {
  if (!ttsOn || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/\[\[|\]\]/g, '').replace(/^@\d /, ''));
  u.lang = 'ko-KR';
  u.rate = 1.0;
  u.pitch = pitch;
  window.speechSynthesis.speak(u);
}
