// ===========================================
// FILE: vite.config.js (배포 환경)
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

  // 빌드 설정 (프로덕션)
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    copyPublicDir: true,  // ✅ public/mediapipe/ 파일도 dist/mediapipe/ 로 자동 복사
    sourcemap: false,
    minify: 'esbuild',
    chunkSizeWarningLimit: 2000, // ✅ mediasoup-client 등 큰 라이브러리 경고 방지
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name]-[hash].[ext]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        manualChunks: {
          'react-vendor':     ['react', 'react-dom', 'react-router-dom'],
          'mediasoup-client': ['mediasoup-client'], // ✅ 별도 청크 분리
        },
      },
    },
  },

  // ✅ MediaPipe는 wasm/모델 파일을 런타임에 동적 로드하므로
  //    Vite 번들러가 내부를 분석하지 않도록 제외
  optimizeDeps: {
    exclude: ['@mediapipe/selfie_segmentation'],
  },

  // 미리보기 서버 설정
  preview: {
    port: 4173,
    host: false, // 로컬 머신에서만 접근 가능
  },
});
// ===========================================