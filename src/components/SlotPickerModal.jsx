// M3.74: 같은 슬롯에 컨테이너 2개 이상 있을 때 선택 모달
// FR 4개 다중 적재 케이스 지원 - 베이플랜에서 ⊕N 셀 클릭 시 표시
import React from 'react';
import { X } from 'lucide-react';
import { isoToLabel } from '../utils.js';

export default function SlotPickerModal({ open, slot, containers, onPick, onClose }) {
  if (!open || !containers || containers.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-2 sm:p-4">
      <div className="bg-slate-900 border-2 border-amber-700/50 rounded-2xl w-full sm:max-w-md overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
        {/* 헤더 */}
        <div className="px-4 py-3 border-b border-slate-700 bg-slate-800 flex items-center gap-2">
          <div className="flex-1">
            <div className="text-xs text-slate-400">선내 위치</div>
            <div className="text-base font-black text-amber-200 mono">
              Bay {slot?.bay} · Row {slot?.row} · Tier {slot?.tier}
            </div>
          </div>
          <span className="bg-amber-600 text-amber-50 px-2 py-1 rounded text-xs font-black">
            {containers.length}대
          </span>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 p-1">
            <X className="w-5 h-5"/>
          </button>
        </div>

        {/* 안내 */}
        <div className="px-4 py-2 border-b border-slate-800 bg-slate-950/50 text-[11px] text-slate-300">
          이 슬롯에 컨테이너가 {containers.length}대 적재되어 있습니다. 상세 보려면 선택하세요.
        </div>

        {/* 컨테이너 카드 리스트 */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {containers.map((c, i) => {
            const label = isoToLabel(c.iso) || c.iso || '?';
            const isReefer = c.rf || (c.iso && c.iso[2] === 'R');
            const isFr = c.fr;
            const isOt = c.ot || c.oog;
            const isTk = c.tk;
            const isDg = c.dg;
            const fe = c.fe || '';
            const wt = c.wt > 0 ? (c.wt / 1000).toFixed(1) + 't' : '';

            // 색깔 우선순위: DG > 리퍼 > 탱크 > FR > OT
            let borderColor = 'border-slate-700';
            if (isDg) borderColor = 'border-red-600';
            else if (isReefer) borderColor = 'border-cyan-500';
            else if (isTk) borderColor = 'border-orange-500';
            else if (isFr) borderColor = 'border-purple-500';
            else if (isOt) borderColor = 'border-purple-400';

            return (
              <button
                key={c.cn || i}
                onClick={() => onPick?.(c)}
                className={`w-full text-left px-3 py-3 bg-slate-800 hover:bg-slate-700 border-2 ${borderColor} rounded-lg transition active:scale-[0.98]`}
                style={{ minHeight: 64 }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="bg-slate-700 text-slate-300 text-[10px] px-1.5 py-0.5 rounded font-bold">
                    #{i + 1}
                  </span>
                  <span className="text-base font-black text-amber-200 mono flex-1 truncate">
                    {c.cn || '(컨번호 미정)'}
                  </span>
                  {fe && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-black ${
                      fe === 'F' ? 'bg-emerald-700 text-emerald-100' : 'bg-slate-600 text-slate-200'
                    }`}>
                      {fe}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                  <span className="text-slate-300 font-bold">{label}</span>
                  {wt && <span className="text-slate-400">{wt}</span>}
                  {isDg && <span className="bg-red-700 text-red-100 px-1.5 py-0.5 rounded font-bold">DG{c.un ? ` UN${c.un}` : ''}</span>}
                  {isReefer && <span className="bg-cyan-700 text-cyan-100 px-1.5 py-0.5 rounded font-bold">❄ {c.tmp || '미입력'}°C</span>}
                  {isFr && <span className="bg-purple-700 text-purple-100 px-1.5 py-0.5 rounded font-bold">FR</span>}
                  {isOt && !isFr && <span className="bg-purple-700 text-purple-100 px-1.5 py-0.5 rounded font-bold">OT</span>}
                  {isTk && <span className="bg-orange-700 text-orange-100 px-1.5 py-0.5 rounded font-bold">TK</span>}
                  {c.pol && <span className="text-slate-500">POL {c.pol.replace(/^KR/, '')}</span>}
                  {c.pod && <span className="text-slate-500">POD {c.pod.replace(/^KR/, '')}</span>}
                </div>
              </button>
            );
          })}
        </div>

        {/* 닫기 */}
        <div className="p-3 border-t border-slate-800 bg-slate-950">
          <button
            onClick={onClose}
            className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold rounded text-sm"
            style={{ minHeight: 48 }}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
