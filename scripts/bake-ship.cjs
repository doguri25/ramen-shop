// 가게 조명 굽기를 미리 해서 public/bake/ 에 넣어 둬요 (휴대폰이 처음 열 때 몇 분씩 굽지 않게)
// 가게 모양·소품·조명·굽는 방법(ALGO)이 바뀌면 지문이 달라져서 예전 파일은 안 쓰여요. 그때 다시 돌려요.
//   npm run build && npm run build:event
//   (dist 를 http://localhost:8795/ramen-shop/ 으로 띄운 뒤)  node scripts/bake-ship.cjs
// playwright 가 있어야 해요 (npm i -g playwright 또는 npx)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const base = process.argv[2] || 'http://localhost:8795/ramen-shop/';
const outDir = path.join(__dirname, '..', 'public', 'bake');
(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  for (const sub of ['', 'event/']) {
    const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    const page = await (await browser.newContext({ serviceWorkers: 'block', viewport: { width: 640, height: 400 } })).newPage();
    await page.route('https://ramen-ai.vercel.app/**', (r) => r.abort());
    await page.goto(base + sub);
    let info = null;
    for (let i = 0; i < 1200 && !info; i++) { info = await page.evaluate(() => window.__app?.bakeInfo ?? null).catch(() => null); if (!info) await page.waitForTimeout(500); }
    if (!info) throw new Error('굽기가 끝나지 않았어요: ' + sub);
    // 저장소(IndexedDB keyval-store)에서 구운 값을 꺼내요
    const b64 = await page.evaluate((key) => new Promise((res, rej) => {
      const rq = indexedDB.open('keyval-store');
      rq.onsuccess = () => {
        const g = rq.result.transaction('keyval', 'readonly').objectStore('keyval').get(key);
        g.onsuccess = () => { const u = g.result; let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); res(btoa(s)); };
        g.onerror = () => rej(g.error);
      };
      rq.onerror = () => rej(rq.error);
    }), info.key);
    const buf = Buffer.from(b64, 'base64');
    const file = path.join(outDir, info.key.replace(/:/g, '-') + '.bin');
    fs.writeFileSync(file, buf);
    console.log(sub || '(수업용)', info.key, info.verts, '정점', buf.length, '바이트 →', path.relative(process.cwd(), file));
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
