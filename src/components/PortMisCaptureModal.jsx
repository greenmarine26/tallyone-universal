// M5.25: PORT-MIS 캡처 업로드 모달 (폰 전용 활용)
// M5.82: PORT-MIS 엑셀 업로드 옵션 추가 (캡처보다 100% 정확 + 비용 0)
// M5.82 hotfix: [평택 전체 교체] 옵션 추가 — 옛 데이터 자동 삭제
// M5.84: 현재 Firebase에 저장된 PORT-MIS 데이터 직접 보기 + 일괄 정리 + 개별 삭제
import React, { useState, useEffect } from 'react';
import { X, Camera, Upload, Loader2, CheckCircle2, AlertCircle, FileSpreadsheet, Trash2, Eye, Database } from 'lucide-react';
import { ocrPortMisCapture } from '../mixerUpload.js';
import { fbSavePortMisBatch, fbReplacePortMisBatch, fbSubscribePortMis, db } from '../firebase.js';
import { ref, remove } from 'firebase/database';
import { _storage, SK, parsePortMisExcel, getPierFromBerth, formatBerth } from '../utils.js';
import { GEMINI_API_KEY } from '../gemini.js';
import { tenant } from '../tenant.js';   // TallyUni 0.1: 터미널 목록 단일 소스

// TallyUni 0.1: 터미널 칩 색 — 테넌트 터미널 순서대로 돌려 쓴다(하드코딩 PCTC/PNCT 제거).
//   Tailwind JIT가 찾을 수 있도록 클래스 문자열을 리터럴로 둔다.
const TERM_CHIP = [
  'bg-blue-900/50 border border-blue-700/50 text-blue-200',
  'bg-purple-900/50 border border-purple-700/50 text-purple-200',
  'bg-emerald-900/50 border border-emerald-700/50 text-emerald-200',
  'bg-amber-900/50 border border-amber-700/50 text-amber-200',
];

export default function PortMisCaptureModal({ onClose }) {
  const [step, setStep] = useState('pick');  // pick → analyzing → review → saving → done | view
  const [imageUrl, setImageUrl] = useState(null);
  const [ships, setShips] = useState([]);
  const [error, setError] = useState(null);
  const [saveResult, setSaveResult] = useState(null);
  const [sourceType, setSourceType] = useState('');  // M5.82: 'excel' | 'capture'
  const [replaceAll, setReplaceAll] = useState(true);  // M5.82 hotfix: 평택 전체 교체 기본 ON
  const [currentData, setCurrentData] = useState({});  // M5.84: Firebase 현재 데이터
  const [searchTerm, setSearchTerm] = useState('');     // M5.84: 검색

  // M5.84: Firebase port_mis_data 실시간 구독
  useEffect(() => {
    if (step !== 'view') return;
    const unsub = fbSubscribePortMis(setCurrentData);
    return () => { try { unsub(); } catch (e) {} };
  }, [step]);

  // M5.84: 단일 키 삭제
  const handleDeleteOne = async (key) => {
    if (!confirm(`"${key}" PORT-MIS 데이터를 삭제하시겠습니까?`)) return;
    try {
      await remove(ref(db, `port_mis_data/${key}`));
    } catch (e) {
      alert(`삭제 실패: ${e.message}`);
    }
  };

  // M5.84: 모든 데이터 삭제 (위험)
  const handleDeleteAll = async () => {
    const count = Object.keys(currentData || {}).length;
    if (!confirm(`⚠ 전체 PORT-MIS 데이터 ${count}건을 모두 삭제하시겠습니까?\n\n복구 불가. 새 엑셀로 다시 업로드해야 합니다.`)) return;
    if (!confirm(`정말 ${count}건 모두 삭제? 다시 한번 확인`)) return;
    try {
      await remove(ref(db, 'port_mis_data'));
      alert(`✓ ${count}건 모두 삭제 완료`);
    } catch (e) {
      alert(`삭제 실패: ${e.message}`);
    }
  };

  // M5.82: 엑셀 직접 업로드 (Gemini 없이, 100% 정확)
  const handleExcelFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null);
    setSourceType('excel');
    setStep('analyzing');

    try {
      const buf = await f.arrayBuffer();
      const result = await parsePortMisExcel(buf);
      if (!result || result.length === 0) {
        setError('엑셀에서 선박 정보를 찾지 못했습니다. PORT-MIS 선박입출항현황 엑셀이 맞는지 확인해주세요.');
        setStep('pick');
        return;
      }
      setShips(result);
      setStep('review');
    } catch (err) {
      setError(`엑셀 파싱 오류: ${err.message || String(err)}`);
      setStep('pick');
    }
  };

  const handleFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setImageUrl(URL.createObjectURL(f));
    setError(null);
    setSourceType('capture');
    setStep('analyzing');

    // M5.70: 사용자 입력 키 > 내장 키 폴백
    const key = _storage.get(SK.geminiKey) || GEMINI_API_KEY;
    if (!key) {
      setError('Gemini API 키 없음 (관리자에게 문의)');
      setStep('pick');
      return;
    }

    try {
      const result = await ocrPortMisCapture(f, key);
      if (!result || result.length === 0) {
        setError('이미지에서 선박 정보를 추출하지 못했습니다. 더 선명한 캡처로 다시 시도해주세요.');
        setStep('pick');
        return;
      }
      setShips(result);
      setStep('review');
    } catch (err) {
      setError(err.message || String(err));
      setStep('pick');
    }
  };

  const handleSave = async () => {
    setStep('saving');
    try {
      // M5.90: 업로드한 데이터의 대표 항만 자동 감지 (평택/인천 등)
      //   → 그 항만 옛 데이터만 교체 (다른 항만 데이터 보존)
      const portCounts = {};
      for (const s of ships) {
        const p = (s.port || '').trim() || '평택';
        portCounts[p] = (portCounts[p] || 0) + 1;
      }
      const detectedPort = Object.entries(portCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '평택';
      // M5.82 hotfix: replaceAll = true면 감지된 항만 옛 데이터 삭제 후 저장
      const r = replaceAll
        ? await fbReplacePortMisBatch(ships, { port: detectedPort })
        : await fbSavePortMisBatch(ships);
      setSaveResult({ ...r, detectedPort });
      setStep('done');
    } catch (err) {
      setError(err.message || String(err));
      setStep('review');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center">
      <div className="bg-slate-900 w-full sm:max-w-2xl sm:rounded-xl rounded-t-2xl max-h-[95vh] overflow-y-auto flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700 sticky top-0 bg-slate-900 z-10">
          <h2 className="text-lg font-bold text-cyan-300">📸 PORT-MIS 캡처 업로드</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 flex-1">
          {/* 단계 1: 파일 선택 */}
          {step === 'pick' && (
            <div>
              <p className="text-slate-300 text-sm mb-3">
                PORT-MIS에서 <strong className="text-amber-300">엑셀 다운로드</strong> 또는 <strong className="text-cyan-300">화면 캡처</strong>를 올려주세요.
                자동으로 호출부호/선박명/입출항/<b className="text-emerald-300">부두(PCTC/PNCT)</b>를 추출해 모든 검수원과 공유합니다.
              </p>
              {error && (
                <div className="bg-red-950/50 border border-red-700 rounded p-3 mb-3 text-red-300 text-sm flex gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>{error}</div>
                </div>
              )}
              {/* M5.82: 엑셀 업로드 (권장 — Gemini 안 부름, 100% 정확) */}
              <label className="block bg-emerald-600 hover:bg-emerald-700 text-white text-center font-bold py-4 rounded-lg cursor-pointer flex items-center justify-center gap-2 mb-2">
                <FileSpreadsheet className="w-5 h-5" />
                📊 엑셀 업로드 (권장)
                <input type="file" accept=".xlsx,.xls" onChange={handleExcelFile} className="hidden" />
              </label>
              <p className="text-[10px] text-emerald-400/80 mb-3 text-center">
                ⭐ PORT-MIS 다운로드 엑셀 → 100% 정확 + 부두 자동 추출
              </p>
              <div className="text-center text-xs text-slate-500 mb-2">또는</div>
              <label className="block bg-cyan-600 hover:bg-cyan-700 text-white text-center font-bold py-4 rounded-lg cursor-pointer flex items-center justify-center gap-2">
                <Camera className="w-5 h-5" />
                📷 화면 캡처 (AI OCR)
                <input type="file" accept="image/*" onChange={handleFile} className="hidden" />{/* TallyOne 1.2: capture 제거 — 갤러리의 캡처 이미지 선택 가능 */}
              </label>
              <p className="text-xs text-slate-500 mt-3 leading-relaxed">
                💡 팁: 평택항 + 입출항 기간으로 검색 후 <b>엑셀 다운로드</b>가 가장 정확합니다.
                캡처는 빠르지만 작은 글씨 인식 어려울 수 있음.
              </p>

              {/* M5.84: 현재 Firebase에 저장된 PORT-MIS 데이터 보기 */}
              <div className="text-center mt-4 pt-3 border-t border-slate-700">
                <button onClick={() => setStep('view')}
                  className="text-xs text-slate-400 hover:text-amber-300 underline">
                  📋 현재 Firebase에 저장된 PORT-MIS 데이터 보기 (진단)
                </button>
              </div>
            </div>
          )}

          {/* M5.84: 단계 0 - 현재 Firebase 데이터 보기 */}
          {step === 'view' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-amber-300 font-bold">📋 현재 Firebase 데이터</p>
                  <p className="text-xs text-slate-500">총 {Object.keys(currentData || {}).length}건 등록</p>
                </div>
                <button onClick={() => setStep('pick')}
                  className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 px-3 py-1.5 rounded">
                  ← 돌아가기
                </button>
              </div>
              {/* 검색 */}
              <input type="text" placeholder="🔍 콜사인 / 선박명 검색"
                value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 mb-3"/>
              {/* 통계 */}
              <div className="flex gap-2 mb-3 text-xs flex-wrap">
                {(() => {
                  const all = Object.values(currentData || {});
                  const noBerth = all.filter(v => !v?.berth).length;
                  return (
                    <>
                      {tenant().terminals.map((t, i) => (
                        <span key={t.code} className={`${TERM_CHIP[i % TERM_CHIP.length]} px-2 py-1 rounded font-bold`}>
                          {t.name} {all.filter(v => v?.pier === t.code).length}
                        </span>
                      ))}
                      {noBerth > 0 && (
                        <span className="bg-red-900/50 border border-red-700/50 text-red-200 px-2 py-1 rounded font-bold">
                          ⚠ 부두 없음 (옛 데이터) {noBerth}
                        </span>
                      )}
                    </>
                  );
                })()}
              </div>
              {/* 데이터 목록 */}
              <div className="space-y-1 max-h-80 overflow-y-auto mb-3">
                {Object.entries(currentData || {})
                  .filter(([k, v]) => {
                    if (!searchTerm) return true;
                    const q = searchTerm.toLowerCase();
                    return k.toLowerCase().includes(q) ||
                           (v?.vesselName || '').toLowerCase().includes(q) ||
                           (v?.callsign || '').toLowerCase().includes(q);
                  })
                  .sort((a, b) => (b[1]?.updatedAt || 0) - (a[1]?.updatedAt || 0))
                  .map(([key, val]) => {
                    const isOld = !val?.berth;
                    return (
                      <div key={key} className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${
                        isOld ? 'bg-red-950/30 border border-red-800/40' : 'bg-slate-800/50'
                      }`}>
                        <span className="font-mono text-amber-400 w-20 truncate">{key}</span>
                        <span className="text-slate-200 flex-1 truncate">{val?.vesselName || '?'}</span>
                        {val?.berth ? (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                            val.pier === 'PCTC' ? 'bg-blue-900/60 text-blue-200' :
                            val.pier === 'PNCT' ? 'bg-purple-900/60 text-purple-200' :
                            'bg-slate-700 text-slate-400'
                          }`}>{val.pier || '?'} · {formatBerth(val.berth)}</span>
                        ) : (
                          <span className="text-[10px] text-red-400">⚠ 옛 데이터</span>
                        )}
                        <button onClick={() => handleDeleteOne(key)}
                          className="text-red-400 hover:text-red-300 p-1">
                          <Trash2 className="w-3 h-3"/>
                        </button>
                      </div>
                    );
                  })}
                {Object.keys(currentData || {}).length === 0 && (
                  <div className="text-center text-slate-500 py-8">
                    저장된 PORT-MIS 데이터 없음<br/>
                    <span className="text-xs">엑셀 업로드로 등록하세요</span>
                  </div>
                )}
              </div>
              {/* 전체 삭제 (위험) */}
              {Object.keys(currentData || {}).length > 0 && (
                <button onClick={handleDeleteAll}
                  className="w-full bg-red-900/40 hover:bg-red-800/60 border border-red-700 text-red-200 py-2 rounded text-xs font-bold">
                  ⚠ 모든 PORT-MIS 데이터 삭제 (위험)
                </button>
              )}
            </div>
          )}

          {/* 단계 2: 분석 중 */}
          {step === 'analyzing' && (
            <div className="py-12 text-center">
              {imageUrl && <img src={imageUrl} alt="" className="max-h-48 mx-auto mb-4 rounded border border-slate-700" />}
              <Loader2 className="w-8 h-8 animate-spin text-cyan-400 mx-auto mb-2" />
              <p className="text-cyan-300 font-bold">Gemini Vision 분석 중...</p>
              <p className="text-slate-400 text-sm mt-1">10~20초 정도 걸립니다</p>
            </div>
          )}

          {/* 단계 3: 결과 검토 */}
          {step === 'review' && (
            <div>
              <p className="text-emerald-400 font-bold mb-3">
                ✓ {ships.length}척 추출 완료
                <span className="ml-2 text-xs text-slate-400">
                  ({sourceType === 'excel' ? '엑셀 — 100% 정확' : 'AI 캡처'})
                </span>
              </p>
              {/* M5.82: 부두별 통계 */}
              <div className="flex gap-2 mb-3 text-xs">
                {(() => {
                  const otherCnt = ships.filter(s => !s.pier).length;
                  return (
                    <>
                      {tenant().terminals.map((t, i) => (
                        <span key={t.code} className={`${TERM_CHIP[i % TERM_CHIP.length]} px-2 py-1 rounded font-bold`}>
                          {t.name} {ships.filter(s => s.pier === t.code).length}척
                        </span>
                      ))}
                      {otherCnt > 0 && (
                        <span className="bg-slate-800 border border-slate-700 text-slate-400 px-2 py-1 rounded font-bold">
                          기타 {otherCnt}척
                        </span>
                      )}
                    </>
                  );
                })()}
              </div>
              <div className="space-y-2 mb-4 max-h-96 overflow-y-auto">
                {ships.map((s, i) => (
                  <div key={i} className="bg-slate-800 rounded p-3 text-sm">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-bold text-cyan-300">{s.callsign || '(콜사인 없음)'}</span>
                      <span className="text-slate-200">{s.vesselName}</span>
                      {/* M5.82: 부두 배지 */}
                      {s.pier === 'PCTC' && (
                        <span className="text-[10px] bg-blue-900/60 border border-blue-700/50 text-blue-200 px-1.5 py-0.5 rounded font-bold">
                          PCTC · {formatBerth(s.berth)}
                        </span>
                      )}
                      {s.pier === 'PNCT' && (
                        <span className="text-[10px] bg-purple-900/60 border border-purple-700/50 text-purple-200 px-1.5 py-0.5 rounded font-bold">
                          PNCT · {formatBerth(s.berth)}
                        </span>
                      )}
                      {!s.pier && s.berth && (
                        <span className="text-[10px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded">
                          {s.berth}
                        </span>
                      )}
                      {s.port && <span className="text-xs text-slate-400">[{s.port}]</span>}
                    </div>
                    <div className="text-xs text-slate-400 flex gap-3 flex-wrap">
                      {s.eta && <span>입 {s.eta}</span>}
                      {s.etd && <span>출 {s.etd}</span>}
                      {s.voyageType && <span>[{s.voyageType}]</span>}
                      {s.vesselType && <span className="text-slate-500">{s.vesselType}</span>}
                    </div>
                  </div>
                ))}
              </div>
              {/* M5.82 hotfix + M5.90: 항만 자동 감지 + 그 항만 옛 데이터 삭제 */}
              {(() => {
                const portCounts = {};
                for (const s of ships) {
                  const p = (s.port || '').trim() || '평택';
                  portCounts[p] = (portCounts[p] || 0) + 1;
                }
                const detectedPort = Object.entries(portCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '평택';
                return (
                  <div className="bg-amber-950/40 border border-amber-700/50 rounded-lg px-3 py-2 mb-3">
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input type="checkbox" checked={replaceAll}
                        onChange={e => setReplaceAll(e.target.checked)}
                        className="mt-0.5 w-4 h-4"/>
                      <div className="flex-1">
                        <div className="text-xs font-bold text-amber-200 flex items-center gap-1">
                          <Trash2 className="w-3 h-3"/> <b>{detectedPort}</b> 옛 데이터 삭제 + 새로 저장 (권장)
                        </div>
                        <div className="text-[10px] text-amber-300/70 mt-0.5">
                          체크: 기존 <b>{detectedPort}</b> PORT-MIS 데이터 모두 삭제 후 이번 데이터로 교체<br/>
                          해제: 같은 호출부호만 갱신 (다른 항만 데이터는 어느 쪽이든 보존)
                        </div>
                      </div>
                    </label>
                  </div>
                );
              })()}
              <button onClick={handleSave} className="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-3 rounded-lg">
                {replaceAll ? '🔄 PORT-MIS 데이터 갱신' : '💾 추가/갱신 저장'} → 모든 검수원 공유
              </button>
              <button onClick={() => setStep('pick')} className="w-full mt-2 bg-slate-700 hover:bg-slate-600 text-slate-300 py-2 rounded-lg text-sm">
                다른 파일로 다시
              </button>
            </div>
          )}

          {/* 단계 4: 저장 중 */}
          {step === 'saving' && (
            <div className="py-12 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-cyan-400 mx-auto mb-2" />
              <p className="text-cyan-300">Firebase 저장 중...</p>
            </div>
          )}

          {/* 단계 5: 완료 */}
          {step === 'done' && (
            <div className="py-8 text-center">
              <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto mb-3" />
              <p className="text-xl font-bold text-emerald-300 mb-1">
                {saveResult?.saved || 0}건 저장 완료
              </p>
              {/* M5.82 hotfix: 삭제된 옛 데이터 카운트 표시 */}
              {saveResult?.deleted > 0 && (
                <p className="text-amber-300 text-sm mt-1">
                  🔄 <b>{saveResult.detectedPort || '평택'}</b> 옛 데이터 <b>{saveResult.deleted}건</b> 삭제 후 교체
                </p>
              )}
              {/* M5.83: 자동 정리된 prefix 충돌 키 표시 */}
              {saveResult?.cleaned > 0 && (
                <p className="text-cyan-300 text-sm mt-1">
                  🧹 같은 선박 중복 키 <b>{saveResult.cleaned}개</b> 자동 통합 (베이사전 콜사인 길이 불일치 등)
                </p>
              )}
              {saveResult?.failed > 0 && (
                <p className="text-amber-400 text-sm">실패 {saveResult.failed}건</p>
              )}
              <p className="text-slate-400 text-sm mt-3">
                모든 검수원의 항차 화면에 ⚓ PORT-MIS 카드가 자동 표시됩니다
              </p>
              <button onClick={onClose} className="mt-6 bg-cyan-600 hover:bg-cyan-700 text-white font-bold px-8 py-3 rounded-lg">
                닫기
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
