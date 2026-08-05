// 업로드 충돌/매칭 실패 확인 모달 (M3.5.4-fix2)
// 리스트 업로드 후 EDI와 비교해서 이상 발견 시 검수원에게 확인
//
// 검출:
//   - EDI에 없는 컨번호가 리스트에 있음 (추가? 무시?)
//   - 무게 큰 차이 (1톤 이상)
//   - 실번호 불일치 (EDI에 있던 실번호 vs 리스트 실번호)
//
// 결정:
//   - 컨별로 [추가/무시] [EDI 사용/리스트 사용] 선택
//   - "모두 추가/무시" 일괄 처리
import React, { useState } from 'react';
import { X, AlertTriangle, Plus, Check, ChevronRight } from 'lucide-react';

export default function ConflictReviewModal({ open, onClose, conflicts, onResolve }) {
  // conflicts 형식:
  // {
  //   unmatched: [{cn, sl, wt, ...}, ...],  // EDI에 없는데 리스트에 있는 컨
  //   weightDiffs: [{cn, ediW, listW}, ...],
  //   sealDiffs: [{cn, ediSl, listSl}, ...],
  // }

  const [decisions, setDecisions] = useState({}); // { cn: 'add'|'ignore' or 'edi'|'list' }

  if (!open || !conflicts) return null;

  const unmatched = conflicts.unmatched || [];
  const weightDiffs = conflicts.weightDiffs || [];
  const sealDiffs = conflicts.sealDiffs || [];
  const total = unmatched.length + weightDiffs.length + sealDiffs.length;

  if (total === 0) return null;

  const setDecision = (cn, val) => setDecisions(prev => ({ ...prev, [cn]: val }));

  const setAllUnmatched = (val) => {
    setDecisions(prev => {
      const next = { ...prev };
      unmatched.forEach(c => { next['unmatched:' + c.cn] = val; });
      return next;
    });
  };
  const setAllWeights = (val) => {
    setDecisions(prev => {
      const next = { ...prev };
      weightDiffs.forEach(c => { next['weight:' + c.cn] = val; });
      return next;
    });
  };
  const setAllSeals = (val) => {
    setDecisions(prev => {
      const next = { ...prev };
      sealDiffs.forEach(c => { next['seal:' + c.cn] = val; });
      return next;
    });
  };

  const handleApply = () => {
    onResolve({
      unmatchedActions: unmatched.map(c => ({
        cn: c.cn,
        action: decisions['unmatched:' + c.cn] || 'ignore',  // 기본 무시
        data: c,
      })),
      weightActions: weightDiffs.map(c => ({
        cn: c.cn,
        action: decisions['weight:' + c.cn] || 'edi',  // 기본 EDI 우선
        ediW: c.ediW, listW: c.listW,
      })),
      sealActions: sealDiffs.map(c => ({
        cn: c.cn,
        action: decisions['seal:' + c.cn] || 'edi',  // 기본 EDI 우선
        ediSl: c.ediSl, listSl: c.listSl,
      })),
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-slate-900 border-2 border-amber-700/50 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-xl h-[92vh] sm:h-auto sm:max-h-[92vh] flex flex-col overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-amber-950/40">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400"/>
            <div>
              <div className="text-base font-black text-amber-200">업로드 검토 필요</div>
              <div className="text-[11px] text-slate-400">{total}건 — EDI와 다른 점 확인</div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg">
            <X className="w-5 h-5 text-slate-300"/>
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {/* 1. EDI에 없는 컨번호 */}
          {unmatched.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-bold text-amber-300">
                  📋 EDI에 없는 컨테이너 ({unmatched.length}대)
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setAllUnmatched('add')}
                    className="text-[10px] px-2 py-1 bg-emerald-700 text-white rounded font-bold">
                    모두 추가
                  </button>
                  <button onClick={() => setAllUnmatched('ignore')}
                    className="text-[10px] px-2 py-1 bg-slate-700 text-slate-200 rounded font-bold">
                    모두 무시
                  </button>
                </div>
              </div>
              <div className="text-[10px] text-slate-500 mb-2">
                리스트엔 있는데 EDI에 없는 컨테이너 — 새로 추가하시겠습니까?
              </div>
              <div className="space-y-1.5">
                {unmatched.map((c) => (
                  <div key={c.cn} className="bg-slate-800 border border-slate-700 rounded p-2">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="font-bold text-amber-200 mono text-xs">{c.cn}</div>
                      <div className="text-[10px] text-slate-400">
                        {c.sl && <span>실: {c.sl}</span>}
                        {c.wt > 0 && <span className="ml-2">{(c.wt/1000).toFixed(1)}t</span>}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      <button onClick={() => setDecision('unmatched:' + c.cn, 'add')}
                        className={`py-1.5 text-xs font-bold rounded border ${
                          decisions['unmatched:' + c.cn] === 'add'
                            ? 'bg-emerald-600 text-white border-emerald-400'
                            : 'bg-slate-900 text-slate-400 border-slate-700'
                        }`}>
                        ➕ 추가
                      </button>
                      <button onClick={() => setDecision('unmatched:' + c.cn, 'ignore')}
                        className={`py-1.5 text-xs font-bold rounded border ${
                          decisions['unmatched:' + c.cn] === 'ignore'
                            ? 'bg-slate-600 text-white border-slate-400'
                            : 'bg-slate-900 text-slate-400 border-slate-700'
                        }`}>
                        ✕ 무시
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 2. 무게 차이 */}
          {weightDiffs.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-bold text-orange-300">
                  ⚖️ 무게 차이 1톤 이상 ({weightDiffs.length}건)
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setAllWeights('edi')}
                    className="text-[10px] px-2 py-1 bg-blue-700 text-white rounded font-bold">
                    모두 EDI
                  </button>
                  <button onClick={() => setAllWeights('list')}
                    className="text-[10px] px-2 py-1 bg-emerald-700 text-white rounded font-bold">
                    모두 리스트
                  </button>
                </div>
              </div>
              <div className="text-[10px] text-slate-500 mb-2">
                EDI 무게와 리스트 무게가 다릅니다 — 어느 쪽을 사용하시겠습니까?
              </div>
              <div className="space-y-1.5">
                {weightDiffs.map((c) => (
                  <div key={c.cn} className="bg-slate-800 border border-slate-700 rounded p-2">
                    <div className="font-bold text-orange-200 mono text-xs mb-1.5">{c.cn}</div>
                    <div className="grid grid-cols-2 gap-1">
                      <button onClick={() => setDecision('weight:' + c.cn, 'edi')}
                        className={`py-1.5 text-xs font-bold rounded border ${
                          decisions['weight:' + c.cn] === 'edi'
                            ? 'bg-blue-600 text-white border-blue-400'
                            : 'bg-slate-900 text-slate-400 border-slate-700'
                        }`}>
                        EDI {(c.ediW/1000).toFixed(1)}t
                      </button>
                      <button onClick={() => setDecision('weight:' + c.cn, 'list')}
                        className={`py-1.5 text-xs font-bold rounded border ${
                          decisions['weight:' + c.cn] === 'list'
                            ? 'bg-emerald-600 text-white border-emerald-400'
                            : 'bg-slate-900 text-slate-400 border-slate-700'
                        }`}>
                        리스트 {(c.listW/1000).toFixed(1)}t
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 3. 실번호 불일치 */}
          {sealDiffs.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-bold text-purple-300">
                  🔒 실번호 불일치 ({sealDiffs.length}건)
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setAllSeals('edi')}
                    className="text-[10px] px-2 py-1 bg-blue-700 text-white rounded font-bold">
                    모두 EDI
                  </button>
                  <button onClick={() => setAllSeals('list')}
                    className="text-[10px] px-2 py-1 bg-emerald-700 text-white rounded font-bold">
                    모두 리스트
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                {sealDiffs.map((c) => (
                  <div key={c.cn} className="bg-slate-800 border border-slate-700 rounded p-2">
                    <div className="font-bold text-purple-200 mono text-xs mb-1.5">{c.cn}</div>
                    <div className="grid grid-cols-2 gap-1">
                      <button onClick={() => setDecision('seal:' + c.cn, 'edi')}
                        className={`py-1.5 text-xs font-bold rounded border text-left px-2 ${
                          decisions['seal:' + c.cn] === 'edi'
                            ? 'bg-blue-600 text-white border-blue-400'
                            : 'bg-slate-900 text-slate-400 border-slate-700'
                        }`}>
                        <div className="text-[9px] opacity-70">EDI</div>
                        <div className="mono text-[11px]">{c.ediSl}</div>
                      </button>
                      <button onClick={() => setDecision('seal:' + c.cn, 'list')}
                        className={`py-1.5 text-xs font-bold rounded border text-left px-2 ${
                          decisions['seal:' + c.cn] === 'list'
                            ? 'bg-emerald-600 text-white border-emerald-400'
                            : 'bg-slate-900 text-slate-400 border-slate-700'
                        }`}>
                        <div className="text-[9px] opacity-70">리스트</div>
                        <div className="mono text-[11px]">{c.listSl}</div>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* 버튼 */}
        <div className="grid grid-cols-2 gap-2 p-3 border-t border-slate-700 bg-slate-950 flex-shrink-0">
          <button onClick={onClose}
            className="py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold rounded text-sm">
            취소 (저장 안함)
          </button>
          <button onClick={handleApply}
            className="py-3 bg-emerald-700 hover:bg-emerald-600 text-white font-black rounded text-sm">
            적용하기 →
          </button>
        </div>
      </div>
    </div>
  );
}
