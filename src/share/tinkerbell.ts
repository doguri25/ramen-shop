import { dataURLtoBlob } from './card';

// 띵커벨에 올리기: 카드 그림을 먼저 저장하고, 같은 손짓 안에서 띵커벨 보드를 새 탭으로 열어요
export function saveCard(canvas: HTMLCanvasElement, name: string) {
  const url = canvas.toDataURL('image/png');
  const blob = dataURLtoBlob(url);
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = `친구라면카드_${name.replace(/[\\/:*?"<>|]/g, '').slice(0, 30)}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
  return url;
}

export function openTinkerbell(url: string): boolean {
  if (!url) return false;
  try {
    const w = window.open(url, '_blank');
    return !!w;
  } catch { return false; }
}
