// 앱 진입점 — 루트 ErrorBoundary로 전체 화면 사라짐(흰 화면) 방지
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './index.css';
import './mergeApi.js'; // V8.20: 수집기 연동 입구 — window.GMmerge(files) 전역 등록
import './autoRegApi.js'; // V8.32: 수집기 자동 항차 등록 입구 — window.GMautoPayload 전역 등록
import { installToastAlert, showToast } from './toast.js';

// V9.14: alert() 254곳 → 논블로킹 토스트로 일괄 전환 (toast.js는 M-대 완성돼 있었으나 연결 0회였다).
//   confirm/prompt는 그대로 — 사용자의 결정이 필요한 창은 막지 않는다.
installToastAlert();

// V9.57(G10): 전역 unhandledrejection 핸들러 — await 누락·비동기 저장 실패 등 삼켜진 프라미스
//   거부가 화면에 아무 흔적 없이 사라지던 것을 콘솔 + 토스트로 드러낸다(3금지③ 조용한 실패 금지).
//   과다 노출 방지: 같은 메시지는 5초 내 1회만 토스트(콘솔에는 전부 기록).
const _rejSeen = new Map();   // message → 마지막 토스트 시각
window.addEventListener('unhandledrejection', (ev) => {
  const reason = ev && ev.reason;
  const msg = String((reason && (reason.message || reason)) || '알 수 없는 오류');
  console.error('[unhandledrejection]', reason);
  const now = Date.now();
  const last = _rejSeen.get(msg) || 0;
  if (now - last < 5000) return;
  _rejSeen.set(msg, now);
  showToast(`처리되지 않은 오류: ${msg}`, { error: true });
});

// V7.35: 루트 ErrorBoundary — 어디서든 런타임 에러 1건으로 React 트리 전체가
//   언마운트되어 흰 화면 + 카메라 멈춤이 되던 문제 방지. 인쇄 모달에만 있던
//   격리를 앱 전체로 확장. reloadButton으로 현장에서 즉시 복구 가능.
ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary name="앱 전체" reloadButton>
    <App />
  </ErrorBoundary>
);
