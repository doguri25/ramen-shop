import { dataURLtoBlob } from './card';

// 파일 이름에 쓸 수 없는 글자를 빼고 알맞은 길이로
const safeName = (s: string) => s.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40) || '마음라면';

// 태블릿 '다운로드' 폴더로 내려받기
function download(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}

// 띵커벨에 올리기: 카드 그림을 먼저 저장하고, 같은 손짓 안에서 띵커벨 보드를 새 탭으로 열어요
// 파일 이름: '라면이름_카드.png'
export function saveCard(canvas: HTMLCanvasElement, name: string) {
  const url = canvas.toDataURL('image/png');
  download(dataURLtoBlob(url), `${safeName(name)}_카드.png`);
  return url;
}

// 도감의 라면 사진 한 장을 '라면이름.png'로 저장해요
export async function savePhoto(src: string, name: string): Promise<boolean> {
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d')!.drawImage(img, 0, 0);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'));
    if (!blob) return false;
    download(blob, `${safeName(name)}.png`);
    return true;
  } catch { return false; }
}

export function openTinkerbell(url: string): boolean {
  if (!url) return false;
  try {
    const w = window.open(url, '_blank');
    return !!w;
  } catch { return false; }
}
