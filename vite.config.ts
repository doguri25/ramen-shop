import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // 배포할 때마다 바뀌는 값: 오프라인 저장본(서비스 워커)을 새로 고치는 데 써요
  define: { __BUILD__: JSON.stringify(Date.now().toString(36)) },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 4000,
    assetsInlineLimit: 0,
    // three.js 는 따로 묶어 두면 게임만 고쳐 다시 배포해도 브라우저가 그대로 다시 써요
    rollupOptions: { output: { manualChunks: (id: string) => (id.includes('node_modules/three') ? 'three' : undefined) } },
  },
});
