// M4.9e 3단계: 자리 뺏긴 컨테이너 사이드바
// M4.9f: 5단계 단순 — 카드에 "📦 이동" 버튼 추가
//   클릭 → onStartMove(c) 호출 → VoyagePage가 pendingMove 설정
//   이후 베이 그리드의 빈 셀 클릭하면 그 자리로 이동(fbSetActualPosition)
//   기존 카드 본문 클릭은 계속 모달(수정 위치 입력) 열기 — 두 진입점 공존
import React from 'react';
import { AlertTriangle, MapPin, ArrowRight, Move } from 'lucide-react';

export default function DisplacedSidebar({ displaced, onOpenContainer, onStartMove, pendingMoveCn }) {
  if (!displaced || displaced.length === 0) {
    return (
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3">
        <div className="text-[11px] font-bold uppercase text-slate-400 mb-1">자리 뺏긴 컨테이너</div>
        <div className="text-xs text-slate-500">없음</div>
      </div>
    );
  }

  return (
    <div className="bg-amber-900/20 border-2 border-amber-700/50 rounded-lg overflow-hidden">
      <div className="bg-amber-800/40 px-3 py-2 flex items-center gap-2 border-b border-amber-700/40">
        <AlertTriangle className="w-4 h-4 text-amber-300"/>
        <span className="text-[11px] font-black uppercase text-amber-100">
          자리 뺏긴 컨테이너 {displaced.length}대
        </span>
      </div>
      <div className="text-[10px] text-amber-200/70 px-3 py-1 border-b border-amber-700/30 leading-tight">
        📦 [이동] 누르면 → 베이그리드 빈 셀 클릭 / 카드 본문은 직접 입력
      </div>
      <div className="max-h-96 overflow-y-auto">
        {displaced.map(c => {
          const isPending = pendingMoveCn === c.cn;
          return (
            <div key={c.cn}
              className={`flex items-stretch border-b border-amber-700/20 ${
                isPending ? 'bg-amber-700/40 ring-2 ring-amber-300' : 'hover:bg-amber-800/20'
              } transition`}>
              {/* 본문 — 클릭 시 모달 (수정 위치 직접 입력) */}
              <button
                onClick={() => onOpenContainer && onOpenContainer(c)}
                className="flex-1 text-left px-3 py-2 active:bg-amber-800/40">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-sm font-black mono text-amber-100">{c.cn}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                    c.fe === 'F' ? 'bg-emerald-700 text-emerald-50' : 'bg-slate-600 text-slate-200'
                  }`}>{c.fe || '?'}</span>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-amber-200/80">
                  <MapPin className="w-3 h-3 text-amber-400"/>
                  <span className="mono">
                    {c._bay_planned || c.bay || '--'}/
                    {c._row_planned || c.row || '--'}/
                    {c._tier_planned || c.tier || '--'}
                  </span>
                  {c._displacedBy && (
                    <>
                      <ArrowRight className="w-3 h-3 text-amber-400 mx-0.5"/>
                      <span className="text-[10px] text-amber-300/70">
                        {c._displacedBy} 점유
                      </span>
                    </>
                  )}
                </div>
              </button>
              {/* 📦 이동 버튼 — 클릭 시 pendingMove 진입 */}
              <button
                onClick={() => onStartMove && onStartMove(c)}
                className={`px-3 flex flex-col items-center justify-center gap-0.5 border-l border-amber-700/30 ${
                  isPending
                    ? 'bg-amber-500 text-slate-900'
                    : 'bg-amber-800/30 text-amber-200 hover:bg-amber-700/50 active:bg-amber-600'
                } transition`}
                title="이동 시작 — 빈 셀 누르세요"
              >
                <Move className="w-4 h-4"/>
                <span className="text-[9px] font-black">{isPending ? '선택중' : '이동'}</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
