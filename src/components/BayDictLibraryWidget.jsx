// M6.43: 베이사전 라이브러리 위젯
//   - 등록 N척 / 누락 M척 / 등록률 % 표시
//   - 누락 선박 리스트 (단골 우선)
//   - PDF 단일 + 일괄 등록 버튼 통합 (한 위젯 안에서 다 처리)
import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Database, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, Upload, FolderOpen } from 'lucide-react';
import { fbSubscribeShipBayDict, fbSubscribeShipLibrary, fbBatchSaveShipBayDict } from '../firebase.js';
import { mergeUserBayDictFrom } from '../data/userBayDict.js';
// TallyUni 0.9: 이미 설치를 마친 회사가 기본 선박 사전을 뒤늦게 심는 통로.
// TallyUni 0.9-01: 씨앗은 앱이 내려받지 않는다(회사 자산 — 공개 사이트에서 내렸다).
//   버튼을 누르면 파일 선택창이 열리고, 고른 파일을 읽어 심는다. 심는 경로는 0.9 그대로다.
import { readBayDictSeedFile, chunkShips } from '../bayDictSeed.js';
import { useCanWriteBayDict } from '../useMatrixPerm.js';

export default function BayDictLibraryWidget({ onSingleUpload, onBulkUpload, onAscUpload }) {
  const [bayDict, setBayDict] = useState({});
  const [ships, setShips] = useState({});
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState('missing');  // missing | all | registered
  const singleRef = useRef(null);
  // TallyUni 0.9: 기본 사전 가져오기 — 관리자(matrix_editors)에게만 보인다.
  const { canEdit } = useCanWriteBayDict();
  const [seedBusy, setSeedBusy] = useState(false);
  const [seedMsg, setSeedMsg] = useState('');
  const seedRef = useRef(null);   // TallyUni 0.9-01: 사전 파일 선택창

  useEffect(() => {
    const unsubDict = fbSubscribeShipBayDict(setBayDict);
    const unsubShips = fbSubscribeShipLibrary(setShips);
    return () => {
      try { unsubDict && unsubDict(); } catch (_) {}
      try { unsubShips && unsubShips(); } catch (_) {}
    };
  }, []);

  const stats = useMemo(() => {
    const dictEntries = Object.values(bayDict || {});
    const totalRegistered = dictEntries.length;

    const dictImos = new Set();
    const dictCodes = new Set();
    const dictCallsigns = new Set();
    dictEntries.forEach(e => {
      if (e.imo) dictImos.add(String(e.imo));
      if (e.code) dictCodes.add(String(e.code).toUpperCase());
      if (e.callsign) dictCallsigns.add(String(e.callsign).toUpperCase());
    });

    const shipEntries = Object.entries(ships || {});
    const totalShipped = shipEntries.length;

    const missing = [];
    const registered = [];
    shipEntries.forEach(([imo, sh]) => {
      const code4 = (sh.name || '').replace(/\s+/g, '').slice(0, 4).toUpperCase();
      const inDict = dictImos.has(imo)
        || (sh.callsign && dictCallsigns.has(String(sh.callsign).toUpperCase()))
        || (sh.code && dictCodes.has(String(sh.code).toUpperCase()))
        || (code4 && dictCodes.has(code4));
      const voyCount = Object.keys(sh.voyages || {}).length;
      const item = {
        imo,
        name: sh.name || '?',
        callsign: sh.callsign || '',
        code: sh.code || code4 || '',
        voyCount,
        lastSeen: sh.lastSeenAt || 0,
      };
      if (inDict) registered.push(item);
      else missing.push(item);
    });
    // 입항 빈도순
    missing.sort((a, b) => b.voyCount - a.voyCount);
    registered.sort((a, b) => b.voyCount - a.voyCount);

    let verified = 0, needsReview = 0, others = 0, withPdf = 0;
    dictEntries.forEach(e => {
      if (e.bayDef?.verified) verified++;
      else if (e.bayDef?.grade === 'needs-review') needsReview++;
      else others++;
      if (e.pdfUrl) withPdf++;
    });

    return {
      totalRegistered, totalShipped, missing, registered,
      verified, needsReview, others, withPdf,
      regRate: totalShipped > 0 ? Math.round((registered.length / totalShipped) * 100) : 0,
    };
  }, [bayDict, ships]);

  const filteredList = filter === 'missing' ? stats.missing
                     : filter === 'registered' ? stats.registered
                     : [...stats.missing, ...stats.registered];

  const handleSingleSelect = (e) => {
    const f = e.target.files?.[0];
    if (f && onSingleUpload) onSingleUpload(f);
    e.target.value = '';
  };

  // V8.98-15: 공유 사전 → 이 기기 로컬 사본 동기화 (크롬≠엣지 어긋남 해소)
  const handlePullShared = () => {
    const n = Object.keys(bayDict || {}).length;
    if (n === 0) { alert('공유 사전이 아직 로드되지 않았습니다. 잠시 후 다시 시도하세요.'); return; }
    if (!confirm(`공유 저장소의 베이사전 ${n}척을 이 기기(브라우저) 로컬 사본으로 가져옵니다.\n같은 선박은 공유본으로 덮어쓰고, 이 기기에만 있는 선박은 유지됩니다.\n진행할까요?`)) return;
    const r = mergeUserBayDictFrom(bayDict);
    if (r.ok) {
      // V9.05-02: 카고플랜은 로컬 사본을 우선 읽으므로 새로고침해야 반영됨 — 안내 + 즉시 새로고침 제안
      if (confirm(`✅ 공유 사전 동기화 완료\n덮어씀 ${r.updated}척 · 새로 추가 ${r.added}척 · 이 기기 전용 유지 ${r.kept}척\n\n카고플랜에 반영하려면 새로고침이 필요합니다. 지금 새로고침할까요?`)) {
        window.location.reload();
      }
    } else alert('저장 실패 — 브라우저 저장공간을 확인하세요.');
  };

  // V TallyUni 0.9: 앱에 담아 온 기본 선박 사전(씨앗)을 저장소에 심는다.
  //   이미 저장소에 있는 코드는 건드리지 않는다 — 이 회사가 직접 재서 고친 매트릭스를
  //   씨앗이 덮으면 안 되기 때문이다(건너뛴 수를 결과에 그대로 보고한다).
  // TallyUni 0.9-01: 버튼은 파일 선택창만 연다. 실제 심기는 파일을 고른 뒤 아래에서 한다.
  const openSeedPicker = () => {
    if (!canEdit || seedBusy) return;
    setSeedMsg('');
    if (seedRef.current) seedRef.current.click();
  };

  const handleSeedImport = async (e) => {
    const file = e && e.target && e.target.files ? e.target.files[0] : null;
    if (e && e.target) e.target.value = '';        // 같은 파일을 다시 골라도 change 가 뜨게
    if (!canEdit || seedBusy || !file) return;
    setSeedBusy(true);
    setSeedMsg('기본 사전 파일을 읽는 중…');
    try {
      const seed = await readBayDictSeedFile(file);
      const existing = new Set(Object.keys(bayDict || {}));
      const toAdd = {};
      let skipped = 0;
      for (const [code, entry] of Object.entries(seed.ships)) {
        if (existing.has(code)) { skipped++; continue; }
        toAdd[code] = entry;
      }
      const addCount = Object.keys(toAdd).length;
      if (addCount === 0) {
        setSeedMsg(`추가할 선박이 없습니다 — 기본 사전 ${seed.codes.length}척이 모두 이미 저장소에 있습니다(건너뜀 ${skipped}척).`);
        return;
      }
      if (!confirm(`기본 선박 사전 ${seed.codes.length}척 중 ${addCount}척을 저장소에 추가합니다.\n이미 있는 ${skipped}척은 건드리지 않습니다.\n진행할까요?`)) {
        setSeedMsg('');
        return;
      }
      let saved = 0, failed = 0, done = 0;
      for (const part of chunkShips(toAdd, 25)) {
        const r = await fbBatchSaveShipBayDict(part);
        saved += r.saved; failed += r.failed;
        done += Object.keys(part).length;
        setSeedMsg(`심는 중… ${done}/${addCount}척`);
      }
      setSeedMsg(`✅ 추가 ${saved}척 · 건너뜀 ${skipped}척${failed ? ` · 실패 ${failed}척(권한·네트워크 확인)` : ''}`);
    } catch (e) {
      // 조용히 실패 금지 — 사유를 그대로 보여 준다.
      console.error('[BayDictLibraryWidget] 기본 사전 가져오기 실패', e);
      setSeedMsg(`⛔ 실패: ${(e && e.message) ? e.message : e}`);
    } finally {
      setSeedBusy(false);
    }
  };

  return (
    <div className="bg-cyan-950/30 border border-cyan-700/50 rounded-lg overflow-hidden">
      {/* 헤더 — 전체 탭으로 펼침 */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2 p-2.5 text-left hover:bg-cyan-900/20"
      >
        <Database className="w-4 h-4 text-cyan-400 shrink-0"/>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-black text-cyan-200 flex items-center gap-2 flex-wrap">
            📚 베이사전 라이브러리
            <span className="bg-emerald-700/60 text-emerald-100 px-1.5 py-0.5 rounded text-[9px]">
              {stats.totalRegistered}척 등록
            </span>
            {stats.missing.length > 0 && (
              <span className="bg-amber-700/60 text-amber-100 px-1.5 py-0.5 rounded text-[9px]">
                ⚠️ {stats.missing.length}척 누락
              </span>
            )}
            {stats.totalShipped > 0 && (
              <span className="text-cyan-400/80 text-[10px]">
                등록률 {stats.regRate}%
              </span>
            )}
          </div>
          <div className="text-[10px] text-cyan-400/70 mt-0.5">
            평택 입항 이력 {stats.totalShipped}척 · 검증 {stats.verified} · PDF 보관 {stats.withPdf}
          </div>
        </div>
        <span className="text-cyan-300 px-1 shrink-0">
          {expanded ? <ChevronUp className="w-5 h-5"/> : <ChevronDown className="w-5 h-5"/>}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-cyan-700/40 p-2.5 space-y-2">
          {/* PDF/ASC 등록 버튼 — 위젯 안에서 직접 */}
          <div className="space-y-1.5">
            {/* TallyUni 0.9: 앱이 담아 온 기본 선박 사전을 저장소에 심는다 (관리자 전용) */}
            {canEdit && (
              <>
                <input ref={seedRef} type="file" accept=".json,application/json" className="hidden" onChange={handleSeedImport} />
                <button
                  onClick={openSeedPicker}
                  disabled={seedBusy}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-2 bg-lime-700 hover:bg-lime-600 disabled:opacity-50 text-white rounded text-xs font-bold"
                >
                  {seedBusy ? '심는 중…' : '🌱 기본 사전 가져오기 (사전 파일 선택 → 저장소)'}
                </button>
                {seedMsg && (
                  <div className="text-[10px] text-lime-200 bg-lime-950/40 border border-lime-800/50 rounded px-2 py-1 whitespace-pre-line">
                    {seedMsg}
                  </div>
                )}
              </>
            )}
            {/* V8.98-15: 공유 사전 → 이 기기 동기화 */}
            <button
              onClick={handlePullShared}
              className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-2 bg-cyan-700 hover:bg-cyan-600 text-white rounded text-xs font-bold"
            >
              📥 공유 사전 가져오기 (이 기기 동기화)
            </button>
            {/* M6.47: ASC 일괄 — Gemini 0, 즉시 */}
            <button
              onClick={() => onAscUpload && onAscUpload()}
              className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-xs font-bold"
            >
              ⚡ ASC 일괄 등록 (Gemini 0, 즉시)
            </button>
            {/* M6.70: PDF 옵션 — 앱 내장 자체 파서 (Gemini 의존 0) */}
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => onBulkUpload && onBulkUpload()}
                className="flex-1 min-w-[120px] inline-flex items-center justify-center gap-1.5 px-2.5 py-2 bg-purple-700 hover:bg-purple-600 text-white rounded text-xs font-bold"
              >
                <FolderOpen className="w-3.5 h-3.5"/>
                📚 PDF 일괄 (M6.70 자체)
              </button>
              <label className="flex-1 min-w-[120px] cursor-pointer inline-flex items-center justify-center gap-1.5 px-2.5 py-2 bg-purple-900/50 hover:bg-purple-800/50 border border-purple-700/50 rounded text-xs font-bold text-purple-200">
                <Upload className="w-3.5 h-3.5"/>
                📄 PDF 1개 (자체)
                <input
                  ref={singleRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={handleSingleSelect}
                />
              </label>
            </div>
          </div>

          {/* 필터 탭 */}
          <div className="flex gap-1 text-[10px]">
            <button
              onClick={() => setFilter('missing')}
              className={`px-2 py-1 rounded ${filter === 'missing' ? 'bg-amber-700 text-amber-50' : 'bg-slate-800 text-slate-400'}`}
            >
              ⚠️ 누락 ({stats.missing.length})
            </button>
            <button
              onClick={() => setFilter('registered')}
              className={`px-2 py-1 rounded ${filter === 'registered' ? 'bg-emerald-700 text-emerald-50' : 'bg-slate-800 text-slate-400'}`}
            >
              ✅ 등록 ({stats.registered.length})
            </button>
            <button
              onClick={() => setFilter('all')}
              className={`px-2 py-1 rounded ${filter === 'all' ? 'bg-cyan-700 text-cyan-50' : 'bg-slate-800 text-slate-400'}`}
            >
              전체 ({stats.totalShipped})
            </button>
          </div>

          {/* 선박 리스트 */}
          <div className="max-h-60 overflow-y-auto space-y-1">
            {filteredList.length === 0 ? (
              <div className="text-center py-4 text-[10px] text-slate-500">
                {filter === 'missing' ? '🎉 모든 입항 선박 등록 완료' : '선박 없음'}
              </div>
            ) : (
              filteredList.map(s => {
                const isMissing = !stats.registered.find(r => r.imo === s.imo);
                return (
                  <div
                    key={s.imo}
                    className={`flex items-center gap-2 p-1.5 rounded text-[10px] ${
                      isMissing ? 'bg-amber-950/30 border border-amber-800/40' : 'bg-emerald-950/30 border border-emerald-800/40'
                    }`}
                  >
                    {isMissing ? (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0"/>
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0"/>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-slate-100 truncate">{s.name}</div>
                      <div className="text-slate-400 truncate">
                        {s.code && <span className="text-purple-300">{s.code}</span>}
                        {s.callsign && <span className="ml-1">· {s.callsign}</span>}
                        <span className="ml-1">· 입항 {s.voyCount}회</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="text-[10px] text-cyan-400/70 pt-1 border-t border-cyan-700/30">
            💡 누락 선박은 일괄 등록으로 빠르게 추가하거나, 입항 시 자동으로 추가됩니다
          </div>
        </div>
      )}
    </div>
  );
}
