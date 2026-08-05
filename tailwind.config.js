/** @type {import('tailwindcss').Config} */
export default {
  // V8.31: src/data 스캔 제외 — 1.2MB 단일라인 사전이 Tailwind 추출 정규식을 폭주시켜
  //   빌드가 수 분씩 걸리던 결함 수정 (data에는 Tailwind 클래스 없음 확인).
  content: ['./index.html', './src/**/*.{js,jsx}', '!./src/data/**'],
  darkMode: 'class',
  theme: { extend: {} },
  plugins: [],
};
