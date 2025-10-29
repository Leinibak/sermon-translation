import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0", // Docker 외부 접속 허용
    port: 3000        // 포트 3000으로 열기
  }
});
