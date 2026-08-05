// 앱 진입점 — 루트 ErrorBoundary로 전체 화면 사라짐(흰 화면) 방지
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './index.css';
import './mergeApi.js'; // V8.20: 수집기 연동 입구 — window.GMmerge(files) 전역 등록
import './autoRegApi.js'; // V8.32: 수집기 자동 항차 등록 입구 — window.GMautoPayload 전역 등록
import { installToastAlert, showToast } from './toast.js';
import { readCfgParam, runLinkCfgGate } from './linkCfg.js'; // TallyUni 0.6: QR 원터치 접속(?cfg=) 부팅 게이트

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
const _root = ReactDOM.createRoot(document.getElementById('root'));
const renderApp = () => _root.render(
  <ErrorBoundary name="앱 전체" reloadButton>
    <App />
  </ErrorBoundary>
);

// TallyUni 0.6: QR 원터치 접속 — 링크에 담긴 접속 설정을 확인하는 동안 보여 줄 화면(빈 화면 금지).
function BootBusy() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="w-10 h-10 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
      <div className="text-sm font-bold text-slate-200">설정을 불러오는 중…</div>
      <div className="text-[11px] text-slate-500 leading-relaxed">링크에 담긴 접속 정보를 확인하고 있습니다</div>
    </div>
  );
}

// TallyUni 0.6: cfg 파라미터가 있을 때만 부팅을 한 박자 늦춘다.
//   없으면 0.5와 완전히 같은 동기 렌더 경로 — 게이트 함수조차 부르지 않는다(회귀 위험 0).
if (!readCfgParam()) {
  renderApp();
} else {
  _root.render(<BootBusy />);
  runLinkCfgGate().then((r) => {
    // 'reload' 는 두 키를 저장하고 주소까지 정리한 상태 — 새로고침해야 firebase.js가 새 설정을 읽는다.
    if (r && r.action === 'reload') { location.reload(); return; }
    renderApp();   // 'wizard'(마법사가 사유·설정을 이어받음) · 'proceed'(무시·설정 있음) 모두 평소 화면으로
  }).catch((e) => {
    // 조용한 실패 금지 — 게이트가 어떤 이유로 터져도 앱은 뜬다(마법사 1단계).
    console.error('[링크설정] 부팅 게이트에서 예기치 못한 오류 — 평소 화면으로 넘어갑니다.', e);
    renderApp();
  });
}
