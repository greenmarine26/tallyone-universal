// M6.42: STOWAGE PDF 일괄 분석/등록
//   여러 PDF를 한 번에 업로드 → Gemini 순차 분석 → 검토 → 일괄 등록
//   진정한 베이사전 라이브러리 구축 (1:1 매칭 부담 제거)
// M6.44: 이미 등록된 선박 자동 식별 + 스킵
//   - 분석 후 ship_bay_dict_v3와 매칭 → 카드에 "이미 등록" 배지
//   - 등록 단계에서 "신규만" / "전체 (덮어쓰기)" 선택 가능
//   - Gemini 비용은 분석 시 발생 (사전 매칭 어려움 — 파일명 신뢰도 낮음)
//     단, 등록 시간/덮어쓰기 결정은 자동
import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, AlertTriangle, CheckCircle2, Loader2, Sparkles, RotateCw } from 'lucide-react';
import { ocrStowagePdf, stowageToBayDictEntry, GEMINI_API_KEY } from '../gemini.js';
import { autoBuildEntryFromPdf } from '../stowageAutoParser.js';
import { addToUserBayDict } from '../data/userBayDict.js';
import { _storage, SK } from '../utils.js';
import { fbSubscribeShipBayDict } from '../firebase.js';

const PROTECTED_CODES = ['NBTD', 'MCSC', 'ATRP', 'S639'];

export default function BulkStowageModal({ open, onClose, onCompleted, inspector }) {
  const [files, setFiles] = useState([]);
  const [analyzed, setAnalyzed] = useState([]);
  const [phase, setPhase] = useState('select');
  const [progress, setProgress] = useState({ done: 0, total: 0, current: '' });
  const [savedResults, setSavedResults] = useState(null);
  const [registerMode, setRegisterMode] = useState('all');  // M6.70e: 기본 'all' (덮어쓰기) — 자체 파서가 ASC보다 정확
  const [bayDict, setBayDict] = useState({});  // M6.44: 매칭용
  const fileRef = useRef(null);

  // M6.44: 베이사전 구독 (매칭용)
  useEffect(() => {
    if (!open) return;
    const unsub = fbSubscribeShipBayDict(setBayDict);
    return () => { try { unsub && unsub(); } catch (_) {} };
  }, [open]);

  if (!open) return null;

  // M6.44: 이미 등록된 선박 식별 — vesselName/callsign/IMO/code 4가지 매칭
  const checkRegistered = (data) => {
    if (!data) return null;
    const vname = String(data.vesselName || '').toUpperCase().replace(/\s+/g, '');
    const code4 = vname.slice(0, 4);
    const callsign = String(data.callsign || '').toUpperCase();
    const imo = String(data.imo || '');
    for (const [key, entry] of Object.entries(bayDict || {})) {
      if (imo && entry.imo && String(entry.imo) === imo) {
        return { code: entry.code || key, name: entry.name, matchBy: 'IMO' };
      }
      if (callsign && entry.callsign && String(entry.callsign).toUpperCase() === callsign) {
        return { code: entry.code || key, name: entry.name, matchBy: '콜사인' };
      }
      const eCode = String(entry.code || key).toUpperCase();
      if (code4 && code4.length >= 3 && (eCode === code4 || eCode === code4.slice(0, 3))) {
        return { code: entry.code || key, name: entry.name, matchBy: '코드' };
      }
      // 이름 fuzzy
      const eName = String(entry.name || '').toUpperCase().replace(/\s+/g, '');
      if (vname && eName && vname.length >= 5 && (eName.includes(vname.slice(0, 6)) || vname.includes(eName.slice(0, 6)))) {
        return { code: entry.code || key, name: entry.name, matchBy: '이름' };
      }
    }
    return null;
  };

  const onSelectFiles = (e) => {
    const selected = Array.from(e.target.files || []);
    const pdfs = selected.filter(f => f.name.toLowerCase().endsWith('.pdf'));
    setFiles(pdfs);
  };

  const startAnalysis = async () => {
    if (files.length === 0) return;
    setPhase('analyzing');
    setProgress({ done: 0, total: files.length, current: '' });

    const apiKey = _storage.get(SK.geminiKey) || GEMINI_API_KEY;
    const results = [];

    // M6.70: 자체 파서 우선 — Gemini API 의존 0, rate limit 없음
    const DELAY_BETWEEN_MS = 100;  // 자체 파서는 빠르므로 작은 delay
    const RETRY_DELAY_MS = 60000;
    const MAX_RETRIES = 2;
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    const analyzeWithRetry = async (file, retryCount = 0) => {
      // M6.70: 1차 — 앱 내장 자체 파서 (Gemini API 불필요)
      try {
        const code = (file.name || '').slice(0, 4).toUpperCase();
        const entry = await autoBuildEntryFromPdf(file, code);
        const bayCount = entry?.bayDef?.baysSummary?.length || 0;
        console.log(`[M6.70 parser] ${file.name}: ${bayCount} 베이 추출`);
        // Gemini 결과 형식과 호환 (bays 키로 bayCount 계산)
        return {
          vesselName: entry.name,
          callsign: '',
          imo: '',
          bays: entry.bayDef.baysSummary || [],  // bayCount 계산용
          bayDef: entry.bayDef,
          _entry: entry,
          _source: 'auto-parser',
        };
      } catch (e) {
        console.warn(`[M6.70 parser] ${file.name} 실패:`, e?.message);
        // 2차 — Gemini fallback (자체 파서 실패 시)
        if (!apiKey) throw e;
        try {
          return await ocrStowagePdf(file, apiKey);
        } catch (e2) {
          const msg = (e2?.message || String(e2)).toLowerCase();
          const isRateLimit = msg.includes('429') || msg.includes('rate') || msg.includes('quota') || msg.includes('limit');
          if (isRateLimit && retryCount < MAX_RETRIES) {
            setProgress(p => ({ ...p, current: `${file.name} (Rate limit 대기 60초...)` }));
            await sleep(RETRY_DELAY_MS);
            return analyzeWithRetry(file, retryCount + 1);
          }
          throw e2;
        }
      }
    };

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setProgress({ done: i, total: files.length, current: file.name });
      try {
        const data = await analyzeWithRetry(file);
        const vname = (data?.vesselName || '').toUpperCase();
        const code = vname.replace(/\s+/g, '').slice(0, 4);
        const matched = checkRegistered(data);  // M6.44
        results.push({
          file,
          data,
          code: matched?.code || code,  // 이미 등록된 코드 우선
          callsign: data?.callsign || '',
          imo: data?.imo || '',
          bayCount: data?.bays?.length || 0,
          status: 'pending',
          error: null,
          alreadyRegistered: matched,  // M6.44: { code, name, matchBy } 또는 null
        });
      } catch (e) {
        results.push({
          file,
          data: null,
          code: '',
          callsign: '',
          imo: '',
          bayCount: 0,
          status: 'failed',
          error: e.message || String(e),
          alreadyRegistered: null,
        });
      }

      if (i < files.length - 1) {
        setProgress({ done: i + 1, total: files.length, current: `다음 파일 대기 중 (${DELAY_BETWEEN_MS / 1000}초)...` });
        await sleep(DELAY_BETWEEN_MS);
      }
    }

    setProgress({ done: files.length, total: files.length, current: '' });
    setAnalyzed(results);
    setPhase('review');
  };

  const updateCard = (idx, field, value) => {
    setAnalyzed(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  };

  const saveAll = async () => {
    setPhase('saving');
    const { fbSaveShipBayDict, fbUploadStowagePdf } = await import('../firebase.js');
    const results = { saved: 0, skipped: 0, failed: 0, protected: 0, details: [] };

    // M6.44: 등록 대상 결정
    const targets = analyzed.filter(item => {
      if (item.status === 'failed' || !item.data) return false;
      if (registerMode === 'new_only' && item.alreadyRegistered) {
        return false;  // 이미 등록된 건 스킵
      }
      return true;
    });
    const skippedCount = analyzed.filter(item =>
      item.status !== 'failed' && item.data && item.alreadyRegistered && registerMode === 'new_only'
    ).length;
    results.skipped = skippedCount;

    setProgress({ done: 0, total: targets.length, current: '' });

    for (let i = 0; i < targets.length; i++) {
      const item = targets[i];
      setProgress({ done: i, total: targets.length, current: item.file.name });

      const code = (item.code || '').toUpperCase().trim();
      if (!code || code.length < 2) {
        results.failed++;
        results.details.push({ file: item.file.name, error: '코드 누락' });
        continue;
      }
      if (PROTECTED_CODES.includes(code)) {
        results.protected++;
        results.details.push({ file: item.file.name, error: `${code} 보호 선박 (정밀 등록 — 수동만)` });
        continue;
      }

      try {
        // M6.70: 자체 파서 결과는 이미 entry — 변환 불필요
        let entry;
        if (item.data?._source === 'auto-parser' && item.data?._entry) {
          entry = { ...item.data._entry };
          // M6.70f: baysSummary 없으면 등록 거부 (오류)
          if (!entry.bayDef?.baysSummary?.length) {
            throw new Error('자체 파서 실패 — baysSummary 0개');
          }
          entry.code = code;
          entry.callsign = item.callsign.toUpperCase().trim();
          entry.imo = item.imo.trim();
        } else {
          entry = stowageToBayDictEntry(item.data, item.file.name, {
            code, callsign: item.callsign.toUpperCase().trim(), imo: item.imo.trim(),
          });
        }
        entry.bayDef.verified = true;
        entry.bayDef.grade = 'user-verified-stowage';

        let pdfMeta = null;
        try {
          pdfMeta = await fbUploadStowagePdf(code, item.file);
        } catch (e) {
          console.warn(`[M6.42] ${code} PDF 업로드 실패:`, e);
        }

        await fbSaveShipBayDict(code, {
          ...entry,
          source: 'stowage-pdf-ai-bulk',
          _inspector: inspector || '',
          pdfUrl: pdfMeta?.url || '',
          pdfPath: pdfMeta?.path || '',
          pdfName: pdfMeta?.name || item.file.name,
          pdfUploadedAt: pdfMeta?.uploadedAt || Date.now(),
        });
        addToUserBayDict(entry);
        results.saved++;
      } catch (e) {
        results.failed++;
        results.details.push({ file: item.file.name, error: e.message || String(e) });
      }
    }

    setProgress({ done: targets.length, total: targets.length, current: '' });
    setSavedResults(results);
    setPhase('done');
    if (onCompleted) onCompleted(results);
  };

  // M6.44: 카운트
  const counts = {
    total: analyzed.length,
    failed: analyzed.filter(a => a.status === 'failed').length,
    new: analyzed.filter(a => a.status !== 'failed' && !a.alreadyRegistered).length,
    already: analyzed.filter(a => a.status !== 'failed' && a.alreadyRegistered).length,
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-slate-900 w-full sm:max-w-3xl sm:rounded-xl border-t-2 sm:border-2 border-purple-700/60 max-h-[95vh] flex flex-col">
        <div className="flex items-center justify-between p-3 border-b border-purple-700/40">
          <h2 className="text-base font-black text-purple-200">📚 STOWAGE PDF 일괄 등록</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 p-2 -mr-2">
            <X className="w-5 h-5"/>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Phase: select */}
          {phase === 'select' && (
            <>
              <div className="text-xs text-slate-300 leading-relaxed">
                여러 STOWAGE PDF를 한 번에 등록합니다.<br/>
                <span className="text-emerald-300">M6.70 앱 내장 자동 파서가 분석</span> → 이미 등록된 선박 자동 식별 → 검토 → 일괄 저장.<br/>
                <span className="text-xs text-slate-400">(Gemini API 의존 없음. 자체 파서 실패 시에만 Gemini 사용)</span>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,application/pdf"
                multiple
                onChange={onSelectFiles}
                className="hidden"
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full py-4 bg-purple-700 hover:bg-purple-600 text-white rounded-lg font-bold flex items-center justify-center gap-2"
              >
                <Upload className="w-5 h-5"/>
                PDF 파일 다중 선택
              </button>
              {files.length > 0 && (
                <div className="bg-slate-800/60 rounded p-2.5 text-xs space-y-1">
                  <div className="font-bold text-purple-300">📄 선택된 파일: {files.length}개</div>
                  <ul className="text-slate-400 space-y-0.5 max-h-40 overflow-y-auto">
                    {files.map((f, i) => (
                      <li key={i} className="truncate">• {f.name} ({(f.size / 1024 / 1024).toFixed(1)}MB)</li>
                    ))}
                  </ul>
                  <div className="text-amber-300 text-[10px] mt-1.5">
                    ⏱ 예상 시간: 약 {Math.ceil(files.length * 13 / 60)}분
                    <span className="text-slate-500"> (PDF당 분석 ~8초 + Rate limit 대기 5초)</span>
                  </div>
                  <div className="text-emerald-300 text-[10px]">
                    💡 분석 후 이미 등록된 선박은 자동 식별됨 (스킵 또는 덮어쓰기 선택 가능)
                  </div>
                </div>
              )}
              {files.length > 0 && (
                <button
                  onClick={startAnalysis}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold"
                >
                  🚀 분석 시작 ({files.length}개)
                </button>
              )}
            </>
          )}

          {/* Phase: analyzing */}
          {phase === 'analyzing' && (
            <div className="text-center py-8">
              <Loader2 className="w-12 h-12 text-purple-400 animate-spin mx-auto mb-3"/>
              <div className="text-purple-200 font-bold text-base mb-1">
                분석 중 {progress.done} / {progress.total}
              </div>
              <div className="text-slate-400 text-xs truncate mb-3">{progress.current}</div>
              <div className="w-full bg-slate-800 rounded-full h-2">
                <div
                  className="bg-purple-500 h-2 rounded-full transition-all"
                  style={{ width: `${(progress.done / progress.total) * 100}%` }}
                ></div>
              </div>
              <div className="text-[10px] text-slate-500 mt-2">중단하지 마세요. 백그라운드 처리 중...</div>
            </div>
          )}

          {/* Phase: review */}
          {phase === 'review' && (
            <>
              {/* M6.44: 요약 + 등록 모드 선택 */}
              <div className="bg-slate-800/60 rounded p-2.5 space-y-2">
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div>
                    <div className="text-emerald-400 font-black text-lg">{counts.new}</div>
                    <div className="text-[10px] text-slate-400">✨ 신규</div>
                  </div>
                  <div>
                    <div className="text-amber-400 font-black text-lg">{counts.already}</div>
                    <div className="text-[10px] text-slate-400">🔁 이미 등록</div>
                  </div>
                  <div>
                    <div className="text-red-400 font-black text-lg">{counts.failed}</div>
                    <div className="text-[10px] text-slate-400">❌ 실패</div>
                  </div>
                </div>
                {counts.already > 0 && (
                  <div className="pt-2 border-t border-slate-700/50">
                    <div className="text-[10px] text-slate-300 mb-1.5">이미 등록된 선박 처리:</div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setRegisterMode('new_only')}
                        className={`flex-1 px-2 py-1.5 rounded text-[10px] font-bold ${
                          registerMode === 'new_only'
                            ? 'bg-emerald-700 text-emerald-50'
                            : 'bg-slate-700 text-slate-300'
                        }`}
                      >
                        <Sparkles className="w-3 h-3 inline mr-1"/>
                        신규만 등록 (스킵)
                      </button>
                      <button
                        onClick={() => setRegisterMode('all')}
                        className={`flex-1 px-2 py-1.5 rounded text-[10px] font-bold ${
                          registerMode === 'all'
                            ? 'bg-amber-700 text-amber-50'
                            : 'bg-slate-700 text-slate-300'
                        }`}
                      >
                        <RotateCw className="w-3 h-3 inline mr-1"/>
                        전체 덮어쓰기
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="text-[10px] text-slate-400 leading-relaxed">
                각 카드의 코드/콜사인/IMO 확인하세요.
              </div>
              <div className="space-y-2">
                {analyzed.map((item, i) => (
                  <div
                    key={i}
                    className={`rounded p-2.5 border ${
                      item.status === 'failed'
                        ? 'bg-red-950/40 border-red-700/50'
                        : item.alreadyRegistered
                          ? 'bg-amber-950/30 border-amber-700/40'
                          : 'bg-emerald-950/20 border-emerald-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      {item.status === 'failed' ? (
                        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0"/>
                      ) : item.alreadyRegistered ? (
                        <RotateCw className="w-4 h-4 text-amber-400 shrink-0"/>
                      ) : (
                        <Sparkles className="w-4 h-4 text-emerald-400 shrink-0"/>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-slate-200 truncate">{item.file.name}</div>
                        {item.error && (
                          <div className="text-[10px] text-red-300">{item.error}</div>
                        )}
                        {item.alreadyRegistered && (
                          <div className="text-[10px] text-amber-300 mt-0.5">
                            🔁 이미 등록: <span className="font-bold">{item.alreadyRegistered.code}</span>
                            <span className="text-amber-400/70"> ({item.alreadyRegistered.matchBy} 매칭)</span>
                            {registerMode === 'new_only' && <span className="ml-1 text-slate-400">→ 스킵</span>}
                            {registerMode === 'all' && <span className="ml-1 text-orange-300">→ 덮어쓰기</span>}
                          </div>
                        )}
                        {!item.alreadyRegistered && item.status !== 'failed' && (
                          <div className="text-[10px] text-emerald-300 mt-0.5">✨ 신규 등록 예정</div>
                        )}
                      </div>
                    </div>
                    {item.status !== 'failed' && (
                      <>
                        <div className="text-[10px] text-slate-400 mb-1.5">
                          선박명: <span className="text-cyan-300">{item.data?.vesselName || '?'}</span>
                          {' · '}베이: <span className="text-cyan-300">{item.bayCount}개</span>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          <div>
                            <label className="text-[9px] text-purple-300 block">코드</label>
                            <input
                              type="text"
                              value={item.code}
                              onChange={e => updateCard(i, 'code', e.target.value.toUpperCase())}
                              className="w-full px-1.5 py-1 bg-slate-900 border border-slate-700 rounded text-xs font-mono"
                              maxLength={6}
                            />
                          </div>
                          <div>
                            <label className="text-[9px] text-purple-300 block">콜사인</label>
                            <input
                              type="text"
                              value={item.callsign}
                              onChange={e => updateCard(i, 'callsign', e.target.value.toUpperCase())}
                              className="w-full px-1.5 py-1 bg-slate-900 border border-slate-700 rounded text-xs font-mono"
                              maxLength={10}
                            />
                          </div>
                          <div>
                            <label className="text-[9px] text-purple-300 block">IMO</label>
                            <input
                              type="text"
                              value={item.imo}
                              onChange={e => updateCard(i, 'imo', e.target.value)}
                              className="w-full px-1.5 py-1 bg-slate-900 border border-slate-700 rounded text-xs font-mono"
                              maxLength={10}
                            />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
              <button
                onClick={saveAll}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold sticky bottom-0"
              >
                💾 {registerMode === 'new_only' ? `신규만 등록 (${counts.new}개)` : `전체 등록 (${counts.new + counts.already}개)`}
              </button>
            </>
          )}

          {/* Phase: saving */}
          {phase === 'saving' && (
            <div className="text-center py-8">
              <Loader2 className="w-12 h-12 text-emerald-400 animate-spin mx-auto mb-3"/>
              <div className="text-emerald-200 font-bold text-base mb-1">
                저장 중 {progress.done} / {progress.total}
              </div>
              <div className="text-slate-400 text-xs truncate mb-3">{progress.current}</div>
              <div className="w-full bg-slate-800 rounded-full h-2">
                <div
                  className="bg-emerald-500 h-2 rounded-full transition-all"
                  style={{ width: progress.total > 0 ? `${(progress.done / progress.total) * 100}%` : '0%' }}
                ></div>
              </div>
            </div>
          )}

          {/* Phase: done */}
          {phase === 'done' && savedResults && (
            <>
              <div className="bg-emerald-900/40 border-2 border-emerald-700/60 rounded p-3">
                <div className="text-emerald-100 font-black text-base mb-2">✅ 일괄 등록 완료</div>
                <div className="space-y-1 text-xs">
                  <div className="text-emerald-300">✅ 등록 성공: {savedResults.saved}개</div>
                  {savedResults.skipped > 0 && (
                    <div className="text-amber-300">⏭ 이미 등록 (스킵): {savedResults.skipped}개</div>
                  )}
                  {savedResults.protected > 0 && (
                    <div className="text-orange-300">⛔ 보호 선박 (수동만): {savedResults.protected}개</div>
                  )}
                  {savedResults.failed > 0 && (
                    <div className="text-red-300">❌ 실패: {savedResults.failed}개</div>
                  )}
                </div>
              </div>
              {savedResults.details.length > 0 && (
                <div className="bg-slate-800/60 rounded p-2.5 text-[10px] space-y-1">
                  <div className="font-bold text-slate-300">상세:</div>
                  {savedResults.details.map((d, i) => (
                    <div key={i} className="text-slate-400">
                      • <span className="text-slate-200">{d.file}</span>: {d.error}
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={onClose}
                className="w-full py-3 bg-purple-700 hover:bg-purple-600 text-white rounded-lg font-bold"
              >
                완료
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
