// V37 DischargeListTab 패턴 100% 이식
//  - cargoFilter (10+ 필터: F/E/20DC/40DC/40HC/RF/FR/OT/TK/X-RAY/DG)
//  - 좌측 색깔 띠 (화물 종류별)
//  - 카드에 POD 도시명, 리퍼 온도 강조
//  - 실번호/X-RAY 봉인 인라인 편집
//  - 실오류 (원본 ≠ 실제) 빨강 강조
import React, { useState, useMemo } from 'react';
import { Check, Edit3, Snowflake, AlertTriangle, AlertOctagon, X } from 'lucide-react';
import { fbCompleteContainer, fbCancelComplete, fbToggleXray, fbUpdateRecordSeal, fbSetXraySeal } from '../firebase.js';
import { isoToLabel, formatWt, fmtPos, isReeferContainer, isBookingSlot } from '../utils.js';
import { speakDone } from '../voice.js';
import ConfirmModal, { useConfirm } from './ConfirmModal.jsx';

// 필터 정의 (V37 cargoFilter 그대로 + 다크 매핑)
const FILTERS = [
  { key: 'all', label: '모두', color: 'bg-slate-600' },
  { key: 'remaining', label: '미완', color: 'bg-amber-700' },
  { key: 'completed', label: '완료', color: 'bg-emerald-700' },
  { key: 'full', label: 'F (적컨)', color: 'bg-emerald-600' },
  { key: 'empty', label: 'E (공컨)', color: 'bg-slate-500' },
  { key: 'feUnknown', label: '? (미정)', color: 'bg-amber-600' },
  { key: '20', label: '20DC', color: 'bg-blue-600' },
  { key: '40', label: '40DC', color: 'bg-blue-600' },
  { key: 'hc', label: '40HC', color: 'bg-blue-600' },
  { key: 'hc45', label: '45HC', color: 'bg-blue-600' },
  { key: 'rf20', label: '❄ 20RF', color: 'bg-cyan-600' },
  { key: 'rf40', label: '❄ 40RF', color: 'bg-cyan-600' },
  { key: 'rf45', label: '❄ 45RF', color: 'bg-cyan-600' },
  { key: 'fr20', label: '▱ 20FR', color: 'bg-yellow-600' },
  { key: 'fr40', label: '▱ 40FR', color: 'bg-yellow-600' },
  { key: 'fr45', label: '▱ 45FR', color: 'bg-yellow-600' },
  { key: 'ot20', label: '△ 20OT', color: 'bg-pink-600' },
  { key: 'ot40', label: '△ 40OT', color: 'bg-pink-600' },
  { key: 'ot45', label: '△ 45OT', color: 'bg-pink-600' },
  { key: 'tk20', label: '⬛ 20TK', color: 'bg-orange-600' },
  { key: 'tk40', label: '⬛ 40TK', color: 'bg-orange-600' },
  { key: 'rf', label: '❄ 리퍼(F+온도)', color: 'bg-cyan-600' },
  { key: 'dg', label: '🔥 DG', color: 'bg-red-600' },
  { key: 'oog', label: '📐 OOG', color: 'bg-fuchsia-600' },
  { key: 'xray', label: '🔍 X-RAY', color: 'bg-purple-600' },
  { key: 'sealerr', label: '🚨 실오류', color: 'bg-red-700' },
  { key: 'isoOther', label: '⚠️ 기타 ISO', color: 'bg-amber-700' },
];

export default function ContainerList({ list, compMap, xrayMap, xraySeals, mode, voyageKey, inspector, onOpenContainer }) {
  const [cargoFilter, setCargoFilter] = useState('all');
  const [opFilter, setOpFilter] = useState('all'); // 검수업체 필터
  const [podFilter, setPodFilter] = useState('all'); // POD 도시 필터 (선적용)

  // 카운트 계산 (V37 cargoCounts 그대로)
  const counts = useMemo(() => {
    const k = {
      all: list.length,
      completed: 0, remaining: 0, full: 0, empty: 0, feUnknown: 0, xray: 0, dg: 0, rf: 0, tk: 0, oog: 0,
      hc: 0, dc20: 0, dc40: 0,
      rf20: 0, rf40: 0, rf45: 0, fr20: 0, fr40: 0, fr45: 0, ot20: 0, ot40: 0, ot45: 0, tk20: 0, tk40: 0,
      hc45: 0,
      isoOther: 0,
      isoOtherList: [],
      sealerr: 0,
    };
    list.forEach(c => {
      const isDone = !!compMap[c.cn];
      if (isDone) k.completed++;
      else k.remaining++;
      if (c.dg) k.dg++;
      if (xrayMap[c.cn]) k.xray++;
      const hasTmp = c.tmp != null && String(c.tmp).trim() !== '';
      if (c.rf && hasTmp) k.rf++;
      if (c.tk) k.tk++;
      if (c.oog || c.fr) k.oog++;
      if (c.fe === 'F') k.full++;
      else if (c.fe === 'E') k.empty++;
      else k.feUnknown++;  // M3.5.6: F/E 미정 카운트

      const lbl = isoToLabel(c.iso);
      let knownLbl = false;
      if (lbl === '40HC') { k.hc++; knownLbl = true; }
      else if (lbl === '20DC' || lbl === '20GP' || lbl === '20VH') { k.dc20++; knownLbl = true; }
      else if (lbl === '40DC' || lbl === '40GP' || lbl === '40VH') { k.dc40++; knownLbl = true; }
      if (lbl === '20RF') { k.rf20++; knownLbl = true; }
      else if (lbl === '40RF') { k.rf40++; knownLbl = true; }
      if (lbl === '20FR') { k.fr20++; knownLbl = true; }
      else if (lbl === '40FR') { k.fr40++; knownLbl = true; }
      else if (lbl === '45FR') { k.fr45++; knownLbl = true; }
      if (lbl === '20OT') { k.ot20++; knownLbl = true; }
      else if (lbl === '40OT') { k.ot40++; knownLbl = true; }
      else if (lbl === '45OT') { k.ot45++; knownLbl = true; }
      if (lbl === '20TK') { k.tk20++; knownLbl = true; }
      else if (lbl === '40TK') { k.tk40++; knownLbl = true; }
      if (lbl === '45RF') { k.rf45++; knownLbl = true; }
      if (lbl === '45HC') { k.hc45++; knownLbl = true; }

      // M3.5.6: 알려진 카테고리에 없는 ISO 카운트 (검수원 확인 필요)
      if (!knownLbl) {
        k.isoOther++;
        if (k.isoOtherList.length < 50) {
          k.isoOtherList.push({ cn: c.cn, iso: c.iso, label: lbl });
        }
      }

      // 실오류
      const slOrig = c.sl_orig != null ? c.sl_orig : c.sl;
      if (c.sl && slOrig && c.sl !== slOrig) k.sealerr++;
      const xs = xraySeals?.[c.cn];
      const xSealOrig = xs?.seal_orig != null ? xs.seal_orig : xs?.seal;
      if (xs?.seal && xSealOrig && xs.seal !== xSealOrig) k.sealerr++;
    });
    return k;
  }, [list, compMap, xrayMap, xraySeals]);

  // 검수업체 목록
  const ops = useMemo(() => {
    const set = new Set();
    list.forEach(c => { if (c.op) set.add(c.op); });
    return Array.from(set).sort();
  }, [list]);

  // POD 도시 목록 (선적 모드용)
  const pods = useMemo(() => {
    if (mode !== 'loading') return [];
    const set = new Set();
    list.forEach(c => { if (c.pod) set.add(c.pod); });
    return Array.from(set).sort();
  }, [list, mode]);

  // 필터 적용
  const filtered = useMemo(() => {
    return list.filter(c => {
      const isDone = !!compMap[c.cn];
      // cargoFilter
      const f = cargoFilter;
      const lbl = isoToLabel(c.iso);
      if (f === 'completed' && !isDone) return false;
      if (f === 'remaining' && isDone) return false;
      if (f === 'full' && c.fe !== 'F') return false;
      if (f === 'empty' && c.fe !== 'E') return false;
      if (f === 'feUnknown' && (c.fe === 'F' || c.fe === 'E')) return false;
      if (f === 'isoOther') {
        const lbl = isoToLabel(c.iso);
        const known = ['20DC','20GP','40DC','40GP','40HC','45HC','20RF','40RF','45RF','20FR','40FR','45FR','20OT','40OT','45OT','20TK','40TK'];
        if (known.includes(lbl)) return false;
      }
      if (f === 'feUnknown' && (c.fe === 'F' || c.fe === 'E')) return false;
      if (f === 'isoOther') {
        const lbl = isoToLabel(c.iso);
        const known = ['40HC', '20DC', '20GP', '40DC', '40GP', '20RF', '40RF', '45RF', '20FR', '40FR', '45FR', '20OT', '40OT', '45OT', '20TK', '40TK', '45HC'];
        if (known.includes(lbl)) return false;
      }
      if (f === '20' && !['20DC','20GP'].includes(lbl)) return false;
      if (f === '40' && !['40DC','40GP'].includes(lbl)) return false;
      if (f === 'hc' && lbl !== '40HC') return false;
      if (f === 'rf20' && lbl !== '20RF') return false;
      if (f === 'rf40' && lbl !== '40RF') return false;
      if (f === 'fr20' && lbl !== '20FR') return false;
      if (f === 'fr40' && lbl !== '40FR') return false;
      if (f === 'fr45' && lbl !== '45FR') return false;
      if (f === 'ot20' && lbl !== '20OT') return false;
      if (f === 'ot40' && lbl !== '40OT') return false;
      if (f === 'ot45' && lbl !== '45OT') return false;
      if (f === 'rf45' && lbl !== '45RF') return false;
      if (f === 'hc45' && lbl !== '45HC') return false;
      if (f === 'tk20' && lbl !== '20TK') return false;
      if (f === 'tk40' && lbl !== '40TK') return false;
      if (f === 'rf') {
        const hasTmp = c.tmp != null && String(c.tmp).trim() !== '';
        if (!(c.rf && hasTmp)) return false;
      }
      if (f === 'dg' && !c.dg) return false;
      if (f === 'tk' && !c.tk) return false;
      if (f === 'oog' && !(c.oog || c.fr)) return false;
      if (f === 'xray' && !xrayMap[c.cn]) return false;
      if (f === 'sealerr') {
        const slOrig = c.sl_orig != null ? c.sl_orig : c.sl;
        const xs = xraySeals?.[c.cn];
        const xSealOrig = xs?.seal_orig != null ? xs.seal_orig : xs?.seal;
        const slErr = c.sl && slOrig && c.sl !== slOrig;
        const xErr = xs?.seal && xSealOrig && xs.seal !== xSealOrig;
        if (!slErr && !xErr) return false;
      }
      // 검수업체 필터
      if (opFilter !== 'all' && c.op !== opFilter) return false;
      // POD 필터
      if (podFilter !== 'all' && c.pod !== podFilter) return false;
      return true;
    });
  }, [list, cargoFilter, opFilter, podFilter, compMap, xrayMap, xraySeals]);

  if (!list || list.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-8 text-center text-slate-500 text-sm">
        컨테이너 없음
      </div>
    );
  }

  // 화면에 표시할 필터 (count > 0인 것만)
  const visibleFilters = FILTERS.filter(f => {
    if (['all', 'remaining', 'completed', 'full', 'empty'].includes(f.key)) return true;
    if (f.key === 'feUnknown') return counts.feUnknown > 0;  // M3.5.6: F/E 미정 있을 때만
    if (f.key === 'isoOther') return counts.isoOther > 0;    // M3.5.6: 알 수 없는 ISO 있을 때만
    if (f.key === '20') return counts.dc20 > 0;
    if (f.key === '40') return counts.dc40 > 0;
    if (f.key === 'hc') return counts.hc > 0;
    return counts[f.key] > 0;
  });

  return (
    <div className="space-y-2">
      {/* 필터 버튼 */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-2">
        <div className="text-[10px] text-slate-500 font-bold uppercase mb-1.5">필터 ({filtered.length}/{list.length})</div>
        <div className="flex flex-wrap gap-1">
          {visibleFilters.map(f => {
            const cnt = f.key === 'all' ? list.length :
                        f.key === 'completed' ? counts.completed :
                        f.key === 'remaining' ? counts.remaining :
                        f.key === '20' ? counts.dc20 :
                        f.key === '40' ? counts.dc40 :
                        counts[f.key] || 0;
            return (
              <button key={f.key} onClick={() => setCargoFilter(f.key)}
                className={`px-2 py-1 rounded text-[10px] font-bold ${
                  cargoFilter === f.key ? `${f.color} text-white` : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}>
                {f.label} {cnt}
              </button>
            );
          })}
        </div>

        {/* 검수업체 필터 + POD 필터 */}
        {(ops.length > 1 || pods.length > 1) && (
          <div className="mt-2 pt-2 border-t border-slate-800 flex items-center gap-2 flex-wrap">
            {ops.length > 1 && (
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-slate-500 font-bold">검수업체:</span>
                <select value={opFilter} onChange={e => setOpFilter(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded text-[11px] mono text-slate-200 px-1.5 py-0.5">
                  <option value="all">전체</option>
                  {ops.map(op => <option key={op} value={op}>{op}</option>)}
                </select>
              </div>
            )}
            {pods.length > 1 && (
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-slate-500 font-bold">목적지:</span>
                <select value={podFilter} onChange={e => setPodFilter(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded text-[11px] mono text-slate-200 px-1.5 py-0.5">
                  <option value="all">전체</option>
                  {pods.map(pod => <option key={pod} value={pod}>{pod}</option>)}
                </select>
              </div>
            )}
            {(opFilter !== 'all' || podFilter !== 'all') && (
              <button onClick={() => { setOpFilter('all'); setPodFilter('all'); }}
                className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-0.5">
                <X className="w-2.5 h-2.5"/>해제
              </button>
            )}
          </div>
        )}
      </div>

      {/* 카드 리스트 */}
      <div className="space-y-1.5">
        {filtered.length === 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 text-center text-slate-500 text-sm">
            필터 조건에 맞는 컨테이너 없음
          </div>
        )}
        {filtered.map(c => (
          <ContainerCard
            key={c.cn}
            c={c}
            comp={compMap[c.cn]}
            isXray={mode === 'discharge' && !!xrayMap[c.cn]}
            xraySeal={xraySeals?.[c.cn] || null}
            mode={mode}
            voyageKey={voyageKey}
            inspector={inspector}
            onOpenContainer={onOpenContainer}
          />
        ))}
      </div>
    </div>
  );
}

function ContainerCard({ c, comp, isXray, xraySeal, mode, voyageKey, inspector, onOpenContainer }) {
  const [editingSeal, setEditingSeal] = useState(false);
  const [editingXSeal, setEditingXSeal] = useState(false);
  const [sealVal, setSealVal] = useState(c.sl || '');
  const [xSealVal, setXSealVal] = useState(xraySeal?.seal || '');
  const [xEsealVal, setXEsealVal] = useState(xraySeal?.eseal || '');
  // M3.74: confirm() → ConfirmModal
  const [confirmState, askConfirm] = useConfirm();

  const isDone = !!comp;
  const isReefer = isReeferContainer(c);
  const hasTmp = c.tmp != null && String(c.tmp).trim() !== '';
  const isReeferF = c.rf && hasTmp;
  const isDG = c.dg;
  // M5.79: 평택 적재 부킹 슬롯 (컨번호 미입력)
  const isBooking = isBookingSlot(c);

  const slOrig = c.sl_orig != null ? c.sl_orig : c.sl;
  // TallyOne 1.8-03: '실오류'와 '자료 불일치'를 가른다.
  //   실오류 = 검수원이 **실물 봉인을 보고** 다르다고 판정한 것. 세관 신고 대상이라 붉은색.
  //     판정 근거는 sl_history(수정 이력)다. 종전엔 `sl !== sl_orig` 만 봐서, 리스트끼리
  //     달라도 실오류로 떴다(2026-08-04 STMJ 2643E SKHU8912132 실측).
  //   자료 불일치 = 리스트끼리 안 맞음. **아무도 실물을 안 봤다.** 검수 전에 확인할 신호.
  const sealEdited = Array.isArray(c.sl_history) && c.sl_history.length > 0;
  const sealError = sealEdited && c.sl && slOrig && c.sl !== slOrig;
  const sealConflict = !sealError && Array.isArray(c.sl_conflict) && c.sl_conflict.length > 1;
  const xSealOrig = xraySeal?.seal_orig != null ? xraySeal.seal_orig : xraySeal?.seal || '';
  const xSeal = xraySeal?.seal || '';
  const xSealError = xSeal && xSealOrig && xSeal !== xSealOrig;

  // 좌측 색깔 띠 (V37 typeBar)
  let typeBar = 'bg-slate-700';
  if (isBooking) typeBar = 'bg-amber-500';   // M5.79: 부킹 슬롯
  else if (isDG) typeBar = 'bg-red-500';
  else if (isReefer) typeBar = 'bg-cyan-500';
  else if (c.tk) typeBar = 'bg-orange-500';
  else if (c.fr || c.oog) typeBar = 'bg-purple-500';
  else if (c.fe === 'F') typeBar = 'bg-emerald-500';
  else typeBar = 'bg-slate-500';

  const handleComplete = async (e) => {
    e.stopPropagation();
    if (!inspector) { alert('검수원을 먼저 선택하세요'); return; }
    if (isDone) {
      askConfirm({
        title: '완료 취소',
        message: `${c.cn}\n${mode === 'discharge' ? '양하확인을' : '선적확인을'} 취소하시겠습니까?`,
        confirmLabel: '취소',
        cancelLabel: '닫기',
        onConfirm: async () => {
          await fbCancelComplete(voyageKey, mode, c.cn);
        },
      });
    } else {
      // V8.09-06: XRAY 대상은 XRAY 실번호(seal) 입력 전까지 양하확인 차단.
      if (mode === 'discharge' && isXray && !String(xraySeal?.seal || '').trim()) {
        alert(`XRAY 실번호를 먼저 입력하세요.\n${c.cn?.slice(-4)}은 XRAY 대상으로 실번호 입력 전까지 양하확인할 수 없습니다.`);
        return;
      }
      await fbCompleteContainer(voyageKey, mode, c.cn, inspector);
      speakDone(c);
    }
  };

  const handleSaveSeal = async (e) => {
    e?.stopPropagation();
    await fbUpdateRecordSeal(voyageKey, mode, c.cn, sealVal.trim(), inspector);
    setEditingSeal(false);
  };

  const handleSaveXSeal = async (e) => {
    e?.stopPropagation();
    await fbSetXraySeal(voyageKey, c.cn, xSealVal.trim(), xEsealVal.trim(), inspector);
    setEditingXSeal(false);
  };

  const handleToggleXray = async (e) => {
    e.stopPropagation();
    if (mode !== 'discharge') return;
    await fbToggleXray(voyageKey, c.cn);
  };

  const handleCardClick = () => {
    if (editingSeal || editingXSeal) return;
    onOpenContainer?.(c);
  };

  return (
    <div onClick={handleCardClick}
      className={`bg-slate-900 border rounded-lg overflow-hidden transition cursor-pointer hover:bg-slate-800/50 flex ${
        sealError || xSealError ? 'border-red-700/60 bg-red-950/30' :
        isDone ? 'border-emerald-700/40 bg-emerald-950/20' :
        isXray ? 'border-purple-700/40 bg-purple-950/20' :
        'border-slate-700'
      }`}>
      {/* 좌측 색깔 띠 */}
      <div className={`w-1.5 ${typeBar} flex-shrink-0`}/>

      <div className="flex-1 p-2.5 min-w-0">
        <div className="flex items-start gap-2">
          {/* 완료 버튼 */}
          <button onClick={handleComplete}
            className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center font-black ${
              isDone ? 'bg-emerald-700 text-emerald-100' : 'bg-slate-800 text-slate-500 hover:bg-slate-700'
            }`}>
            {isDone ? <Check className="w-5 h-5"/> : '✓'}
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              {isBooking ? (
                <>
                  <span className="font-black text-sm text-amber-300 mono">📝 대기</span>
                  <span className="text-[10px] text-amber-400/80 font-bold">컨번호 입력대기</span>
                </>
              ) : (
                <>
                  <span className="font-black text-sm text-amber-300 mono">{c.l4 || c.cn?.slice(-4)}</span>
                  <span className="text-[11px] text-slate-400 mono truncate">{c.cn}</span>
                </>
              )}
              {(sealError || xSealError) && (
                <span className="bg-red-700/80 text-red-50 text-[9px] px-1.5 py-0.5 rounded font-black flex items-center gap-0.5">
                  <AlertOctagon className="w-2.5 h-2.5"/>실오류
                </span>
              )}
              {sealConflict && (
                <span className="bg-amber-700/80 text-amber-50 text-[9px] px-1.5 py-0.5 rounded font-black flex items-center gap-0.5"
                  title={`리스트마다 실번호가 다릅니다 — ${c.sl_conflict.map(h => h.sl + (h.src ? ` (${h.src})` : '')).join(' / ')}`}>
                  ⚠ 자료 불일치
                </span>
              )}
              <span className={`text-[9px] mono px-1 py-0.5 rounded font-bold ${
                c.fe === 'F' ? 'bg-emerald-700 text-emerald-100' :
                c.fe === 'E' ? 'bg-slate-600 text-slate-200' :
                'bg-amber-800/60 text-amber-200 border border-amber-600/40'
              }`}>{c.fe || '⚠?'}</span>
              <span className="text-[9px] mono px-1 py-0.5 rounded font-bold bg-blue-900 text-blue-300">{isoToLabel(c.iso) || c.tp || ''}</span>
              {isXray && <span className="bg-purple-700/60 text-purple-100 text-[9px] px-1.5 py-0.5 rounded font-black">🔍 XRAY</span>}
              {/* V9.03: 긴급/수화물 — 예보(CLL 메일) 컨번호 마커. 카고플랜의 ▲·보라테두리와 짝. */}
              {c.urgent && <span className="bg-rose-600 text-rose-50 text-[9px] px-1.5 py-0.5 rounded font-black">▲ 긴급</span>}
              {c.lugg && <span className="bg-violet-700/70 text-violet-100 text-[9px] px-1.5 py-0.5 rounded font-black border border-violet-400/60">🧳 수화물{c.luggSeal ? ` 실 ${c.luggSeal}` : ''}</span>}
              {isDG && <span className="bg-red-700/60 text-red-100 text-[9px] px-1.5 py-0.5 rounded font-black"><AlertTriangle className="w-2.5 h-2.5 inline mr-0.5"/>DG{c.un ? ` UN${c.un}` : ''}</span>}
              {/* 리퍼 - 온도 있으면 항상 큰 뱃지 (F/E 무관) */}
              {isReefer && hasTmp
                ? <span className="bg-cyan-600 text-cyan-50 text-[10px] px-1.5 py-0.5 rounded font-black flex items-center gap-0.5"><Snowflake className="w-2.5 h-2.5"/>RF {c.tmp}°C</span>
                : isReefer && <span className="bg-cyan-900/70 text-cyan-300 text-[9px] px-1.5 py-0.5 rounded font-bold border border-cyan-700/50">RF</span>}
              {c.fr && <span className="bg-orange-700/60 text-orange-100 text-[9px] px-1.5 py-0.5 rounded font-black">FR</span>}
              {c.ot && <span className="bg-yellow-700/60 text-yellow-100 text-[9px] px-1.5 py-0.5 rounded font-black">OT</span>}
              {c.tk && <span className="bg-pink-700/60 text-pink-100 text-[9px] px-1.5 py-0.5 rounded font-black">TK</span>}
            </div>

            {/* 위치 + 무게 + 검수업체 + POD 강조 */}
            <div className="flex items-center gap-2 mt-1 text-[10px] mono flex-wrap">
              {c.bay && <span className="text-amber-200 font-bold">{fmtPos(c)}</span>}
              {c.wt > 0 && <span className="text-slate-400">{formatWt(c.wt)}</span>}
              {c.op && <span className="bg-slate-800 px-1 py-0.5 rounded text-slate-300 font-bold">{c.op}</span>}
              {c.pol && <span className="text-slate-500">POL <span className="text-slate-300">{c.pol}</span></span>}
              {c.pod && (
                <span className="text-slate-500">
                  POD <span className={mode === 'loading' ? 'text-amber-300 font-bold' : 'text-slate-300'}>{c.pod}</span>
                </span>
              )}
              {comp?.by && <span className="text-emerald-400">[{comp.by}]</span>}
            </div>

            {/* 실번호 (원본 vs 실제) */}
            <div className="flex items-center gap-1 mt-1 flex-wrap">
              <span className="text-[10px] text-slate-500">실:</span>
              {editingSeal ? (
                <div onClick={e => e.stopPropagation()} className="flex items-center gap-1">
                  <input type="text" value={sealVal}
                    onChange={e => setSealVal(e.target.value.toUpperCase())}
                    className="bg-slate-800 border border-amber-600 rounded px-1.5 py-0.5 text-[11px] mono text-amber-200 w-32 focus:outline-none"
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && handleSaveSeal(e)}/>
                  <button onClick={handleSaveSeal} className="text-emerald-400 text-xs px-1">저장</button>
                  <button onClick={(e) => { e.stopPropagation(); setEditingSeal(false); setSealVal(c.sl || ''); }} className="text-slate-500 text-xs px-1">×</button>
                </div>
              ) : (
                <button onClick={(e) => { e.stopPropagation(); setEditingSeal(true); setSealVal(c.sl || ''); }} className="flex items-center gap-1 text-[11px] mono">
                  {sealError ? (
                    <>
                      <span className="text-slate-500 line-through">{slOrig}</span>
                      <span className="text-red-400 mx-0.5">→</span>
                      <span className="text-red-300 font-black">{c.sl}</span>
                    </>
                  ) : (
                    // M3.88.1: 엠티 컨이고 sl이 짧으면(<5자) 의심값으로 무시 → "엠티" 표시
                    c.sl && (c.fe !== 'E' || c.sl.length >= 5) ? (
                      <span className="text-amber-200 font-bold">{c.sl}</span>
                    ) : c.fe === 'E' ? (
                      <span className="text-slate-300">📦 엠티{c.sl && c.sl.length < 5 ? ` (sl="${c.sl}" 무시)` : ''}</span>
                    ) : (
                      <span className="text-slate-600 italic">미입력</span>
                    )
                  )}
                  <Edit3 className="w-3 h-3 text-slate-600"/>
                </button>
              )}
            </div>

            {/* X-RAY 봉인 */}
            {mode === 'discharge' && isXray && (
              <div className="flex items-center gap-1 mt-1 flex-wrap">
                <span className="text-[10px] text-purple-400">XRAY:</span>
                {editingXSeal ? (
                  <div onClick={e => e.stopPropagation()} className="flex items-center gap-1 flex-wrap">
                    <input type="text" value={xSealVal}
                      onChange={e => setXSealVal(e.target.value.toUpperCase())}
                      placeholder="세관"
                      className="bg-slate-800 border border-purple-600 rounded px-1.5 py-0.5 text-[11px] mono text-purple-200 w-20 focus:outline-none"
                      autoFocus/>
                    <input type="text" value={xEsealVal}
                      onChange={e => setXEsealVal(e.target.value.toUpperCase())}
                      placeholder="전자"
                      className="bg-slate-800 border border-purple-600 rounded px-1.5 py-0.5 text-[11px] mono text-purple-200 w-20 focus:outline-none"
                      onKeyDown={e => e.key === 'Enter' && handleSaveXSeal(e)}/>
                    <button onClick={handleSaveXSeal} className="text-emerald-400 text-xs px-1">저장</button>
                    <button onClick={(e) => { e.stopPropagation(); setEditingXSeal(false); setXSealVal(xraySeal?.seal || ''); setXEsealVal(xraySeal?.eseal || ''); }} className="text-slate-500 text-xs px-1">×</button>
                  </div>
                ) : (
                  <button onClick={(e) => { e.stopPropagation(); setEditingXSeal(true); setXSealVal(xraySeal?.seal || ''); setXEsealVal(xraySeal?.eseal || ''); }} className="flex items-center gap-1 text-[11px] mono">
                    {xSealError ? (
                      <>
                        <span className="text-slate-500 line-through">{xSealOrig}</span>
                        <span className="text-red-400 mx-0.5">→</span>
                        <span className="text-red-300 font-black">{xSeal}</span>
                      </>
                    ) : (
                      <span className={xSeal ? 'text-purple-200 font-bold' : 'text-slate-600 italic'}>
                        {xSeal || '미입력'}
                        {xraySeal?.eseal && <span className="text-cyan-300"> / {xraySeal.eseal}</span>}
                      </span>
                    )}
                    <Edit3 className="w-3 h-3 text-slate-600"/>
                  </button>
                )}
              </div>
            )}
          </div>

          {mode === 'discharge' && (
            <button onClick={handleToggleXray}
              className={`flex-shrink-0 px-2 py-1 rounded text-[10px] font-black ${
                isXray ? 'bg-purple-700 text-purple-100' : 'bg-slate-800 text-slate-500 hover:bg-slate-700'
              }`}>
              🔍
            </button>
          )}
        </div>
      </div>

      {/* M3.74: confirm() → ConfirmModal */}
      <ConfirmModal {...confirmState} />
    </div>
  );
}
