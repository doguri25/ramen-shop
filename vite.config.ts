import { defineConfig, type Plugin } from 'vite';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

// 빌드가 끝나면 dist 의 모든 파일 목록과 그 내용으로 만든 버전을 sw.js 에 넣어요.
// 그래야 처음 한 번 열 때 게임 파일을 전부 받아 두고, 파일이 그대로면 저장본도 그대로 써요.
function precache(): Plugin {
  let outDir = 'dist';
  return {
    name: 'ramen-precache',
    apply: 'build',
    configResolved(c) { outDir = c.build.outDir; },
    closeBundle() {
      const files: string[] = [];
      const walk = (d: string) => {
        for (const f of readdirSync(d)) {
          const p = join(d, f);
          if (statSync(p).isDirectory()) walk(p);
          else files.push(relative(outDir, p).split('\\').join('/'));
        }
      };
      walk(outDir);
      const list = files.filter((f) => f !== 'sw.js' && !f.endsWith('.txt') && !f.endsWith('.md')).sort();
      const h = createHash('sha1');
      for (const f of list) { h.update(f); h.update(readFileSync(join(outDir, f))); }
      const version = h.digest('hex').slice(0, 10);
      const swPath = join(outDir, 'sw.js');
      const sw = readFileSync(swPath, 'utf8')
        .replace("'__SW_VERSION__'", JSON.stringify(version))
        .replace('self.__PRECACHE__ || []', JSON.stringify(list.map((f) => './' + f)));
      writeFileSync(swPath, sw);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [precache()],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 4000,
    assetsInlineLimit: 0,
    // three.js 는 따로 묶어 두면 게임만 고쳐 다시 배포해도 브라우저가 그대로 다시 써요
    rollupOptions: { output: { manualChunks: (id: string) => (id.includes('node_modules/three') ? 'three' : undefined) } },
  },
});
