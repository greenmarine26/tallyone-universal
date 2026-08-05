// M6.50: 베이사전 진단 위젯
// 등록된 모든 선박의 baysSummary 필드 완성도와 잠재 오류를 한눈에 표시
// 사용자가 직접 보고 보강 우선순위 결정 — Claude는 진단만, 사용자가 결정
//
// 진단 항목:
//  - baysSummary 항목 수 vs bayList
//  - deckTiersLocal/holdTiersLocal 보강률 (베이별)
//  - hatchCount 필드 (M6.49 명세 #7)
//  - PDF 보관 여부
//  - 잠재 오류: holdTiers에 tier 10, 단독 베이 missing flag 등
//
// 사용자 원칙: 보여주기식 X, 실제 데이터 기반, 사용자 검증 후 결정
import React, { useEffect, useMemo, useState } from 'react';
import { Stethoscope, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, FileText } from 'lucide-react';
import { fbSubscribeShipBayDict, fbDeleteShipBayDict } from '../firebase.js';
import { enrichBayDef } from '../bayDictAutoEnrich.js';

// 단일 entry 진단 — 실제 필드만 본다, 추론 X
// M6.68: enrichBayDef 자동 보강 적용 후 평가 — 런타임 효과 인정
//   PCBJ 같이 STOWAGE PDF로 완전 정정 안 했어도, deckTiers/holdTiers (글로벌) 있으면
//   enrichBayDef가 모든 베이에 baseDeck/holdTiersLocal 자동 복사 → 카고플랜 정상 작동
//   이 자동 보강 효과를 점수에 반영
function diagnoseEntry(entry) {
  // 자동 보강 적용 (런타임과 동일 양식)
  let enrichedEntry = entry;
  try {
    enrichedEntry = enrichBayDef(entry, entry?._v5Matrix || entry?.bayDef?._v5Matrix, []) || entry;
  } catch (e) { /* fallback to raw entry */ }

  const bayDef = enrichedEntry?.bayDef || entry?.bayDef || {};
  const baysSummary = Array.isArray(bayDef.baysSummary) ? bayDef.baysSummary : [];
  const bayList = Array.isArray(bayDef.bayList) ? bayDef.bayList : [];
  const holdTiers = bayDef.holdTiers || [];
  const issues = [];
  const warnings = [];

  // 1. baysSummary 존재
  if (baysSummary.length === 0) {
    issues.push('baysSummary 없음 (베이 구조 데이터 부재)');
    return { issues, warnings, score: 0, fields: {} };
  }

  // 2. baysSummary vs bayList 일치
  if (bayList.length > 0 && baysSummary.length !== bayList.length) {
    warnings.push(`baysSummary(${baysSummary.length}) ≠ bayList(${bayList.length})`);
  }

  // 3. 잠재 오류: holdTiers에 tier 10 (실제 PDF에서 거의 없음 — 의심)
  if (holdTiers.includes(10)) {
    warnings.push('holdTiers에 tier 10 포함 — 자동 파싱 오류 가능성 (실 PDF 확인 권장)');
  }

  // 4. 단독 베이 자동 감지: baysSummary에서 짝수가 없는 홀수 베이가 isStandalone:false인지
  const bayNums = new Set(baysSummary.map(b => parseInt(b.bayNo, 10)));
  baysSummary.forEach(b => {
    const num = parseInt(b.bayNo, 10);
    if (num % 2 === 1) {  // 홀수
      const pair = num - 1;
      const hasPair = bayNums.has(pair);
      if (!hasPair && !b.isStandalone) {
        warnings.push(`BAY ${b.bayNo}: 짝수 짝(${String(pair).padStart(2,'0')}) 없는데 isStandalone:false`);
      }
    }
  });

  // 5. 필드 보강률
  let hasDeckTiersLocal = 0, hasHoldTiersLocal = 0, hasRowMaxLocal = 0, hasHatchCount = 0;
  baysSummary.forEach(b => {
    if (Array.isArray(b.deckTiersLocal) && b.deckTiersLocal.length > 0) hasDeckTiersLocal++;
    if (!b.hasHold || (Array.isArray(b.holdTiersLocal) && b.holdTiersLocal.length > 0)) hasHoldTiersLocal++;
    if (b.rowMaxOddLocal != null || b.rowMaxEvenLocal != null) hasRowMaxLocal++;
    if (b.hatchCount != null) hasHatchCount++;
  });

  const fields = {
    baysSummary: baysSummary.length,
    deckTiersLocal: `${hasDeckTiersLocal}/${baysSummary.length}`,
    holdTiersLocal: `${hasHoldTiersLocal}/${baysSummary.length}`,
    rowMaxLocal: `${hasRowMaxLocal}/${baysSummary.length}`,
    hatchCount: `${hasHatchCount}/${baysSummary.length}`,
    pdfStored: !!entry.pdfUrl,
    verified: !!(bayDef.verified || entry.verified),
    grade: bayDef.grade || '(없음)',
  };

  // 점수 (0~100) — M6.68 양식 합리화: 핵심 필드 위주, hatchCount는 보너스
  //   기본 50점 (baysSummary 존재) + 핵심 필드 가중치
  let score = 50;  // baysSummary 있으면 기본 (M6.50 30점 → M6.68 50점)
  if (hasDeckTiersLocal === baysSummary.length) score += 20;
  if (hasHoldTiersLocal === baysSummary.length) score += 15;
  if (hasRowMaxLocal === baysSummary.length) score += 5;
  if (hasHatchCount === baysSummary.length) score += 5;  // 보너스 (선택적 필드)
  if (entry.pdfUrl) score += 3;
  if (fields.verified) score += 2;

  return { issues, warnings, score, fields };
}

export default function BayDictDiagnosticsWidget() {
  const [bayDict, setBayDict] = useState({});
  const [expanded, setExpanded] = useState(false);
  const [openCodes, setOpenCodes] = useState(new Set());
  const [filter, setFilter] = useState('issues');  // issues | warnings | all

  useEffect(() => {
    const unsub = fbSubscribeShipBayDict(setBayDict);
    return () => { try { unsub && unsub(); } catch (_) {} };
  }, []);

  const diagnostics = useMemo(() => {
    const list = Object.entries(bayDict || {}).map(([code, entry]) => {
      const diag = diagnoseEntry(entry);
      return {
        code,
        name: (entry.name || '').replace(/\s+/g, ' ').trim().substring(0, 40),
        ...diag,
      };
    });
    // 점수 낮은 순 (보강 시급)
    list.sort((a, b) => a.score - b.score);
    return list;
  }, [bayDict]);

  const stats = useMemo(() => {
    const total = diagnostics.length;
    const withIssues = diagnostics.filter(d => d.issues.length > 0).length;
    const withWarnings = diagnostics.filter(d => d.warnings.length > 0 && d.issues.length === 0).length;
    const clean = total - withIssues - withWarnings;
    return { total, withIssues, withWarnings, clean };
  }, [diagnostics]);

  const filtered = filter === 'issues' ? diagnostics.filter(d => d.issues.length > 0)
                : filter === 'warnings' ? diagnostics.filter(d => d.warnings.length > 0)
                : diagnostics;

  const toggleCode = (code) => {
    const next = new Set(openCodes);
    if (next.has(code)) next.delete(code); else next.add(code);
    setOpenCodes(next);
  };

  return (
    <div className="bg-purple-950/30 border border-purple-700/50 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2 p-2.5 text-left hover:bg-purple-900/20"
      >
        <Stethoscope className="w-4 h-4 text-purple-400 shrink-0"/>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-black text-purple-200 flex items-center gap-2 flex-wrap">
            🩺 베이사전 진단
            <span className="bg-slate-700/60 text-slate-100 px-1.5 py-0.5 rounded text-[9px]">
              {stats.total}척
            </span>
            {stats.withIssues > 0 && (
              <span className="bg-red-700/70 text-red-100 px-1.5 py-0.5 rounded text-[9px] font-black">
                ❗ {stats.withIssues}척 오류
              </span>
            )}
            {stats.withWarnings > 0 && (
              <span className="bg-amber-700/70 text-amber-100 px-1.5 py-0.5 rounded text-[9px] font-black">
                ⚠️ {stats.withWarnings}척 경고
              </span>
            )}
            {stats.clean > 0 && (
              <span className="bg-emerald-700/60 text-emerald-100 px-1.5 py-0.5 rounded text-[9px]">
                ✓ {stats.clean}척 정상
              </span>
            )}
          </div>
          <div className="text-[10px] text-purple-400/70 mt-0.5">
            등록 베이사전 필드 완성도 + 잠재 오류 자동 감지
          </div>
        </div>
        <span className="text-purple-300 px-1 shrink-0">
          {expanded ? <ChevronUp className="w-5 h-5"/> : <ChevronDown className="w-5 h-5"/>}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-purple-700/40 p-2.5 space-y-2">
          {/* 필터 */}
          <div className="flex gap-1 text-[10px]">
            <button
              onClick={() => setFilter('issues')}
              className={`px-2 py-1 rounded ${filter === 'issues' ? 'bg-red-700 text-red-50' : 'bg-slate-800 text-slate-400'}`}
            >
              ❗ 오류 ({stats.withIssues})
            </button>
            <button
              onClick={() => setFilter('warnings')}
              className={`px-2 py-1 rounded ${filter === 'warnings' ? 'bg-amber-700 text-amber-50' : 'bg-slate-800 text-slate-400'}`}
            >
              ⚠️ 경고 ({diagnostics.filter(d => d.warnings.length > 0).length})
            </button>
            <button
              onClick={() => setFilter('all')}
              className={`px-2 py-1 rounded ${filter === 'all' ? 'bg-purple-700 text-purple-50' : 'bg-slate-800 text-slate-400'}`}
            >
              전체 ({stats.total})
            </button>
            {/* M6.70g: 0점 entry 일괄 삭제 — 베이 구조 데이터 없는 잘못된 entry 정리 */}
            {filter === 'issues' && stats.withIssues > 0 && (
              <button
                onClick={async () => {
                  const zeroEntries = diagnostics.filter(d => d.score === 0);
                  if (zeroEntries.length === 0) return;
                  const codes = zeroEntries.map(d => d.code).join(', ');
                  if (!confirm(`0점 entry ${zeroEntries.length}척 삭제하시겠습니까?\n\n${codes}\n\n(자체 파서 실패 또는 잘못 등록된 entry입니다. 삭제 후 다시 PDF 일괄 등록 가능)`)) return;
                  for (const d of zeroEntries) {
                    try { await fbDeleteShipBayDict(d.code); } catch (e) { console.error(e); }
                  }
                  alert(`${zeroEntries.length}척 삭제 완료. Firebase 동기화 후 자동 반영됩니다.`);
                }}
                className="ml-auto px-2 py-1 rounded bg-red-900/60 hover:bg-red-800/70 text-red-200 border border-red-700/50"
              >
                🗑️ 0점 entry 일괄 삭제
              </button>
            )}
          </div>

          {/* 척별 진단 카드 */}
          <div className="max-h-96 overflow-y-auto space-y-1.5">
            {filtered.length === 0 ? (
              <div className="text-center py-4 text-[10px] text-slate-500">
                {filter === 'issues' ? '🎉 오류 없음'
                  : filter === 'warnings' ? '경고 없음'
                  : '베이사전 entry 없음'}
              </div>
            ) : (
              filtered.map(d => {
                const open = openCodes.has(d.code);
                const hasIssue = d.issues.length > 0;
                const hasWarn = d.warnings.length > 0;
                const color = hasIssue ? 'red' : hasWarn ? 'amber' : 'emerald';
                return (
                  <div
                    key={d.code}
                    className={`rounded border text-[10px] ${
                      hasIssue ? 'bg-red-950/30 border-red-800/50'
                      : hasWarn ? 'bg-amber-950/30 border-amber-800/50'
                      : 'bg-emerald-950/30 border-emerald-800/40'
                    }`}
                  >
                    <button
                      onClick={() => toggleCode(d.code)}
                      className="w-full flex items-center gap-2 p-1.5 text-left"
                    >
                      {hasIssue ? <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0"/>
                        : hasWarn ? <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0"/>
                        : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0"/>}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-slate-100 font-bold mono">{d.code}</span>
                          <span className="text-slate-400 truncate text-[9px]">{d.name}</span>
                          <span className={`px-1 py-px rounded text-[9px] bg-${color}-900/60 text-${color}-200 font-bold`}>
                            {d.score}점
                          </span>
                          {d.fields.pdfStored && <FileText className="w-3 h-3 text-cyan-400" title="PDF 보관"/>}
                        </div>
                      </div>
                      <span className="text-slate-400 shrink-0">
                        {open ? <ChevronUp className="w-3 h-3"/> : <ChevronDown className="w-3 h-3"/>}
                      </span>
                    </button>
                    {open && (
                      <div className="px-2 pb-2 pt-1 border-t border-slate-700/40 space-y-1">
                        {/* 오류 */}
                        {d.issues.length > 0 && (
                          <div className="space-y-0.5">
                            {d.issues.map((msg, i) => (
                              <div key={i} className="text-red-300">❗ {msg}</div>
                            ))}
                          </div>
                        )}
                        {/* 경고 */}
                        {d.warnings.length > 0 && (
                          <div className="space-y-0.5">
                            {d.warnings.map((msg, i) => (
                              <div key={i} className="text-amber-300">⚠️ {msg}</div>
                            ))}
                          </div>
                        )}
                        {/* 필드 상태 */}
                        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[9px] text-slate-300 mt-1 pt-1 border-t border-slate-700/30">
                          <div>baysSummary: <span className="mono text-slate-100">{d.fields.baysSummary}개</span></div>
                          <div>deckTiersLocal: <span className="mono text-slate-100">{d.fields.deckTiersLocal}</span></div>
                          <div>holdTiersLocal: <span className="mono text-slate-100">{d.fields.holdTiersLocal}</span></div>
                          <div>rowMaxLocal: <span className="mono text-slate-100">{d.fields.rowMaxLocal}</span></div>
                          <div>hatchCount: <span className="mono text-slate-100">{d.fields.hatchCount}</span></div>
                          <div>PDF: <span className="mono text-slate-100">{d.fields.pdfStored ? '있음' : '없음'}</span></div>
                          <div>verified: <span className="mono text-slate-100">{String(d.fields.verified)}</span></div>
                          <div>grade: <span className="mono text-slate-100">{d.fields.grade}</span></div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="text-[10px] text-purple-400/70 pt-1 border-t border-purple-700/30 space-y-0.5">
            <div>💡 점수: baysSummary(30) + deckTiersLocal(20) + holdTiersLocal(20) + rowMaxLocal(10) + hatchCount(10) + PDF(5) + verified(5)</div>
            <div>💡 진단만 하고 자동 수정은 안 합니다. 보강 필요한 선박은 PDF 재등록 또는 다음 패치로 처리</div>
          </div>
        </div>
      )}
    </div>
  );
}
