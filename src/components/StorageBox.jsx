// M5.1 I: 보관함 박스
//   bay_actual === '__STG__' 인 컨들을 별도 박스에 표시
//   카드 우측 [📦 이동] 버튼 — 다시 베이 그리드로 보내기 (DisplacedSidebar와 같은 패턴)
//   카드 본문 클릭 — 컨 모달 (수정 위치 직접 입력)
//   헤더 [일괄 복원] — 모두 bay_actual 클리어 → 계획 위치로 돌아감
import React from 'react';
import { Archive, MapPin, Move, RotateCcw } from 'lucide-react';

export default function StorageBox({ stored, onOpenContainer, onStartMove, pendingMoveCn, onBatchRestore }) {
  if (!stored || stored.length === 0) return null;

  return (
    <div className="bg-slate-800/40 border-2 border-slate-600/50 rounded-lg overflow-hidden">
      <div className="bg-slate-700/50 px-3 py-2 flex items-center gap-2 border-b border-slate-600/40">
        <Archive className="w-4 h-4 text-slate-200"/>
        <span className="text-[11px] font-black uppercase text-slate-100 flex-1">
          보관함 {stored.length}대
        </span>
        {onBatchRestore && (
          <button onClick={onBatchRestore}
            className="px-2 py-0.5 bg-slate-900/60 hover:bg-slate-900 text-slate-200 rounded text-[10px] font-bold flex items-center gap-1"
            title="모든 보관 컨을 계획 위치로 복원">
            <RotateCcw className="w-3 h-3"/>일괄 복원
          </button>
        )}
      </div>
      <div className="text-[10px] text-slate-400 px-3 py-1 border-b border-slate-700/30 leading-tight">
        📦 [이동] 누르면 → 베이그리드 빈 셀 클릭 / 카드 본문은 직접 입력
      </div>
      <div className="max-h-72 overflow-y-auto">
        {stored.map(c => {
          const isPending = pendingMoveCn === c.cn;
          return (
            <div key={c.cn}
              className={`flex items-stretch border-b border-slate-700/20 ${
                isPending ? 'bg-slate-600/40 ring-2 ring-amber-300' : 'hover:bg-slate-700/20'
              } transition`}>
              <button
                onClick={() => onOpenContainer && onOpenContainer(c)}
                className="flex-1 text-left px-3 py-2 active:bg-slate-700/40">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-sm font-black mono text-slate-100">{c.cn}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                    c.fe === 'F' ? 'bg-emerald-700 text-emerald-50' : 'bg-slate-600 text-slate-200'
                  }`}>{c.fe || '?'}</span>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-slate-300/80">
                  <MapPin className="w-3 h-3 text-slate-400"/>
                  <span className="mono">
                    계획: {c.bay || '--'}/{c.row || '--'}/{c.tier || '--'}
                  </span>
                </div>
              </button>
              <button
                onClick={() => onStartMove && onStartMove(c)}
                className={`px-3 flex flex-col items-center justify-center gap-0.5 border-l border-slate-700/30 ${
                  isPending
                    ? 'bg-amber-500 text-slate-900'
                    : 'bg-slate-700/30 text-slate-200 hover:bg-slate-600/50 active:bg-slate-500'
                } transition`}
                title="베이 그리드 빈 셀로 이동"
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
