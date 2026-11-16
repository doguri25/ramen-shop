// 받침 확인과 조사 붙이기
export const hasBatchim = (w: string) => {
  const t = w.trim().replace(/[^0-9A-Za-z가-힣]+$/, '');
  const c = t.charCodeAt(t.length - 1);
  if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28 !== 0;
  return /[136780lmnLMN]$/.test(t); // 숫자·영문 끝소리 대충 맞추기
};
const isRieul = (w: string) => {
  const t = w.trim().replace(/[^0-9A-Za-z가-힣]+$/, ''); const c = t.charCodeAt(t.length - 1);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 === 8;
};
export const eulReul = (w: string) => w + (hasBatchim(w) ? '을' : '를');
export const iGa = (w: string) => w + (hasBatchim(w) ? '이' : '가');
export const eunNeun = (w: string) => w + (hasBatchim(w) ? '은' : '는');
export const gwaWa = (w: string) => w + (hasBatchim(w) ? '과' : '와');
export const euroRo = (w: string) => w + (hasBatchim(w) && !isRieul(w) ? '으로' : '로');
export const ayaYa = (w: string) => w + (hasBatchim(w) ? '아' : '야');
export const listKo = (ws: string[]) => {
  const n = ws.length;
  if (n <= 1) return ws[0] ?? '';
  return ws.slice(0, -2).map((w) => w + ', ').join('') + gwaWa(ws[n - 2]) + ' ' + ws[n - 1];
};
