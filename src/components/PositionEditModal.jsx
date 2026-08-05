// M3.87: 컨테이너 위치 변경 모달 (선적 모드 전용)
//   - bay/row/tier 직접 입력 + 충돌 검사 + 풀/엠티 차별 확인
//   - 빈 입력 = 미배정 (선적대상으로 분류)
import React, { useState, useEffect, useMemo } from 'react';
import { X, AlertTriangle, MapPin } from 'lucide-react';
import { bayParityError } from '../utils.js';   // V9.27: 물리 불가 좌표 차단
import { gradeSwap, confirmTextOf, GRADE_STYLE } from '../swapGrade.js';   // V9.53: 바꿔도 되는지 등급(판정 한 벌)

export default function PositionEditModal({
  open,
  container,
  allContainers = [],
  onClose,
  onSave,  // async (newBay, newRow, newTier) => { ok, displaced, displacedWasCompleted }
  // V8.70: 트윈은 도착지(배정 자리) 기준 — 짝꿍 베이에 같은 row·tier 자리가 플랜에 실재할 때만
  //   "트윈 지정" 토글이 나타나고, 뒤 컨은 검수사가 직접 입력·선택한다 (출발지 기준 자동 추측 폐지).
  bayPairs = null,           // { '21': '23', ... } — 짝꿍 베이 매핑
  onSavePartner = null,      // async (cn, bay, row, tier) => { ok }
  onCompleteBoth = null,     // async (cns[]) => void — 배정 후 선적확인
  workBay = null,            // V7.94-20: 현재 작업 중인 베이 — 미배정 컨 재배정 시 자동 선택 (전체 베이 재선택 불필요)
  workTier = null,           // V7.94-24: 작업 중인 단 — 'hold' | 'deck'. 있으면 그 단의 빈자리만 표시 (홀드 작업 중엔 홀드 자리만)
}) {
  const [bay, setBay] = useState('');
  const [row, setRow] = useState('');
  const [tier, setTier] = useState('');
  const [step, setStep] = useState('input');  // 'input' | 'confirm' | 'saving'
  const [errMsg, setErrMsg] = useState('');
  const [manualOpen, setManualOpen] = useState(false);   // 직접 입력 접기 (기본: 슬롯 선택)
  const [twinOn, setTwinOn] = useState(false);           // V8.70: 검수사가 켜는 "트윈 지정"
  const [partnerQuery, setPartnerQuery] = useState('');  // V8.70: 뒤(짝꿍) 컨 검색어
  const [partnerPick, setPartnerPick] = useState(null);  // V8.70: 뒤(짝꿍) 컨 선택
  const [alsoComplete, setAlsoComplete] = useState(true);// 배정 후 바로 선적확인

  useEffect(() => {
    if (open && container) {
      setBay(container.bay || '');
      setRow(container.row || '');
      setTier(container.tier || '');
      setStep('input');
      setErrMsg('');
      setManualOpen(false);
      setTwinOn(false); setPartnerQuery(''); setPartnerPick(null);
      setAlsoComplete(true);
      setPickedSlotCn(null);
      // V7.94-20: 미배정 컨(위치 없음)인데 현재 작업 베이가 있으면 그 베이 자동 선택 — 전체 베이 재선택 단계 생략
      const wb = container.bay ? null : (workBay != null ? String(parseInt(workBay, 10)) : null);
      setPickBay(wb);
    }
  }, [open, container]);

  // V7.94-11: 베이 먼저 선택 → 그 베이 자리만 표시 (전체 노출은 오선적 유발 — 사용자 지적)
  //   완료된 자리도 보여주되 선택 불가(비활성) — 베이 전체 그림 파악용
  const is20 = (c) => String(c?.tp || '').startsWith('20') || String(c?.iso || '')[0] === '2';
  const [pickBay, setPickBay] = useState(null);
  const allSlots = useMemo(() => {
    if (!open || !container) return [];
    const targetIs20 = is20(container);
    // V7.94-24: 작업 단(workTier)이 지정되면 그 단(홀드 tier<80 / 데크 tier>=80)의 자리만 — 홀드 작업 중엔 홀드 빈자리만 보이게
    const tierMatch = (t) => {
      if (!workTier) return true;
      const ti = parseInt(t, 10);
      return workTier === 'hold' ? ti < 80 : ti >= 80;
    };
    return allContainers
      .filter(c => c && c._mode === container._mode && c._ptk !== false &&
        c.bay && c.row && c.tier &&
        c.cn !== container.cn &&
        is20(c) === targetIs20 && tierMatch(c.tier))
      .map(c => ({ bay: String(parseInt(c.bay, 10)), row: c.row, tier: c.tier, cn: c.cn, done: !!c._comp }))
      .sort((a, b) => (parseInt(a.bay, 10) - parseInt(b.bay, 10)) ||
        (parseInt(a.tier, 10) - parseInt(b.tier, 10)) || (parseInt(a.row, 10) - parseInt(b.row, 10)));
  }, [open, container, allContainers, workTier]);
  const slotsByBay = useMemo(() => {
    const m = {};
    allSlots.forEach(s => { (m[s.bay] = m[s.bay] || []).push(s); });
    return m;
  }, [allSlots]);
  const remainingSlots = useMemo(() => allSlots.filter(s => !s.done), [allSlots]);

  // 슬롯 탭: 위치 세팅 + 트윈이면 짝꿍 자리 자동 계산 → 바로 확인 단계
  const [pickedSlotCn, setPickedSlotCn] = useState(null);   // 선택 자리의 원래 계획 컨 (POD 구역 판정용)
  const pickSlot = (s) => {
    setBay(s.bay); setRow(s.row); setTier(s.tier);
    setPickedSlotCn(s.cn || null);
    // V8.70: 짝꿍 자동 배치 제거 — 트윈은 확인 단계에서 검수사가 "트윈 지정"으로만 켠다.
    setTwinOn(false); setPartnerQuery(''); setPartnerPick(null);
    setErrMsg('');
    setStep('confirm');
  };

  // V8.70: 도착지 기준 짝꿍 자리 — 배정 자리의 짝꿍 베이에 같은 row·tier 자리가 플랜에 실재하는지.
  //   실재하지 않으면(싱글 자리) 트윈 지정 자체가 불가 — 유령 자리 원천 차단.
  const pairSlot = useMemo(() => {
    if (!open || !container || !bay || !row || !tier || !bayPairs) return null;
    const pBay = bayPairs[String(parseInt(bay, 10))];
    if (!pBay) return null;
    const rowPad = String(row).padStart(2, '0');
    const tierPad = String(tier).padStart(2, '0');
    const slotCon = allContainers.find(x => x && (x._mode === container._mode) && x.bay &&
      String(parseInt(x.bay, 10)) === String(parseInt(pBay, 10)) && x.row === rowPad && x.tier === tierPad);
    return slotCon ? { bay: String(parseInt(pBay, 10)), row: rowPad, tier: tierPad, slotCn: slotCon.cn, slotDone: !!slotCon._comp } : null;
  }, [open, container, bay, row, tier, bayPairs, allContainers]);

  // V8.70: 뒤(짝꿍) 컨 후보 — 선박 전체 미완료에서 검색, 다른 베이 계획분은 경고 배지.
  const partnerMatches = useMemo(() => {
    const q = partnerQuery.replace(/\s/g, '').toUpperCase();
    if (q.length < 3 || !container) return [];
    // V8.71: 완료 기록 컨도 후보 포함(뒤 정렬 + ⚠배지) — 오선적 기록 교정 경로.
    return allContainers.filter(x => x && x._mode === container._mode &&
      x.cn !== container.cn &&
      (x.cn.includes(q) || (x.l4 || x.cn.slice(-4)).includes(q)))
      .sort((a, b) => (!!a._comp) - (!!b._comp)).slice(0, 6);
  }, [partnerQuery, allContainers, container]);

  // 충돌 검사: 같은 자리에 있는 다른 컨
  const conflict = useMemo(() => {
    if (!bay || !row || !tier) return null;
    const bayInt = String(parseInt(bay, 10));
    const rowPad = String(row).padStart(2, '0');
    const tierPad = String(tier).padStart(2, '0');
    return allContainers.find(c => {
      if (!c || c.cn === container?.cn) return false;
      const cBay = c.bay ? String(parseInt(c.bay, 10)) : '';
      return cBay === bayInt && c.row === rowPad && c.tier === tierPad;
    }) || null;
  }, [bay, row, tier, allContainers, container]);

  // V7.94-10: 경고 — ① 다른 베이에서 옮겨오는 컨 ② EDI 계획상 그 자리 목적지(POD) 구역 이탈
  const findByCn = (cn) => cn ? allContainers.find(x => x?.cn === cn) : null;
  const findAtPos = (b, r, t) => allContainers.find(x => x && x.cn !== container?.cn && x.bay &&
    String(parseInt(x.bay, 10)) === String(parseInt(b, 10)) && x.row === String(r).padStart(2, '0') && x.tier === String(t).padStart(2, '0'));
  const bayWarn = useMemo(() => {
    if ((!bay && !row && !tier) || !container?.bay || !bay) return false;
    return String(parseInt(container.bay, 10)) !== String(parseInt(bay, 10));
  }, [container, bay, row, tier]);
  const podWarn = useMemo(() => {
    if ((!bay && !row && !tier) || !container?.pod) return null;
    const slotCon = findByCn(pickedSlotCn) || (bay && row && tier ? findAtPos(bay, row, tier) : null) || conflict;
    if (slotCon?.pod && slotCon.pod !== container.pod) return { zonePod: slotCon.pod, myPod: container.pod };
    return null;
  }, [pickedSlotCn, bay, row, tier, conflict, container, allContainers]);
  const partnerPodWarn = useMemo(() => {
    if (!twinOn || !partnerPick?.pod || !pairSlot) return null;
    const slotCon = findAtPos(pairSlot.bay, pairSlot.row, pairSlot.tier);
    if (slotCon && slotCon.cn !== partnerPick.cn && slotCon.pod && slotCon.pod !== partnerPick.pod)
      return { zonePod: slotCon.pod, myPod: partnerPick.pod };
    return null;
  }, [twinOn, partnerPick, pairSlot, allContainers]);


  // V9.53: 이 자리에 있던 컨과 비교해 **얼마나 세게 물어볼지**. 판정은 swapGrade.js 한 벌.
  //   엠티+같은포트=통과 · 풀+같은베이=간단 · 다른베이/다른포트/특수컨=강한 확인.
  const swapG = useMemo(() => {
    if (!container || !bay || !row || !tier) return null;
    const slotCon = findByCn(pickedSlotCn) || findAtPos(bay, row, tier) || conflict;
    if (!slotCon || slotCon.cn === container.cn) return null;
    return gradeSwap(container, slotCon, bayPairs || {});
  }, [container, bay, row, tier, pickedSlotCn, conflict, allContainers, bayPairs]);

  if (!open || !container) return null;

  const isFull = container.fe === 'F';
  const isCompleted = !!container._comp;
  const isUnassign = !bay && !row && !tier;

  const validate = () => {
    if (isUnassign) return '';
    const bn = parseInt(bay, 10);
    if (!Number.isFinite(bn) || bn < 1 || bn > 999) return 'Bay는 1~999 숫자';
    if (!/^\d{1,2}$/.test(row)) return 'Row는 1~2자리 숫자';
    if (!/^\d{1,2}$/.test(tier)) return 'Tier는 1~2자리 숫자';
    return '';
  };

  const handleNext = () => {
    const err = validate();
    if (err) { setErrMsg(err); return; }
    setErrMsg('');
    setStep('confirm');
  };

  const handleConfirm = async () => {
    // V8.70: 트윈 지정을 켰으면 뒤 컨을 고르기 전엔 확정 불가.
    if (twinOn && !partnerPick) { setErrMsg('트윈 지정: 뒤(짝꿍) 컨테이너를 선택하세요'); return; }
    // V9.27: 물리 불가 좌표 원천 차단 — 40/45ft를 홀수 베이에 (경고 아닌 차단)
    const _pe = bayParityError(container, bay);
    if (_pe) { setErrMsg('⛔ ' + _pe.replace(/\n/g, ' ')); setStep('input'); return; }
    // V9.53: 강한 등급(다른 베이 풀 · 다른 포트 · 특수컨)이면 한 번 더 묻는다.
    {
      const slotCon = findByCn(pickedSlotCn) || findAtPos(bay, row, tier) || conflict;
      const t0 = confirmTextOf(swapG, container, slotCon);
      if (t0 && !confirm(t0)) { setStep('input'); return; }
    }
    setStep('saving');
    try {
      const r = row ? String(row).padStart(2, '0') : '';
      const t = tier ? String(tier).padStart(2, '0') : '';
      const result = await onSave(bay, r, t);
      if (!result?.ok) { setErrMsg('저장 실패'); setStep('input'); return; }
      // V8.70: 밀려난 컨이 이미 선적확인된 컨이면 완료는 유지됨 — 검수사에게 알림만.
      if (result.displacedWasCompleted) {
        alert(`⚠ ${result.displaced}는 이미 선적확인된 컨입니다.\n완료는 유지한 채 자리만 ${result.swappedTo ? `${parseInt(result.swappedTo.bay, 10) || '-'}-${result.swappedTo.row}-${result.swappedTo.tier}` : '미배정'}(으)로 이동했습니다.\n오선적이었다면 그 번호로 검색해 취소·수정하세요.`);
      }
      // V8.70: 트윈 지정 — 검수사가 고른 뒤 컨을 짝꿍 자리(실재 검증됨)로 배정.
      if (twinOn && partnerPick && pairSlot && onSavePartner) {
        const r2 = await onSavePartner(partnerPick.cn, pairSlot.bay, pairSlot.row, pairSlot.tier);
        if (r2?.displacedWasCompleted) {
          alert(`⚠ ${r2.displaced}는 이미 선적확인된 컨입니다.\n완료는 유지한 채 자리만 이동했습니다. 오선적이었다면 검색해 취소·수정하세요.`);
        }
      }
      if (alsoComplete && !isUnassign && !isCompleted && onCompleteBoth) {
        const cns = [container.cn];
        if (twinOn && partnerPick) cns.push(partnerPick.cn);
        await onCompleteBoth(cns);
      }
      onClose();
    } catch (e) {
      setErrMsg(e?.message || String(e));
      setStep('input');
    }
  };

  const oldPosLabel = container.bay
    ? `${String(parseInt(container.bay, 10)).padStart(2, '0')}-${container.row}-${container.tier}`
    : '미배정';
  const newPosLabel = isUnassign
    ? '미배정 (선적대상)'
    : `${String(parseInt(bay, 10) || 0).padStart(2, '0')}-${String(row).padStart(2,'0')}-${String(tier).padStart(2,'0')}`;

  const borderClr = step === 'confirm' && isFull ? 'border-rose-600' : 'border-amber-700';
  const headTxtClr = step === 'confirm' && isFull ? 'text-rose-300' : 'text-amber-300';

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3" onClick={onClose}>
      <div className={`bg-slate-900 border-2 ${borderClr} rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <MapPin className={`w-5 h-5 ${headTxtClr}`}/>
            <h2 className={`text-lg font-black ${headTxtClr}`}>위치 수정</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200"><X className="w-5 h-5"/></button>
        </div>

        <div className="p-4 border-b border-slate-800">
          <div className="text-2xl font-black mono text-amber-300">{container.l4 || container.cn?.slice(-4)}</div>
          <div className="text-base font-bold mono text-slate-200 mb-2">{container.cn}</div>
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <span className={`px-2 py-1 rounded font-black ${isFull ? 'bg-rose-700 text-rose-50' : 'bg-slate-700 text-slate-300'}`}>
              {isFull ? '풀 (F)' : container.fe === 'E' ? '엠티 (E)' : '미정'}
            </span>
            {container.iso && <span className="bg-slate-800 text-slate-300 px-2 py-1 rounded mono">{container.iso}</span>}
            {isCompleted && <span className="bg-emerald-700 text-emerald-50 px-2 py-1 rounded font-black">✓ 선적 완료</span>}
          </div>
          <div className="mt-2 text-sm text-slate-400">
            현재 위치: <span className="text-amber-300 mono font-bold">{oldPosLabel}</span>
          </div>
        </div>

        {step === 'input' && (
          <div className="p-4 space-y-3">
            {/* V7.94-09: 남은 자리 선택 (기본) — 탭 한 번으로 배정 */}
            {remainingSlots.length > 0 && !pickBay && (
              <div className="space-y-2">
                <div className="text-xs text-amber-300 font-bold">
                  📍 선적할 베이를 먼저 선택하세요
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {Object.keys(slotsByBay).sort((a, b) => parseInt(a, 10) - parseInt(b, 10)).map(b => {
                    const remain = slotsByBay[b].filter(s => !s.done).length;
                    return (
                      <button key={b} onClick={() => remain > 0 && setPickBay(b)} disabled={remain === 0}
                        className={`py-2.5 rounded-lg border font-black ${remain > 0 ? 'bg-slate-800 hover:bg-amber-800 border-slate-600 hover:border-amber-500 text-slate-100' : 'bg-slate-900 border-slate-800 text-slate-600'}`}>
                        <div className="mono text-base">B{b}</div>
                        <div className="text-[10px] font-bold text-slate-400">남은 {remain}자리</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {pickBay && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-amber-300 font-bold">📍 BAY {pickBay} — 자리 선택 (✓회색=선적 완료, 선택 불가)</div>
                  <button onClick={() => setPickBay(null)} className="text-[11px] text-slate-400 px-2 py-1 border border-slate-700 rounded">← 베이 다시 선택</button>
                </div>
                <div className="max-h-56 overflow-y-auto pr-1">
                  <div className="flex flex-wrap gap-1.5">
                    {(slotsByBay[pickBay] || []).map(s => s.done ? (
                      <span key={`${s.bay}-${s.row}-${s.tier}`}
                        className="px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-800 mono text-sm font-bold text-slate-600 cursor-not-allowed">
                        ✓{s.row}-{s.tier}
                      </span>
                    ) : (
                      <button key={`${s.bay}-${s.row}-${s.tier}`} onClick={() => pickSlot(s)}
                        className="px-2.5 py-2 rounded-lg bg-slate-800 hover:bg-amber-800 border border-slate-600 hover:border-amber-500 mono text-sm font-bold text-slate-100">
                        {s.row}-{s.tier}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <button onClick={() => setManualOpen(v => !v)}
              className="w-full py-1.5 text-[11px] text-slate-400 hover:text-slate-200 border border-dashed border-slate-700 rounded">
              {manualOpen ? '▲ 직접 입력 닫기' : '▼ 직접 입력 / 미배정 처리'}
            </button>
            {manualOpen && (<>
            <div className="text-xs text-slate-400">새 위치 (Bay-Row-Tier). 모두 비우면 미배정 처리(선적대상).</div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-slate-500 font-bold">BAY</label>
                <input type="text" inputMode="numeric" value={bay}
                  onChange={e => setBay(e.target.value.replace(/[^\d]/g, '').slice(0, 3))}
                  placeholder="14"
                  className="w-full px-3 py-3 bg-slate-800 border border-slate-700 rounded text-2xl font-black mono text-amber-200 text-center"/>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 font-bold">ROW</label>
                <input type="text" inputMode="numeric" value={row}
                  onChange={e => setRow(e.target.value.replace(/[^\d]/g, '').slice(0, 2))}
                  placeholder="00"
                  className="w-full px-3 py-3 bg-slate-800 border border-slate-700 rounded text-2xl font-black mono text-amber-200 text-center"/>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 font-bold">TIER</label>
                <input type="text" inputMode="numeric" value={tier}
                  onChange={e => setTier(e.target.value.replace(/[^\d]/g, '').slice(0, 2))}
                  placeholder="02"
                  className="w-full px-3 py-3 bg-slate-800 border border-slate-700 rounded text-2xl font-black mono text-amber-200 text-center"/>
              </div>
            </div>
            {conflict && (
              <div className="bg-orange-950/40 border-2 border-orange-700 rounded-lg p-3">
                <div className="text-orange-300 font-black text-sm flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4"/>이미 배정된 자리
                </div>
                <div className="mt-1 text-xs text-orange-200">
                  <span className="mono font-black">{conflict.cn}</span> ({conflict.fe === 'F' ? '풀' : '엠티'})이 거기 있습니다.
                </div>
                <div className="mt-1 text-[10px] text-orange-300">
                  → 확인 시 그 컨은 미배정 처리(선적대상으로 분류)됨
                </div>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <button onClick={onClose}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded">
                취소
              </button>
              <button onClick={handleNext}
                className="flex-1 py-3 bg-amber-700 hover:bg-amber-600 text-amber-50 font-black rounded">
                다음 →
              </button>
            </div>
            </>)}
            {errMsg && <div className="text-red-400 text-sm font-bold">{errMsg}</div>}
            {remainingSlots.length === 0 && !manualOpen && (
              <div className="text-xs text-slate-500 text-center py-2">남은 자리가 없습니다 — 직접 입력을 사용하세요.</div>
            )}
          </div>
        )}

        {step === 'confirm' && (
          <div className="p-4 space-y-3">
            {isFull ? (
              <div className="bg-rose-950 border-4 border-rose-600 rounded-lg p-4 animate-pulse">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-6 h-6 text-rose-300"/>
                  <div className="text-rose-200 font-black text-lg">풀 컨테이너 위치 변경</div>
                </div>
                <div className="text-rose-100 text-sm">
                  풀 컨테이너입니다. 변경 시 화물 처리에 영향이 있을 수 있습니다.
                </div>
                <div className="text-rose-200 font-black mt-2">정말 변경하시겠습니까?</div>
              </div>
            ) : (
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
                <div className="text-slate-200 text-sm">
                  {isCompleted ? '이미 선적 완료된 컨테이너입니다. 위치를 변경하시겠습니까?' : '위치를 변경하시겠습니까?'}
                </div>
              </div>
            )}

            {/* V9.53: 등급 안내 — 엠티·같은포트는 초록(그냥 진행), 특수컨·다른베이는 빨강 */}
            {swapG && (
              <div className={`rounded-lg border-2 p-3 ${GRADE_STYLE[swapG.level].box}`}>
                <div className={`font-black text-sm ${GRADE_STYLE[swapG.level].text}`}>
                  {GRADE_STYLE[swapG.level].icon} {swapG.reason}
                </div>
                {swapG.level === 'strong' && (
                  <div className="mt-1 text-[11px] text-rose-200/90">확정 전에 한 번 더 확인합니다.</div>
                )}
              </div>
            )}
            {bayWarn && swapG?.level !== 'ok' && (
              <div className="bg-amber-950/60 border-2 border-amber-600 rounded-lg p-3">
                <div className="text-amber-300 font-black text-sm flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4"/>다른 베이에서 오는 컨테이너
                </div>
                <div className="mt-1 text-xs text-amber-200">
                  계획 베이 <span className="mono font-black">{String(parseInt(container.bay, 10))}</span> → 선적 베이 <span className="mono font-black">{String(parseInt(bay, 10))}</span> — 베이를 건너 이동합니다. 맞는지 확인하세요.
                </div>
              </div>
            )}
            {podWarn && (
              <div className="bg-rose-950/70 border-2 border-rose-600 rounded-lg p-3 animate-pulse">
                <div className="text-rose-300 font-black text-sm flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4"/>목적지 구역 이탈!
                </div>
                <div className="mt-1 text-xs text-rose-200">
                  이 자리는 EDI 계획상 <span className="mono font-black">{podWarn.zonePod}</span> 구역인데,
                  이 컨테이너의 목적지는 <span className="mono font-black">{podWarn.myPod}</span>입니다.
                </div>
              </div>
            )}
            {partnerPodWarn && (
              <div className="bg-rose-950/70 border-2 border-rose-600 rounded-lg p-3">
                <div className="text-rose-300 font-black text-sm flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4"/>트윈 짝꿍 — 목적지 구역 이탈
                </div>
                <div className="mt-1 text-xs text-rose-200">
                  짝꿍 자리는 <span className="mono font-black">{partnerPodWarn.zonePod}</span> 구역, 짝꿍 컨 목적지는 <span className="mono font-black">{partnerPodWarn.myPod}</span>.
                </div>
              </div>
            )}
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2">
              <div className="text-xs text-slate-400">변경 내용</div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-slate-500 mono">{oldPosLabel}</span>
                <span className="text-amber-400 text-xl">→</span>
                <span className={`mono font-black text-lg ${isUnassign ? 'text-orange-300' : 'text-emerald-300'}`}>{newPosLabel}</span>
              </div>
              {/* V8.70: 트윈 지정 — 짝꿍 자리가 플랜에 실재할 때만 노출. 뒤 컨은 검수사가 직접 선택. */}
              {!isUnassign && !isCompleted && pairSlot && onSavePartner && (
                <div className="border-t border-slate-800 pt-2 space-y-1.5">
                  <button onClick={() => { setTwinOn(v => !v); setPartnerQuery(''); setPartnerPick(null); setErrMsg(''); }}
                    className={`w-full flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-bold ${twinOn ? 'bg-cyan-950 border-cyan-700 text-cyan-300' : 'bg-slate-900 border-slate-700 text-slate-500'}`}>
                    <span className={`w-3.5 h-3.5 rounded ${twinOn ? 'bg-cyan-400' : 'bg-slate-600'}`}/>
                    트윈 지정 — 뒤 컨을 짝꿍 자리 {pairSlot.bay}-{pairSlot.row}-{pairSlot.tier}에 함께 배정 — {twinOn ? '켬' : '끔'}
                  </button>
                  {twinOn && pairSlot.slotDone && (
                    <div className="text-[11px] text-orange-300">⚠ 짝꿍 자리는 이미 선적확인된 자리입니다. 확정 시 그 컨 처리를 확인하세요.</div>
                  )}
                  {twinOn && (partnerPick ? (
                    <div className="flex items-center justify-between bg-cyan-950/50 border border-cyan-700 rounded px-2 py-2">
                      <div>
                        <div className="mono text-sm font-bold text-cyan-200">{partnerPick.cn}</div>
                        <div className="text-[10px] mono text-slate-400">
                          계획 {partnerPick.bay ? `${parseInt(partnerPick.bay, 10)}-${partnerPick.row}-${partnerPick.tier}` : '미배정'} · {partnerPick.pod || '-'}
                          {partnerPick.bay && String(parseInt(partnerPick.bay, 10)) !== pairSlot.bay &&
                            <span className="ml-1 px-1 rounded bg-amber-800 text-amber-200 font-bold">⚠ 다른 베이</span>}
                        </div>
                      </div>
                      <button onClick={() => setPartnerPick(null)} className="text-[11px] text-slate-400 px-1.5">✕</button>
                    </div>
                  ) : (
                    <>
                      <input autoFocus value={partnerQuery} onChange={e => setPartnerQuery(e.target.value)}
                        placeholder="뒤(짝꿍) 컨 끝 4자리 이상" inputMode="numeric" autoComplete="off"
                        className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-2 text-sm mono text-slate-100"/>
                      {partnerMatches.map(x => (
                        <button key={x.cn} onClick={() => {
                            if (x._comp && !confirm(`${x.cn?.slice(-4)}는 이미 선적확인으로 기록된 컨입니다.\n실물이 눈앞에 있다면 앞선 기록이 오선적일 수 있습니다. 계속할까요?`)) return;
                            setPartnerPick(x);
                          }}
                          className="w-full flex justify-between items-center bg-slate-800 hover:bg-cyan-900 rounded px-2 py-1.5 text-xs">
                          <span className="mono font-bold text-slate-100">{x.cn}</span>
                          <span className="mono text-slate-400">
                            {x._comp && <span className="mr-1 px-1 rounded bg-rose-800 text-rose-200 font-bold">⚠ 완료기록</span>}
                            {x.bay ? `${parseInt(x.bay, 10)}-${x.row}-${x.tier}` : '미배정'} · {x.pod || '-'}
                          </span>
                        </button>
                      ))}
                      {partnerQuery.length >= 3 && partnerMatches.length === 0 &&
                        <div className="text-[11px] text-slate-500 text-center">일치하는 컨이 없습니다.</div>}
                    </>
                  ))}
                </div>
              )}
              {!isUnassign && !isCompleted && onCompleteBoth && (
                <button onClick={() => setAlsoComplete(v => !v)}
                  className={`w-full flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-bold ${alsoComplete ? 'bg-emerald-950 border-emerald-700 text-emerald-300' : 'bg-slate-900 border-slate-700 text-slate-500'}`}>
                  <span className={`w-3.5 h-3.5 rounded ${alsoComplete ? 'bg-emerald-400' : 'bg-slate-600'}`}/>
                  배정 후 바로 선적확인 {twinOn && partnerPick ? '(트윈 둘 다)' : ''} — {alsoComplete ? '켬' : '끔'}
                </button>
              )}
              {conflict && (
                <div className="text-[11px] text-orange-300 mt-2">
                  ⚠ {conflict.cn} → 미배정 (선적대상으로 분류)
                </div>
              )}
            </div>

            {errMsg && <div className="text-red-400 text-sm font-bold">{errMsg}</div>}

            <div className="flex gap-2 pt-2">
              <button onClick={() => setStep('input')}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded">
                ← 돌아가기
              </button>
              <button onClick={handleConfirm}
                className={`flex-1 py-3 font-black rounded ${
                  isFull ? 'bg-rose-700 hover:bg-rose-600 text-rose-50' : 'bg-emerald-700 hover:bg-emerald-600 text-emerald-50'
                }`}>
                {isFull ? '⚠ 변경 확정' : '변경 확정'}
              </button>
            </div>
          </div>
        )}

        {step === 'saving' && (
          <div className="p-8 text-center text-slate-400">
            <div className="animate-pulse text-lg">저장 중...</div>
          </div>
        )}
      </div>
    </div>
  );
}
