import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: "/",  // ✅ 꼭 이 값이 '/' 이어야 합니다
  plugins: [react()],
  server: {
    port: 3000,
    host: true, // Docker에서 접근 가능하도록
    proxy: {
      // 백엔드 프록시 설정 (CORS 해결)
      '/api': {
        target: 'http://backend:8000',
        changeOrigin: true,
        secure: false,
      },
      '/admin': {
        target: 'http://backend:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})