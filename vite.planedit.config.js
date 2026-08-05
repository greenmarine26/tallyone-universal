import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 선적 플랜 편집기 단독 빌드 — 단일 HTML 산출용 (V9.07)
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist-planedit',
    emptyOutDir: true,
    chunkSizeWarningLimit: 6000,
    rollupOptions: {
      input: '_planedit.entry.html',
      output: { inlineDynamicImports: true, entryFileNames: 'pe.js', assetFileNames: 'pe.[ext]' },
    },
  },
});
