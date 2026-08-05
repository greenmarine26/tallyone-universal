// PWA 자동 업데이트 알림
// 새 Service Worker 감지 시 화면 상단에 "🆕 새 버전 출시" 배너 표시
// 클릭 → 즉시 적용 + 새로고침
import React, { useState, useEffect } from 'react';
import { RefreshCw, X, Download } from 'lucide-react';

export default function UpdatePrompt() {
  const [waiting, setWaiting] = useState(null); // 대기 중인 SW
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // SW 등록
    const baseUrl = import.meta.env.BASE_URL || './';
    const swUrl = baseUrl + 'sw.js';

    navigator.serviceWorker.register(swUrl).then(reg => {
      // 이미 대기 중인 워커가 있으면
      if (reg.waiting) setWaiting(reg.waiting);

      // 새 워커 발견
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // 기존 컨트롤러 있다 = 새 버전 대기 중
            setWaiting(newWorker);
            setHidden(false);
          }
        });
      });

      // 1시간마다 새 버전 확인
      setInterval(() => reg.update(), 60 * 60 * 1000);
    }).catch(e => console.log('SW 등록 실패:', e));

    // 컨트롤러 변경 (새 SW 활성화) → 새로고침
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }, []);

  const handleUpdate = () => {
    if (!waiting) return;
    waiting.postMessage({ type: 'SKIP_WAITING' });
  };

  if (!waiting || hidden) return null;

  return (
    <div className="fixed top-12 left-2 right-2 z-50 max-w-md mx-auto">
      <div className="bg-gradient-to-r from-emerald-700 to-emerald-600 border-2 border-emerald-400 rounded-lg shadow-2xl p-3 flex items-center gap-3 animate-pulse">
        <div className="bg-emerald-900 p-2 rounded-lg flex-shrink-0">
          <Download className="w-5 h-5 text-emerald-200"/>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-black text-sm text-emerald-50">🆕 새 버전 출시</div>
          <div className="text-[11px] text-emerald-100/90">탭 한 번으로 최신 버전 적용</div>
        </div>
        <button onClick={handleUpdate}
          className="bg-emerald-100 text-emerald-900 px-3 py-2 rounded font-black text-xs flex items-center gap-1 active:scale-95 transition">
          <RefreshCw className="w-3.5 h-3.5"/>업데이트
        </button>
        <button onClick={() => setHidden(true)} className="text-emerald-200 hover:text-white p-1">
          <X className="w-4 h-4"/>
        </button>
      </div>
    </div>
  );
}
