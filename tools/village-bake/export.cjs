// 게임에서 소품 자리와 발밑 땅을 뽑아 블렌더로 보내요
const { chromium } = require('playwright');
const fs = require('fs');
const IDS = JSON.parse(fs.readFileSync(__dirname + '/ids72.json', 'utf8'));
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 800, height: 500 } });
  await p.context().route(/ramen-ai|vercel\.app/, (r) => r.abort());
  p.on('pageerror', (e) => console.log('ERR', e.message));
  p.on('console', (m) => { if (/village|ERR/.test(m.text())) console.log('LOG', m.text().slice(0, 200)); });
  await p.goto(process.env.URL || 'http://127.0.0.1:5173/');
  await p.waitForFunction(() => window.__app && window.__app.bakeInfo, null, { timeout: 300000 });
  const mk = (id, n, name) => ({ id, number: n, name, round: 20, order: IDS, tutorialDone: true, createdAt: Date.now() });
  await p.evaluate(([o]) => new Promise((res) => { const q = indexedDB.open('keyval-store'); q.onsuccess = () => { const tx = q.result.transaction('keyval', 'readwrite'); tx.objectStore('keyval').put(o, 'owners'); tx.objectStore('keyval').put([], 'records:a1'); tx.oncomplete = () => res(); }; }), [[mk('a1', 4, '박하늘')]]);
  await p.reload();
  await p.waitForFunction(() => window.__app && window.__app.bakeInfo, null, { timeout: 300000 });
  await p.evaluate(() => { window.__app.probe.done = true; });
  await p.locator('.title-alley').click();
  await p.locator('.village .v-touch').waitFor({ timeout: 180000 });
  const spec = await p.evaluate(() => window.__village.vil.bakeSpec());
  fs.writeFileSync(process.argv[2] || __dirname + '/spec.json', JSON.stringify(spec));
  const n = {}; spec.bodies.forEach((x) => { n[x.k] = (n[x.k] || 0) + 1; });
  console.log('sig', spec.sig, 'bodies', JSON.stringify(n), 'carts', spec.carts.length, 'patches', spec.patches.length, 'baked', await p.evaluate(() => window.__village.vil.baked));
  await b.close();
})();
