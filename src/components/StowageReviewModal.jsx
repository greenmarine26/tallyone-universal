// M6.14: STOWAGE INSTRUCTION PDF 자동 분석 검토 모달
//
// 흐름:
//   1. 사용자가 자료 탭에 STOWAGE PDF 끌어다 놓음
//   2. VoyagePage가 isStowagePdf() 자동 판별 → 이 모달 자동 호출
//   3. Gemini Vision으로 PDF 직접 분석 (사진 변환 없음)
//   4. 추출 결과 검토 화면 표시
//   5. 사용자가 콜사인/IMO 보완 + [등록] 버튼
//   6. localStorage(userBayDict) + Firebase(ship_bay_dict_v3) 동시 저장
//
// NBTD/MCSC 등 기존 정밀 등록 선박은 절대 건들지 않음 (덮어쓰기 방지)

import React, { useState, useEffect } from 'react';
import { X, FileText, Loader2, CheckCircle2, AlertTriangle, Save, Eye } from 'lucide-react';
import { ocrStowagePdf, stowageToBayDictEntry, GEMINI_API_KEY } from '../gemini.js';
import { autoBuildEntryFromPdf } from '../stowageAutoParser.js';
import { addToUserBayDict } from '../data/userBayDict.js';
import { _storage, SK } from '../utils.js';

// NBTD/MCSC 등 절대 덮어쓰면 안 되는 정밀 등록 코드 (사용자 영구 규칙)
const PROTECTED_CODES = ['NBTD', 'MCSC'];

export default function StowageReviewModal({ file, onClose, onRegistered, inspector, voyage }) {
  const [phase, setPhase] = useState('analyzing'); // analyzing | review | saving | done | error
  const [error, setError] = useState('');
  const [stowageData, setStowageData] = useState(null);
  // M6.14e: 항차 정보 자동 채우기 — 검수원이 항차 생성 시 입력한 코드/콜사인/IMO 그대로 사용
  //   원인: Gemini는 PDF에서 vesselName만 정확히 추출 가능. 검수원이 평소 쓰는 약자는 모름.
  //   해결: 자료 탭에서 PDF 등록 시 현재 항차의 voyage.info 데이터를 미리 채워서 매칭 보장.
  const [extra, setExtra] = useState({
    code: (voyage?.info?.vsl || '').toUpperCase().replace(/\s+/g, ''),
    callsign: (voyage?.info?.callsign || '').toUpperCase(),
    imo: voyage?.info?.imo || '',
  });
  const [showRaw, setShowRaw] = useState(false);
  const [savedResult, setSavedResult] = useState(null);

  // 자동 분석 시작
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    (async () => {
      try {
        setPhase('analyzing');
        // M6.70: 자체 파서 우선 (Gemini API 의존 0)
        let data;
        try {
          const code = (file.name || '').slice(0, 4).toUpperCase();
          const entry = await autoBuildEntryFromPdf(file, code);
          data = {
            vesselName: entry.name,
            bayDef: entry.bayDef,
            _entry: entry,
            _source: 'auto-parser',
          };
        } catch (parserErr) {
          // 2차 fallback — Gemini (자체 파서 실패 시)
          const apiKey = _storage.get(SK.geminiKey) || GEMINI_API_KEY;
          if (!apiKey) throw parserErr;
          data = await ocrStowagePdf(file, apiKey);
        }
        if (cancelled) return;
        setStowageData(data);
        // M6.14e: 항차 정보가 이미 있으면 그대로 유지, 없으면 Gemini 추정값 사용
        if (!voyage?.info?.vsl) {
          const vname = data?.vesselName || '';
          const code = vname.replace(/\s+/g, '').slice(0, 4).toUpperCase();
          setExtra(prev => ({ ...prev, code: prev.code || code }));
        }
        setPhase('review');
      } catch (e) {
        if (!cancelled) {
          setError(e.message || String(e));
          setPhase('error');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [file, voyage]);

  // 등록 처리
  const handleRegister = async () => {
    if (!stowageData) return;
    const code = (extra.code || '').toUpperCase().trim();
    if (!code) {
      alert('선박 코드(4자리)는 필수입니다.');
      return;
    }
    if (PROTECTED_CODES.includes(code)) {
      alert(`⛔ ${code}는 정밀 등록 보호 선박입니다.\n다른 코드를 사용하거나 작업 취소하세요.`);
      return;
    }
    try {
      setPhase('saving');
      const entry = stowageToBayDictEntry(stowageData, file.name, {
        code,
        callsign: extra.callsign.toUpperCase().trim(),
        imo: extra.imo.trim(),
      });
      // 사용자가 검토했으므로 verified 마킹
      entry.bayDef.verified = true;
      entry.bayDef.grade = 'user-verified-stowage';

      // 1단계: localStorage
      const lsSaved = addToUserBayDict(entry);

      // 2단계: Firebase
      let fbSaved = false;
      let pdfMeta = null;
      try {
        const { fbSaveShipBayDict, fbUploadStowagePdf } = await import('../firebase.js');

        // M6.40: PDF 자체 Firebase Storage 보관 (30일 자동 폐기)
        //   - 같은 선박 새 PDF 등록 시 이전 자동 삭제 (덮어쓰기)
        //   - 베이사전 형식 변경/재분석 필요 시 클릭 1번으로 재처리 가능
        //   - 검수원 PDF 재업로드 부담 0
        try {
          pdfMeta = await fbUploadStowagePdf(code, file);
        } catch (e) {
          console.warn('[M6.40] PDF Storage 업로드 실패 (베이사전은 정상 저장):', e);
        }

        fbSaved = await fbSaveShipBayDict(entry.code, {
          ...entry,
          source: 'stowage-pdf-ai',
          _inspector: inspector || '',
          // M6.40: PDF 메타
          pdfUrl: pdfMeta?.url || '',
          pdfPath: pdfMeta?.path || '',
          pdfName: pdfMeta?.name || file.name,
          pdfUploadedAt: pdfMeta?.uploadedAt || Date.now(),
        });
      } catch (e) {
        console.warn('[M6.14] Firebase 저장 실패:', e);
      }

      setSavedResult({ entry, lsSaved, fbSaved });
      setPhase('done');
      if (onRegistered) onRegistered(entry);
    } catch (e) {
      setError(e.message || String(e));
      setPhase('error');
    }
  };

  const bays = stowageData?.bays || [];
  const totals = stowageData?.totals || { _20: 0, _40: 0, _45: 0 };
  // 합계 검증
  const calcTotal = bays.reduce((acc, b) => ({
    _20: acc._20 + (b.loadCounts?._20 || 0),
    _40: acc._40 + (b.loadCounts?._40 || 0),
    _45: acc._45 + (b.loadCounts?._45 || 0),
  }), { _20: 0, _40: 0, _45: 0 });
  const totalsMatch = calcTotal._20 === totals._20 && calcTotal._40 === totals._40 && calcTotal._45 === totals._45;

  const standalone = bays.filter(b => b.isStandalone).length;
  const paired = bays.filter(b => b.isPair).length;
  const deckOnly = bays.filter(b => !b.hasHold).length;
  const withExtra = bays.filter(b => b.extraTier).length;

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-slate-900 border border-cyan-700/40 rounded-xl w-full max-w-3xl max-h-[95vh] overflow-y-auto">
        {/* 헤더 */}
        <div className="sticky top-0 bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-cyan-400" />
            <div>
              <div className="font-black text-base text-cyan-300">📄 STOWAGE PDF 자동 분석</div>
              <div className="text-[10px] text-slate-500 mono">{file?.name || ''}</div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-4">
          {/* analyzing */}
          {phase === 'analyzing' && (
            <div className="py-12 text-center">
              <Loader2 className="w-12 h-12 text-cyan-400 mx-auto animate-spin mb-4" />
              <div className="text-cyan-200 font-bold mb-1">M6.70 자동 파서 분석 중...</div>
              <div className="text-xs text-slate-500">PDF 페이지 수에 따라 10~30초 소요</div>
            </div>
          )}

          {/* error */}
          {phase === 'error' && (
            <div className="py-6">
              <div className="bg-red-950/40 border border-red-700/50 rounded p-3 mb-3">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-4 h-4 text-red-300" />
                  <span className="font-bold text-red-300">분석 실패</span>
                </div>
                <div className="text-xs text-red-200/80 whitespace-pre-wrap break-all">{error}</div>
              </div>
              <button onClick={onClose} className="w-full py-3 bg-slate-700 hover:bg-slate-600 rounded font-bold">닫기</button>
            </div>
          )}

          {/* review */}
          {phase === 'review' && stowageData && (
            <>
              {/* M6.14e: 현재 항차 정보 배너 (검수원이 이미 입력한 코드/콜사인 자동 사용) */}
              {voyage?.info?.vsl && (
                <div className="bg-blue-950/40 border border-blue-700/40 rounded p-2 mb-3 text-xs">
                  <div className="font-bold text-blue-200 mb-1">📌 현재 항차 정보 자동 적용</div>
                  <div className="text-blue-300 mono">
                    {voyage.info.vsl}
                    {voyage.info.vslFull && ` (${voyage.info.vslFull})`}
                    {voyage.info.callsign && ` · 콜사인 ${voyage.info.callsign}`}
                    {voyage.info.imo && ` · IMO ${voyage.info.imo}`}
                  </div>
                  <div className="text-slate-400 mt-1 text-[10px]">
                    아래 입력란에 자동 채워졌습니다. 그대로 [등록]하시면 EDI와 정확히 매칭됩니다.
                  </div>
                </div>
              )}

              {/* 선박 메타 */}
              <div className="bg-cyan-950/30 border border-cyan-700/40 rounded p-3 mb-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-slate-500 text-xs">PDF 선박명:</span> <b className="text-cyan-200">{stowageData.vesselName || '(없음)'}</b></div>
                  <div><span className="text-slate-500 text-xs">항차:</span> <b className="text-cyan-200">{stowageData.voyageNo || '-'}</b></div>
                  <div><span className="text-slate-500 text-xs">POL:</span> <b className="text-cyan-200">{stowageData.pol || '-'}</b></div>
                  <div><span className="text-slate-500 text-xs">DATE:</span> <b className="text-cyan-200">{stowageData.date || '-'}</b></div>
                </div>
              </div>

              {/* 검출 요약 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                <div className="bg-slate-800/60 rounded p-2 text-center">
                  <div className="text-[10px] text-slate-500">베이 박스</div>
                  <div className="text-xl font-black text-emerald-300">{bays.length}</div>
                </div>
                <div className="bg-slate-800/60 rounded p-2 text-center">
                  <div className="text-[10px] text-slate-500">트윈/단독</div>
                  <div className="text-xl font-black text-cyan-300">{paired}/{standalone}</div>
                </div>
                <div className="bg-slate-800/60 rounded p-2 text-center">
                  <div className="text-[10px] text-slate-500">데크 전용</div>
                  <div className="text-xl font-black text-amber-300">{deckOnly}</div>
                </div>
                <div className="bg-slate-800/60 rounded p-2 text-center">
                  <div className="text-[10px] text-slate-500">extraTier</div>
                  <div className="text-xl font-black text-purple-300">{withExtra}</div>
                </div>
              </div>

              {/* 합계 검증 */}
              <div className={`rounded p-2 mb-3 text-xs ${totalsMatch ? 'bg-emerald-950/40 border border-emerald-700/40' : 'bg-amber-950/40 border border-amber-700/40'}`}>
                <div className="flex items-center gap-2">
                  {totalsMatch
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                    : <AlertTriangle className="w-4 h-4 text-amber-300" />}
                  <span className="font-bold">
                    적재량 합계 {totalsMatch ? '검증 일치' : '불일치 — 확인 필요'}
                  </span>
                </div>
                <div className="text-slate-400 mt-1">
                  PDF 표시: <b className="text-slate-200 mono">{totals._20}/{totals._40}/{totals._45}</b>
                  &nbsp; ↔ &nbsp;
                  계산 합: <b className="text-slate-200 mono">{calcTotal._20}/{calcTotal._40}/{calcTotal._45}</b>
                </div>
              </div>

              {/* 사용자 보완 입력 */}
              <div className="bg-slate-800/40 rounded p-3 mb-3">
                <div className="text-xs font-bold text-slate-400 mb-2">⚓ 매칭 정보 보완 (PDF에 없는 정보)</div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-0.5">선박 코드*</label>
                    <input
                      type="text"
                      value={extra.code}
                      onChange={e => setExtra(p => ({ ...p, code: e.target.value.toUpperCase() }))}
                      maxLength={6}
                      placeholder="XINT"
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-2 text-sm text-cyan-100 mono font-bold focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-0.5">콜사인</label>
                    <input
                      type="text"
                      value={extra.callsign}
                      onChange={e => setExtra(p => ({ ...p, callsign: e.target.value.toUpperCase() }))}
                      placeholder="V7A123"
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-2 text-sm text-cyan-100 mono focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-0.5">IMO</label>
                    <input
                      type="text"
                      value={extra.imo}
                      onChange={e => setExtra(p => ({ ...p, imo: e.target.value }))}
                      placeholder="9123456"
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-2 text-sm text-cyan-100 mono focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>
                {PROTECTED_CODES.includes(extra.code) && (
                  <div className="mt-2 text-[11px] text-red-300 font-bold">
                    ⛔ {extra.code}는 정밀 등록 보호 선박입니다. 다른 코드 사용하세요.
                  </div>
                )}
                {/* M6.14e: 항차 코드와 다를 시 경고 */}
                {voyage?.info?.vsl && extra.code && extra.code !== (voyage.info.vsl || '').toUpperCase().replace(/\s+/g, '') && (
                  <div className="mt-2 text-[11px] text-amber-300 font-bold bg-amber-950/30 border border-amber-700/40 rounded px-2 py-1">
                    ⚠️ 현재 항차 코드 "{voyage.info.vsl}"와 다릅니다. 검수앱 EDI 매칭이 안 될 수 있습니다.
                    <br/>일치시키려면 코드란을 "{(voyage.info.vsl || '').toUpperCase().replace(/\s+/g, '')}"로 변경하세요.
                  </div>
                )}
              </div>

              {/* 베이별 상세 */}
              <div className="bg-slate-800/40 rounded p-2 mb-3">
                <div className="text-xs font-bold text-slate-400 mb-2 px-1">📋 추출된 베이 상세</div>
                <div className="max-h-64 overflow-y-auto text-xs">
                  <table className="w-full mono">
                    <thead className="sticky top-0 bg-slate-800">
                      <tr className="text-slate-500 text-[10px]">
                        <th className="text-left px-2 py-1">베이</th>
                        <th className="text-left px-1 py-1">형식</th>
                        <th className="text-left px-1 py-1">deck</th>
                        <th className="text-left px-1 py-1">hold</th>
                        <th className="text-left px-1 py-1">extra</th>
                        <th className="text-right px-2 py-1">20/40/45</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bays.map((b, idx) => (
                        <tr key={idx} className="border-t border-slate-800/60">
                          <td className="px-2 py-1 text-cyan-200 font-bold">{b.bayLabel || `BAY ${b.bayNo}`}</td>
                          <td className="px-1 py-1">
                            {b.isPair ? <span className="text-cyan-400">트윈</span>
                              : b.isStandalone ? <span className="text-amber-400">단독</span>
                              : <span className="text-slate-400">-</span>}
                            {!b.hasHold && <span className="text-purple-400 ml-1">·데크</span>}
                          </td>
                          <td className="px-1 py-1 text-slate-300">{(b.deckTiers || []).join(',')}</td>
                          <td className="px-1 py-1 text-slate-300">{(b.holdTiers || []).join(',') || <span className="text-slate-600">-</span>}</td>
                          <td className="px-1 py-1 text-purple-300 font-bold">{b.extraTier || ''}</td>
                          <td className="px-2 py-1 text-right text-emerald-300">
                            {(b.loadCounts?._20 || 0)}/{(b.loadCounts?._40 || 0)}/{(b.loadCounts?._45 || 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 원본 JSON 토글 (디버그) */}
              <button
                onClick={() => setShowRaw(!showRaw)}
                className="text-xs text-slate-500 hover:text-slate-300 mb-2 flex items-center gap-1"
              >
                <Eye className="w-3 h-3" /> {showRaw ? '원본 JSON 숨기기' : '원본 JSON 보기 (디버그)'}
              </button>
              {showRaw && (
                <pre className="bg-slate-950/80 border border-slate-800 rounded p-2 text-[10px] text-slate-400 overflow-auto max-h-40 mb-3">
                  {JSON.stringify(stowageData, null, 2)}
                </pre>
              )}

              {/* 액션 버튼 */}
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 rounded font-bold text-slate-200"
                >
                  취소
                </button>
                <button
                  onClick={handleRegister}
                  disabled={!extra.code || PROTECTED_CODES.includes(extra.code)}
                  className="flex-[2] py-3 bg-cyan-700 hover:bg-cyan-600 disabled:bg-slate-800 disabled:text-slate-600 rounded font-bold text-white flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  베이사전 등록 + Firebase 동기화
                </button>
              </div>

              <div className="mt-3 text-[10px] text-slate-500 leading-relaxed">
                💡 등록 후엔 자동으로 모든 검수원과 공유됩니다. 추출이 잘못된 경우 [취소] 하고 PDF 재확인 후 재시도하세요.
                NBTD/MCSC는 정밀 등록 보호되어 덮어쓰기 불가합니다.
              </div>
            </>
          )}

          {/* saving */}
          {phase === 'saving' && (
            <div className="py-12 text-center">
              <Loader2 className="w-10 h-10 text-cyan-400 mx-auto animate-spin mb-3" />
              <div className="text-cyan-200 font-bold">저장 중...</div>
            </div>
          )}

          {/* done */}
          {phase === 'done' && savedResult && (
            <div className="py-6 text-center">
              <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto mb-3" />
              <div className="text-emerald-300 font-black text-lg mb-2">베이사전 등록 완료</div>
              <div className="bg-emerald-950/30 border border-emerald-700/40 rounded p-3 text-sm mb-3 text-left">
                <div><b>{savedResult.entry.name}</b> ({savedResult.entry.code})</div>
                <div className="text-xs text-slate-400 mt-1">
                  베이 {savedResult.entry.bayDef.recordCount}개 · {savedResult.entry.bayDef.sectionCount}섹션
                </div>
                <div className="text-xs mt-2">
                  {savedResult.lsSaved ? '✅' : '⚠️'} localStorage{' '}
                  {savedResult.fbSaved ? '☁ Firebase 동기화 완료' : '⚠️ Firebase 동기화 실패 (오프라인 가능)'}
                </div>
              </div>
              <button onClick={onClose} className="w-full py-3 bg-cyan-700 hover:bg-cyan-600 rounded font-bold text-white">
                닫기
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
