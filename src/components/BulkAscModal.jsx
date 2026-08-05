// M6.47: ASC 파일 일괄 등록 — Gemini 호출 0, 즉시 처리
//   다수 ASC 파일을 자체 파싱으로 베이사전 대량 구축
//   ASC는 STOWAGE의 텍스트 버전이라 추측 없이 100% 정확
import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, AlertTriangle, CheckCircle2, Loader2, Sparkles, RotateCw, Zap } from 'lucide-react';
import { parseAscFile, ascToBayDictEntry } from '../utils.js';
import { addToUserBayDict } from '../data/userBayDict.js';
import { fbSubscribeShipBayDict } from '../firebase.js';

const PROTECTED_CODES = ['NBTD', 'MCSC', 'ATRP', 'S639'];

export default function BulkAscModal({ open, onClose, onCompleted, inspector }) {
  const [files, setFiles] = useState([]);
  const [analyzed, setAnalyzed] = useState([]);
  const [phase, setPhase] = useState('select');  // select | analyzing | review | saving | done
  const [progress, setProgress] = useState({ done: 0, total: 0, current: '' });
  const [savedResults, setSavedResults] = useState(null);
  const [registerMode, setRegisterMode] = useState('new_only');
  const [bayDict, setBayDict] = useState({});
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const unsub = fbSubscribeShipBayDict(setBayDict);
    return () => { try { unsub && unsub(); } catch (_) {} };
  }, [open]);

  if (!open) return null;

  // 이미 등록된 선박 식별
  const checkRegistered = (entry) => {
    if (!entry) return null;
    const vname = String(entry.name || '').toUpperCase().replace(/\s+/g, '');
    const code4 = vname.slice(0, 4);
    const callsign = String(entry.callsign || '').toUpperCase();
    const imo = String(entry.imo || '');
    for (const [key, existing] of Object.entries(bayDict || {})) {
      if (imo && existing.imo && String(existing.imo) === imo) {
        return { code: existing.code || key, name: existing.name, matchBy: 'IMO' };
      }
      if (callsign && existing.callsign && String(existing.callsign).toUpperCase() === callsign) {
        return { code: existing.code || key, name: existing.name, matchBy: '콜사인' };
      }
      const eCode = String(existing.code || key).toUpperCase();
      if (code4 && code4.length >= 3 && (eCode === code4 || eCode === code4.slice(0, 3))) {
        return { code: existing.code || key, name: existing.name, matchBy: '코드' };
      }
      const eName = String(existing.name || '').toUpperCase().replace(/\s+/g, '');
      if (vname && eName && vname.length >= 5 && (eName.includes(vname.slice(0, 6)) || vname.includes(eName.slice(0, 6)))) {
        return { code: existing.code || key, name: existing.name, matchBy: '이름' };
      }
    }
    return null;
  };

  const onSelectFiles = (e) => {
    const selected = Array.from(e.target.files || []);
    const ascs = selected.filter(f =>
      /\.asc$/i.test(f.name) || /\.txt$/i.test(f.name)
    );
    setFiles(ascs);
  };

  const startAnalysis = async () => {
    if (files.length === 0) return;
    setPhase('analyzing');
    setProgress({ done: 0, total: files.length, current: '' });

    const results = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setProgress({ done: i, total: files.length, current: file.name });
      try {
        const text = await file.text();
        if (!text.includes('$604')) {
          results.push({
            file, status: 'failed',
            error: '유효한 ASC 형식 아님 ($604 헤더 없음)',
            entry: null, alreadyRegistered: null,
          });
          continue;
        }
        const ascResult = parseAscFile(text);
        const entry = ascToBayDictEntry(ascResult, file.name);
        if (!entry || !entry.bayDef?.baysSummary?.length) {
          results.push({
            file, status: 'failed',
            error: '베이 구조 추출 실패 (컨테이너 좌표 부족)',
            entry: null, alreadyRegistered: null,
          });
          continue;
        }
        const matched = checkRegistered(entry);
        results.push({
          file,
          status: 'pending',
          error: null,
          entry,
          bayCount: entry.bayDef.baysSummary.length,
          containerCount: ascResult.containers.length,
          alreadyRegistered: matched,
          // 편집 가능 필드
          code: matched?.code || entry.code,
          callsign: entry.callsign,
          imo: entry.imo,
        });
      } catch (e) {
        results.push({
          file, status: 'failed',
          error: e.message || String(e),
          entry: null, alreadyRegistered: null,
        });
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
    const { fbSaveShipBayDict } = await import('../firebase.js');
    const results = { saved: 0, skipped: 0, failed: 0, protected: 0, details: [] };

    const targets = analyzed.filter(item => {
      if (item.status === 'failed' || !item.entry) return false;
      if (registerMode === 'new_only' && item.alreadyRegistered) return false;
      return true;
    });
    results.skipped = analyzed.filter(item =>
      item.status !== 'failed' && item.entry && item.alreadyRegistered && registerMode === 'new_only'
    ).length;

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
        const entry = {
          ...item.entry,
          code,
          callsign: (item.callsign || '').toUpperCase().trim(),
          imo: (item.imo || '').trim(),
        };
        await fbSaveShipBayDict(code, {
          ...entry,
          source: 'asc-file-bulk',
          _inspector: inspector || '',
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

  const counts = {
    total: analyzed.length,
    failed: analyzed.filter(a => a.status === 'failed').length,
    new: analyzed.filter(a => a.status !== 'failed' && !a.alreadyRegistered).length,
    already: analyzed.filter(a => a.status !== 'failed' && a.alreadyRegistered).length,
    // M6.48: 코드 누락 (분석 성공했으나 코드 비어있음)
    codeMissing: analyzed.filter(a => a.status !== 'failed' && !a.code).length,
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-slate-900 w-full sm:max-w-3xl sm:rounded-xl border-t-2 sm:border-2 border-emerald-700/60 max-h-[95vh] flex flex-col">
        <div className="flex items-center justify-between p-3 border-b border-emerald-700/40">
          <h2 className="text-base font-black text-emerald-200 flex items-center gap-1.5">
            <Zap className="w-4 h-4"/>
            ASC 파일 일괄 등록
            <span className="text-[10px] text-emerald-400/70 ml-1">Gemini 0 · 즉시</span>
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 p-2 -mr-2">
            <X className="w-5 h-5"/>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {phase === 'select' && (
            <>
              <div className="text-xs text-slate-300 leading-relaxed">
                ASC 파일(STOWAGE 텍스트 형식)을 다수 선택 → 즉시 자체 파싱 → 베이사전 자동 구축.<br/>
                <span className="text-emerald-300">⚡ Gemini API 호출 없음 — 무제한, 즉시 처리, 100% 정확</span>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".asc,.txt"
                multiple
                onChange={onSelectFiles}
                className="hidden"
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full py-4 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg font-bold flex items-center justify-center gap-2"
              >
                <Upload className="w-5 h-5"/>
                ASC 파일 다중 선택
              </button>
              {files.length > 0 && (
                <div className="bg-slate-800/60 rounded p-2.5 text-xs space-y-1">
                  <div className="font-bold text-emerald-300">📄 선택된 파일: {files.length}개</div>
                  <ul className="text-slate-400 space-y-0.5 max-h-40 overflow-y-auto">
                    {files.map((f, i) => (
                      <li key={i} className="truncate">• {f.name} ({(f.size / 1024).toFixed(1)}KB)</li>
                    ))}
                  </ul>
                  <div className="text-emerald-300 text-[10px] mt-1.5">
                    ⚡ 예상 시간: <strong>약 {Math.ceil(files.length * 0.5)}초</strong> (PDF는 분당 12회 한도, ASC는 무제한)
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

          {phase === 'analyzing' && (
            <div className="text-center py-8">
              <Loader2 className="w-12 h-12 text-emerald-400 animate-spin mx-auto mb-3"/>
              <div className="text-emerald-200 font-bold text-base mb-1">
                파싱 중 {progress.done} / {progress.total}
              </div>
              <div className="text-slate-400 text-xs truncate mb-3">{progress.current}</div>
              <div className="w-full bg-slate-800 rounded-full h-2">
                <div
                  className="bg-emerald-500 h-2 rounded-full transition-all"
                  style={{ width: `${(progress.done / progress.total) * 100}%` }}
                ></div>
              </div>
              <div className="text-[10px] text-slate-500 mt-2">자체 파싱 — 매우 빠름</div>
            </div>
          )}

          {phase === 'review' && (
            <>
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
                          registerMode === 'new_only' ? 'bg-emerald-700 text-emerald-50' : 'bg-slate-700 text-slate-300'
                        }`}
                      >
                        <Sparkles className="w-3 h-3 inline mr-1"/>
                        신규만 등록 (스킵)
                      </button>
                      <button
                        onClick={() => setRegisterMode('all')}
                        className={`flex-1 px-2 py-1.5 rounded text-[10px] font-bold ${
                          registerMode === 'all' ? 'bg-amber-700 text-amber-50' : 'bg-slate-700 text-slate-300'
                        }`}
                      >
                        <RotateCw className="w-3 h-3 inline mr-1"/>
                        전체 덮어쓰기
                      </button>
                    </div>
                  </div>
                )}
                {counts.codeMissing > 0 && (
                  <div className="text-[10px] text-amber-300 bg-amber-950/40 rounded p-1.5">
                    ⚠️ 코드 누락 {counts.codeMissing}개 — 빨간 테두리 카드의 "코드" 입력 필요
                    <br/>추천 코드 버튼 클릭 또는 직접 입력
                  </div>
                )}
              </div>
              <div className="space-y-2">
                {analyzed.map((item, i) => (
                  <div
                    key={i}
                    className={`rounded p-2.5 border ${
                      item.status === 'failed' ? 'bg-red-950/40 border-red-700/50'
                      : item.alreadyRegistered ? 'bg-amber-950/30 border-amber-700/40'
                      : 'bg-emerald-950/20 border-emerald-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      {item.status === 'failed' ? <AlertTriangle className="w-4 h-4 text-red-400 shrink-0"/>
                      : item.alreadyRegistered ? <RotateCw className="w-4 h-4 text-amber-400 shrink-0"/>
                      : <Sparkles className="w-4 h-4 text-emerald-400 shrink-0"/>}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-slate-200 truncate">{item.file.name}</div>
                        {item.error && <div className="text-[10px] text-red-300">{item.error}</div>}
                        {item.alreadyRegistered && (
                          <div className="text-[10px] text-amber-300 mt-0.5">
                            🔁 이미 등록: <span className="font-bold">{item.alreadyRegistered.code}</span>
                            <span className="text-amber-400/70"> ({item.alreadyRegistered.matchBy})</span>
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
                          선박명: <span className="text-cyan-300">{item.entry?.name || '?'}</span>
                          {' · '}베이: <span className="text-cyan-300">{item.bayCount}개</span>
                          {' · '}컨테이너: <span className="text-cyan-300">{item.containerCount}대</span>
                          {item.entry?.voy && <> {' · '}VOY: <span className="text-cyan-300">{item.entry.voy}</span></>}
                        </div>
                        {/* M6.48: 코드 후보 표시 + 누락 강조 */}
                        {(item.entry?.serviceCode || item.entry?.vesselCode) && (
                          <div className="text-[10px] text-slate-500 mb-1.5 flex flex-wrap gap-1">
                            추천 코드:
                            {item.entry?.serviceCode && (
                              <button
                                onClick={() => updateCard(i, 'code', item.entry.serviceCode)}
                                className="px-1.5 py-0.5 bg-cyan-900/40 hover:bg-cyan-800/50 border border-cyan-700/40 rounded text-cyan-200 font-mono"
                              >
                                {item.entry.serviceCode} <span className="text-cyan-400/60 text-[8px]">(헤더)</span>
                              </button>
                            )}
                            {item.entry?.vesselCode && item.entry.vesselCode !== item.entry?.serviceCode && (
                              <button
                                onClick={() => updateCard(i, 'code', item.entry.vesselCode)}
                                className="px-1.5 py-0.5 bg-purple-900/40 hover:bg-purple-800/50 border border-purple-700/40 rounded text-purple-200 font-mono"
                              >
                                {item.entry.vesselCode} <span className="text-purple-400/60 text-[8px]">(선박명)</span>
                              </button>
                            )}
                          </div>
                        )}
                        {!item.code && (
                          <div className="text-[10px] text-red-300 bg-red-950/40 rounded p-1.5 mb-1.5">
                            ⚠️ 코드 누락 — 등록하려면 코드 입력 필수
                          </div>
                        )}
                        <div className="grid grid-cols-3 gap-1.5">
                          <div>
                            <label className="text-[9px] text-emerald-300 block">
                              코드 {!item.code && <span className="text-red-400">*</span>}
                            </label>
                            <input
                              type="text"
                              value={item.code}
                              onChange={e => updateCard(i, 'code', e.target.value.toUpperCase())}
                              placeholder="필수"
                              className={`w-full px-1.5 py-1 bg-slate-900 border rounded text-xs font-mono ${
                                !item.code ? 'border-red-600/60' : 'border-slate-700'
                              }`}
                              maxLength={6}
                            />
                          </div>
                          <div>
                            <label className="text-[9px] text-emerald-300 block">콜사인</label>
                            <input
                              type="text"
                              value={item.callsign}
                              onChange={e => updateCard(i, 'callsign', e.target.value.toUpperCase())}
                              className="w-full px-1.5 py-1 bg-slate-900 border border-slate-700 rounded text-xs font-mono"
                              maxLength={10}
                            />
                          </div>
                          <div>
                            <label className="text-[9px] text-emerald-300 block">IMO</label>
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

          {phase === 'done' && savedResults && (
            <>
              <div className="bg-emerald-900/40 border-2 border-emerald-700/60 rounded p-3">
                <div className="text-emerald-100 font-black text-base mb-2">✅ ASC 일괄 등록 완료</div>
                <div className="space-y-1 text-xs">
                  <div className="text-emerald-300">✅ 등록 성공: {savedResults.saved}개</div>
                  {savedResults.skipped > 0 && <div className="text-amber-300">⏭ 이미 등록 (스킵): {savedResults.skipped}개</div>}
                  {savedResults.protected > 0 && <div className="text-orange-300">⛔ 보호 선박 (수동만): {savedResults.protected}개</div>}
                  {savedResults.failed > 0 && <div className="text-red-300">❌ 실패: {savedResults.failed}개</div>}
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
                className="w-full py-3 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg font-bold"
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
