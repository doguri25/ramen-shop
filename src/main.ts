import './ui/ui.css';
import { App } from './app';
import { EVENT } from './event/flag';

// 수업용에만 쓰는 화면 고침(css)은 body.cls 아래에 둬요. 행사용 화면은 그대로예요
if (!EVENT) document.body.classList.add('cls');

const boot = document.getElementById('boot')!;
const sub = boot.querySelector('.boot-sub') as HTMLElement;
const app = new App();
(window as any).__app = app;

function fail(msg: string) {
  sub.innerHTML = msg;
  sub.style.color = '#C0392B';
}

(async () => {
  const test = document.createElement('canvas').getContext('webgl2');
  if (!test) { fail('이 기기에서는 3D 화면을 그릴 수 없어요.<br>크롬 브라우저로 열어 주세요.'); return; }
  try {
    await app.boot((s) => { sub.textContent = s; });
  } catch (e) {
    console.error(e);
    fail('가게 문을 여는 중에 문제가 생겼어요. 새로고침해 주세요.');
    return;
  }
  boot.classList.add('hide');
  setTimeout(() => boot.remove(), 700);
  app.start();
  // 오프라인에서도 열리게 저장해 둬요 (배포본에서만)
  // sw.js 는 빌드 때 파일 목록과 버전이 들어가서, 바뀌면 브라우저가 알아서 새로 받아요
  if (import.meta.env.PROD && 'serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
