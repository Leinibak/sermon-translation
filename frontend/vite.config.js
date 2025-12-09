// ===========================================
// FILE: vite.config.js (배포  환경) 
// ===========================================
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  // 기본 public path
  base: "/",
  
  // 플러그인
  plugins: [react()],
  
  // 경로 alias 설정 (유지)
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  
  // public 폴더 설정 (유지)
  publicDir: 'public',
  
  // 빌드 설정 (프로덕션, 이대로 유지)
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    copyPublicDir: true,
    sourcemap: false,
    minify: 'esbuild',
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name]-[hash].[ext]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
    
  // 미리보기 서버 설정 (배포에는 무관하지만, 필요하다면 host: true는 제거하는 것이 좋습니다.)
  preview: {
    port: 4173,
    host: false, // 로컬 머신에서만 접근 가능하도록 변경
  },
});
// ===========================================