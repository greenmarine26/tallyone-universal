// 사진 보고 모달 (M3.5.6) - 실오류/데미지
import React, { useState } from 'react';
import { X, Camera, Send, AlertOctagon, AlertTriangle } from 'lucide-react';
import {
  shareWithPhoto,
  buildSealErrorMessage,
  buildDamageMessage,
  DAMAGE_TYPES,
  DAMAGE_PARTS,
} from '../kakaoShare.js';
import { fbAddWorkReport, fbAddPhotoReport } from '../firebase.js';

// 서류 표기 — tallyReport.js 의 DMG_PART_LABEL 과 같은 값(미리보기용 사본)
const PART_DOC = {
  'ROOF': 'TOP PANEL', 'FLOOR': 'FLOOR', 'LEFT SIDE': 'L/SIDE PANEL', 'RIGHT SIDE': 'R/SIDE PANEL',
  'FRONT END': 'FRONT PANEL', 'BACK END/DOOR': 'REAR DOOR', 'DOOR HANDLE': 'DOOR HANDLE',
  'DOOR LATCH': 'DOOR LATCH', 'DOOR HINGE': 'DOOR HINGE', 'DOOR GASKET': 'DOOR GASKET',
  'CORNER POST': 'CORNER POST', 'LOCK ROD': 'LOCK ROD', 'SEAL': 'SEAL',
};

export default function PhotoReportModal({ open, type, c, voyageKey, voyage, equipNo, onClose }) {
  // type: 'seal_error' | 'damage'
  // M5.77: 사진 2장 (컨번호 사진 + 상세 사진 — 데미지부분 or 액츄얼실)
  const [cnPhotoBlob, setCnPhotoBlob] = useState(null);
  const [cnPhotoUrl, setCnPhotoUrl] = useState('');
  const [detailPhotoBlob, setDetailPhotoBlob] = useState(null);
  const [detailPhotoUrl, setDetailPhotoUrl] = useState('');
  const [damageTypes, setDamageTypes] = useState([]);
  const [damageParts, setDamageParts] = useState([]);
  const [note, setNote] = useState('');
  // TallyOne 1.10: 서류(CARGO DAMAGE REPORT)는 `L/SIDE PANEL 1 POINT DENTED ( 80 x 120 x 20 )` 형식이라
  //   POINT 수와 치수가 필요한데 앱이 안 받고 있었다. 둘 다 선택 입력 — 비우면 그 부분만 빠진다.
  const [points, setPoints] = useState('1');
  const [dimW, setDimW] = useState(''); const [dimH, setDimH] = useState(''); const [dimD, setDimD] = useState('');
  const [sealOrig, setSealOrig] = useState(c?.sl_orig || c?.sl || '');
  const [sealNew, setSealNew] = useState('');
  const [sending, setSending] = useState(false);
  // M5.78: ref 불필요 — label 직접 클릭

  if (!open) return null;

  const vsl = voyage?.info?.vsl || '';
  const dims = [dimW, dimH, dimD].map(x => String(x).trim()).filter(Boolean).join(' x ');
  const voy = voyage?.info?.voy_l || voyage?.info?.voy || '';
  const cn = c?.cn || '';

  const handleCnPhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCnPhotoBlob(file);
    setCnPhotoUrl(URL.createObjectURL(file));
  };
  const handleDetailPhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDetailPhotoBlob(file);
    setDetailPhotoUrl(URL.createObjectURL(file));
  };

  const togglePart = (code) => setDamageParts(p => p.includes(code) ? p.filter(x => x !== code) : [...p, code]);
  const toggleType = (code) => setDamageTypes(t => t.includes(code) ? t.filter(x => x !== code) : [...t, code]);

  const handleSend = async () => {
    // 검증을 명확히 - 어떤 게 빠졌는지 즉시 알려줌
    if (!cnPhotoBlob) {
      alert('⚠️ 컨테이너 번호 사진을 촬영하세요 (필수)');
      return;
    }
    if (!detailPhotoBlob) {
      alert(`⚠️ ${type === 'damage' ? '데미지 부분' : '액츄얼 실'} 사진을 촬영하세요 (필수)`);
      return;
    }
    if (type === 'damage' && damageTypes.length === 0) {
      alert('⚠️ 데미지 종류를 1개 이상 선택하세요');
      return;
    }
    if (type === 'seal_error' && !sealNew.trim()) {
      alert('⚠️ 발견된 실번호를 입력하세요');
      return;
    }

    setSending(true);
    try {
      const time = Date.now();
      let message = '';
      if (type === 'seal_error') {
        message = buildSealErrorMessage({
          vsl, voy, cn, sealOrig, sealNew, time, equip: equipNo, note,
        });
      } else {
        message = buildDamageMessage({
          vsl, voy, cn, types: damageTypes, parts: damageParts, note, time, equip: equipNo,
        });
      }

      // 1단계: 카톡 공유 먼저 (검수원에게 즉시 반응)
      console.log('[PhotoReport] 카톡 공유 시작', { message });
      // M5.77: 사진 2장 전송 (컨번호 + 상세)
      const result = await shareWithPhoto(message, [cnPhotoBlob, detailPhotoBlob], type === 'seal_error' ? '실오류' : '데미지');
      console.log('[PhotoReport] 카톡 공유 결과', result);

      // 2단계: Firebase 저장 (백그라운드, 실패해도 카톡은 이미 보냄)
      try {
        const toBase64 = (blob) => new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result);
          r.onerror = () => rej(new Error('파일 읽기 실패'));
          r.readAsDataURL(blob);
        });
        // TallyOne 1.8-13: **저장용은 축소한다.** 카메라 원본(1~2.8MB)을 base64 로 그대로 넣으면
        //   한 건이 수 MB 가 되고, 나중에 「수석 완료 저장」이 항차를 통째로 보관소에 복사할 때
        //   10~20MB 짜리 쓰기가 되어 연결이 끊긴다(2026-08-05 STMJ 2643E 실측 — 집 PC 유선인데
        //   "오프라인" 배너가 뜨고 완료 저장이 멈췄다).
        //   ⚠ 카톡으로 나가는 사진은 건드리지 않는다 — 위에서 이미 원본으로 공유했다.
        //     여기서 줄이는 건 **보관용**이고, 컨번호·손상은 1600px 로도 충분히 읽힌다.
        const shrink = async (blob) => {
          try {
            const { compressForReport } = await import('../mixerUpload.js');
            return await compressForReport(blob, 1600);
          } catch (e) {
            console.warn('[PhotoReport] 보관용 축소 실패 — 원본으로 저장합니다:', e);
            return blob;
          }
        };
        const cnB64 = await toBase64(await shrink(cnPhotoBlob));
        const detailB64 = await toBase64(await shrink(detailPhotoBlob));
        await fbAddPhotoReport(voyageKey, cnB64, {
          photoKind: 'cn',
          detailPhoto: detailB64,
          type, cn, mode: voyage?.mode || 'unknown',
          equip: equipNo,
          damageTypes: type === 'damage' ? damageTypes : null,
          damageParts: type === 'damage' ? damageParts : null,
          points: type === 'damage' ? (String(points).trim() || null) : null,
          dims: type === 'damage' ? (dims || null) : null,
          sealOrig: type === 'seal_error' ? sealOrig : null,
          sealNew: type === 'seal_error' ? sealNew : null,
          note, message,
        });
        await fbAddWorkReport(voyageKey, {
          type, cn, equip: equipNo, message, hasPhoto: true,
        });
        console.log('[PhotoReport] Firebase 저장 완료');
      } catch (fbErr) {
        console.error('[PhotoReport] Firebase 저장 실패 (카톡은 이미 발송됨):', fbErr);
      }

      // 결과 안내
      if (result?.cancelled) {
        // 사용자가 공유창에서 취소
        // 모달은 그대로 두기
      } else if (result?.method === 'clipboard' || result?.method === 'alert') {
        // 클립보드 복사됨 - alert가 이미 뜸
        onClose();
      } else {
        // 정상 공유 완료
        onClose();
      }
    } catch (e) {
      console.error('[PhotoReport] 전송 오류:', e);
      alert('전송 중 오류: ' + (e?.message || e));
    } finally {
      setSending(false);
    }
  };

  const isError = type === 'seal_error';

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/80 p-0 md:p-4" onClick={onClose}>
      <div className="bg-slate-900 border-2 border-slate-700 rounded-t-2xl md:rounded-2xl w-full max-w-lg max-h-[95vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className={`sticky top-0 border-b border-slate-700 px-4 py-3 flex items-center justify-between ${isError ? 'bg-red-950' : 'bg-amber-950'}`}>
          <div className="flex items-center gap-2">
            {isError ? <AlertOctagon className="w-5 h-5 text-red-300"/> : <AlertTriangle className="w-5 h-5 text-amber-300"/>}
            <span className={`font-bold ${isError ? 'text-red-100' : 'text-amber-100'}`}>
              {isError ? '🚨 실오류 보고' : '⚠️ 데미지 보고'}
            </span>
            {equipNo && <span className="text-xs bg-slate-800 text-white px-2 py-0.5 rounded font-bold">{equipNo}</span>}
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded">
            <X className="w-5 h-5"/>
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* 컨번호 */}
          <div className="bg-slate-800 rounded-lg p-2">
            <div className="text-[10px] text-slate-400 font-bold uppercase">컨번호</div>
            <div className="text-base font-bold mono text-slate-100">{cn}</div>
          </div>

          {/* M5.78: label 직접 클릭 — PWA에서 button+ref.click()보다 안정적 */}
          {/* 사진 1: 컨테이너 번호 */}
          <div>
            <div className="text-xs font-bold text-amber-300 mb-1">📷 1/2 컨테이너 번호 (필수)</div>
            {cnPhotoUrl && (
              <div className="relative mb-1">
                <img src={cnPhotoUrl} alt="" className="w-full rounded-lg border-2 border-emerald-700"/>
                <div className="absolute top-1 right-1 bg-emerald-700 text-white text-[10px] px-2 py-0.5 rounded font-bold">✓ 촬영됨</div>
              </div>
            )}
            <label className={`w-full block cursor-pointer rounded-lg font-bold text-white text-center flex items-center justify-center gap-2 ${
              cnPhotoUrl ? 'bg-slate-700 hover:bg-slate-600 py-2 text-xs' : (isError ? 'bg-red-700 hover:bg-red-600 py-5' : 'bg-amber-700 hover:bg-amber-600 py-5')
            }`}>
              <input type="file" accept="image/*" capture="environment" onChange={handleCnPhoto} className="hidden"/>
              <Camera className="w-5 h-5"/> {cnPhotoUrl ? '📷 다시 촬영' : '컨테이너 번호 촬영'}
            </label>
            {/* TallyOne 1.2: 찍어둔 사진 등록 — capture 강제로 앨범 선택이 막혀 있던 문제(2026-08-02 파손 보고 실패) */}
            <label className="w-full block cursor-pointer rounded-lg font-bold text-center py-2 mt-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-200">
              <input type="file" accept="image/*" onChange={handleCnPhoto} className="hidden"/>
              🖼 앨범에서 선택 (찍어둔 사진)
            </label>
          </div>

          {/* 사진 2: 상세 */}
          <div>
            <div className="text-xs font-bold text-amber-300 mb-1">📷 2/2 {isError ? '액츄얼 실 (필수)' : '데미지 부분 (필수)'}</div>
            {detailPhotoUrl && (
              <div className="relative mb-1">
                <img src={detailPhotoUrl} alt="" className="w-full rounded-lg border-2 border-emerald-700"/>
                <div className="absolute top-1 right-1 bg-emerald-700 text-white text-[10px] px-2 py-0.5 rounded font-bold">✓ 촬영됨</div>
              </div>
            )}
            <label className={`w-full block cursor-pointer rounded-lg font-bold text-white text-center flex items-center justify-center gap-2 ${
              detailPhotoUrl ? 'bg-slate-700 hover:bg-slate-600 py-2 text-xs' : (isError ? 'bg-red-700 hover:bg-red-600 py-5' : 'bg-amber-700 hover:bg-amber-600 py-5')
            }`}>
              <input type="file" accept="image/*" capture="environment" onChange={handleDetailPhoto} className="hidden"/>
              <Camera className="w-5 h-5"/> {detailPhotoUrl ? '📷 다시 촬영' : (isError ? '액츄얼 실 촬영' : '데미지 부분 촬영')}
            </label>
            <label className="w-full block cursor-pointer rounded-lg font-bold text-center py-2 mt-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-200">
              <input type="file" accept="image/*" onChange={handleDetailPhoto} className="hidden"/>
              🖼 앨범에서 선택 (찍어둔 사진)
            </label>
          </div>

          {/* 실오류 입력 */}
          {isError && (
            <>
              <div>
                <div className="text-[10px] text-slate-400 font-bold uppercase mb-1">기존 실번호</div>
                <input
                  type="text"
                  value={sealOrig}
                  onChange={e => setSealOrig(e.target.value.toUpperCase())}
                  placeholder="기존 실번호"
                  className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm mono text-slate-100 focus:outline-none focus:border-red-500"
                />
              </div>
              <div>
                <div className="text-[10px] text-slate-400 font-bold uppercase mb-1">발견된 실번호</div>
                <input
                  type="text"
                  value={sealNew}
                  onChange={e => setSealNew(e.target.value.toUpperCase())}
                  placeholder="현장에서 발견한 실번호"
                  className="w-full bg-slate-800 border-2 border-red-700 rounded px-3 py-2 text-sm mono text-red-100 focus:outline-none focus:border-red-400"
                />
              </div>
            </>
          )}

          {/* 데미지 종류 (다중) */}
          {!isError && (
            <>
              <div>
                <div className="text-xs font-bold text-amber-300 mb-2">데미지 종류 (다중 선택)</div>
                <div className="grid grid-cols-2 gap-1">
                  {DAMAGE_TYPES.map(d => (
                    <label key={d.code} className={`flex items-center gap-1.5 px-2 py-1.5 rounded cursor-pointer text-[11px] ${
                      damageTypes.includes(d.code) ? 'bg-amber-900/60 border border-amber-500' : 'bg-slate-800 hover:bg-slate-700'
                    }`}>
                      <input type="checkbox" checked={damageTypes.includes(d.code)} onChange={() => toggleType(d.code)} className="w-3.5 h-3.5"/>
                      <span className={`font-bold ${damageTypes.includes(d.code) ? 'text-amber-100' : 'text-slate-300'}`}>{d.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs font-bold text-amber-300 mb-2">부위 (다중 선택)</div>
                <div className="grid grid-cols-2 gap-1">
                  {DAMAGE_PARTS.map(p => (
                    <label key={p.code} className={`flex items-center gap-1.5 px-2 py-1.5 rounded cursor-pointer text-[11px] ${
                      damageParts.includes(p.code) ? 'bg-amber-900/60 border border-amber-500' : 'bg-slate-800 hover:bg-slate-700'
                    }`}>
                      <input type="checkbox" checked={damageParts.includes(p.code)} onChange={() => togglePart(p.code)} className="w-3.5 h-3.5"/>
                      <span className={`font-bold ${damageParts.includes(p.code) ? 'text-amber-100' : 'text-slate-300'}`}>{p.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* TallyOne 1.10: 서류용 POINT·치수 — 비워도 된다(그 부분만 문구에서 빠진다) */}
              <div>
                <div className="text-xs font-bold text-amber-300 mb-2">
                  손상 개소 · 크기 <span className="font-normal text-slate-400">(선택 — 적으면 서류에 그대로 들어갑니다)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <input type="number" min="1" inputMode="numeric" value={points} onChange={e => setPoints(e.target.value)}
                    className="w-14 bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-center text-slate-100 focus:outline-none focus:border-amber-500"/>
                  <span className="text-[11px] text-slate-400 font-bold">POINT</span>
                  <span className="text-slate-600 mx-1">·</span>
                  <input type="number" inputMode="numeric" placeholder="가로" value={dimW} onChange={e => setDimW(e.target.value)}
                    className="w-16 bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-center text-slate-100 focus:outline-none focus:border-amber-500"/>
                  <span className="text-slate-500">x</span>
                  <input type="number" inputMode="numeric" placeholder="세로" value={dimH} onChange={e => setDimH(e.target.value)}
                    className="w-16 bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-center text-slate-100 focus:outline-none focus:border-amber-500"/>
                  <span className="text-slate-500">x</span>
                  <input type="number" inputMode="numeric" placeholder="깊이" value={dimD} onChange={e => setDimD(e.target.value)}
                    className="w-16 bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-center text-slate-100 focus:outline-none focus:border-amber-500"/>
                </div>
                {(damageParts.length > 0 || damageTypes.length > 0) && (
                  <div className="mt-2 text-[11px] text-slate-300 bg-slate-800/70 border border-slate-700 rounded px-2 py-1.5">
                    서류 문구 <span className="text-amber-200 font-bold">
                      {[damageParts.map(x => PART_DOC[x] || x).join(' & '),
                        String(points).trim() ? `${String(points).trim()} POINT` : '',
                        damageTypes.join(' & '),
                        dims ? `( ${dims} )` : ''].filter(Boolean).join(' ')}
                    </span>
                  </div>
                )}
              </div>
            </>
          )}

          {/* 추가 설명 */}
          <div>
            <div className="text-[10px] text-slate-400 font-bold uppercase mb-1">추가 설명 (선택)</div>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder={isError ? '추가 설명' : '예: 좌측면 30cm 길이 손상'}
              rows={2}
              className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        <div className="sticky bottom-0 bg-slate-900 border-t border-slate-700 p-3">
          {/* 검증 상태 표시 */}
          {(() => {
            const missing = [];
            if (!cnPhotoBlob) missing.push('📷 컨번호 사진');
            if (!detailPhotoBlob) missing.push(`📷 ${type === 'damage' ? '데미지' : '액츄얼 실'} 사진`);
            if (type === 'damage' && damageTypes.length === 0) missing.push('데미지 종류');
            if (type === 'seal_error' && !sealNew.trim()) missing.push('발견 실번호');
            if (missing.length > 0) {
              return (
                <div className="mb-2 px-3 py-2 bg-red-950/40 border border-red-700/50 rounded text-[11px] text-red-200 font-bold">
                  ⚠️ 입력 필요: {missing.join(', ')}
                </div>
              );
            }
            return (
              <div className="mb-2 px-3 py-2 bg-emerald-950/40 border border-emerald-700/50 rounded text-[11px] text-emerald-200 font-bold">
                ✅ 전송 준비 완료
              </div>
            );
          })()}
          <button onClick={handleSend} disabled={sending}
            className={`w-full py-3 rounded-lg font-bold text-white flex items-center justify-center gap-2 ${
              isError ? 'bg-red-700 hover:bg-red-600 active:bg-red-800' : 'bg-amber-700 hover:bg-amber-600 active:bg-amber-800'
            } disabled:opacity-50`}>
            <Send className="w-5 h-5"/> {sending ? '전송 중...' : '카톡으로 전송'}
          </button>
          <div className="text-[10px] text-slate-500 text-center mt-1">
            💡 사진 위에 정보가 합성되어 한 장으로 카톡 발송
          </div>
        </div>
      </div>
    </div>
  );
}
