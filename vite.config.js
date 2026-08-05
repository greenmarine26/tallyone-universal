import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages 호환: 상대 경로
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
  },
});
