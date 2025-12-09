// ===========================================
// FILE: vite.config.dev.js (개발 환경 정정)
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
  
  // 경로 alias 설정
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  
  // public 폴더 설정
  publicDir: 'public',
  
  // 빌드 설정 (프로덕션)
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // public 폴더 파일들을 dist로 복사
    copyPublicDir: true,
    // 프로덕션에서 소스맵 생성 안함
    sourcemap: false,
    // 빌드 최적화
    minify: 'esbuild',
    // chunk 크기 경고 (KB)
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // 파일명 패턴
        assetFileNames: 'assets/[name]-[hash].[ext]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        // 벤더 코드 분리
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  
  // 개발 서버 설정
  server: {
    port: 3000,
    host: true, // Docker에서 접근 가능하도록
    // 자동으로 브라우저 열기 (로컬 개발시)
    open: false,
    // HMR (Hot Module Replacement) 설정
    hmr: {
      overlay: true, // 에러를 화면에 표시
    },
    // 프록시 설정 (개발 환경 CORS 해결)
    proxy: {
      '/api': {
        target: 'http://backend:8000',
        changeOrigin: true,
        secure: false,
        // 요청 로깅 (디버깅용)
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Sending Request:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('Received Response:', proxyRes.statusCode, req.url);
          });
        },
      },
      '/admin': {
        target: 'http://backend:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  
  // 미리보기 서버 설정 (npm run preview)
  preview: {
    port: 4173,
    host: true,
  },
})