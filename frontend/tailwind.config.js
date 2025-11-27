/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // 기존 Batang 정의 유지
        gowun: ["'Gowun Batang'", "serif"], 
        // 🆕 Dotum 클래스를 새로 정의
        dodum: ["'Gowun Dodum'", "sans-serif"], 
      },
    },
  },
  plugins: [],
}
