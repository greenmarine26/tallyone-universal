// 화면 데이터만 새로고침 버튼 — 페이지 리로드 없이 Firebase 실시간 구독만 재연결한다. (TallyOne 1.5)
//   사유(사용자 확정 2026-08-04): 터미널 실시간 자료를 보려고 브라우저 새로고침을 하면
//   로그인이 풀려 로그인 화면으로 돌아간다. 이 버튼은 로그인을 유지한 채 데이터만 최신으로 만든다.
import React from 'react';
import { RefreshCw } from 'lucide-react';

export default function RefreshDataButton({ onRefreshData, refreshing = false, refreshedAt = 0, className = '' }) {
  if (!onRefreshData) return null;
  const ago = (() => {
    if (!refreshedAt) return '';
    const m = Math.floor((Date.now() - refreshedAt) / 60000);
    if (m < 1) return '방금';
    if (m < 60) return `${m}분 전`;
    return `${Math.floor(m / 60)}시간 전`;
  })();
  return (
    <button
      onClick={onRefreshData}
      disabled={refreshing}
      title="화면을 다시 불러오지 않고 데이터만 최신으로 — 로그인이 풀리지 않습니다"
      className={`text-[11px] px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 border ${refreshing
        ? 'bg-slate-800 text-slate-500 border-slate-700'
        : 'bg-cyan-900/50 hover:bg-cyan-800/70 text-cyan-100 border-cyan-700/50'} ${className}`}
      style={{ minHeight: 34 }}
    >
      <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`}/>
      {refreshing ? '새로고침 중…' : '데이터 새로고침'}
      {!refreshing && ago && <span className="text-[10px] font-normal text-cyan-300/70">({ago})</span>}
    </button>
  );
}
