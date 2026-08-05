// M3.87: 미배정(선적대상) 컨테이너 목록 모달
//   - 베이플랜에서 빠진(bay 없는) 컨테이너만 모아서 표시
//   - 각 컨에 "위치 지정" 버튼 → PositionEditModal 호출
import React, { useMemo } from 'react';
import { X, Truck, MapPin } from 'lucide-react';

export default function UnassignedListModal({
  open,
  containers = [],   // 선적 모드 전체 (이 안에서 bay 없는 것만 필터)
  onClose,
  onPickContainer,   // (container) => void  → PositionEditModal 호출
}) {
  const list = useMemo(() => {
    return containers.filter(c => !c.bay);
  }, [containers]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-slate-900 border-2 border-orange-700 rounded-xl max-w-lg w-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-orange-400"/>
            <h2 className="text-lg font-black text-orange-300">선적대상 ({list.length}대)</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200"><X className="w-5 h-5"/></button>
        </div>

        <div className="overflow-y-auto p-3 flex-1">
          {list.length === 0 ? (
            <div className="text-center py-8 text-slate-500">선적대상 없음 (모든 컨이 베이에 배정됨)</div>
          ) : (
            <div className="space-y-2">
              {list.map(c => {
                const isFull = c.fe === 'F';
                const isCompleted = !!c._comp;
                return (
                  <div key={c.cn} className="bg-slate-800 border border-slate-700 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="text-2xl font-black mono text-amber-300">{c.l4 || c.cn?.slice(-4)}</span>
                      <span className="text-sm font-bold mono text-slate-200 flex-1 truncate">{c.cn}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] flex-wrap mb-2">
                      <span className={`px-1.5 py-0.5 rounded font-black ${isFull ? 'bg-rose-700 text-rose-50' : 'bg-slate-700 text-slate-300'}`}>
                        {isFull ? '풀' : c.fe === 'E' ? '엠티' : '미정'}
                      </span>
                      {c.iso && <span className="bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded mono">{c.iso}</span>}
                      {c.sl && <span className="bg-slate-700 text-amber-300 px-1.5 py-0.5 rounded mono">실 {c.sl}</span>}
                      {isCompleted && <span className="bg-emerald-700 text-emerald-50 px-1.5 py-0.5 rounded font-black">✓완료</span>}
                    </div>
                    <button onClick={() => onPickContainer(c)}
                      className="w-full py-2 bg-amber-700 hover:bg-amber-600 text-amber-50 font-black rounded text-sm flex items-center justify-center gap-1.5">
                      <MapPin className="w-4 h-4"/>위치 지정
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
